import { findPostedEntryLines } from "./amountContract";
import { getDb, withTransaction } from "../../db/connection";
import { accountingSales } from "../../../drizzle/schema/schema_accounting_extended";
import { eq, and } from "drizzle-orm";
import { insertJournalLine } from "../../db/accounting/journalHelper";
import { todayKST } from "../../utils/timezone";

/**
 * 제품 매출 CANCEL — productSalePost 대칭 역수행 (Module 2, 2026-04-14 / 2026-10-16 대칭 재정비)
 *
 * 취소 가능: 대기(pending)·승인(approved). 화면(getAvailableActions) 도 이 두 상태에만 취소를 보인다.
 *   이전 서버는 수금 완료(received) 만 받아 화면 취소가 항상 실패했고, 받아도 수금 분개·AR 은 되돌리지 않았다.
 *   - 수금 완료: 수금을 먼저 취소해야 하므로 거부.
 *   - 제품 출고 화면에서 만든 매출(source_type='product_outbound'): 차감은 출고가 했으므로 출고 취소로 처리.
 *
 *   A. 차감됐던 LOT 복구 — 일반 판매(SALE usage) + 혼합(번들) 구성품(bundle_lots 'sales:<id>', 이전엔 미복구)
 *   B. h_inventory_transactions: SALE_CANCEL return 역거래 (원본 tx 유지, LOT 단위)
 *   C. 원재료 수불부 usage_qty 감소 (원재료 매출만)
 *   D. 원 [매출]·[매출원가] 전표가 있을 때만 그대로 뒤집음 (없던 전표를 계산 금액으로 만들지 않음)
 *   E. accounting_sales.status → 'cancelled'
 *
 * 안전장치: withTransaction + FOR UPDATE (sale + 모든 LOT), 이미 cancelled 면 멱등 반환.
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
  assertSaleCancellable(sale.status, (sale as any).sourceType);

  // ── 2. 공통 값 ──────────────────────────────────────────
  const docId = `SALE-${saleId}`;
  const cancelDate = todayKST();

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
    assertSaleCancellable(currentStatus, (sale as any).sourceType);

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
    // 혼합(번들) 구성품 차감 — bundle_lots.notes='sales:<id>' 가 정본 (2026-10-15 이전 거래에는 매출 참조가 없음)
    const [bundleRows] = await conn.execute(
      `SELECT child_lot_id AS lot_id, deducted_qty_kg AS quantity
         FROM bundle_lots WHERE tenant_id = ? AND notes = ?`,
      [tenantId, `sales:${saleId}`],
    );
    const bundleCostRows = new Map<number, number>();
    if ((bundleRows as any[]).length > 0) {
      const [bc] = await conn.execute(
        `SELECT lot_id, SUM(amount) AS amount, SUM(quantity) AS qty FROM h_inventory_transactions
          WHERE tenant_id = ? AND source_type = 'BUNDLE_OUTBOUND' AND reference_type = 'sales' AND reference_id = ?
          GROUP BY lot_id`,
        [tenantId, saleId],
      );
      for (const r of bc as any[]) bundleCostRows.set(Number(r.lot_id), Number(r.qty) > 0 ? Number(r.amount || 0) / Number(r.qty) : 0);
    }
    const usageTxs = [
      ...(usageTxRows as any[]),
      ...(bundleRows as any[]).map((r) => ({
        lot_id: r.lot_id, quantity: r.quantity,
        unit_cost: bundleCostRows.get(Number(r.lot_id)) ?? 0,
        amount: Number(r.quantity || 0) * (bundleCostRows.get(Number(r.lot_id)) ?? 0),
        bundle: true,
      })),
    ];

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
        `SELECT available_quantity, current_quantity, quantity, unit FROM h_inventory_lots
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
      // PR-§5.2-2 (part 2): material_id NULL — 제품 판매 취소(SALE_CANCEL/return). productSalePost 와 동일 정책.
      await conn.execute(
        `INSERT INTO h_inventory_transactions
           (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
            reference_type, source_type, source_id, unit_cost, amount, notes, created_by)
         VALUES (?, ?, 'return', ?, ?, ?, 'SALE_CANCEL', 'SALE_CANCEL', ?, ?, ?, ?, ?)`,
        [
          tenantId, lotId,
          restoreQty,
          lotRow.unit || sale.unit || "EA",
          cancelDate,
          saleId,
          Number(tx.unit_cost || 0),
          lotCost,
          tx.bundle ? `[매출취소] ${docId} 혼합 구성품 복원` : `[매출취소] ${docId}`,
          userId,
        ],
      );

      totalRestoredCogs += lotCost;
      totalRestoredQty += restoreQty;
    }

    // (C) 원재료 수불부 (material_ledger_daily) 역수행 — 원재료/부자재/외부제품 매출만.
    // ★ 2026-10-12 (Q5-R2 (a)): 기존에는 제품 매출(restoredProductId)만 되돌리고 원재료 매출은
    //   되돌리지 않았다 (post 와 비대칭). post 가 제품을 더 이상 쓰지 않으므로 여기도 제품은 건너뛰고,
    //   원재료 매출은 차감된 LOT 의 material_id 로 되돌린다.
    if (!restoredProductId && totalRestoredQty > 0 && usageTxs.length > 0) {
      try {
        const lotIds = usageTxs.filter((t: any) => !t.bundle).map((t) => Number(t.lot_id)).filter((n) => Number.isFinite(n) && n > 0);
        if (lotIds.length > 0) {
          const [lotRows] = await conn.execute(
            `SELECT DISTINCT material_id FROM h_inventory_lots
              WHERE tenant_id = ? AND id IN (${lotIds.map(() => "?").join(", ")}) AND material_id IS NOT NULL`,
            [tenantId, ...lotIds],
          );
          const materialIds = (lotRows as any[]).map((r) => Number(r.material_id));
          if (materialIds.length === 1) {
            await conn.execute(
              `UPDATE material_ledger_daily
               SET usage_qty = GREATEST(0, usage_qty - ?),
                   notes = CONCAT(COALESCE(notes, ''), ?),
                   updated_at = NOW()
               WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
              [totalRestoredQty, ` [${docId} 취소]`, tenantId, materialIds[0], sale.transactionDate],
            );
          } else if (materialIds.length > 1) {
            console.warn(`[productSaleCancel] 매출 ${docId} 의 LOT 가 자재 ${materialIds.length}종에 걸쳐 수불부 역수행 생략`);
          }
        }
      } catch (mldErr) {
        console.error(`[productSaleCancel] material_ledger_daily 역수행 실패:`, mldErr);
      }
    }

    // (D) 원 [매출]·[매출원가] 전표 역분개 — 있을 때만
    await reverseSaleJournals(conn, { tenantId, saleId, itemName: sale.itemName, cancelDate, userId });

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

/**
 * 매출 취소 가능 상태 (2026-10-16): 대기·승인. 수금 완료는 수금부터, 제품 출고로 만든 매출은 출고 취소로.
 */
