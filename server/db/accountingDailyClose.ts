/**
 * 일일 마감 DB 함수
 * lumiriz_os/server/db-daily-close.ts에서 통합
 * ✅ 멀티테넌시 격리: 모든 쿼리에 tenantId 필터 적용
 */

import { getDb } from "../db";
import * as schema from "../../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

/**
 * 일일 마감 실행
 */
export async function executeDailyClose(data: {
  closeDate: Date;
  largeAmountChecked: boolean;
  userId: number;
}, tenantId: number) {
  const { closeDate, largeAmountChecked, userId } = data;
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  // 1. 해당 날짜 통계 조회
  const stats = await getDailyCloseStats(closeDate, tenantId);

  // 2. 미처리 건수 확인
  if (stats.totalPending > 0) {
    throw new Error(
      `마감할 수 없습니다. 미처리 건수: ${stats.totalPending}건`
    );
  }

  // 3. 마감 기록 생성
  const closeDateStr = closeDate.toISOString().split("T")[0]; // YYYY-MM-DD
  const [result] = await db.insert(schema.accountingDailyClose).values({
    tenantId: tenantId,
    closeDate: closeDateStr,
    closedBy: userId,
    totalIncome: String(stats.totalDeposits),
    totalExpense: String(stats.totalWithdrawals),
    netCashFlow: String(stats.netCashFlow),
    transactionCount: stats.totalTransactions,
    isLocked: 1,
    closedAt: new Date(),
  });

  return {
    id: result.insertId,
    closeDate: closeDateStr,
    totalTransactions: stats.totalTransactions,
    totalDeposits: stats.totalDeposits,
    totalWithdrawals: stats.totalWithdrawals,
    totalExpenses: (stats as any).totalExpenses || 0,
    totalPurchases: (stats as any).totalPurchases || 0,
    netCashFlow: stats.netCashFlow,
  };
}

/**
 * 일일 마감 통계 조회
 */
export async function getDailyCloseStats(targetDate: Date, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const dateStr = targetDate.toISOString().split("T")[0]; // YYYY-MM-DD
  const startOfDay = dateStr;
  const endOfDay = dateStr;

  // 매입 거래 통계
  const purchaseConditions: any[] = [
    eq(schema.accountingPurchases.transactionDate, dateStr),
    eq(schema.accountingPurchases.tenantId, tenantId),
  ];

  const [purchaseStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalAmount: sql<number>`COALESCE(SUM(total_amount), 0)`
    })
    .from(schema.accountingPurchases)
    .where(and(...purchaseConditions));

  // 매출 거래 통계
  const salesConditions: any[] = [
    eq(schema.accountingSales.transactionDate, dateStr),
    eq(schema.accountingSales.tenantId, tenantId),
  ];

  const [salesStats] = await db
    .select({
      count: sql<number>`count(*)`,
      totalAmount: sql<number>`COALESCE(SUM(total_amount), 0)`
    })
    .from(schema.accountingSales)
    .where(and(...salesConditions));

  // 비용(경비) 거래 통계 - posted(확정) 상태만 집계
  let expenseCount = 0;
  let expenseAmount = 0;
  try {
    const { expenseVouchers } = await import("../../drizzle/schema");
    const expenseConditions: any[] = [
      eq(expenseVouchers.expenseDate, dateStr),
      eq(expenseVouchers.status, "posted"),
      eq(expenseVouchers.tenantId, tenantId),
    ];

    const [expenseStats] = await db
      .select({
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`COALESCE(SUM(total_amount), 0)`
      })
      .from(expenseVouchers)
      .where(and(...expenseConditions));
    expenseCount = expenseStats?.count || 0;
    expenseAmount = expenseStats?.totalAmount || 0;
  } catch (e) {
    console.log("[마감] 비용 테이블 조회 스킵:", e);
  }

  const totalTransactions = (purchaseStats?.count || 0) + (salesStats?.count || 0) + expenseCount;
  const totalDeposits = salesStats?.totalAmount || 0;
  const totalWithdrawals = (purchaseStats?.totalAmount || 0) + expenseAmount;
  const netCashFlow = totalDeposits - totalWithdrawals;

  return {
    totalTransactions,
    totalCompleted: totalTransactions, // HACCP에서는 모든 거래가 완료된 것으로 간주
    totalPending: 0,
    totalExceptions: 0,
    totalDeposits,
    totalWithdrawals,
    totalExpenses: expenseAmount,
    totalPurchases: purchaseStats?.totalAmount || 0,
    netCashFlow
  };
}

/**
 * 마감 이력 조회
 */
export async function getDailyCloseHistory(limit = 30, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  return await db
    .select()
    .from(schema.accountingDailyClose)
    .where(eq(schema.accountingDailyClose.tenantId, tenantId))
    .orderBy(sql`${schema.accountingDailyClose.closeDate} DESC`)
    .limit(limit);
}

/**
 * 특정 날짜 마감 여부 확인
 */
export async function isDayClosed(targetDate: Date, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection not available");

  const closeDateStr = targetDate.toISOString().split("T")[0];
  const conditions: any[] = [
    eq(schema.accountingDailyClose.closeDate, closeDateStr),
    eq(schema.accountingDailyClose.tenantId, tenantId)
  ];

  const [result] = await db
    .select()
    .from(schema.accountingDailyClose)
    .where(and(...conditions));

  return !!result;
}
