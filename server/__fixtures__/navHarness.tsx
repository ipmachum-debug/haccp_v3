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

function App() {
  return (
    <Switch>
      <Route path="/list" component={List} />
      <Route path="/edit/:id" component={Edit} />
      <Route><div data-testid="page">other</div></Route>
    </Switch>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
