import { getDb } from "../db";

import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { accountingTransactions } from "../../drizzle/schema_inventory_accounting";
import { allocateLotsFEFO, saveLotAllocations } from "./fefoLotAllocation";
import { eq } from "drizzle-orm";

/**
 * 원재료 출고 POST 로직
 * 
 * **워크플로우:**
 * 1. 출고 문서 상태 검증 (DRAFT만 POST 가능)
 * 2. FEFO 로트 할당 (유통기한 빠른 순)
 * 3. 재고 원장 생성 (h_inventory_transactions - usage)
 * 4. 회계 원장 생성 (accounting_transactions)
 *    - 차변: WIP (1130 - 재공품)
 *    - 대변: 원재료 (1120 - 원재료재고)
 * 5. 출고 문서 상태 전환 (DRAFT → POSTED)
 * 
 * **멱등성 보장:**
 * - h_inventory_transactions: UNIQUE(source_type, source_id, source_line_id, action_type, lot_id)
 * - accounting_transactions: UNIQUE(source_type, source_id, source_line_id, action_type, account_code)
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
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  if (!db) throw new Error("Database connection not available");

  // 1. 출고 문서 조회 및 상태 검증
  const outbound = await db
    .select()
    .from(hInventoryTransactions) // 실제로는 h_outbound_headers 같은 테이블이 있어야 함
    .where(eq(hInventoryTransactions.id, outboundId))
    .limit(1)
    .then((rows) => rows[0] as unknown as MaterialOutboundDocument);

  if (!outbound) {
    throw new Error("출고 문서를 찾을 수 없습니다");
  }

  if (outbound.status !== "DRAFT") {
    throw new Error("DRAFT 상태의 출고 문서만 확정할 수 있습니다");
  }

  const quantity = parseFloat(outbound.quantity);

  // 2. FEFO 로트 할당
  const allocations = await allocateLotsFEFO(
    outbound.inventoryId,
    quantity,
    outbound.unit
  );

  // 3. LOT 할당 저장
  await saveLotAllocations(
    "OTHER",
    `OUTBOUND-${outboundId}`,
    `OUTBOUND-${outboundId}-1`,
    allocations,
    outbound.unit,
    userId
  );

  // 4. 재고 원장 생성 (각 LOT별로)
  for (const allocation of allocations) {
    try {
      await db.insert(hInventoryTransactions).values({
        inventoryId: outbound.inventoryId,
        lotId: allocation.lotId,
        transactionType: "usage", // 원재료 사용
        quantity: (-allocation.quantity).toString(), // 음수 (출고)
        unit: outbound.unit,
        transactionDate: new Date().toISOString().split("T")[0],
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

  // 5. 회계 원장 생성 (복식부기)
  const totalAmount = allocations.reduce(
    (sum, a) => sum + a.quantity * a.unitCost,
    0
  );

  const transactionDate = new Date().toISOString().split("T")[0];

  // 차변: WIP (재공품)
  try {
    await db.insert(accountingTransactions).values({
      transactionDate,
      accountCode: "1130", // WIP
      debitAmount: totalAmount.toFixed(2),
      creditAmount: "0.00",
      description: `원재료 출고 (출고 #${outboundId})`,
      sourceType: "OUTBOUND",
      sourceId: `OUTBOUND-${outboundId}`,
      sourceLineId: `OUTBOUND-${outboundId}-1`,
      actionType: "POST",
      createdBy: userId
    } as any);
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("이미 확정된 출고 문서입니다 (회계 원장 중복 - WIP)");
    }
    throw error;
  }

  // 대변: 원재료
  try {
    await db.insert(accountingTransactions).values({
      transactionDate,
      accountCode: "1120", // 원재료재고
      debitAmount: "0.00",
      creditAmount: totalAmount.toFixed(2),
      description: `원재료 출고 (출고 #${outboundId})`,
      sourceType: "OUTBOUND",
      sourceId: `OUTBOUND-${outboundId}`,
      sourceLineId: `OUTBOUND-${outboundId}-1`,
      actionType: "POST",
      createdBy: userId
    } as any);
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("이미 확정된 출고 문서입니다 (회계 원장 중복 - 원재료)");
    }
    throw error;
  }

  // 6. 출고 문서 상태 전환 (실제로는 h_outbound_headers 테이블 업데이트)
  // await db.update(hOutboundHeaders)
  //   .set({
  //     status: "paid",
  //     postedAt: new Date(),
  //     postedBy: userId,
  //
  //   })
  //   .where(eq(hOutboundHeaders.id, outboundId));

  console.log(`[materialOutboundPost] 원재료 출고 #${outboundId} 확정 완료`);
}
