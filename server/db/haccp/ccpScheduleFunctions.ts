import { getDb } from "../connection";
import { eq, and, gte, lte, sql } from "drizzle-orm";

// ============================================================================
// CCP 점검 일정 관리 (CCP Schedule Management)
// ============================================================================

/**
 * CCP 생성 시 자동으로 점검 일정 생성
 * @param ccpInstanceId CCP 인스턴스 ID
 * @param frequency 점검 주기 (daily, weekly, monthly)
 * @param startDate 시작일
 * @param count 생성할 일정 개수
 */
export async function createCcpSchedules(
  ccpInstanceId: number,
  frequency: "daily" | "weekly" | "monthly",
  startDate: Date,
  count: number = 30
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpSchedules } = await import("../../../drizzle/schema/schema_main");

  const schedules = [];
  let currentDate = new Date(startDate);

  for (let i = 0; i < count; i++) {
    schedules.push({
      ccpInstanceId,
      scheduledDate: new Date(currentDate),
      frequency,
      status: "pending" as const
    });

    // 다음 일정 날짜 계산
    if (frequency === "daily") {
      currentDate.setDate(currentDate.getDate() + 1);
    } else if (frequency === "weekly") {
      currentDate.setDate(currentDate.getDate() + 7);
    } else if (frequency === "monthly") {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
  }

  await db.insert(hCcpSchedules).values(schedules);
  return schedules.length;
}

/**
 * CCP 점검 일정 조회
 * @param filters 필터 조건
 */
export async function getCcpSchedules(filters?: {
  ccpInstanceId?: number;
  status?: "pending" | "completed" | "skipped";
  startDate?: Date;
  endDate?: Date;
  tenantId?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpSchedules, hCcpInstances } = await import("../../../drizzle/schema/schema_main");

  const conditions = [];

  if (filters?.ccpInstanceId) {
    conditions.push(eq(hCcpSchedules.ccpInstanceId, filters.ccpInstanceId));
  }

  if (filters?.status) {
    conditions.push(eq(hCcpSchedules.status, filters.status));
  }

  if (filters?.startDate) {
    conditions.push(gte(hCcpSchedules.scheduledDate, filters.startDate));
  }

  if (filters?.endDate) {
    conditions.push(lte(hCcpSchedules.scheduledDate, filters.endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const schedules = await db
    .select({
      id: hCcpSchedules.id,
      ccpInstanceId: hCcpSchedules.ccpInstanceId,
      scheduledDate: hCcpSchedules.scheduledDate,
      frequency: hCcpSchedules.frequency,
      status: hCcpSchedules.status,
      completedAt: hCcpSchedules.completedAt,
      completedBy: hCcpSchedules.completedBy,
      note: hCcpSchedules.note,
      ccpType: hCcpInstances.ccpType,
      productName: hCcpInstances.productName
    })
    .from(hCcpSchedules)
    .leftJoin(hCcpInstances, eq(hCcpSchedules.ccpInstanceId, hCcpInstances.id))
    .where(whereClause)
    .orderBy(sql`${hCcpSchedules.scheduledDate} ASC`);

  return schedules;
}

/**
 * CCP 점검 완료 처리
 * @param scheduleId 일정 ID
 * @param completedBy 완료자 ID
 * @param note 비고
 */
export async function completeCcpSchedule(
  scheduleId: number,
  completedBy: number,
  note?: string
, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpSchedules } = await import("../../../drizzle/schema/schema_main");

  await db
    .update(hCcpSchedules)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedBy,
      note
    })
    .where(eq(hCcpSchedules.id, scheduleId));
}

/**
 * 오늘 점검 예정인 CCP 일정 조회
 */
export async function getTodayCcpSchedules(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const { hCcpSchedules, hCcpInstances } = await import("../../../drizzle/schema/schema_main");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const schedules = await db
    .select({
      id: hCcpSchedules.id,
      ccpInstanceId: hCcpSchedules.ccpInstanceId,
      scheduledDate: hCcpSchedules.scheduledDate,
      frequency: hCcpSchedules.frequency,
      status: hCcpSchedules.status,
      ccpType: hCcpInstances.ccpType,
      productName: hCcpInstances.productName
    })
    .from(hCcpSchedules)
    .leftJoin(hCcpInstances, eq(hCcpSchedules.ccpInstanceId, hCcpInstances.id))
    .where(
      and(
        eq(hCcpSchedules.status, "pending"),
        sql`DATE(${hCcpSchedules.scheduledDate}) = DATE(${today})`
      )
    )
    .orderBy(sql`${hCcpSchedules.scheduledDate} ASC`);

  return schedules;
}

// CCP 점검 일정 날짜 변경
export async function updateCcpScheduleDate(scheduleId: number, newDate: Date, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const { hCcpSchedules } = await import("../../../drizzle/schema");

  await db
    .update(hCcpSchedules)
    .set({ scheduledDate: newDate })
    .where(eq(hCcpSchedules.id, scheduleId));
}
