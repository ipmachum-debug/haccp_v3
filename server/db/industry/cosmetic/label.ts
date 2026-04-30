/**
 * 화장품 라벨 DB 헬퍼 (Phase 2-5)
 */

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../../connection";
import { hCosmeticLabel } from "../../../../drizzle/schema/industry/cosmetic/label";

export type LabelStatus = "draft" | "approved" | "active" | "deprecated";

/**
 * KFDA 알러지 유발물질 22종 (참고 — 향후 마스터 테이블화 가능)
 */
export const KFDA_ALLERGENS = [
  "Amyl Cinnamal",
  "Benzyl Alcohol",
  "Cinnamyl Alcohol",
  "Citral",
  "Eugenol",
  "Hydroxycitronellal",
  "Isoeugenol",
  "Amylcinnamyl Alcohol",
  "Benzyl Salicylate",
  "Cinnamal",
  "Coumarin",
  "Geraniol",
  "Hydroxyisohexyl 3-Cyclohexene Carboxaldehyde",
  "Anise Alcohol",
  "Benzyl Cinnamate",
  "Farnesol",
  "Butylphenyl Methylpropional",
  "Linalool",
  "Benzyl Benzoate",
  "Citronellol",
  "Hexyl Cinnamal",
  "Limonene",
] as const;

export async function generateLabelCode(tenantId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `LBL-${today}`;

  const rows = await db
    .select({ labelCode: hCosmeticLabel.labelCode })
    .from(hCosmeticLabel)
    .where(eq(hCosmeticLabel.tenantId, tenantId))
    .orderBy(desc(hCosmeticLabel.id))
    .limit(50);

  const sameDay = rows
    .map((r) => r.labelCode)
    .filter((c) => c.startsWith(prefix));
  const maxSeq = sameDay.reduce((max, code) => {
    const n = parseInt(code.split("-")[2] || "0", 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);

  return `${prefix}-${String(maxSeq + 1).padStart(3, "0")}`;
}

export interface LabelCreateInput {
  productId: number;
  productNameKo: string;
  productNameEn?: string;
  capacity?: string;
  inciList?: string;
  allergenList?: string;
  usageInstructions?: string;
  cautions?: string;
  storageMethod?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  responsibleParty?: string;
  createdBy: number;
}

export async function createLabel(
  data: LabelCreateInput,
  tenantId: number,
): Promise<{ id: number; labelCode: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const labelCode = await generateLabelCode(tenantId);

  const [result]: any = await db.insert(hCosmeticLabel).values({
    tenantId,
    labelCode,
    productId: data.productId,
    productNameKo: data.productNameKo,
    productNameEn: data.productNameEn ?? null,
    capacity: data.capacity ?? null,
    inciList: data.inciList ?? null,
    allergenList: data.allergenList ?? null,
    usageInstructions: data.usageInstructions ?? null,
    cautions: data.cautions ?? null,
    storageMethod: data.storageMethod ?? null,
    manufacturerName: data.manufacturerName ?? null,
    manufacturerAddress: data.manufacturerAddress ?? null,
    responsibleParty: data.responsibleParty ?? null,
    status: "draft",
    createdBy: data.createdBy,
  } as any);

  return { id: Number((result as any).insertId), labelCode };
}

export async function listLabels(
  filter: { status?: LabelStatus; productId?: number } | undefined,
  tenantId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const conditions = [eq(hCosmeticLabel.tenantId, tenantId)];
  if (filter?.status) conditions.push(eq(hCosmeticLabel.status, filter.status));
  if (filter?.productId)
    conditions.push(eq(hCosmeticLabel.productId, filter.productId));

  return db
    .select()
    .from(hCosmeticLabel)
    .where(and(...conditions))
    .orderBy(desc(hCosmeticLabel.id))
    .limit(200);
}

export async function getLabelById(id: number, tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [row] = await db
    .select()
    .from(hCosmeticLabel)
    .where(
      and(eq(hCosmeticLabel.tenantId, tenantId), eq(hCosmeticLabel.id, id)),
    )
    .limit(1);
  return row ?? null;
}

export interface LabelUpdateInput {
  productId?: number;
  productNameKo?: string;
  productNameEn?: string | null;
  capacity?: string | null;
  inciList?: string | null;
  allergenList?: string | null;
  usageInstructions?: string | null;
  cautions?: string | null;
  storageMethod?: string | null;
  manufacturerName?: string | null;
  manufacturerAddress?: string | null;
  responsibleParty?: string | null;
}

export async function updateLabelDraft(
  id: number,
  data: LabelUpdateInput,
  tenantId: number,
): Promise<{ updated: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const existing = await getLabelById(id, tenantId);
  if (!existing) return { updated: false, reason: "not found" };
  if (existing.status !== "draft") {
    return { updated: false, reason: `status='${existing.status}' — draft 만 수정 가능` };
  }

  const update: any = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined) update[k] = v;
  }

  await db
    .update(hCosmeticLabel)
    .set(update)
    .where(
      and(eq(hCosmeticLabel.tenantId, tenantId), eq(hCosmeticLabel.id, id)),
    );
  return { updated: true };
}

