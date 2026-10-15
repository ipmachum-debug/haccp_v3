/**
 * 일일일지(daily_log) 온·습도 실측 필드 검증 — 서버/클라이언트 공용
 *
 * form_data 는 두 가지 모양으로 저장된다.
 *  - 배열형 (DailyLogForm 저장): temperatureHumidity[{roomName,timePeriod,temperature,humidity}] 등
 *  - 객체형 (autoDailyReport 자동 생성): temperatureHumidity.room1Morning.{temp,humidity} 등
 * 두 모양 모두 받아서 "측정값이 비어 있는 칸" 목록을 돌려준다.
 * 검사시각/평가는 측정값이 아니므로 대상이 아니다.
 */

export type MeasurementSection = "temperatureHumidity" | "freezerTemperature" | "refrigeratorTemperature";

export interface MissingMeasurement {
  section: MeasurementSection;
  slot: string;   // 예: 원재료실1 오전
  field: string;  // 예: 온도
  label: string;  // 예: 원재료실1 오전 온도
}

export const SECTION_LABELS: Record<MeasurementSection, string> = {
  temperatureHumidity: "원재료실 온/습도",
  freezerTemperature: "급속냉동고/냉동고 온도",
  refrigeratorTemperature: "냉장고 온도",
};

const TH_SLOTS = [
  { key: "room1Morning", room: "원재료실1", period: "오전" },
  { key: "room1Afternoon", room: "원재료실1", period: "오후" },
  { key: "room2Morning", room: "원재료실2", period: "오전" },
  { key: "room2Afternoon", room: "원재료실2", period: "오후" },
];
const AM_PM = [
  { key: "morning", period: "오전" },
  { key: "afternoon", period: "오후" },
];

export function isBlankMeasurement(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return Number.isNaN(v);
  return String(v).trim() === "";
}

function push(out: MissingMeasurement[], section: MeasurementSection, slot: string, field: string) {
  out.push({ section, slot, field, label: `${slot} ${field}` });
}

export function findMissingMeasurements(formData: any): MissingMeasurement[] {
  const out: MissingMeasurement[] = [];
  if (!formData || typeof formData !== "object") {
    for (const s of TH_SLOTS) { push(out, "temperatureHumidity", `${s.room} ${s.period}`, "온도"); push(out, "temperatureHumidity", `${s.room} ${s.period}`, "습도"); }
    for (const p of AM_PM) { push(out, "freezerTemperature", p.period, "급속냉동고"); push(out, "freezerTemperature", p.period, "냉동고"); }
    for (const p of AM_PM) push(out, "refrigeratorTemperature", p.period, "냉장고 온도");
    return out;
  }

  // 1) 원재료실 온/습도
  const th = formData.temperatureHumidity;
  if (Array.isArray(th)) {
    TH_SLOTS.forEach((s, i) => {
      const row = th[i] || {};
      const slot = `${row.roomName || s.room} ${row.timePeriod || s.period}`;
      if (isBlankMeasurement(row.temperature)) push(out, "temperatureHumidity", slot, "온도");
      if (isBlankMeasurement(row.humidity)) push(out, "temperatureHumidity", slot, "습도");
    });
  } else {
    for (const s of TH_SLOTS) {
      const row = (th && typeof th === "object" ? th[s.key] : null) || {};
      const slot = `${s.room} ${s.period}`;
      if (isBlankMeasurement(row.temp)) push(out, "temperatureHumidity", slot, "온도");
      if (isBlankMeasurement(row.humidity)) push(out, "temperatureHumidity", slot, "습도");
    }
  }

  // 2) 급속냉동고 / 냉동고
  const fz = formData.freezerTemperature;
  if (Array.isArray(fz)) {
    AM_PM.forEach((p, i) => {
      const row = fz[i] || {};
      const slot = row.timePeriod || p.period;
      if (isBlankMeasurement(row.rapidFreezerTemp)) push(out, "freezerTemperature", slot, "급속냉동고");
      if (isBlankMeasurement(row.freezerTemp)) push(out, "freezerTemperature", slot, "냉동고");
    });
  } else {
    for (const p of AM_PM) {
      const row = (fz && typeof fz === "object" ? fz[p.key] : null) || {};
      if (isBlankMeasurement(row.rapidFreezer)) push(out, "freezerTemperature", p.period, "급속냉동고");
      if (isBlankMeasurement(row.freezer)) push(out, "freezerTemperature", p.period, "냉동고");
    }
  }

  // 3) 냉장고
  const rf = formData.refrigeratorTemperature;
  if (Array.isArray(rf)) {
    AM_PM.forEach((p, i) => {
      const row = rf[i] || {};
      const slot = row.timePeriod || p.period;
      if (isBlankMeasurement(row.temperature)) push(out, "refrigeratorTemperature", slot, "냉장고 온도");
    });
  } else {
    for (const p of AM_PM) {
      const row = (rf && typeof rf === "object" ? rf[p.key] : null) || {};
      if (isBlankMeasurement(row.temp)) push(out, "refrigeratorTemperature", p.period, "냉장고 온도");
    }
  }

  return out;
}

