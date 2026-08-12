/**
 * ERP 전용 매입 확정 (POST)
 * HACCP 테이블 의존 없이 순수 회계 처리만 수행:
 *   - accounting_purchases 상태 변경 (pending → approved)
 *   - expense_journal_entries + lines 분개 생성
 *
 * HACCP 모듈이 활성화된 테넌트는 purchasePost.ts 를 사용해야 합니다.
 */
import { getDb } from "../../db/connection";
import { sql } from "drizzle-orm";
import {
  resolveSystemAccount,
  insertJournalLine,
  SYSTEM_ACCOUNTS,
} from "../../db/journalHelper";

export async function erpPostPurchase(purchaseId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 매입 데이터 조회
  const [rows] = (await db.execute(sql`
    SELECT id, tenant_id, item_name, quantity, unit_price, total_amount, tax_amount, status, partner_id, transaction_date
    FROM accounting_purchases
    WHERE id = ${purchaseId}
    FOR UPDATE
  `)) as any;

  const purchase = rows?.[0];
  if (!purchase) throw new Error(`매입 ID ${purchaseId}를 찾을 수 없습니다.`);
  if (purchase.status === "approved") return { success: true, alreadyPosted: true };

  const tenantId = purchase.tenant_id;
  const totalAmount = Number(purchase.total_amount) || 0;
  const taxAmount = Number(purchase.tax_amount) || 0;
  const supplyAmount = totalAmount - taxAmount;

  // 분개 생성 (순수 회계 — HACCP 재고 없음)
  const { expenseJournalEntries } = await import("../../../drizzle/schema");
  const [journalResult] = await db.insert(expenseJournalEntries).values({
    tenantId,
    entryDate: purchase.transaction_date || new Date().toISOString().slice(0, 10),
    description: `매입: ${purchase.item_name}`,
    referenceType: "purchase",
    referenceId: purchaseId,
    status: "posted",
    createdBy: userId,
  } as any);
  const journalId = (journalResult as any).insertId;

  // 차변: 매입비용 (원재료 또는 상품매입)
  const inventoryAccount = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.INVENTORY_RAW, "1410", "원재료");
  await insertJournalLine(tenantId, journalId, inventoryAccount, supplyAmount > 0 ? supplyAmount : totalAmount, 0, `매입: ${purchase.item_name}`);

  // 차변: 부가세대급금 (세액이 있을 때만)
  if (taxAmount > 0) {
    const vatAccount = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_INPUT, "1350", "부가세대급금");
    await insertJournalLine(tenantId, journalId, vatAccount, taxAmount, 0, "부가세대급금");
  }

  // 대변: 외상매입금
  const apAccount = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_PAYABLE, "2010", "외상매입금");
  await insertJournalLine(tenantId, journalId, apAccount, 0, totalAmount, `외상매입금: ${purchase.item_name}`);

  // 상태 변경
  await db.execute(sql`
    UPDATE accounting_purchases SET status = 'approved' WHERE id = ${purchaseId}
  `);

  return { success: true, journalId };
}
