/**
 * BMR 별 원료 투입 기록 DB 헬퍼 (Phase 2-4b)
 *
 * 의존성:
 *   - industry/cosmetic + shared-kernel 만 import
 */

import { eq, and, asc } from "drizzle-orm";
import { getDb } from "../../connection";
import { hCosmeticBmrIngredient } from "../../../../drizzle/schema/industry/cosmetic/bmrIngredient";

export async function listIngredientsByBmr(bmrId: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  return db
    .select()
    .from(hCosmeticBmrIngredient)
    .where(
      and(
        eq(hCosmeticBmrIngredient.tenantId, tenantId),
        eq(hCosmeticBmrIngredient.bmrId, bmrId),
      ),
    )
    .orderBy(asc(hCosmeticBmrIngredient.id))
    .limit(500);
}

export async function createBmrIngredient(
  data: {
    bmrId: number;
    materialName: string;
    materialCode?: string;
    inciName?: string;
    lotNumber?: string;
    plannedQuantity?: number;
    actualQuantity?: number;
    unit?: string;
    notes?: string;
    inputBy?: number;
  },
  tenantId: number,
): Promise<{ id: number }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [result]: any = await db.insert(hCosmeticBmrIngredient).values({
    tenantId,
    bmrId: data.bmrId,
    materialName: data.materialName,
    materialCode: data.materialCode ?? null,
    inciName: data.inciName ?? null,
    lotNumber: data.lotNumber ?? null,
    plannedQuantity:
      data.plannedQuantity !== undefined ? String(data.plannedQuantity) : null,
    actualQuantity:
      data.actualQuantity !== undefined ? String(data.actualQuantity) : null,
    unit: data.unit ?? "g",
    notes: data.notes ?? null,
    inputBy: data.inputBy ?? null,
    inputAt: data.actualQuantity !== undefined ? new Date() : null,
  } as any);

  return { id: Number((result as any).insertId) };
}

export async function updateBmrIngredient(
  id: number,
  data: {
    materialName?: string;
    materialCode?: string | null;
    inciName?: string | null;
    lotNumber?: string | null;
    plannedQuantity?: number | null;
    actualQuantity?: number | null;
    unit?: string;
    notes?: string | null;
    inputBy?: number;
  },
  tenantId: number,
): Promise<{ updated: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const update: any = {};
  if (data.materialName !== undefined) update.materialName = data.materialName;
  if (data.materialCode !== undefined) update.materialCode = data.materialCode;
  if (data.inciName !== undefined) update.inciName = data.inciName;
  if (data.lotNumber !== undefined) update.lotNumber = data.lotNumber;
  if (data.plannedQuantity !== undefined)
    update.plannedQuantity =
      data.plannedQuantity === null ? null : String(data.plannedQuantity);
  if (data.actualQuantity !== undefined) {
    update.actualQuantity =
      data.actualQuantity === null ? null : String(data.actualQuantity);
    if (data.actualQuantity !== null) {
      update.inputAt = new Date();
      if (data.inputBy !== undefined) update.inputBy = data.inputBy;
    }
  }
  if (data.unit !== undefined) update.unit = data.unit;
  if (data.notes !== undefined) update.notes = data.notes;

  await db
    .update(hCosmeticBmrIngredient)
    .set(update)
    .where(
      and(
        eq(hCosmeticBmrIngredient.tenantId, tenantId),
        eq(hCosmeticBmrIngredient.id, id),
      ),
    );
  return { updated: true };
}

export async function deleteBmrIngredient(
  id: number,
  tenantId: number,
): Promise<{ deleted: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const result: any = await db
    .delete(hCosmeticBmrIngredient)
    .where(
      and(
        eq(hCosmeticBmrIngredient.tenantId, tenantId),
        eq(hCosmeticBmrIngredient.id, id),
      ),
    );
  const affected =
    (result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0;
  return { deleted: Number(affected) > 0 };
}

/**
 * BMR 의 원료 투입 요약 — planned/actual 합산 + 실측 차이.
 *
 * 활용:
 *   - 계획량 대비 실제 차이 추적 (loss / overage)
 *   - 모든 항목에 actual 입력됐는지 확인 (BMR completed 전 검증)
 */
export async function summarizeBmrIngredients(
  bmrId: number,
  tenantId: number,
): Promise<{
  total: number;
  pendingActual: number; // actual 미입력 항목 수
  totalPlanned: number;
  totalActual: number;
  variance: number; // actual - planned
  allActual: boolean;
}> {
  const rows = await listIngredientsByBmr(bmrId, tenantId);
  const total = rows.length;
  const pendingActual = rows.filter((r) => r.actualQuantity === null).length;
  const totalPlanned = rows.reduce(
    (sum, r) => sum + (r.plannedQuantity !== null ? Number(r.plannedQuantity) : 0),
    0,
  );
  const totalActual = rows.reduce(
    (sum, r) => sum + (r.actualQuantity !== null ? Number(r.actualQuantity) : 0),
    0,
  );
  return {
    total,
    pendingActual,
    totalPlanned: Math.round(totalPlanned * 10000) / 10000,
    totalActual: Math.round(totalActual * 10000) / 10000,
    variance: Math.round((totalActual - totalPlanned) * 10000) / 10000,
    allActual: total > 0 && pendingActual === 0,
  };
}
