/**
 * 저장하지 않은 입력 보호 (2026-10-21, 작업 위치 보존과 분리)
 *
 * 값이 실제로 바뀌었을 때(dirty)만 묻는다 — 바뀐 게 없거나 저장이 끝났으면 묻지 않는다.
 *   - 새로고침·창 닫기: 브라우저 기본 확인 (beforeunload)
 *   - 브라우저 뒤로/앞으로: 라우터보다 먼저 받아 확인 — 머무르면 지금 주소로 되돌린다
 *   - 화면 안 링크(사이드 메뉴 등) 클릭: 확인 — 머무르면 이동하지 않는다
 *   - 화면의 취소·뒤로·목록 버튼: confirmLeave() 로 같은 확인
 * 입력값을 어디에도 자동 저장하지 않는다 (운영 DB·URL 모두). 탭 보존과 별개다.
 *
 * 뒤로/앞으로는 라우터(wouter)가 먼저 받으면 화면이 바로 바뀌어(편집 화면이 내려가) 물을 수 없다.
 *   그래서 이 모듈을 불러올 때 한 번, 라우터보다 먼저 popstate 를 받는 리스너를 단다 (main.tsx 가 앱을 그리기 전에 불러온다).
 *   지금 보호 중인 화면이 있을 때만 끼어든다.
 */
import { useCallback, useEffect, useRef } from "react";

export const UNSAVED_MESSAGE = "저장하지 않은 변경이 있습니다. 나가면 입력한 내용이 사라집니다. 나갈까요?";

const hrefNow = () => (typeof window === "undefined" ? "/" : `${window.location.pathname}${window.location.search}${window.location.hash}`);

type Guard = { dirty: () => boolean; message: () => string; here: () => string };
const guards = new Set<Guard>();
const activeGuard = () => Array.from(guards).find((g) => g.dirty()) ?? null;

let installed = false;
export function installUnsavedChangesGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("popstate", (e) => {
    const g = activeGuard();
    if (!g) return;
    if (window.confirm(g.message())) return; // 나감 — 라우터가 이어서 처리
    e.stopImmediatePropagation();           // 머묾 — 라우터가 보지 못하게, 주소도 되돌린다
    window.history.pushState(window.history.state, "", g.here());
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
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (`${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`) return; // 같은 화면 (해시 이동 등)
      if (window.confirm(messageRef.current)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const confirmLeave = useCallback(() => !dirtyRef.current || window.confirm(messageRef.current), []);
  return { confirmLeave };
}
