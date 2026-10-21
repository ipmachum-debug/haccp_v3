/**
 * 브라우저 시험용 서버 연결 대역 — 실제 DashboardLayout 을 서버·DB 없이 그리기 위해 (navHarness 가 esbuild 로 lib/trpc 대신 묶는다).
 * 모든 조회는 비어 있고, 로그인 사용자·즐겨찾기 한 개만 정해 둔다. 변경 요청은 아무것도 하지 않는다.
 * 시험 페이지가 window.__NAV_DATA__ 에 조회 이름별 합성 값을 넣으면 그 값을 돌려준다 (회사 자료 아님).
 * window.__NAV_ROLE__ 로 로그인 역할을, window.__NAV_AUTH_DELAY_MS__ 로 로그인 정보 응답 지연을 흉내 낸다.
 */
import { useEffect, useState } from "react";

const g = globalThis as any;
const FIXED: Record<string, unknown> = {
  "auth.me": { id: 1, name: "시험 사용자", email: "nav-test@example.invalid", role: g.__NAV_ROLE__ ?? "admin", tenantId: 1 },
  get "favorites.list"() { return (globalThis as any).__NAV_FAVORITES__ ?? []; }, // 시험 페이지가 정한 즐겨찾기
};

const noop = () => undefined;
const dataOf = (key: string) => ((globalThis as any).__NAV_DATA__ ?? {})[key] ?? FIXED[key];
const query = (key: string) => ({
  data: dataOf(key), isLoading: false, isFetching: false, isPending: false, isError: false, isSuccess: true, error: null,
  status: "success", refetch: async () => ({ data: dataOf(key) }), fetchNextPage: noop, hasNextPage: false,
});
// 로그인 정보 응답 지연 — 앱을 연 뒤 정해진 시간까지는 '불러오는 중' (실제 서버 응답이 늦을 때와 같은 순서)
const authReadyAt = Date.now() + Number(g.__NAV_AUTH_DELAY_MS__ ?? 0);
function useDelayedAuth(key: string) {
  const [, tick] = useState(0);
  const wait = authReadyAt - Date.now();
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => tick((n) => n + 1), wait + 5);
    return () => clearTimeout(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  if (wait > 0) return { ...query(key), data: undefined, isLoading: true, isPending: true, isSuccess: false, status: "pending" };
  return query(key);
}

const mutation = () => ({
  mutate: noop, mutateAsync: async () => ({}), reset: noop, isPending: false, isLoading: false, isError: false, isSuccess: false, error: null, data: undefined,
});

/** utils 쪽 — 무엇을 불러도 조용히 끝난다 */
function utilsProxy(): any {
  return new Proxy(function () {}, {
    get: (_t, p) => (p === "then" ? undefined : utilsProxy()),
    apply: () => Promise.resolve(undefined),
  });
}

function node(path: string[]): any {
  return new Proxy(function () {}, {
    get(_t, p) {
      if (typeof p !== "string" || p === "then") return undefined;
      const key = path.join(".");
      if (p === "useQuery") return key === "auth.me" ? () => useDelayedAuth(key) : () => query(key);
      if (p === "useSuspenseQuery") return () => [dataOf(key), query(key)];
      if (p === "useInfiniteQuery") return () => ({ ...query(key), data: { pages: [], pageParams: [] } });
      if (p === "useMutation") return () => mutation();
      if (p === "useSubscription") return noop;
      if (path.length === 0 && (p === "useUtils" || p === "useContext")) return () => utilsProxy();
      if (path.length === 0 && p === "Provider") return ({ children }: any) => children;
      return node([...path, p]);
    },
  });
}

export const trpc = node([]);
