/**
 * 생산 설계 > 제품 배합 > 상세 (2026-10-19, 설계 18 §13 2a) — [배합표 | 공정 흐름도] 같은 데이터
 *
 * 배합표: 원료 · 배합비 · 1배치 kg · 들어가는 곳. 공정이 없는 원료는 여기서 '성형에 바로 · 나중에 넣음 · 아직 모름' 을 고른다.
 * 흐름도: 원료 → (공정·설비) → 성형·합류 → 완제품 → 공통 후속 공정. 지금 데이터로 그릴 수 있는 '분류도' 다 —
 *   공정끼리의 순서·합류 위치는 저장된 정보가 없어 나란히 그린다 (추측해서 선을 긋지 않는다).
 * 시험 계산: 총 생산량으로 오늘 생산과 같은 계산 (저장 없음, 2b).
 * 공정 지정·배합비 같은 계산에 쓰이는 값은 '배합 고치기' (기존 품목제조보고 화면) 에서.
 */
import { useEffect, useMemo, useState } from "react";
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
import { toast } from "sonner";
import { SignalBadge, EDIT_PATHS, fmtKg } from "@/components/design/DesignBits";
import { TrialCalcPanel } from "@/components/design/TrialCalcPanel";
import { ArrowDown, ArrowRight, Loader2, Pencil, Save } from "lucide-react";

type Stage = "direct" | "late" | null;
const STAGES: Array<{ v: Stage; label: string }> = [
  { v: "direct", label: "성형에 바로" },
  { v: "late", label: "나중에 넣음" },
  { v: null, label: "아직 모름" },
];
const MODE = (p: any) => (p.mode === "concurrent" ? "동시에" : p.mode === "grouped" && p.batchSize > 1 ? `${p.batchSize}대씩 묶어서` : "한 대씩");

