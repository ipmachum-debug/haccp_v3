/**
 * useTabWithUrl - 탭 상태를 URL 파라미터에 저장하여 새로고침 시 유지
 *
 * 사용법:
 *   const [tab, setTab] = useTabWithUrl("tab", "current");
 *   <Tabs value={tab} onValueChange={setTab}>
 *
 * 여러 탭 레벨이 있는 경우 — 의미가 다른 키로 나눈다 (바깥 tab, 안쪽 ledgerTab 등):
 *   const [mainTab, setMainTab] = useTabWithUrl("tab", "current");
 *   const [subTab, setSubTab] = useTabWithUrl("sub", "overview");
 *
 * 허용 값을 주면 그 밖의 값(옛 링크·잘못된 쿼리·권한 없는 탭)은 기본값으로:
 *   useTabWithUrl("tab", "material-ledger", ["material-ledger", "usage-reports", "mf-reports"])
 *
 * 2026-10-21 (작업 위치 보존): URL 을 정본으로 — 처음 한 번 읽고 따로 들고 있던 상태를 없앴다.
 *   다른 훅·뒤로/앞으로·같은 경로의 쿼리 변경이 와도 화면이 URL 과 같다. 바꿀 때 기존 history.state 를 지우지 않는다.
 */
import { useCallback } from "react";
import { useSearch } from "wouter";
import { pickAllowed, replaceQuery } from "@/lib/urlState";

export function useTabWithUrl(
  paramName: string = "tab",
  defaultValue: string = "",
  allowed?: readonly string[],
): [string, (value: string) => void] {
  const search = useSearch();
  const value = pickAllowed(new URLSearchParams(search).get(paramName), defaultValue, allowed);

  const setTab = useCallback((newValue: string) => {
    replaceQuery({ [paramName]: newValue === defaultValue ? null : newValue });
  }, [paramName, defaultValue]);

  return [value, setTab];
}
