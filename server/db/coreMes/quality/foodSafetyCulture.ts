/**
 * Food Safety Culture (식품안전문화) DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-9)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hFoodSafetyCultureAssessments } from "../../../../drizzle/schema/coreMes/quality/foodSafetyCulture";
import {
  type FoodSafetyCultureAssessment,
  type AssessmentMethod,
  type CultureStatus,
  type DimensionScores,
  type ImprovementAction,
  type IndustryContext,
  canTransition,
  calculateOverallScore,
} from "../../../core-mes/quality/foodSafetyCulture";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateCultureCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `FSC-${year}-`;
  const rows = await db
    .select({ code: hFoodSafetyCultureAssessments.code })
    .from(hFoodSafetyCultureAssessments)
    .where(
      and(
        eq(hFoodSafetyCultureAssessments.tenantId, tenantId),
        sql`${hFoodSafetyCultureAssessments.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hFoodSafetyCultureAssessments.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^FSC-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateCultureInput = {
  tenantId: number;
  industry: IndustryContext;
  title: string;
  assessmentPeriod: string;
  method: AssessmentMethod;
  participantCount: number;
  dimensionScores: DimensionScores;
  summary?: string | null;
  assessedBy?: number;
  industryMetadata?: Record<string, unknown> | null;
};

export async function createCulture(
  input: CreateCultureInput,
): Promise<{ id: number; code: string; overallScore: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  // calculateOverallScore 가 차원별 1~5 범위 검증도 수행
  const overallScore = calculateOverallScore(input.dimensionScores);
  const code = await generateCultureCode(input.tenantId);

  const result = await db.insert(hFoodSafetyCultureAssessments).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    title: input.title,
    assessmentPeriod: input.assessmentPeriod,
    method: input.method,
    participantCount: input.participantCount,
    dimensionScores: input.dimensionScores,
    overallScore: overallScore.toFixed(1),
    improvementActions: [],
    summary: input.summary ?? null,
    status: "draft",
    assessedBy: input.assessedBy ?? null,
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId =
    (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code, overallScore };
}

export async function listCulture(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: CultureStatus;
    limit?: number;
    offset?: number;
  },
): Promise<FoodSafetyCultureAssessment[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    eq(hFoodSafetyCultureAssessments.tenantId, tenantId),
    eq(hFoodSafetyCultureAssessments.industry, industry),
  ];
  if (options?.status)
    conds.push(eq(hFoodSafetyCultureAssessments.status, options.status));

  const rows = await db
    .select()
    .from(hFoodSafetyCultureAssessments)
    .where(and(...conds))
    .orderBy(desc(hFoodSafetyCultureAssessments.id))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getCultureById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<FoodSafetyCultureAssessment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hFoodSafetyCultureAssessments)
    .where(
      and(
        eq(hFoodSafetyCultureAssessments.id, id),
        eq(hFoodSafetyCultureAssessments.tenantId, tenantId),
        eq(hFoodSafetyCultureAssessments.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 ────────────────────────────────────────────

/**
 * 개선활동 추가.
 */
export async function addImprovementAction(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  action: ImprovementAction;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getCultureById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Food Safety Culture 미존재 (id=${args.id})`);
  if (current.status === "archived") {
    throw new Error("종결 상태에서 개선활동 추가 불가");
  }

  const newActions = [...current.improvementActions, args.action];
  await db
    .update(hFoodSafetyCultureAssessments)
    .set({ improvementActions: newActions })
    .where(
      and(
        eq(hFoodSafetyCultureAssessments.id, args.id),
        eq(hFoodSafetyCultureAssessments.tenantId, args.tenantId),
        eq(hFoodSafetyCultureAssessments.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이.
 *   - approved 진입 시 approvedBy + approvedAt 기록
 *   - archived 진입 시 closedAt
 */
export async function transitionCultureStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: CultureStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getCultureById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Food Safety Culture 미존재 (id=${args.id})`);
  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(`잘못된 상태 전이: ${current.status} → ${args.toStatus}`);
  }

  const updates: Record<string, unknown> = { status: args.toStatus };
  if (args.toStatus === "approved") {
    if (!args.approvedBy) throw new Error("approved 전이 시 approvedBy 필수");
    updates.approvedBy = args.approvedBy;
    updates.approvedAt = new Date();
  }
  if (args.toStatus === "archived") updates.closedAt = new Date();

  await db
    .update(hFoodSafetyCultureAssessments)
    .set(updates)
    .where(
      and(
        eq(hFoodSafetyCultureAssessments.id, args.id),
        eq(hFoodSafetyCultureAssessments.tenantId, args.tenantId),
        eq(hFoodSafetyCultureAssessments.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getCultureStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  status: CultureStatus;
  count: number;
  avgScore: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hFoodSafetyCultureAssessments.industry,
      status: hFoodSafetyCultureAssessments.status,
      count: sql<number>`COUNT(*)`,
      avgScore: sql<string>`AVG(${hFoodSafetyCultureAssessments.overallScore})`,
    })
    .from(hFoodSafetyCultureAssessments)
    .where(eq(hFoodSafetyCultureAssessments.tenantId, tenantId))
    .groupBy(
      hFoodSafetyCultureAssessments.industry,
      hFoodSafetyCultureAssessments.status,
    );
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    status: r.status as CultureStatus,
    count: Number(r.count),
    avgScore: r.avgScore ? Math.round(Number(r.avgScore) * 10) / 10 : 0,
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(
  row: typeof hFoodSafetyCultureAssessments.$inferSelect,
): FoodSafetyCultureAssessment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    title: row.title,
    assessmentPeriod: row.assessmentPeriod,
    method: row.method as AssessmentMethod,
    participantCount: row.participantCount,
    dimensionScores: row.dimensionScores as unknown as DimensionScores,
    overallScore: Number(row.overallScore),
    improvementActions: (row.improvementActions as unknown as ImprovementAction[]) ?? [],
    summary: row.summary ?? null,
    assessedBy: row.assessedBy ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as CultureStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
