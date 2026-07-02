/**
 * Food Fraud (VACCP) DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-8)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hFoodFraudAssessments } from "../../../../drizzle/schema/coreMes/quality/foodFraud";
import {
  type FoodFraudAssessment,
  type FraudCategory,
  type FoodFraudStatus,
  type ControlMeasure,
  type IndustryContext,
  canTransition,
  calculateResidualScore,
} from "../../../core-mes/quality/foodFraud";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateFoodFraudCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `FF-${year}-`;
  const rows = await db
    .select({ code: hFoodFraudAssessments.code })
    .from(hFoodFraudAssessments)
    .where(
      and(
        eq(hFoodFraudAssessments.tenantId, tenantId),
        sql`${hFoodFraudAssessments.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hFoodFraudAssessments.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^FF-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateFoodFraudInput = {
  tenantId: number;
  industry: IndustryContext;
  title: string;
  description: string;
  category: FraudCategory;
  material: string;
  supplier?: string | null;
  likelihood: number;
  impact: number;
  assessedBy?: number;
  industryMetadata?: Record<string, unknown> | null;
};

export async function createFoodFraud(
  input: CreateFoodFraudInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  if (input.likelihood < 1 || input.likelihood > 5) {
    throw new Error("likelihood 는 1~5 범위");
  }
  if (input.impact < 1 || input.impact > 5) {
    throw new Error("impact 는 1~5 범위");
  }
  const code = await generateFoodFraudCode(input.tenantId);

  const result = await db.insert(hFoodFraudAssessments).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    title: input.title,
    description: input.description,
    category: input.category,
    material: input.material,
    supplier: input.supplier ?? null,
    likelihood: input.likelihood,
    impact: input.impact,
    controlMeasures: [],
    status: "draft",
    assessedBy: input.assessedBy ?? null,
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId =
    (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listFoodFraud(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: FoodFraudStatus;
    category?: FraudCategory;
    /** 잔여 취약성 점수 이상 필터 (예: 15 → 고취약만) */
    minResidualScore?: number;
    limit?: number;
    offset?: number;
  },
): Promise<FoodFraudAssessment[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    eq(hFoodFraudAssessments.tenantId, tenantId),
    eq(hFoodFraudAssessments.industry, industry),
  ];
  if (options?.status) conds.push(eq(hFoodFraudAssessments.status, options.status));
  if (options?.category)
    conds.push(eq(hFoodFraudAssessments.category, options.category));
  if (options?.minResidualScore)
    conds.push(sql`${hFoodFraudAssessments.residualScore} >= ${options.minResidualScore}`);

  const rows = await db
    .select()
    .from(hFoodFraudAssessments)
    .where(and(...conds))
    .orderBy(
      desc(sql`${hFoodFraudAssessments.likelihood} * ${hFoodFraudAssessments.impact}`),
      desc(hFoodFraudAssessments.id),
    )
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getFoodFraudById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<FoodFraudAssessment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hFoodFraudAssessments)
    .where(
      and(
        eq(hFoodFraudAssessments.id, id),
        eq(hFoodFraudAssessments.tenantId, tenantId),
        eq(hFoodFraudAssessments.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 ────────────────────────────────────────────

/**
 * 통제수단 추가 — residualScore 자동 재계산.
 */
export async function addControlMeasure(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  controlMeasure: ControlMeasure;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getFoodFraudById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Food Fraud 미존재 (id=${args.id})`);
  if (current.status === "archived") {
    throw new Error("종결 상태에서 통제수단 추가 불가");
  }
  if (
    args.controlMeasure.residualLikelihood < 1 ||
    args.controlMeasure.residualLikelihood > 5 ||
    args.controlMeasure.residualImpact < 1 ||
    args.controlMeasure.residualImpact > 5
  ) {
    throw new Error("residual likelihood/impact 는 1~5 범위");
  }

  const newControlMeasures = [...current.controlMeasures, args.controlMeasure];
  await db
    .update(hFoodFraudAssessments)
    .set({
      controlMeasures: newControlMeasures,
      residualScore: calculateResidualScore(newControlMeasures),
    })
    .where(
      and(
        eq(hFoodFraudAssessments.id, args.id),
        eq(hFoodFraudAssessments.tenantId, args.tenantId),
        eq(hFoodFraudAssessments.industry, args.industry),
      ),
    );
}

/**
 * 정당화 (justification) 입력 — accepted 전이 전에 필요.
 */
export async function setJustification(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  justification: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getFoodFraudById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Food Fraud 미존재 (id=${args.id})`);
  if (current.status === "archived") {
    throw new Error("종결 상태에서 변경 불가");
  }

  await db
    .update(hFoodFraudAssessments)
    .set({ justification: args.justification })
    .where(
      and(
        eq(hFoodFraudAssessments.id, args.id),
        eq(hFoodFraudAssessments.tenantId, args.tenantId),
        eq(hFoodFraudAssessments.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이.
 *   - mitigated 진입 시: controlMeasures 비어있지 않을 것
 *   - accepted 진입 시: justification 필수
 *   - mitigated/accepted 진입 시 approvedBy + approvedAt 기록
 *   - archived 진입 시 closedAt
 */
export async function transitionFoodFraudStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: FoodFraudStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getFoodFraudById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Food Fraud 미존재 (id=${args.id})`);
  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(`잘못된 상태 전이: ${current.status} → ${args.toStatus}`);
  }

  if (args.toStatus === "mitigated" && current.controlMeasures.length === 0) {
    throw new Error("mitigated 전이 시 통제수단 1개 이상 필요");
  }
  if (args.toStatus === "accepted" && !current.justification) {
    throw new Error("accepted 전이 시 justification 필수");
  }

  const updates: Record<string, unknown> = { status: args.toStatus };
  if (args.toStatus === "mitigated" || args.toStatus === "accepted") {
    if (!args.approvedBy) {
      throw new Error(`${args.toStatus} 전이 시 approvedBy 필수`);
    }
    updates.approvedBy = args.approvedBy;
    updates.approvedAt = new Date();
  }
  if (args.toStatus === "archived") updates.closedAt = new Date();

  await db
    .update(hFoodFraudAssessments)
    .set(updates)
    .where(
      and(
        eq(hFoodFraudAssessments.id, args.id),
        eq(hFoodFraudAssessments.tenantId, args.tenantId),
        eq(hFoodFraudAssessments.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getFoodFraudStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  category: FraudCategory;
  status: FoodFraudStatus;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hFoodFraudAssessments.industry,
      category: hFoodFraudAssessments.category,
      status: hFoodFraudAssessments.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(hFoodFraudAssessments)
    .where(eq(hFoodFraudAssessments.tenantId, tenantId))
    .groupBy(
      hFoodFraudAssessments.industry,
      hFoodFraudAssessments.category,
      hFoodFraudAssessments.status,
    );
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    category: r.category as FraudCategory,
    status: r.status as FoodFraudStatus,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(
  row: typeof hFoodFraudAssessments.$inferSelect,
): FoodFraudAssessment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category as FraudCategory,
    material: row.material,
    supplier: row.supplier ?? null,
    likelihood: row.likelihood,
    impact: row.impact,
    controlMeasures: (row.controlMeasures as unknown as ControlMeasure[]) ?? [],
    residualScore: row.residualScore ?? null,
    justification: row.justification ?? null,
    assessedBy: row.assessedBy ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as FoodFraudStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
