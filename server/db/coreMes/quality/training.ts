/**
 * Training DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-3)
 *
 * lifecycle (canTransition):
 *   planned → scheduled → in_progress → completed → archived
 *                                                    ↑
 *                                            cancelled (어느 단계든)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hTrainings } from "../../../../drizzle/schema/coreMes/quality/training";
import {
  type Training,
  type TrainingStatus,
  type TrainingType,
  type TrainingAttendee,
  type TrainingMaterial,
  type AttendanceStatus,
  type IndustryContext,
  canTransition,
} from "../../../core-mes/quality/training";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateTrainingCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `TR-${year}-`;
  const rows = await db
    .select({ code: hTrainings.code })
    .from(hTrainings)
    .where(
      and(
        eq(hTrainings.tenantId, tenantId),
        sql`${hTrainings.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hTrainings.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^TR-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateTrainingInput = {
  tenantId: number;
  industry: IndustryContext;
  type: TrainingType;
  title: string;
  subject: string;
  description: string;
  trainerName: string;
  trainerType: "internal" | "external";
  trainerUserId?: number | null;
  scheduledDate: string;
  durationMinutes?: number;
  materials?: TrainingMaterial[];
  industryMetadata?: Record<string, unknown> | null;
};

export async function createTraining(
  input: CreateTrainingInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const code = await generateTrainingCode(input.tenantId);

  const result = await db.insert(hTrainings).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    type: input.type,
    title: input.title,
    subject: input.subject,
    description: input.description,
    trainerName: input.trainerName,
    trainerType: input.trainerType,
    trainerUserId: input.trainerUserId ?? null,
    scheduledDate: input.scheduledDate,
    durationMinutes: input.durationMinutes ?? 60,
    attendees: [],
    materials: input.materials ?? [],
    status: "planned",
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId =
    (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listTrainings(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: TrainingStatus;
    type?: TrainingType;
    trainerUserId?: number;
    limit?: number;
    offset?: number;
  },
): Promise<Training[]> {
  const db = await getDb();
  if (!db) return [];

  const conds = [
    eq(hTrainings.tenantId, tenantId),
    eq(hTrainings.industry, industry),
  ];
  if (options?.status) conds.push(eq(hTrainings.status, options.status));
  if (options?.type) conds.push(eq(hTrainings.type, options.type));
  if (options?.trainerUserId)
    conds.push(eq(hTrainings.trainerUserId, options.trainerUserId));

  const rows = await db
    .select()
    .from(hTrainings)
    .where(and(...conds))
    .orderBy(desc(hTrainings.scheduledDate), desc(hTrainings.id))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getTrainingById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<Training | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hTrainings)
    .where(
      and(
        eq(hTrainings.id, id),
        eq(hTrainings.tenantId, tenantId),
        eq(hTrainings.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 ────────────────────────────────────────────

/** 실시일 입력 (in_progress 진입 시 권장). */
export async function setTrainingActualDate(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  actualDate: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getTrainingById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Training 미존재 (id=${args.id})`);
  if (current.status === "archived" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 변경 불가 (status=${current.status})`);
  }
  await db
    .update(hTrainings)
    .set({ actualDate: args.actualDate })
    .where(
      and(
        eq(hTrainings.id, args.id),
        eq(hTrainings.tenantId, args.tenantId),
        eq(hTrainings.industry, args.industry),
      ),
    );
}

/** 이수자 추가/수정 — 동일 userId 있으면 갱신, 없으면 추가. */
export async function upsertTrainingAttendee(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  attendee: TrainingAttendee;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getTrainingById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Training 미존재 (id=${args.id})`);
  if (current.status === "archived" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 이수자 변경 불가 (status=${current.status})`);
  }

  const existing = current.attendees.find(
    (a) => a.userId === args.attendee.userId,
  );
  const updated: TrainingAttendee[] = existing
    ? current.attendees.map((a) =>
        a.userId === args.attendee.userId ? args.attendee : a,
      )
    : [...current.attendees, args.attendee];

  await db
    .update(hTrainings)
    .set({ attendees: updated })
    .where(
      and(
        eq(hTrainings.id, args.id),
        eq(hTrainings.tenantId, args.tenantId),
        eq(hTrainings.industry, args.industry),
      ),
    );
}

/** 이수자 제거. */
export async function removeTrainingAttendee(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  userId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getTrainingById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Training 미존재 (id=${args.id})`);
  if (current.status === "archived" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 이수자 변경 불가`);
  }
  const updated = current.attendees.filter((a) => a.userId !== args.userId);
  await db
    .update(hTrainings)
    .set({ attendees: updated })
    .where(
      and(
        eq(hTrainings.id, args.id),
        eq(hTrainings.tenantId, args.tenantId),
        eq(hTrainings.industry, args.industry),
      ),
    );
}

/** 효과성 평가 입력 (archived 직전). */
export async function setTrainingEffectiveness(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  effectivenessAssessment: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getTrainingById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Training 미존재 (id=${args.id})`);
  if (current.status === "archived" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 변경 불가`);
  }
  await db
    .update(hTrainings)
    .set({ effectivenessAssessment: args.effectivenessAssessment })
    .where(
      and(
        eq(hTrainings.id, args.id),
        eq(hTrainings.tenantId, args.tenantId),
        eq(hTrainings.industry, args.industry),
      ),
    );
}

/** 상태 전이 — completed 시 approvedBy/approvedAt, archived 시 closedAt 자동. */
export async function transitionTrainingStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: TrainingStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getTrainingById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Training 미존재 (id=${args.id})`);
  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(
      `잘못된 상태 전이: ${current.status} → ${args.toStatus} (canTransition 거부)`,
    );
  }
  const updates: Record<string, unknown> = { status: args.toStatus };
  if (args.toStatus === "completed") {
    if (!args.approvedBy) throw new Error("completed 전이 시 approvedBy 필수");
    updates.approvedBy = args.approvedBy;
    updates.approvedAt = new Date();
  }
  if (args.toStatus === "archived") updates.closedAt = new Date();

  await db
    .update(hTrainings)
    .set(updates)
    .where(
      and(
        eq(hTrainings.id, args.id),
        eq(hTrainings.tenantId, args.tenantId),
        eq(hTrainings.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getTrainingStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  type: TrainingType;
  status: TrainingStatus;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hTrainings.industry,
      type: hTrainings.type,
      status: hTrainings.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(hTrainings)
    .where(eq(hTrainings.tenantId, tenantId))
    .groupBy(hTrainings.industry, hTrainings.type, hTrainings.status);
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    type: r.type as TrainingType,
    status: r.status as TrainingStatus,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(row: typeof hTrainings.$inferSelect): Training {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    type: row.type as TrainingType,
    title: row.title,
    subject: row.subject,
    description: row.description,
    trainerName: row.trainerName,
    trainerType: row.trainerType as "internal" | "external",
    trainerUserId: row.trainerUserId ?? null,
    scheduledDate: typeof row.scheduledDate === "string"
      ? row.scheduledDate
      : (row.scheduledDate as unknown as Date).toISOString().slice(0, 10),
    actualDate: row.actualDate
      ? typeof row.actualDate === "string"
        ? row.actualDate
        : (row.actualDate as unknown as Date).toISOString().slice(0, 10)
      : null,
    durationMinutes: row.durationMinutes,
    attendees: (row.attendees as unknown as TrainingAttendee[]) ?? [],
    materials: (row.materials as unknown as TrainingMaterial[]) ?? [],
    effectivenessAssessment: row.effectivenessAssessment ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as TrainingStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
