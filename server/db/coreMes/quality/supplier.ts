/**
 * Supplier (AVL) DB 헬퍼 — Layer 2 core-mes/quality (Phase Y-5)
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "../../connection";
import { hSuppliers } from "../../../../drizzle/schema/coreMes/quality/supplier";
import {
  type Supplier,
  type SupplierStatus,
  type SupplierCategory,
  type IndustryContext,
  canTransition,
  calculateNextEvaluationDate,
} from "../../../core-mes/quality/supplier";

// ─── 자동채번 ────────────────────────────────────────────

export async function generateSupplierCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const year = new Date().getFullYear();
  const prefix = `SUP-${year}-`;
  const rows = await db
    .select({ code: hSuppliers.code })
    .from(hSuppliers)
    .where(
      and(
        eq(hSuppliers.tenantId, tenantId),
        sql`${hSuppliers.code} LIKE ${prefix + "%"}`,
      ),
    )
    .orderBy(desc(hSuppliers.code))
    .limit(1);
  let next = 1;
  if (rows.length > 0) {
    const m = rows[0].code.match(/^SUP-\d{4}-(\d+)$/);
    if (m) next = Number(m[1]) + 1;
  }
  return `${prefix}${String(next).padStart(4, "0")}`;
}

// ─── CRUD ────────────────────────────────────────────

export type CreateSupplierInput = {
  tenantId: number;
  industry: IndustryContext;
  name: string;
  category: SupplierCategory;
  contactPerson: string;
  email: string;
  phone: string;
  bizNumber?: string | null;
  address?: string | null;
  reEvaluationIntervalMonths?: number;
  industryMetadata?: Record<string, unknown> | null;
};

export async function createSupplier(
  input: CreateSupplierInput,
): Promise<{ id: number; code: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const code = await generateSupplierCode(input.tenantId);

  const result = await db.insert(hSuppliers).values({
    tenantId: input.tenantId,
    industry: input.industry,
    code,
    name: input.name,
    category: input.category,
    contactPerson: input.contactPerson,
    email: input.email,
    phone: input.phone,
    bizNumber: input.bizNumber ?? null,
    address: input.address ?? null,
    reEvaluationIntervalMonths: input.reEvaluationIntervalMonths ?? 12,
    status: "under_evaluation",
    industryMetadata: input.industryMetadata ?? null,
  });

  const insertId =
    (result as unknown as Array<{ insertId?: number }>)[0]?.insertId ?? 0;
  return { id: Number(insertId), code };
}

export async function listSuppliers(
  tenantId: number,
  industry: IndustryContext,
  options?: {
    status?: SupplierStatus;
    category?: SupplierCategory;
    /** next_evaluation_date 임박 (예: "2026-06-01") 이전 항목만 */
    dueBefore?: string;
    limit?: number;
    offset?: number;
  },
): Promise<Supplier[]> {
  const db = await getDb();
  if (!db) return [];
  const conds = [
    eq(hSuppliers.tenantId, tenantId),
    eq(hSuppliers.industry, industry),
  ];
  if (options?.status) conds.push(eq(hSuppliers.status, options.status));
  if (options?.category) conds.push(eq(hSuppliers.category, options.category));
  if (options?.dueBefore)
    conds.push(sql`${hSuppliers.nextEvaluationDate} <= ${options.dueBefore}`);

  const rows = await db
    .select()
    .from(hSuppliers)
    .where(and(...conds))
    .orderBy(desc(hSuppliers.id))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
  return rows.map(rowToEntity);
}

export async function getSupplierById(
  tenantId: number,
  industry: IndustryContext,
  id: number,
): Promise<Supplier | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(hSuppliers)
    .where(
      and(
        eq(hSuppliers.id, id),
        eq(hSuppliers.tenantId, tenantId),
        eq(hSuppliers.industry, industry),
      ),
    )
    .limit(1);
  return rows[0] ? rowToEntity(rows[0]) : null;
}

// ─── 워크플로 ────────────────────────────────────────────

/**
 * 평가 점수 + 비고 입력 (under_evaluation 상태에서만).
 */
