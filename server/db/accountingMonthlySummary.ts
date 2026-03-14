import { getDb } from "../db";
import {
  accountingMonthlySummary,
  accountingMonthlyReport,
  accountingHighAmountTransactions,
  accountingDailyClose,
  type NewAccountingMonthlySummary,
  type NewAccountingMonthlyReport,
  type NewAccountingHighAmountTransaction
} from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

/**
 * 월 마감 요약 생성 또는 업데이트
 */
export async function upsertMonthlySummary(data: NewAccountingMonthlySummary, tenantId?: number) {
  const db = await getDb();
  
  // 기존 데이터 확인
  const existing = await db
    .select()
    .from(accountingMonthlySummary)
    .where(
      and(eq(accountingMonthlySummary.tenantId, tenantId as any) , 
        eq(accountingMonthlySummary.year, data.year),
        eq(accountingMonthlySummary.month, data.month)
      ) as any
    )
    .limit(1);

  if (existing.length > 0) {
    // 업데이트
    await db
      .update(accountingMonthlySummary)
      .set({
        ...data
      })
      .where(and(eq(accountingMonthlySummary.tenantId, tenantId as any) , eq(accountingMonthlySummary.id, existing[0].id)) as any);    
    return existing[0].id;
  } else {
    // 생성
    const result = await db.insert(accountingMonthlySummary).values({
      ...data, tenantId } as any);
    return Number(result[0].insertId);
  }
}

/**
 * 월 마감 요약 조회 (연도, 월)
 */
export async function getMonthlySummary(year: number, month: number, tenantId?: number) {
  const db = await getDb();
  
  const result = await db
    .select()
    .from(accountingMonthlySummary)
    .where(
      and(eq(accountingMonthlySummary.tenantId, tenantId as any) , 
        eq(accountingMonthlySummary.year, year),
        eq(accountingMonthlySummary.month, month)
      ) as any
    )
    .limit(1);

  return result[0] || null;
}

/**
 * 월 마감 요약 목록 조회 (최신순)
 */
export async function listMonthlySummaries(limit = 12, tenantId?: number) {
  const db = await getDb();
  
  return db
    .select()
    .from(accountingMonthlySummary).where(eq(accountingMonthlySummary.tenantId, tenantId as any) ).orderBy(desc(accountingMonthlySummary.year), desc(accountingMonthlySummary.month))
    .limit(limit);
}

/**
 * 월 마감 상태 업데이트
 */
export async function updateMonthlySummaryStatus(
  id: number,
  status: "draft" | "confirmed" | "locked",
  userId: number, tenantId?: number) {
  const db = await getDb();
  
  const updateData: any = {
    status
  };

  if (status === "confirmed") {
    updateData.confirmedAt = new Date();
    updateData.confirmedBy = userId;
  } else if (status === "locked") {
    updateData.lockedAt = new Date();
    updateData.lockedBy = userId;
  }

  await db
    .update(accountingMonthlySummary)
    .set(updateData)
    .where(and(eq(accountingMonthlySummary.tenantId, tenantId as any) , eq(accountingMonthlySummary.id, id)) as any);}

/**
 * 일일 마감 데이터 기반 월간 집계 계산
 */
export async function calculateMonthlySummary(year: number, month: number, tenantId?: number) {
  const db = await getDb();
  
  // 해당 월의 시작일과 종료일
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0); // 다음 달 0일 = 이번 달 마지막 날
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  // 일일 마감 데이터 조회
  const dailyCloses = await db
    .select()
    .from(accountingDailyClose)
    .where(
      and(eq(accountingDailyClose.tenantId, tenantId as any) , 
        gte(accountingDailyClose.closeDate, startDateStr),
        lte(accountingDailyClose.closeDate, endDateStr)
      ) as any
    );

  // 집계 계산
  let totalDeposit = 0;
  let totalWithdrawal = 0;
  const closedDates = new Set<number>();
  
  dailyCloses.forEach((close) => {
    totalDeposit += Number(close.totalIncome || 0);
    totalWithdrawal += Number(close.totalExpense || 0);
    
    const day = new Date(close.closeDate).getDate();
    closedDates.add(day);
  });

  const netCashFlow = totalDeposit - totalWithdrawal;
  
  // 해당 월의 총 일수
  const totalDays = endDate.getDate();
  const closedDays = closedDates.size;
  
  // 마감 누락일 계산
  const missingDays: number[] = [];
  for (let day = 1; day <= totalDays; day++) {
    if (!closedDates.has(day)) {
      missingDays.push(day);
    }
  }

  return {
    year,
    month,
    totalDeposit: totalDeposit.toFixed(2),
    totalWithdrawal: totalWithdrawal.toFixed(2),
    netCashFlow: netCashFlow.toFixed(2),
    totalDays,
    closedDays,
    missingDays: JSON.stringify(missingDays),
    dailyCloses, // 고액 거래 추출용
  };
}

