import { getDb, getRawConnection } from "../db";;
import { accountingPurchases } from "../../drizzle/schema_accounting_extended";
import { hInventoryTransactions, hInventoryLots } from "../../drizzle/schema/part2";
import { accountingTransactions } from "../../drizzle/schema_inventory_accounting";
import { eq, and } from "drizzle-orm";
import { generateExpiryAlerts } from "./expiryAlertGenerator";
import { resolveSystemAccount } from "../db/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../drizzle/schema/accountingAccounts";

/**
 * 매입 POST 로직
 * 
 * DRAFT 상태의 매입 전표를 POSTED로 전환하고,
 * 재고 원장(h_inventory_transactions)과 회계 원장(accounting_transactions)에 자동 반영
 * 
 * @param purchaseId 매입 전표 ID
 * @param userId 처리자 ID
 */
export async function postPurchase(purchaseId: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  if (!db) throw new Error("Database connection not available");

  // 1. 매입 전표 조회
  const purchase = await db
    .select()
    .from(accountingPurchases)
    .where(eq(accountingPurchases.id, purchaseId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!purchase) {
    throw new Error(`매입 전표 ID ${purchaseId}를 찾을 수 없습니다.`);
  }

  // 2. 상태 검증
  if (purchase.status === "paid") {
    throw new Error(`이미 확정된 전표입니다. (ID: ${purchaseId})`);
  }

  if (purchase.status === "cancelled") {
    throw new Error(`취소된 전표는 확정할 수 없습니다. (ID: ${purchaseId})`);
  }

  // 3. 멱등성 키 생성
  const docId = `PURCHASE-${purchaseId}`;
  const sourceType = "PURCHASE";
  const actionType = "POST";

  // 4. LOT 생성 (매입은 항상 새 LOT 생성)
  const lotNumber = `LOT-${Date.now()}-${purchaseId}`;
  const [newLot] = await db.insert(hInventoryLots).values({
    inventoryId: purchase.inventoryId!,
    lotNumber,
    initialQuantity: purchase.quantity?.toString() || "0",
    currentQuantity: purchase.quantity?.toString() || "0",
    unit: purchase.unit || "EA",
    unitCost: purchase.unitPrice?.toString() || "0",
    receivedDate: purchase.transactionDate,
    expiryDate: purchase.expiryDate || null,
    supplierId: purchase.supplierId || null,
    status: "active",
    createdBy: userId
  });

  const lotId = newLot.insertId;

  // 4.5. 소비기한 알람 자동 생성
  if (purchase.expiryDate) {
    await generateExpiryAlerts(lotId, purchase.inventoryId!, purchase.expiryDate, userId);
  }

  // 5. 재고 원장 생성 (h_inventory_transactions)
  try {
    await db.insert(hInventoryTransactions).values({
      inventoryId: purchase.inventoryId!,
      lotId,
      transactionType: "receipt",
      quantity: purchase.quantity?.toString() || "0",
      unit: purchase.unit || "EA",
      transactionDate: purchase.transactionDate,
      sourceType,
      sourceId: docId,
      sourceLineId: purchaseId.toString(),
      actionType,
      purpose: "매입 입고",
      unitCost: purchase.unitPrice?.toString() || "0",
      amount: purchase.totalAmount?.toString() || "0",
      createdBy: userId
    });
  } catch (error: any) {
    // 멱등성 키 중복 오류 처리
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error(`이미 처리된 매입 전표입니다. (ID: ${purchaseId})`);
    }
    throw error;
  }

  // 6. 회계 원장 생성 (accounting_transactions) - system_code 기반
  // 매입 분개: 차변 원재료(INVENTORY_RAW) + 부가세대급금(VAT_INPUT), 대변 외상매입금(ACCOUNTS_PAYABLE)
  const totalAmount = Number(purchase.totalAmount || 0);
  const taxAmount = Number(purchase.taxAmount || 0);
  const supplyAmount = totalAmount - taxAmount;
  const tenantId = purchase.tenantId || 1;

  // system_code 기반 계정 조회
  const inventoryAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  const payableAcc = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");
  const vatAcc = taxAmount > 0 
    ? await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금")
    : null;

  try {
    // (A) 차변: 원재료 증가 (공급가)
    await db.insert(accountingTransactions).values({
      tenantId,
      transactionDate: purchase.transactionDate,
      accountCode: inventoryAcc.code,
      accountName: inventoryAcc.name,
      debitAmount: supplyAmount.toFixed(2),
      creditAmount: "0.00",
      description: `매입: ${purchase.itemName || ""}`,
      sourceType,
      sourceId: docId,
      sourceLineId: `${purchaseId}-debit`,
      actionType,
      reversalOfId: null,
      postedAt: new Date(),
      createdBy: userId
    });

    // (A-2) 차변: 부가세대급금 (세액이 있는 경우)
    if (vatAcc && taxAmount > 0) {
      await db.insert(accountingTransactions).values({
        tenantId,
        transactionDate: purchase.transactionDate,
        accountCode: vatAcc.code,
        accountName: vatAcc.name,
        debitAmount: taxAmount.toFixed(2),
        creditAmount: "0.00",
        description: `매입 부가세: ${purchase.itemName || ""}`,
        sourceType,
        sourceId: docId,
        sourceLineId: `${purchaseId}-vat`,
        actionType,
        reversalOfId: null,
        postedAt: new Date(),
        createdBy: userId
      });
    }

    // (B) 대변: 외상매입금 증가 (총액)
    await db.insert(accountingTransactions).values({
      tenantId,
      transactionDate: purchase.transactionDate,
      accountCode: payableAcc.code,
      accountName: payableAcc.name,
      debitAmount: "0.00",
      creditAmount: totalAmount.toFixed(2),
      description: `매입: ${purchase.itemName || ""}`,
      sourceType,
      sourceId: docId,
      sourceLineId: `${purchaseId}-credit`,
      actionType,
      reversalOfId: null,
      postedAt: new Date(),
      createdBy: userId
    });
  } catch (error: any) {
    // 멱등성 키 중복 오류 처리
    if (error.code === "ER_DUP_ENTRY") {
      throw new Error(`이미 회계 처리된 매입 전표입니다. (ID: ${purchaseId})`);
    }
    throw error;
  }

  // 7. 매입 전표 상태 업데이트 (DRAFT → POSTED)
  await db
    .update(accountingPurchases)
    .set({
      status: "paid",
      postedAt: new Date(),
      postedBy: userId
    })
    .where(eq(accountingPurchases.id, purchaseId));

  console.log(`[POST] 매입 전표 ID ${purchaseId} 확정 완료 (LOT: ${lotNumber})`);
}
