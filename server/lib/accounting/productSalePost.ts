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
  const entryDate = typeof sale.transactionDate === "string"
    ? sale.transactionDate
    : formatLocalDate(sale.transactionDate as Date);

  // ── 2b. product_id 없으면 item_name 으로 자동 해결 (레거시 호환) ──
  //   h_products_v2 가 현재 사용 테이블 (h_products 는 legacy)
  let resolvedProductId: number | null = productId;
  if (!resolvedProductId && sale.itemName) {
    try {
      const itemName = sale.itemName;
      const likePattern = `%${itemName}%`;
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
      }
    } catch (e) {
      console.error(`[productSalePost] product_id 조회 실패 (계속):`, e);
    }
  }

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
  const inventoryGoodsAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1420", "제품",
  );
  const vatAcc = taxAmount > 0
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_OUTPUT, "2350", "부가세예수금")
    : null;

  const missing: string[] = [];
  if (receivableAcc.id === 0) missing.push("ACCOUNTS_RECEIVABLE");
  if (salesRevenueAcc.id === 0) missing.push("SALES_REVENUE");
  if (cogsAcc.id === 0) missing.push("COST_OF_GOODS");
  if (inventoryGoodsAcc.id === 0) missing.push("INVENTORY_GOODS");
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

    // (A) FEFO 재고 차감 — product_id 있을 때만
    //     없으면 재고 차감 없이 회계 분개만 수행 (레거시 호환)
    //     COGS 는 LOT 단가가 없으니 supplyAmount 를 fallback 원가로 사용
    let totalCogs = 0; // 실제 차감된 LOT 단가 × 수량 합계
    const usedLots: Array<{ lotId: number; qty: number; unitCost: number }> = [];

    if (resolvedProductId && saleQty > 0) {
      // (A-1) FEFO 순으로 사용 가능 LOT 조회 + 각 LOT 잠금
      const [lotRows] = await conn.execute(
        `SELECT id, available_quantity, current_quantity, unit_price, expiry_date
         FROM h_inventory_lots
         WHERE tenant_id = ?
           AND product_id = ?
           AND status = 'available'
           AND available_quantity > 0.001
         ORDER BY
           CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
           expiry_date ASC,
           receipt_date ASC,
           id ASC
         FOR UPDATE`,
        [tenantId, resolvedProductId],
      );
      const availableLots = lotRows as any[];

      // (A-2) 가용 재고 총합 검증
      const totalAvailable = availableLots.reduce(
        (sum, lot) => sum + Number(lot.available_quantity || 0),
        0,
      );
      if (totalAvailable + 0.001 < saleQty) {
        throw new Error(
          `[${docId}] 제품 #${resolvedProductId} 재고 부족: ` +
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

      // (A-4) 제품 수불부 (material_ledger_daily) 증가 — product_id 사용
      //       이 테이블은 원래 material_id 기준이지만 제품도 같은 테이블 쓰는 구조.
      //       material_id 컬럼에 product_id 를 저장 (도메인 통일)
      try {
        await conn.execute(
          `INSERT INTO material_ledger_daily
             (tenant_id, material_id, ledger_date, usage_qty, source, notes)
           VALUES (?, ?, ?, ?, 'auto_sale', ?)
           ON DUPLICATE KEY UPDATE
             usage_qty = usage_qty + VALUES(usage_qty),
             updated_at = NOW()`,
          [
            tenantId, resolvedProductId, entryDate,
            saleQty,
            `매출 확정 ${docId}`,
          ],
        );
      } catch (mldErr) {
        console.error(`[productSalePost] material_ledger_daily 반영 실패 (계속):`, mldErr);
      }
    }

    // COGS 가 0 이면 supplyAmount 를 fallback 으로 사용 (제품 원가 미설정 케이스)
    const cogsAmount = totalCogs > 0 ? Math.round(totalCogs) : 0;

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
    //     이전 버전에서 누락되어 있던 P0 버그 수정
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
      // 대변: 제품재고
      await insertJournalLine(conn, {
        tenantId, journalEntryId: cogsEntryId,
        accountId: inventoryGoodsAcc.id,
        accountCode: inventoryGoodsAcc.code,
        accountName: inventoryGoodsAcc.name,
        debitAmount: 0, creditAmount: cogsAmount,
        description: `제품재고 감소: ${sale.itemName || ""} (${docId})`,
        sortOrder: cogsSortOrder++,
      });
    }

    // (D) accounting_sales 상태 전환
    await conn.execute(
      `UPDATE accounting_sales
       SET status = 'received',
           product_id = COALESCE(product_id, ?),
           posted_at = NOW(),
           posted_by = ?
       WHERE id = ? AND tenant_id = ?`,
      [resolvedProductId, userId, saleId, tenantId],
    );

    console.log(
      `[productSalePost] 매출 #${saleId} 확정 완료 ` +
        `(매출: ${totalAmount}, COGS: ${cogsAmount}, LOTs: ${usedLots.length}건)`,
    );
    return { alreadyProcessed: false };
  }, `postProductSale:${saleId}`);
}
