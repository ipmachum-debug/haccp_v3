import { getRawConnection } from "../connection";

/**
 * 이번 달 회계 요약 데이터 조회
 *
 * 2026-04-27 fix: 기존에 db.execute(sql) + result[0] 패턴이 Drizzle 버전에 따라
 *   undefined 가 되어 dashboard "이번달 매출 0" 으로 표시되던 문제 해결.
 *   검증된 getRawConnection() + [rows] = await conn.execute() 패턴으로 전환.
 *
 * 변경:
 *   - 매출/매입 SUM 시 status='cancelled' 제외 (정확성)
 *   - B2C accounting_excluded=1 매출도 포함 (이미 status='received' 까지 reach)
 *     → 단, 화면 라벨이 "이번달 매출" 이므로 모든 활성 매출 합산이 자연스러움
 *   - pending 별도 카운트는 그대로 유지
 */
export async function getMonthlyAccountingSummary(tenantId: number) {
  const conn = await getRawConnection();
  if (!conn) throw new Error("DB 연결 실패");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [rows]: any = await conn.execute(
    `
    SELECT
      COALESCE(SUM(CASE WHEN source_table = 'accounting_purchases' THEN total_amount ELSE 0 END), 0) AS total_purchases,
      COALESCE(SUM(CASE WHEN source_table = 'accounting_sales' THEN total_amount ELSE 0 END), 0) AS total_sales,
      SUM(CASE WHEN source_table = 'accounting_purchases' AND status = 'pending' THEN 1 ELSE 0 END) AS pending_purchases_count,
      SUM(CASE WHEN source_table = 'accounting_sales' AND status = 'pending' THEN 1 ELSE 0 END) AS pending_sales_count
    FROM (
      SELECT 'accounting_purchases' AS source_table, total_amount, status
      FROM accounting_purchases
      WHERE YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
        AND tenant_id = ?
        AND (status IS NULL OR status != 'cancelled')
      UNION ALL
      SELECT 'accounting_sales' AS source_table, total_amount, status
      FROM accounting_sales
      WHERE YEAR(transaction_date) = ? AND MONTH(transaction_date) = ?
        AND tenant_id = ?
        AND (status IS NULL OR status != 'cancelled')
    ) AS combined
    `,
    [currentYear, currentMonth, tenantId, currentYear, currentMonth, tenantId],
  );

  const row = (rows as any[])[0] ?? {};
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
    pendingTotalCount: pendingPurchasesCount + pendingSalesCount,
  };
}

/**
 * 계정 과목별 지출 집계 (이번 달)
 *
 * 2026-04-27 fix: 동일 destructuring 이슈 수정 + raw mysql2 패턴 전환.
 */
export async function getExpensesByCategory(tenantId: number) {
  const conn = await getRawConnection();
  if (!conn) throw new Error("DB 연결 실패");

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [rows]: any = await conn.execute(
    `
    SELECT
      ac.major_category,
      ac.name AS category_name,
      SUM(ap.total_amount) AS total_amount
    FROM accounting_purchases ap
    LEFT JOIN account_categories ac ON ap.account_category_id = ac.id
    WHERE YEAR(ap.transaction_date) = ?
      AND MONTH(ap.transaction_date) = ?
      AND ap.tenant_id = ?
      AND (ap.status IS NULL OR ap.status != 'cancelled')
    GROUP BY ac.major_category, ac.name
    ORDER BY total_amount DESC
    LIMIT 10
    `,
    [currentYear, currentMonth, tenantId],
  );

  return (rows as any[]).map((row: any) => ({
    majorCategory: row.major_category || "미분류",
    categoryName: row.category_name || "미분류",
    totalAmount: parseFloat(row.total_amount || "0"),
  }));
}
