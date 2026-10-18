import { eq, and, desc, gte, lte, or } from "drizzle-orm";
import { getDb, getRawConnection } from "../connection";
import { formatLocalDate } from "../../utils/timezone";

import {
  hTrainingCourses,
  hTrainingSchedules,
  hTrainingParticipants,
  hTrainingReminders
} from "../../../drizzle/schema";

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
  /** 구성원 (교육 대상 명단) — 있으면 이 기준 */
  employeeId?: number;
  /** 구성원 없이 계정만 (본인 등록 등 이전 방식) */
  userId?: number;
}, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 스케줄이 현재 테넌트 소속인지 검증
  const schedule = await getTrainingScheduleById(data.scheduleId, tenantId);
  if (!schedule) {
    throw new Error("교육 일정을 찾을 수 없습니다. (테넌트 소속 아님)");
  }
  const conn = await getRawConnection();
  // 참가자 = 구성원 명단 (EDU-06). 로그인 계정이 연결된 구성원이면 계정도 함께 남긴다.
  let employeeId: number | null = null;
  let userId: number | null = null;
  if (data.employeeId) {
    const [es]: any = await conn.execute(
      `SELECT id, user_id FROM h_employees WHERE id = ? AND tenant_id = ? AND is_active = 1 LIMIT 1`,
      [data.employeeId, tenantId],
    );
    const e = (es as any[])[0];
    if (!e) throw new Error("이 회사 구성원이 아니거나 비활성 구성원입니다.");
    employeeId = Number(e.id);
    userId = e.user_id != null ? Number(e.user_id) : null;
  } else if (data.userId) {
    const [us]: any = await conn.execute(`SELECT id FROM users WHERE id = ? AND tenant_id = ? LIMIT 1`, [data.userId, tenantId]);
    if (!(us as any[]).length) throw new Error("이 회사 사용자가 아닙니다.");
    userId = data.userId;
    const [es]: any = await conn.execute(`SELECT id FROM h_employees WHERE user_id = ? AND tenant_id = ? LIMIT 1`, [userId, tenantId]);
    if ((es as any[])[0]) employeeId = Number((es as any[])[0].id);
  } else {
    throw new Error("참가자(구성원)를 선택하세요.");
  }
  // 중복 — 같은 구성원 또는 같은 계정
  const [dup]: any = await conn.execute(
    `SELECT id FROM h_training_participants
      WHERE schedule_id = ? AND tenant_id = ? AND ((? IS NOT NULL AND employee_id = ?) OR (? IS NOT NULL AND user_id = ?)) LIMIT 1`,
    [data.scheduleId, tenantId, employeeId, employeeId, userId, userId],
  );
  if ((dup as any[]).length) throw new Error("이미 이 교육 일정에 등록된 참가자입니다.");
  const [[cnt]]: any = await conn.execute(
    `SELECT COUNT(*) AS n FROM h_training_participants WHERE schedule_id = ? AND tenant_id = ?`,
    [data.scheduleId, tenantId],
  );
  if (schedule.maxParticipants && Number(cnt.n) >= schedule.maxParticipants) {
    throw new Error(`정원(${schedule.maxParticipants}명)이 찼습니다.`);
  }

  const [result] = await db.insert(hTrainingParticipants).values({ scheduleId: data.scheduleId, employeeId, userId, tenantId } as any);

  // 등록 인원 = 실제 참가자 수
  await updateTrainingSchedule(data.scheduleId, { registeredCount: Number(cnt.n) + 1 }, tenantId);

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
export async function issueCertificate(participantId: number, certificateUrl: string | undefined, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const participant = await getTrainingParticipantById(participantId, tenantId);
  if (!participant) {
    throw new Error("참가자 정보를 찾을 수 없습니다. (테넌트 소속 아님)");
  }
  // 과정은 일정을 거쳐 찾는다 (이전: 일정 번호를 과정 번호로 조회 — 엉뚱한 과정의 유효기간으로 만료일 계산)
  const schedule = await getTrainingScheduleById(participant.scheduleId, tenantId);
  const course = schedule ? await getTrainingCourseById(schedule.courseId, tenantId) : null;
  const { certificateBlockers, expiryFromTrainingDate } = await import("../../lib/training/trainingParticipantPolicy");
  const blockers = certificateBlockers(participant as any, course as any);
  if (blockers.length) throw new Error(`수료증을 발급할 수 없습니다 — ${blockers.join(" / ")}`);

  const certificateNumber = `CERT-${Date.now()}-${participantId}`;
  // 재교육 기한 = 교육일 + 유효기간 (발급일 기준 아님)
  const trainingDate = schedule?.scheduledDate
    ? (schedule.scheduledDate instanceof Date ? formatLocalDate(schedule.scheduledDate) : String(schedule.scheduledDate).slice(0, 10))
    : formatLocalDate(new Date());
  const expiryDate = expiryFromTrainingDate(trainingDate, course?.validityPeriod ?? null);

  await updateTrainingParticipant(participantId, {
    certificateIssued: 1,
    certificateNumber,
    certificateUrl: certificateUrl || undefined,
    expiryDate: expiryDate ?? undefined,
  }, tenantId);

  return { certificateNumber, expiryDate };
}

