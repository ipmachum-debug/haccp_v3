import { eq, and, desc, gte, lte, or } from "drizzle-orm";
import { getDb } from "../db";
import {
  hTrainingCourses,
  hTrainingSchedules,
  hTrainingParticipants,
  hTrainingReminders
} from "../../drizzle/schema";

/**
 * 교육 훈련 관리 DB 헬퍼 함수
 * tenantId 필터링 적용
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
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(hTrainingCourses).values(data);
  return result.insertId;
}

export async function getTrainingCourseById(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [eq(hTrainingCourses.id, id)];
  if (tenantId) {
    conditions.push(eq(hTrainingCourses.tenantId, tenantId));
  }

  const [result] = await db
    .select()
    .from(hTrainingCourses)
    .where(and(...conditions));

  return result;
}

export async function getAllTrainingCourses(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

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
  if (!db) throw new Error("Database not available");

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
  if (!db) throw new Error("Database not available");

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
  tenantId?: number
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [eq(hTrainingCourses.id, id)];
  if (tenantId) {
    conditions.push(eq(hTrainingCourses.tenantId, tenantId));
  }

  await db
    .update(hTrainingCourses)
    .set(data)
    .where(and(...conditions));
}

export async function deleteTrainingCourse(id: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [eq(hTrainingCourses.id, id)];
  if (tenantId) {
    conditions.push(eq(hTrainingCourses.tenantId, tenantId));
  }

  await db
    .update(hTrainingCourses)
    .set({ status: "archived" })
    .where(and(...conditions));
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
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(hTrainingSchedules).values({
    ...data,
    scheduledDate: new Date(data.scheduledDate)
  });

  return result.insertId;
}

export async function getTrainingScheduleById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db
    .select()
    .from(hTrainingSchedules)
    .where(eq(hTrainingSchedules.id, id));

  return result;
}

export async function getTrainingSchedulesByCourse(courseId: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conditions: any[] = [eq(hTrainingSchedules.courseId, courseId)];
  if (tenantId) {
    conditions.push(eq(hTrainingSchedules.tenantId, tenantId));
  }

  return db
    .select()
    .from(hTrainingSchedules)
    .where(and(...conditions))
    .orderBy(desc(hTrainingSchedules.scheduledDate));
}

export async function getUpcomingTrainingSchedules(siteId?: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const conditions: any[] = [
    gte(hTrainingSchedules.scheduledDate, today),
    eq(hTrainingSchedules.status, "scheduled")
  ];

  if (tenantId) {
    conditions.push(eq(hTrainingSchedules.tenantId, tenantId));
  }
  if (siteId) {
    conditions.push(eq(hTrainingSchedules.siteId, siteId));
  }

  return db
    .select()
    .from(hTrainingSchedules)
    .where(and(...conditions))
    .orderBy(hTrainingSchedules.scheduledDate);
}

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
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { ...data };
  if (data.scheduledDate) updateData.scheduledDate = new Date(data.scheduledDate);

  await db
    .update(hTrainingSchedules)
    .set(updateData)
    .where(eq(hTrainingSchedules.id, id));
}

export async function deleteTrainingSchedule(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(hTrainingSchedules)
    .where(eq(hTrainingSchedules.id, id));
}

// ============================================================================
// 교육 참가자 (Training Participants)
// ============================================================================

export async function registerTrainingParticipant(data: {
  scheduleId: number;
  userId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(hTrainingParticipants).values(data);

  // 등록 인원 증가
  const schedule = await getTrainingScheduleById(data.scheduleId);
  await updateTrainingSchedule(data.scheduleId, {
    registeredCount: (schedule.registeredCount || 0) + 1
  });

  return result.insertId;
}

export async function getTrainingParticipantById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db
    .select()
    .from(hTrainingParticipants)
    .where(eq(hTrainingParticipants.id, id));

  return result;
}

export async function getTrainingParticipantsBySchedule(scheduleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(hTrainingParticipants)
    .where(eq(hTrainingParticipants.scheduleId, scheduleId));
}

export async function getTrainingParticipantsByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(hTrainingParticipants)
    .where(eq(hTrainingParticipants.userId, userId))
    .orderBy(desc(hTrainingParticipants.createdAt));
}

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
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = { ...data };
  if (data.expiryDate) updateData.expiryDate = new Date(data.expiryDate);

  await db
    .update(hTrainingParticipants)
    .set(updateData)
    .where(eq(hTrainingParticipants.id, id));
}

export async function deleteTrainingParticipant(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const participant = await getTrainingParticipantById(id);
  
  await db
    .delete(hTrainingParticipants)
    .where(eq(hTrainingParticipants.id, id));

  // 등록 인원 감소
  const schedule = await getTrainingScheduleById(participant.scheduleId);
  await updateTrainingSchedule(participant.scheduleId, {
    registeredCount: Math.max(0, (schedule.registeredCount || 0) - 1)
  });
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
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(hTrainingReminders).values({
    ...data,
    reminderDate: new Date(data.reminderDate),
    expiryDate: new Date(data.expiryDate)
  });

  return result.insertId;
}

export async function getTrainingRemindersByUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

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

export async function getPendingTrainingReminders() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

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

export async function markTrainingReminderAsSent(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(hTrainingReminders)
    .set({ sent: 1, sentAt: new Date() })
    .where(eq(hTrainingReminders.id, id));
}

// ============================================================================
// 교육 이수 증명서 발급
// ============================================================================

export async function issueCertificate(participantId: number, certificateUrl: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const participant = await getTrainingParticipantById(participantId);
  const certificateNumber = `CERT-${Date.now()}-${participantId}`;

  const course = await getTrainingCourseById(participant.scheduleId);
  let expiryDate: Date | undefined;
  
  if (course && course.validityPeriod) {
    expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + course.validityPeriod);
  }

  await updateTrainingParticipant(participantId, {
    certificateIssued: 1,
    certificateNumber,
    certificateUrl,
    expiryDate: expiryDate?.toISOString().split("T")[0]
  });

  return { certificateNumber, expiryDate };
}
