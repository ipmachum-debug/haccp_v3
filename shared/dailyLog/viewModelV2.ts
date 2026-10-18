/**
 * 일일일지 v2 표시 데이터 — 입력 화면 조회·인쇄·승인 미리보기가 같은 구조를 쓴다 (2026-10-18, PR-B1)
 *
 * 정본은 기록 안의 definitionSnapshot + 값. 회사의 최신 설정을 읽지 않는다.
 * 미기록은 '미기록', 실제 부적합만 '부적합', 0 은 0, 대상외는 사유와 함께.
 * (v1 legacy 기록은 기존 DailyLogRenderers 경로 그대로 — #593·PR-A 로 검증된 경로를 다시 쓰지 않는다)
 */
import type { DailyLogSection, MeasureKind, SectionInfo } from "./definition";
import { MEASURE_LABELS, MEASURE_UNITS, SECTION_TITLES, criteriaText } from "./definition";
import type { DailyLogRecordV2, DeviationV2 } from "./recordV2";
import { activeQuestions, expectedRows } from "./recordV2";

export type Verdict = "적합" | "부적합" | "미기록" | "대상외";

export interface CheckRowVM { itemId: string; order: number; stage: string; category: string; text: string; responseType: string; verdict: Verdict | null; tempText: string | null }
export interface MeasureRowVM { rowId: string; zone: string; point: string; slot: string; measuredAt: string; values: Partial<Record<MeasureKind, string>>; criteria: string; verdict: Verdict; naReason: string | null }
export interface SectionVM {
  section: DailyLogSection;
  title: string;
  info: SectionInfo | null;
  checks?: CheckRowVM[];
  kinds?: MeasureKind[];
  measures?: MeasureRowVM[];
  deviations: DeviationV2[];
  notes: { specialNotes: string; improvementAction: string; actionBy: string; confirmedBy: string } | null;
}
export interface DailyLogVM { businessDate: string; settingsVersionId: number | null; sections: SectionVM[]; openDeviations: number }

const fmt = (v: number | null, kind: MeasureKind) => (v === null ? "" : `${v}${MEASURE_UNITS[kind]}`);

export function buildDailyLogViewModelV2(rec: DailyLogRecordV2): DailyLogVM {
  const def = rec.definitionSnapshot;
  const zoneName = new Map(def.zones.map((z) => [z.zoneId, z.name]));
  const answers = new Map(rec.answers.map((a) => [a.itemId, a]));
  const rows = new Map(rec.measurements.map((m) => [m.rowId, m]));
  const qs = activeQuestions(def);
  const er = expectedRows(def);
  const sections: SectionVM[] = def.enabledSections.map((section) => {
    const base = { section, title: def.sectionInfo[section]?.title || SECTION_TITLES[section], info: def.sectionInfo[section] ?? null, notes: (rec.notes?.[section] as any) ?? null };
    if (section === "hygiene" || section === "foreign") {
      const checks = qs.filter((q) => q.section === section).map((q): CheckRowVM => {
        const a = answers.get(q.itemId);
        const verdict: Verdict | null = q.responseType === "temperature" ? null
          : a?.value === "yes" ? "적합" : a?.value === "no" ? "부적합" : "미기록";
        const tempText = q.responseType === "check" ? null
          : a?.notApplicable ? `운송 없음${a.notApplicableReason ? ` (${a.notApplicableReason})` : ""}`
          : a?.numericValue != null ? `${a.numericValue}℃` : "미기록";
        return { itemId: q.itemId, order: q.sortOrder, stage: q.stage, category: q.category, text: q.text, responseType: q.responseType, verdict, tempText };
      });
      return { ...base, checks, deviations: rec.deviations.filter((d) => d.itemId && checks.some((c) => c.itemId === d.itemId)) };
    }
    const mine = er.filter((r) => r.point.section === section);
    const kinds = (["temperature", "humidity"] as MeasureKind[]).filter((k) => mine.some((r) => r.point.measurements[k]));
    const measures = mine.map((r): MeasureRowVM => {
      const m = rows.get(r.rowId);
      const values: Partial<Record<MeasureKind, string>> = {};
      for (const k of kinds) values[k] = r.point.measurements[k] ? fmt((m as any)?.[k] ?? null, k) : "—";
      const verdict: Verdict = m?.notApplicable ? "대상외" : m?.evaluation === "pass" ? "적합" : m?.evaluation === "fail" ? "부적합" : "미기록";
      const criteria = kinds.map((k) => (r.point.measurements[k] ? `${MEASURE_LABELS[k]} ${criteriaText(k, r.point.measurements[k])}` : "")).filter(Boolean).join(", ");
      return { rowId: r.rowId, zone: zoneName.get(r.point.zoneId) ?? "", point: r.point.name, slot: r.slotLabel, measuredAt: m?.measuredAt ?? "", values, criteria, verdict, naReason: m?.notApplicable ? m.notApplicableReason : null };
    });
    return { ...base, kinds, measures, deviations: rec.deviations.filter((d) => d.rowId && mine.some((r) => r.rowId === d.rowId)) };
  });
  return { businessDate: rec.businessDate, settingsVersionId: rec.settingsVersionId, sections, openDeviations: rec.deviations.filter((d) => d.state !== "resolved").length };
}