function assertSaleCancellable(status: string | null | undefined, sourceType: string | null | undefined): void {
  if (status === "received") throw new Error("수금 완료된 매출은 수금을 먼저 취소해야 합니다.");
  if (sourceType === "product_outbound") {
    throw new Error("제품 출고 화면에서 만든 매출입니다. 제품 출고 화면에서 출고를 취소하세요 (재고·매출·분개를 함께 되돌립니다).");
  }
  if (status === "pending" || status === "approved") return;
  throw new Error(`취소할 수 없는 상태입니다: ${status}`);
}

/**
 * 원 [매출] SALE-<id> · [매출원가] SALE-<id> 전표를 계정·금액 그대로 뒤집는다 (2026-10-16).
 * 원 전표가 없으면 만들지 않는다 — 분개 없이 승인됐던 매출을 계산 금액으로 역분개하면 없던 매출이 음수로 생긴다.
 * 제품 출고 취소(cancelProductOutbound) 도 이 함수를 쓴다.
 */
export async function reverseSaleJournals(
  conn: any,
  p: { tenantId: number; saleId: number; itemName?: string | null; cancelDate: string; userId: number },
): Promise<{ sales: boolean; cogs: boolean }> {
  const docId = `SALE-${p.saleId}`;
  const done = { sales: false, cogs: false };
  for (const [marker, label, key] of [["[매출]", "[매출취소]", "sales"], ["[매출원가]", "[매출원가취소]", "cogs"]] as const) {
    const posted = await findPostedEntryLines(conn, p.tenantId, `${marker} ${docId}`);
    if (!posted || posted.lines.length === 0) continue;
    const lines = posted.lines.map((l) => ({
      accountId: l.account_id, accountCode: l.account_code, accountName: l.account_name,
      debit: Number(l.credit_amount || 0), credit: Number(l.debit_amount || 0), partnerId: l.partner_id ?? null,
    }));
    const total = Math.round(lines.reduce((a, l) => a + l.debit, 0) * 100) / 100;
    const [je] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
      [p.tenantId, p.cancelDate, `${label} ${docId} ${p.itemName || ""}`, total, total, p.userId],
    );
    const journalEntryId = Number((je as any).insertId);
    let sortOrder = 0;
    for (const l of lines) {
      await insertJournalLine(conn, {
        tenantId: p.tenantId, journalEntryId,
        accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName,
        debitAmount: l.debit, creditAmount: l.credit,
        description: `${label.slice(1, -1)}: ${p.itemName || ""} (${docId})`,
        sortOrder: sortOrder++,
        partnerId: l.partnerId,
      });
    }
    done[key] = true;
  }
  return done;
}
