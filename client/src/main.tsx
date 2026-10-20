import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";
import { registerServiceWorker, setupInstallPrompt } from "./registerSW";
import { installChunkReload } from "./lib/chunkReload";
import { installUnsavedChangesGuard } from "./hooks/useUnsavedChangesGuard";

installChunkReload();
// 저장하지 않은 입력 보호 — 브라우저 뒤로/앞으로를 라우터보다 먼저 받도록 앱을 그리기 전에 (2026-10-21)
installUnsavedChangesGuard();

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: any) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

/** 기기(브라우저 저장소에 하나)·세션(탭마다 하나) 식별자 — 개인 계정 이력 보조 (사람 식별은 로그인 계정) */
let _ids: { deviceId: string; sessionId: string } | null = null;
function clientIds() {
  if (_ids) return _ids;
  const rid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  let deviceId = "", sessionId = "";
  try { deviceId = localStorage.getItem("mx-device-id") || ""; if (!deviceId) { deviceId = rid(); localStorage.setItem("mx-device-id", deviceId); } } catch { /* 저장소 없음 */ }
  try { sessionId = sessionStorage.getItem("mx-session-id") || ""; if (!sessionId) { sessionId = rid(); sessionStorage.setItem("mx-session-id", sessionId); } } catch { /* 저장소 없음 */ }
  _ids = { deviceId, sessionId };
  return _ids;
}

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      // 기기·세션 — 현장 확인·수정 이력에 남는다 (2026-10-19 하루 생산 흐름). 저장소를 못 쓰면 비워 보낸다
      headers() {
        return { "x-device-id": clientIds().deviceId, "x-session-id": clientIds().sessionId };
      },
      fetch(input: any, init: any) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// PWA Service Worker 등록
registerServiceWorker();
setupInstallPrompt();
