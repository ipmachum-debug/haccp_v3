import { getDb } from "./index";
import { sql } from "drizzle-orm";

/**
 * 일일 마감 수행
 * 지정된 날짜의 매입/매출 거래를 집계하여 일일 마감 데이터 생성
 */
export async function performDailyClose(tenantId: number, closeDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  
  // tenant_id 필수 검증
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  
  // 해당 날짜의 매입/매출/비용 집계 (tenant 필터 추가)
  const result = await db.execute(sql`
    SELECT 
      COALESCE(SUM(CASE WHEN source_table = 'accounting_purchases' THEN total_amount ELSE 0 END), 0) as total_purchases,
      COALESCE(SUM(CASE WHEN source_table = 'accounting_sales' THEN total_amount ELSE 0 END), 0) as total_sales,
      COALESCE(SUM(CASE WHEN source_table = 'expense_vouchers' THEN total_amount ELSE 0 END), 0) as total_expenses,
      COUNT(*) as transaction_count
    FROM (
      SELECT 'accounting_purchases' as source_table, total_amount, transaction_date
      FROM accounting_purchases
      WHERE DATE(transaction_date) = ${closeDate} AND tenant_id = ${tenantId}
      UNION ALL
      SELECT 'accounting_sales' as source_table, total_amount, transaction_date
      FROM accounting_sales
      WHERE DATE(transaction_date) = ${closeDate} AND tenant_id = ${tenantId}
      UNION ALL
      SELECT 'expense_vouchers' as source_table, total_amount, expense_date as transaction_date
      FROM expense_vouchers
      WHERE DATE(expense_date) = ${closeDate} AND tenant_id = ${tenantId} AND status = 'posted'
    ) as combined
  `);

  const row = result[0] as any;
  const totalPurchases = parseFloat(row.total_purchases || "0");
  const totalSales = parseFloat(row.total_sales || "0");
  const totalExpenses = parseFloat(row.total_expenses || "0");
  const transactionCount = parseInt(row.transaction_count || "0");

  // 일일 마감 데이터 저장 (비용 포함)
  const totalOutflow = totalPurchases + totalExpenses;
  await db.execute(sql`
    INSERT INTO accounting_daily_close (
      tenant_id,
      close_date,
      total_purchases,
      total_sales,
      net_amount,
      transaction_count,
      is_locked,
      created_at,
      updated_at
    ) VALUES (
      ${tenantId},
      ${closeDate},
      ${totalOutflow},
      ${totalSales},
      ${totalSales - totalOutflow},
      ${transactionCount},
      0,
      NOW(),
      NOW()
    )
    ON DUPLICATE KEY UPDATE
      total_purchases = VALUES(total_purchases),
      total_sales = VALUES(total_sales),
      net_amount = VALUES(net_amount),
      transaction_count = VALUES(transaction_count),
      updated_at = NOW()
  `);

  return {
    closeDate,
    totalPurchases,
    totalSales,
    totalExpenses,
    netAmount: totalSales - totalOutflow,
    transactionCount
  };
}

/**
 * 월간 마감 수행
 * 지정된 월의 일일 마감 데이터를 집계하여 월간 마감 데이터 생성
 */
