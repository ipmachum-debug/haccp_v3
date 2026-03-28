import { eq, and, desc, gte, lte, or } from "drizzle-orm";
import { getDb } from "../db";
import { formatLocalDate } from "../utils/timezone";

import {
  hTrainingCourses,
  hTrainingSchedules,
  hTrainingParticipants,
  hTrainingReminders
} from "../../drizzle/schema";

/**
 * 교육 훈련 관리 DB 헬퍼 함수
 * ✅ P0 FIX: 모든 함수에 tenantId 필수 적용 (fallback 제거)
 */

// ============================================================================
// 교육 과정 (Training Courses)
// ============================================================================

export async function createTrainingCourse(data: {
  courseCode: string;
  courseName: string;
  category: "haccp_basic" | "haccp_advanced" | "hygiene" | "safety" | "quality" | "equipment" | "regulation" | "other";
  description?: string;
  objectives?: string;
  duration: number;
  isMandatory?: number;
  targetRoles?: string;
  validityPeriod?: number;
  materials?: string;
  hasAssessment?: number;
  passingScore?: string;
  createdBy: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db.insert(hTrainingCourses).values(data);
  return result.insertId;
}

// ✅ P0 FIX: tenantId 필수 (optional 제거)
export async function getTrainingCourseById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db
    .select()
    .from(hTrainingCourses)
    .where(and(eq(hTrainingCourses.id, id), eq(hTrainingCourses.tenantId, tenantId)));

  return result;
}

export async function getAllTrainingCourses(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return db
    .select()
    .from(hTrainingCourses)
    .where(and(
      eq(hTrainingCourses.tenantId, tenantId),
      eq(hTrainingCourses.status, "active")
    ))
    .orderBy(desc(hTrainingCourses.createdAt));
}

export async function getTrainingCoursesByCategory(
  category: "haccp_basic" | "haccp_advanced" | "hygiene" | "safety" | "quality" | "equipment" | "regulation" | "other",
  tenantId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return db
    .select()
    .from(hTrainingCourses)
    .where(
      and(
        eq(hTrainingCourses.tenantId, tenantId),
        eq(hTrainingCourses.category, category),
        eq(hTrainingCourses.status, "active")
      )
    )
    .orderBy(desc(hTrainingCourses.createdAt));
}

export async function getMandatoryTrainingCourses(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return db
    .select()
    .from(hTrainingCourses)
    .where(
      and(
        eq(hTrainingCourses.tenantId, tenantId),
        eq(hTrainingCourses.isMandatory, 1),
        eq(hTrainingCourses.status, "active")
      )
    );
}

// ✅ P0 FIX: tenantId 필수 (optional 제거)
export async function updateTrainingCourse(
  id: number,
  data: {
    courseName?: string;
    category?: "haccp_basic" | "haccp_advanced" | "hygiene" | "safety" | "quality" | "equipment" | "regulation" | "other";
    description?: string;
    objectives?: string;
    duration?: number;
    isMandatory?: number;
    targetRoles?: string;
    validityPeriod?: number;
    materials?: string;
    hasAssessment?: number;
    passingScore?: string;
    status?: "active" | "inactive" | "archived";
  },
  tenantId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .update(hTrainingCourses)
    .set(data)
    .where(and(eq(hTrainingCourses.id, id), eq(hTrainingCourses.tenantId, tenantId)));
}

// ✅ P0 FIX: tenantId 필수 (optional 제거) + tenant 필터 적용
export async function deleteTrainingCourse(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .update(hTrainingCourses)
    .set({ status: "archived" })
    .where(and(eq(hTrainingCourses.id, id), eq(hTrainingCourses.tenantId, tenantId)));
}

// ============================================================================
// 교육 일정 (Training Schedules)
// ============================================================================

export async function createTrainingSchedule(data: {
  courseId: number;
  siteId: number;
  scheduledDate: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  trainerId?: number;
  trainerName?: string;
  maxParticipants?: number;
  notes?: string;
  createdBy: number;
  tenantId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db.insert(hTrainingSchedules).values({
    ...data,
    scheduledDate: new Date(data.scheduledDate)
  });

  return result.insertId;
}

// ✅ P0 FIX: tenantId 필수 추가
export async function getTrainingScheduleById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db
    .select()
    .from(hTrainingSchedules)
    .where(and(eq(hTrainingSchedules.id, id), eq(hTrainingSchedules.tenantId, tenantId)));

  return result;
}

// ✅ P0 FIX: tenantId 필수
export async function getTrainingSchedulesByCourse(courseId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return db
    .select()
    .from(hTrainingSchedules)
    .where(and(
      eq(hTrainingSchedules.courseId, courseId),
      eq(hTrainingSchedules.tenantId, tenantId)
    ))
    .orderBy(desc(hTrainingSchedules.scheduledDate));
}

