/**
 * 체크리스트 시작 화면 — 순수 도우미 (일지 PR 3, 2026-10-15)
 */
import { CHECKLIST_ITEMS, type ChecklistCatalogItem, type ChecklistCycle } from "./catalog";

/** 주기 일지 (공통 일지에 저장되지만 카탈로그 33종과 별도 화면) */
export const PERIODIC_LOGS: ReadonlyArray<{ id: string; title: string; formType: string | null; createPath: string; listPath: string; cycle: ChecklistCycle }> = [
  { id: "daily-log", title: "일일일지", formType: "daily_log", createPath: "/daily-log/daily", listPath: "/dashboard/daily-logs", cycle: "daily" },
  { id: "weekly-log", title: "주간일지", formType: "weekly_log", createPath: "/weekly-log/form", listPath: "/quality/checklists?tab=records&type=weekly_log", cycle: "weekly" },
  { id: "monthly-log", title: "월간일지", formType: "monthly_log", createPath: "/monthly-log/form", listPath: "/quality/checklists?tab=records&type=monthly_log", cycle: "monthly" },
];

const ITEM_BY_FORM_TYPE = new Map(CHECKLIST_ITEMS.filter((i) => i.formType).map((i) => [i.formType as string, i]));

export function catalogItemOfFormType(formType: string): ChecklistCatalogItem | undefined {
  return ITEM_BY_FORM_TYPE.get(formType);
}

/** 작성 기록 하나를 여는 주소 — 양식 상세(기존 URL). 상세 주소가 없는 주기 일지는 그 목록 */
export function recordHref(formType: string, id: number): string | null {
  const item = ITEM_BY_FORM_TYPE.get(formType);
  if (item) return `${item.listPath}/${id}`;
  if (formType === "daily_log") return "/dashboard/daily-logs";
  return null;
}

/** 즐겨찾기 켜고 끄기 — 새로 켜면 맨 뒤 */
export function toggleFavorite(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

/** 즐겨찾기 순서 바꾸기 (모바일에서도 쓰는 위/아래 버튼) — 범위 밖이면 그대로 */
export function moveFavorite(list: readonly string[], id: string, dir: -1 | 1): string[] {
  const i = list.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 저장된 즐겨찾기 중 지금 카탈로그에 있는 것만 (사라진 양식은 화면에서 빼되 저장값은 그대로 둔다) */
export function resolveFavorites(ids: readonly string[]): ChecklistCatalogItem[] {
  const byId = new Map(CHECKLIST_ITEMS.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((x): x is ChecklistCatalogItem => !!x);
}

/** 새 일지 작성 탭 필터 — 검색어(이름·설명) + 주기 */
export function filterCatalog(items: readonly ChecklistCatalogItem[], q: string, cycle: ChecklistCycle | "all"): ChecklistCatalogItem[] {
  const needle = q.trim().toLowerCase();
  return items.filter((i) => (cycle === "all" || i.cycle === cycle) && (!needle || i.title.toLowerCase().includes(needle) || i.description.toLowerCase().includes(needle)));
}

export const STATUS_LABEL: Record<string, string> = { draft: "작성중", submitted: "승인대기", approved: "승인완료", rejected: "반려" };
