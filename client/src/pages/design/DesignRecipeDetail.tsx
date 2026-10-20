/**
 * 생산 설계 > 제품 배합 > 상세 (2026-10-19, 설계 18 §13 2a) — [배합표 | 공정 흐름도] 같은 데이터
 *
 * 배합표: 원료 · 배합비 · 1배치 kg · 들어가는 곳 (보기).
 * 배합 고치기: 품목제조보고 편집기를 이 화면 안에서 연다 — 배합비·공정·들어가는 곳(성형에 바로 등)·재고 차감을 한 번에 저장 (2026-10-19, 다른 메뉴로 이동 없음).
 * 흐름도: 원료 → (공정·설비) → 성형·합류 → 완제품 → 공통 후속 공정. 지금 데이터로 그릴 수 있는 '분류도' 다 —
 *   공정끼리의 순서·합류 위치는 저장된 정보가 없어 나란히 그린다 (추측해서 선을 긋지 않는다).
 */
import { useMemo, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { ROUTES } from "@/lib/routePaths";
import { cn } from "@/lib/utils";
import { SignalBadge, EDIT_PATHS, fmtKg } from "@/components/design/DesignBits";
import { MfReportEditor } from "@/pages/production/MfReportEdit";
import { ArrowDown, ArrowRight, CheckCircle2, Loader2, Pencil } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Stage = "direct" | "late" | null;
const MODE = (p: any) => (p.mode === "concurrent" ? "동시에" : p.mode === "grouped" && p.batchSize > 1 ? `${p.batchSize}대씩 묶어서` : "한 대씩");

export default function DesignRecipeDetail() {
  const [, navigate] = useLocation();
  const { id } = useParams<{ id: string }>();
  const reportId = Number(id);
  const search = new URLSearchParams(useSearch());
  const versionParam = Number(search.get("version")) || undefined;
  const q = trpc.productionDesign.recipeDetail.useQuery({ reportId, versionId: versionParam }, { enabled: reportId > 0, retry: 1 });
  const d: any = q.data;
  // 설계 현황 경고에서 왔으면(focus=unknown) 바로 '배합 고치기' — 들어가는 곳은 공정 칸에서 고른다
  const [tab, setTab] = useState(search.get("focus") === "unknown" || search.get("tab") === "edit" ? "edit" : "table");
  const [focus, setFocus] = useState<string | null>(null);

  const rows: any[] = d?.ingredients ?? [];
  const stageOf = (r: any): Stage => (r.entryStage as Stage) ?? null;
  const laneOf = (r: any) => (r.processGroupId != null ? `p:${r.processGroupId}` : `s:${stageOf(r) ?? "unknown"}`);
  const unknownRows = rows.filter((r) => r.processGroupId == null && stageOf(r) == null);

  const lanes = useMemo(() => {
    if (!d) return [];
    const sum = (list: any[]) => list.reduce((s, r) => s + (r.kgPerBatch || 0), 0);
    const proc = (d.processes as any[]).map((p) => {
      const list = rows.filter((r) => r.processGroupId === p.id);
      const equip = `${p.equipmentNames.length ? `${p.equipmentNames.length}대 · ${MODE(p)}` : "설비 없음"}${p.profileTimeMin != null ? ` · 가열 ${p.profileTimeMin}분` : ""}`;
      return { key: `p:${p.id}`, title: p.name, sub: equip, list, kg: sum(list), kind: "process" as const };
    });
    const stageLane = (s: string, title: string, kind: "direct" | "late" | "unknown") => {
      const list = rows.filter((r) => r.processGroupId == null && (stageOf(r) ?? "unknown") === s);
      return { key: `s:${s}`, title, sub: kind === "direct" ? "가공된 재료 등 — 공정 없이" : kind === "late" ? "공정 없이 따로 넣음 (넣는 시점은 아직 기록하지 않음)" : "들어가는 곳을 정하세요", list, kg: sum(list), kind };
    };
    return [...proc, stageLane("direct", "성형에 바로", "direct"), stageLane("unknown", "아직 모름", "unknown"), stageLane("late", "나중에 넣음", "late")].filter((l) => l.list.length || l.kind === "process");
  }, [d, rows]);

  const openLane = (key: string) => { setFocus(key); setTab("table"); };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title={d ? d.productName : "제품 배합"} description="배합표와 공정 흐름도는 같은 데이터입니다. 고칠 때는 '배합 고치기' — 이 화면 안에서 고치고 저장하면 끝납니다."
          primary={d ? { label: "배합 고치기", icon: Pencil, onClick: () => setTab("edit") } : undefined}
          secondary={{ label: "목록", onClick: () => navigate(ROUTES.DESIGN_RECIPES) }} />
        {q.isLoading && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-1 animate-spin" />불러오는 중…</CardContent></Card>}
        {q.isError && <Card><CardContent className="py-8 text-center text-sm text-red-700">{q.error?.message}</CardContent></Card>}
        {d && (
          <>
            <Card>
              <CardContent className="py-3 flex flex-wrap items-center gap-2 text-sm">
                <SignalBadge signal={d.signal} />
                <span>배합 v{d.versionNo} · {d.approved ? "승인" : "초안"}{d.massBasis ? " · 원물·공정 환산" : ""}</span>
                <span className="font-medium">1배치 총 생산량 {fmtKg(d.batchTargetKg)}</span>
                {/* 버전 고르기 — 지금 생산에 쓰는 버전과 수정안·옛 버전을 구분 (승인 대기 목록은 정확한 버전으로 연다) */}
                <span className="basis-full flex flex-wrap items-center gap-1.5 text-xs" data-testid="version-chips">
                  <span className="text-muted-foreground">버전:</span>
                  {(d.versions as any[]).map((v) => (
                    <button key={v.versionId} type="button" onClick={() => navigate(EDIT_PATHS.recipeDetail(d.reportId, { versionId: v.versionId }))}
                      className={cn("min-h-9 rounded-full border px-3", v.versionId === d.versionId ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent")}>
                      v{v.versionNo} {v.status === "APPROVED" ? "승인" : v.status === "REJECTED" ? "반려" : v.status === "PENDING" ? "승인 대기" : "초안"}
                    </button>
                  ))}
                </span>
                {d.versionRole === "production" && d.newerDraft && (
                  <span className="basis-full text-xs text-blue-800">수정안 v{d.newerDraft.versionNo}(승인 전)이 있습니다 — 승인되면 그 버전으로 생산합니다.{" "}
                    <button type="button" className="underline" onClick={() => navigate(EDIT_PATHS.recipeDetail(d.reportId, { versionId: d.newerDraft.versionId }))}>수정안 보기</button></span>
                )}
                {d.versionRole !== "production" && (
                  <span className="basis-full rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900">
                    이 버전은 지금 생산에 쓰이지 않습니다 ({d.versionRole === "draft" ? "승인 전 수정안" : "옛 버전"}). 지금 생산 상태(신호등)는 생산에 쓰는 버전 기준입니다.{" "}
                    <button type="button" className="underline" onClick={() => navigate(EDIT_PATHS.recipeDetail(d.reportId))}>생산에 쓰는 버전 보기</button>
                  </span>
                )}
                <VersionApproval versionId={d.versionId} versionNo={d.versionNo}
                  status={String((d.versions as any[]).find((v) => v.versionId === d.versionId)?.status ?? (d.approved ? "APPROVED" : "DRAFT"))}
                  onDone={() => q.refetch()} />
                {(d.issues as any[]).length > 0 && (
                  <ul className="basis-full list-disc pl-5">{(d.issues as any[]).map((i, k) => <li key={k} className={i.level === "red" ? "text-red-700" : "text-amber-800"}>{i.text}</li>)}</ul>
                )}
              </CardContent>
            </Card>

            {unknownRows.length > 0 && tab !== "edit" && (
              <Card className="border-amber-300 bg-amber-50/50">
                <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>들어가는 곳을 정하지 않은 원료 <b>{unknownRows.length}개</b> ({unknownRows.slice(0, 4).map((r) => r.name).join(", ")}{unknownRows.length > 4 ? " 외" : ""})</span>
                  <Button className="h-11" variant="outline" onClick={() => setTab("edit")}>배합 고치기에서 정하기</Button>
                </CardContent>
              </Card>
            )}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto">
                <TabsTrigger value="table" className="min-h-11 px-5">배합표</TabsTrigger>
                <TabsTrigger value="flow" className="min-h-11 px-5">공정 흐름도</TabsTrigger>
                <TabsTrigger value="edit" className="min-h-11 px-5">배합 고치기</TabsTrigger>
              </TabsList>

              <TabsContent value="edit">
                {/* 제조기준관리의 품목제조보고 편집기와 같은 것 — 저장하면 현황·배합표·흐름도가 서버 판정으로 새로 읽힌다.
                    편집기는 보고서의 가장 최신 버전을 고친다 → 다른 버전을 보고 있으면 편집기를 열지 않고 고칠 버전을 분명히 (Codex #605 P2) */}
                {(d.versions as any[])[0]?.versionId === d.versionId ? (
                  <>
                    <p className="mb-2 text-xs text-muted-foreground" data-testid="editing-version">고치는 버전: v{d.versionNo} ({d.approved ? "승인" : "초안"}) — 원료마다 '공정' 칸에서 가열 공정 또는 성형에 바로·나중에 넣음을 고르고 저장하세요.</p>
                    <MfReportEditor reportId={d.reportId} embedded onCancel={() => setTab("table")} />
                  </>
                ) : (
                  <Card><CardContent className="py-4 text-sm space-y-2">
                    <p>지금 보고 있는 v{d.versionNo} 은 최신 버전이 아닙니다. 배합 고치기는 최신 버전 v{(d.versions as any[])[0]?.versionNo} 을 고칩니다.</p>
                    <Button className="h-11" onClick={() => navigate(EDIT_PATHS.recipeDetail(d.reportId, { versionId: (d.versions as any[])[0]?.versionId }) + "&tab=edit")}>v{(d.versions as any[])[0]?.versionNo} 열어서 고치기</Button>
                  </CardContent></Card>
                )}
              </TabsContent>

              <TabsContent value="table">
                <Card>
                  <CardContent className="p-0 overflow-x-auto">
                    <table className="w-full text-sm" data-testid="recipe-table">
                      <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                        <th className="text-left p-2">원료</th><th className="text-right p-2">배합비</th>{d.massBasis && <th className="text-right p-2">원물(1배치)</th>}<th className="text-right p-2">{d.massBasis ? "공정 투입(1배치)" : "1배치"}</th><th className="text-left p-2">들어가는 곳</th><th className="text-left p-2">재고 차감</th>
                      </tr></thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.id} data-unknown-row={r.processGroupId == null && stageOf(r) == null ? "" : undefined} className={cn("border-b last:border-0", focus && laneOf(r) === focus && "bg-blue-50", r.processGroupId == null && stageOf(r) == null && "bg-amber-50/60")}>
                            <td className="p-2">{r.name}{r.isAdditional && <span className="ml-1 text-xs text-muted-foreground">(추가)</span>}</td>
                            <td className="p-2 text-right whitespace-nowrap">{r.quantity}{r.unit}</td>
                            {d.massBasis && <td className="p-2 text-right whitespace-nowrap">{fmtKg(r.rawKgPerBatch)}</td>}
                            <td className="p-2 text-right whitespace-nowrap">
                              {r.kgPerBatch != null ? fmtKg(r.kgPerBatch) : <span className="text-xs text-muted-foreground" title="원료 품목이 없는 줄은 공정 투입량 계산에 들어가지 않습니다">{fmtKg(r.rawKgPerBatch)} (계산 제외)</span>}
                            </td>
                            <td className="p-2">
                              {r.processGroupId != null ? <Badge variant="outline">{r.processName}</Badge>
                                : stageOf(r) ? <span>{stageOf(r) === "direct" ? "성형에 바로" : "나중에 넣음"}</span>
                                : <span className="text-amber-800">아직 모름</span>}
                            </td>
                            <td className="p-2 text-xs">{r.deductible ? "차감" : "안 함"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="flow">
                <Card>
                  <CardContent className="py-4 space-y-3">
                    <p className="text-xs text-muted-foreground">원료 → 공정(설비) → 성형·합류 → 완제품 → 공통 공정. 공정끼리의 순서·합류 위치는 아직 저장된 정보가 없어 나란히 그립니다. 칸을 누르면 배합표에서 그 원료를 보여 줍니다.</p>
                    <div className="grid gap-4 lg:grid-cols-[1fr_auto]" data-testid="flow-diagram">
                      <div className="space-y-2">
                        {lanes.map((l) => (
                          <button key={l.key} type="button" onClick={() => openLane(l.key)}
                            className={cn("flex w-full flex-wrap items-stretch gap-2 rounded-lg border p-2 text-left hover:bg-accent", l.kind === "unknown" && "border-amber-400 bg-amber-50/60", l.kind === "late" && "border-dashed")}>
                            <div className="min-w-0 flex-1 rounded-md bg-muted/40 p-2">
                              <div className="text-xs text-muted-foreground">원료 {l.list.length}개 · {fmtKg(l.kg)}</div>
                              <div className="text-sm">{l.list.length ? l.list.map((r: any) => r.name).join(", ") : "원료 없음"}</div>
                            </div>
                            <ArrowRight className="hidden sm:block h-5 w-5 self-center text-muted-foreground" />
                            <div className={cn("w-full sm:w-56 rounded-md border p-2", l.kind === "process" ? "border-violet-300 bg-violet-50" : l.kind === "unknown" ? "border-amber-400" : "bg-background")}>
                              <div className="font-medium">{l.title}</div>
                              <div className="text-xs text-muted-foreground">{l.sub}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col items-center justify-center gap-1 text-sm">
                        <ArrowDown className="h-5 w-5 text-muted-foreground lg:hidden" />
                        <div className="w-48 rounded-md border-2 border-dashed p-2 text-center">성형·합류</div>
                        <ArrowDown className="h-5 w-5 text-muted-foreground" />
                        <div className="w-48 rounded-md border bg-emerald-50 p-2 text-center font-medium">완제품 {fmtKg(d.batchTargetKg)}<div className="text-xs font-normal text-muted-foreground">1배치</div></div>
                        {(d.common as any[]).map((c) => (
                          <div key={c.id} className="flex flex-col items-center gap-1">
                            <ArrowDown className="h-5 w-5 text-muted-foreground" />
                            <div className="w-48 rounded-md border border-red-200 bg-red-50 p-2 text-center">{c.name}<div className="text-xs text-muted-foreground">모든 제품 공통</div></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

/**
 * 이 버전 승인 — 배합 상세 안에서 기존 서버 흐름 그대로 (2026-10-20 신규 회사 시험: 저장 뒤 승인할 곳이 없었음).
 *   관리자(승인 권한): [승인] · [반려(사유)]   — mfReport.approveVersion / reject (서버 adminProcedure)
 *   그 밖: [승인 요청]                           — mfReport.requestApproval
 * 상태 확인·이력은 서버가 한 트랜잭션으로. 성공하면 같은 화면을 다시 읽어 버전 상태·신호등을 갱신한다.
 */
function VersionApproval({ versionId, versionNo, status, onDone }: { versionId: number; versionNo: number; status: string; onDone: () => void }) {
  const { user } = useAuth();
  const isApprover = ["admin", "super_admin"].includes(String((user as any)?.role ?? ""));
  const utils = trpc.useUtils();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const after = (msg: string) => () => { toast.success(msg); setErr(null); setRejecting(false); setReason(""); utils.productionDesign.invalidate(); onDone(); };
  const onError = (e: { message: string }) => setErr(e.message);
  const approve = trpc.mfReport.approveVersion.useMutation({ onSuccess: after(`v${versionNo} 을 승인했습니다 — 이제 생산이 이 배합을 씁니다`), onError });
  const request = trpc.mfReport.requestApproval.useMutation({ onSuccess: after(`v${versionNo} 승인을 요청했습니다`), onError });
  const reject = trpc.mfReport.reject.useMutation({ onSuccess: after(`v${versionNo} 을 반려했습니다`), onError });
  const busy = approve.isPending || request.isPending || reject.isPending;
  if (status === "APPROVED") {
    return <span className="basis-full flex items-center gap-1 text-xs text-emerald-700" data-testid="version-approved"><CheckCircle2 className="h-3.5 w-3.5" />v{versionNo} 승인됨</span>;
  }
  return (
    <div className="basis-full flex flex-wrap items-center gap-2 rounded border bg-muted/30 px-2 py-2" data-testid="version-approval">
      <span className="text-sm">v{versionNo} {status === "PENDING" ? "승인 대기" : status === "REJECTED" ? "반려됨" : "초안"}</span>
      {isApprover && status !== "REJECTED" && (
        <Button className="h-11" disabled={busy} onClick={() => approve.mutate({ versionId })} data-testid="approve-version">
          {approve.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}이 버전 승인
        </Button>
      )}
      {isApprover && status !== "REJECTED" && !rejecting && (
        <Button className="h-11" variant="outline" disabled={busy} onClick={() => setRejecting(true)}>반려</Button>
      )}
      {((!isApprover && status === "DRAFT") || status === "REJECTED") && (
        <Button className="h-11" disabled={busy} onClick={() => request.mutate({ versionId })} data-testid="request-approval">
          {request.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}승인 요청
        </Button>
      )}
      {status === "REJECTED" && <span className="text-xs text-muted-foreground">반려된 버전입니다 — 배합을 고친 뒤 다시 승인 요청하세요.</span>}
      {!isApprover && status === "PENDING" && <span className="text-xs text-muted-foreground">관리자 승인을 기다립니다.</span>}
      {rejecting && (
        <span className="flex flex-wrap items-center gap-2">
          <Input className="h-11 w-64" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="반려 사유" aria-label="반려 사유" />
          <Button className="h-11" variant="destructive" disabled={busy || !reason.trim()} onClick={() => reject.mutate({ versionId, reason: reason.trim() })}>반려하기</Button>
          <Button className="h-11" variant="ghost" onClick={() => setRejecting(false)}>취소</Button>
        </span>
      )}
      {err && <p className="basis-full text-sm text-red-700" role="alert" data-testid="approval-error">{err}</p>}
    </div>
  );
}
