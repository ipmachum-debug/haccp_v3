/**
 * 화면 작업 위치 — URL 쿼리·돌아갈 주소 (2026-10-21, 탭·뒤로가기·새로고침 작업 위치 보존)
 *
 * 조회 상태(탭·안쪽 탭·검색·기간·상태·페이지·보기)는 URL 쿼리가 기준이다 — 새로고침·직접 링크·뒤로/앞으로가 같은 화면이 되게.
 *   - 쿼리는 replaceState 로 바꾼다: 탭·검색 바꾸기는 방문 이력을 쌓지 않는다 (화면 사이 이동만 이력).
 *   - 기존 history.state 는 지우지 않는다 (이전 useTabWithUrl 은 replaceState({}) 로 지웠다).
 *   - wouter 가 replaceState 를 감싸 이벤트를 내므로 같은 화면의 다른 훅(useSearch)도 같은 URL 을 다시 읽는다.
 * 돌아갈 주소(returnTo)는 같은 사이트의 상대 경로만 받는다 — 외부 주소·'//host'·역슬래시·제어 문자는 버리고 기본 복귀로.
 * URL 에는 조회 조건만 — 배합값·개인정보·토큰·입력 중인 값은 넣지 않는다.
 */

/** 쿼리 문자열에 바꿀 값 적용 (순수 — 시험 대상). null·undefined·'' 는 지운다. 다른 키는 그대로 */
export function patchSearch(search: string, patch: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const [k, v] of Object.entries(patch)) {
    if (v == null || v === "") p.delete(k);
    else p.set(k, String(v));
  }
  const q = p.toString();
  return q ? `?${q}` : "";
}

/** 지금 주소의 쿼리만 바꾼다 — 방문 이력을 쌓지 않고, 기존 history.state 는 유지 */
export function replaceQuery(patch: Record<string, string | number | null | undefined>): void {
  if (typeof window === "undefined") return;
  const next = `${window.location.pathname}${patchSearch(window.location.search, patch)}${window.location.hash}`;
  if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  window.history.replaceState(window.history.state, "", next);
}

/** 허용 목록이 있으면 그 안의 값만, 아니면 기본값 (잘못된·권한 없는 탭 값을 그대로 쓰지 않게) */
export function pickAllowed(raw: string | null | undefined, defaultValue: string, allowed?: readonly string[]): string {
  if (!raw) return defaultValue;
  if (allowed && !allowed.includes(raw)) return defaultValue;
  return raw;
}

/** 1 이상의 정수 페이지 — 아니면 1 */
export function pickPage(raw: string | null | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
}

/** 날짜(YYYY-MM-DD)·월(YYYY-MM) 쿼리 — 모양과 실제 날짜가 맞을 때만, 아니면 기본값 */
export function pickDate(raw: string | null | undefined, fallback: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return fallback;
  const [y, m, d] = raw.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? raw : fallback;
}
export function pickMonth(raw: string | null | undefined, fallback: string): string {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return fallback;
  const m = Number(raw.slice(5));
  return m >= 1 && m <= 12 ? raw : fallback;
}

/**
 * 돌아갈 주소 검사 — 같은 사이트의 상대 경로('/…')만. 아니면 fallback.
 *   거절: 'https://…', '//host/…', '/\\host', 'javascript:…', 제어 문자·공백 시작, 너무 긴 값
 */
export function safeReturnTo(raw: string | null | undefined, fallback: string): string {
  if (!raw || typeof raw !== "string") return fallback;
  const v = raw; // URLSearchParams.get 이 이미 한 번 풀어 준 값
  if (v.length > 2000) return fallback;
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return fallback;
  if (/^\/[^/?#]*:/.test(v)) return fallback; // '/javascript:…' 같은 모양
  return v;
}

/** 지금 화면의 경로 + 쿼리 (돌아올 곳) */
export function currentPathWithSearch(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

/** 이동할 주소에 돌아올 곳(returnTo)을 붙인다 — 기본은 지금 화면 */
export function withReturnTo(path: string, from: string = currentPathWithSearch()): string {
  const [base, hash = ""] = path.split("#");
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}returnTo=${encodeURIComponent(from)}${hash ? `#${hash}` : ""}`;
}

/** 쿼리에서 돌아갈 곳 — 검사한 상대 경로, 없거나 잘못되면 fallback (직접 링크·새 창 진입도 안전한 업무 목록으로) */
export function returnToFromSearch(search: string, fallback: string): string {
  const p = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return safeReturnTo(p.get("returnTo"), fallback);
}
