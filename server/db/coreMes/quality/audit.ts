/**
 * Audit DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-2-3)
 *
 * lifecycle (canTransition 검증):
 *   planned → scheduled → in_progress → reporting → closed
 *                                                   ↑
 *                                            cancelled (어느 단계든)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hAudits } from "../../../../drizzle/schema/coreMes/quality/audit";
import {
  type Audit,
  type AuditStatus,
  type AuditType,
  type AuditOutcome,
  type AuditFinding,
  type IndustryContext,
  canTransition,
  suggestOutcome,
} from "../../../core-mes/quality/audit";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateAuditCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `AUD-${year}-`;
  const rows = await db
    .select({ code: hAudits.code })
    .from(hAudits)
    .where(
      and(
        eq(hAudits.tenantId, tenantId),
        sql`${hAudits.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hAudits.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^AUD-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateAuditInput = {
  tenantId: number;
  industry: IndustryContext;
  type: AuditType;
  title: string;
  scope: string;
  criteria: string;
  auditee: string;
  plannedDate: string;
  leadAuditor: number;
  auditors?: number[];
  industryMetadata?: Record<string, unknown> | null;
};

export async function createAudit(input: CreateAuditInput): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const code = await generateAuditCode(input.tenantId);
  const result = await db.insert(hAudits).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    type: input.type,
    title: input.title,
    scope: input.scope,
    criteria: input.criteria,
    auditee: input.auditee,
    plannedDate: input.plannedDate,
    leadAuditor: input.leadAuditor,
    auditors: input.auditors ?? [],
    findings: [],
    outcome: "pending",
    status: "planned",
    industryMetadata: input.industryMetadata ?? null,
  });
  const insertId = (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listAudits(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: AuditStatus;
    type?: AuditType;
    leadAuditor?: number;
    limit?: number;
    offset?: number;
  },
): Promise<Audit[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [eq(hAudits.tenantId, tenantId), eq(hAudits.industry, industry)];
  if (options?.status) conds.push(eq(hAudits.status, options.status));
  if (options?.type) conds.push(eq(hAudits.type, options.type));
  if (options?.leadAuditor) conds.push(eq(hAudits.leadAuditor, options.leadAuditor));
  const rows = await db
    .select()
    .from(hAudits)
    .where(and(...conds))
    .orderBy(desc(hAudits.plannedDate), desc(hAudits.id))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getAuditById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<Audit | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hAudits)
    .where(
      and(
        eq(hAudits.id, id),
        eq(hAudits.tenantId, tenantId),
        eq(hAudits.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 액션 ────────────────────────────────────────────

/**
 * 감사 실시일 입력 (in_progress 진입 시 권장).
 */
export async function setAuditActualDate(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  actualDate: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getAuditById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Audit 미존재 (id=${args.id})`);
  if (current.status === "closed" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 변경 불가 (status=${current.status})`);
  }
  await db
    .update(hAudits)
    .set({ actualDate: args.actualDate })
    .where(
      and(
        eq(hAudits.id, args.id),
        eq(hAudits.tenantId, args.tenantId),
        eq(hAudits.industry, args.industry),
      ),
    );
}

/**
 * Findings 추가 (in_progress / reporting 단계).
 *   각 finding 의 seq 는 자동 증가.
 *   outcome 자동 재계산 (suggestOutcome).
 */
export async function addAuditFinding(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  finding: Omit<AuditFinding, "seq">;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getAuditById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Audit 미존재 (id=${args.id})`);
  if (current.status === "closed" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 finding 추가 불가 (status=${current.status})`);
  }
  const newFindings: AuditFinding[] = [
    ...current.findings,
    { ...args.finding, seq: current.findings.length + 1 },
  ];
  await db
    .update(hAudits)
    .set({
      findings: newFindings,
      outcome: suggestOutcome(newFindings),
    })
    .where(
      and(
        eq(hAudits.id, args.id),
        eq(hAudits.tenantId, args.tenantId),
        eq(hAudits.industry, args.industry),
      ),
    );
}

/**
 * Finding 의 correctiveActionId 연계.
 *   Y-2-2 (CAPA) 머지 후 활성. 단순 정수 갱신만.
 */
export async function linkFindingToCorrectiveAction(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  findingSeq: number;
  correctiveActionId: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getAuditById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Audit 미존재 (id=${args.id})`);
  const updated = current.findings.map((f) =>
    f.seq === args.findingSeq
      ? { ...f, correctiveActionId: args.correctiveActionId }
      : f,
  );
  if (!updated.some((f) => f.seq === args.findingSeq)) {
    throw new Error(`Finding seq=${args.findingSeq} 미존재`);
  }
  await db
    .update(hAudits)
    .set({ findings: updated })
    .where(
      and(
        eq(hAudits.id, args.id),
        eq(hAudits.tenantId, args.tenantId),
        eq(hAudits.industry, args.industry),
      ),
    );
}

/**
 * 결론 / 권고사항 입력 (reporting 단계).
 */
export async function setAuditConclusion(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  conclusion: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getAuditById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Audit 미존재 (id=${args.id})`);
  if (current.status === "closed" || current.status === "cancelled") {
    throw new Error(`종결 상태에서 변경 불가`);
  }
  await db
    .update(hAudits)
    .set({ conclusion: args.conclusion })
    .where(
      and(
        eq(hAudits.id, args.id),
        eq(hAudits.tenantId, args.tenantId),
        eq(hAudits.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이 — canTransition + closed 시 approvedBy 필수.
 */
export async function transitionAuditStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: AuditStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getAuditById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Audit 미존재 (id=${args.id})`);
  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(
      `잘못된 상태 전이: ${current.status} → ${args.toStatus} (canTransition 거부)`,
    );
  }
  const updates: Record<string, unknown> = { status: args.toStatus };
  if (args.toStatus === "closed") {
    if (!args.approvedBy) throw new Error("closed 전이 시 approvedBy 필수");
    updates.approvedBy = args.approvedBy;
    updates.approvedAt = new Date();
    updates.closedAt = new Date();
  }
  await db
    .update(hAudits)
    .set(updates)
    .where(
      and(
        eq(hAudits.id, args.id),
        eq(hAudits.tenantId, args.tenantId),
        eq(hAudits.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getAuditStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  type: AuditType;
  outcome: AuditOutcome;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hAudits.industry,
      type: hAudits.type,
      outcome: hAudits.outcome,
      count: sql<number>`COUNT(*)`,
    })
    .from(hAudits)
    .where(eq(hAudits.tenantId, tenantId))
    .groupBy(hAudits.industry, hAudits.type, hAudits.outcome);
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    type: r.type as AuditType,
    outcome: r.outcome as AuditOutcome,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(row: typeof hAudits.$inferSelect): Audit {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    type: row.type as AuditType,
    title: row.title,
    scope: row.scope,
    criteria: row.criteria,
    auditee: row.auditee,
    plannedDate: typeof row.plannedDate === "string"
      ? row.plannedDate
      : (row.plannedDate as unknown as Date).toISOString().slice(0, 10),
    actualDate: row.actualDate
      ? typeof row.actualDate === "string"
        ? row.actualDate
        : (row.actualDate as unknown as Date).toISOString().slice(0, 10)
      : null,
    leadAuditor: row.leadAuditor,
    auditors: (row.auditors as number[]) ?? [],
    findings: (row.findings as unknown as AuditFinding[]) ?? [],
    outcome: row.outcome as AuditOutcome,
    conclusion: row.conclusion ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as AuditStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
