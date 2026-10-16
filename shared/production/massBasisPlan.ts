/**
 * 배치의 원물·공정·완제품 기준 스냅샷 만들기 (2026-10-16, 수율 기준 PR B)
 *
 * 레시피 버전(기준 완제품 kg·기준 원물 합계 kg·사용 여부) + 원료 행(운영 기준 원물 kg·전처리 배율·법적 배합)과
 * 계획 완제품 kg 로 행별 원물 kg / 공정 kg 를 계산한다 (computeMassBasis).
 * 배치 생성 때 이 결과를 고정해 두면, 이후 레시피를 고쳐도 그 배치의 기준은 바뀌지 않는다.
 *
 * 원료 행의 기준 원물 kg 결정 (추정하지 않는다):
 *   1) basis_raw_kg 가 있으면 그 값 (운영 기준 — 엑셀 kg 등)
 *   2) 없고 단위가 kg·g 면 quantity 그대로 (절대량)
 *   3) 없고 단위가 % 면 기준 원물 합계 kg × % (합계가 없으면 오류)
 *   그 밖의 단위(개·포대 등)는 오류 — 환산 근거 없이 kg 로 보지 않는다.
 * 사용 여부(mass_basis_enabled)가 꺼진 버전은 만들지 않는다 → 기존 계산 그대로.
 */
import { computeMassBasis, MassBasisError, type BasisRow } from "./massBasis";

export const MASS_BASIS_CALC_VERSION = "massBasis/1";

export interface MassBasisVersion {
  id: number;
  referenceFinishedKg: number | string | null;
  referenceRawTotalKg?: number | string | null;
  massBasisEnabled: number | boolean | null;
}

export interface MassBasisIngredient {
  id: number;
  materialId: number | null;
  processGroupId?: number | null;
  isDeductible?: number | null;
  isAdditional?: number | null;
  quantity: number | string;
  unit: string | null;
  basisRawKg?: number | string | null;
  pretreatmentFactor?: number | string | null;
}

export interface MassBasisSnapshotRow {
  ingredientId: number;
  materialId: number | null;
  processGroupId: number | null;
  isDeductible: boolean;
  factor: number;
  referenceRawKg: number;
  rawKg: number;
  processKg: number;
}

export interface MassBasisSnapshot {
  calcVersion: string;
  versionId: number;
  referenceFinishedKg: number;
  plannedFinishedKg: number;
  multiplier: number;
  totalRawKg: number;
  totalProcessKg: number;
  rows: MassBasisSnapshotRow[];
}

const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

export function buildMassBasisSnapshot(
  version: MassBasisVersion,
  ingredients: MassBasisIngredient[],
  plannedFinishedKg: number,
): { ok: true; snapshot: MassBasisSnapshot } | { ok: false; reason: string } {
  if (!version.massBasisEnabled || Number(version.massBasisEnabled) === 0) return { ok: false, reason: "disabled" };
  const referenceFinishedKg = num(version.referenceFinishedKg);
  if (referenceFinishedKg == null || !(referenceFinishedKg > 0)) return { ok: false, reason: "기준 완제품 kg 가 없습니다" };
  const rawTotal = num(version.referenceRawTotalKg) ?? undefined;

  const rows: BasisRow[] = [];
  for (const ing of ingredients) {
    if (ing.materialId == null) continue;
    const factor = num(ing.pretreatmentFactor) ?? 1;
    const basis = num(ing.basisRawKg);
    const unit = String(ing.unit ?? "").toLowerCase();
    if (basis != null) rows.push({ key: ing.id, rawKg: basis, factor });
    else if (unit === "kg" || unit === "g") rows.push({ key: ing.id, rawKg: Number(ing.quantity), unit: unit as "kg" | "g", factor });
    else if (unit === "%") rows.push({ key: ing.id, percent: Number(ing.quantity), factor });
    else return { ok: false, reason: `원료 행 ${ing.id}: 단위 '${ing.unit}' 는 기준 원물 kg 를 정할 수 없습니다 (운영 기준 원물 kg 입력 필요)` };
  }
  if (rows.length === 0) return { ok: false, reason: "원료 행이 없습니다" };

  try {
    const r = computeMassBasis({ rows, referenceFinishedKg, referenceRawTotalKg: rawTotal, plannedFinishedKg });
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    return {
      ok: true,
      snapshot: {
        calcVersion: MASS_BASIS_CALC_VERSION,
        versionId: version.id,
        referenceFinishedKg,
        plannedFinishedKg,
        multiplier: r.multiplier,
        totalRawKg: r.totalRawKg,
        totalProcessKg: r.totalProcessKg,
        rows: r.rows.map((x) => {
          const ing = byId.get(Number(x.key))!;
          return {
            ingredientId: Number(x.key),
            materialId: ing.materialId,
            processGroupId: ing.processGroupId ?? null,
            isDeductible: ing.isDeductible == null ? true : Number(ing.isDeductible) !== 0,
            factor: x.factor,
            referenceRawKg: x.referenceRawKg,
            rawKg: x.rawKg,
            processKg: x.processKg,
          };
        }),
      },
    };
  } catch (e) {
    if (e instanceof MassBasisError) return { ok: false, reason: e.message };
    throw e;
  }
}
