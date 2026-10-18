/**
 * 일일일지 v2 기록 (form_data.schemaVersion = 2) — 생성·판정·저장/제출 검사 (2026-10-18, PR-B1 · C2)
 *
 * 원칙 (docs/architecture/17):
 *   - 기록은 그날 쓰는 정의를 definitionSnapshot 으로 품는다. 재조회·재인쇄·검사는 회사의 현재 설정이 아니라 이 스냅샷 기준.
 *   - 새 기록의 측정값·실측시각·평가는 NULL 로 시작한다. 전날 값·기본값 0·예정시각을 실측으로 넣지 않는다.
 *   - 평가(pass/fail)는 서버가 기준으로 다시 계산한다 — 화면이 보낸 pass 로 기준 이탈을 덮을 수 없다. 미입력은 평가 없음(null).
 *   - 0 은 실제 측정 0 이다. 미입력과 다르다.
 *   - 측정하지 않은 대상(설비 정지 등)은 '대상외' + 사유로 구별한다 — 빈칸과 다르다.
 *   - 기준 이탈은 발생내용·대응을 남긴다(미해결도 저장 가능). 미해결 이탈이 있으면 최종 승인하지 않는다(보수적 관문).
 * 순수 함수. DB 없음.
 */
import type { DailyLogDefinition, MeasureKind, Point } from "./definition";
import { INPUT_RANGE, MEASURE_LABELS, withinCriteria } from "./definition";

export interface AnswerV2 {
  itemId: string;
  value: "yes" | "no" | null;
  numericValue: number | null;
  notApplicable: boolean;
  notApplicableReason: string;
}

export interface MeasurementRowV2 {
  rowId: string;
  pointId: string;
  slotId: string;
  measuredAt: string | null; // HH:MM 실측시각
  temperature: number | null;
  humidity: number | null;
  evaluation: "pass" | "fail" | null; // 서버 계산
  notApplicable: boolean;
  notApplicableReason: string;
  note: string | null;
}

export interface DeviationV2 {
  deviationId: string;
  rowId: string | null;
  itemId: string | null;
  description: string;
  action: string;
  result: string;
  completedAt: string | null;
  actionBy: string;
  confirmedBy: string;
  state: "open" | "resolved";
}

export interface NotesV2 { specialNotes: string; improvementAction: string; actionBy: string; confirmedBy: string }

export interface DailyLogRecordV2 {
  schemaVersion: 2;
  businessDate: string;
  settingsVersionId: number | null;
  definitionSnapshot: DailyLogDefinition;
  answers: AnswerV2[];
  measurements: MeasurementRowV2[];
  deviations: DeviationV2[];
  notes: Partial<Record<string, NotesV2>>;
  /** 배치 집계 등 v1 과 같은 부가 정보 (서버가 따로 갱신) */
  [extra: string]: unknown;
}

export const rowIdOf = (pointId: string, slotId: string) => `${pointId}|${slotId}`;

export function isV2Record(fd: any): fd is DailyLogRecordV2 {
  return !!fd && typeof fd === "object" && fd.schemaVersion === 2 && !!fd.definitionSnapshot;
}

/** 정의에서 그날 필요한 측정 행 — 사용 중인 영역·대상·회차 */
export function expectedRows(def: DailyLogDefinition): Array<{ rowId: string; point: Point; slotId: string; slotLabel: string }> {
  const enabled = new Set(def.enabledSections);
  const out: Array<{ rowId: string; point: Point; slotId: string; slotLabel: string }> = [];
  const zoneOrder = new Map(def.zones.map((z) => [z.zoneId, z.sortOrder]));
  const pts = def.points.filter((p) => p.active && enabled.has(p.section))
    .sort((a, b) => (zoneOrder.get(a.zoneId) ?? 0) - (zoneOrder.get(b.zoneId) ?? 0) || a.sortOrder - b.sortOrder);
  for (const p of pts) for (const s of [...p.slots].sort((a, b) => a.sortOrder - b.sortOrder)) out.push({ rowId: rowIdOf(p.pointId, s.slotId), point: p, slotId: s.slotId, slotLabel: s.label });
  return out;
}

export function activeQuestions(def: DailyLogDefinition) {
  const enabled = new Set(def.enabledSections);
  return def.questions.filter((q) => q.active && enabled.has(q.section)).sort((a, b) => (a.section === b.section ? a.sortOrder - b.sortOrder : a.section === "hygiene" ? -1 : 1));
}