// ✅ P0 FIX: tenantId 필수
export async function getUpcomingTrainingSchedules(siteId: number | undefined, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const conditions: any[] = [
    gte(hTrainingSchedules.scheduledDate, today),
    eq(hTrainingSchedules.status, "scheduled"),
    eq(hTrainingSchedules.tenantId, tenantId)
  ];

  if (siteId) {
    conditions.push(eq(hTrainingSchedules.siteId, siteId));
  }

  return db
    .select()
    .from(hTrainingSchedules)
    .where(and(...conditions))
    .orderBy(hTrainingSchedules.scheduledDate);
}

// ✅ P0 FIX: tenantId 필수 추가
export async function updateTrainingSchedule(
  id: number,
  data: {
    scheduledDate?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
    trainerId?: number;
    trainerName?: string;
    maxParticipants?: number;
    registeredCount?: number;
    status?: "scheduled" | "in_progress" | "completed" | "cancelled";
    notes?: string;
  },
  tenantId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const updateData: any = { ...data };
  if (data.scheduledDate) updateData.scheduledDate = new Date(data.scheduledDate);

  await db
    .update(hTrainingSchedules)
    .set(updateData)
    .where(and(eq(hTrainingSchedules.id, id), eq(hTrainingSchedules.tenantId, tenantId)));
}

// ✅ P0 FIX: tenantId 필수 추가
export async function deleteTrainingSchedule(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .delete(hTrainingSchedules)
    .where(and(eq(hTrainingSchedules.id, id), eq(hTrainingSchedules.tenantId, tenantId)));
}

// ============================================================================
// 교육 참가자 (Training Participants)
// ============================================================================

// ✅ P0 FIX: tenantId 추가 (참가자 등록 시 스케줄 소속 검증)
export async function registerTrainingParticipant(data: {
  scheduleId: number;
  userId: number;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 스케줄이 현재 테넌트 소속인지 검증
  const schedule = await getTrainingScheduleById(data.scheduleId, tenantId);
  if (!schedule) {
    throw new Error("교육 일정을 찾을 수 없습니다. (테넌트 소속 아님)");
  }

  const [result] = await db.insert(hTrainingParticipants).values(data as any);

  // 등록 인원 증가
  await updateTrainingSchedule(data.scheduleId, {
    registeredCount: (schedule.registeredCount || 0) + 1
  }, tenantId);

  return result.insertId;
}

// ✅ P0 FIX: 참가자 조회 시 테넌트 소속 검증 (JOIN 기반)
export async function getTrainingParticipantById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 참가자 → 스케줄 → 테넌트 경로로 소속 검증
  const results = await db
    .select()
    .from(hTrainingParticipants)
    .innerJoin(hTrainingSchedules, eq(hTrainingParticipants.scheduleId, hTrainingSchedules.id))
    .where(and(
      eq(hTrainingParticipants.id, id),
      eq(hTrainingSchedules.tenantId, tenantId)
    ));

  if (results.length === 0) return null;
  return results[0].h_training_participants;
}

// ✅ P0 FIX: 스케줄별 참가자 조회 시 테넌트 검증
export async function getTrainingParticipantsBySchedule(scheduleId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 스케줄 소속 먼저 검증
  const schedule = await getTrainingScheduleById(scheduleId, tenantId);
  if (!schedule) {
    throw new Error("교육 일정을 찾을 수 없습니다. (테넌트 소속 아님)");
  }

  return db
    .select()
    .from(hTrainingParticipants)
    .where(eq(hTrainingParticipants.scheduleId, scheduleId));
}

// ✅ P0 FIX: 사용자별 참가 이력 조회 시 테넌트 필터
export async function getTrainingParticipantsByUser(userId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 테넌트 소속 스케줄과 JOIN하여 필터
  const results = await db
    .select()
    .from(hTrainingParticipants)
    .innerJoin(hTrainingSchedules, eq(hTrainingParticipants.scheduleId, hTrainingSchedules.id))
    .where(and(
      eq(hTrainingParticipants.userId, userId),
      eq(hTrainingSchedules.tenantId, tenantId)
    ))
    .orderBy(desc(hTrainingParticipants.createdAt));

  return results.map(r => r.h_training_participants);
}

// ✅ P0 FIX: tenantId 필수 추가
export async function updateTrainingParticipant(
  id: number,
  data: {
    attendanceStatus?: "registered" | "attended" | "absent" | "excused";
    assessmentScore?: number;
    passed?: number;
    certificateIssued?: number;
    certificateNumber?: string;
    certificateUrl?: string;
    expiryDate?: string;
    notes?: string;
  },
  tenantId: number
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 참가자 소속 검증
  const participant = await getTrainingParticipantById(id, tenantId);
  if (!participant) {
    throw new Error("참가자 정보를 찾을 수 없습니다. (테넌트 소속 아님)");
  }

  const updateData: any = { ...data };
  if (data.expiryDate) updateData.expiryDate = new Date(data.expiryDate);

  await db
    .update(hTrainingParticipants)
    .set(updateData)
    .where(eq(hTrainingParticipants.id, id));
}

