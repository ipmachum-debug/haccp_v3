/**
 * 월간 마감 DB 함수
 * ✅ 멀티테넌시 격리: 모든 쿼리에 tenantId 필터 적용
 */

import { getDb } from "../connection";
import * as schema from "../../../drizzle/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

import { formatLocalDate } from "../../utils/timezone";

/**
 * 특정 월의 일일 마감 데이터 조회
 */
export async function getDailyClosesForMonth(year: number, month: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const startDateObj = new Date(year, month - 1, 1);
  const endDateObj = new Date(year, month, 0);
  const startDate = formatLocalDate(startDateObj);
  const endDate = formatLocalDate(endDateObj);

  const conditions: any[] = [
    gte(schema.accountingDailyClose.closeDate, startDate),
    lte(schema.accountingDailyClose.closeDate, endDate)
  ];
  if (tenantId) conditions.push(eq(schema.accountingDailyClose.tenantId, tenantId));

  return await db
    .select()
    .from(schema.accountingDailyClose)
    .where(and(...conditions))
    .orderBy(schema.accountingDailyClose.closeDate);
}

/**
 * 월 전체 영업일 계산 (주말 제외)
 */
export function getBusinessDaysInMonth(year: number, month: number): string[] {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  const businessDays: string[] = [];

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
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
  closedDates: string[]
): string[] {
  const closedSet = new Set(closedDates);
  return businessDays.filter((date) => !closedSet.has(date));
}

/**
 * 월 집계 요약 생성
 */
export function generateMonthlySummary(
  dailyCloses: Array<{
    closeDate: Date | string;
    totalCount: number;
    completedCount: number;
    exceptionCount: number;
    snapshot: string | null;
  }>
) {
  let totalDeposits = 0;
  let totalWithdrawals = 0;
  let totalTransactions = 0;
  let totalCompleted = 0;
  let totalExceptions = 0;

  for (const close of dailyCloses) {
    totalTransactions += close.totalCount;
    totalCompleted += close.completedCount;
    totalExceptions += close.exceptionCount;

    if (close.snapshot) {
      try {
        const snap = JSON.parse(close.snapshot as string);
        if (typeof snap.totalDeposits === "number") {
          totalDeposits += snap.totalDeposits;
        }
        if (typeof snap.totalWithdrawals === "number") {
          totalWithdrawals += snap.totalWithdrawals;
        }
      } catch (e) {
        // JSON 파싱 실패 시 무시
      }
    }
  }

  const netCashFlow = totalDeposits - totalWithdrawals;

  return {
    totalDeposits,
    totalWithdrawals,
    netCashFlow,
    totalTransactions,
    totalCompleted,
    totalExceptions,
    completionRate:
      totalTransactions > 0 ? (totalCompleted / totalTransactions) * 100 : 0
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

  const conditions: any[] = [
    eq(schema.accountingMonthlyClose.year, year),
    eq(schema.accountingMonthlyClose.month, month)
  ];
  if (tenantId) conditions.push(eq(schema.accountingMonthlyClose.tenantId, tenantId));

  const [existing] = await db
    .select()
    .from(schema.accountingMonthlyClose)
    .where(and(...conditions));

  if (existing) {
    await db
      .update(schema.accountingMonthlyClose)
      .set({
        missingCloseDates: JSON.stringify(missingCloseDates),
        summary: JSON.stringify(summary),
        updatedAt: new Date()
      })
      .where(eq(schema.accountingMonthlyClose.id, existing.id));

    return existing.id;
  } else {
    const [result] = await db.insert(schema.accountingMonthlyClose).values({
      tenantId,
      year,
      month,
      status: "draft",
      missingCloseDates: JSON.stringify(missingCloseDates),
      summary: JSON.stringify(summary)
    });

    return result.insertId;
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

  const conditions: any[] = [
    eq(schema.accountingMonthlyClose.year, year),
    eq(schema.accountingMonthlyClose.month, month)
  ];
  if (tenantId) conditions.push(eq(schema.accountingMonthlyClose.tenantId, tenantId));

  const [existing] = await db
    .select()
    .from(schema.accountingMonthlyClose)
    .where(and(...conditions));

  if (!existing) {
    throw new Error("월 마감 레코드가 존재하지 않습니다. 먼저 generate를 실행하세요.");
  }

  if (existing.status === "closed") {
    throw new Error("이미 확정된 월 마감입니다.");
  }

  let missingDates: string[] = [];
  if (existing.missingCloseDates) {
    try {
      missingDates = JSON.parse(existing.missingCloseDates as string);
    } catch (e) {}
  }

  if (missingDates.length > 0) {
    throw new Error(
      `미마감 날짜가 ${missingDates.length}개 존재합니다: ${missingDates.join(", ")}`
    );
  }

  await db
    .update(schema.accountingMonthlyClose)
    .set({
      status: "closed",
      closedBy: userId,
      closedAt: new Date()
    })
    .where(eq(schema.accountingMonthlyClose.id, existing.id));

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

  const conditions: any[] = [
    eq(schema.accountingMonthlyClose.year, year),
    eq(schema.accountingMonthlyClose.month, month)
  ];
  if (tenantId) conditions.push(eq(schema.accountingMonthlyClose.tenantId, tenantId));

  const [existing] = await db
    .select()
    .from(schema.accountingMonthlyClose)
    .where(and(...conditions));

  if (!existing) {
    throw new Error("월 마감 레코드가 존재하지 않습니다.");
  }

  if (existing.status === "draft") {
    throw new Error("이미 draft 상태입니다.");
  }

  await db
    .update(schema.accountingMonthlyClose)
    .set({
      status: "draft",
      closedBy: null,
      closedAt: null
    })
    .where(eq(schema.accountingMonthlyClose.id, existing.id));

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

  await db.insert(schema.accountingMonthlyCloseAudit).values({
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

  const conditions: any[] = [
    eq(schema.accountingMonthlyClose.year, year),
    eq(schema.accountingMonthlyClose.month, month)
  ];
  if (tenantId) conditions.push(eq(schema.accountingMonthlyClose.tenantId, tenantId));

  const [result] = await db
    .select()
    .from(schema.accountingMonthlyClose)
    .where(and(...conditions));

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

  const conditions: any[] = [
    eq(schema.accountingMonthlyClose.year, year),
    eq(schema.accountingMonthlyClose.month, month)
  ];
  if (tenantId) conditions.push(eq(schema.accountingMonthlyClose.tenantId, tenantId));

  await db
    .update(schema.accountingMonthlyClose)
    .set({ reportPdfUrl: pdfUrl })
    .where(and(...conditions));
}