export async function performMonthlyClose(tenantId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  
  // tenant_id 필수 검증
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  
  // 해당 월의 일일 마감 데이터 집계 (tenant 필터 추가)
  // 일일 마감 데이터 + 비용전표 직접 집계
  const result = await db.execute(sql`
    SELECT 
      COALESCE(SUM(total_purchases), 0) as total_purchases,
      COALESCE(SUM(total_sales), 0) as total_sales,
      COALESCE(SUM(transaction_count), 0) as transaction_count
    FROM accounting_daily_close
    WHERE YEAR(close_date) = ${year}
      AND MONTH(close_date) = ${month}
      AND tenant_id = ${tenantId}
  `);

  // 비용전표 월 합계 직접 집계 (확정된 것만)
  const expenseResult = await db.execute(sql`
    SELECT 
      COALESCE(SUM(total_amount), 0) as total_expenses,
      COUNT(*) as expense_count
    FROM expense_vouchers
    WHERE YEAR(expense_date) = ${year}
      AND MONTH(expense_date) = ${month}
      AND tenant_id = ${tenantId}
      AND status = 'posted'
  `);

  const row = result[0] as any;
  const expenseRow = expenseResult[0] as any;
  const totalPurchases = parseFloat(row.total_purchases || "0");
  const totalSales = parseFloat(row.total_sales || "0");
  const totalExpenses = parseFloat(expenseRow?.total_expenses || "0");
  const transactionCount = parseInt(row.transaction_count || "0") + parseInt(expenseRow?.expense_count || "0");

  // 월간 마감 데이터 저장 (비용 포함)
  const totalOutflow = totalPurchases + totalExpenses;
  await db.execute(sql`
    INSERT INTO accounting_monthly_close (
      tenant_id,
      close_year,
      close_month,
      total_purchases,
      total_sales,
      net_amount,
      transaction_count,
      is_locked,
      created_at,
      updated_at
    ) VALUES (
      ${tenantId},
      ${year},
      ${month},
      ${totalOutflow},
      ${totalSales},
      ${totalSales - totalOutflow},
      ${transactionCount},
      0,
      NOW(),
      NOW()
    )
    ON DUPLICATE KEY UPDATE
      total_purchases = VALUES(total_purchases),
      total_sales = VALUES(total_sales),
      net_amount = VALUES(net_amount),
      transaction_count = VALUES(transaction_count),
      updated_at = NOW()
  `);

  return {
    year,
    month,
    totalPurchases,
    totalSales,
    totalExpenses,
    netAmount: totalSales - totalOutflow,
    transactionCount
  };
}

/**
 * 일일 마감 목록 조회
 */
export async function getDailyCloseList(tenantId: number, startDate?: string, endDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  
  // tenant_id 필수 검증
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  
  let query = sql`SELECT * FROM accounting_daily_close WHERE tenant_id = ${tenantId}`;
  
  if (startDate) {
    query = sql`${query} AND close_date >= ${startDate}`;
  }
  
  if (endDate) {
    query = sql`${query} AND close_date <= ${endDate}`;
  }
  
  query = sql`${query} ORDER BY close_date DESC LIMIT 100`;
  
  const result = await db.execute(query);
  return result;
}

/**
 * 월간 마감 목록 조회
 */
export async function getMonthlyCloseList(tenantId: number, year?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  
  // tenant_id 필수 검증
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  
  let query = sql`SELECT * FROM accounting_monthly_close WHERE tenant_id = ${tenantId}`;
  
  if (year) {
    query = sql`${query} AND close_year = ${year}`;
  }
  
  query = sql`${query} ORDER BY close_year DESC, close_month DESC LIMIT 24`;
  
  const result = await db.execute(query);
  return result;
}

/**
 * 마감 잠금 (확정)
 */
export async function lockClose(tenantId: number, type: 'daily' | 'monthly', id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  
  // tenant_id 필수 검증
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  
  const table = type === 'daily' ? 'accounting_daily_close' : 'accounting_monthly_close';
  
  await db.execute(sql`
    UPDATE ${sql.raw(table)}
    SET is_locked = 1, updated_at = NOW()
    WHERE id = ${id} AND tenant_id = ${tenantId}
  `);
  
  return { success: true };
}

/**
 * 마감 잠금 해제
 */
export async function unlockClose(tenantId: number, type: 'daily' | 'monthly', id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");
  
  // tenant_id 필수 검증
  if (!tenantId) {
    throw new Error("tenantId is required");
  }
  
  const table = type === 'daily' ? 'accounting_daily_close' : 'accounting_monthly_close';
  
  await db.execute(sql`
    UPDATE ${sql.raw(table)}
    SET is_locked = 0, updated_at = NOW()
    WHERE id = ${id} AND tenant_id = ${tenantId}
  `);
  
  return { success: true };
}
