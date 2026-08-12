/**
 * ERP 전용 매출 확정 (POST)
 * HACCP 재고(LOT/FEFO) 의존 없이 순수 회계 처리만 수행:
 *   - accounting_sales 상태 변경 (pending → approved)
 *   - 매출 인식 분개 (외상매출금 / 매출 / 부가세예수금)
 *
 * HACCP 모듈이 활성화된 테넌트는 productSalePost.ts 를 사용해야 합니다.
 */
import { getDb } from "../../db/connection";
import { sql } from "drizzle-orm";
import {
  resolveSystemAccount,
  insertJournalLine,
  SYSTEM_ACCOUNTS,
} from "../../db/journalHelper";

export async function erpPostSale(saleId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 매출 데이터 조회
  const [rows] = (await db.execute(sql`
    SELECT id, tenant_id, item_name, quantity, unit_price, total_amount, tax_amount, status, partner_id, transaction_date, accounting_excluded
    FROM accounting_sales
    WHERE id = ${saleId}
    FOR UPDATE
  `)) as any;

  const sale = rows?.[0];
  if (!sale) throw new Error(`매출 ID ${saleId}를 찾을 수 없습니다.`);
  if (sale.status === "approved") return { success: true, alreadyPosted: true };

  const tenantId = sale.tenant_id;
  const totalAmount = Number(sale.total_amount) || 0;
  const taxAmount = Number(sale.tax_amount) || 0;
  const supplyAmount = totalAmount - taxAmount;

  // B2C(회계 제외) 매출은 분개 생략, 상태만 변경
  if (sale.accounting_excluded) {
    await db.execute(sql`
      UPDATE accounting_sales SET status = 'approved' WHERE id = ${saleId}
    `);
    return { success: true, accountingExcluded: true };
  }

  // 분개 생성
  const { expenseJournalEntries } = await import("../../../drizzle/schema");
  const [journalResult] = await db.insert(expenseJournalEntries).values({
    tenantId,
    entryDate: sale.transaction_date || new Date().toISOString().slice(0, 10),
    description: `매출: ${sale.item_name}`,
    referenceType: "sale",
    referenceId: saleId,
    status: "posted",
    createdBy: userId,
  } as any);
  const journalId = (journalResult as any).insertId;

  // 차변: 외상매출금
  const arAccount = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, "1030", "외상매출금");
  await insertJournalLine(tenantId, journalId, arAccount, totalAmount, 0, `외상매출금: ${sale.item_name}`);

  // 대변: 매출
  const revenueAccount = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.SALES_REVENUE, "4010", "상품매출");
  await insertJournalLine(tenantId, journalId, revenueAccount, 0, supplyAmount > 0 ? supplyAmount : totalAmount, `매출: ${sale.item_name}`);

  // 대변: 부가세예수금 (세액이 있을 때만)
  if (taxAmount > 0) {
    const vatAccount = await resolveSystemAccount(tenantId, SYSTEM_ACCOUNTS.VAT_OUTPUT, "2350", "부가세예수금");
    await insertJournalLine(tenantId, journalId, vatAccount, 0, taxAmount, "부가세예수금");
  }

  // 상태 변경
  await db.execute(sql`
    UPDATE accounting_sales SET status = 'approved' WHERE id = ${saleId}
  `);

  return { success: true, journalId };
}