/** 새 v2 기록 — 측정값·실측시각·평가·답 모두 NULL */
export function newRecordV2(def: DailyLogDefinition, businessDate: string, settingsVersionId: number | null): DailyLogRecordV2 {
  return {
    schemaVersion: 2,
    businessDate,
    settingsVersionId,
    definitionSnapshot: def,
    answers: activeQuestions(def).map((q) => ({ itemId: q.itemId, value: null, numericValue: null, notApplicable: false, notApplicableReason: "" })),
    measurements: expectedRows(def).map((r) => ({
      rowId: r.rowId, pointId: r.point.pointId, slotId: r.slotId, measuredAt: null, temperature: null, humidity: null,
      evaluation: null, notApplicable: false, notApplicableReason: "", note: null,
    })),
    deviations: [],
    notes: {},
  };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** 한 행의 평가 — 필수 값이 하나라도 없으면 null, 기준 밖이면 fail */
export function evaluateRow(point: Point, row: Pick<MeasurementRowV2, "temperature" | "humidity" | "notApplicable">): "pass" | "fail" | null {
  if (row.notApplicable) return null;
  let anyFail = false;
  for (const kind of ["temperature", "humidity"] as MeasureKind[]) {
    const spec = point.measurements[kind];
    if (!spec) continue;
    const v = num(row[kind]);
    if (v === null || Number.isNaN(v)) { if (spec.required) return null; continue; }
    if (!withinCriteria(v, spec)) anyFail = true;
  }
  return anyFail ? "fail" : "pass";
}

/**
 * 저장 전 정리 — 서버만 정하는 칸(정의 스냅샷·날짜·설정 버전·스키마)은 이전 기록 값을 쓰고, 평가는 다시 계산한다.
 * 화면이 보낸 행 중 정의에 없는 것은 버리지 않고 저장 검사(v2SaveProblems)에서 거부한다.
 */
export function mergeV2(prev: DailyLogRecordV2, incoming: any): DailyLogRecordV2 {
  const def = prev.definitionSnapshot;
  const pointById = new Map(def.points.map((p) => [p.pointId, p]));
  const inMeas: any[] = Array.isArray(incoming?.measurements) ? incoming.measurements : prev.measurements;
  const measurements = inMeas.map((m: any) => {
    const t = num(m?.temperature), h = num(m?.humidity);
    const row: MeasurementRowV2 = {
      rowId: String(m?.rowId ?? ""), pointId: String(m?.pointId ?? ""), slotId: String(m?.slotId ?? ""),
      measuredAt: m?.measuredAt ? String(m.measuredAt) : null,
      temperature: t === null || Number.isNaN(t) ? (t === null ? null : (m.temperature as any)) : t,
      humidity: h === null || Number.isNaN(h) ? (h === null ? null : (m.humidity as any)) : h,
      evaluation: null,
      notApplicable: m?.notApplicable === true,
      notApplicableReason: String(m?.notApplicableReason ?? ""),
      note: m?.note ?? null,
    };
    const p = pointById.get(row.pointId);
    row.evaluation = p ? evaluateRow(p, row) : null;
    return row;
  });
  const answers: AnswerV2[] = (Array.isArray(incoming?.answers) ? incoming.answers : prev.answers).map((a: any) => ({
    itemId: String(a?.itemId ?? ""),
    value: a?.value === "yes" || a?.value === "no" ? a.value : null,
    numericValue: (() => { const n = num(a?.numericValue); return n === null || Number.isNaN(n) ? null : n; })(),
    notApplicable: a?.notApplicable === true,
    notApplicableReason: String(a?.notApplicableReason ?? ""),
  }));
  const deviations: DeviationV2[] = (Array.isArray(incoming?.deviations) ? incoming.deviations : prev.deviations).map((d: any) => ({
    deviationId: String(d?.deviationId ?? ""), rowId: d?.rowId ?? null, itemId: d?.itemId ?? null,
    description: String(d?.description ?? ""), action: String(d?.action ?? ""), result: String(d?.result ?? ""),
    completedAt: d?.completedAt ? String(d.completedAt) : null, actionBy: String(d?.actionBy ?? ""), confirmedBy: String(d?.confirmedBy ?? ""),
    state: d?.state === "resolved" ? "resolved" : "open",
  }));
  const { schemaVersion: _s, businessDate: _b, settingsVersionId: _v, definitionSnapshot: _d, templateCode: _t, ...rest } = incoming ?? {};
  return {
    ...prev,
    ...rest,
    schemaVersion: 2,
    businessDate: prev.businessDate,
    settingsVersionId: prev.settingsVersionId,
    definitionSnapshot: def,
    answers, measurements, deviations,
    notes: incoming?.notes && typeof incoming.notes === "object" ? incoming.notes : prev.notes,
  };
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 저장할 때마다 — 구조가 정의와 맞는가 (임시 저장도 거부) */
export function v2SaveProblems(rec: DailyLogRecordV2): string[] {
  const out: string[] = [];
  const def = rec.definitionSnapshot;
  const expected = new Map(expectedRows(def).map((r) => [r.rowId, r]));
  const seen = new Set<string>();
  for (const m of rec.measurements) {
    if (seen.has(m.rowId)) out.push(`측정 행이 중복됐습니다 (${m.rowId}).`);
    seen.add(m.rowId);
    const e = expected.get(m.rowId);
    if (!e || e.point.pointId !== m.pointId || e.slotId !== m.slotId) { out.push(`이 일지 정의에 없는 측정 행입니다 (${m.rowId}).`); continue; }
    if (m.measuredAt != null && !TIME_RE.test(m.measuredAt)) out.push(`${e.point.name} ${e.slotLabel}: 측정시각 형식이 맞지 않습니다 (HH:MM).`);
    for (const kind of ["temperature", "humidity"] as MeasureKind[]) {
      const v = (m as any)[kind];
      if (v === null) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) { out.push(`${e.point.name} ${e.slotLabel} ${MEASURE_LABELS[kind]}: 숫자가 아닙니다.`); continue; }
      if (!e.point.measurements[kind]) out.push(`${e.point.name}: ${MEASURE_LABELS[kind]} 를 측정하지 않는 대상입니다.`);
      const r = INPUT_RANGE[kind];
      if (v < r.min || v > r.max) out.push(`${e.point.name} ${e.slotLabel} ${MEASURE_LABELS[kind]}: 입력 범위(${r.min}~${r.max}) 밖입니다.`);
    }
  }
  const qIds = new Set(activeQuestions(def).map((q) => q.itemId));
  const seenQ = new Set<string>();
  for (const a of rec.answers) {
    if (seenQ.has(a.itemId)) out.push(`질문 답이 중복됐습니다 (${a.itemId}).`);
    seenQ.add(a.itemId);
    if (!qIds.has(a.itemId)) out.push(`이 일지 정의에 없는 질문입니다 (${a.itemId}).`);
  }
  return out;
}

/**
 * 제출(확인) 전 — 정의 스냅샷에서 필요한 행을 열거해 검사한다. 요청에서 행을 빼도 누락으로 잡힌다.
 *   now: 회사 시간대 기준 { date: YYYY-MM-DD, time: HH:MM }
 */
export function v2SubmitIssues(rec: DailyLogRecordV2, now: { date: string; time: string }): string[] {
  const out = [...v2SaveProblems(rec)];
  const def = rec.definitionSnapshot;
  if (rec.businessDate > now.date) out.push(`작업일(${rec.businessDate})이 아직 오지 않았습니다.`);
  const byRow = new Map(rec.measurements.map((m) => [m.rowId, m]));
  for (const e of expectedRows(def)) {
    const m = byRow.get(e.rowId);
    const label = `${e.point.name} ${e.slotLabel}`;
    if (!m) { out.push(`${label}: 측정 행이 없습니다.`); continue; }
    if (m.notApplicable) { if (!m.notApplicableReason.trim()) out.push(`${label}: '대상외' 사유를 입력하세요.`); continue; }
    for (const kind of ["temperature", "humidity"] as MeasureKind[]) {
      const spec = e.point.measurements[kind];
      if (spec?.required && m[kind] === null) out.push(`${label} ${MEASURE_LABELS[kind]}를 입력하세요.`);
    }
    if (!m.measuredAt) out.push(`${label}: 실제 측정시각을 입력하세요.`);
    else if (rec.businessDate === now.date && m.measuredAt > now.time) out.push(`${label}: 측정시각 ${m.measuredAt} 이 아직 오지 않았습니다.`);
    if (m.evaluation === "fail" && !rec.deviations.some((d) => d.rowId === e.rowId && d.description.trim() && d.action.trim())) {
      out.push(`${label}: 기준 이탈 — 발생내용과 대응을 기록하세요.`);
    }
  }
  const byItem = new Map(rec.answers.map((a) => [a.itemId, a]));
  for (const q of activeQuestions(def)) {
    const a = byItem.get(q.itemId);
    const label = `${q.section === "hygiene" ? "위생" : "이물"} ${q.sortOrder}번`;
    if (!a) { out.push(`${label}: 답 칸이 없습니다.`); continue; }
    if (q.responseType === "temperature" || q.responseType === "check_temperature") {
      if (a.notApplicable) { if (!a.notApplicableReason.trim()) out.push(`${label}: '운송 없음' 사유를 입력하세요.`); }
      else if (a.numericValue === null) out.push(`${label}: 온도(℃)를 입력하거나 '운송 없음'과 사유를 선택하세요.`);
    }
    if (q.responseType === "check_temperature" && !a.notApplicable && a.value === null) out.push(`${label}: 예/아니오를 선택하세요.`);
    if (a.value === "no" && !rec.deviations.some((d) => d.itemId === q.itemId && d.description.trim() && d.action.trim())) {
      out.push(`${label}: '아니오' — 발생내용과 대응을 기록하세요.`);
    }
  }
  return out;
}

/** 최종 승인 전 — 제출 검사 + 미해결 이탈이 남아 있으면 막는다 (보수적 관문) */
export function v2ApproveIssues(rec: DailyLogRecordV2, now: { date: string; time: string }): string[] {
  const out = v2SubmitIssues(rec, now);
  const open = rec.deviations.filter((d) => d.state !== "resolved").length;
  if (open) out.push(`해결되지 않은 이탈·조치 ${open}건이 있습니다 — 조치 완료 후 승인하세요.`);
  return out;
}
