/**
 * 화장품 BMR DB 헬퍼 (Phase 2 Cosmetic GMP)
 *
 * ============================================================================
 * 의존성 규칙 (.dependency-cruiser.cjs):
 *   - 본 파일은 platform / shared-kernel / industry/cosmetic 만 import
 *   - food / 다른 industry 와 cross-ref 금지 (ADR-002)
 *
 * lifecycle:
 *   draft → approved → manufacturing → completed
 *                  ↓ (어디서든)
 *                  rejected
 * ============================================================================
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../connection";
import { hCosmeticBmr } from "../../../../drizzle/schema/industry/cosmetic/bmr";

export type BmrStatus = "draft" | "approved" | "manufacturing" | "completed" | "rejected";

/**
 * BMR-YYYYMMDD-NNN 자동 채번 (tenant 별 일자 기준 일련번호).
 * idempotent — 같은 tenant + 일자에 N+1 반환.
 */
export async function generateBmrCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const today = new Date()
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, ""); // YYYYMMDD
  const prefix = `BMR-${today}`;

  // 같은 prefix 중 가장 큰 일련번호 조회 (LIKE prefix-%)
  const rows = await db
    .select({ bmrCode: hCosmeticBmr.bmrCode })
    .from(hCosmeticBmr)
    .where(eq(hCosmeticBmr.tenantId, tenantId))
    .orderBy(desc(hCosmeticBmr.id))
    .limit(50);

  const sameDay = rows
    .map((r) => r.bmrCode)
    .filter((c) => c.startsWith(prefix));
  const maxSeq = sameDay.reduce((max, code) => {
    const n = parseInt(code.split("-")[2] || "0", 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return `${prefix}-${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function createCosmeticBmr(
  data: {
    productId: number;
    plannedQuantityKg: number;
    batchNumber?: string;
    manufacturingDate?: string;
    notes?: string;
    createdBy: number;
  },
  tenantId: number,
): Promise<{ id: number; bmrCode: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const bmrCode = await generateBmrCode(tenantId);

  const [result]: any = await db.insert(hCosmeticBmr).values({
    tenantId,
    bmrCode,
    productId: data.productId,
    batchNumber: data.batchNumber ?? null,
    plannedQuantityKg: String(data.plannedQuantityKg),
    manufacturingDate: data.manufacturingDate ?? null,
    notes: data.notes ?? null,
    createdBy: data.createdBy,
    status: "draft",
  } as any);

  return { id: Number((result as any).insertId), bmrCode };
}

export async function getCosmeticBmrById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [row] = await db
    .select()
    .from(hCosmeticBmr)
    .where(and(eq(hCosmeticBmr.tenantId, tenantId), eq(hCosmeticBmr.id, id)))
    .limit(1);
  return row ?? null;
}

export async function listCosmeticBmrs(
  filter: { status?: BmrStatus } | undefined,
  tenantId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions = [eq(hCosmeticBmr.tenantId, tenantId)];
  if (filter?.status) conditions.push(eq(hCosmeticBmr.status, filter.status));

  return db
    .select()
    .from(hCosmeticBmr)
    .where(and(...conditions))
    .orderBy(desc(hCosmeticBmr.id))
    .limit(200);
}

export async function updateCosmeticBmrDraft(
  id: number,
  data: {
    productId?: number;
    plannedQuantityKg?: number;
    batchNumber?: string | null;
    manufacturingDate?: string | null;
    notes?: string | null;
  },
  tenantId: number,
): Promise<{ updated: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // draft 상태에서만 수정 가능
  const existing = await getCosmeticBmrById(id, tenantId);
  if (!existing) return { updated: false, reason: "not found" };
  if (existing.status !== "draft") {
    return { updated: false, reason: `상태='${existing.status}' — draft 만 수정 가능` };
  }

  const update: any = {};
  if (data.productId !== undefined) update.productId = data.productId;
  if (data.plannedQuantityKg !== undefined)
    update.plannedQuantityKg = String(data.plannedQuantityKg);
  if (data.batchNumber !== undefined) update.batchNumber = data.batchNumber;
  if (data.manufacturingDate !== undefined)
    update.manufacturingDate = data.manufacturingDate;
  if (data.notes !== undefined) update.notes = data.notes;

  await db
    .update(hCosmeticBmr)
    .set(update)
    .where(and(eq(hCosmeticBmr.tenantId, tenantId), eq(hCosmeticBmr.id, id)));
  return { updated: true };
}

/**
 * 상태 전이 헬퍼 — 허용된 전이만 수행.
 *
 * 허용 그래프:
 *   draft         → approved (approve)
 *   approved      → manufacturing (startManufacturing)
 *   manufacturing → completed (markCompleted)
 *   any           → rejected (reject)
 */
export async function transitionBmrStatus(
  id: number,
  to: BmrStatus,
  userId: number,
  tenantId: number,
  extra?: { actualQuantityKg?: number; rejectReason?: string },
): Promise<{ ok: boolean; reason?: string; newStatus?: BmrStatus }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getCosmeticBmrById(id, tenantId);
  if (!current) return { ok: false, reason: "not found" };

  const allowed: Record<BmrStatus, BmrStatus[]> = {
    draft: ["approved", "rejected"],
    approved: ["manufacturing", "rejected"],
    manufacturing: ["completed", "rejected"],
    completed: [], // 완료 후 추가 전이 없음 (Phase 2-2 에서 released 추가 가능)
    rejected: [], // 거절 후 재오픈은 별도 mutation
  };

  if (!allowed[current.status as BmrStatus]?.includes(to)) {
    return {
      ok: false,
      reason: `전이 불가: '${current.status}' → '${to}'`,
    };
  }

  const update: any = { status: to };
  const now = new Date();

  if (to === "approved") {
    update.approvedBy = userId;
    update.approvedAt = now;
  } else if (to === "manufacturing") {
    update.manufacturingStartedAt = now;
  } else if (to === "completed") {
    update.completedBy = userId;
    update.completedAt = now;
    if (extra?.actualQuantityKg !== undefined) {
      update.actualQuantityKg = String(extra.actualQuantityKg);
    }
  } else if (to === "rejected") {
    update.rejectedBy = userId;
    update.rejectedAt = now;
    if (extra?.rejectReason) update.rejectReason = extra.rejectReason;
  }

  await db
    .update(hCosmeticBmr)
    .set(update)
    .where(and(eq(hCosmeticBmr.tenantId, tenantId), eq(hCosmeticBmr.id, id)));
  return { ok: true, newStatus: to };
}

export async function deleteDraftBmr(
  id: number,
  tenantId: number,
): Promise<{ deleted: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const existing = await getCosmeticBmrById(id, tenantId);
  if (!existing) return { deleted: false, reason: "not found" };
  if (existing.status !== "draft") {
    return { deleted: false, reason: "draft 만 삭제 가능" };
  }
  await db
    .delete(hCosmeticBmr)
    .where(and(eq(hCosmeticBmr.tenantId, tenantId), eq(hCosmeticBmr.id, id)));
  return { deleted: true };
}
