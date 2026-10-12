/**
 * 배치 업무일자 — "입력한 날" 이 아니라 "생산한 날" (2026-10-12 CEO 원칙)
 *
 * 현장은 생산·출고를 당일 입력하지 않는다. 2~3일 치 서류를 모아 입력하거나 생산일 이후에 입력하는
 * 것이 통상이다. 따라서 재고 원장·LOT 생산일·수불부·분개의 일자는 전부 **배치의 생산일(planned_date)**
 * 을 기준으로 잡는다. completed_at 은 "완료 버튼을 누른 시각" 이라 감사 타임스탬프로만 쓴다.
 *
 * 우선순위: planned_date → completed_at → 오늘(KST)
 *
 * (이전 PR-W3 는 completed_at 을 1순위로 뒀다. 당일 입력을 전제한 것이라 뒤집는다.)
 *
 * 같은 함수가 autoMaterialIssue v1/v2 · batchLifecycle 에 세 벌 복제돼 있던 것을 여기로 통일.
 */

export function toKstDateStr(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") {
    // 'YYYY-MM-DD' 또는 'YYYY-MM-DD HH:mm:ss' — 앞 10자리가 날짜면 그대로 (DATE 컬럼은 TZ 변환 금지)
    if (/^\d{4}-\d{2}-\d{2}/.test(d)) return d.slice(0, 10);
    const parsed = new Date(d);
    if (Number.isNaN(parsed.getTime())) return null;
    d = parsed;
  }
  if (Number.isNaN(d.getTime())) return null;
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

export function todayKstDateStr(): string {
  return toKstDateStr(new Date())!;
}

export function resolveBatchBusinessDate(batch: {
  planned_date?: any; plannedDate?: any;
  completed_at?: any; completedAt?: any;
} | null | undefined): string {
  const planned = toKstDateStr(batch?.planned_date ?? batch?.plannedDate ?? null);
  if (planned) return planned;
  const completed = toKstDateStr(batch?.completed_at ?? batch?.completedAt ?? null);
  if (completed) return completed;
  return todayKstDateStr();
}
