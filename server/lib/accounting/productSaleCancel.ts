import { getDb, withTransaction } from "../../db";
import { accountingSales } from "../../../drizzle/schema/schema_accounting_extended";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";
import { todayKST } from "../../utils/timezone";

/**
 * 제품 매출 CANCEL — productSalePost 완전 대칭 역수행 (Module 2, 2026-04-14)
 *
 * productSalePost 가 변경한 모든 테이블을 정확히 되돌립니다:
 *   A. h_inventory_lots: 차감됐던 LOT 들의 available_quantity 복구
 *   B. h_inventory_transactions: usage 역거래 기록 (원본 tx 는 유지, 감사 추적)
 *   C. material_ledger_daily: usage_qty 감소 (GREATEST(0,...))
 *   D. 매출 역분개: 차변 매출 + VAT / 대변 AR
 *   E. COGS 역분개: 차변 제품재고 / 대변 매출원가
 *   F. accounting_sales.status → 'cancelled'
 *
 * 안전장치:
 *   - withTransaction + FOR UPDATE (sale + 모든 LOT)
 *   - 멱등성: 이미 cancelled 면 조용히 반환
 *   - 감사 추적: LOT 복구 후에도 원본 usage tx 는 유지, 대신 return 타입 역거래 추가
 *   - 계정 누락 시 HALT
 */
