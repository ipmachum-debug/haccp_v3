/**
 * 측정 패널 — 4단계 역할별 사용 측정 (2026-10-14). 측정 모드(?measure=1)일 때만 App 이 불러온다.
 * 시나리오를 고르고 시작 → 평소처럼 업무 → 완료. 클릭·화면 이동·오류 알림·시간은 자동으로 센다.
 * 막힌 지점은 "막힘" 으로 한 줄 남긴다. 결과는 이 브라우저에만 있고 CSV/JSON 으로 내려받는다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SCENARIOS, STORAGE, type MeasureSession, type MeasureLayout,
  newSession, addEvent, endSession, summarize, toCsv, compareLayouts, clickLabel,
  loadSessions, saveSessions, loadActive, saveActive, measureLayoutOverride, setMeasureLayout,
} from "@/lib/measure/measureRecorder";

export const MEASURE_ERROR_EVENT = "millio:measure-error";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function MeasurePanel({ defaultLayout }: { defaultLayout: MeasureLayout }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState<MeasureSession | null>(() => loadActive());
  const [sessions, setSessions] = useState<MeasureSession[]>(() => loadSessions());
  const [scenario, setScenario] = useState(SCENARIOS[0].key);
  const [tester, setTester] = useState(() => { try { return localStorage.getItem(STORAGE.tester) || ""; } catch { return ""; } });
  const [note, setNote] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [, tick] = useState(0);
  const layout: MeasureLayout = measureLayoutOverride() ?? defaultLayout;

  const activeRef = useRef(active);
  const update = (fn: (s: MeasureSession) => MeasureSession) => {
    const cur = activeRef.current;
    if (!cur) return;
    const next = fn(cur);
    activeRef.current = next;
    saveActive(next);
    setActive(next);
  };
  useEffect(() => { activeRef.current = active; }, [active]);

  // 화면 이동
  useEffect(() => {
    update((s) => addEvent(s, "route", location + window.location.search, Date.now()));
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // 클릭 (패널 안 클릭은 제외) · 오류 알림
  useEffect(() => {
    if (!active) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.("[data-measure-panel]")) return;
      update((s) => addEvent(s, "click", clickLabel(el) ?? `${el?.tagName?.toLowerCase() ?? "?"}:기타`, Date.now()));
    };
    const onError = (e: Event) => {
      update((s) => addEvent(s, "error", String((e as CustomEvent).detail ?? "오류"), Date.now()));
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(MEASURE_ERROR_EVENT, onError);
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(MEASURE_ERROR_EVENT, onError);
      window.clearInterval(timer);
    };
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = () => {
    try { localStorage.setItem(STORAGE.tester, tester); } catch { /* noop */ }
    const s = newSession({
      scenario, role: user?.role ?? "unknown", tester: tester || user?.name || "", layout,
      tenantId: (user as { tenantId?: number } | null)?.tenantId ?? null, now: Date.now(),
      path: location + window.location.search,
    });
    activeRef.current = s; saveActive(s); setActive(s);
  };
  const finish = (completed: boolean) => {
    const cur = activeRef.current;
    if (!cur) return;
    const done = endSession(cur, completed, Date.now());
    const list = [...sessions, done];
    saveSessions(list); setSessions(list);
    activeRef.current = null; saveActive(null); setActive(null);
  };
  const switchLayout = (l: MeasureLayout) => {
    if (active && !window.confirm("측정 중입니다. 사이드바를 바꾸면 새로고침됩니다 — 이 측정은 이어서 기록됩니다. 계속할까요?")) return;
    setMeasureLayout(l);
    window.location.reload();
  };
  const turnOff = () => {
    if (active && !window.confirm("측정 중인 기록은 저장하지 않고 측정 모드를 끕니다. 계속할까요?")) return;
    saveActive(null);
    const url = new URL(window.location.href);
    url.searchParams.set("measure", "0");
    window.location.href = url.toString();
  };

  const live = active ? summarize(active) : null;
  const elapsed = active ? Math.round((Date.now() - active.startedAt) / 1000) : 0;
  const compare = useMemo(() => (showCompare ? compareLayouts(sessions) : []), [showCompare, sessions]);
  const stamp = new Date().toISOString().slice(0, 10);

  if (!open) {
    return (
      <button data-measure-panel type="button" onClick={() => setOpen(true)}
        className="fixed bottom-20 left-3 z-[60] rounded-full bg-violet-600 text-white text-xs px-3 py-1.5 shadow-lg md:bottom-4">
        측정{active ? ` ● ${fmtSec(elapsed)}` : ""}
      </button>
    );
  }

  return (
    <div data-measure-panel data-testid="measure-panel"
      className="fixed bottom-20 left-3 z-[60] w-[min(360px,calc(100vw-24px))] max-h-[70vh] overflow-auto rounded-lg border bg-background text-foreground shadow-xl text-xs md:bottom-4">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="font-semibold">사용 측정 {active && <span className="text-violet-600">● 기록 중</span>}</span>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">사이드바</span>
          <Button size="sm" variant={layout === "tabs" ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => layout !== "tabs" && switchLayout("tabs")}>개편 전</Button>
          <Button size="sm" variant={layout === "hub" ? "default" : "outline"} className="h-6 px-2 text-xs" onClick={() => layout !== "hub" && switchLayout("hub")}>개편 후</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setOpen(false)} aria-label="접기">—</Button>
        </div>
      </div>

      <div className="space-y-2 px-3 py-2">
        {!active ? (
          <>
            <select className="w-full rounded border bg-background px-2 py-1" value={scenario} onChange={(e) => setScenario(e.target.value)} data-testid="measure-scenario">
              {SCENARIOS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <div className="flex gap-2">
              <Input className="h-7 text-xs" placeholder="측정자 (예: 작업자A)" value={tester} onChange={(e) => setTester(e.target.value)} />
              <Button size="sm" className="h-7" onClick={start} data-testid="measure-start">시작</Button>
            </div>
            <div className="text-muted-foreground">역할 {user?.role ?? "-"} · 사이드바 {layout === "tabs" ? "개편 전(탭)" : "개편 후(허브)"} — 시작 화면에서 누르세요.</div>
          </>
        ) : (
          <>
            <div className="font-medium">{SCENARIOS.find((s) => s.key === active.scenario)?.label ?? active.scenario}</div>
            <div className="grid grid-cols-5 gap-1 text-center">
              {[["시간", fmtSec(elapsed)], ["클릭", live!.clicks], ["화면", live!.screens], ["오류", live!.errors], ["막힘", live!.blocked]].map(([k, v]) => (
                <div key={String(k)} className="rounded bg-muted px-1 py-1"><div className="text-[10px] text-muted-foreground">{k}</div><div className="font-semibold tabular-nums">{v}</div></div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input className="h-7 text-xs" placeholder="막힌 지점 / 단계 메모" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button size="sm" variant="outline" className="h-7" onClick={() => { update((s) => addEvent(s, "blocked", note || "막힘", Date.now())); setNote(""); }} data-testid="measure-blocked">막힘</Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => { update((s) => addEvent(s, "step", note || "단계", Date.now())); setNote(""); }}>단계</Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 flex-1" onClick={() => finish(true)} data-testid="measure-finish">완료</Button>
              <Button size="sm" variant="outline" className="h-7" onClick={() => finish(false)}>중단(미완료)</Button>
            </div>
          </>
        )}
      </div>

      <div className="space-y-2 border-t px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-auto text-muted-foreground">저장된 측정 {sessions.length}건</span>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={!sessions.length} onClick={() => download(`millio-measure-${stamp}.csv`, toCsv(sessions), "text/csv;charset=utf-8")} data-testid="measure-csv">CSV</Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={!sessions.length} onClick={() => download(`millio-measure-${stamp}.json`, JSON.stringify(sessions, null, 2), "application/json")}>JSON</Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" disabled={!sessions.length} onClick={() => setShowCompare((v) => !v)}>비교</Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={!sessions.length} onClick={() => { if (window.confirm("저장된 측정을 모두 지울까요? 먼저 CSV 로 내려받으세요.")) { saveSessions([]); setSessions([]); } }}>지우기</Button>
        </div>
        {sessions.slice(-5).reverse().map((s) => {
          const r = summarize(s);
          return (
            <div key={s.id} className="flex justify-between gap-2 text-muted-foreground">
              <span>{r.scenario} · {r.role} · {r.layout === "tabs" ? "전" : "후"}{r.completed ? "" : " (미완료)"}</span>
              <span className="tabular-nums">{fmtSec(r.durationSec)} · 클릭 {r.clicks} · 화면 {r.screens}{r.blocked ? ` · 막힘 ${r.blocked}` : ""}</span>
            </div>
          );
        })}
        {showCompare && (
          <table className="w-full text-[11px]">
            <thead><tr className="text-muted-foreground"><th className="text-left">시나리오·역할</th><th>시간 전→후</th><th>클릭</th><th>화면</th></tr></thead>
            <tbody>
              {compare.map((c) => (
                <tr key={`${c.scenario}${c.role}`}>
                  <td>{c.scenario} {c.role} <span className="text-muted-foreground">({c.before.n}/{c.after.n})</span></td>
                  <td className="text-center tabular-nums">{c.before.durationSec ?? "-"}→{c.after.durationSec ?? "-"}s</td>
                  <td className="text-center tabular-nums">{c.before.clicks ?? "-"}→{c.after.clicks ?? "-"}</td>
                  <td className="text-center tabular-nums">{c.before.screens ?? "-"}→{c.after.screens ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button type="button" className="text-muted-foreground underline" onClick={turnOff}>측정 모드 끄기</button>
      </div>
    </div>
  );
}