/**
 * 고액 거래 추출 및 저장
 */
export async function extractHighAmountTransactions(
  summaryId: number,
  year: number,
  month: number,
  threshold: number = 100000, tenantId?: number) {
  const db = await getDb();
  
  // 고액 거래 추출시작일과 종료일
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  const startDateStr = startDate.toISOString().split('T')[0];
  const endDateStr = endDate.toISOString().split('T')[0];
  
  // 일일 마감 데이터 조회
  const dailyCloses = await db
    .select()
    .from(accountingDailyClose)
    .where(
      and(eq(accountingDailyClose.tenantId, tenantId as any) , 
        gte(accountingDailyClose.closeDate, startDateStr),
        lte(accountingDailyClose.closeDate, endDateStr)
      ) as any
    );

  // 기존 고액 거래 삭제
  await db
    .delete(accountingHighAmountTransactions)
    .where(and(eq(accountingHighAmountTransactions.tenantId, tenantId as any) , eq(accountingHighAmountTransactions.summaryId, summaryId)) as any);
  // 고액 거래 추출
  const highAmountList: NewAccountingHighAmountTransaction[] = [];
  
  dailyCloses.forEach((close) => {
    const deposit = Number(close.totalIncome || 0);
    const withdrawal = Number(close.totalExpense || 0);
    
    if (deposit >= threshold) {
      highAmountList.push({
        tenantId: tenantId!,
        summaryId,
        dailyCloseId: close.id,
        transactionDate: close.closeDate as any,
        transactionType: "deposit",
        amount: deposit.toFixed(2),
        description: `일일 총 입금: ${deposit.toLocaleString()}원`,
        counterparty: null
      });
    }

    if (withdrawal >= threshold) {
      highAmountList.push({
        tenantId: tenantId!,
        summaryId,
        dailyCloseId: close.id,
        transactionDate: close.closeDate as any,
        transactionType: "withdrawal",
        amount: withdrawal.toFixed(2),
        description: `일일 총 출금: ${withdrawal.toLocaleString()}원`,
        counterparty: null
      });
    }
  });

  // 고액 거래 저장
  if (highAmountList.length > 0) {
    await db.insert(accountingHighAmountTransactions).values({
      ...highAmountList[0], tenantId } as any);
  }

  return highAmountList.length;
}

/**
 * 고액 거래 목록 조회
 */
export async function getHighAmountTransactions(summaryId: number, tenantId?: number) {
  const db = await getDb();
  
  return db
    .select()
    .from(accountingHighAmountTransactions)
    .where(and(eq(accountingHighAmountTransactions.tenantId, tenantId as any) , eq(accountingHighAmountTransactions.summaryId, summaryId)) as any)    .orderBy(desc(accountingHighAmountTransactions.transactionDate));
}

/**
 * 월 리포트 PDF 메타데이터 저장
 */
export async function saveMonthlyReport(data: NewAccountingMonthlyReport, tenantId?: number) {
  const db = await getDb();
  
  // 기존 리포트 버전 확인
  const existing = await db
    .select()
    .from(accountingMonthlyReport)
    .where(and(eq(accountingMonthlyReport.tenantId, tenantId as any) , eq(accountingMonthlyReport.summaryId, data.summaryId)) as any)    .orderBy(desc(accountingMonthlyReport.version))
    .limit(1);

  const version = existing.length > 0 ? existing[0].version + 1 : 1;

  const result = await db.insert(accountingMonthlyReport).values({
      tenantId,
    ...data,
    version
  });

  return Number(result[0].insertId);
}

/**
 * 월 리포트 목록 조회
 */
export async function getMonthlyReports(summaryId: number, tenantId?: number) {
  const db = await getDb();
  
  return db
    .select()
    .from(accountingMonthlyReport)
    .where(and(eq(accountingMonthlyReport.tenantId, tenantId as any) , eq(accountingMonthlyReport.summaryId, summaryId)) as any)    .orderBy(desc(accountingMonthlyReport.version));
}

/**
 * 최신 월 리포트 조회
 */
export async function getLatestMonthlyReport(summaryId: number, tenantId?: number) {
  const db = await getDb();
  
  const result = await db
    .select()
    .from(accountingMonthlyReport)
    .where(and(eq(accountingMonthlyReport.tenantId, tenantId as any) , eq(accountingMonthlyReport.summaryId, summaryId)) as any)    .orderBy(desc(accountingMonthlyReport.version))
    .limit(1);

  return result[0] || null;
}
