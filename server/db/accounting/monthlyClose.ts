import { getDb } from "../connection";
import {
  accountingDailyClose,
  accountingMonthlyClose,
  accountingMonthlyCloseAudit
} from "../../../drizzle/schema/schema_main";
import { eq, and, gte, lte } from "drizzle-orm";

import { toKSTDate, formatLocalDate} from "../../utils/timezone";

/**
 * 월 마감 DB 헬퍼 함수
 */

/**
 * 특정 월의 일일 마감 데이터 조회
 */
export async function getDailyClosesForMonth(year: number, month: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = toKSTDate(new Date(year, month, 0)); // 해당 월의 마지막 날

  return await db
    .select()
    .from(accountingDailyClose)
    .where(
      and(eq(accountingDailyClose.tenantId, tenantId as any) , 
        gte(accountingDailyClose.closeDate, startDate),
        lte(accountingDailyClose.closeDate, endDate)
      ) as any
    )
    .orderBy(accountingDailyClose.closeDate);
}

/**
 * 월 전체 영업일 계산 (주말 제외)
 */
export function getBusinessDaysInMonth(year: number, month: number, tenantId?: number): string[] {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const businessDays: string[] = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      // 주말 제외
      businessDays.push(formatLocalDate(d));
    }
  }

  return businessDays;
}

/**
 * 미마감 날짜 계산
 */
export function getMissingCloseDates(
  businessDays: string[],
  closedDates: string[], tenantId?: number): string[] {
  const closedSet = new Set(closedDates);
  return businessDays.filter((date) => !closedSet.has(date));
}

/**
 * 월 집계 요약 생성
 */
export function generateMonthlySummary(dailyCloses: Array<{
  closeDate: string;
  totalIncome: string;
  totalExpense: string;
  netCashFlow: string;
  transactionCount: number;
}>, tenantId?: number) {
  let totalIncome = 0;
  let totalExpense = 0;
  let totalTransactions = 0;

  for (const close of dailyCloses) {
    totalIncome += parseFloat(close.totalIncome);
    totalExpense += parseFloat(close.totalExpense);
    totalTransactions += close.transactionCount;
  }

  const netCashFlow = totalIncome - totalExpense;

  return {
    totalIncome,
    totalExpense,
    netCashFlow,
    totalTransactions,
    dailyCloseCount: dailyCloses.length
  };
}

/**
 * 월 마감 생성 또는 업데이트 (upsert)
 */
export async function upsertMonthlyClose(params: {
  year: number;
  month: number;
  missingCloseDates: string[];
  summary: Record<string, unknown>;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { year, month, missingCloseDates, summary } = params;

  // 기존 레코드 확인
  const [existing] = await db
    .select()
    .from(accountingMonthlyClose)
    .where(
      and(eq(accountingMonthlyClose.tenantId, tenantId as any) , 
        eq(accountingMonthlyClose.year, year),
        eq(accountingMonthlyClose.month, month)
      ) as any
    );

  if (existing) {
    // 업데이트
    await db
      .update(accountingMonthlyClose)
      .set({
        missingCloseDates,
        summary
      })
      .where(and(eq(accountingMonthlyClose.tenantId, tenantId as any) , eq(accountingMonthlyClose.id, existing.id)) as any);
    return existing.id;
  } else {
    // 생성
    const [result] = await db
      .insert(accountingMonthlyClose)
      .values({
        year,
        month,
        status: "draft",
        missingCloseDates,
        summary
      });

    return Number(result.insertId);
  }
}

/**
 * 월 마감 확정
 */
export async function closeMonthlyClose(params: {
  year: number;
  month: number;
  userId: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { year, month, userId } = params;

  const [existing] = await db
    .select()
    .from(accountingMonthlyClose)
    .where(
      and(eq(accountingMonthlyClose.tenantId, tenantId as any) , 
        eq(accountingMonthlyClose.year, year),
        eq(accountingMonthlyClose.month, month)
      ) as any
    );

  if (!existing) {
    throw new Error("월 마감 레코드가 존재하지 않습니다. 먼저 generate를 실행하세요.");
  }

  if (existing.status === "closed") {
    throw new Error("이미 확정된 월 마감입니다.");
  }

  // 미마감 날짜 검증
  const missingDates = existing.missingCloseDates as string[] | null;
  if (missingDates && missingDates.length > 0) {
    throw new Error(
      `미마감 날짜가 ${missingDates.length}개 존재합니다: ${missingDates.join(", ")}`
    );
  }

  // 확정
  await db
    .update(accountingMonthlyClose)
    .set({
      status: "closed",
      closedBy: userId,
      closedAt: new Date()
    })
    .where(and(eq(accountingMonthlyClose.tenantId, tenantId as any) , eq(accountingMonthlyClose.id, existing.id)) as any);
  return existing.id;
}

/**
 * 월 마감 재오픈
 */
export async function reopenMonthlyClose(params: {
  year: number;
  month: number;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { year, month } = params;

  const [existing] = await db
    .select()
    .from(accountingMonthlyClose)
    .where(
      and(eq(accountingMonthlyClose.tenantId, tenantId as any) , 
        eq(accountingMonthlyClose.year, year),
        eq(accountingMonthlyClose.month, month)
      ) as any
    );

  if (!existing) {
    throw new Error("월 마감 레코드가 존재하지 않습니다.");
  }

  if (existing.status === "draft") {
    throw new Error("이미 draft 상태입니다.");
  }

  // 재오픈
  await db
    .update(accountingMonthlyClose)
    .set({
      status: "draft",
      closedBy: null,
      closedAt: null
    })
    .where(and(eq(accountingMonthlyClose.tenantId, tenantId as any) , eq(accountingMonthlyClose.id, existing.id)) as any);
  return existing.id;
}

/**
 * 월 마감 감사 로그 기록
 */
export async function recordMonthlyCloseAudit(params: {
  monthlyCloseId: number;
  action: "generate" | "close" | "reopen" | "export_pdf";
  actorId: number;
  reason?: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { monthlyCloseId, action, actorId, reason } = params;

  await db.insert(accountingMonthlyCloseAudit).values({
      tenantId,
    monthlyCloseId,
    action,
    actorId,
    reason: reason || null
  });
}

/**
 * 월 마감 조회
 */
export async function getMonthlyClose(year: number, month: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db
    .select()
    .from(accountingMonthlyClose)
    .where(
      and(eq(accountingMonthlyClose.tenantId, tenantId as any) , 
        eq(accountingMonthlyClose.year, year),
        eq(accountingMonthlyClose.month, month)
      ) as any
    );

  return result || null;
}

/**
 * PDF URL 업데이트
 */
export async function updateMonthlyClosePdfUrl(params: {
  year: number;
  month: number;
  pdfUrl: string;
}, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { year, month, pdfUrl } = params;

  await db
    .update(accountingMonthlyClose)
    .set({ reportPdfUrl: pdfUrl })
    .where(
      and(
        eq(accountingMonthlyClose.year, year),
        eq(accountingMonthlyClose.month, month)
      )
    );
}
