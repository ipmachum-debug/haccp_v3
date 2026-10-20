/**
 * 생산 — 하루 생산을 한 화면에서 (2026-10-20)
 *
 * 대표 기준 (2026-10-20): 새 기능보다 정상 생산에서 사용자가 해야 하는 일을 먼저 없앤다.
 *   1. 계획은 제품·kg(또는 배치 수)만. 설비·운전 방식·시각은 저장된 공장 설정 — 예외일 때만 '예외' 를 연다 (TodayProductionWorkbench).
 *   2. 계획한 생산량을 완료 때 다시 묻지 않는다 — 실제 생산량은 계획값이 기본, 다를 때만 고친다.
 *   3. 현장(작업자)은 지금 할 작업과 [확인]·[고치기]만. 관리용 상태·설정·마감은 작업자 화면에 없다.
 *   4. 마감은 한 자리 — 기록지 제출 · 생산 완료 · 결재(작성자 제출 → 승인)를 같은 표에서. 서버 검증·권한은 그대로
 *      (ccpForm.submit · batch.complete(관리자) · approval.submitByWriter(작성자·관리자) · approval.approve(승인 권한)).
 *   5. 실패는 그 자리에서 이어서 — 막힌 이유를 그 줄에 두고, 같은 값을 다시 넣지 않고 [다시]·[고치기] 로 잇는다.
 * 쓰기는 모두 기존 서버 경로 — 새 쓰기 없음. '생산 시작' 버튼 없음 (첫 현장 확인에서 시작·원료 출고).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { todayLocal } from "@/lib/dateUtils";
import FieldRowsPanel, { FieldWriteProvider, useFieldWriteState } from "@/components/production/FieldRowsPanel";
import LineIssueExceptions from "@/components/production/LineIssueExceptions";
import TodayProductionWorkbench from "./TodayProductionWorkbench";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";

type Board = {
  id: number; batchCode: string; productName: string | null; status: string; mode: string | null;
  plannedKg: number | null; actualKg: number | null; approvalStatus: string | null; planOnly: boolean;
  ccpForms: { total: number; unconfirmed: number; approved: number };
  voidedSupersededBy: number | null;
  check: { setupPending: boolean; rows: { total: number; confirmed: number }; issueLines: number; shortLines: number; shortMaterials: string[] };
  next: { label: string; tone: "todo" | "wait" | "done" | "stop" };
};

const TONE: Record<Board["next"]["tone"], string> = {
  todo: "bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30",
  wait: "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30",
  done: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30",
  stop: "bg-red-50 text-red-800 border-red-200 dark:bg-red-500/10 dark:text-red-300 dark:border-red-500/30",
};

const addDays = (d: string, n: number) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const DONE = ["completed", "shipped", "archived"];
/** 관리 보기(계획·목록·마감)를 열 수 있는 역할 — 검사원 등은 현장만 */
const MANAGER = ["admin", "super_admin", "monitor", "worker"];
/** 계획·기록지 제출 (서버 workerProcedure 와 같음) */
const PLANNER = ["admin", "super_admin", "worker"];
/** 결재 승인 (서버 monitorProcedure 와 같음) */
const APPROVER = ["admin", "super_admin", "monitor"];

type Filter = "all" | "plan" | "work" | "rows" | "stop" | "done";
const filterOf = (b: Board): Exclude<Filter, "all">[] => {
  const out: Exclude<Filter, "all">[] = [];
  if (b.voidedSupersededBy != null || b.status === "cancelled") return out;
  if (b.next.tone === "stop" || b.check.shortLines > 0) out.push("stop");
  if (DONE.includes(b.status)) out.push("done");
  else if (b.planOnly || b.status === "planned") out.push("plan");
  else out.push("work");
  if (b.check.rows.total - b.check.rows.confirmed > 0 && !DONE.includes(b.status)) out.push("rows");
  return out;
};

