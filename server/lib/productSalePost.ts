import { getDb } from "../db";

import { hInventoryTransactions } from "../../drizzle/schema/part2";
import { accountingTransactions } from "../../drizzle/schema_inventory_accounting";
import { accountingSales } from "../../drizzle/schema_accounting_extended";
import { allocateLotsFEFO, saveLotAllocations } from "./fefoLotAllocation";
import { eq } from "drizzle-orm";
import { resolveSystemAccount } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

/**
 * 제품 출고/판매 POST 로직
 * 
 * **워크플로우:**
 * 1. 판매 문서 상태 검증 (DRAFT만 POST 가능)
 * 2. FEFO 로트 할당 (유통기한 빠른 순)
 * 3. 재고 원장 생성 (h_inventory_transactions - outbound)
 * 4. 회계 원장 생성 (accounting_transactions)
 *    (A) 매출 인식:
 *      - 차변: 매출채권 (1310 - 매출채권)
 *      - 대변: 매출 (4110 - 제품매출)
 *    (B) 매출원가 인식:
 *      - 차변: 매출원가 (5110 - 제품매출원가)
 *      - 대변: 제품재고 (1140 - 제품재고)
 * 5. 판매 문서 상태 전환 (DRAFT → POSTED)
 * 
 * **멱등성 보장:**
 * - h_inventory_transactions: UNIQUE(source_type, source_id, source_line_id, action_type, lot_id)
 * - accounting_transactions: UNIQUE(source_type, source_id, source_line_id, action_type, account_code)
 */

interface SalesDocument {
  id: number;
  status: string;
  inventoryId: number;
  quantity: string;
  unit: string;
  unitPrice: string;
  totalAmount: string;
  createdBy: number;
}

export async function postProductSale(
  saleId: number,
  userId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  if (!db) throw new Error("Database connection not available");

  // 1. 판매 문서 조회 및 상태 검증
  const sale = await db
    .select()
    .from(accountingSales)
    .where(eq(accountingSales.id, saleId))
    .limit(1)
    .then((rows) => rows[0] as unknown as SalesDocument);

  if (!sale) {
    throw new Error("판매 문서를 찾을 수 없습니다");
  }

  if (sale.status !== "DRAFT") {
    throw new Error("DRAFT 상태의 판매 문서만 확정할 수 있습니다");
  }

  const quantity = parseFloat(sale.quantity);
  const unitPrice = parseFloat(sale.unitPrice);
  const totalAmount = parseFloat(sale.totalAmount);

  // 2. FEFO 로트 할당
  const allocations = await allocateLotsFEFO(
    sale.inventoryId,
    quantity,
    sale.unit
  );

  // 3. LOT 할당 저장
  await saveLotAllocations(
    "SALE",
    saleId.toString(),
    "1", // line_id (단일 품목이면 1)
    allocations,
    sale.unit,
    sale.createdBy
  );

  // 4. 재고 원장 생성 (각 LOT별로)
  for (const allocation of allocations) {
    try {
      await db.insert(hInventoryTransactions).values({
        inventoryId: sale.inventoryId,
        lotId: allocation.lotId,
        transactionType: "outbound",
        quantity: (-allocation.quantity).toString(), // 음수 (출고)
        unit: sale.unit,
        transactionDate: new Date().toISOString().split("T")[0],
        sourceType: "SALE",
        sourceId: `SALE-${saleId}`,
        sourceLineId: `SALE-${saleId}-1`,
        actionType: "POST",
        purpose: "sale",
        unitCost: allocation.unitCost.toString(),
        amount: (-allocation.quantity * allocation.unitCost).toString(),
        performedBy: userId,
        createdBy: userId
      } as any);
    } catch (error: any) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new Error("이미 확정된 판매 문서입니다 (재고 원장 중복)");
      }
      throw error;
    }
  }

  // 5. 회계 원장 생성 (복식부기) - system_code 기반
  const transactionDate = new Date().toISOString().split("T")[0];
  const totalCost = allocations.reduce(
    (sum, a) => sum + a.quantity * a.unitCost,
    0
  );
  const tenantId = (sale as any).tenantId;
  if (!tenantId) throw new Error('[P0 보안] tenantId is required for productSalePost');

  // system_code 기반 계정 조회
  const receivableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금");
  const salesRevenueAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.SALES_REVENUE, "4010", "상품매출");
  const cogsAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.COST_OF_GOODS, "5010", "매출원가");
  const inventoryGoodsAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_GOODS, "1420", "상품");

  // (A) 매출 인식
  // 차변: 외상매출금
  try {
    await db.insert(accountingTransactions).values({
      tenantId,
      transactionDate,
      accountCode: receivableAcc.code,
      accountName: receivableAcc.name,
      debitAmount: totalAmount.toFixed(2),
      creditAmount: "0.00",
      description: `제품 판매 (판매 #${saleId})`,
      sourceType: "SALE",
      sourceId: `SALE-${saleId}`,
      sourceLineId: `SALE-${saleId}-receivable`,
      actionType: "POST",
      createdBy: userId
    });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("이미 확정된 판매 문서입니다 (회계 원장 중복 - 매출채권)");
    }
    throw error;
  }

  // 대변: 매출
  try {
    await db.insert(accountingTransactions).values({
      tenantId,
      transactionDate,
      accountCode: salesRevenueAcc.code,
      accountName: salesRevenueAcc.name,
      debitAmount: "0.00",
      creditAmount: totalAmount.toFixed(2),
      description: `제품 판매 (판매 #${saleId})`,
      sourceType: "SALE",
      sourceId: `SALE-${saleId}`,
      sourceLineId: `SALE-${saleId}-revenue`,
      actionType: "POST",
      createdBy: userId
    });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("이미 확정된 판매 문서입니다 (회계 원장 중복 - 매출)");
    }
    throw error;
  }

  // (B) 매출원가 인식
  // 차변: 매출원가
  try {
    await db.insert(accountingTransactions).values({
      tenantId,
      transactionDate,
      accountCode: cogsAcc.code,
      accountName: cogsAcc.name,
      debitAmount: totalCost.toFixed(2),
      creditAmount: "0.00",
      description: `제품 판매 원가 (판매 #${saleId})`,
      sourceType: "SALE",
      sourceId: `SALE-${saleId}`,
      sourceLineId: `SALE-${saleId}-cogs`,
      actionType: "POST",
      createdBy: userId
    });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("이미 확정된 판매 문서입니다 (회계 원장 중복 - 매출원가)");
    }
    throw error;
  }

  // 대변: 제품재고
  try {
    await db.insert(accountingTransactions).values({
      tenantId,
      transactionDate,
      accountCode: inventoryGoodsAcc.code,
      accountName: inventoryGoodsAcc.name,
      debitAmount: "0.00",
      creditAmount: totalCost.toFixed(2),
      description: `제품 판매 원가 (판매 #${saleId})`,
      sourceType: "SALE",
      sourceId: `SALE-${saleId}`,
      sourceLineId: `SALE-${saleId}-inventory`,
      actionType: "POST",
      createdBy: userId
    });
  } catch (error: any) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error("이미 확정된 판매 문서입니다 (회계 원장 중복 - 제품재고)");
    }
    throw error;
  }

  // 6. 판매 문서 상태 전환
  await db.update(accountingSales).set({
    status: "received",
    postedAt: new Date(),
    postedBy: userId
  }).where(eq(accountingSales.id, saleId));

  console.log(`[productSalePost] 판매 #${saleId} 확정 완료 (매출: ${totalAmount}, 매출원가: ${totalCost.toFixed(2)})`);
}
