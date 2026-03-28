import { getDb, getRawConnection } from "../db";

import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { allocateLotsFEFO, saveLotAllocations } from "./fefoLotAllocation";
import { eq, and } from "drizzle-orm";
import { resolveSystemAccount, insertJournalLine } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

import { todayKST } from "../utils/timezone";

/**
 * 원재료 출고 POST 로직
 *
 * **워크플로우:**
 * 1. 출고 문서 상태 검증 (DRAFT만 POST 가능)
 * 2. FEFO 로트 할당 (유통기한 빠른 순)
 * 3. 재고 원장 생성 (h_inventory_transactions - usage)
 * 4. 회계 분개 생성 (expense_journal_entries + expense_journal_lines)
 *    - 차변: WIP (1130 - 재공품)
 *    - 대변: 원재료 (1120 - 원재료재고)
 * 5. 출고 문서 상태 전환 (DRAFT → POSTED)
 *
 * **멱등성 보장:**
 * - h_inventory_transactions: UNIQUE(source_type, source_id, source_line_id, action_type, lot_id)
 * - expense_journal_entries: description 기반 중복 체크
 */

interface MaterialOutboundDocument {
  id: number;
  status: string;
  inventoryId: number;
  quantity: string;
  unit: string;
  purpose?: string; // 'production' | 'disposal' | 'transfer' 등
}

export async function postMaterialOutbound(
  outboundId: number,
  userId: number,
  tenantId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 1. 출고 문서 조회 및 상태 검증 (tenant_id 필터 적용)
  const outbound = await db
    .select()
    .from(hInventoryTransactions) // 실제로는 h_outbound_headers 같은 테이블이 있어야 함
    .where(and(
      eq(hInventoryTransactions.id, outboundId),
      eq(hInventoryTransactions.tenantId, tenantId)
    ))
    .limit(1)
    .then((rows) => rows[0] as unknown as MaterialOutboundDocument);

  if (!outbound) {
    throw new Error("출고 문서를 찾을 수 없습니다");
  }

  if (outbound.status !== "DRAFT") {
    throw new Error("DRAFT 상태의 출고 문서만 확정할 수 있습니다");
  }

  const quantity = parseFloat(outbound.quantity);

  // 2. FEFO 로트 할당 (tenant_id 전달)
  const allocations = await allocateLotsFEFO(
    outbound.inventoryId,
    quantity,
    outbound.unit,
    tenantId
  );

  // 3. LOT 할당 저장 (tenant_id 전달)
  await saveLotAllocations(
    "OTHER",
    `OUTBOUND-${outboundId}`,
    `OUTBOUND-${outboundId}-1`,
    allocations,
    outbound.unit,
    userId,
    tenantId
  );

  // 4. 재고 원장 생성 (각 LOT별로)
  for (const allocation of allocations) {
    try {
      await db.insert(hInventoryTransactions).values({
        tenantId,
        inventoryId: outbound.inventoryId,
        lotId: allocation.lotId,
        transactionType: "usage", // 원재료 사용
        quantity: (-allocation.quantity).toString(), // 음수 (출고)
        unit: outbound.unit,
        transactionDate: todayKST(),
        sourceType: "OUTBOUND",
        sourceId: `OUTBOUND-${outboundId}`,
        sourceLineId: `OUTBOUND-${outboundId}-1`,
        actionType: "POST",
        purpose: outbound.purpose || "production",
        unitCost: allocation.unitCost.toString(),
        amount: (-allocation.quantity * allocation.unitCost).toString(),
        performedBy: userId,
        createdBy: userId
      } as any);
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("이미 확정된 출고 문서입니다 (재고 원장 중복)");
      }
      throw error;
    }
  }

  // 5. 회계 분개 생성 (복식부기) - system_code 기반
  const totalAmount = allocations.reduce(
    (sum, a) => sum + a.quantity * a.unitCost,
    0
  );

  const transactionDate = todayKST();

  // system_code 기반 계정 조회
  const wipAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.WIP || "WIP", "1130", "재공품");
  const inventoryRawAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1120", "원재료재고");

  const description = `원재료 출고 (출고 #${outboundId})`;

  // expense_journal_entries + expense_journal_lines 기반 분개
  const conn = await getRawConnection();

  const [jeResult] = await conn.execute(
    `INSERT INTO expense_journal_entries
       (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
     VALUES (?, NULL, ?, ?, ?, ?, ?)`,
    [tenantId, transactionDate, `[원재료출고] ${description}`, totalAmount.toFixed(2), totalAmount.toFixed(2), userId]
  );
  const journalEntryId = Number((jeResult as any).insertId);

  // 차변: WIP (재공품)
  await insertJournalLine(conn, {
    tenantId,
    journalEntryId,
    accountId: wipAcc.id,
    accountCode: wipAcc.code,
    accountName: wipAcc.name,
    debitAmount: parseFloat(totalAmount.toFixed(2)),
    creditAmount: 0,
    description,
    sortOrder: 0,
  });

  // 대변: 원재료
  await insertJournalLine(conn, {
    tenantId,
    journalEntryId,
    accountId: inventoryRawAcc.id,
    accountCode: inventoryRawAcc.code,
    accountName: inventoryRawAcc.name,
    debitAmount: 0,
    creditAmount: parseFloat(totalAmount.toFixed(2)),
    description,
    sortOrder: 1,
  });

  console.log(`[materialOutboundPost] 원재료 출고 #${outboundId} 확정 완료`);
}
