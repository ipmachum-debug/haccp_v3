/**
 * 생산 설계 > 설계 현황 (2026-10-19, 설계 18 §13) — 첫 화면
 *   제품별 준비 상태 신호등 · 바로 고칠 것/확인 필요 · 승인 대기 · 공장 설정 오류·누락 · 최근 수정사항
 * 읽기 전용. 고치는 곳은 기존 화면(품목제조보고 · CCP 설비 · 공정) — 버튼으로 바로 간다.
 */
import { Link, useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ROUTES } from "@/lib/routePaths";
import { cn } from "@/lib/utils";
import { SignalBadge, EDIT_PATHS, type Signal } from "@/components/design/DesignBits";
import { Loader2, RefreshCw } from "lucide-react";

export default function DesignOverview() {
  const [, navigate] = useLocation();
  const q = trpc.productionDesign.overview.useQuery(undefined, { retry: 1 });
  const d: any = q.data;

  const counts: Record<Signal, number> = d?.counts ?? { green: 0, yellow: 0, red: 0 };
  const attention = ((d?.recipes ?? []) as any[]).filter((r) => r.signal !== "green");
  // 경고에서 바로 그 원료로 — 들어가는 곳 미정이면 그 줄을 보여 주는 링크 (열기만으로는 아무것도 바뀌지 않는다)
  const fixPath = (r: any) => EDIT_PATHS.recipeDetail(r.reportId, (r.issues as any[]).some((i) => i.code === "unassigned") ? { focus: "unknown" } : undefined);
  const pending = ((d?.pending ?? []) as any[]);
  const waiting = pending.filter((p) => p.kind === "draft" || p.kind === "only");
  const others = pending.filter((p) => p.kind === "superseded" || p.kind === "rejected");

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title="설계 현황" description="무엇을, 어떤 원료와 설비로, 어떻게 만들지 — 생산 기준이 준비됐는지 한눈에 봅니다."
          secondary={{ label: "새로고침", icon: RefreshCw, onClick: () => q.refetch() }} />
        {q.isLoading && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-1 animate-spin" />불러오는 중…</CardContent></Card>}
        {q.isError && <Card><CardContent className="py-8 text-center text-sm text-red-700">{q.error?.message}</CardContent></Card>}
        {d && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {(["red", "yellow", "green"] as Signal[]).map((s) => (
                <button key={s} type="button" onClick={() => navigate(`${ROUTES.DESIGN_RECIPES}?signal=${s}`)}
                  className={cn("rounded-lg border p-4 text-left hover:bg-accent", s === "red" && counts.red ? "border-red-300" : "")}>
                  <SignalBadge signal={s} />
                  <div className="mt-2 text-3xl font-bold">{counts[s]}</div>
                  <div className="text-xs text-muted-foreground">제품</div>
                </button>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">바로 고칠 것 · 확인 필요 ({attention.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {!attention.length && <p className="text-sm text-muted-foreground">모든 제품이 생산 준비가 됐습니다.</p>}
                {attention.slice(0, 12).map((r) => (
                  <div key={r.reportId} className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SignalBadge signal={r.signal} />
                        <span className="font-medium">{r.productName}</span>
                        <span className="text-xs text-muted-foreground">배합 v{r.versionNo}{r.approved ? "" : " (초안)"}</span>
                      </div>
                      <ul className="text-sm list-disc pl-5">{(r.issues as any[]).map((i, k) => <li key={k} className={i.level === "red" ? "text-red-700" : "text-amber-800"}>{i.text}</li>)}</ul>
                    </div>
                    <Button variant="outline" className="h-11" onClick={() => navigate(fixPath(r))}>고칠 곳 열기</Button>
                  </div>
                ))}
                {attention.length > 12 && <Link href={ROUTES.DESIGN_RECIPES} className="text-sm text-blue-700 hover:underline">전체 {attention.length}개 보기 →</Link>}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">승인 대기 ({waiting.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm" data-testid="pending-list">
                  {!waiting.length && <p className="text-muted-foreground">승인을 기다리는 수정안이 없습니다.</p>}
                  {waiting.map((p) => (
                    <div key={p.versionId} className="flex items-center justify-between gap-2 border-b py-1.5 last:border-0">
                      <span>{p.productName} <span className="text-muted-foreground">v{p.versionNo} 초안{p.kind === "only" ? " · 승인 버전 없음" : ` · 지금 생산은 v${p.approvedVersionNo}`}{p.created ? ` · ${p.created}` : ""}</span></span>
                      {/* 그 버전 그대로 연다 (다른 버전을 열거나 처리하지 않도록) */}
                      <Link href={EDIT_PATHS.recipeDetail(p.reportId, { versionId: p.versionId })} className="text-blue-700 hover:underline whitespace-nowrap">v{p.versionNo} 열기</Link>
                    </div>
                  ))}
                  {others.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs text-muted-foreground">생산에 쓰이지 않는 옛 초안·반려 {others.length}개 — 자동으로 처리하지 않습니다 (정리 방법은 담당자가 정함)</p>
                      {others.map((p) => (
                        <div key={p.versionId} className="flex items-center justify-between gap-2 py-1 text-xs text-muted-foreground">
                          <span>{p.productName} v{p.versionNo} {p.kind === "rejected" ? "반려" : `초안 · 더 새 v${p.approvedVersionNo} 승인으로 생산 중`}</span>
                          <Link href={EDIT_PATHS.recipeDetail(p.reportId, { versionId: p.versionId })} className="text-blue-700 hover:underline whitespace-nowrap">v{p.versionNo} 보기</Link>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">공장 설정 오류·누락 ({d.settingIssues.length})</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  {!d.settingIssues.length && <p className="text-muted-foreground">설비·공정 설정에 빠진 값이 없습니다.</p>}
                  {(d.settingIssues as any[]).map((i, k) => <p key={k} className={i.level === "red" ? "text-red-700" : "text-amber-800"}>• {i.text}</p>)}
                  <Link href={ROUTES.DESIGN_FACTORY} className="inline-block pt-1 text-blue-700 hover:underline">우리 공장 보기 →</Link>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">최근 수정사항</CardTitle>
                <Link href={ROUTES.DESIGN_HISTORY} className="text-sm text-blue-700 hover:underline">변경·적용 이력 전체 →</Link>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {!d.recent.length && <p className="text-muted-foreground">아직 기록된 수정이 없습니다. 이제부터 배합·설비·공정을 고치면 여기에 남습니다.</p>}
                {(d.recent as any[]).map((h, k) => (
                  <div key={k} className="flex flex-wrap items-baseline gap-x-2 border-b py-1.5 last:border-0">
                    <span className="text-xs text-muted-foreground w-32 shrink-0">{h.at}</span>
                    <span className="min-w-0 flex-1">{h.title}</span>
                    {h.appliedCount != null && <span className="text-xs text-muted-foreground">{h.appliedLabel} {h.appliedCount}건</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
