/**
 * Allergen Management (알레르겐 관리) DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-11)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hAllergenAssessments } from "../../../../drizzle/schema/coreMes/quality/allergen";
import {
  type AllergenAssessment,
  type AllergenStatus,
  type SubjectType,
  type ControlMeasure,
  type IndustryContext,
  canTransition,
  isValidAllergenCode,
} from "../../../core-mes/quality/allergen";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateAllergenCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `AL-${year}-`;
  const rows = await db
    .select({ code: hAllergenAssessments.code })
    .from(hAllergenAssessments)
    .where(
      and(
        eq(hAllergenAssessments.tenantId, tenantId),
        sql`${hAllergenAssessments.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hAllergenAssessments.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^AL-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateAllergenInput = {
  tenantId: number;
  industry: IndustryContext;
  title: string;
  subjectType: SubjectType;
  subjectName: string;
  presentAllergens: string[];
  crossContactAllergens: string[];
  labelingStatement?: string | null;
  assessedBy?: number;
  industryMetadata?: Record<string, unknown> | null;
};

function assertValidCodes(codes: string[]): void {
  for (const c of codes) {
    if (!isValidAllergenCode(c)) throw new Error(`알 수 없는 알레르겐 코드: ${c}`);
  }
}

export async function createAllergen(
  input: CreateAllergenInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  assertValidCodes(input.presentAllergens);
  assertValidCodes(input.crossContactAllergens);
  const code = await generateAllergenCode(input.tenantId);

  const result = await db.insert(hAllergenAssessments).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    title: input.title,
    subjectType: input.subjectType,
    subjectName: input.subjectName,
    presentAllergens: input.presentAllergens,
    crossContactAllergens: input.crossContactAllergens,
    controlMeasures: [],
    labelingStatement: input.labelingStatement ?? null,
    status: "draft",
    assessedBy: input.assessedBy ?? null,
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId =
    (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listAllergen(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: AllergenStatus;
    subjectType?: SubjectType;
    /** 특정 알레르겐 코드를 함유/교차오염으로 포함하는 항목만 (JSON contains) */
    allergenCode?: string;
    limit?: number;
    offset?: number;
  },
): Promise<AllergenAssessment[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    eq(hAllergenAssessments.tenantId, tenantId),
    eq(hAllergenAssessments.industry, industry),
  ];
  if (options?.status) conds.push(eq(hAllergenAssessments.status, options.status));
  if (options?.subjectType)
    conds.push(eq(hAllergenAssessments.subjectType, options.subjectType));
  if (options?.allergenCode) {
    const code = JSON.stringify(options.allergenCode);
    conds.push(
      sql`(JSON_CONTAINS(${hAllergenAssessments.presentAllergens}, ${code}) OR JSON_CONTAINS(${hAllergenAssessments.crossContactAllergens}, ${code}))`,
    );
  }

  const rows = await db
    .select()
    .from(hAllergenAssessments)
    .where(and(...conds))
    .orderBy(desc(hAllergenAssessments.id))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getAllergenById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<AllergenAssessment | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hAllergenAssessments)
    .where(
      and(
        eq(hAllergenAssessments.id, id),
        eq(hAllergenAssessments.tenantId, tenantId),
        eq(hAllergenAssessments.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 ────────────────────────────────────────────

/**
 * 알레르겐 목록 수정 (present / crossContact) + 표시문구 갱신.
 */
export async function updateAllergens(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  presentAllergens?: string[];
  crossContactAllergens?: string[];
  labelingStatement?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getAllergenById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Allergen 미존재 (id=${args.id})`);
  if (current.status === "archived") throw new Error("종결 상태에서 변경 불가");

  const updates: Record<string, unknown> = {};
  if (args.presentAllergens) {
    assertValidCodes(args.presentAllergens);
    updates.presentAllergens = args.presentAllergens;
  }
  if (args.crossContactAllergens) {
    assertValidCodes(args.crossContactAllergens);
    updates.crossContactAllergens = args.crossContactAllergens;
  }
  if (args.labelingStatement !== undefined) {
    updates.labelingStatement = args.labelingStatement;
  }
  if (Object.keys(updates).length === 0) return;

  await db
    .update(hAllergenAssessments)
    .set(updates)
    .where(
      and(
        eq(hAllergenAssessments.id, args.id),
        eq(hAllergenAssessments.tenantId, args.tenantId),
        eq(hAllergenAssessments.industry, args.industry),
      ),
    );
}

/**
 * 통제수단 추가.
 */
export async function addControlMeasure(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  controlMeasure: ControlMeasure;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getAllergenById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Allergen 미존재 (id=${args.id})`);
  if (current.status === "archived") throw new Error("종결 상태에서 통제수단 추가 불가");

  const newMeasures = [...current.controlMeasures, args.controlMeasure];
  await db
    .update(hAllergenAssessments)
    .set({ controlMeasures: newMeasures })
    .where(
      and(
        eq(hAllergenAssessments.id, args.id),
        eq(hAllergenAssessments.tenantId, args.tenantId),
        eq(hAllergenAssessments.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이.
 *   - approved 진입 시 approvedBy + approvedAt 기록
 *   - archived 진입 시 closedAt
 */
export async function transitionAllergenStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: AllergenStatus;
  approvedBy?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getAllergenById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Allergen 미존재 (id=${args.id})`);
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
    .update(hAllergenAssessments)
    .set(updates)
    .where(
      and(
        eq(hAllergenAssessments.id, args.id),
        eq(hAllergenAssessments.tenantId, args.tenantId),
        eq(hAllergenAssessments.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getAllergenStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  subjectType: SubjectType;
  status: AllergenStatus;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hAllergenAssessments.industry,
      subjectType: hAllergenAssessments.subjectType,
      status: hAllergenAssessments.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(hAllergenAssessments)
    .where(eq(hAllergenAssessments.tenantId, tenantId))
    .groupBy(
      hAllergenAssessments.industry,
      hAllergenAssessments.subjectType,
      hAllergenAssessments.status,
    );
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    subjectType: r.subjectType as SubjectType,
    status: r.status as AllergenStatus,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(
  row: typeof hAllergenAssessments.$inferSelect,
): AllergenAssessment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    title: row.title,
    subjectType: row.subjectType as SubjectType,
    subjectName: row.subjectName,
    presentAllergens: (row.presentAllergens as unknown as string[]) ?? [],
    crossContactAllergens: (row.crossContactAllergens as unknown as string[]) ?? [],
    controlMeasures: (row.controlMeasures as unknown as ControlMeasure[]) ?? [],
    labelingStatement: row.labelingStatement ?? null,
    assessedBy: row.assessedBy ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as AllergenStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
