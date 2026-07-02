/**
 * Food Defense (TACCP) DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-7)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hFoodDefenseAssessments } from "../../../../drizzle/schema/coreMes/quality/foodDefense";
import {
  type FoodDefenseAssessment,
  type ThreatCategory,
  type FoodDefenseStatus,
  type Countermeasure,
  type IndustryContext,
  canTransition,
  calculateResidualScore,
} from "../../../core-mes/quality/foodDefense";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateFoodDefenseCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `FD-${year}-`;
  const rows = await db
    .select({ code: hFoodDefenseAssessments.code })
    .from(hFoodDefenseAssessments)
    .where(
      and(
        eq(hFoodDefenseAssessments.tenantId, tenantId),
        sql`${hFoodDefenseAssessments.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hFoodDefenseAssessments.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^FD-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateFoodDefenseInput = {
  tenantId: number;
  industry: IndustryContext;
  title: string;
  description: string;
  category: ThreatCategory;
  targetPoint: string;
  likelihood: number;
  impact: number;
  assessedBy?: number;
  industryMetadata?: Record<string, unknown> | null;
};

export async function createFoodDefense(
  input: CreateFoodDefenseInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  if (input.likelihood < 1 || input.likelihood > 5) {
    throw new Error("likelihood 는 1~5 범위");
  }
  if (input.impact < 1 || input.impact > 5) {
    throw new Error("impact 는 1~5 범위");
  }
  const code = await generateFoodDefenseCode(input.tenantId);

  const result = await db.insert(hFoodDefenseAssessments).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    title: input.title,
    description: input.description,
    category: input.category,
    targetPoint: input.targetPoint,
    likelihood: input.likelihood,
    impact: input.impact,
    countermeasures: [],
    status: "draft",
    assessedBy: input.assessedBy ?? null,
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId =
    (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listFoodDefense(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: FoodDefenseStatus;
    category?: ThreatCategory;
    /** 잔여 위협 점수 이상 필터 (예: 15 → 고위협만) */
    minResidualScore?: number;
    limit?: number;
    offset?: number;
  },
): Promise<FoodDefenseAssessment[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    eq(hFoodDefenseAssessments.tenantId, tenantId),
    eq(hFoodDefenseAssessments.industry, industry),
  ];
  if (options?.status) conds.push(eq(hFoodDefenseAssessments.status, options.status));
  if (options?.category)
    conds.push(eq(hFoodDefenseAssessments.category, options.category));
  if (options?.minResidualScore)
    conds.push(sql`${hFoodDefenseAssessments.residualScore} >= ${options.minResidualScore}`);

  const rows = await db
    .select()
    .from(hFoodDefenseAssessments)
    .where(and(...conds))
    .orderBy(
      desc(sql`${hFoodDefenseAssessments.likelihood} * ${hFoodDefenseAssessments.impact}`),
      desc(hFoodDefenseAssessments.id),
    )
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getFoodDefenseById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<FoodDefenseAssessment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hFoodDefenseAssessments)
    .where(
      and(
        eq(hFoodDefenseAssessments.id, id),
        eq(hFoodDefenseAssessments.tenantId, tenantId),
        eq(hFoodDefenseAssessments.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 ────────────────────────────────────────────

/**
 * 대응조치 추가 — residualScore 자동 재계산.
 */
export async function addCountermeasure(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  countermeasure: Countermeasure;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getFoodDefenseById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Food Defense 미존재 (id=${args.id})`);
  if (current.status === "archived") {
    throw new Error("종결 상태에서 대응조치 추가 불가");
  }
  if (
    args.countermeasure.residualLikelihood < 1 ||
    args.countermeasure.residualLikelihood > 5 ||
    args.countermeasure.residualImpact < 1 ||
    args.countermeasure.residualImpact > 5
  ) {
    throw new Error("residual likelihood/impact 는 1~5 범위");
  }

  const newCountermeasures = [...current.countermeasures, args.countermeasure];
  await db
    .update(hFoodDefenseAssessments)
    .set({
      countermeasures: newCountermeasures,
      residualScore: calculateResidualScore(newCountermeasures),
    })
    .where(
      and(
        eq(hFoodDefenseAssessments.id, args.id),
        eq(hFoodDefenseAssessments.tenantId, args.tenantId),
        eq(hFoodDefenseAssessments.industry, args.industry),
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
  const current = await getFoodDefenseById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Food Defense 미존재 (id=${args.id})`);
  if (current.status === "archived") {
    throw new Error("종결 상태에서 변경 불가");
  }

  await db
    .update(hFoodDefenseAssessments)
    .set({ justification: args.justification })
    .where(
      and(
        eq(hFoodDefenseAssessments.id, args.id),
        eq(hFoodDefenseAssessments.tenantId, args.tenantId),
        eq(hFoodDefenseAssessments.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이.
 *   - mitigated 진입 시: countermeasures 비어있지 않을 것
 *   - accepted 진입 시: justification 필수
 *   - mitigated/accepted 진입 시 approvedBy + approvedAt 기록
 *   - archived 진입 시 closedAt
 */
export async function transitionFoodDefenseStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: FoodDefenseStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getFoodDefenseById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Food Defense 미존재 (id=${args.id})`);
  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(`잘못된 상태 전이: ${current.status} → ${args.toStatus}`);
  }

  if (args.toStatus === "mitigated" && current.countermeasures.length === 0) {
    throw new Error("mitigated 전이 시 대응조치 1개 이상 필요");
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
    .update(hFoodDefenseAssessments)
    .set(updates)
    .where(
      and(
        eq(hFoodDefenseAssessments.id, args.id),
        eq(hFoodDefenseAssessments.tenantId, args.tenantId),
        eq(hFoodDefenseAssessments.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getFoodDefenseStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  category: ThreatCategory;
  status: FoodDefenseStatus;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hFoodDefenseAssessments.industry,
      category: hFoodDefenseAssessments.category,
      status: hFoodDefenseAssessments.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(hFoodDefenseAssessments)
    .where(eq(hFoodDefenseAssessments.tenantId, tenantId))
    .groupBy(
      hFoodDefenseAssessments.industry,
      hFoodDefenseAssessments.category,
      hFoodDefenseAssessments.status,
    );
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    category: r.category as ThreatCategory,
    status: r.status as FoodDefenseStatus,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(
  row: typeof hFoodDefenseAssessments.$inferSelect,
): FoodDefenseAssessment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category as ThreatCategory,
    targetPoint: row.targetPoint,
    likelihood: row.likelihood,
    impact: row.impact,
    countermeasures: (row.countermeasures as unknown as Countermeasure[]) ?? [],
    residualScore: row.residualScore ?? null,
    justification: row.justification ?? null,
    assessedBy: row.assessedBy ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as FoodDefenseStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
