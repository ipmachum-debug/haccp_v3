/**
 * 배포 전환 중 화면 조각(동적 import) 불러오기 실패 회복 (2026-10-19, Codex #601 배포 확인 6)
 *
 * 배포로 파일 이름(해시)이 바뀐 뒤 예전 화면에서 다른 메뉴를 열면 예전 조각을 찾지 못해
 * "Failed to fetch dynamically imported module" 로 화면 전체가 오류가 된다.
 * → 한 번만 새로 불러온다 (새 버전 화면). 60초 안에 또 실패하면 다시 불러오지 않고 안내 화면을 보여 준다(무한 반복 방지).
 * 저장·승인 요청은 다시 보내지 않는다 — 화면을 옮기는 순간(조각 불러오기)에만 동작하고, 페이지를 다시 읽기만 한다.
 */
const KEY = "haccp:chunk-reloaded-at";
const TTL_MS = 60_000;

export function isChunkLoadError(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e ?? "");
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Loading chunk \S+ failed/i.test(msg);
}

/** 새로 불러오기를 시작했으면 true. 최근에 이미 했으면 false (호출부가 안내를 보여 준다) */
export function reloadOnceForNewVersion(reason: string): boolean {
  try {
    const prev = Number(sessionStorage.getItem(KEY));
    const now = Date.now();
    if (prev && now - prev < TTL_MS) return false;
    sessionStorage.setItem(KEY, String(now));
  } catch {
    return false; // 저장소를 못 쓰면 반복을 막을 수 없으니 자동으로 다시 불러오지 않는다
  }
  console.warn(`[chunk] 새 버전 화면 조각을 불러오려고 다시 읽습니다: ${reason}`);
  window.location.reload();
  return true;
}

export function installChunkReload() {
  // Vite 가 동적 import 실패 때 보내는 이벤트 — 다시 불러오기를 시작하면 오류를 화면으로 넘기지 않는다
  window.addEventListener("vite:preloadError", (ev: Event) => {
    if (reloadOnceForNewVersion(String((ev as any).payload?.message ?? "preloadError"))) ev.preventDefault();
  });
}
