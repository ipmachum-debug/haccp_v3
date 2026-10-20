/**
 * 생산 — 하루 생산을 한 화면에서 (2026-10-20, CEO: "오늘의 생산·생산 파이프라인·제품 생산관리는 하나의 생산 작업 화면")
 *
 * 합격 기준은 새 화면이 아니라 입력·클릭·이동·판단이 줄었는가:
 *   - 계획을 넣은 자리(위 '생산 추가')에 생산 목록이 이어진다. 입력하면 미리보기가 자동 — [생성] 한 번.
 *   - 파이프라인은 따로 가는 화면이 아니라 맨 위 하루 현황(눌러서 거르기)과 줄마다 진행 표시.
 *   - BOM·재고 확인은 매번 거치는 단계가 아니라 자동 검사 결과(준비 미완·원료 출고 확인·원료 부족·확인 남음)로 줄에 붙는다.
 *   - 줄을 누르면 그 자리에서 펼쳐 현장 확인·원료 출고 결정·기록지 제출·생산 완료를 한다 (상세 화면으로 이동하지 않음).
 *   - '생산 시작' 버튼은 없다 — 확정한 현장 확인 흐름 그대로 첫 확인에서 시작·원료 출고 (서버가 정함).
 *   - 태블릿은 같은 자료를 '내 설비' 보기로 (예전 현장 확인 화면).
 * 쓰기는 모두 기존 서버 경로(field.write · ccpForm.submit · batch.resolveLineIssue/issueLine · batch.complete · bulkCreateForDay) — 새 쓰기 없음.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { todayLocal } from "@/lib/dateUtils";
import FieldRowsPanel, { FieldWriteProvider, useFieldWriteState } from "@/components/production/FieldRowsPanel";
import LineIssueExceptions from "@/components/production/LineIssueExceptions";
import { BatchCompletionDialog } from "@/components/batch/BatchCompletionDialog";
import TodayProductionWorkbench from "./TodayProductionWorkbench";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Plus, RefreshCw } from "lucide-react";

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

/** 진행 표시 — 계획 · 현장 확인 · 기록지 · 완료 · 승인 (파이프라인 대신 줄마다) */
export function progressOf(b: Pick<Board, "status" | "planOnly" | "approvalStatus" | "ccpForms" | "check">): Array<{ label: string; state: "done" | "now" | "todo" }> {
  const started = !b.planOnly && b.status !== "planned";
  const rowsDone = b.check.rows.total > 0 && b.check.rows.confirmed >= b.check.rows.total;
  const formsDone = b.ccpForms.total > 0 ? b.ccpForms.unconfirmed === 0 : rowsDone;
  const finished = DONE.includes(b.status);
  const approved = b.approvalStatus === "approved" || b.status === "approved";
  const steps = [
    { label: "계획", done: true },
    { label: b.check.rows.total ? `현장 확인 ${b.check.rows.confirmed}/${b.check.rows.total}` : "현장 확인", done: started && (rowsDone || finished) },
    { label: "기록지 제출", done: formsDone && (rowsDone || finished) },
    { label: "완료", done: finished },
    { label: "승인", done: approved },
  ];
  const firstOpen = steps.findIndex((s) => !s.done);
  return steps.map((s, i) => ({ label: s.label, state: s.done ? "done" : i === firstOpen ? "now" : "todo" }));
}

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
  const isAdmin = ["admin", "super_admin"].includes(String((user as any)?.role ?? ""));
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const [date, setDate] = useState(params.get("date") || todayLocal());
  // 보기 — 전체(사무실) / 내 설비(태블릿, 예전 현장 확인 화면). 기기마다 기억
  const [view, setView] = useState<"all" | "mine">(() => {
    const p = params.get("view");
    if (p === "mine" || p === "all") return p;
    if (params.get("add") === "1") return "all"; // 생산 추가로 들어오면 전체 보기 (추가 입력은 전체 보기에만)
    try { return (localStorage.getItem("production-view") as "all" | "mine") || "all"; } catch { return "all"; }
  });
  const [filter, setFilter] = useState<Filter>("all");
  // ?batch=ID — 다른 화면에서 이 생산 건을 가리키고 왔으면 그 줄을 펼친 채로 (날짜·선택 생산 건 맥락 유지)
  const [open, setOpen] = useState<Record<number, boolean>>(() => { const b = Number(params.get("batch")); return b > 0 ? { [b]: true } : {}; });
  const [adding, setAdding] = useState(params.get("add") === "1");

  useEffect(() => {
    try { localStorage.setItem("production-view", view); } catch { /* 저장 못 해도 화면은 그대로 */ }
    const q = new URLSearchParams(window.location.search);
    q.set("date", date); q.set("view", view); q.delete("add");
    window.history.replaceState(null, "", `${window.location.pathname}?${q.toString()}`);
  }, [date, view]);

  const utils = trpc.useUtils();
  const board = trpc.batch.todayBoard.useQuery({ workDate: date }, { refetchInterval: 60_000 });
  const work = trpc.field.work.useQuery({ workDate: date, scope: view === "all" ? "all" : "mine" }, { refetchInterval: 60_000 });
  const eq = trpc.field.equipments.useQuery(undefined, { enabled: view === "mine" });
  const setMine = trpc.field.setMyEquipments.useMutation({
    onSuccess: () => { utils.field.equipments.invalidate(); utils.field.work.invalidate(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const refresh = () => { utils.batch.todayBoard.invalidate(); utils.field.work.invalidate(); utils.batch.lineIssueExceptions.invalidate(); };

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
  const mine: number[] = (eq.data as any)?.mine ?? [];
  const showAdd = adding || (view === "all" && !board.isLoading && live.length === 0);

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
      {/* 날짜 · 보기 · 하루 현황 — 한 줄 */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold mr-2">생산</h1>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-10 w-10" aria-label="전날" onClick={() => setDate((d) => addDays(d, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" className="h-10 w-40" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} data-testid="work-date" />
          <Button variant="outline" size="icon" className="h-10 w-10" aria-label="다음날" onClick={() => setDate((d) => addDays(d, 1))}><ChevronRight className="h-4 w-4" /></Button>
          {date !== todayLocal() && <Button variant="ghost" className="h-10" onClick={() => setDate(todayLocal())}>오늘</Button>}
        </div>
        <div className="flex rounded-md border overflow-hidden" role="tablist">
          {(["all", "mine"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} data-testid={`view-${v}`}
              className={cn("h-10 px-3 text-sm", view === v ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}>
              {v === "all" ? "전체" : "내 설비"}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="h-10 w-10 ml-auto" aria-label="새로고침" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {view === "mine" ? (
        <>
          <div className="flex flex-wrap gap-2" data-testid="my-equipments">
            <span className="text-xs text-muted-foreground self-center">내 설비 (이 계정에 기억, 안 고르면 전부):</span>
            {((eq.data as any)?.all ?? []).map((e: any) => (
              <button key={e.id} type="button" data-testid="my-equipment"
                onClick={() => setMine.mutate({ equipmentIds: mine.includes(e.id) ? mine.filter((x) => x !== e.id) : [...mine, e.id] })}
                className={cn("min-h-11 px-3 rounded-md border text-sm", mine.includes(e.id) ? "bg-blue-600 text-white border-blue-600" : "bg-background")}>
                {e.name}{e.metal ? " (금속검출)" : ""}
              </button>
            ))}
          </div>
          {work.isError && <p className="text-sm text-red-700">불러오지 못했습니다 — 새로고침을 누르세요.</p>}
          {!heat.length && !metal && <p className="text-sm text-muted-foreground">이 날 내 설비의 일이 없습니다.</p>}
          <FieldRowsPanel heat={heat} metal={metal} sheets={sheets} onChanged={() => utils.batch.todayBoard.invalidate()} />
        </>
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

          {/* 생산 추가 — 같은 날짜, 같은 화면 */}
          <div className="rounded-lg border" data-testid="add-production">
            <button type="button" className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium" onClick={() => setAdding((v) => !v)}>
              <Plus className="h-4 w-4" />생산 추가 <span className="text-muted-foreground font-normal">— 제품과 하루 총생산량만 넣으면 회차·설비·시각 자동</span>
              {showAdd ? <ChevronUp className="h-4 w-4 ml-auto" /> : <ChevronDown className="h-4 w-4 ml-auto" />}
            </button>
            {showAdd && (
              <div className="border-t p-3">
                <TodayProductionWorkbench embedded workDate={date} hideBoard onCreated={() => { refresh(); }} />
              </div>
            )}
          </div>

          {/* 금속검출 — 하루 공용 기록 */}
          {metal && (metal.rows ?? []).length > 0 && (
            <details className="rounded-lg border" data-testid="day-metal">
              <summary className="px-3 py-2.5 text-sm font-medium cursor-pointer select-none">
                금속검출 (하루) — {(metal.rows as any[]).filter((r) => r.confirmed).length}/{metal.rows.length} 확인
              </summary>
              <div className="border-t p-3">
                <FieldRowsPanel heat={[]} metal={metal} sheets={sheets.filter((s) => s.ccpType === "CCP-4P")} onChanged={() => utils.batch.todayBoard.invalidate()} />
              </div>
            </details>
          )}

          {board.isLoading && <p className="text-sm text-muted-foreground">불러오는 중…</p>}
          {!board.isLoading && !live.length && <p className="text-sm text-muted-foreground">이 날 생산이 없습니다 — 위 '생산 추가' 에 입력하세요.</p>}
          <div className="space-y-2" data-testid="work-list">
            {shown.map((b) => (
              <BatchLine key={b.id} b={b} open={!!open[b.id]} onToggle={() => setOpen((o) => ({ ...o, [b.id]: !o[b.id] }))} isAdmin={isAdmin}
                heat={heat.filter((r) => r.batchId === b.id)} sheets={sheets.filter((s) => s.batchId === b.id && s.ccpType !== "CCP-4P")} onChanged={refresh} />
            ))}
          </div>
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

function BatchLine({ b, open, onToggle, isAdmin, heat, sheets, onChanged }: {
  b: Board; open: boolean; onToggle: () => void; isAdmin: boolean; heat: any[]; sheets: any[]; onChanged: () => void;
}) {
  const steps = progressOf(b);
  const ws = useFieldWriteState();
  const unsaved = heat.filter((r) => ["failed", "rejected"].includes(ws?.pending[r.rowId]?.state ?? "")).length;
  // 생산 완료 = 기존 완료 창 그대로 (완료 전 준비 점검·불량 수량·원료 미출고 시 '재고·원가 보류' 경고·처리 키) — 화면마다 다른 완료 판정을 만들지 않는다
  const [completeOpen, setCompleteOpen] = useState(false);
  const canComplete = isAdmin && ["in_progress", "paused"].includes(b.status) && !b.planOnly;
  return (
    <div className={cn("rounded-lg border bg-card", b.next.tone === "stop" && "border-red-300 dark:border-red-500/40")} data-testid="batch-line">
      <button type="button" onClick={onToggle} className="w-full text-left px-3 py-2.5 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{b.productName ?? "-"}</span>
          <span className="text-xs text-muted-foreground font-mono">{b.batchCode}</span>
          <span className="text-sm">{b.plannedKg ?? "-"} kg{b.actualKg != null ? ` → 실적 ${b.actualKg} kg` : ""}</span>
          {b.mode === "manual" && <Badge variant="outline" className="text-xs">수동</Badge>}
          <span className={cn("ml-auto text-xs border rounded px-2 py-1", TONE[b.next.tone])} data-testid="next">{b.next.label}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
        <div className="flex flex-wrap items-center gap-1" data-testid="progress">
          {steps.map((s, i) => (
            <span key={i} className={cn("text-[11px] px-1.5 py-0.5 rounded",
              s.state === "done" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
                : s.state === "now" ? "bg-blue-100 text-blue-800 font-semibold dark:bg-blue-500/15 dark:text-blue-300" : "bg-muted text-muted-foreground")}>
              {s.label}
            </span>
          ))}
          {unsaved > 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300 flex items-center gap-1" data-testid="unsaved">
              <AlertTriangle className="h-3 w-3" />저장 안 됨·확인 안 됨 {unsaved} — 펼쳐서 다시 보내기·고치기
            </span>
          )}
          {b.check.shortLines > 0 && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300 flex items-center gap-1" data-testid="short">
              <AlertTriangle className="h-3 w-3" />원료 부족 {b.check.shortMaterials.slice(0, 2).join(", ")}{b.check.shortMaterials.length > 2 ? ` 외 ${b.check.shortMaterials.length - 2}` : ""}
            </span>
          )}
        </div>
      </button>
      {open && (
        <div className="border-t px-3 py-3 space-y-3" data-testid="batch-open">
          {b.check.setupPending && (
            <p className="text-sm text-red-700 dark:text-red-300">준비가 끝나지 않은 생산 건입니다 — 수량·날짜를 같은 값으로 다시 저장하면 남은 준비를 이어서 합니다 (현장 확인·승인은 그때까지 막힘).</p>
          )}
          {b.check.issueLines > 0 && <LineIssueExceptions batchId={b.id} canResolve={isAdmin} />}
          {b.check.shortLines > 0 && (
            <p className="text-sm text-amber-800 dark:text-amber-300">
              그날 필요한 양이 남은 LOT 보다 많습니다: {b.check.shortMaterials.join(", ")} — 입고하면 자동으로 사라집니다 (부족해도 회사 음수 정책대로 진행).
            </p>
          )}
          {heat.length > 0 || sheets.length > 0
            ? <FieldRowsPanel heat={heat} sheets={sheets} bare onChanged={onChanged} />
            : <p className="text-sm text-muted-foreground">{b.planOnly ? "예정 생산 건 — 그날 이 자리에서 현장 확인을 하면 시작합니다." : "현장 확인할 가열 기록이 없습니다."}</p>}
          {canComplete && (
            <div className="flex flex-wrap items-center gap-2" data-testid="inline-complete">
              <Button className="h-11" onClick={() => setCompleteOpen(true)}>생산 완료 입력</Button>
              <span className="text-xs text-muted-foreground">실제 생산량 입력 — 완제품 LOT·재고·원가·승인 요청이 함께 (원료 미출고면 재고·원가는 보류로 알림)</span>
              <BatchCompletionDialog batchId={b.id} batchCode={b.batchCode} plannedQuantity={Number(b.plannedKg ?? 0)}
                open={completeOpen} onOpenChange={setCompleteOpen} onSuccess={onChanged} />
            </div>
          )}
          <Link href={`/dashboard/batch/${b.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
            <ExternalLink className="h-3 w-3" />전체 상세 (수정·삭제·인쇄)
          </Link>
        </div>
      )}
    </div>
  );
}
