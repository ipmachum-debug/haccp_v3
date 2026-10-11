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