/** 평가 점수 등록 — 출석한 참가자만, 합격 여부는 과정 합격 점수로 서버가 판정 */
export async function recordTrainingAssessment(participantId: number, score: number, tenantId: number) {
  const participant = await getTrainingParticipantById(participantId, tenantId);
  if (!participant) throw new Error("참가자 정보를 찾을 수 없습니다. (테넌트 소속 아님)");
  if (participant.attendanceStatus !== "attended") throw new Error("출석 처리된 참가자만 평가 점수를 등록할 수 있습니다.");
  if (!Number.isFinite(score) || score < 0 || score > 100) throw new Error("평가 점수는 0~100 사이로 입력하세요.");
  const schedule = await getTrainingScheduleById(participant.scheduleId, tenantId);
  const course = schedule ? await getTrainingCourseById(schedule.courseId, tenantId) : null;
  const { decidePassed } = await import("../../lib/training/trainingParticipantPolicy");
  const passed = decidePassed(score, course?.passingScore);
  await updateTrainingParticipant(participantId, { assessmentScore: score, ...(passed == null ? {} : { passed }) }, tenantId);
  return { passed };
}

/** 회사의 교육 일정 전체 (최근 순) — 지난·진행 중 일정도 관리할 수 있게 */
export async function getAllTrainingSchedules(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  return db
    .select()
    .from(hTrainingSchedules)
    .where(eq(hTrainingSchedules.tenantId, tenantId))
    .orderBy(desc(hTrainingSchedules.scheduledDate))
    .limit(300);
}

/** 참가자 목록 — 이름·과정·교육일 포함 (일정 지정 시 그 일정만) */
export async function getTrainingParticipantsDetailed(tenantId: number, scheduleId?: number) {
  const conn = await getRawConnection();
  const [rows]: any = await conn.execute(
    `SELECT tp.id, tp.schedule_id AS scheduleId, tp.user_id AS userId, tp.employee_id AS employeeId,
            COALESCE(e.name, u.name) AS userName, e.employee_code AS employeeCode,
            tp.attendance_status AS attendanceStatus, tp.assessment_score AS assessmentScore, tp.passed,
            tp.certificate_issued AS certificateIssued, tp.certificate_number AS certificateNumber,
            DATE_FORMAT(tp.expiry_date, '%Y-%m-%d') AS expiryDate,
            DATE_FORMAT(s.scheduled_date, '%Y-%m-%d') AS scheduledDate, s.course_id AS courseId,
            c.course_name AS courseName, c.passing_score AS passingScore
       FROM h_training_participants tp
       JOIN h_training_schedules s ON s.id = tp.schedule_id AND s.tenant_id = tp.tenant_id
       LEFT JOIN h_training_courses c ON c.id = s.course_id AND c.tenant_id = s.tenant_id
       LEFT JOIN users u ON u.id = tp.user_id AND u.tenant_id = tp.tenant_id
       LEFT JOIN h_employees e ON e.id = tp.employee_id AND e.tenant_id = tp.tenant_id
      WHERE tp.tenant_id = ?${scheduleId ? " AND tp.schedule_id = ?" : ""}
      ORDER BY s.scheduled_date DESC, tp.id`,
    scheduleId ? [tenantId, scheduleId] : [tenantId],
  );
  return rows as Array<{
    id: number; scheduleId: number; userId: number | null; employeeId: number | null; employeeCode: string | null; userName: string | null; attendanceStatus: string | null;
    assessmentScore: string | null; passed: number | null; certificateIssued: number | null; certificateNumber: string | null;
    expiryDate: string | null; scheduledDate: string | null; courseId: number; courseName: string | null; passingScore: string | null;
  }>;
}

/** 참가자로 고를 수 있는 이 회사 구성원 (구성원 관리 명단, 활성) — 로그인 계정이 없어도 된다 (EDU-06) */
export async function getTrainingMemberOptions(tenantId: number) {
  const conn = await getRawConnection();
  const [rows]: any = await conn.execute(
    `SELECT e.id, e.name, e.employee_code AS employeeCode, e.user_id AS userId
       FROM h_employees e WHERE e.tenant_id = ? AND e.is_active = 1 ORDER BY e.name, e.id`,
    [tenantId],
  );
  return rows as Array<{ id: number; name: string; employeeCode: string | null; userId: number | null }>;
}
