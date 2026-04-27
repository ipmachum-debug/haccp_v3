import { getDb, withTransaction } from "../../db";
import { accountingSales } from "../../../drizzle/schema/schema_accounting_extended";
import { eq, and, sql } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";
import { formatLocalDate } from "../../utils/timezone";

/**
 * 제품 매출 POST — 완전 통합 (Module 2, 2026-04-14)
 *
 * 이전 구현은 회계 분개만 처리하고 재고 차감과 COGS 분개가 누락되어
 * 재무제표가 심각하게 왜곡되었음 (매출원가 0, 제품재고 과다, 순이익 과대).
 *
 * 이 리팩터에서 처리하는 6가지:
 *   A. FEFO 로 h_inventory_lots 차감 (유통기한 임박한 LOT 우선)
 *   B. h_inventory_transactions INSERT (usage 타입, reference='SALE')
 *   C. material_ledger_daily.usage_qty 증가 (제품 수불)
 *   D. 매출 분개: 차변 AR / 대변 매출 + VAT_OUTPUT
 *   E. ★ COGS 분개 신규: 차변 매출원가 / 대변 제품재고
 *      (LOT 단가 × 차감량 합계 = 실제 원가)
 *   F. accounting_sales.status = 'received'
 *
 * 안전장치:
 *   - withTransaction + FOR UPDATE (sale + lot 2중 잠금)
 *   - 멱등성: 이미 received 면 조용히 반환
 *   - 재고 음수 금지: 가용 재고 부족 시 명시적 에러
 *   - 필수 계정 사전 검증 (누락 시 HALT)
 */
