/**
 * 작업 위치 보존 브라우저 시험용 작은 앱 — 실제 훅(useTabWithUrl·useUrlFilters·useUnsavedChangesGuard)과
 * 실제 라우터(wouter)·브라우저 방문 이력으로 (server/navigationState.browser.test.ts 가 esbuild 로 묶어 Chromium 에서 띄운다).
 * 운영 화면과 같은 조합: 바깥 탭 + 안쪽 탭 + 검색 조건 + 수정 화면(돌아갈 곳·미저장 보호).
 */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Link, Route, Switch, useLocation, useSearch } from "wouter";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { useUrlFilters } from "@/components/common/FilterBar";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { returnToFromSearch, withReturnTo } from "@/lib/urlState";
// 실제 운영 화면 틀 — 사이드 메뉴·즐겨찾기·로고·전역 검색 버튼 그대로 (서버 연결은 시험이 navTrpcStub 으로 바꿔 묶는다)
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function List() {
  const [tab, setTab] = useTabWithUrl("tab", "a", ["a", "b", "c"]);
  const [inner, setInner] = useTabWithUrl("inner", "x", ["x", "y"]);
  const [f, setF] = useUrlFilters({ q: "", status: "all" });
  return (
    <div>
      <div data-testid="tab">{tab}</div>
      <div data-testid="inner">{inner}</div>
      <div data-testid="q">{f.q}</div>
      <div data-testid="status">{f.status}</div>
      {["a", "b", "c"].map((t) => <button key={t} data-testid={`tab-${t}`} onClick={() => setTab(t)}>{t}</button>)}
      {["x", "y"].map((t) => <button key={t} data-testid={`inner-${t}`} onClick={() => setInner(t)}>{t}</button>)}
      <input data-testid="search" value={f.q} onChange={(e) => setF({ q: e.target.value })} />
      <button data-testid="status-done" onClick={() => setF({ status: "done" })}>done</button>
      <Link href={withReturnTo("/edit/1")} data-testid="to-edit">edit</Link>
    </div>
  );
}

function Edit() {
  const [, navigate] = useLocation();
  const backTo = returnToFromSearch(useSearch(), "/list?tab=b");
  const [saved, setSaved] = useState("orig");
  const [value, setValue] = useState("orig");
  const { confirmLeave } = useUnsavedChangesGuard(value !== saved);
  return (
    <div>
      <div data-testid="page">edit</div>
      <input data-testid="field" value={value} onChange={(e) => setValue(e.target.value)} />
      <button data-testid="save" onClick={() => setSaved(value)}>save</button>
      <button data-testid="back" onClick={() => { if (confirmLeave()) navigate(backTo); }}>back</button>
      <Link href="/list" data-testid="menu-link">menu</Link>
    </div>
  );
}

// 실제 DashboardLayout 안의 수정 화면 — 같은 화면 안 탭(쿼리만 바꿈)은 묻지 않아야 한다
function LayoutEdit() {
  const [tab, setTab] = useTabWithUrl("tab", "table", ["table", "flow", "edit"]);
  return (
    <DashboardLayout>
      <div data-testid="layout-tab">{tab}</div>
      {["table", "flow", "edit"].map((t) => <button key={t} data-testid={`layout-tab-${t}`} onClick={() => setTab(t)}>{t}</button>)}
      <Edit />
    </DashboardLayout>
  );
}

function App() {
  return (
    <Switch>
      <Route path="/list" component={List} />
      <Route path="/edit/:id" component={Edit} />
      <Route path="/app/edit/:id" component={LayoutEdit} />
      <Route><div data-testid="page">other</div></Route>
    </Switch>
  );
}

// 운영 앱과 같은 바깥 틀 (main.tsx·App.tsx) — 테마·툴팁·조회 캐시
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <ThemeProvider defaultTheme="light" switchable>
      <TooltipProvider><App /></TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>,
);
