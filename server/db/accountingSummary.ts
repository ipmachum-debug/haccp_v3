import { getDb } from "../db";
import { sql } from "drizzle-orm";

/**
 * 이번 달 회계 요약 데이터 조회
 */
export async function getMonthlyAccountingSummary(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 이번 달 매입/매출 합계
  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN source_table = 'accounting_purchases' THEN total_amount ELSE 0 END), 0) as total_purchases,
      COALESCE(SUM(CASE WHEN source_table = 'accounting_sales' THEN total_amount ELSE 0 END), 0) as total_sales,
      COUNT(CASE WHEN source_table = 'accounting_purchases' AND status = 'pending' THEN 1 END) as pending_purchases_count,
      COUNT(CASE WHEN source_table = 'accounting_sales' AND status = 'pending' THEN 1 END) as pending_sales_count
    FROM (
      SELECT 'accounting_purchases' as source_table, total_amount, status, transaction_date
      FROM accounting_purchases
      WHERE YEAR(transaction_date) = ${currentYear} AND MONTH(transaction_date) = ${currentMonth}
        AND tenant_id = ${tenantId}
      UNION ALL
      SELECT 'accounting_sales' as source_table, total_amount, status, transaction_date
      FROM accounting_sales
      WHERE YEAR(transaction_date) = ${currentYear} AND MONTH(transaction_date) = ${currentMonth}
        AND tenant_id = ${tenantId}
    ) as combined
  `);

  const row = result[0] as any;
  const totalPurchases = parseFloat(row.total_purchases || "0");
  const totalSales = parseFloat(row.total_sales || "0");
  const pendingPurchasesCount = parseInt(row.pending_purchases_count || "0", 10);
  const pendingSalesCount = parseInt(row.pending_sales_count || "0", 10);
  const netCashFlow = totalSales - totalPurchases;

  return {
    currentYear,
    currentMonth,
    totalPurchases,
    totalSales,
    netCashFlow,
    pendingPurchasesCount,
    pendingSalesCount,
    pendingTotalCount: pendingPurchasesCount + pendingSalesCount
  };
}

/**
 * 계정 과목별 지출 집계 (이번 달)
 */
export async function getExpensesByCategory(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const result = await db.execute(sql`
    SELECT
      ac.major_category,
      ac.name as category_name,
      SUM(ap.total_amount) as total_amount
    FROM accounting_purchases ap
    LEFT JOIN account_categories ac ON ap.account_category_id = ac.id
    WHERE YEAR(ap.transaction_date) = ${currentYear}
      AND MONTH(ap.transaction_date) = ${currentMonth}
      AND ap.tenant_id = ${tenantId}
    GROUP BY ac.major_category, ac.name
    ORDER BY total_amount DESC
    LIMIT 10
  `);

  return result.map((row: any) => ({
    majorCategory: row.major_category || "미분류",
    categoryName: row.category_name || "미분류",
    totalAmount: parseFloat(row.total_amount || "0")
  }));
}
