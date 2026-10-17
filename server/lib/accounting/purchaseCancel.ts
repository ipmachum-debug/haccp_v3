import { findPostedEntryLines } from "./amountContract";
import { getDb, withTransaction } from "../../db";
import { accountingPurchases } from "../../../drizzle/schema/schema_accounting_extended";
import { and, eq } from "drizzle-orm";
import { insertJournalLine } from "../../db/accounting/journalHelper";
import { todayKST } from "../../utils/timezone";
import { recomputeAggregateFromLots } from "../inventory/applyInventoryDelta";

/**
 * 매입 CANCEL 로직 — 등록·확정이 남긴 것을 되돌린다 (Module 1, 2026-04-14 / 2026-10-16 대칭 재정비)
 *
 * 취소 가능: 대기(pending)·승인(approved). 지급 완료(paid)는 지급부터 되돌려야 하므로 거부.
 *   1. h_inventory_lots: 이 매입의 입고 거래(등록·확정 두 규약 모두) 수량만큼 LOT 단위로 감소 (부분 소진 시 에러)
 *   2. h_inventory_transactions: usage 타입 양수 quantity 역거래 INSERT (LOT 단위)
 *   3. h_inbound_headers: status='cancelled' (DELETE 금지, 감사 추적 유지)
 *   4. material_ledger_daily: 확정됐던 매입만, LOT 재고 수량으로 receiving_qty 감소
 *   5. expense_journal_entries/lines: 원 매입 전표가 있을 때만 그대로 역분개
 *   6. accounting_purchases.status → 'cancelled'
 *
 * 원칙:
 *   - 전체를 withTransaction + FOR UPDATE 로 원자성 보장
 *   - 멱등성: 이미 cancelled 면 조용히 반환
 *   - 재고 음수 절대 금지 (LOT 부분 소진 시 명시적 에러)
 *   - 역거래 quantity 는 항상 양수 (방향은 transaction_type 으로 표현)
 *   - 모든 실패는 rollback (silent fail 패턴 제거)
 */
