import { getDb, getRawConnection } from "../db";

import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

import { todayKST } from "../utils/timezone";

/**
 * 원재료 출고 CANCEL 로직 (역분개 패턴)
 *
 * **워크플로우:**
 * 1. 출고 문서 상태 검증 (POSTED만 CANCEL 가능)
 * 2. 원본 재고 원장 조회
 * 3. 재고 역거래 생성 (h_inventory_transactions - 양수)
 * 4. 회계 역분개 생성 (expense_journal_entries + expense_journal_lines - DR/CR 반대)
 * 5. 출고 문서 상태 전환 (POSTED → CANCELED)
 *
 * **멱등성 보장:**
 * - actionType: "REVERSAL"로 중복 방지
 */

interface MaterialOutboundDocument {
  id: number;
  status: string;
}

export async function cancelMaterialOutbound(
  outboundId: number,
  userId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 출고 문서 조회 및 상태 검증 (tenant_id 필터 적용)
  const outbound = await db
    .select()
    .from(hInventoryTransactions)
    .where(and(
      eq(hInventoryTransactions.id, outboundId),
      eq(hInventoryTransactions.tenantId, tenantId)
    ))
    .limit(1)
    .then((rows) => rows[0] as unknown as MaterialOutboundDocument);

  if (!outbound) {
    throw new Error("출고 문서를 찾을 수 없습니다");
  }

  if (outbound.status !== "paid") {
    throw new Error("확정된 출고 문서만 취소할 수 있습니다");
  }

  // 2. 원본 재고 원장 조회 (tenant_id 필터)
  const originalInventoryTxs = await db
    .select()
    .from(hInventoryTransactions)
    .where(and(
      eq(hInventoryTransactions.sourceId, `OUTBOUND-${outboundId}` as any),
      eq(hInventoryTransactions.tenantId, tenantId)
    ));

  if (originalInventoryTxs.length === 0) {
    throw new Error("원본 재고 거래를 찾을 수 없습니다");
  }

  // 3. 재고 역거래 생성 (각 LOT별로)
  for (const originalTx of originalInventoryTxs) {
    if (originalTx.actionType !== "POST") continue;

    try {
      await db.insert(hInventoryTransactions).values({
        tenantId,
        inventoryId: originalTx.inventoryId,
        lotId: originalTx.lotId,
        transactionType: "adjustment", // 조정
        quantity: (-parseFloat(originalTx.quantity || "0")).toString(), // 부호 반대
        unit: originalTx.unit,
        transactionDate: todayKST(),
        sourceType: "OUTBOUND",
        sourceId: `OUTBOUND-${outboundId}`,
        sourceLineId: originalTx.sourceLineId,
        actionType: "REVERSAL",
        purpose: "cancellation",
        unitCost: originalTx.unitCost,
        amount: (-parseFloat(originalTx.amount || "0")).toString(),
        reversalOfId: originalTx.id,
        performedBy: userId,
        createdBy: userId
      } as any);
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("이미 취소된 출고 문서입니다 (재고 원장 중복)");
      }
      throw error;
    }
  }

  // 4. 회계 역분개 생성 (DR/CR 반대) - expense_journal_entries + lines
  const transactionDate = todayKST();
  const description = `원재료 출고 취소 (출고 #${outboundId})`;

  // 원본 분개 조회: [원재료출고] 마커로 원본 journal entry 찾기
  const conn = await getRawConnection();
  const [originalEntries] = await conn.execute(
    `SELECT id, total_debit, total_credit
     FROM expense_journal_entries
     WHERE tenant_id = ? AND description LIKE ?`,
    [tenantId, `[원재료출고] 원재료 출고 (출고 #${outboundId})%`]
  ) as any[];

  // system_code 기반 계정 조회
  const wipAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.WIP || "WIP", "1130", "재공품");
  const inventoryRawAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1120", "원재료재고");

  if (originalEntries && originalEntries.length > 0) {
    // 원본이 있으면 금액을 가져와서 역분개
    const originalEntry = originalEntries[0];
    const totalAmount = parseFloat(originalEntry.total_debit || "0");

    const [jeResult] = await conn.execute(
      `INSERT INTO expense_journal_entries
         (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
       VALUES (?, NULL, ?, ?, ?, ?, ?)`,
      [tenantId, transactionDate, `[원재료출고취소] ${description}`, totalAmount.toFixed(2), totalAmount.toFixed(2), userId]
    );
    const journalEntryId = Number((jeResult as any).insertId);

    // 역분개: 차변 원재료 (원본의 대변), 대변 WIP (원본의 차변)
    await insertJournalLine(conn, {
      tenantId,
      journalEntryId,
      accountId: inventoryRawAcc.id,
      accountCode: inventoryRawAcc.code,
      accountName: inventoryRawAcc.name,
      debitAmount: totalAmount,
      creditAmount: 0,
      description,
      sortOrder: 0,
    });

    await insertJournalLine(conn, {
      tenantId,
      journalEntryId,
      accountId: wipAcc.id,
      accountCode: wipAcc.code,
      accountName: wipAcc.name,
      debitAmount: 0,
      creditAmount: totalAmount,
      description,
      sortOrder: 1,
    });
  } else {
    // 원본 분개를 찾을 수 없는 경우, 재고 원장에서 금액 산출하여 역분개 생성
    const totalAmount = originalInventoryTxs
      .filter(tx => tx.actionType === "POST")
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount || "0")), 0);

    if (totalAmount > 0) {
      const [jeResult] = await conn.execute(
        `INSERT INTO expense_journal_entries
           (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
         VALUES (?, NULL, ?, ?, ?, ?, ?)`,
        [tenantId, transactionDate, `[원재료출고취소] ${description}`, totalAmount.toFixed(2), totalAmount.toFixed(2), userId]
      );
      const journalEntryId = Number((jeResult as any).insertId);

      // 역분개: 차변 원재료, 대변 WIP
      await insertJournalLine(conn, {
        tenantId,
        journalEntryId,
        accountId: inventoryRawAcc.id,
        accountCode: inventoryRawAcc.code,
        accountName: inventoryRawAcc.name,
        debitAmount: totalAmount,
        creditAmount: 0,
        description,
        sortOrder: 0,
      });

      await insertJournalLine(conn, {
        tenantId,
        journalEntryId,
        accountId: wipAcc.id,
        accountCode: wipAcc.code,
        accountName: wipAcc.name,
        debitAmount: 0,
        creditAmount: totalAmount,
        description,
        sortOrder: 1,
      });
    }
  }

  console.log(`[materialOutboundCancel] 원재료 출고 #${outboundId} 취소 완료`);
}