export async function transitionLabelStatus(
  id: number,
  to: LabelStatus,
  userId: number,
  tenantId: number,
): Promise<{ ok: boolean; reason?: string; newStatus?: LabelStatus }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const current = await getLabelById(id, tenantId);
  if (!current) return { ok: false, reason: "not found" };

  const allowed: Record<LabelStatus, LabelStatus[]> = {
    draft: ["approved", "deprecated"],
    approved: ["active", "deprecated"],
    active: ["deprecated"],
    deprecated: [],
  };
  if (!allowed[current.status as LabelStatus]?.includes(to)) {
    return { ok: false, reason: `전이 불가: '${current.status}' → '${to}'` };
  }

  const update: any = { status: to };
  if (to === "approved") {
    update.approvedBy = userId;
    update.approvedAt = new Date();
  }

  await db
    .update(hCosmeticLabel)
    .set(update)
    .where(
      and(eq(hCosmeticLabel.tenantId, tenantId), eq(hCosmeticLabel.id, id)),
    );
  return { ok: true, newStatus: to };
}

export async function deleteDraftLabel(
  id: number,
  tenantId: number,
): Promise<{ deleted: boolean; reason?: string }> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const existing = await getLabelById(id, tenantId);
  if (!existing) return { deleted: false, reason: "not found" };
  if (existing.status !== "draft") {
    return { deleted: false, reason: "draft 만 삭제 가능" };
  }

  await db
    .delete(hCosmeticLabel)
    .where(
      and(eq(hCosmeticLabel.tenantId, tenantId), eq(hCosmeticLabel.id, id)),
    );
  return { deleted: true };
}

/**
 * INCI list 정렬 헬퍼 (KFDA 규칙 반영).
 *
 * ingredient 입력: { name: string, percentage: number }[]
 *   - 1% 초과: percentage 내림차순
 *   - 1% 이하: 그룹 내 임의 순서 (입력 순서 유지)
 *
 * 반환: "Water, Glycerin, Butylene Glycol, ..."
 */
export function buildInciList(
  ingredients: ReadonlyArray<{ name: string; percentage: number }>,
): string {
  const above1 = ingredients
    .filter((i) => i.percentage > 1)
    .sort((a, b) => b.percentage - a.percentage);
  const below1 = ingredients.filter((i) => i.percentage <= 1);
  return [...above1, ...below1].map((i) => i.name).join(", ");
}

/**
 * INCI 목록에서 KFDA 알러지 유발물질 추출.
 */
export function extractAllergens(inciText: string): string[] {
  if (!inciText) return [];
  const upper = inciText.toUpperCase();
  return KFDA_ALLERGENS.filter((a) => upper.includes(a.toUpperCase()));
}
