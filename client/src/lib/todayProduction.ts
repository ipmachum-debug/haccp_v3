/**
 * 작업자 "오늘의 생산" — 6단계 상태 계산 (순수 함수, 2026-10-14, UI/UX 개편 P-1 읽기 전용)
 *
 * 14-ui-ux-restructure-spec.md §7-2 순서:
 *  ① 생산지시 선택 → ② 배합·BOM → ③ 재고·LOT 확인 → ④ 생산 시작(자동출고 1회) → ⑤ 투입 결과·HACCP 기록 → ⑥ 생산완료
 * 이 모듈은 화면 표시만 계산한다. 생산 시작·자동출고·완료 처리는 호출하지 않는다 (P-2).
 */

export type StepState = "done" | "active" | "pending" | "blocked";

export type InputLike = {
  materialId: number | null;
  plannedQuantity: string | number | null;
  actualQuantity?: string | number | null;
  lots?: Array<{ quantity: number; negative: boolean }>;
};

export type StockLike = { materialId: number; currentAvailable: number };

export type FormLike = { status: "draft" | "submitted" | "approved" | "rejected"; deviationCount: number };

export const EPS = 0.001;

export function num(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
}

/** ③ 재고·LOT 확인 — 자재별 필요량 vs 가용량 */
export function checkStock(inputs: readonly InputLike[], stock: readonly StockLike[]) {
  const avail = new Map<number, number>();
  for (const s of stock) avail.set(s.materialId, s.currentAvailable);
  const rows = inputs.map((i) => {
    const required = num(i.plannedQuantity);
    const available = i.materialId != null ? (avail.get(i.materialId) ?? 0) : 0;
    const shortage = Math.max(0, required - available);
    return { materialId: i.materialId, required, available, shortage, ok: shortage <= EPS, known: i.materialId != null && avail.has(i.materialId) };
  });
  const shortCount = rows.filter((r) => !r.ok).length;
  return { rows, shortCount, allOk: shortCount === 0 };
}

/** ⑤ 투입 결과 — 출고 기록(LOT)이 붙은 투입 수, 음수 차감 수 */
export function summarizeIssue(inputs: readonly InputLike[]) {
  const issued = inputs.filter((i) => (i.lots?.length ?? 0) > 0).length;
  const negative = inputs.filter((i) => (i.lots ?? []).some((l) => l.negative)).length;
  return { total: inputs.length, issued, negative, allIssued: inputs.length > 0 && issued === inputs.length };
}

/** ⑤ HACCP 기록 — 공식 기록지 상태 요약 */
export function summarizeForms(forms: readonly FormLike[]) {
  const drafts = forms.filter((f) => f.status === "draft").length;
  const rejected = forms.filter((f) => f.status === "rejected").length;
  const deviations = forms.reduce((s, f) => s + (f.deviationCount || 0), 0);
  return { total: forms.length, drafts, rejected, deviations, allWritten: forms.length > 0 && drafts === 0 && rejected === 0 };
}

/**
 * 6단계 상태. 배치 상태(planned / in_progress·paused / completed·shipped) 와 각 단계 결과로 계산.
 * - 시작 전: ①②③ 활성 영역, ④ 는 "대기" (부족이 있으면 blocked 표시 — 시작을 막는 게 아니라 알리는 것. 정책은 기존 음수 정책이 결정, §7-3)
 * - 진행 중: ①~④ 완료, ⑤ 활성
 * - 완료: ①~⑤ 완료, ⑥ 완료(승인 대기 포함)
 */
export function computeSteps(params: {
  batchStatus: string | null;
  hasInputs: boolean;
  stockAllOk: boolean;
  issueAllIssued: boolean;
  formsAllWritten: boolean;
  dailyMissing: number;
}): StepState[] {
  const st = params.batchStatus ?? "";
  const started = st === "in_progress" || st === "paused" || st === "completed" || st === "shipped";
  const done = st === "completed" || st === "shipped";
  if (!params.batchStatus) return ["active", "pending", "pending", "pending", "pending", "pending"];
  if (!started) {
    return [
      "done",
      params.hasInputs ? "done" : "blocked",
      params.hasInputs ? (params.stockAllOk ? "done" : "blocked") : "pending",
      params.hasInputs ? "active" : "pending",
      "pending",
      "pending",
    ];
  }
  const recordOk = params.issueAllIssued && params.formsAllWritten && params.dailyMissing === 0;
  if (!done) return ["done", "done", "done", "done", recordOk ? "done" : "active", "pending"];
  return ["done", "done", "done", "done", recordOk ? "done" : "blocked", "done"];
}