export async function postProductSale(
  saleId: number,
  userId: number,
): Promise<{ alreadyProcessed: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // ── 1. 사전 조회 ────────────────────────────────────────
  const sale = await db
    .select()
    .from(accountingSales)
    .where(eq(accountingSales.id, saleId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!sale) {
    throw new Error(`매출 전표 ID ${saleId} 를 찾을 수 없습니다.`);
  }
  if (sale.status === "received") {
    return { alreadyProcessed: true };
  }
  if (sale.status === "cancelled") {
    throw new Error(`취소된 매출은 확정할 수 없습니다. (ID: ${saleId})`);
  }

  const tenantId = sale.tenantId;
  if (!tenantId) throw new Error("[보안] tenantId is required for productSalePost");

  // ── 2. 공통 값 ──────────────────────────────────────────
  const totalAmount = Number(sale.totalAmount || 0);
  const taxAmount = Number(sale.taxAmount || 0);
  const supplyAmount = Math.max(0, totalAmount - taxAmount);
  const saleQty = Number(sale.quantity || 0);
  const docId = `SALE-${saleId}`;
  const productId = (sale as any).productId as number | null;
  const materialId = (sale as any).materialId as number | null;
  const entryDate = typeof sale.transactionDate === "string"
    ? sale.transactionDate
    : formatLocalDate(sale.transactionDate as Date);

  // ── 2b. product_id/material_id 자동 해결 (레거시 호환) ──
  //   원재료/부자재/외부제품 매출 지원 (Phase 8+)
  //   우선순위: 명시된 ID → product_id(h_products_v2) 매칭 → material_id(h_materials) 매칭
  let resolvedProductId: number | null = productId;
  let resolvedMaterialId: number | null = materialId;

  if (!resolvedProductId && !resolvedMaterialId && sale.itemName) {
    try {
      const itemName = sale.itemName;
      const likePattern = `%${itemName}%`;
      // 1순위: 완제품 매칭 시도
      const matResult: any = await db.execute(sql`
        SELECT id FROM h_products_v2
        WHERE tenant_id = ${tenantId} AND is_active = 1
          AND (product_name = ${itemName} OR product_name LIKE ${likePattern})
        ORDER BY (product_name = ${itemName}) DESC, id ASC
        LIMIT 1
      `);
      const matRowsArr: any[] = (matResult as any)?.[0] || [];
      if (matRowsArr[0]?.id) {
        resolvedProductId = Number(matRowsArr[0].id);
      } else {
        // 2순위: 원재료/부자재/외부제품 매칭
        const mResult: any = await db.execute(sql`
          SELECT id FROM h_materials
          WHERE tenant_id = ${tenantId}
            AND (material_name = ${itemName} OR material_name LIKE ${likePattern})
          ORDER BY (material_name = ${itemName}) DESC, id ASC
          LIMIT 1
        `);
        const mRows: any[] = (mResult as any)?.[0] || [];
        if (mRows[0]?.id) {
          resolvedMaterialId = Number(mRows[0].id);
        }
      }
    } catch (e) {
      console.error(`[productSalePost] product_id/material_id 조회 실패 (계속):`, e);
    }
  }

  // XOR 검증: product_id 와 material_id 동시 설정 차단
  if (resolvedProductId && resolvedMaterialId) {
    throw new Error(
      `[${docId}] product_id 와 material_id 동시 설정 불가 (XOR 제약): ` +
        `product=${resolvedProductId}, material=${resolvedMaterialId}`,
    );
  }

  // 재고 차감 대상 구분 (제품 vs 원재료/부자재/외부제품)
  const isProductSale = !!resolvedProductId;
  const isMaterialSale = !!resolvedMaterialId;

  // ── 3. 필수 계정 사전 검증 ──────────────────────────────
  const receivableAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금",
  );
  const salesRevenueAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.SALES_REVENUE, "4010", "상품매출",
  );
  const cogsAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.COST_OF_GOODS, "5010", "매출원가",
  );
  // COGS 분개 대변 계정: 제품재고 vs 원재료재고 (판매 품목 타입에 따라)
  const inventoryGoodsAcc = isProductSale
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1420", "제품")
    : null;
  const inventoryRawAcc = isMaterialSale
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1310", "원재료")
    : null;
  const vatAcc = taxAmount > 0
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_OUTPUT, "2350", "부가세예수금")
    : null;

  const missing: string[] = [];
  if (receivableAcc.id === 0) missing.push("ACCOUNTS_RECEIVABLE");
  if (salesRevenueAcc.id === 0) missing.push("SALES_REVENUE");
  if (cogsAcc.id === 0) missing.push("COST_OF_GOODS");
  if (isProductSale && inventoryGoodsAcc && inventoryGoodsAcc.id === 0) missing.push("INVENTORY_GOODS");
  if (isMaterialSale && inventoryRawAcc && inventoryRawAcc.id === 0) missing.push("INVENTORY_RAW");
  if (vatAcc && vatAcc.id === 0) missing.push("VAT_OUTPUT");
  if (missing.length > 0) {
    throw new Error(
      `[${docId}] 필수 회계 계정 누락: ${missing.join(", ")}. accounting_accounts 시드 필요.`,
    );
  }

  // ── 4. 원자적 실행 ──────────────────────────────────────
  return await withTransaction(async (conn) => {
    // (0) sale 잠금 + 재검증
    const [lockRows] = await conn.execute(
      `SELECT status FROM accounting_sales WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [saleId, tenantId],
    );
    const currentStatus = (lockRows as any[])[0]?.status;
    if (currentStatus === "received") {
      return { alreadyProcessed: true };
    }
    if (currentStatus === "cancelled") {
      throw new Error(`취소된 매출은 확정할 수 없습니다. (ID: ${saleId})`);
    }

    // (A) FEFO 재고 차감 — product_id 또는 material_id 있을 때
    //     없으면 재고 차감 없이 회계 분개만 수행 (레거시 호환)
    //     COGS 는 LOT 단가가 없으니 supplyAmount 를 fallback 원가로 사용
    let totalCogs = 0; // 실제 차감된 LOT 단가 × 수량 합계
    const usedLots: Array<{ lotId: number; qty: number; unitCost: number }> = [];

    // 차감 대상 식별 (제품 vs 원재료) + FEFO 쿼리용 WHERE 절
    const lotFilterColumn = isProductSale ? "product_id" : isMaterialSale ? "material_id" : null;
    const lotFilterValue = isProductSale ? resolvedProductId : resolvedMaterialId;
    const ledgerId = resolvedProductId ?? resolvedMaterialId; // 수불부는 material_id 컬럼 공용
    const itemTypeLabel = isProductSale ? "제품" : "원재료/부자재/외부제품";

    if (lotFilterColumn && lotFilterValue && saleQty > 0) {
      // (A-1) FEFO 순으로 사용 가능 LOT 조회 + 각 LOT 잠금
      const [lotRows] = await conn.execute(
        `SELECT id, available_quantity, current_quantity, unit_price, expiry_date
         FROM h_inventory_lots
         WHERE tenant_id = ?
           AND ${lotFilterColumn} = ?
           AND status = 'available'
           AND available_quantity > 0.001
         ORDER BY
           CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
           expiry_date ASC,
           receipt_date ASC,
           id ASC
         FOR UPDATE`,
        [tenantId, lotFilterValue],
      );
      const availableLots = lotRows as any[];

      // (A-2) 가용 재고 총합 검증
      const totalAvailable = availableLots.reduce(
        (sum, lot) => sum + Number(lot.available_quantity || 0),
        0,
      );
      if (totalAvailable + 0.001 < saleQty) {
        throw new Error(
          `[${docId}] ${itemTypeLabel} #${lotFilterValue} 재고 부족: ` +
            `요청 ${saleQty}, 가용 ${totalAvailable.toFixed(3)}`,
        );
      }

      // (A-3) FEFO 차감 루프
      let remaining = saleQty;
      for (const lot of availableLots) {
        if (remaining <= 0.001) break;
        const lotAvailable = Number(lot.available_quantity || 0);
        const takeQty = Math.min(remaining, lotAvailable);
        const lotUnitCost = Number(lot.unit_price || 0);
        const lotCost = takeQty * lotUnitCost;

        // LOT 수량 감소 (GREATEST 로 음수 방어)
        await conn.execute(
          `UPDATE h_inventory_lots
           SET available_quantity = GREATEST(0, available_quantity - ?),
               current_quantity = GREATEST(0, COALESCE(current_quantity, quantity) - ?),
               status = CASE
                 WHEN GREATEST(0, available_quantity - ?) <= 0.001 THEN 'used'
                 ELSE status
               END,
               updated_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [takeQty, takeQty, takeQty, lot.id, tenantId],
        );

        // 재고 원장에 usage 기록 (양수 quantity + transaction_type='usage')
        // PR-§5.2-2 노트: 본 INSERT 는 *제품 판매* (SALE/usage) 트랜잭션이므로
        //   material_id 는 NULL 로 둔다 (h_materials.id 기반 컬럼 — 원재료 전용).
        //   본 행은 getConsumptionSummary 의 PR-I/J 필터로 이미 SELECT 제외됨.
        await conn.execute(
          `INSERT INTO h_inventory_transactions
             (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
              reference_type, source_type, source_id, unit_cost, amount, notes, created_by)
           VALUES (?, ?, 'usage', ?, ?, ?, 'SALE', 'SALE', ?, ?, ?, ?, ?)`,
          [
            tenantId, lot.id,
            takeQty,
            sale.unit || "EA",
            entryDate,
            saleId,
            lotUnitCost,
            lotCost,
            `[매출] ${docId} ${sale.itemName || ""}`,
            userId,
          ],
        );

        usedLots.push({ lotId: lot.id, qty: takeQty, unitCost: lotUnitCost });
        totalCogs += lotCost;
        remaining -= takeQty;
      }

      // (A-4) 수불부 (material_ledger_daily) 증가 — product/material 공용
      //       이 테이블은 material_id 컬럼 하나로 제품/원재료 모두 트래킹
      try {
        await conn.execute(
          `INSERT INTO material_ledger_daily
             (tenant_id, material_id, ledger_date, usage_qty, source, notes)
           VALUES (?, ?, ?, ?, 'auto_sale', ?)
           ON DUPLICATE KEY UPDATE
             usage_qty = usage_qty + VALUES(usage_qty),
             updated_at = NOW()`,
          [
            tenantId, ledgerId, entryDate,
            saleQty,
            `매출 확정 ${docId} (${itemTypeLabel})`,
          ],
        );
      } catch (mldErr) {
        console.error(`[productSalePost] material_ledger_daily 반영 실패 (계속):`, mldErr);
      }
    }

    // COGS 가 0 이면 supplyAmount 를 fallback 으로 사용 (제품 원가 미설정 케이스)
    const cogsAmount = totalCogs > 0 ? Math.round(totalCogs) : 0;

    // ★ 2026-04-22: 회계 연동 제외 플래그 (B2C 전자상거래)
    //   - 재고 차감 / LOT / 수불부 / inventory_transactions 는 위에서 모두 실행됨 (HACCP 의무)
    //   - 그러나 (B) 매출 분개 + (C) COGS 분개는 skip
    //   - 별도 플랫폼 정산 모듈에서 분기별 매출 인식
    const accountingExcluded = Number((sale as any).accountingExcluded ?? 0) === 1;

    if (!accountingExcluded) {
      // (B) 매출 분개 (Entry 1) — 차변 AR / 대변 매출 + VAT_OUTPUT
      const [salesJeResult] = await conn.execute(
        `INSERT INTO expense_journal_entries
           (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
        [
          tenantId,
          entryDate,
          `[매출] ${docId} ${sale.itemName || ""}`,
          totalAmount,
          totalAmount,
          userId,
        ],
      );
      const salesEntryId = Number((salesJeResult as any).insertId);

      let sortOrder = 0;
      // 차변: 외상매출금 (총액)
      await insertJournalLine(conn, {
        tenantId, journalEntryId: salesEntryId,
        accountId: receivableAcc.id,
        accountCode: receivableAcc.code,
        accountName: receivableAcc.name,
        debitAmount: totalAmount, creditAmount: 0,
        description: `매출: ${sale.itemName || ""} (${docId})`,
        sortOrder: sortOrder++,
        partnerId: (sale as any).partnerId || null,
      });
      // 대변: 매출 (공급가)
      await insertJournalLine(conn, {
        tenantId, journalEntryId: salesEntryId,
        accountId: salesRevenueAcc.id,
        accountCode: salesRevenueAcc.code,
        accountName: salesRevenueAcc.name,
        debitAmount: 0, creditAmount: supplyAmount,
        description: `매출: ${sale.itemName || ""} (${docId})`,
        sortOrder: sortOrder++,
      });
      // 대변: 부가세예수금 (세액 있을 때만)
      if (vatAcc && taxAmount > 0) {
        await insertJournalLine(conn, {
          tenantId, journalEntryId: salesEntryId,
          accountId: vatAcc.id,
          accountCode: vatAcc.code,
          accountName: vatAcc.name,
          debitAmount: 0, creditAmount: taxAmount,
          description: `매출 부가세: ${sale.itemName || ""} (${docId})`,
          sortOrder: sortOrder++,
        });
      }

      // (C) ★ COGS 분개 (Entry 2) — 차변 매출원가 / 대변 제품재고
      //     cogsAmount 가 0 보다 클 때만 생성 (레거시/제품 없음 케이스 graceful)
      if (cogsAmount > 0) {
        const [cogsJeResult] = await conn.execute(
          `INSERT INTO expense_journal_entries
             (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
          [
            tenantId,
            entryDate,
            `[매출원가] ${docId} ${sale.itemName || ""}`,
            cogsAmount,
            cogsAmount,
            userId,
          ],
        );
        const cogsEntryId = Number((cogsJeResult as any).insertId);

        let cogsSortOrder = 0;
        // 차변: 매출원가
        await insertJournalLine(conn, {
          tenantId, journalEntryId: cogsEntryId,
          accountId: cogsAcc.id,
          accountCode: cogsAcc.code,
          accountName: cogsAcc.name,
          debitAmount: cogsAmount, creditAmount: 0,
          description: `매출원가: ${sale.itemName || ""} (${docId})`,
          sortOrder: cogsSortOrder++,
        });
        // 대변: 제품재고(완제품 매출) vs 원재료재고(원재료/부자재/외부제품 매출)
        const creditInventoryAcc = isProductSale ? inventoryGoodsAcc! : inventoryRawAcc!;
        const creditLabel = isProductSale ? "제품재고" : "원재료재고";
        await insertJournalLine(conn, {
          tenantId, journalEntryId: cogsEntryId,
          accountId: creditInventoryAcc.id,
          accountCode: creditInventoryAcc.code,
          accountName: creditInventoryAcc.name,
          debitAmount: 0, creditAmount: cogsAmount,
          description: `${creditLabel} 감소: ${sale.itemName || ""} (${docId})`,
          sortOrder: cogsSortOrder++,
        });
      }
    } else {
      console.log(
        `[postProductSale] SALE-${saleId} accountingExcluded=1 — 분개 생성 skip ` +
        `(재고 차감만 수행, 분기별 플랫폼 정산에서 별도 인식)`,
      );
    }

    // (D) accounting_sales 상태 전환: pending → approved (승인됨)
    //   ★ 2026-04-14: 상태 머신 정상화
    //     - 이전: pending → received (단계 건너뜀)
    //     - 현재: pending → approved
    //     - "수금 완료(received)" 는 별도 markReceived 뮤테이션에서 전환
    //   FEFO 재고 차감 / COGS 분개 / 매출 분개는 승인 시점에 수행
    await conn.execute(
      `UPDATE accounting_sales
       SET status = 'approved',
           product_id = COALESCE(product_id, ?),
           material_id = COALESCE(material_id, ?),
           posted_at = NOW(),
           posted_by = ?
       WHERE id = ? AND tenant_id = ?`,
      [resolvedProductId, resolvedMaterialId, userId, saleId, tenantId],
    );

    console.log(
      `[productSalePost] 매출 #${saleId} 확정 완료 ` +
        `(타입: ${isProductSale ? "제품" : isMaterialSale ? "원재료/부자재/외부제품" : "레거시"}, ` +
        `매출: ${totalAmount}, COGS: ${cogsAmount}, LOTs: ${usedLots.length}건)`,
    );
    return { alreadyProcessed: false };
  }, `postProductSale:${saleId}`);
}