export async function cancelProductSale(
  saleId: number,
  userId: number,
  tenantId: number,
): Promise<{ alreadyProcessed: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // ── 1. 사전 조회 ────────────────────────────────────────
  const sale = await db
    .select()
    .from(accountingSales)
    .where(and(eq(accountingSales.id, saleId), eq(accountingSales.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!sale) {
    throw new Error(`매출 전표 ID ${saleId} 를 찾을 수 없습니다.`);
  }
  if (sale.status === "cancelled") {
    return { alreadyProcessed: true };
  }
  if (sale.status !== "received") {
    throw new Error(`확정(received)된 매출만 취소할 수 있습니다. (현재: ${sale.status})`);
  }

  // ── 2. 공통 값 ──────────────────────────────────────────
  const totalAmount = Number(sale.totalAmount || 0);
  const taxAmount = Number(sale.taxAmount || 0);
  const supplyAmount = Math.max(0, totalAmount - taxAmount);
  const docId = `SALE-${saleId}`;
  const cancelDate = todayKST();

  // ── 3. 필수 계정 사전 조회 ──────────────────────────────
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
      `[${docId}] 필수 회계 계정 누락: ${missing.join(", ")}. 시드 필요.`,
    );
  }

  // ── 4. 원자적 역수행 ────────────────────────────────────
  return await withTransaction(async (conn) => {
    // (0) sale 잠금 + 재검증
    const [lockRows] = await conn.execute(
      `SELECT status FROM accounting_sales WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [saleId, tenantId],
    );
    const currentStatus = (lockRows as any[])[0]?.status;
    if (currentStatus === "cancelled") {
      return { alreadyProcessed: true };
    }
    if (currentStatus !== "received") {
      throw new Error(`확정(received)된 매출만 취소할 수 있습니다. (현재: ${currentStatus})`);
    }

    // (A) 원본 SALE usage 거래 조회 — 각 LOT 별로 얼마나 차감됐는지 알려면 모두 필요
    const [usageTxRows] = await conn.execute(
      `SELECT id, lot_id, quantity, unit_cost, amount
       FROM h_inventory_transactions
       WHERE tenant_id = ?
         AND UPPER(reference_type) = 'SALE'
         AND source_id = ?
         AND transaction_type = 'usage'
       ORDER BY id ASC`,
      [tenantId, saleId],
    );
    const usageTxs = usageTxRows as any[];

    let totalRestoredCogs = 0;
    let totalRestoredQty = 0;
    const restoredProductId: number | null = (sale as any).productId || null;

    // (B) LOT 별로 복구
    for (const tx of usageTxs) {
      const lotId = Number(tx.lot_id);
      const restoreQty = Number(tx.quantity || 0);
      const lotCost = Number(tx.amount || 0);

      // LOT 잠금
      const [lotLockRows] = await conn.execute(
        `SELECT available_quantity, current_quantity, quantity FROM h_inventory_lots
         WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [lotId, tenantId],
      );
      const lotRow = (lotLockRows as any[])[0];
      if (!lotRow) continue;

      // LOT 수량 복구
      await conn.execute(
        `UPDATE h_inventory_lots
         SET available_quantity = available_quantity + ?,
             current_quantity = COALESCE(current_quantity, quantity) + ?,
             status = 'available',
             updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [restoreQty, restoreQty, lotId, tenantId],
      );

      // 재고 원장에 복구 기록 (return 타입, 양수 quantity, 감사 추적)
      // PR-§5.2-2 노트: 본 INSERT 는 *제품 LOT 환입* 트랜잭션이므로 material_id 는 NULL.
      //   (productSalePost 와 동일 정책 — 제품 트랜잭션은 SELECT 4단 fallback 미적용 영역)
      await conn.execute(
        `INSERT INTO h_inventory_transactions
           (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
            reference_type, source_type, source_id, unit_cost, amount, notes, created_by)
         VALUES (?, ?, 'return', ?, ?, ?, 'SALE_CANCEL', 'SALE_CANCEL', ?, ?, ?, ?, ?)`,
        [
          tenantId, lotId,
          restoreQty,
          sale.unit || "EA",
          cancelDate,
          saleId,
          Number(tx.unit_cost || 0),
          lotCost,
          `[매출취소] ${docId}`,
          userId,
        ],
      );

      totalRestoredCogs += lotCost;
      totalRestoredQty += restoreQty;
    }

    // (C) material_ledger_daily 역수행
    if (restoredProductId && totalRestoredQty > 0) {
      try {
        await conn.execute(
          `UPDATE material_ledger_daily
           SET usage_qty = GREATEST(0, usage_qty - ?),
               notes = CONCAT(COALESCE(notes, ''), ?),
               updated_at = NOW()
           WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
          [
            totalRestoredQty,
            ` [${docId} 취소]`,
            tenantId,
            restoredProductId,
            sale.transactionDate,
          ],
        );
      } catch (mldErr) {
        console.error(`[productSaleCancel] material_ledger_daily 역수행 실패:`, mldErr);
      }
    }

    // (D) 매출 역분개 (Entry 1): 차변 매출 + VAT / 대변 AR
    const [salesJeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
      [
        tenantId,
        cancelDate,
        `[매출취소] ${docId} ${sale.itemName || ""}`,
        totalAmount,
        totalAmount,
        userId,
      ],
    );
    const salesEntryId = Number((salesJeResult as any).insertId);

    let sortOrder = 0;
    // 차변: 매출 (공급가)
    await insertJournalLine(conn, {
      tenantId, journalEntryId: salesEntryId,
      accountId: salesRevenueAcc.id,
      accountCode: salesRevenueAcc.code,
      accountName: salesRevenueAcc.name,
      debitAmount: supplyAmount, creditAmount: 0,
      description: `매출 취소: ${sale.itemName || ""} (${docId})`,
      sortOrder: sortOrder++,
    });
    // 차변: 부가세예수금 (세액 있을 때만)
    if (vatAcc && taxAmount > 0) {
      await insertJournalLine(conn, {
        tenantId, journalEntryId: salesEntryId,
        accountId: vatAcc.id,
        accountCode: vatAcc.code,
        accountName: vatAcc.name,
        debitAmount: taxAmount, creditAmount: 0,
        description: `매출 취소 부가세: ${sale.itemName || ""} (${docId})`,
        sortOrder: sortOrder++,
      });
    }
    // 대변: 외상매출금 (총액)
    await insertJournalLine(conn, {
      tenantId, journalEntryId: salesEntryId,
      accountId: receivableAcc.id,
      accountCode: receivableAcc.code,
      accountName: receivableAcc.name,
      debitAmount: 0, creditAmount: totalAmount,
      description: `매출 취소: ${sale.itemName || ""} (${docId})`,
      sortOrder: sortOrder++,
      partnerId: (sale as any).partnerId || null,
    });

    // (E) COGS 역분개 (Entry 2): 차변 제품재고 / 대변 매출원가
    //     원본 COGS 엔트리를 찾아서 같은 금액으로 역수행
    const [cogsJeRows] = await conn.execute(
      `SELECT id, total_debit FROM expense_journal_entries
       WHERE tenant_id = ? AND description LIKE ?
       ORDER BY id DESC LIMIT 1`,
      [tenantId, `[매출원가] ${docId}%`],
    );
    const originalCogs = (cogsJeRows as any[])[0];
    const cogsAmount = originalCogs ? Number(originalCogs.total_debit || 0) : 0;

    if (cogsAmount > 0) {
      const [cogsReversalResult] = await conn.execute(
        `INSERT INTO expense_journal_entries
           (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
        [
          tenantId,
          cancelDate,
          `[매출원가취소] ${docId} ${sale.itemName || ""}`,
          cogsAmount,
          cogsAmount,
          userId,
        ],
      );
      const cogsReversalId = Number((cogsReversalResult as any).insertId);

      let cogsSortOrder = 0;
      // 차변: 제품재고
      await insertJournalLine(conn, {
        tenantId, journalEntryId: cogsReversalId,
        accountId: inventoryGoodsAcc.id,
        accountCode: inventoryGoodsAcc.code,
        accountName: inventoryGoodsAcc.name,
        debitAmount: cogsAmount, creditAmount: 0,
        description: `제품재고 복구: ${sale.itemName || ""} (${docId})`,
        sortOrder: cogsSortOrder++,
      });
      // 대변: 매출원가
      await insertJournalLine(conn, {
        tenantId, journalEntryId: cogsReversalId,
        accountId: cogsAcc.id,
        accountCode: cogsAcc.code,
        accountName: cogsAcc.name,
        debitAmount: 0, creditAmount: cogsAmount,
        description: `매출원가 취소: ${sale.itemName || ""} (${docId})`,
        sortOrder: cogsSortOrder++,
      });
    }

    // (F) accounting_sales 상태 전환
    await conn.execute(
      `UPDATE accounting_sales
       SET status = 'cancelled',
           canceled_at = NOW(),
           canceled_by = ?
       WHERE id = ? AND tenant_id = ?`,
      [userId, saleId, tenantId],
    );

    console.log(
      `[productSaleCancel] 매출 #${saleId} 대칭 취소 완료: ` +
        `LOT 복구 ${usageTxs.length}건 (qty=${totalRestoredQty}, cogs=${totalRestoredCogs})`,
    );
    return { alreadyProcessed: false };
  }, `cancelProductSale:${saleId}`);
}
