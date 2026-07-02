/**
 * Environmental Monitoring (환경 모니터링 EMP) DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-12)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hEnvironmentalMonitoring } from "../../../../drizzle/schema/coreMes/quality/environmentalMonitoring";
import {
  type EnvironmentalMonitoring,
  type MonitoringZone,
  type MonitoringTarget,
  type MonitoringMethod,
  type MonitoringResult,
  type EmStatus,
  type IndustryContext,
  canTransition,
} from "../../../core-mes/quality/environmentalMonitoring";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateEmCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `EM-${year}-`;
  const rows = await db
    .select({ code: hEnvironmentalMonitoring.code })
    .from(hEnvironmentalMonitoring)
    .where(
      and(
        eq(hEnvironmentalMonitoring.tenantId, tenantId),
        sql`${hEnvironmentalMonitoring.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hEnvironmentalMonitoring.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^EM-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateEmInput = {
  tenantId: number;
  industry: IndustryContext;
  samplingDate: string;
  zone: MonitoringZone;
  location: string;
  target: MonitoringTarget;
  method: MonitoringMethod;
  result?: MonitoringResult;
  resultValue?: string | null;
  limitCriteria?: string | null;
  correctiveAction?: string | null;
  correctiveActionId?: number | null;
  notes?: string | null;
  assessedBy?: number;
  industryMetadata?: Record<string, unknown> | null;
};

export async function createEm(
  input: CreateEmInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const code = await generateEmCode(input.tenantId);

  const result = await db.insert(hEnvironmentalMonitoring).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    samplingDate: input.samplingDate,
    zone: input.zone,
    location: input.location,
    target: input.target,
    method: input.method,
    result: input.result ?? "pending",
    resultValue: input.resultValue ?? null,
    limitCriteria: input.limitCriteria ?? null,
    correctiveAction: input.correctiveAction ?? null,
    correctiveActionId: input.correctiveActionId ?? null,
    notes: input.notes ?? null,
    status: "draft",
    assessedBy: input.assessedBy ?? null,
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId =
    (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listEm(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: EmStatus;
    zone?: MonitoringZone;
    target?: MonitoringTarget;
    result?: MonitoringResult;
    limit?: number;
    offset?: number;
  },
): Promise<EnvironmentalMonitoring[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    eq(hEnvironmentalMonitoring.tenantId, tenantId),
    eq(hEnvironmentalMonitoring.industry, industry),
  ];
  if (options?.status) conds.push(eq(hEnvironmentalMonitoring.status, options.status));
  if (options?.zone) conds.push(eq(hEnvironmentalMonitoring.zone, options.zone));
  if (options?.target) conds.push(eq(hEnvironmentalMonitoring.target, options.target));
  if (options?.result) conds.push(eq(hEnvironmentalMonitoring.result, options.result));

  const rows = await db
    .select()
    .from(hEnvironmentalMonitoring)
    .where(and(...conds))
    .orderBy(desc(hEnvironmentalMonitoring.samplingDate), desc(hEnvironmentalMonitoring.id))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getEmById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<EnvironmentalMonitoring | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hEnvironmentalMonitoring)
    .where(
      and(
        eq(hEnvironmentalMonitoring.id, id),
        eq(hEnvironmentalMonitoring.tenantId, tenantId),
        eq(hEnvironmentalMonitoring.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 ────────────────────────────────────────────

/**
 * 결과/판정 입력 (배양 완료 후) + 부적합 시 시정조치 기입.
 */
export async function setResult(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  result: MonitoringResult;
  resultValue?: string | null;
  correctiveAction?: string | null;
  correctiveActionId?: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getEmById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Environmental Monitoring 미존재 (id=${args.id})`);
  if (current.status === "archived") throw new Error("종결 상태에서 변경 불가");

  const updates: Record<string, unknown> = { result: args.result };
  if (args.resultValue !== undefined) updates.resultValue = args.resultValue;
  if (args.correctiveAction !== undefined) updates.correctiveAction = args.correctiveAction;
  if (args.correctiveActionId !== undefined) updates.correctiveActionId = args.correctiveActionId;

  await db
    .update(hEnvironmentalMonitoring)
    .set(updates)
    .where(
      and(
        eq(hEnvironmentalMonitoring.id, args.id),
        eq(hEnvironmentalMonitoring.tenantId, args.tenantId),
        eq(hEnvironmentalMonitoring.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이.
 *   - approved 진입 시 approvedBy + approvedAt 기록
 *   - archived 진입 시 closedAt
 */
export async function transitionEmStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: EmStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getEmById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Environmental Monitoring 미존재 (id=${args.id})`);
  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(`잘못된 상태 전이: ${current.status} → ${args.toStatus}`);
  }
  // 부적합인데 결과 대기면 승인 차단
  if (args.toStatus === "approved" && current.result === "pending") {
    throw new Error("결과 대기(pending) 상태는 승인할 수 없습니다. 결과를 먼저 입력하세요.");
  }

  const updates: Record<string, unknown> = { status: args.toStatus };
  if (args.toStatus === "approved") {
    if (!args.approvedBy) throw new Error("approved 전이 시 approvedBy 필수");
    updates.approvedBy = args.approvedBy;
    updates.approvedAt = new Date();
  }
  if (args.toStatus === "archived") updates.closedAt = new Date();

  await db
    .update(hEnvironmentalMonitoring)
    .set(updates)
    .where(
      and(
        eq(hEnvironmentalMonitoring.id, args.id),
        eq(hEnvironmentalMonitoring.tenantId, args.tenantId),
        eq(hEnvironmentalMonitoring.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getEmStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  zone: MonitoringZone;
  result: MonitoringResult;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hEnvironmentalMonitoring.industry,
      zone: hEnvironmentalMonitoring.zone,
      result: hEnvironmentalMonitoring.result,
      count: sql<number>`COUNT(*)`,
    })
    .from(hEnvironmentalMonitoring)
    .where(eq(hEnvironmentalMonitoring.tenantId, tenantId))
    .groupBy(
      hEnvironmentalMonitoring.industry,
      hEnvironmentalMonitoring.zone,
      hEnvironmentalMonitoring.result,
    );
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    zone: r.zone as MonitoringZone,
    result: r.result as MonitoringResult,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(
  row: typeof hEnvironmentalMonitoring.$inferSelect,
): EnvironmentalMonitoring {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    samplingDate: typeof row.samplingDate === "string"
      ? row.samplingDate
      : new Date(row.samplingDate as unknown as Date).toISOString().slice(0, 10),
    zone: row.zone as MonitoringZone,
    location: row.location,
    target: row.target as MonitoringTarget,
    method: row.method as MonitoringMethod,
    result: row.result as MonitoringResult,
    resultValue: row.resultValue ?? null,
    limitCriteria: row.limitCriteria ?? null,
    correctiveAction: row.correctiveAction ?? null,
    correctiveActionId: row.correctiveActionId ?? null,
    notes: row.notes ?? null,
    assessedBy: row.assessedBy ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as EmStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