export default function DesignRecipeDetail() {
  const [, navigate] = useLocation();
  const { id } = useParams<{ id: string }>();
  const reportId = Number(id);
  const search = new URLSearchParams(useSearch());
  const versionParam = Number(search.get("version")) || undefined;
  const q = trpc.productionDesign.recipeDetail.useQuery({ reportId, versionId: versionParam }, { enabled: reportId > 0, retry: 1 });
  const utils = trpc.useUtils();
  const d: any = q.data;
  const [tab, setTab] = useState("table");
  const [draft, setDraft] = useState<Record<number, Stage>>({});
  // 설계 현황 경고에서 왔으면(focus=unknown) 들어가는 곳 미정 원료를 바로 보여 준다
  const [focus, setFocus] = useState<string | null>(search.get("focus") === "unknown" ? "s:unknown" : null);
  useEffect(() => { setDraft({}); }, [d?.versionId]);
  useEffect(() => {
    if (d && focus === "s:unknown") document.querySelector("[data-unknown-row]")?.scrollIntoView({ block: "center" });
  }, [d?.versionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 저장 성공 뒤에만 서버가 다시 판정한 결과로 현황·목록·이력을 새로 읽는다 (실패·취소면 화면 그대로)
  const save = trpc.productionDesign.setEntryStages.useMutation({
    onSuccess: (r: any) => { toast.success(r.changed ? `${r.changed}개 원료의 들어가는 곳을 저장했습니다.` : "바뀐 것이 없습니다."); setDraft({}); utils.productionDesign.invalidate(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const rows: any[] = d?.ingredients ?? [];
  const stageOf = (r: any): Stage => (r.id in draft ? draft[r.id] : (r.entryStage as Stage) ?? null);
  const laneOf = (r: any) => (r.processGroupId != null ? `p:${r.processGroupId}` : `s:${stageOf(r) ?? "unknown"}`);
  const dirty = Object.keys(draft).filter((k) => (draft[Number(k)] ?? null) !== (rows.find((r) => r.id === Number(k))?.entryStage ?? null));
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
  }, [d, rows, draft]);

  const openLane = (key: string) => { setFocus(key); setTab("table"); };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title={d ? d.productName : "제품 배합"} description="배합표와 공정 흐름도는 같은 데이터입니다. 공정이 없는 원료는 들어가는 곳만 여기서 정하고, 배합비·공정은 '배합 고치기' 에서."
          primary={d ? { label: "배합 고치기", icon: Pencil, onClick: () => navigate(EDIT_PATHS.recipe(d.reportId)) } : undefined}
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
                      v{v.versionNo} {v.status === "APPROVED" ? "승인" : v.status === "REJECTED" ? "반려" : "초안"}
                    </button>
                  ))}
                </span>
                {d.versionRole === "production" && d.newerDraft && (
                  <span className="basis-full text-xs text-blue-800">수정안 v{d.newerDraft.versionNo}(승인 전)이 있습니다 — 승인되면 그 버전으로 생산합니다.{" "}
                    <button type="button" className="underline" onClick={() => navigate(EDIT_PATHS.recipeDetail(d.reportId, { versionId: d.newerDraft.versionId }))}>수정안 보기</button></span>
                )}
                {d.versionRole !== "production" && (
                  <span className="basis-full rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900">
                    이 버전은 지금 생산에 쓰이지 않습니다 ({d.versionRole === "draft" ? "승인 전 수정안" : "옛 버전"}). 여기서 정한 내용은 이 버전에만 남고, 지금 생산 상태(신호등)는 생산에 쓰는 버전 기준입니다.{" "}
                    <button type="button" className="underline" onClick={() => navigate(EDIT_PATHS.recipeDetail(d.reportId))}>생산에 쓰는 버전 보기</button>
                  </span>
                )}
                {(d.issues as any[]).length > 0 && (
                  <ul className="basis-full list-disc pl-5">{(d.issues as any[]).map((i, k) => <li key={k} className={i.level === "red" ? "text-red-700" : "text-amber-800"}>{i.text}</li>)}</ul>
                )}
              </CardContent>
            </Card>

            {unknownRows.length > 0 && (
              <Card className="border-amber-300 bg-amber-50/50">
                <CardContent className="py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>들어가는 곳을 정하지 않은 원료 <b>{unknownRows.length}개</b> ({unknownRows.slice(0, 4).map((r) => r.name).join(", ")}{unknownRows.length > 4 ? " 외" : ""})</span>
                  <Button className="h-11" variant="outline" onClick={() => setDraft((x) => ({ ...x, ...Object.fromEntries(unknownRows.map((r) => [r.id, "direct"])) }))}>모두 '성형에 바로' 로 (아닌 것만 바꾸세요)</Button>
                </CardContent>
              </Card>
            )}
            {dirty.length > 0 && (
              <div className="sticky top-2 z-10 flex items-center justify-between gap-2 rounded-md border bg-background p-2 shadow-sm">
                <span className="text-sm">저장하지 않은 변경 {dirty.length}개</span>
                <div className="flex gap-2">
                  <Button variant="outline" className="h-11" onClick={() => setDraft({})}>되돌리기</Button>
                  <Button className="h-11" disabled={save.isPending} onClick={() => save.mutate({ reportId: d.reportId, versionId: d.versionId, items: dirty.map((k) => ({ ingredientId: Number(k), stage: draft[Number(k)] ?? null })) })}>
                    {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}저장
                  </Button>
                </div>
              </div>
            )}

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="h-auto">
                <TabsTrigger value="table" className="min-h-11 px-5">배합표</TabsTrigger>
                <TabsTrigger value="flow" className="min-h-11 px-5">공정 흐름도</TabsTrigger>
                <TabsTrigger value="trial" className="min-h-11 px-5">시험 계산</TabsTrigger>
              </TabsList>

              <TabsContent value="trial">
                <TrialCalcPanel reportId={d.reportId} batchTargetKg={d.batchTargetKg} isProductionVersion={d.versionRole === "production"} />
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
                              {r.processGroupId != null ? <Badge variant="outline">{r.processName}</Badge> : (
                                <div className="flex flex-wrap gap-1">
                                  {STAGES.map((s) => (
                                    <button key={String(s.v)} type="button" onClick={() => setDraft((x) => ({ ...x, [r.id]: s.v }))}
                                      className={cn("min-h-11 rounded-md border px-3 text-xs", stageOf(r) === s.v ? (s.v ? "bg-primary text-primary-foreground border-primary" : "bg-amber-100 border-amber-400") : "bg-background hover:bg-accent")}>
                                      {s.label}
                                    </button>
                                  ))}
                                </div>
                              )}
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
