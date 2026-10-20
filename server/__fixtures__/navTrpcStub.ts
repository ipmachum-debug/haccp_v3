/**
 * 브라우저 시험용 서버 연결 대역 — 실제 DashboardLayout 을 서버·DB 없이 그리기 위해 (navHarness 가 esbuild 로 lib/trpc 대신 묶는다).
 * 모든 조회는 비어 있고, 로그인 사용자·즐겨찾기 한 개만 정해 둔다. 변경 요청은 아무것도 하지 않는다.
 */
const FIXED: Record<string, unknown> = {
  "auth.me": { id: 1, name: "시험 사용자", email: "nav-test@example.invalid", role: "admin", tenantId: 1 },
  get "favorites.list"() { return (globalThis as any).__NAV_FAVORITES__ ?? []; }, // 시험 페이지가 정한 즐겨찾기
};

const noop = () => undefined;
const query = (key: string) => ({
  data: FIXED[key], isLoading: false, isFetching: false, isPending: false, isError: false, isSuccess: true, error: null,
  status: "success", refetch: async () => ({ data: FIXED[key] }), fetchNextPage: noop, hasNextPage: false,
});
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
      if (p === "useQuery") return () => query(key);
      if (p === "useSuspenseQuery") return () => [FIXED[key], query(key)];
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