export async function cancelPurchase(
  purchaseId: number,
  userId: number,
  tenantId: number,
): Promise<{ alreadyProcessed: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // ── 1. 사전 조회 (빠른 실패) ────────────────────────────
  const purchase = await db
    .select()
    .from(accountingPurchases)
    .where(and(eq(accountingPurchases.id, purchaseId), eq(accountingPurchases.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows[0]);

  if (!purchase) {
    throw new Error(`매입 전표 ID ${purchaseId} 를 찾을 수 없습니다.`);
  }
  if (purchase.status === "cancelled") {
    return { alreadyProcessed: true };
  }
  assertCancellableStatus(purchase.status);

  // ── 2. 공통 값 ────────────────────────────────────────
  const docId = `PURCHASE-${purchaseId}`;
  const cancelDate = todayKST();
  const inboundNumber = `INB-PURCHASE-${purchaseId}`;
  const materialId = (purchase as any).materialId as number | null;

  // ── 4. 원자적 역수행 ───────────────────────────────────
  return await withTransaction(async (conn) => {
    // (0) 비관적 잠금 + 재검증
    const [lockRows] = await conn.execute(
      `SELECT status, posted_at FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [purchaseId, tenantId],
    );
    const locked = (lockRows as any[])[0];
    const currentStatus = locked?.status;
    if (currentStatus === "cancelled") {
      return { alreadyProcessed: true };
    }
    assertCancellableStatus(currentStatus);

    // (A) 이 매입의 입고 재고 거래 전부 — 두 생성 경로의 참조 규약 모두 (2026-10-16)
    //     등록(createPurchase) : reference_type='accounting_purchase', reference_id=매입ID
    //     확정(postPurchase)   : source_type='accounting_purchases', source_id=매입ID (reference_type 'PURCHASE')
    //     이전에는 reference_type='PURCHASE' + source_id 만 찾아 수기 등록 매입의 LOT 을 못 찾고 재고가 남았다.
    // ★ 2026-10-17 (입고 정본화, CEO 결정): 입고 줄에 연결된 전표는 **회계만** 되돌린다 — 재고는 입고 줄 취소에서 한 번만.
    //   구형 참조 규약이 우연히 맞더라도 재고를 건드리지 않게 재고 단계를 통째로 건너뛴다 (재고 이중 차감 방지).
    const [lk]: any = await conn.execute(`SELECT inbound_line_id FROM accounting_purchases WHERE id = ? AND tenant_id = ?`, [purchaseId, tenantId]);
    const inboundLinked = (lk as any[])[0]?.inbound_line_id != null;
    const [txRows] = inboundLinked ? [[]] as any : await conn.execute(
      `SELECT id, lot_id, quantity, unit, unit_cost
         FROM h_inventory_transactions
        WHERE tenant_id = ?
          AND transaction_type = 'receipt'
          AND ( (reference_type = 'accounting_purchase' AND reference_id = ?)
             OR (source_type = 'accounting_purchases' AND source_id = ?)
             OR (UPPER(reference_type) = 'PURCHASE' AND source_id = ?) )
        ORDER BY id ASC`,
      [tenantId, purchaseId, purchaseId, purchaseId],
    );
    const receipts = txRows as any[];

    // (B) LOT 별 입고 수량(LOT 단위 그대로) 만큼 되돌린다 — 매입 수량(개)이 아니라 재고 수량(kg)
    //     이전에는 purchase.quantity(예: 우유 6개) 를 5.4kg LOT 에서 뺐다.
    const ledgerByMaterial = new Map<number, number>();
    const byLot = new Map<number, { qty: number; unit: string | null; unitCost: number }>();
    for (const r of receipts) {
      const lotId = Number(r.lot_id);
      const cur = byLot.get(lotId) ?? { qty: 0, unit: r.unit ?? null, unitCost: Number(r.unit_cost || 0) };
      cur.qty += Number(r.quantity || 0);
      byLot.set(lotId, cur);
    }
    for (const [lotId, rec] of byLot) {
      const [lotLockRows] = await conn.execute(
        `SELECT available_quantity, current_quantity, quantity, unit, material_id, product_id
           FROM h_inventory_lots
          WHERE id = ? AND tenant_id = ?
          FOR UPDATE`,
        [lotId, tenantId],
      );
      const lotRow = (lotLockRows as any[])[0];
      if (!lotRow) continue;
      const cancelQty = rec.qty;
      const curAvailable = Number(lotRow.available_quantity || 0);

      // ★ 재고 음수 금지 원칙: 부분 소진 LOT 은 취소 불가
      if (curAvailable < cancelQty - 0.001) {
        throw new Error(
          `[${docId}] LOT#${lotId} 이미 일부 소비되었습니다. ` +
            `가용: ${curAvailable}, 취소 요청: ${cancelQty}${lotRow.unit ?? ""}. ` +
            `재고 조정 또는 출고 취소 후 다시 시도하세요.`,
        );
      }

      await conn.execute(
        `UPDATE h_inventory_lots
         SET available_quantity = GREATEST(0, available_quantity - ?),
             current_quantity = GREATEST(0, COALESCE(current_quantity, quantity) - ?),
             status = CASE
               WHEN available_quantity <= 0.001 THEN 'disposed'
               ELSE status
             END,
             updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        // ★ 2026-10-15: status 는 이미 줄어든 available_quantity 로 판단 (MySQL 단일 테이블 UPDATE 좌→우 평가)
        [cancelQty, cancelQty, lotId, tenantId],
      );

      // 집계(h_inventory) 자가 치유 — LOT 정본으로 재계산
      const canonMatId = lotRow.material_id != null ? Number(lotRow.material_id) : null;
      const canonProdId = lotRow.product_id != null ? Number(lotRow.product_id) : null;
      if (canonMatId || canonProdId) {
        await recomputeAggregateFromLots(conn, {
          tenantId,
          subject: canonMatId ? { materialId: canonMatId } : { productId: canonProdId },
          unit: lotRow.unit || undefined,
        });
      }
      if (canonMatId) ledgerByMaterial.set(canonMatId, (ledgerByMaterial.get(canonMatId) ?? 0) + cancelQty);

      // 재고 원장에 취소 기록 (usage 타입, 양수 quantity, LOT 단위)
      await conn.execute(
        `INSERT INTO h_inventory_transactions
           (tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date,
            reference_type, source_type, source_id, unit_cost, amount, notes, created_by)
         VALUES (?, ?, ?, 'usage', ?, ?, ?, 'PURCHASE_CANCEL', 'PURCHASE_CANCEL', ?, ?, ?, ?, ?)`,
        [
          tenantId, lotId, canonMatId ?? materialId ?? null,
          cancelQty,
          lotRow.unit || rec.unit || "EA",
          cancelDate,
          purchaseId,
          rec.unitCost.toString(),
          Math.round(cancelQty * rec.unitCost * 100) / 100,
          `[매입취소] ${docId}`,
          userId,
        ],
      );
    }

    // (C) h_inbound_headers 상태 변경 (DELETE 금지 - 감사 추적 유지)
    //   ★ 2026-10-16 (Codex #537 검토 P2): 실패를 삼키지 않는다 — 재고·분개는 되돌렸는데 입고전표만 '확정' 으로
    //   남으면 육안검사·입고 이력이 취소된 입고를 계속 보여 준다. 실패하면 전체 롤백.
    await conn.execute(
      `UPDATE h_inbound_headers
       SET status = 'cancelled',
           notes = CONCAT(COALESCE(notes, ''), ?),
           updated_at = NOW()
       WHERE tenant_id = ? AND inbound_number = ?`,
      [` [취소: ${cancelDate}]`, tenantId, inboundNumber],
    );

    // (D) material_ledger_daily 역수행 — 확정(postPurchase)이 기록한 경우에만, LOT 재고 수량으로
    //     (2026-10-16: 수불부 입고는 확정 때 LOT 수량으로 한 번 기록 — PR #533)
    const posted = await findPostedEntryLines(conn, tenantId, `[매입] ${docId}`);
    const wasPosted = !!posted || locked?.posted_at != null;
    if (wasPosted) {
      for (const [matId, qty] of ledgerByMaterial) {
        await conn.execute(
          `UPDATE material_ledger_daily
           SET receiving_qty = GREATEST(0, receiving_qty - ?),
               notes = CONCAT(COALESCE(notes, ''), ?),
               updated_at = NOW()
           WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
          [qty, ` [${docId} 취소]`, tenantId, matId, purchase.transactionDate],
        );
      }
    }

    // (E) 회계 역분개 — 원 매입 전표([매입] PURCHASE-<id>)가 있을 때만 그대로 뒤집는다 (2026-10-15, amountContract)
    //     ★ 2026-10-16: 원 전표가 없으면(미확정·분개 없는 승인) 역분개를 만들지 않는다 — 없던 전표를 뒤집으면 장부가 틀어진다.
    if (posted && posted.lines.length > 0) {
      const reversalLines = posted.lines.map((l) => ({
        accountId: l.account_id, accountCode: l.account_code, accountName: l.account_name,
        debit: l.credit_amount, credit: l.debit_amount,
        description: `매입 취소: ${purchase.itemName || ""}`, partnerId: l.partner_id ?? null,
      }));
      const reversalTotal = Math.round(reversalLines.reduce((a, l) => a + l.debit, 0) * 100) / 100;
      const [jeResult] = await conn.execute(
        `INSERT INTO expense_journal_entries
           (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
         VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
        [tenantId, cancelDate, `[매입취소] ${docId} ${purchase.itemName || ""}`, reversalTotal, reversalTotal, userId],
      );
      const journalEntryId = Number((jeResult as any).insertId);
      let sortOrder = 0;
      for (const l of reversalLines) {
        await insertJournalLine(conn, {
          tenantId, journalEntryId,
          accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName,
          debitAmount: l.debit, creditAmount: l.credit,
          description: l.description,
          sortOrder: sortOrder++,
          partnerId: l.partnerId,
        });
      }
    }

    // (F) accounting_purchases 상태 전환
    await conn.execute(
      `UPDATE accounting_purchases
       SET status = 'cancelled',
           canceled_at = NOW(),
           canceled_by = ?
       WHERE id = ? AND tenant_id = ?`,
      [userId, purchaseId, tenantId],
    );

    console.log(
      `[CANCEL] 매입 전표 ID ${purchaseId} 취소: LOT ${byLot.size}개 / 수불부 ${wasPosted ? ledgerByMaterial.size : 0} / 역분개 ${posted ? 1 : 0} / 상태`,
    );
    return { alreadyProcessed: false };
  }, `cancelPurchase:${purchaseId}`);
}

/**
 * 취소 가능 상태 (2026-10-16): 대기·승인. 화면(getAvailableActions) 도 pending·approved 에만 취소를 보인다.
 * 이전 서버는 paid 만 받아 화면의 취소가 항상 실패했다. 지급 완료(paid) 는 지급(출금)부터 되돌려야 하므로 거부.
 */
function assertCancellableStatus(status: string | null | undefined): void {
  if (status === "pending" || status === "approved") return;
  if (status === "paid") throw new Error("지급 완료된 매입은 지급을 먼저 취소해야 합니다.");
  throw new Error(`취소할 수 없는 상태입니다: ${status}`);
}
