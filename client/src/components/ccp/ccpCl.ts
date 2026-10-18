/**
 * CCP 기록지 한계기준(CL) — 표시·입력 판정 공통 (CcpMonitoringForms 에서 분리, 지티 QA F12)
 */

/** 기록지 헤더의 CL 스냅샷 컬럼 */
export type ClRecord = {
  ccpType: string;
  processGroupId?: number | null;
  clHeatTimeMinLo?: number | null;
  clHeatTimeMinHi?: number | null;
  clHeatTempLo?: string | number | null;
  clPressureMpaLo?: string | number | null;
  clProductTempLo?: string | number | null;
  clMetalSensitivity?: number | null;
  clFeMm?: string | number | null;
  clSusMm?: string | number | null;
};

// CL 값 모양. 기본값은 없다 — 특정 회사 기준서 숫자(10~15분·0.12MPa·90℃·150℃·감도 130·Fe 2.0·SUS 3.0)를
//   코드에 두지 않는다 (2026-10-18 CEO: 단지 전용 금지). 기준은 공정그룹 → 기록지 스냅샷에서만 온다.
export type ClValues = {
  heatTimeMinLo?: number; heatTimeMinHi?: number;
  heatTempLo?: number; pressureMpaLo?: number; productTempLo?: number;
  metalSensitivity?: number; feMm?: number; susMm?: number;
};
export const CCP_CL_DEFAULTS: Record<string, ClValues> = {};

/**
 * 기록지의 CL — 기록지에 저장된 스냅샷(공정그룹 설정)을 쓴다 (지티 QA F12, 2026-10-18).
 *   이전엔 화면이 기준서 기본값(10~15분·0.12MPa·90℃)만 보여 줘 그룹 기준(예: 75~95℃·1~10분)과 표시·판정이 달랐다.
 *   공정그룹 기록지는 스냅샷에 없는 항목을 기본값으로 채우지 않는다(표시 '-', 판정 제외). 그룹 없는 옛 기록지만 기본값.
 */
export function clFromRecord(rec: ClRecord): ClValues {
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const metal = { metalSensitivity: num(rec.clMetalSensitivity), feMm: num(rec.clFeMm), susMm: num(rec.clSusMm) };
  if (rec.ccpType === "CCP-4P") return metal;
  return {
    heatTimeMinLo: num(rec.clHeatTimeMinLo), heatTimeMinHi: num(rec.clHeatTimeMinHi),
    heatTempLo: num(rec.clHeatTempLo), pressureMpaLo: num(rec.clPressureMpaLo),
    productTempLo: num(rec.clProductTempLo) ?? (rec.ccpType === "CCP-1B" ? num(rec.clHeatTempLo) : undefined),
    ...metal,
  };
}
export const clRange = (lo?: number, hi?: number, unit = "") =>
  lo != null && hi != null ? `${lo}~${hi}${unit}` : lo != null ? `${lo}${unit} 이상` : hi != null ? `${hi}${unit} 이하` : "-";
export const clMin = (lo: number | undefined, suffix: string) => (lo != null ? `${lo}${suffix}` : "-");
/** 판정에 쓸 기준이 하나라도 있는가 — 없으면 자동 판정하지 않는다 (전부 '적합' 으로 찍히는 것 방지) */
export const clHasAny = (cl: ClValues, keys: Array<keyof ClValues>) => keys.some((k) => cl[k] != null);
/** 정한 기준만 본다 — 없는 기준은 판정에서 뺀다 */
export const clOk = (v: number, lo?: number, hi?: number) =>
  (lo == null || (Number.isFinite(v) && v >= lo)) && (hi == null || (Number.isFinite(v) && v <= hi));
export function clSummary(ccpType: string, cl: ClValues): string {
  if (ccpType === "CCP-2B") return `가열시간 ${clRange(cl.heatTimeMinLo, cl.heatTimeMinHi, "분")} · 온도 ${clMin(cl.heatTempLo, "°C 이상")}`;
  if (ccpType === "CCP-1B") return [`가열시간 ${clRange(cl.heatTimeMinLo, cl.heatTimeMinHi, "분")}`, cl.pressureMpaLo != null ? `압력 ${cl.pressureMpaLo}MPa 이상` : null, `품온 ${clMin(cl.productTempLo, "°C 이상")}`].filter(Boolean).join(" · ");
  if (ccpType === "CCP-4P") return `감도 ${cl.metalSensitivity} · Fe ${cl.feMm}mmΦ 불검출 · SUS ${cl.susMm}mmΦ 불검출`;
  return "-";
}