export default function TodayProduction() {
  const { user } = useAuth();
  const role = String((user as any)?.role ?? "");
  const isAdmin = ["admin", "super_admin"].includes(role);
  const isManager = MANAGER.includes(role);
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [date, setDate] = useState(params.get("date") || todayLocal());
  // 보기 — 관리(계획·목록·마감) / 현장(내 설비의 지금 할 일). 작업자는 현장만 (관리용 상태를 판단시키지 않음)
  const [chosen, setView] = useState<"all" | "mine" | null>(() => {
    const p = params.get("view");
    if (p === "mine" || p === "all") return p;
    if (params.get("add") === "1") return "all";
    try { const v = localStorage.getItem("production-view"); return v === "all" || v === "mine" ? v : null; } catch { return null; }
  });
  // 고른 적이 없으면 작업자 = 현장, 관리자 = 관리 (로그인 정보가 늦게 와도 역할로 정한다). 기기마다 마지막 보기를 기억
  const viewPref: "all" | "mine" = chosen ?? (role === "worker" ? "mine" : "all");
  const view: "all" | "mine" = isManager ? viewPref : "mine";
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<number, boolean>>(() => { const b = Number(params.get("batch")); return b > 0 ? { [b]: true } : {}; });
  const [adding, setAdding] = useState(params.get("add") === "1");

  useEffect(() => {
    try { if (chosen) localStorage.setItem("production-view", chosen); } catch { /* 저장 못 해도 화면은 그대로 */ }
    const q = new URLSearchParams(window.location.search);
    q.set("date", date); q.set("view", view); q.delete("add");
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [date, view, chosen]);

  const utils = trpc.useUtils();
  const board = trpc.batch.todayBoard.useQuery({ workDate: date }, { refetchInterval: 60_000, enabled: view === "all" });
  const work = trpc.field.work.useQuery({ workDate: date, scope: view === "all" ? "all" : "mine" }, { refetchInterval: 60_000 });
  const refresh = () => { utils.batch.todayBoard.invalidate(); utils.field.work.invalidate(); utils.batch.lineIssueExceptions.invalidate(); utils.batch.dayApprovals.invalidate(); };

  const rows = (board.data ?? []) as Board[];
  const live = rows.filter((b) => b.voidedSupersededBy == null && b.status !== "cancelled");
  const voided = rows.filter((b) => !live.includes(b));
  const counts = useMemo(() => {
    const c: Record<Exclude<Filter, "all">, number> = { plan: 0, work: 0, rows: 0, stop: 0, done: 0 };
    for (const b of live) for (const k of filterOf(b)) c[k]++;
    return c;
  }, [live]);
  const shown = filter === "all" ? live : live.filter((b) => filterOf(b).includes(filter));
  const heat = ((work.data as any)?.heat ?? []) as any[];
  const metal = (work.data as any)?.metal ?? null;
  const sheets = ((work.data as any)?.sheets ?? []) as any[];
  const showAdd = PLANNER.includes(role) && (adding || (!board.isLoading && live.length === 0));
  const listRef = useRef<HTMLDivElement>(null);
  const openLine = (id: number) => { setFilter("all"); setOpen((o) => ({ ...o, [id]: true })); setTimeout(() => document.getElementById(`line-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); };

  const FILTERS: Array<{ k: Filter; label: string; n: number; cls?: string }> = [
    { k: "all", label: "전체", n: live.length },
    { k: "plan", label: "예정", n: counts.plan },
    { k: "work", label: "작업 중", n: counts.work },
    { k: "rows", label: "확인 남음", n: counts.rows },
    { k: "stop", label: "막힘", n: counts.stop, cls: counts.stop ? "text-red-700 dark:text-red-300" : "" },
    { k: "done", label: "완료", n: counts.done },
  ];

  const content = (
    <div className="space-y-4 max-w-6xl" data-testid="production-work">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold mr-2">{view === "mine" ? "현장" : "생산"}</h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-10 w-10" aria-label="전날" onClick={() => setDate((d) => addDays(d, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" className="h-10 w-40" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} data-testid="work-date" />
          <Button variant="outline" size="icon" className="h-10 w-10" aria-label="다음날" onClick={() => setDate((d) => addDays(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
          {date !== todayLocal() && <Button variant="ghost" className="h-10" onClick={() => setDate(todayLocal())}>오늘</Button>}
        </div>
        {isManager && (
          <div className="flex rounded-md border overflow-hidden" role="tablist">
            {(["all", "mine"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} data-testid={`view-${v}`}
                className={cn("h-10 px-3 text-sm", view === v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>
                {v === "all" ? "관리" : "현장"}
              </button>
            ))}
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-10 w-10 ml-auto" aria-label="새로고침" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {view === "mine" ? (
        <FieldTodo heat={heat} metal={metal} error={work.isError} past={date < todayLocal()} onChanged={() => utils.batch.todayBoard.invalidate()} />
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" data-testid="day-status">
            {FILTERS.map((f) => (
              <button key={f.k} type="button" onClick={() => setFilter(f.k)} data-testid={`filter-${f.k}`}
                className={cn("h-9 px-3 rounded-full border text-sm", filter === f.k ? "bg-foreground text-background" : "bg-background hover:bg-accent", filter !== f.k && f.cls)}>
                {f.label} <b>{f.n}</b>
              </button>
            ))}
          </div>

          {PLANNER.includes(role) && (
            <div className="rounded-lg border" data-testid="add-production">
              <button type="button" className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium" onClick={() => setAdding((v) => !v)}>
                <Plus className="h-4 w-4" />생산 계획 <span className="text-muted-foreground font-normal">— 제품과 수량만</span>
                {showAdd ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
              </button>
              {showAdd && (
                <div className="border-t p-3">
                  <TodayProductionWorkbench embedded workDate={date} hideBoard onCreated={() => { refresh(); }} />
                </div>
              )}
            </div>
          )}

          {board.isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
          <div className="space-y-2" data-testid="work-list" ref={listRef}>
            {shown.map((b) => (
              <BatchLine key={b.id} b={b} open={!!open[b.id]} onToggle={() => setOpen((o) => ({ ...o, [b.id]: !o[b.id] }))} isAdmin={isAdmin} past={date < todayLocal()}
                heat={heat.filter((r) => r.batchId === b.id)} onChanged={refresh} />
            ))}
          </div>

          {live.length > 0 && (
            <DayClose date={date} live={live} sheets={sheets} isAdmin={isAdmin} canSubmit={PLANNER.includes(role)} canApprove={APPROVER.includes(role)} userRole={role} onChanged={refresh} onFix={openLine} />
          )}

          {voided.length > 0 && (
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer select-none">무효·취소 {voided.length}건 (원본 보존)</summary>
              <div className="mt-1 space-y-1">{voided.map((b) => <p key={b.id}>{b.productName} · {b.batchCode} — {b.next.label}</p>)}</div>
            </details>
          )}
        </>
      )}
    </div>
  );
  // 행 쓰기 상태(저장 안 됨·확인 거부·고치던 값)는 화면 전체에서 하나 — 줄을 접거나 보기를 바꿔도 남는다
  return <DashboardLayout><FieldWriteProvider>{content}</FieldWriteProvider></DashboardLayout>;
}

/**
 * 현장 — 내 설비의 지금 할 일만 (2026-10-20 대표 기준 3).
 *   확인 전 행(과 저장 안 됨·확인 거부로 다시 해야 할 행)만 크게, 끝난 행은 접어서 개수만. 마감·제출·상태는 여기 없다.
 *   설비 고르기는 처음 한 번 — 고른 뒤에는 접힌 한 줄.
 */
function FieldTodo({ heat, metal, error, past, onChanged }: { heat: any[]; metal: any; error: boolean; past: boolean; onChanged: () => void }) {
  const utils = trpc.useUtils();
  const eq = trpc.field.equipments.useQuery();
  const setMine = trpc.field.setMyEquipments.useMutation({
    onSuccess: () => { utils.field.equipments.invalidate(); utils.field.work.invalidate(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const ws = useFieldWriteState();
  const [pick, setPick] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const all: any[] = (eq.data as any)?.all ?? [];
  const mine: number[] = (eq.data as any)?.mine ?? [];
  const keep = (r: any) => !r.confirmed || !!ws?.pending[r.rowId] || !!ws?.editing[r.rowId];
  const todoHeat = heat.filter(keep);
  const todoMetal = metal ? { ...metal, rows: (metal.rows ?? []).filter(keep) } : null;
  const doneHeat = heat.filter((r) => !keep(r));
  const doneMetal = metal ? { ...metal, rows: (metal.rows ?? []).filter((r: any) => !keep(r)) } : null;
  const doneCount = doneHeat.length + (doneMetal?.rows.length ?? 0);
  const todoCount = todoHeat.length + (todoMetal?.rows.length ?? 0);
  return (
    <div className="space-y-3" data-testid="field-todo">
      <div className="text-sm flex flex-wrap items-center gap-2" data-testid="my-equipments">
        <span className="text-muted-foreground">내 설비:</span>
        <span>{mine.length ? all.filter((e) => mine.includes(e.id)).map((e) => e.name).join(" · ") : "전부"}</span>
        <Button variant="ghost" size="sm" className="h-9" onClick={() => setPick((v) => !v)}>{pick ? "닫기" : "바꾸기"}</Button>
      </div>
      {pick && (
        <div className="flex flex-wrap gap-2">
          {all.map((e: any) => (
            <button key={e.id} type="button" data-testid="my-equipment"
              onClick={() => setMine.mutate({ equipmentIds: mine.includes(e.id) ? mine.filter((x) => x !== e.id) : [...mine, e.id] })}
              className={cn("min-h-11 px-3 rounded-md border text-sm", mine.includes(e.id) ? "bg-blue-600 text-white border-blue-600" : "bg-background")}>
              {e.name}{e.metal ? " (금속검출)" : ""}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-700">불러오지 못했습니다 — 새로고침을 누르세요.</p>}
      {todoCount === 0 && !error && <p className="text-base py-6 text-center text-emerald-700 flex items-center justify-center gap-2" data-testid="field-all-done"><CheckCircle2 className="h-5 w-5" />지금 할 확인이 없습니다</p>}
      {todoCount > 0 && <FieldRowsPanel pastDate={past} heat={todoHeat} metal={todoMetal && todoMetal.rows.length ? todoMetal : null} onChanged={onChanged} />}
      {doneCount > 0 && (
        <div>
          <button type="button" className="text-sm text-muted-foreground" onClick={() => setShowDone((v) => !v)} data-testid="field-done-toggle">
            확인 끝난 {doneCount}건 {showDone ? "접기" : "보기"}
          </button>
          {showDone && <div className="mt-2"><FieldRowsPanel pastDate={past} heat={doneHeat} metal={doneMetal && doneMetal.rows.length ? doneMetal : null} onChanged={onChanged} /></div>}
        </div>
      )}
    </div>
  );
}

function BatchLine({ b, open, onToggle, isAdmin, past, heat, onChanged }: {
  b: Board; open: boolean; onToggle: () => void; isAdmin: boolean; past: boolean; heat: any[]; onChanged: () => void;
}) {
  const ws = useFieldWriteState();
  const unsaved = heat.filter((r) => ["failed", "rejected"].includes(ws?.pending[r.rowId]?.state ?? "")).length;
  const rowsLeft = b.check.rows.total - b.check.rows.confirmed;
  return (
    <div id={`line-${b.id}`} className={cn("rounded-lg border bg-card", b.next.tone === "stop" && "border-red-300 dark:border-red-500/40")} data-testid="batch-line">
      <button type="button" onClick={onToggle} className="w-full text-left px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{b.productName ?? "-"}</span>
          <span className="text-sm">{b.plannedKg ?? "-"} kg{b.actualKg != null ? ` → ${b.actualKg} kg` : ""}</span>
          {b.check.rows.total > 0 && !DONE.includes(b.status) && <span className="text-xs text-muted-foreground">확인 {b.check.rows.confirmed}/{b.check.rows.total}</span>}
          {b.check.shortLines > 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300 flex items-center gap-1" data-testid="short">
              <AlertTriangle className="h-3 w-3" />원료 부족 {b.check.shortMaterials.slice(0, 2).join(", ")}{b.check.shortMaterials.length > 2 ? ` 외 ${b.check.shortMaterials.length - 2}` : ""}
            </span>
          )}
          {unsaved > 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 flex items-center gap-1" data-testid="unsaved">
              <AlertTriangle className="h-3 w-3" />저장 안 됨 {unsaved}
            </span>
          )}
          <span className={cn("ml-auto text-xs border rounded px-2 py-1", TONE[b.next.tone])} data-testid="next">{b.next.label}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {open && (
        <div className="border-t px-3 py-3 space-y-3" data-testid="batch-open">
          {b.check.setupPending && (
            <p className="text-sm text-red-700 dark:text-red-300">준비가 끝나지 않은 생산 건입니다 — 수량·날짜를 같은 값으로 다시 저장하면 남은 준비를 이어서 합니다.</p>
          )}
          {b.check.issueLines > 0 && <LineIssueExceptions batchId={b.id} canResolve={isAdmin} />}
          {b.check.shortLines > 0 && (
            <p className="text-sm text-amber-800 dark:text-amber-300">그날 필요한 양이 남은 LOT 보다 많습니다: {b.check.shortMaterials.join(", ")} — 입고하면 사라집니다 (회사 음수 정책대로 진행).</p>
          )}
          {heat.length > 0
            ? <FieldRowsPanel pastDate={past} heat={heat} bare onChanged={onChanged} />
            : <p className="text-sm text-muted-foreground">{b.planOnly ? "예정 — 그날 현장 확인을 하면 시작합니다." : rowsLeft > 0 ? "현장 확인할 행이 있습니다." : "현장 확인할 가열 기록이 없습니다."}</p>}
          <Link href={`/dashboard/batch/${b.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ExternalLink className="h-3 w-3" />전체 상세 (수정·삭제·인쇄 · {b.batchCode})
          </Link>
        </div>
      )}
    </div>
  );
}

type CloseResult = { state: "ok" | "warn" | "error"; message: string };

/**
 * 마감 — 한 자리 (2026-10-20 대표 기준 2·4·5).
 *   생산 건마다: 기록지 제출(막힘이 없는 것) → 생산 완료(실제 생산량 = 계획값 기본, 다를 때만 고침, 관리자).
 *   [마감] 은 생산 건 하나, [준비된 것 모두 마감] 은 위에서 아래로 차례대로. 막히면 그 줄에 이유 + [고치기](그 생산 건 줄을 펼침).
 *   생산 완료는 같은 처리 키로만 다시 보낸다 (두 번 완료되지 않음). 결재는 아래에서 단계별(작성자 제출 → 승인) — 권한은 서버가 정한다.
 */
function DayClose({ date, live, sheets, isAdmin, canSubmit, canApprove, userRole, onChanged, onFix }: {
  date: string; live: Board[]; sheets: any[]; isAdmin: boolean; canSubmit: boolean; canApprove: boolean; userRole: string; onChanged: () => void; onFix: (batchId: number) => void;
}) {
  const utils = trpc.useUtils();
  const submit = trpc.ccpForm.submit.useMutation();
  const complete = trpc.batch.complete.useMutation();
  const approvals = trpc.batch.dayApprovals.useQuery({ workDate: date }, { refetchInterval: 60_000 });
  const writerSubmit = trpc.approval.submitByWriter.useMutation();
  const approve = trpc.approval.approve.useMutation();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [result, setResult] = useState<Record<string, CloseResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const keys = useRef<Record<number, string>>({}); // 생산 완료 처리 키 — 성공할 때까지 같은 키 (다시 눌러도 한 번만)

  const metalSheet = sheets.find((s) => s.ccpType === "CCP-4P") ?? null;
  const items = live.map((b) => {
    const ss = sheets.filter((s) => s.batchId === b.id && s.ccpType !== "CCP-4P");
    const rowsLeft = b.check.rows.total - b.check.rows.confirmed;
    const open = ss.filter((s) => !s.submittedConfirmed);
    const blocked = open.filter((s) => s.problems.length > 0);
    const ready = canSubmit ? open.filter((s) => s.problems.length === 0) : [];
    const finished = DONE.includes(b.status);
    const canComplete = isAdmin && !finished && !b.planOnly && ["in_progress", "paused"].includes(b.status) && b.check.rows.total > 0 && rowsLeft === 0 && blocked.length === 0;
    // 현장 확인 행이 없는데 기록지가 있는 생산 건 = 예전 방식 기록지 (예: 10/15 생산) — 이 표에서 '제출됨' 으로 보이지 않게
    const legacy = !finished && !b.planOnly && b.check.rows.total === 0 && b.ccpForms.total > 0;
    return { b, ss, rowsLeft, open, blocked, ready, finished, canComplete, legacy };
  });
  const runnable = items.filter((i) => !i.finished && (i.ready.length > 0 || i.canComplete));

  const set = (k: string, r: CloseResult) => setResult((x) => ({ ...x, [k]: r }));
  const closeOne = async (it: (typeof items)[number]) => {
    const k = `b${it.b.id}`;
    try {
      for (const s of it.ready) {
        await submit.mutateAsync({ formRecordId: s.formRecordId, batchNumber: String(s.batchId ?? it.b.batchCode), ccpType: s.ccpType });
      }
      if (it.canComplete) {
        // 완료 전 점검 — 완료 창과 같은 서버 판정 (원료 투입 계획·CCP 기록지 확인)
        const ready: any = await utils.client.batch.checkCompletionReadiness.query({ batchId: it.b.id });
        if (!ready?.canComplete) { set(k, { state: "error", message: `완료 전 점검: ${(ready?.warnings ?? []).join(" ") || "준비되지 않았습니다"}` }); return; }
        keys.current[it.b.id] ??= `close-${it.b.id}-${Date.now()}`;
        const actual = qty[it.b.id] !== undefined && qty[it.b.id] !== "" ? Number(qty[it.b.id]) : Number(it.b.plannedKg ?? 0);
        const r: any = await complete.mutateAsync({ batchId: it.b.id, actualQuantity: actual, idempotencyKey: keys.current[it.b.id] });
        delete keys.current[it.b.id];
        // 원료가 다 출고되지 않았으면 생산완료만 기록 — 재고·원가는 보류 (성공처럼 보이지 않게)
        if (r?.materialsSettled === false) set(k, { state: "warn", message: `${r.message}${(r.issueErrors ?? []).length ? ` — ${(r.issueErrors as string[]).slice(0, 2).join(" / ")}` : ""}` });
        else set(k, { state: "ok", message: `완료 ${actual}kg${it.ready.length ? ` · 기록지 ${it.ready.length}건 제출` : ""}` });
      } else {
        set(k, { state: "ok", message: `기록지 ${it.ready.length}건 제출` });
      }
    } catch (e: any) {
      set(k, { state: "error", message: e?.message ?? "처리하지 못했습니다" });
    }
  };
  const runAll = async () => {
    setBusy("all");
    for (const it of runnable) await closeOne(it);
    if (canSubmit && metalSheet && !metalSheet.submittedConfirmed && metalSheet.problems.length === 0) await submitMetal();
    setBusy(null);
    onChanged();
  };
  const submitMetal = async () => {
    try {
      await submit.mutateAsync({ formRecordId: metalSheet.formRecordId, batchNumber: "금속검출", ccpType: "CCP-4P" });
      set("metal", { state: "ok", message: "제출했습니다" });
    } catch (e: any) { set("metal", { state: "error", message: e?.message ?? "제출하지 못했습니다" }); }
  };

  const ap = (approvals.data ?? []) as Array<{ id: number; title: string; step: "writer" | "approve"; mine: boolean; batchId: number | null; ccpType: string | null }>;
  const canAct = (a: (typeof ap)[number]) => (a.step === "writer" ? a.mine || ["admin", "super_admin"].includes(userRole) : canApprove);
  const act = async (a: (typeof ap)[number]) => {
    try {
      if (a.step === "writer") await writerSubmit.mutateAsync({ approvalRequestId: a.id });
      else await approve.mutateAsync({ requestId: a.id });
      set(`a${a.id}`, { state: "ok", message: a.step === "writer" ? "제출했습니다 — 승인 단계로" : "승인했습니다" });
    } catch (e: any) { set(`a${a.id}`, { state: "error", message: e?.message ?? "처리하지 못했습니다" }); }
  };
  const actAll = async () => {
    setBusy("approve");
    for (const a of ap.filter((x) => x.step === "approve" && canAct(x))) await act(a);
    setBusy(null);
    utils.batch.dayApprovals.invalidate();
    onChanged();
  };

  const Msg = ({ k }: { k: string }) => {
    const r = result[k];
    if (!r) return null;
    return <span className={cn("text-xs", r.state === "ok" ? "text-emerald-700" : r.state === "warn" ? "text-amber-700" : "text-red-700")} data-testid="close-result">{r.message}</span>;
  };

  return (
    <div className="rounded-lg border" data-testid="day-close">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b">
        <span className="font-medium">마감</span>
        <span className="text-xs text-muted-foreground">기록지 제출 · 생산 완료(실제 생산량 = 계획값, 다를 때만 고침) · 결재 — 여기서 한 번에</span>
        <Button className="h-10 ml-auto" disabled={!runnable.length || busy !== null} onClick={runAll} data-testid="close-all">
          {busy === "all" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}준비된 것 모두 마감{runnable.length ? ` (${runnable.length})` : ""}
        </Button>
      </div>
      <div className="divide-y">
        {items.map((it) => (
          <div key={it.b.id} className="px-3 py-2 flex flex-wrap items-center gap-2 text-sm" data-testid="close-row">
            <span className="font-medium min-w-[8rem]">{it.b.productName}</span>
            {it.finished
              ? <span className="text-emerald-700 text-xs">완료 {it.b.actualKg ?? it.b.plannedKg}kg</span>
              : it.b.planOnly ? <span className="text-xs text-muted-foreground">예정</span>
              // 예전 방식 기록지(현장 확인 이전에 만든 생산 건) — 여기서 제출하지 않는다. 미리 채운 예정 시각·평상값을 실제 값으로 고친 뒤 기록지 화면에서 제출
              : it.legacy ? <span className="text-xs text-amber-700" data-testid="close-legacy">예전 방식 기록지 — 실제 값·시각으로 고친 뒤 <Link href={`/dashboard/batch/${it.b.id}`} className="underline">기록지 화면</Link>에서 제출</span>
              : it.rowsLeft > 0 ? <span className="text-xs text-amber-700">현장 확인 {it.rowsLeft}건 남음</span>
              : it.blocked.length > 0 ? <span className="text-xs text-red-700">기록지 막힘: {it.blocked[0].problems[0]}{it.blocked[0].problems.length > 1 ? ` 외 ${it.blocked[0].problems.length - 1}` : ""}</span>
              : <span className="text-xs text-muted-foreground">{it.ready.length ? `기록지 ${it.ready.length}건 제출 대기` : "기록지 제출됨"}</span>}
            {it.canComplete && (
              <label className="flex items-center gap-1 text-xs">실제
                <Input type="number" inputMode="decimal" className="h-9 w-24" value={qty[it.b.id] ?? String(it.b.plannedKg ?? "")}
                  onChange={(e) => setQty((q) => ({ ...q, [it.b.id]: e.target.value }))} data-testid="actual-qty" />kg
              </label>
            )}
            {!(it.finished && result[`b${it.b.id}`]?.state === "ok") && <Msg k={`b${it.b.id}`} />}
            <span className="ml-auto flex gap-1">
              {(it.rowsLeft > 0 || it.blocked.length > 0) && !it.finished && !it.b.planOnly && (
                <Button size="sm" variant="outline" className="h-9" onClick={() => onFix(it.b.id)}>고치기</Button>
              )}
              {!it.finished && (it.ready.length > 0 || it.canComplete) && (
                <Button size="sm" className="h-9" disabled={busy !== null} onClick={async () => { setBusy(`b${it.b.id}`); await closeOne(it); setBusy(null); onChanged(); }}>
                  {busy === `b${it.b.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : it.canComplete ? "마감" : "기록지 제출"}
                </Button>
              )}
            </span>
          </div>
        ))}
        {metalSheet && (
          <div className="px-3 py-2 flex flex-wrap items-center gap-2 text-sm" data-testid="close-metal">
            <span className="font-medium min-w-[8rem]">금속검출 (하루)</span>
            {metalSheet.submittedConfirmed ? <span className="text-xs text-emerald-700">제출됨</span>
              : metalSheet.problems.length ? <span className="text-xs text-red-700">막힘: {metalSheet.problems[0]}</span>
              : <span className="text-xs text-muted-foreground">제출 대기</span>}
            <Msg k="metal" />
            {canSubmit && !metalSheet.submittedConfirmed && metalSheet.problems.length === 0 && (
              <Button size="sm" className="h-9 ml-auto" disabled={busy !== null} onClick={async () => { setBusy("metal"); await submitMetal(); setBusy(null); onChanged(); }}>기록지 제출</Button>
            )}
          </div>
        )}
      </div>
      {ap.length > 0 && (
        <div className="border-t" data-testid="day-approvals">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="text-sm font-medium">결재</span>
            <span className="text-xs text-muted-foreground">작성자 제출 → 승인 (권한대로)</span>
            {canApprove && ap.some((x) => x.step === "approve") && (
              <Button size="sm" className="h-9 ml-auto" disabled={busy !== null} onClick={actAll} data-testid="approve-all">
                {busy === "approve" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}승인 단계 모두 승인
              </Button>
            )}
          </div>
          <div className="divide-y">
            {ap.map((a) => (
              <div key={a.id} className="px-3 py-1.5 flex flex-wrap items-center gap-2 text-sm">
                <span className="truncate max-w-[60%]">{a.title}</span>
                <span className="text-xs text-muted-foreground">{a.step === "writer" ? "작성자 제출 대기" : "승인 대기"}</span>
                <Msg k={`a${a.id}`} />
                {canAct(a) && (
                  <Button size="sm" variant="outline" className="h-9 ml-auto" disabled={busy !== null}
                    onClick={async () => { setBusy(`a${a.id}`); await act(a); setBusy(null); utils.batch.dayApprovals.invalidate(); onChanged(); }}>
                    {a.step === "writer" ? "제출" : "승인"}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