export async function setSupplierEvaluation(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  evaluationScore: number;
  notes?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getSupplierById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Supplier 미존재 (id=${args.id})`);
  if (current.status === "archived" || current.status === "disqualified") {
    throw new Error(`종결 상태에서 평가 변경 불가 (status=${current.status})`);
  }
  if (args.evaluationScore < 0 || args.evaluationScore > 100) {
    throw new Error("evaluationScore 는 0~100 범위");
  }

  const updates: Record<string, unknown> = { evaluationScore: args.evaluationScore };
  if (args.notes !== undefined) updates.notes = args.notes;

  await db
    .update(hSuppliers)
    .set(updates)
    .where(
      and(
        eq(hSuppliers.id, args.id),
        eq(hSuppliers.tenantId, args.tenantId),
        eq(hSuppliers.industry, args.industry),
      ),
    );
}

/**
 * 상태 전이.
 *   - approved 진입 시 approvedDate=오늘 + nextEvaluationDate 자동 계산
 *   - archived/disqualified 진입 시 closedAt 자동 기록
 */
export async function transitionSupplierStatus(args: {
  tenantId: number;
  industry: IndustryContext;
  id: number;
  toStatus: SupplierStatus;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const current = await getSupplierById(args.tenantId, args.industry, args.id);
  if (!current) throw new Error(`Supplier 미존재 (id=${args.id})`);
  if (!canTransition(current.status, args.toStatus)) {
    throw new Error(
      `잘못된 상태 전이: ${current.status} → ${args.toStatus}`,
    );
  }

  const updates: Record<string, unknown> = { status: args.toStatus };

  if (args.toStatus === "approved") {
    const today = new Date().toISOString().slice(0, 10);
    updates.approvedDate = today;
    updates.nextEvaluationDate = calculateNextEvaluationDate(
      today,
      current.reEvaluationIntervalMonths,
    );
  }
  if (args.toStatus === "archived" || args.toStatus === "disqualified") {
    updates.closedAt = new Date();
  }

  await db
    .update(hSuppliers)
    .set(updates)
    .where(
      and(
        eq(hSuppliers.id, args.id),
        eq(hSuppliers.tenantId, args.tenantId),
        eq(hSuppliers.industry, args.industry),
      ),
    );
}

// ─── 통계 ────────────────────────────────────────────

export async function getSupplierStats(
  tenantId: number,
): Promise<Array<{
  industry: IndustryContext;
  category: SupplierCategory;
  status: SupplierStatus;
  count: number;
}>> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      industry: hSuppliers.industry,
      category: hSuppliers.category,
      status: hSuppliers.status,
      count: sql<number>`COUNT(*)`,
    })
    .from(hSuppliers)
    .where(eq(hSuppliers.tenantId, tenantId))
    .groupBy(hSuppliers.industry, hSuppliers.category, hSuppliers.status);
  return rows.map((r) => ({
    industry: r.industry as IndustryContext,
    category: r.category as SupplierCategory,
    status: r.status as SupplierStatus,
    count: Number(r.count),
  }));
}

// ─── 변환 ────────────────────────────────────────────

function rowToEntity(
  row: typeof hSuppliers.$inferSelect,
): Supplier {
  const dateOrNull = (v: unknown): string | null => {
    if (!v) return null;
    if (typeof v === "string") return v;
    return (v as Date).toISOString().slice(0, 10);
  };
  return {
    id: row.id,
    tenantId: row.tenantId,
    industry: row.industry as IndustryContext,
    code: row.code,
    name: row.name,
    category: row.category as SupplierCategory,
    contactPerson: row.contactPerson,
    email: row.email,
    phone: row.phone,
    bizNumber: row.bizNumber ?? null,
    address: row.address ?? null,
    approvedDate: dateOrNull(row.approvedDate),
    reEvaluationIntervalMonths: row.reEvaluationIntervalMonths,
    nextEvaluationDate: dateOrNull(row.nextEvaluationDate),
    evaluationScore: row.evaluationScore ?? null,
    notes: row.notes ?? null,
    closedAt: row.closedAt ?? null,
    status: row.status as SupplierStatus,
    industryMetadata: (row.industryMetadata as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
