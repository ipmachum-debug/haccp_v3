/**
 * 생산 상태 — 달력·생산 화면이 같은 3가지로 본다 (2026-10-20 대표 달력 기준)
 *
 *   작업계획(주황) : 계획 저장됨, 아직 시작 전 (원료 차감 없음)
 *   진행중(파랑)   : 첫 현장 확인 또는 금속검출 통과 시작으로 시작됨
 *   완료(녹색)     : 기록 확인·제출과 생산 완료가 끝남
 * 무효(중복 정리)·취소는 정상 달력·합계에서 빼고 이력으로만 둔다. 모르는 상태를 '계획' 으로 바꾸지 않는다 (그대로 보인다).
 * 확인 남음·원료 보류 같은 경고와 결재 대기는 색이 아니라 작은 표시.
 * 품목 색: 모두 완료 = 녹색, 하나라도 시작 = 파랑, 모두 시작 전 = 주황.
 */
export type ProdState = "plan" | "work" | "done" | "void" | "other";

export const PROD_STATE_UI: Record<ProdState, { label: string; dot: string; chip: string; soft: string }> = {
  plan: { label: "작업계획", dot: "bg-orange-400", chip: "bg-orange-400 text-white", soft: "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:border-orange-500/30" },
  work: { label: "진행중", dot: "bg-blue-500", chip: "bg-blue-500 text-white", soft: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30" },
  done: { label: "완료", dot: "bg-green-500", chip: "bg-green-600 text-white", soft: "bg-green-50 text-green-800 border-green-200 dark:bg-green-500/10 dark:text-green-300 dark:border-green-500/30" },
  void: { label: "무효·취소", dot: "bg-gray-300", chip: "bg-gray-200 text-gray-600", soft: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-500/10 dark:text-gray-400 dark:border-gray-500/30" },
  other: { label: "기타", dot: "bg-gray-400", chip: "bg-gray-400 text-white", soft: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-500/10 dark:text-gray-300 dark:border-gray-500/30" },
};

/** 생산 건 상태 글자 (DB 상태 그대로의 뜻 — 모르는 값은 그 값 그대로) */
export const BATCH_STATUS_LABEL: Record<string, string> = {
  planned: "계획",
  in_progress: "진행중",
  paused: "일시정지",
  completed: "완료",
  under_review: "검토 중",
  approved: "승인",
  shipped: "출하",
  archived: "보관",
  failed: "실패",
  cancelled: "취소",
};

const DONE = ["completed", "under_review", "approved", "shipped", "archived"];
const WORK = ["in_progress", "paused"];

export type BatchLike = { status?: string | null; planOnly?: boolean | null; voidedAt?: unknown; supersededByBatchId?: number | null };

export const isVoided = (b: BatchLike) => !!b.voidedAt || b.status === "cancelled";

export function batchState(b: BatchLike): ProdState {
  if (isVoided(b)) return "void";
  const s = String(b.status ?? "");
  if (DONE.includes(s)) return "done";
  if (s === "planned" || (b.planOnly && !WORK.includes(s))) return "plan";
  if (WORK.includes(s)) return "work";
  return "other";
}

/** 생산 건 상태 글자 — 무효는 '무효(중복)', 모르는 값은 그대로 */
export function batchStatusLabel(b: BatchLike): string {
  if (b.voidedAt) return "무효(중복)";
  const s = String(b.status ?? "");
  return BATCH_STATUS_LABEL[s] ?? (s || "상태 없음");
}

/** 품목 색 — 모두 완료 = 완료, 하나라도 시작(진행·완료·기타) = 진행중, 모두 시작 전 = 작업계획. 무효는 보지 않는다 */
export function productState(states: ProdState[]): ProdState {
  const live = states.filter((s) => s !== "void");
  if (!live.length) return "void";
  if (live.every((s) => s === "done")) return "done";
  if (live.every((s) => s === "plan")) return "plan";
  return "work";
}

export interface ProductGroup<T> { key: string; name: string; items: T[] }

/** 날짜 안에서 품목별로 묶기 — 생산 건(batch_id)·행·LOT 은 그대로, 묶어서 보이기만 (합치지 않음) */
export function groupByProduct<T extends { productId?: number | null; productName?: string | null; batchCode?: string | null }>(items: T[]): ProductGroup<T>[] {
  const map = new Map<string, ProductGroup<T>>();
  for (const it of items) {
    const key = it.productId != null ? `p${it.productId}` : `n${it.productName ?? it.batchCode ?? ""}`;
    const g = map.get(key) ?? { key, name: it.productName || it.batchCode || "-", items: [] };
    g.items.push(it);
    map.set(key, g);
  }
  return Array.from(map.values());
}

/** kg 합계 — 무효는 이미 뺀 목록을 넘긴다. 값 없는 건은 더하지 않는다 */
export const sumKg = (xs: Array<number | string | null | undefined>) => {
  const n = xs.map((x) => (x == null || x === "" ? NaN : Number(x))).filter((x) => Number.isFinite(x));
  return n.length ? Math.round(n.reduce((a, b) => a + b, 0) * 1000) / 1000 : null;
};
