/**
 * 작업자 "오늘의 생산" — P-1 읽기 전용 (2026-10-14, UI/UX 개편 첫 파일럿)
 *
 * 한 화면, 위에서 아래로 6단계 (14-ui-ux-restructure-spec.md §7-2):
 *  ① 생산지시 선택 → ② 배합·BOM → ③ 재고·LOT 확인 → ④ 생산 시작 → ⑤ 투입 결과·HACCP 기록 → ⑥ 생산완료
 *
 * 이 화면은 **표시만** 한다. 시작·투입·완료 버튼은 기존 배치 상세로 이동한다 (자동출고는 여기서 실행되지 않는다).
 * 쓰기 연결은 P-2 — 시작 시점 서버 재검증·중복 실행 방지·기존 음수 정책 준수 (§7-3) 를 갖춘 뒤.
 * 모든 데이터는 기존 엔드포인트: dashboard.getStats(업무일자) · batch.list · inventory.getBatchInputs ·
 * inventory.getMaterialInventorySnapshot · inventory.getLotsByMaterialFefo · batch.getApprovalOverview · dailyLog.getByDate
 */
import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { notify } from "@/lib/notify";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Link } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTenantModules } from "@/hooks/useTenantModules";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
import { findMissingMeasurements } from "@shared/dailyLogMeasurements";
import { checkStock, summarizeIssue, summarizeForms, computeSteps, num, type StepState } from "@/lib/todayProduction";
import {
  CheckCircle2, Circle, AlertTriangle, Package, FlaskConical, Boxes, Play, ClipboardCheck, Flag,
  ChevronDown, ChevronRight, ExternalLink, Lock,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

type BatchRow = {
  id: number;
  batchCode: string;
  productName?: string | null;
  plannedQuantity?: string | number | null;
  actualQuantity?: string | number | null;
  status: string;
  dayBatchGroup?: string | null;
};

type InputRow = {
  id: number;
  materialId: number | null;
  materialName: string | null;
  materialCode?: string | null;
  plannedQuantity: string | number | null;
  actualQuantity: string | number | null;
  unit: string | null;
  lots: Array<{ lotId: number | null; lotNumber: string | null; quantity: number; negative: boolean }>;
};

type StockRow = { materialId: number; materialName: string; unit: string; currentAvailable: number; lotCount: number };

type FormView = {
  id: number;
  ccpType: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  rowCount: number;
  deviationCount: number;
  isDaily: boolean;
  approvalStatus: string | null;
};

const BATCH_STATUS: Record<string, { label: string; cls: string }> = {
  planned: { label: "계획", cls: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" },
  in_progress: { label: "진행 중", cls: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300" },
  paused: { label: "일시정지", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  completed: { label: "완료", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  shipped: { label: "출하", cls: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-300" },
  failed: { label: "실패", cls: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
  cancelled: { label: "취소", cls: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
};

const FORM_STATUS: Record<FormView["status"], { label: string; cls: string }> = {
  draft: { label: "작성 중", cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  submitted: { label: "제출됨", cls: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300" },
  approved: { label: "승인 완료", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  rejected: { label: "반려", cls: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
};

const STEP_META = [
  { n: "①", title: "오늘의 생산", sub: "생산지시 선택", icon: Package },
  { n: "②", title: "배합·BOM 확인", sub: "필요 원재료 계산", icon: FlaskConical },
  { n: "③", title: "재고·LOT 확인", sub: "가용재고 · 부족 · 유통기한", icon: Boxes },
  { n: "④", title: "생산 시작", sub: "자동출고 1회 실행", icon: Play },
  { n: "⑤", title: "투입 결과 · HACCP 기록", sub: "실제 수불 · 공식 기록지", icon: ClipboardCheck },
  { n: "⑥", title: "생산완료", sub: "완제품 LOT · 재고 반영", icon: Flag },
] as const;

function StepIcon({ state }: { state: StepState }) {
  if (state === "done") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (state === "blocked") return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  if (state === "active") return <Circle className="h-5 w-5 text-violet-600 fill-violet-600/20" />;
  return <Circle className="h-5 w-5 text-muted-foreground/40" />;
}

const fmt = (v: string | number | null | undefined, d = 2) => {
  const n = num(v);
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
};

export default function TodayProduction() {
  const { hasHACCP } = useTenantModules();
  const L = useIndustryLabel();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [openLots, setOpenLots] = useState<Record<number, boolean>>({});

  const { data: stats } = trpc.dashboard.getStats.useQuery(undefined, { staleTime: 60_000 });
  const businessDate: string | undefined = stats?.businessDate;

  const { data: batchesData, isLoading: batchesLoading } = trpc.batch.list.useQuery(
    { fromDate: businessDate!, toDate: businessDate!, limit: 200 },
    { enabled: !!businessDate },
  );
  const batches = (batchesData?.items ?? []) as BatchRow[];
  const selected = batches.find((b) => b.id === selectedId) ?? null;

  const { data: inputsData, isLoading: inputsLoading } = trpc.inventory.getBatchInputs.useQuery(
    { batchId: selectedId! },
    { enabled: !!selectedId },
  );
  const inputs = (inputsData ?? []) as InputRow[];

  const { data: snapshot } = trpc.inventory.getMaterialInventorySnapshot.useQuery(undefined, {
    enabled: !!selectedId,
    staleTime: 30_000,
  });
  const stock = (snapshot ?? []) as StockRow[];

  const { data: overview } = trpc.batch.getApprovalOverview.useQuery(
    { batchId: selectedId! },
    { enabled: !!selectedId && hasHACCP, retry: 1 },
  );
  const forms = ((overview?.forms ?? []) as FormView[]);

  const { data: dailyLog } = trpc.dailyLog.getByDate.useQuery(
    { logDate: businessDate! },
    { enabled: !!businessDate && hasHACCP && !!selectedId },
  );
  const dailyMissing = useMemo(
    () => (dailyLog ? findMissingMeasurements((dailyLog as { formData?: unknown }).formData).length : 0),
    [dailyLog],
  );

  const stockCheck = useMemo(() => checkStock(inputs, stock), [inputs, stock]);
  const issue = useMemo(() => summarizeIssue(inputs), [inputs]);
  const formSummary = useMemo(() => summarizeForms(forms), [forms]);
  const steps = computeSteps({
    batchStatus: selected?.status ?? null,
    hasInputs: inputs.length > 0,
    stockAllOk: stockCheck.allOk,
    issueAllIssued: issue.allIssued,
    formsAllWritten: hasHACCP ? formSummary.allWritten : true,
    dailyMissing: hasHACCP ? dailyMissing : 0,
  });

  const dateObj = businessDate ? new Date(`${businessDate}T00:00:00`) : new Date();
  const started = !!selected && ["in_progress", "paused", "completed", "shipped"].includes(selected.status);
  const finished = !!selected && ["completed", "shipped"].includes(selected.status);
  const detailHref = selected ? `/dashboard/batch/${selected.id}` : "/dashboard/production-management";

  // ── P-2 (2026-10-14): 쓰기 — ④ 시작(서버 재검증·중복 방지) / ⑥ 완료(관리자, 처리 키) ──
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const startable = !!selected && ["planned", "paused"].includes(selected.status);
  const utils = trpc.useUtils();
  const refreshAll = () => Promise.all([
    utils.batch.list.invalidate(), utils.inventory.getBatchInputs.invalidate(),
    utils.inventory.getMaterialInventorySnapshot.invalidate(), utils.todayProduction.checkStart.invalidate(),
    utils.batch.getApprovalOverview.invalidate(),
  ]);
  // ③ 서버 기준 재검증 결과 (시작 버튼과 같은 계산)
  const { data: serverCheck } = trpc.todayProduction.checkStart.useQuery(
    { batchId: selectedId! }, { enabled: !!selectedId && startable, retry: 1 },
  );
  const [confirm, setConfirm] = useState<null | { shortages: Array<{ materialName: string; unit: string; required: number; available: number; shortage: number }>; message: string }>(null);
  const startMut = trpc.todayProduction.start.useMutation({
    onSuccess: async (r: any) => {
      if (r.status === "needs_confirmation") { setConfirm({ shortages: r.shortages, message: r.message }); return; }
      setConfirm(null);
      if (r.status === "already_started") notify.info(r.message);
      else {
        notify.success(r.message);
        const w = [...(r.autoIssue?.errors ?? []), ...(r.autoIssue?.warnings ?? [])];
        if (w.length) notify.warn("자동출고 확인 필요", w.slice(0, 3).join(" / ") + (w.length > 3 ? ` 외 ${w.length - 3}건` : ""));
      }
      await refreshAll();
    },
    onError: (e: unknown) => notify.error("생산 시작 실패", e),
  });
  const [completeOpen, setCompleteOpen] = useState(false);
  const [actualQty, setActualQty] = useState("");
  const [completeKey, setCompleteKey] = useState("");
  const completeMut = trpc.batch.complete.useMutation({
    onSuccess: async () => { setCompleteOpen(false); notify.success("생산을 완료했습니다. 완제품 LOT 와 승인 요청이 만들어졌습니다."); await refreshAll(); },
    onError: (e: unknown) => notify.error("생산 완료 실패", e),
  });
  const openComplete = () => {
    setActualQty(String(num(selected?.plannedQuantity) || ""));
    // 같은 창에서 두 번 눌러도 한 번만 처리되도록 창을 열 때 처리 키를 고정한다 (서버 idempotency)
    setCompleteKey(`today-${selected?.id}-${Date.now()}`);
    setCompleteOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">오늘의 생산</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {format(dateObj, "yyyy년 M월 d일 EEEE", { locale: ko })} · 업무일자 {businessDate ?? "…"} · 오늘 무엇을 만들고, 지금 어느 단계이고, 막힌 게 무엇인지
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground border rounded-full px-3 py-1">
            <Lock className="h-3 w-3" /> 읽기 전용 · 시작·투입·완료는 {L("batch")} 상세에서
          </div>
        </div>

        {/* 단계 표시 */}
        <ol className="grid grid-cols-3 md:grid-cols-6 gap-2">
          {STEP_META.map((m, i) => {
            const st = steps[i];
            const tone = st === "done" ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-500/10 dark:border-emerald-500/30"
              : st === "active" ? "border-violet-400 bg-violet-50/70 dark:bg-violet-500/10 dark:border-violet-500/40 shadow-sm"
              : st === "blocked" ? "border-amber-300 bg-amber-50/60 dark:bg-amber-500/10 dark:border-amber-500/30"
              : "border-border bg-muted/30";
            return (
              <li key={m.n} className={`rounded-lg border p-2.5 ${tone}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground">{m.n}</span>
                  <StepIcon state={st} />
                </div>
                <div className="text-sm font-semibold mt-1 leading-tight">{m.title}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{m.sub}</div>
              </li>
            );
          })}
        </ol>

        {/* ① 생산지시 선택 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4 text-violet-600" />① 오늘의 생산 — 생산지시 선택</CardTitle>
          </CardHeader>
          <CardContent>
            {batchesLoading || !businessDate ? (
              <p className="text-sm text-muted-foreground py-4">불러오는 중...</p>
            ) : batches.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground mb-3">오늘 업무일자의 {L("batch")}가 없습니다</p>
                <Button asChild variant="outline" size="sm"><Link href="/dashboard/batch-management?tab=create">생산지시 추가</Link></Button>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {batches.map((b) => {
                  const st = BATCH_STATUS[b.status] ?? { label: b.status, cls: "bg-muted text-foreground" };
                  const active = b.id === selectedId;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedId(b.id)}
                      className={`text-left rounded-lg border p-3 transition-colors ${active ? "border-violet-500 ring-2 ring-violet-500/30 bg-violet-50/40 dark:bg-violet-500/10" : "hover:bg-accent/50"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold truncate">{b.productName ?? "제품"}</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded whitespace-nowrap ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 font-mono">{b.batchCode}</div>
                      <div className="text-xs mt-1">계획 <b>{fmt(b.plannedQuantity, 1)}</b>{b.actualQuantity != null ? <> · 실적 <b>{fmt(b.actualQuantity, 1)}</b></> : null}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {selected && (
          <>
            {/* ② 배합·BOM + ③ 재고·LOT */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                  <FlaskConical className="h-4 w-4 text-violet-600" />② 배합·BOM 확인
                  <span className="text-muted-foreground font-normal text-sm">→</span>
                  <Boxes className="h-4 w-4 text-violet-600" />③ 재고·LOT 확인
                  {inputs.length > 0 && (
                    stockCheck.allOk
                      ? <Badge className="ml-auto bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">가용 재고 충분</Badge>
                      : <Badge className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">부족 {stockCheck.shortCount}건 · 입고 대기</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {inputsLoading ? (
                  <p className="text-sm text-muted-foreground py-3">불러오는 중...</p>
                ) : inputs.length === 0 ? (
                  <div className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2 py-2">
                    <AlertTriangle className="h-4 w-4" /> 투입 계획(BOM)이 없습니다. 제조기준관리에서 배합을 확인하세요.
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-2">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b">
                          <th className="text-left py-1.5 px-2">원재료</th>
                          <th className="text-right py-1.5 px-2">필요량</th>
                          <th className="text-right py-1.5 px-2">가용 재고</th>
                          <th className="text-right py-1.5 px-2">부족</th>
                          <th className="text-left py-1.5 px-2">LOT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inputs.map((inp, i) => {
                          const row = stockCheck.rows[i];
                          const open = !!openLots[inp.id];
                          return (
                            <InputRowView
                              key={inp.id}
                              inp={inp}
                              required={row.required}
                              available={row.available}
                              shortage={row.shortage}
                              known={row.known}
                              open={open}
                              onToggle={() => setOpenLots((s) => ({ ...s, [inp.id]: !s[inp.id] }))}
                              started={started}
                            />
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {startable && serverCheck && (
                  <div className={`text-xs rounded-md px-2.5 py-1.5 ${serverCheck.shortages.length ? "bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300" : "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"}`}>
                    서버 확인(시작 버튼과 같은 계산): {serverCheck.shortages.length ? `부족 ${serverCheck.shortages.length}종 — ${serverCheck.shortages.slice(0, 3).map((x: { materialName: string; shortage: number; unit: string }) => `${x.materialName} ${x.shortage}${x.unit}`).join(", ")}${serverCheck.shortages.length > 3 ? " 외" : ""}` : "부족 없음"}
                    {serverCheck.issuedLines > 0 && ` · 이미 출고된 투입 ${serverCheck.issuedLines}줄 제외`}
                  </div>
                )}
                {!stockCheck.allOk && inputs.length > 0 && !started && (
                  <p className="text-[11px] text-muted-foreground">
                    "입고 대기" 는 표시입니다. 재고 부족 시 출고 허용 여부와 승인은 기존 재고 정책이 정합니다. 시작 시점에 서버가 재고·LOT 를 다시 확인합니다.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ④ 생산 시작 */}
            <Card className={steps[3] === "active" ? "border-violet-400" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Play className="h-4 w-4 text-violet-600" />④ 생산 시작 — 자동출고 1회</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  {started ? (
                    <span className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> 시작됨 · 원재료 {issue.issued}/{issue.total}건 출고{issue.negative > 0 ? ` (음수 차감 ${issue.negative}건)` : ""}</span>
                  ) : (
                    <span className="text-muted-foreground">아직 시작 전입니다. 시작하면 투입 계획대로 원재료가 한 번 자동 출고됩니다.</span>
                  )}
                </div>
                {startable && (
                  <Button size="sm" onClick={() => startMut.mutate({ batchId: selected!.id })} disabled={startMut.isPending} data-testid="today-start">
                    <Play className="h-3.5 w-3.5 mr-1" />{startMut.isPending ? "확인 중…" : "생산 시작"}
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* ⑤ 투입 결과 · HACCP 기록 */}
            <Card className={steps[4] === "active" ? "border-violet-400" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-violet-600" />⑤ 투입 결과 · HACCP 기록</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-semibold text-muted-foreground mb-1.5">투입 결과 (실제 수불)</div>
                  {!started ? (
                    <p className="text-sm text-muted-foreground">시작 후 출고된 LOT·수량이 여기에 보입니다.</p>
                  ) : (
                    <ul className="text-sm space-y-1">
                      {inputs.map((inp) => (
                        <li key={inp.id} className="flex justify-between gap-2">
                          <span className="truncate">{inp.materialName}</span>
                          <span className="font-mono text-xs whitespace-nowrap">
                            {inp.lots.length === 0 ? <span className="text-amber-600">미출고</span> : inp.lots.map((l) => `${l.lotNumber ?? "-"}${l.negative ? "(−)" : ""} ${fmt(l.quantity, 3)}`).join(", ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs font-semibold text-muted-foreground mb-1.5">HACCP 기록 (공식 기록지)</div>
                  {!hasHACCP ? (
                    <p className="text-sm text-muted-foreground">HACCP 모듈 없음</p>
                  ) : (
                    <ul className="text-sm space-y-1">
                      {forms.length === 0 && <li className="text-muted-foreground">기록지 없음</li>}
                      {forms.map((f) => {
                        const st = FORM_STATUS[f.status] ?? FORM_STATUS.draft;
                        return (
                          <li key={f.id} className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs">{f.ccpType}{f.isDaily ? " (일일 통합)" : ""}</span>
                            <span className="flex items-center gap-1">
                              {f.deviationCount > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">이탈 {f.deviationCount}</span>}
                              <span className={`text-[11px] px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                            </span>
                          </li>
                        );
                      })}
                      <li className="flex items-center justify-between gap-2 pt-1 border-t mt-1">
                        <span className="text-xs">일일일지 온·습도</span>
                        {dailyLog ? (
                          dailyMissing === 0
                            ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300">측정 완료</span>
                            : <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">미측정 {dailyMissing}</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">오늘 일지 없음</span>
                        )}
                      </li>
                    </ul>
                  )}
                  <Button asChild size="sm" variant="ghost" className="mt-2 h-7 text-xs px-2">
                    <Link href={detailHref}>기록지 열기 <ChevronRight className="h-3 w-3 ml-0.5" /></Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ⑥ 생산완료 */}
            <Card className={steps[5] === "done" ? "border-emerald-300" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2"><Flag className="h-4 w-4 text-violet-600" />⑥ 생산완료 — 완제품 LOT · 재고 반영</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                {finished ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" /> 완료 · 실적 {fmt(selected.actualQuantity, 1)}</div>
                    {overview && (
                      <div className="text-xs text-muted-foreground">
                        승인: {overview.decision === "approved" ? "승인 완료" : overview.decision === "rejected" ? "반려" : overview.decision === "pending" ? "승인 대기" : "요청 없음"}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted-foreground">{started ? "실적 수량을 입력하고 완료하면 완제품 LOT 이 생기고 승인 요청이 자동으로 올라갑니다." : "시작 후 진행합니다."}</span>
                )}
                {selected?.status === "in_progress" && isAdmin ? (
                  <Button size="sm" onClick={openComplete} data-testid="today-complete"><Flag className="h-3.5 w-3.5 mr-1" />생산 완료</Button>
                ) : selected?.status === "in_progress" ? (
                  <span className="text-xs text-muted-foreground">완료는 관리자가 처리합니다</span>
                ) : (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={detailHref}>상세 보기 <ExternalLink className="h-3.5 w-3.5 ml-1" /></Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ④ 재고 부족 확인 — 기존 음수 재고 정책을 설명하고, 확인한 사람·시각·부족 목록은 배치 메모에 남는다 */}
      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>재고가 부족한 원료가 있습니다</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirm?.message}</p>
          <ul className="text-sm divide-y rounded-lg border">
            {confirm?.shortages.map((x) => (
              <li key={x.materialName} className="flex justify-between gap-2 px-3 py-1.5">
                <span className="truncate">{x.materialName}</span>
                <span className="font-mono text-xs whitespace-nowrap">필요 {x.required} · 가용 {x.available} · <b className="text-amber-700">부족 {x.shortage}{x.unit}</b></span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-muted-foreground">시작하면 확인한 사람·시각·부족 목록이 {L("batch")} 메모에 기록됩니다. 실사·입고로 맞춰 주세요.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>취소</Button>
            <Button onClick={() => startMut.mutate({ batchId: selected!.id, acknowledgeShortage: true })} disabled={startMut.isPending} data-testid="today-start-confirm">
              {startMut.isPending ? "시작 중…" : "확인하고 시작"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ⑥ 생산 완료 — 기존 batch.complete (관리자 · 처리 키) */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>생산 완료 — {selected?.batchCode}</DialogTitle></DialogHeader>
          <label className="text-sm font-medium">실제 생산량</label>
          <Input type="number" min={0} step="0.001" value={actualQty} onChange={(e) => setActualQty(e.target.value)} />
          <p className="text-[11px] text-muted-foreground">계획 {fmt(selected?.plannedQuantity, 1)} · 완료하면 완제품 LOT 이 생기고 승인 요청이 자동으로 올라갑니다. 이미 출고된 원료는 다시 차감하지 않습니다.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>취소</Button>
            <Button
              disabled={completeMut.isPending || !(Number(actualQty) >= 0) || actualQty === ""}
              onClick={() => completeMut.mutate({ batchId: selected!.id, actualQuantity: Number(actualQty), idempotencyKey: completeKey })}
              data-testid="today-complete-confirm"
            >
              {completeMut.isPending ? "완료 중…" : "완료"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function InputRowView(props: {
  inp: InputRow; required: number; available: number; shortage: number; known: boolean;
  open: boolean; onToggle: () => void; started: boolean;
}) {
  const { inp, required, available, shortage, known, open, onToggle, started } = props;
  const { data: lots } = trpc.inventory.getLotsByMaterialFefo.useQuery(
    { materialId: inp.materialId! },
    { enabled: open && inp.materialId != null && !started },
  );
  const short = shortage > 0.001;
  return (
    <>
      <tr className={`border-b last:border-0 ${short && !started ? "bg-amber-50/40 dark:bg-amber-500/5" : ""}`}>
        <td className="py-1.5 px-2">
          <div className="font-medium">{inp.materialName}</div>
          {inp.materialCode && <div className="text-[11px] text-muted-foreground font-mono">{inp.materialCode}</div>}
        </td>
        <td className="py-1.5 px-2 text-right tabular-nums">{fmt(required, 3)} {inp.unit ?? ""}</td>
        <td className="py-1.5 px-2 text-right tabular-nums">{known ? fmt(available, 3) : <span className="text-muted-foreground">-</span>}</td>
        <td className={`py-1.5 px-2 text-right tabular-nums ${short ? "text-amber-700 dark:text-amber-300 font-semibold" : "text-emerald-700 dark:text-emerald-300"}`}>
          {short ? `−${fmt(shortage, 3)}` : "충분"}
        </td>
        <td className="py-1.5 px-2">
          {started ? (
            <span className="font-mono text-xs">{inp.lots.length === 0 ? "-" : inp.lots.map((l) => l.lotNumber ?? "-").join(", ")}</span>
          ) : (
            <button onClick={onToggle} className="text-xs text-violet-700 dark:text-violet-300 hover:underline flex items-center gap-0.5">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />} FEFO 순 보기
            </button>
          )}
        </td>
      </tr>
      {open && !started && (
        <tr className="bg-muted/30">
          <td colSpan={5} className="px-3 py-2">
            {!lots ? (
              <span className="text-xs text-muted-foreground">불러오는 중...</span>
            ) : (lots as any[]).length === 0 ? (
              <span className="text-xs text-amber-700 dark:text-amber-300">가용 LOT 없음 — 입고 대기</span>
            ) : (
              <ul className="text-xs grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {(lots as any[]).slice(0, 9).map((l) => (
                  <li key={l.id} className="flex justify-between gap-2 font-mono">
                    <span className="truncate">{l.lotNumber}</span>
                    <span className="whitespace-nowrap">{fmt(l.availableQuantity, 3)}{l.expiryDate ? ` · ~${String(l.expiryDate).slice(0, 10)}` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
