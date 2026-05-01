/**
 * CAPA DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-2-2)
 *
 * 의존성 (ADR-002):
 *   - core-mes 가 industry/* 무참조
 *   - 단순 정수 FK (nonconformingId) — multi-tenant 격리는 호출자 책임
 *
 * lifecycle (canTransition 검증):
 *   planned → in_progress → effectiveness_check → closed
 *                                  └→ in_progress (재실행)
 *                                  └→ cancelled (어느 단계든)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hCorrectiveActions } from "../../../../drizzle/schema/coreMes/quality/correctiveAction";
import {
  type CorrectiveAction,
  type CapaStatus,
  type CapaType,
  type CapaPriority,
  type IndustryContext,
  canTransition,
} from "../../../core-mes/quality/correctiveAction";

// ─── 자동채번 ────────────────────────────────────────────

/**
 * CAR-YYYY-NNNN 자동채번 (tenant 별 연도 기준).
 * idempotent — 같은 tenant + 연도에 호출 시 N+1 반환.
 */
export async function generateCorrectiveActionCode(
  tenantId: number,
): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const year = new Date().getFullYear();
  const prefix = `CAR-${year}-`;

  const rows = await db
    .select({ code: hCorrectiveActions.code })
    .from(hCorrectiveActions)
    .where(
      and(
        eq(hCorrectiveActions.tenantId, tenantId),
        sql`${hCorrectiveActions.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hCorrectiveActions.code))
    .limit(1);

  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^CAR-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateCorrectiveActionInput = {
  tenantId: number;
  industry: IndustryContext;
  type: CapaType;
  priority?: CapaPriority;
  title: string;
  description: string;
  nonconformingId?: number | null;
  assignedTo: number;
  dueDate: string; // YYYY-MM-DD
  actionPlan: string;
  effectivenessCriteria?: string | null;
  industryMetadata?: Record<string, unknown> | null;
};

export async function createCorrectiveAction(
  input: CreateCorrectiveActionInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const code = await generateCorrectiveActionCode(input.tenantId);

  const result = await db.insert(hCorrectiveActions).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    type: input.type,
    priority: input.priority ?? "medium",
    title: input.title,
    description: input.description,
    nonconformingId: input.nonconformingId ?? null,
    assignedTo: input.assignedTo,
    dueDate: input.dueDate,
    actionPlan: input.actionPlan,
    effectivenessCriteria: input.effectivenessCriteria ?? null,
    status: "planned",
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId = (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listCorrectiveActions(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: CapaStatus;
    type?: CapaType;
    assignedTo?: number;
    nonconformingId?: number;
    limit?: number;
    offset?: number;
  },
): Promise<CorrectiveAction[]> {
  const db = await getDb();
  if (!db) return [];

  const conds = [
    eq(hCorrectiveActions.tenantId, tenantId),
    eq(hCorrectiveActions.industry, industry),
  ];
  if (options?.status) conds.push(eq(hCorrectiveActions.status, options.status));
  if (options?.type) conds.push(eq(hCorrectiveActions.type, options.type));
  if (options?.assignedTo)
    conds.push(eq(hCorrectiveActions.assignedTo, options.assignedTo));
  if (options?.nonconformingId)
    conds.push(eq(hCorrectiveActions.nonconformingId, options.nonconformingId));

  const rows = await db
    .select()
    .from(hCorrectiveActions)
    .where(and(...conds))
    .orderBy(desc(hCorrectiveActions.dueDate), desc(hCorrectiveActions.id))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);

  return rows.map(rowToEntity);
}

export async function getCorrectiveActionById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<CorrectiveAction | null> {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select()
    .from(hCorrectiveActions)
    .where(
      and(
        eq(hCorrectiveActions.id, id),
        eq(hCorrectiveActions.tenantId, tenantId),
        eq(hCorrectiveActions.industry, industry),
      ),
    )
    .limit(1);

  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 액션 ────────────────────────────────────────────

/**
 * 실행 상세 입력 (in_progress 단계).
 * 종결 상태에서는 거부.
 */
export async function setCorrectiveActionExecution(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  executionDetails: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getCorrectiveActionById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`CorrectiveAction 미존재 (id=${args.id})`);
  if (current.status === "closed" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 실행 상세 변경 불가 (status=${current.status})`);
  }

  await db
    .update(hCorrectiveActions)
    .set({ executionDetails: args.executionDetails })
    .where(
      and(
        eq(hCorrectiveActions.id, args.id),
        eq(hCorrectiveActions.tenantId, args.tenantId),
        eq(hCorrectiveActions.industry, args.industry),
      ),
    );
}

/**
 * 효과성 검증 결과 입력 (effectiveness_check 단계).
 * verifier 자동 기록.
 */
export async function setCorrectiveActionEffectiveness(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  effectivenessResult: string;
  verifiedBy: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getCorrectiveActionById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`CorrectiveAction 미존재 (id=${args.id})`);
  if (current.status === "closed" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 효과성 변경 불가 (status=${current.status})`);
  }

  await db
    .update(hCorrectiveActions)
    .set({
      effectivenessResult: args.effectivenessResult,
      verifiedBy: args.verifiedBy,
      verifiedAt: new Date(),
    })
    .where(
      and(
        eq(hCorrectiveActions.id, args.id),
        eq(hCorrectiveActions.tenantId, args.tenantId),
        eq(hCorrectiveActions.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이 (canTransition 검증 강제).
 * closed 시 closedAt 자동 채움.
 */
export async function transitionCorrectiveActionStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: CapaStatus;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getCorrectiveActionById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`CorrectiveAction 미존재 (id=${args.id})`);

  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(
      `잘못된 상태 전이: ${current.status} → ${args.toStatus} (canTransition 거부)`,
    );
  }

  const updates: Record<string, unknown> = { status: args.toStatus };
  if (args.toStatus === "closed") updates.closedAt = new Date();

  await db
    .update(hCorrectiveActions)
    .set(updates)
    .where(
      and(
        eq(hCorrectiveActions.id, args.id),
        eq(hCorrectiveActions.tenantId, args.tenantId),
        eq(hCorrectiveActions.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getCorrectiveActionStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  status: CapaStatus;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      industry: hCorrectiveActions.industry,
      status: hCorrectiveActions.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(hCorrectiveActions)
    .where(eq(hCorrectiveActions.tenantId, tenantId))
    .groupBy(hCorrectiveActions.industry, hCorrectiveActions.status);

  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    status: r.status as CapaStatus,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(
  row: typeof hCorrectiveActions.$inferSelect,
): CorrectiveAction {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    type: row.type as CapaType,
    priority: row.priority as CapaPriority,
    title: row.title,
    description: row.description,
    nonconformingId: row.nonconformingId ?? null,
    assignedTo: row.assignedTo,
    dueDate: typeof row.dueDate === "string"
      ? row.dueDate
      : (row.dueDate as unknown as Date).toISOString().slice(0, 10),
    actionPlan: row.actionPlan,
    executionDetails: row.executionDetails ?? null,
    effectivenessCriteria: row.effectivenessCriteria ?? null,
    effectivenessResult: row.effectivenessResult ?? null,
    verifiedBy: row.verifiedBy ?? null,
    verifiedAt: row.verifiedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as CapaStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
