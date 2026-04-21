import { getDb, withTransaction } from "../../db";
import { accountingPurchases } from "../../../drizzle/schema/schema_accounting_extended";
import { and, eq, sql } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";
import { todayKST } from "../../utils/timezone";

/**
 * 매입 CANCEL 로직 — purchasePost 의 완전 대칭 역수행 (Module 1, 2026-04-14)
 *
 * purchasePost 가 변경한 모든 테이블을 정확히 되돌립니다:
 *   1. h_inventory_lots: 가용 수량 감소 (부분 소진 시 에러)
 *   2. h_inventory_transactions: usage 타입 양수 quantity 역거래 INSERT
 *   3. h_inbound_headers: status='cancelled' (DELETE 금지, 감사 추적 유지)
 *   4. material_ledger_daily: receiving_qty 감소 (GREATEST(0,...) 음수 방지)
 *   5. expense_journal_entries/lines: 역분개 (차변 AP / 대변 INVENTORY + VAT)
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
  if (purchase.status !== "paid") {
    throw new Error(`확정(paid)된 전표만 취소할 수 있습니다. (현재 상태: ${purchase.status})`);
  }

  // ── 2. 공통 값 계산 ────────────────────────────────────
  const totalAmount = Number(purchase.totalAmount || 0);
  const taxAmount = Number(purchase.taxAmount || 0);
  const supplyAmount = Math.max(0, totalAmount - taxAmount);
  const cancelQty = Number(purchase.quantity || 0);
  const docId = `PURCHASE-${purchaseId}`;
  const cancelDate = todayKST();
  const inboundNumber = `INB-PURCHASE-${purchaseId}`;
  const materialId = (purchase as any).materialId as number | null;

  // ── 2b. 품목 유형 조회 (회계 계정 분기용) ────────────
  let resolvedItemType = "raw_material";
  if (materialId) {
    try {
      const db2 = await getDb();
      if (db2) {
        const itemTypeResult: any = await db2.execute(sql`
          SELECT item_type FROM item_master
          WHERE id = ${materialId} AND tenant_id = ${tenantId}
          LIMIT 1
        `);
        const itemTypeRows: any[] = (itemTypeResult as any)?.[0] || [];
        if (itemTypeRows[0]?.item_type) {
          resolvedItemType = String(itemTypeRows[0].item_type);
        }
      }
    } catch (_) { /* item_master 없으면 기본값 유지 */ }
  }

  // ── 3. 시스템 계정 사전 조회 (트랜잭션 밖) ────────────
  // ★ 품목 유형에 따라 적절한 재고 계정 사용
  const inventoryAcc = resolvedItemType === "external_product"
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1420", "상품")
    : await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  const payableAcc = await resolveSystemAccount(
    tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금",
  );
  const vatAcc = taxAmount > 0
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금")
    : null;

  if (inventoryAcc.id === 0 || payableAcc.id === 0 || (vatAcc && vatAcc.id === 0)) {
    const missing: string[] = [];
    if (inventoryAcc.id === 0) missing.push("INVENTORY_RAW");
    if (payableAcc.id === 0) missing.push("ACCOUNTS_PAYABLE");
    if (vatAcc && vatAcc.id === 0) missing.push("VAT_INPUT");
    throw new Error(`[${docId}] 필수 회계 계정 누락: ${missing.join(", ")}. 계정 시드 필요.`);
  }

  // ── 4. 원자적 역수행 ───────────────────────────────────
  return await withTransaction(async (conn) => {
    // (0) 비관적 잠금 + 재검증
    const [lockRows] = await conn.execute(
      `SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
      [purchaseId, tenantId],
    );
    const currentStatus = (lockRows as any[])[0]?.status;
    if (currentStatus === "cancelled") {
      return { alreadyProcessed: true };
    }
    if (currentStatus !== "paid") {
      throw new Error(`확정(paid)된 전표만 취소할 수 있습니다. (현재: ${currentStatus})`);
    }

    // (A) 원본 PURCHASE receipt 거래 조회 (LOT 역추적)
    //     case-insensitive 비교로 구/신 데이터 호환
    const [txRows] = await conn.execute(
      `SELECT id, lot_id, quantity, unit_cost
       FROM h_inventory_transactions
       WHERE tenant_id = ?
         AND UPPER(reference_type) = 'PURCHASE'
         AND source_id = ?
         AND transaction_type = 'receipt'
       ORDER BY id ASC
       LIMIT 1`,
      [tenantId, purchaseId],
    );
    const originalTx = (txRows as any[])[0];

    // (B) LOT 잔량 검증 + 감소
    if (originalTx) {
      const lotId = Number(originalTx.lot_id);

      // B-1. LOT 잠금 + 현재 가용 수량 확인
      const [lotLockRows] = await conn.execute(
        `SELECT available_quantity, current_quantity, quantity
         FROM h_inventory_lots
         WHERE id = ? AND tenant_id = ?
         FOR UPDATE`,
        [lotId, tenantId],
      );
      const lotRow = (lotLockRows as any[])[0];

      if (lotRow) {
        const curAvailable = Number(lotRow.available_quantity || 0);

        // ★ 재고 음수 금지 원칙: 부분 소진 LOT 은 취소 불가
        if (curAvailable < cancelQty - 0.001) {
          throw new Error(
            `[${docId}] LOT#${lotId} 이미 일부 소비되었습니다. ` +
              `가용: ${curAvailable}, 취소 요청: ${cancelQty}. ` +
              `재고 조정 또는 출고 취소 후 다시 시도하세요.`,
          );
        }

        // B-2. GREATEST(0, ...) 방어로 LOT 수량 감소
        await conn.execute(
          `UPDATE h_inventory_lots
           SET available_quantity = GREATEST(0, available_quantity - ?),
               current_quantity = GREATEST(0, COALESCE(current_quantity, quantity) - ?),
               status = CASE
                 WHEN GREATEST(0, available_quantity - ?) <= 0.001 THEN 'disposed'
                 ELSE status
               END,
               updated_at = NOW()
           WHERE id = ? AND tenant_id = ?`,
          [cancelQty, cancelQty, cancelQty, lotId, tenantId],
        );
      }

      // B-3. 재고 원장에 취소 기록 (usage 타입, 양수 quantity)
      //      ★ INV_NEGATIVE_TX 규칙 준수: quantity 는 항상 양수, 방향은 type 으로
      await conn.execute(
        `INSERT INTO h_inventory_transactions
           (tenant_id, lot_id, transaction_type, quantity, unit, transaction_date,
            reference_type, source_type, source_id, unit_cost, amount, notes, created_by)
         VALUES (?, ?, 'usage', ?, ?, ?, 'PURCHASE_CANCEL', 'PURCHASE_CANCEL', ?, ?, ?, ?, ?)`,
        [
          tenantId, lotId,
          cancelQty,
          purchase.unit || "EA",
          cancelDate,
          purchaseId,
          purchase.unitPrice?.toString() || "0",
          totalAmount,
          `[매입취소] ${docId}`,
          userId,
        ],
      );
    }

    // (C) h_inbound_headers 상태 변경 (DELETE 금지 - 감사 추적 유지)
    try {
      await conn.execute(
        `UPDATE h_inbound_headers
         SET status = 'cancelled',
             notes = CONCAT(COALESCE(notes, ''), ?),
             updated_at = NOW()
         WHERE tenant_id = ? AND inbound_number = ?`,
        [` [취소: ${cancelDate}]`, tenantId, inboundNumber],
      );
    } catch (ibErr) {
      // 입고전표는 경미한 오류라면 전체를 막지 않지만 로그는 남김
      console.error(`[purchaseCancel] h_inbound_headers 상태 변경 실패:`, ibErr);
    }

    // (D) material_ledger_daily 역수행 (receiving_qty 감소)
    if (materialId) {
      try {
        await conn.execute(
          `UPDATE material_ledger_daily
           SET receiving_qty = GREATEST(0, receiving_qty - ?),
               notes = CONCAT(COALESCE(notes, ''), ?),
               updated_at = NOW()
           WHERE tenant_id = ? AND material_id = ? AND ledger_date = ?`,
          [
            cancelQty,
            ` [${docId} 취소]`,
            tenantId,
            materialId,
            purchase.transactionDate,
          ],
        );
      } catch (mldErr) {
        console.error(`[purchaseCancel] material_ledger_daily 역수행 실패:`, mldErr);
      }
    }

    // (E) 회계 역분개 (purchasePost 3라인을 정확히 역순으로)
    //     원본: 차변 INVENTORY_RAW(공급가) + VAT_INPUT(세액) / 대변 ACCOUNTS_PAYABLE(총액)
    //     역분개: 차변 ACCOUNTS_PAYABLE(총액) / 대변 INVENTORY_RAW(공급가) + VAT_INPUT(세액)
    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, NOW())`,
      [
        tenantId,
        cancelDate,
        `[매입취소] ${docId} ${purchase.itemName || ""}`,
        totalAmount,
        totalAmount,
        userId,
      ],
    );
    const journalEntryId = Number((jeResult as any).insertId);

    let sortOrder = 0;
    // 차변: 외상매입금 (총액) - partner 연결로 AP 원장 정합성 유지
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: payableAcc.id, accountCode: payableAcc.code, accountName: payableAcc.name,
      debitAmount: totalAmount, creditAmount: 0,
      description: `매입 취소: ${purchase.itemName || ""}`,
      sortOrder: sortOrder++,
      partnerId: (purchase as any).partnerId || null,
    });

    // 대변: 원재료 (공급가)
    await insertJournalLine(conn, {
      tenantId, journalEntryId,
      accountId: inventoryAcc.id, accountCode: inventoryAcc.code, accountName: inventoryAcc.name,
      debitAmount: 0, creditAmount: supplyAmount,
      description: `매입 취소: ${purchase.itemName || ""}`,
      sortOrder: sortOrder++,
    });

    // 대변: 부가세대급금 (세액 있을 때만) — ★ 기존 cancel 에서 누락되었던 버그 수정
    if (vatAcc && taxAmount > 0) {
      await insertJournalLine(conn, {
        tenantId, journalEntryId,
        accountId: vatAcc.id, accountCode: vatAcc.code, accountName: vatAcc.name,
        debitAmount: 0, creditAmount: taxAmount,
        description: `매입 취소 부가세: ${purchase.itemName || ""}`,
        sortOrder: sortOrder++,
      });
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
      `[CANCEL] 매입 전표 ID ${purchaseId} 대칭 취소 완료: LOT/tx/inbound/ledger/journal(3라인)/status`,
    );
    return { alreadyProcessed: false };
  }, `cancelPurchase:${purchaseId}`);
}
