/**
 * 원물·공정·완제품 기준 계산 — 업종 공통 순수 함수 (2026-10-16, Codex 수율 기준 검토 PR A)
 *
 * 세 가지 값을 섞지 않는다:
 *   - 원물 kg  : 구매·재고 상태 그대로의 양 (생쌀). 재고 출고·원가는 이 값.
 *   - 공정 kg  : 전처리 후 공정에 들어가는 양 (불린 쌀 = 원물 × 전처리 배율). CCP 공정 투입 표시는 이 값.
 *   - 완제품 kg: 이 배합으로 나오는 완제품 기준량. 생산 배수의 분모.
 *
 * 공통 산식:
 *   생산 배수   = 계획 완제품 kg / 기준 완제품 kg
 *   원물 소요   = 기준 원물 kg × 생산 배수
 *   공정 투입   = 원물 소요 × 원료별 전처리 배율 (기본 1.0)
 *
 * 기준 원물 kg 를 정하는 세 가지 입력 (행마다 하나):
 *   - rawKg      : 원물 kg 그대로 (예: 엑셀 생쌀 보정 kg). 다시 배율로 나누지 않는다.
 *   - processedKg: 불린 쌀처럼 전처리 후 kg 로 적힌 값 → 원물 = processedKg / 배율.
 *   - percent    : 품목제조보고 PDF 비율(원물 기준) → 원물 = 기준 원물 합계 kg × percent / 100.
 *                  PDF% 를 완제품 kg 에 바로 곱하지 않는다 (원물 합계 ≠ 완제품량).
 *
 * 전처리 배율은 재료명·업종에 하드코딩하지 않는다 — 호출측이 레시피 버전의 원료 행 값으로 넘긴다.
 * 배율 1.0·기준 완제품 = 기존 배치 크기인 레시피는 기존 계산과 같은 결과가 나온다.
 */

export type MassUnit = "kg" | "g";

export interface BasisRow {
  key: string | number;
  /** 원물 kg (또는 g — unit) */
  rawKg?: number;
  /** 전처리 후 kg (불린 쌀 등) */
  processedKg?: number;
  /** 원물 기준 구성비 % (PDF) */
  percent?: number;
  unit?: MassUnit;
  /** 전처리 배율 (생찹쌀→불린찹쌀 1.4, 생멥쌀→불린멥쌀 1.25). 기본 1.0 */
  factor?: number;
}

export interface BasisInput {
  rows: BasisRow[];
  /** 이 배합의 완제품 기준량 kg */
  referenceFinishedKg: number;
  /** percent 행이 있을 때 필요: 기준 원물 합계 kg */
  referenceRawTotalKg?: number;
  /** 계획 완제품 kg */
  plannedFinishedKg: number;
}

export interface BasisRowResult {
  key: string | number;
  factor: number;
  /** 기준 배합의 원물 kg */
  referenceRawKg: number;
  /** 계획 원물 소요 kg (재고 출고 기준) */
  rawKg: number;
  /** 계획 공정 투입 kg (전처리 후) */
  processKg: number;
}

export interface BasisResult {
  multiplier: number;
  rows: BasisRowResult[];
  totalRawKg: number;
  totalProcessKg: number;
  plannedFinishedKg: number;
}

export class MassBasisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MassBasisError";
  }
}

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function toKg(v: number, unit: MassUnit | undefined): number {
  if (unit === undefined || unit === "kg") return v;
  if (unit === "g") return v / 1000;
  throw new MassBasisError(`지원하지 않는 단위: ${String(unit)} (kg·g 만 — 개수·포장 단위는 환산 근거가 있어야 함)`);
}

/** 생산 배수 = 계획 완제품 / 기준 완제품 */
export function productionMultiplier(plannedFinishedKg: number, referenceFinishedKg: number): number {
  if (!finite(referenceFinishedKg) || referenceFinishedKg <= 0) throw new MassBasisError("기준 완제품 kg 는 0 보다 커야 합니다");
  if (!finite(plannedFinishedKg) || plannedFinishedKg < 0) throw new MassBasisError("계획 완제품 kg 는 0 이상이어야 합니다");
  return plannedFinishedKg / referenceFinishedKg;
}

/** 행 하나의 기준 원물 kg */
export function referenceRawKgOf(row: BasisRow, referenceRawTotalKg?: number): number {
  const factor = row.factor ?? 1;
  if (!finite(factor) || factor <= 0) throw new MassBasisError(`전처리 배율은 0 보다 커야 합니다 (${row.key})`);
  const given = [row.rawKg, row.processedKg, row.percent].filter((v) => v !== undefined).length;
  if (given !== 1) throw new MassBasisError(`원물 kg·전처리 후 kg·비율 중 하나만 지정 (${row.key})`);
  if (row.rawKg !== undefined) {
    if (!finite(row.rawKg) || row.rawKg < 0) throw new MassBasisError(`원물 kg 오류 (${row.key})`);
    return toKg(row.rawKg, row.unit);
  }
  if (row.processedKg !== undefined) {
    if (!finite(row.processedKg) || row.processedKg < 0) throw new MassBasisError(`전처리 후 kg 오류 (${row.key})`);
    return toKg(row.processedKg, row.unit) / factor;
  }
  if (!finite(row.percent!) || row.percent! < 0) throw new MassBasisError(`비율 오류 (${row.key})`);
  if (!finite(referenceRawTotalKg) || referenceRawTotalKg <= 0) {
    throw new MassBasisError(`비율(%) 행은 기준 원물 합계 kg 가 필요합니다 — 완제품 kg 에 % 를 바로 곱하지 않음 (${row.key})`);
  }
  return (referenceRawTotalKg * row.percent!) / 100;
}

/** 배합 전체 계산 */
export function computeMassBasis(input: BasisInput): BasisResult {
  const multiplier = productionMultiplier(input.plannedFinishedKg, input.referenceFinishedKg);
  const rows = input.rows.map((row) => {
    const factor = row.factor ?? 1;
    const referenceRawKg = referenceRawKgOf(row, input.referenceRawTotalKg);
    const rawKg = referenceRawKg * multiplier;
    return { key: row.key, factor, referenceRawKg, rawKg, processKg: rawKg * factor };
  });
  return {
    multiplier,
    rows,
    totalRawKg: rows.reduce((s, r) => s + r.rawKg, 0),
    totalProcessKg: rows.reduce((s, r) => s + r.processKg, 0),
    plannedFinishedKg: input.plannedFinishedKg,
  };
}

/**
 * 판 단위 완제품량 — 설기류: 준비 5판 = 완제품 12.5kg, 작업 2판 = 5kg (1판 2.5kg).
 * 판당 kg 는 레시피 값으로 넘긴다 (설기 2.5kg 를 코드에 고정하지 않음).
 */
export function finishedKgForTrays(trays: number, kgPerTray: number): number {
  if (!finite(trays) || trays < 0) throw new MassBasisError("판 수는 0 이상이어야 합니다");
  if (!finite(kgPerTray) || kgPerTray <= 0) throw new MassBasisError("판당 완제품 kg 는 0 보다 커야 합니다");
  return trays * kgPerTray;
}
