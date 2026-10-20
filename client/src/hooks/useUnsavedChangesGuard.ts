/**
 * 저장하지 않은 입력 보호 (2026-10-21, 작업 위치 보존과 분리)
 *
 * 값이 실제로 바뀌었을 때(dirty)만 묻는다 — 바뀐 게 없거나 저장이 끝났으면 묻지 않는다.
 *   - 새로고침·창 닫기·전체 주소 이동: 브라우저 기본 확인 (beforeunload)
 *   - 앱 안 화면 이동 전부: 이동 관문(history.pushState / 다른 화면으로의 replaceState)에서 확인 —
 *     사이드 메뉴·즐겨찾기·헤더·전역 검색 버튼(setLocation), 링크(Link), 코드의 navigate 모두 여기를 지난다.
 *     (2026-10-21 Codex: 이전엔 <a> 링크 클릭만 봐서 버튼으로 된 실제 사이드 메뉴는 경고 없이 이동했다)
 *   - 브라우저 뒤로/앞으로: 라우터보다 먼저 받아 확인 — 머무르면 지금 주소로 되돌린다
 *   - 화면의 취소·뒤로·목록 버튼: confirmLeave() 로 확인 — 확인했으면 그 이동은 한 번 그대로 통과 (두 번 묻지 않음)
 *   같은 화면의 쿼리만 바꾸는 이동(탭·검색 — 같은 경로의 replaceState)은 묻지 않는다.
 * 입력값을 어디에도 자동 저장하지 않는다 (운영 DB·URL 모두). 탭 보존과 별개다.
 *
 * 관문은 이 모듈을 불러올 때 한 번 설치한다 — main.tsx 가 앱을 그리기 전에 불러 라우터보다 먼저 받는다.
 */
import { useCallback, useEffect, useRef } from "react";

export const UNSAVED_MESSAGE = "저장하지 않은 변경이 있습니다. 나가면 입력한 내용이 사라집니다. 나갈까요?";

const hrefNow = () => (typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}${window.location.hash}`);

type Guard = { dirty: () => boolean; message: () => string; here: () => string };
const guards = new Set<Guard>();
const activeGuard = () => Array.from(guards).find((g) => g.dirty()) ?? null;

// 이미 확인(나가기)한 이동 한 번은 관문을 그냥 통과 — 같은 일로 두 번 묻지 않게. 같은 작업 순서 안에서만 유효
let passOnce = false;
/** 사용자가 이미 '나가기' 를 확인했다 — 바로 다음 화면 이동 한 번은 묻지 않는다 */
export function allowNextNavigation(): void {
  passOnce = true;
  setTimeout(() => { passOnce = false; }, 0);
}

/** 이 이동이 지금 화면을 떠나는가 — 경로가 바뀌면 떠남. push 는 같은 경로라도 쿼리가 바뀌면 떠남(다른 문서·버전), replace 로 같은 경로의 쿼리만 바꾸는 것은 같은 화면 */
function leavesScreen(url: unknown, kind: "push" | "replace"): boolean {
  if (url == null) return false;
  let next: URL;
  try { next = new URL(String(url), window.location.href); } catch { return false; }
  if (next.origin !== window.location.origin) return true;
  if (next.pathname !== window.location.pathname) return true;
  return kind === "push" && next.search !== window.location.search;
}

let installed = false;
export function installUnsavedChangesGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  // 1) 앱 안 화면 이동 관문
  for (const kind of ["push", "replace"] as const) {
    const key = kind === "push" ? "pushState" : "replaceState";
    const original = window.history[key];
    window.history[key] = function (this: History, data: any, unused: string, url?: string | URL | null) {
      if (passOnce) { passOnce = false; return original.call(this, data, unused, url); }
      const g = activeGuard();
      if (g && leavesScreen(url, kind) && !window.confirm(g.message())) return; // 머묾 — 주소·입력·선택 그대로
      return original.call(this, data, unused, url);
    } as History["pushState"];
  }
  // 2) 브라우저 뒤로/앞으로 — 라우터(wouter 의 popstate 리스너)보다 먼저
  window.addEventListener("popstate", (e) => {
    const g = activeGuard();
    if (!g) return;
    if (window.confirm(g.message())) return; // 나감 — 라우터가 이어서 처리
    e.stopImmediatePropagation();           // 머묾 — 라우터가 보지 못하게, 주소도 되돌린다
    passOnce = true;                         // 되돌리는 이동은 관문을 지나지 않게
    window.history.pushState(window.history.state, "", g.here());
    passOnce = false;
  }, true);
}
installUnsavedChangesGuard();

export function useUnsavedChangesGuard(dirty: boolean, message: string = UNSAVED_MESSAGE): { confirmLeave: () => boolean } {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const messageRef = useRef(message);
  messageRef.current = message;
  // 머무를 때 되돌아갈 주소 — 매 그리기마다 지금 주소 (탭·검색을 바꿔도 최신)
  const hereRef = useRef(hrefNow());
  useEffect(() => { hereRef.current = hrefNow(); });

  useEffect(() => {
    const g: Guard = { dirty: () => dirtyRef.current, message: () => messageRef.current, here: () => hereRef.current };
    guards.add(g);
    return () => { guards.delete(g); };
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  /** 화면의 취소·뒤로 버튼 — 바뀐 게 없으면 바로 true, 있으면 묻고, '나가기' 면 그 이동을 한 번 통과시킨다 */
  const confirmLeave = useCallback(() => {
    if (!dirtyRef.current) return true;
    if (!window.confirm(messageRef.current)) return false;
    allowNextNavigation();
    return true;
  }, []);
  return { confirmLeave };
}
