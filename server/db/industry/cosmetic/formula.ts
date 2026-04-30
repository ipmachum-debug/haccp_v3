/**
 * 화장품 배합표 DB 헬퍼 (Phase 2-4a)
 *
 * formula CRUD + 배합 항목 (ingredient) CRUD + 배합비 합산 검증.
 *
 * 의존성 규칙:
 *   - 본 파일은 industry/cosmetic + shared-kernel 만 import
 */

import { eq, and, desc, asc } from "drizzle-orm";
import { getDb } from "../../connection";
import {
  hCosmeticFormula,
  hCosmeticFormulaIngredient,
} from "../../../../drizzle/schema/industry/cosmetic/formula";

export type FormulaStatus = "draft" | "approved" | "active" | "deprecated";

/**
 * FOR-YYYYMMDD-NNN 자동 채번 (tenant 별 일자 기준).
 */
export async function generateFormulaCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `FOR-${today}`;

  const rows = await db
    .select({ formulaCode: hCosmeticFormula.formulaCode })
    .from(hCosmeticFormula)
    .where(eq(hCosmeticFormula.tenantId, tenantId))
    .orderBy(desc(hCosmeticFormula.id))
    .limit(50);

  const sameDay = rows
    .map((r) => r.formulaCode)
    .filter((c) => c.startsWith(prefix));
  const maxSeq = sameDay.reduce((max, code) => {
    const n = parseInt(code.split("-")[2] || "0", 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return `${prefix}-${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function createFormula(
  data: {
    productId: number;
    name: string;
    version?: string;
    description?: string;
    createdBy: number;
  },
  tenantId: number,
): Promise<{ id: number; formulaCode: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const formulaCode = await generateFormulaCode(tenantId);

  const [result]: any = await db.insert(hCosmeticFormula).values({
    tenantId,
    formulaCode,
    productId: data.productId,
    name: data.name,
    version: data.version ?? "1.0",
    description: data.description ?? null,
    createdBy: data.createdBy,
    status: "draft",
  } as any);

  return { id: Number((result as any).insertId), formulaCode };
}

export async function listFormulas(
  filter: { status?: FormulaStatus; productId?: number } | undefined,
  tenantId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions = [eq(hCosmeticFormula.tenantId, tenantId)];
  if (filter?.status) conditions.push(eq(hCosmeticFormula.status, filter.status));
  if (filter?.productId)
    conditions.push(eq(hCosmeticFormula.productId, filter.productId));

  return db
    .select()
    .from(hCosmeticFormula)
    .where(and(...conditions))
    .orderBy(desc(hCosmeticFormula.id))
    .limit(200);
}

export async function getFormulaById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [row] = await db
    .select()
    .from(hCosmeticFormula)
    .where(
      and(eq(hCosmeticFormula.tenantId, tenantId), eq(hCosmeticFormula.id, id)),
    )
    .limit(1);
  return row ?? null;
}

export async function updateFormulaDraft(
  id: number,
  data: {
    name?: string;
    version?: string;
    description?: string | null;
    productId?: number;
  },
  tenantId: number,
): Promise<{ updated: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const existing = await getFormulaById(id, tenantId);
  if (!existing) return { updated: false, reason: "not found" };
  if (existing.status !== "draft") {
    return { updated: false, reason: `status='${existing.status}' — draft 만 수정 가능` };
  }

  const update: any = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.version !== undefined) update.version = data.version;
  if (data.description !== undefined) update.description = data.description;
  if (data.productId !== undefined) update.productId = data.productId;

  await db
    .update(hCosmeticFormula)
    .set(update)
    .where(
      and(eq(hCosmeticFormula.tenantId, tenantId), eq(hCosmeticFormula.id, id)),
    );
  return { updated: true };
}

/**
 * 상태 전이 — draft → approved → active → deprecated
 *
 * 허용 그래프:
 *   draft       → approved
 *   approved    → active
 *   active      → deprecated
 *   draft       → deprecated (취소)
 *   approved    → deprecated (사용 중지)
 */
export async function transitionFormulaStatus(
  id: number,
  to: FormulaStatus,
  userId: number,
  tenantId: number,
): Promise<{ ok: boolean; reason?: string; newStatus?: FormulaStatus }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getFormulaById(id, tenantId);
  if (!current) return { ok: false, reason: "not found" };

  const allowed: Record<FormulaStatus, FormulaStatus[]> = {
    draft: ["approved", "deprecated"],
    approved: ["active", "deprecated"],
    active: ["deprecated"],
    deprecated: [],
  };

  if (!allowed[current.status as FormulaStatus]?.includes(to)) {
    return { ok: false, reason: `전이 불가: '${current.status}' → '${to}'` };
  }

  const update: any = { status: to };
  if (to === "approved") {
    update.approvedBy = userId;
    update.approvedAt = new Date();
  }

  await db
    .update(hCosmeticFormula)
    .set(update)
    .where(
      and(eq(hCosmeticFormula.tenantId, tenantId), eq(hCosmeticFormula.id, id)),
    );
  return { ok: true, newStatus: to };
}

export async function deleteDraftFormula(
  id: number,
  tenantId: number,
): Promise<{ deleted: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const existing = await getFormulaById(id, tenantId);
  if (!existing) return { deleted: false, reason: "not found" };
  if (existing.status !== "draft") {
    return { deleted: false, reason: "draft 만 삭제 가능" };
  }

  // ingredient 도 함께 cascade 삭제
  await db
    .delete(hCosmeticFormulaIngredient)
    .where(
      and(
        eq(hCosmeticFormulaIngredient.tenantId, tenantId),
        eq(hCosmeticFormulaIngredient.formulaId, id),
      ),
    );
  await db
    .delete(hCosmeticFormula)
    .where(
      and(eq(hCosmeticFormula.tenantId, tenantId), eq(hCosmeticFormula.id, id)),
    );
  return { deleted: true };
}

// ============================================================================
// 배합 항목 (ingredient) — formula 의 children
// ============================================================================

export async function listIngredientsByFormula(
  formulaId: number,
  tenantId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return db
    .select()
    .from(hCosmeticFormulaIngredient)
    .where(
      and(
        eq(hCosmeticFormulaIngredient.tenantId, tenantId),
        eq(hCosmeticFormulaIngredient.formulaId, formulaId),
      ),
    )
    .orderBy(asc(hCosmeticFormulaIngredient.sortOrder), asc(hCosmeticFormulaIngredient.id));
}

export async function addIngredient(
  data: {
    formulaId: number;
    materialName: string;
    materialCode?: string;
    inciName?: string;
    percentage: number;
    role?: string;
    sortOrder?: number;
    notes?: string;
  },
  tenantId: number,
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // formula 가 draft 상태인지 검증 (운영 표준은 추가 변경 금지)
  const formula = await getFormulaById(data.formulaId, tenantId);
  if (!formula) throw new Error("formula not found");
  if (formula.status !== "draft") {
    throw new Error(`formula status='${formula.status}' — draft 만 ingredient 추가 가능`);
  }

  const [result]: any = await db.insert(hCosmeticFormulaIngredient).values({
    tenantId,
    formulaId: data.formulaId,
    materialName: data.materialName,
    materialCode: data.materialCode ?? null,
    inciName: data.inciName ?? null,
    percentage: String(data.percentage),
    role: data.role ?? null,
    sortOrder: data.sortOrder ?? 0,
    notes: data.notes ?? null,
  } as any);

  return { id: Number((result as any).insertId) };
}

export async function deleteIngredient(
  id: number,
  tenantId: number,
): Promise<{ deleted: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 부모 formula 의 status 검증
  const [ing] = await db
    .select({ formulaId: hCosmeticFormulaIngredient.formulaId })
    .from(hCosmeticFormulaIngredient)
    .where(
      and(
        eq(hCosmeticFormulaIngredient.tenantId, tenantId),
        eq(hCosmeticFormulaIngredient.id, id),
      ),
    )
    .limit(1);
  if (!ing) return { deleted: false, reason: "not found" };

  const formula = await getFormulaById(Number(ing.formulaId), tenantId);
  if (!formula) return { deleted: false, reason: "formula not found" };
  if (formula.status !== "draft") {
    return { deleted: false, reason: `formula status='${formula.status}' — draft 만 수정 가능` };
  }

  await db
    .delete(hCosmeticFormulaIngredient)
    .where(
      and(
        eq(hCosmeticFormulaIngredient.tenantId, tenantId),
        eq(hCosmeticFormulaIngredient.id, id),
      ),
    );
  return { deleted: true };
}

/**
 * 배합비 합산 — 100% 인지 검증용.
 */
export async function summarizeIngredients(
  formulaId: number,
  tenantId: number,
): Promise<{ totalCount: number; totalPercentage: number; isHundred: boolean }> {
  const rows = await listIngredientsByFormula(formulaId, tenantId);
  const total = rows.reduce(
    (sum, r) => sum + Number(r.percentage ?? 0),
    0,
  );
  // 부동소수점 오차 허용 ±0.01
  const isHundred = Math.abs(total - 100) < 0.01;
  return {
    totalCount: rows.length,
    totalPercentage: Math.round(total * 10000) / 10000,
    isHundred,
  };
}
