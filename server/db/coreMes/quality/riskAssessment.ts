/**
 * Risk Assessment DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-6)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hRiskAssessments } from "../../../../drizzle/schema/coreMes/quality/riskAssessment";
import {
  type RiskAssessment,
  type RiskCategory,
  type RiskStatus,
  type MitigationAction,
  type IndustryContext,
  canTransition,
  calculateResidualScore,
} from "../../../core-mes/quality/riskAssessment";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateRiskCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `RA-${year}-`;
  const rows = await db
    .select({ code: hRiskAssessments.code })
    .from(hRiskAssessments)
    .where(
      and(
        eq(hRiskAssessments.tenantId, tenantId),
        sql`${hRiskAssessments.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hRiskAssessments.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^RA-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateRiskAssessmentInput = {
  tenantId: number;
  industry: IndustryContext;
  title: string;
  description: string;
  category: RiskCategory;
  scope: string;
  probability: number;
  severity: number;
  assessedBy?: number;
  industryMetadata?: Record<string, unknown> | null;
};

export async function createRiskAssessment(
  input: CreateRiskAssessmentInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  if (input.probability < 1 || input.probability > 5) {
    throw new Error("probability 는 1~5 범위");
  }
  if (input.severity < 1 || input.severity > 5) {
    throw new Error("severity 는 1~5 범위");
  }
  const code = await generateRiskCode(input.tenantId);

  const result = await db.insert(hRiskAssessments).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    title: input.title,
    description: input.description,
    category: input.category,
    scope: input.scope,
    probability: input.probability,
    severity: input.severity,
    mitigations: [],
    status: "draft",
    assessedBy: input.assessedBy ?? null,
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId =
    (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listRiskAssessments(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: RiskStatus;
    category?: RiskCategory;
    /** 잔여 위험 점수 이상 필터 (예: 15 → 고위험만) */
    minResidualScore?: number;
    limit?: number;
    offset?: number;
  },
): Promise<RiskAssessment[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    eq(hRiskAssessments.tenantId, tenantId),
    eq(hRiskAssessments.industry, industry),
  ];
  if (options?.status) conds.push(eq(hRiskAssessments.status, options.status));
  if (options?.category)
    conds.push(eq(hRiskAssessments.category, options.category));
  if (options?.minResidualScore)
    conds.push(sql`${hRiskAssessments.residualScore} >= ${options.minResidualScore}`);

  const rows = await db
    .select()
    .from(hRiskAssessments)
    .where(and(...conds))
    .orderBy(
      desc(sql`${hRiskAssessments.probability} * ${hRiskAssessments.severity}`),
      desc(hRiskAssessments.id),
    )
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getRiskAssessmentById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<RiskAssessment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hRiskAssessments)
    .where(
      and(
        eq(hRiskAssessments.id, id),
        eq(hRiskAssessments.tenantId, tenantId),
        eq(hRiskAssessments.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 ────────────────────────────────────────────

/**
 * 완화 조치 추가 — residualScore 자동 재계산.
 */
export async function addMitigationAction(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  mitigation: MitigationAction;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getRiskAssessmentById(
    args.tenantId,
    args.industry,
    args.id,
  );
  if (!current) throw new Error(`Risk Assessment 미존재 (id=${args.id})`);
  if (current.status === "archived") {
    throw new Error("종결 상태에서 완화 조치 추가 불가");
  }
  if (
    args.mitigation.residualProbability < 1 ||
    args.mitigation.residualProbability > 5 ||
    args.mitigation.residualSeverity < 1 ||
    args.mitigation.residualSeverity > 5
  ) {
    throw new Error("residual probability/severity 는 1~5 범위");
  }

  const newMitigations = [...current.mitigations, args.mitigation];
  await db
    .update(hRiskAssessments)
    .set({
      mitigations: newMitigations,
      residualScore: calculateResidualScore(newMitigations),
    })
    .where(
      and(
        eq(hRiskAssessments.id, args.id),
        eq(hRiskAssessments.tenantId, args.tenantId),
        eq(hRiskAssessments.industry, args.industry),
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
  const current = await getRiskAssessmentById(
    args.tenantId,
    args.industry,
    args.id,
  );
  if (!current) throw new Error(`Risk Assessment 미존재 (id=${args.id})`);
  if (current.status === "archived") {
    throw new Error("종결 상태에서 변경 불가");
  }

  await db
    .update(hRiskAssessments)
    .set({ justification: args.justification })
    .where(
      and(
        eq(hRiskAssessments.id, args.id),
        eq(hRiskAssessments.tenantId, args.tenantId),
        eq(hRiskAssessments.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이.
 *   - mitigated 진입 시: mitigations 비어있지 않을 것
 *   - accepted 진입 시: justification 필수
 *   - mitigated/accepted 진입 시 approvedBy + approvedAt 기록
 *   - archived 진입 시 closedAt
 */
export async function transitionRiskStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: RiskStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getRiskAssessmentById(
    args.tenantId,
    args.industry,
    args.id,
  );
  if (!current) throw new Error(`Risk Assessment 미존재 (id=${args.id})`);
  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(
      `잘못된 상태 전이: ${current.status} → ${args.toStatus}`,
    );
  }

  if (args.toStatus === "mitigated" && current.mitigations.length === 0) {
    throw new Error("mitigated 전이 시 완화 조치 1개 이상 필요");
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
    .update(hRiskAssessments)
    .set(updates)
    .where(
      and(
        eq(hRiskAssessments.id, args.id),
        eq(hRiskAssessments.tenantId, args.tenantId),
        eq(hRiskAssessments.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getRiskStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  category: RiskCategory;
  status: RiskStatus;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hRiskAssessments.industry,
      category: hRiskAssessments.category,
      status: hRiskAssessments.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(hRiskAssessments)
    .where(eq(hRiskAssessments.tenantId, tenantId))
    .groupBy(
      hRiskAssessments.industry,
      hRiskAssessments.category,
      hRiskAssessments.status,
    );
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    category: r.category as RiskCategory,
    status: r.status as RiskStatus,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(
  row: typeof hRiskAssessments.$inferSelect,
): RiskAssessment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category as RiskCategory,
    scope: row.scope,
    probability: row.probability,
    severity: row.severity,
    mitigations: (row.mitigations as unknown as MitigationAction[]) ?? [],
    residualScore: row.residualScore ?? null,
    justification: row.justification ?? null,
    assessedBy: row.assessedBy ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as RiskStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