/** 사용자 메시지용 요약 — "원재료실1 오전 온도, 원재료실1 오전 습도 외 N건" */
export function summarizeMissing(missing: MissingMeasurement[], max = 4): string {
  if (missing.length === 0) return "";
  const head = missing.slice(0, max).map((m) => m.label).join(", ");
  const rest = missing.length - max;
  return rest > 0 ? `${head} 외 ${rest}건` : head;
}

/** 섹션별 미측정 건수 */
export function countMissingBySection(missing: MissingMeasurement[]): Record<MeasurementSection, number> {
  const c: Record<MeasurementSection, number> = { temperatureHumidity: 0, freezerTemperature: 0, refrigeratorTemperature: 0 };
  for (const m of missing) c[m.section] += 1;
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
// 승인 관문용 전체 검증 (2026-10-15, Codex 일일일지 감사)
//   빈 값뿐 아니라 숫자가 아닌 값·입력 가능 범위 밖·실제 측정시각 누락까지 본다.
//   범위는 "기준(적합)" 이 아니라 "입력 오류" 판정용 — 기준 밖 실측값(예: 냉동고 -10℃)은 그대로 통과시키고
//   평가(부적합)·이탈 조치로 기록한다. 값을 바꾸거나 자동으로 적합 처리하지 않는다.
//   측정시각은 실제 측정한 시각만 인정한다 (예정 시각을 미리 넣지 않는다 — 자동 생성은 빈 값).
// ─────────────────────────────────────────────────────────────────────────────

export type MeasurementIssueKind = "missing" | "not_number" | "out_of_range" | "no_time";

export interface MeasurementIssue extends MissingMeasurement {
  kind: MeasurementIssueKind;
  value?: string;
}

/** 입력 가능 범위 (℃ / %RH) — 오타·단위 혼동만 거른다 */
export const MEASUREMENT_INPUT_RANGE: Record<string, { min: number; max: number; unit: string }> = {
  "온도": { min: -30, max: 60, unit: "℃" },
  "습도": { min: 0, max: 100, unit: "%" },
  "급속냉동고": { min: -80, max: 20, unit: "℃" },
  "냉동고": { min: -60, max: 20, unit: "℃" },
  "냉장고 온도": { min: -20, max: 30, unit: "℃" },
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const ISSUE_KIND_LABELS: Record<MeasurementIssueKind, string> = {
  missing: "미측정",
  not_number: "숫자 아님",
  out_of_range: "입력 범위 밖",
  no_time: "측정시각 없음",
};

export type NormalizedSlot = { section: MeasurementSection; slot: string; time: unknown; values: Array<{ field: string; value: unknown }> };

/** 측정 칸을 한 모양으로 읽기 — 배열형·객체형 공통 (참고 패널·검증 공용) */
export function readMeasurements(formData: any): NormalizedSlot[] {
  return normalizeSlots(formData);
}

function normalizeSlots(formData: any): NormalizedSlot[] {
  const fd = formData && typeof formData === "object" ? formData : {};
  const out: NormalizedSlot[] = [];
  const th = fd.temperatureHumidity;
  TH_SLOTS.forEach((s, i) => {
    if (Array.isArray(th)) {
      const row = th[i] || {};
      out.push({ section: "temperatureHumidity", slot: `${row.roomName || s.room} ${row.timePeriod || s.period}`, time: row.checkTime,
        values: [{ field: "온도", value: row.temperature }, { field: "습도", value: row.humidity }] });
    } else {
      const row = (th && typeof th === "object" ? th[s.key] : null) || {};
      out.push({ section: "temperatureHumidity", slot: `${s.room} ${s.period}`, time: row.time,
        values: [{ field: "온도", value: row.temp }, { field: "습도", value: row.humidity }] });
    }
  });
  const fz = fd.freezerTemperature;
  AM_PM.forEach((p, i) => {
    const row = (Array.isArray(fz) ? fz[i] : fz && typeof fz === "object" ? fz[p.key] : null) || {};
    out.push({ section: "freezerTemperature", slot: (Array.isArray(fz) && row.timePeriod) || p.period, time: Array.isArray(fz) ? row.checkTime : row.time,
      values: [
        { field: "급속냉동고", value: Array.isArray(fz) ? row.rapidFreezerTemp : row.rapidFreezer },
        { field: "냉동고", value: Array.isArray(fz) ? row.freezerTemp : row.freezer },
      ] });
  });
  const rf = fd.refrigeratorTemperature;
  AM_PM.forEach((p, i) => {
    const row = (Array.isArray(rf) ? rf[i] : rf && typeof rf === "object" ? rf[p.key] : null) || {};
    out.push({ section: "refrigeratorTemperature", slot: (Array.isArray(rf) && row.timePeriod) || p.period, time: Array.isArray(rf) ? row.checkTime : row.time,
      values: [{ field: "냉장고 온도", value: Array.isArray(rf) ? row.temperature : row.temp }] });
  });
  return out;
}

/** 승인 관문 검증 — 빈 값·숫자 아님·입력 범위 밖·측정시각 없음 (기준 이탈은 대상 아님) */
export function findMeasurementIssues(formData: any): MeasurementIssue[] {
  const out: MeasurementIssue[] = [];
  for (const s of normalizeSlots(formData)) {
    for (const { field, value } of s.values) {
      const base = { section: s.section, slot: s.slot, field, label: `${s.slot} ${field}` };
      if (isBlankMeasurement(value)) { out.push({ ...base, kind: "missing" }); continue; }
      const raw = String(value).trim();
      const n = typeof value === "number" ? value : /^[-+]?\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
      if (!Number.isFinite(n)) { out.push({ ...base, kind: "not_number", value: raw }); continue; }
      const range = MEASUREMENT_INPUT_RANGE[field];
      if (range && (n < range.min || n > range.max)) out.push({ ...base, kind: "out_of_range", value: raw });
    }
    if (!TIME_RE.test(String(s.time ?? "").trim())) {
      out.push({ section: s.section, slot: s.slot, field: "측정시각", label: `${s.slot} 측정시각`, kind: "no_time" });
    }
  }
  return out;
}

/** 관문 메시지 — "미측정 14건, 측정시각 없음 8건 (원재료실1 오전 온도, …)" */
export function summarizeIssues(issues: MeasurementIssue[], max = 4): string {
  if (issues.length === 0) return "";
  const counts = new Map<MeasurementIssueKind, number>();
  for (const i of issues) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  const head = [...counts].map(([k, c]) => `${ISSUE_KIND_LABELS[k]} ${c}건`).join(", ");
  const sample = issues.slice(0, max).map((i) => (i.value != null ? `${i.label}=${i.value}` : i.label)).join(", ");
  const rest = issues.length - max;
  return `${head} (${sample}${rest > 0 ? ` 외 ${rest}건` : ""})`;
}
