/**
 * useTabWithUrl - 탭 상태를 URL 파라미터에 저장하여 새로고침 시 유지
 *
 * 사용법:
 *   const [tab, setTab] = useTabWithUrl("tab", "current");
 *   <Tabs value={tab} onValueChange={setTab}>
 *
 * 여러 탭 레벨이 있는 경우:
 *   const [mainTab, setMainTab] = useTabWithUrl("tab", "current");
 *   const [subTab, setSubTab] = useTabWithUrl("sub", "overview");
 */
import { useState, useCallback, useEffect } from "react";

export function useTabWithUrl(paramName: string = "tab", defaultValue: string = ""): [string, (value: string) => void] {
  const getInitial = () => {
    if (typeof window === "undefined") return defaultValue;
    const params = new URLSearchParams(window.location.search);
    return params.get(paramName) || defaultValue;
  };

  const [value, setValue] = useState(getInitial);

  const setTab = useCallback((newValue: string) => {
    setValue(newValue);
    const url = new URL(window.location.href);
    if (newValue === defaultValue) {
      url.searchParams.delete(paramName);
    } else {
      url.searchParams.set(paramName, newValue);
    }
    window.history.replaceState({}, "", url.toString());
  }, [paramName, defaultValue]);

  // 브라우저 뒤로/앞으로 대응
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setValue(params.get(paramName) || defaultValue);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [paramName, defaultValue]);

  return [value, setTab];
}