// ✅ P0 FIX: tenantId 필수 추가
export async function deleteTrainingParticipant(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const participant = await getTrainingParticipantById(id, tenantId);
  if (!participant) {
    throw new Error("참가자 정보를 찾을 수 없습니다. (테넌트 소속 아님)");
  }

  await db
    .delete(hTrainingParticipants)
    .where(eq(hTrainingParticipants.id, id));

  // 등록 인원 감소
  const schedule = await getTrainingScheduleById(participant.scheduleId, tenantId);
  if (schedule) {
    await updateTrainingSchedule(participant.scheduleId, {
      registeredCount: Math.max(0, (schedule.registeredCount || 0) - 1)
    }, tenantId);
  }
}

// ============================================================================
// 교육 만료 알림 (Training Reminders)
// ============================================================================

export async function createTrainingReminder(data: {
  participantId: number;
  userId: number;
  courseId: number;
  reminderType: "upcoming" | "expiring" | "expired";
  reminderDate: string;
  expiryDate: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result] = await db.insert(hTrainingReminders).values({
    ...data,
    reminderDate: new Date(data.reminderDate),
    expiryDate: new Date(data.expiryDate)
  } as any);

  return result.insertId;
}

// ✅ P0 FIX: tenantId 추가하여 필터 (알림 → 참가자 → 스케줄 → 테넌트)
export async function getTrainingRemindersByUser(userId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // tenantId가 제공되면 테넌트 소속 알림만 반환
  if (tenantId) {
    const results = await db
      .select()
      .from(hTrainingReminders)
      .innerJoin(hTrainingParticipants, eq(hTrainingReminders.participantId, hTrainingParticipants.id))
      .innerJoin(hTrainingSchedules, eq(hTrainingParticipants.scheduleId, hTrainingSchedules.id))
      .where(
        and(
          eq(hTrainingReminders.userId, userId),
          eq(hTrainingReminders.sent, 0),
          eq(hTrainingSchedules.tenantId, tenantId)
        )
      )
      .orderBy(hTrainingReminders.reminderDate);
    return results.map(r => r.h_training_reminders);
  }

  // tenantId 미제공 (시스템 배치 작업용 - 사용자별 필터만)
  return db
    .select()
    .from(hTrainingReminders)
    .where(
      and(
        eq(hTrainingReminders.userId, userId),
        eq(hTrainingReminders.sent, 0)
      )
    )
    .orderBy(hTrainingReminders.reminderDate);
}

// ✅ P0 FIX: tenantId 필터 추가 (시스템 배치 작업은 전체 반환)
export async function getPendingTrainingReminders(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (tenantId) {
    const results = await db
      .select()
      .from(hTrainingReminders)
      .innerJoin(hTrainingParticipants, eq(hTrainingReminders.participantId, hTrainingParticipants.id))
      .innerJoin(hTrainingSchedules, eq(hTrainingParticipants.scheduleId, hTrainingSchedules.id))
      .where(
        and(
          lte(hTrainingReminders.reminderDate, today),
          eq(hTrainingReminders.sent, 0),
          eq(hTrainingSchedules.tenantId, tenantId)
        )
      );
    return results.map(r => r.h_training_reminders);
  }

  return db
    .select()
    .from(hTrainingReminders)
    .where(
      and(
        lte(hTrainingReminders.reminderDate, today),
        eq(hTrainingReminders.sent, 0)
      )
    );
}

export async function markTrainingReminderAsSent(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .update(hTrainingReminders)
    .set({ sent: 1, sentAt: new Date() })
    .where(and(eq(hTrainingReminders.tenantId, tenantId as any), eq(hTrainingReminders.id, id)) as any);
}

// ============================================================================
// 교육 이수 증명서 발급
// ============================================================================

// ✅ P0 FIX: tenantId 필수 추가
export async function issueCertificate(participantId: number, certificateUrl: string, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const participant = await getTrainingParticipantById(participantId, tenantId);
  if (!participant) {
    throw new Error("참가자 정보를 찾을 수 없습니다. (테넌트 소속 아님)");
  }

  const certificateNumber = `CERT-${Date.now()}-${participantId}`;

  const course = await getTrainingCourseById(participant.scheduleId, tenantId);
  let expiryDate: Date | undefined;
  
  if (course && course.validityPeriod) {
    expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + course.validityPeriod);
  }

  await updateTrainingParticipant(participantId, {
    certificateIssued: 1,
    certificateNumber,
    certificateUrl,
    expiryDate: expiryDate ? formatLocalDate(expiryDate) : undefined
  }, tenantId);

  return { certificateNumber, expiryDate };
}
