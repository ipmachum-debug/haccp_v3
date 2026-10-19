/**
 * 생산 설계 > 제품 배합 (2026-10-19, 설계 18 §13 1단계)
 *   사용 중 품목제조보고마다 '생산에 쓰는 버전'(승인 우선·최신) · 신호등 · 1배치 총 생산량 ·
 *   공정별 1배치 투입량 (배합비 % × 1배치 총 생산량 → 원료를 공정으로 분류: 교반 ○kg, 공정 지정 없음 ○kg).
 * 읽기 전용. '배합 열기' 로 기존 품목제조보고 수정 화면에서 고친다 (흐름도·시험 계산·버전 잠금은 다음 단계).
 */
import { useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { SignalBadge, EDIT_PATHS, fmtKg, signalLabel, type Signal } from "@/components/design/DesignBits";
import { Loader2 } from "lucide-react";

export default function DesignRecipes() {
  const [, navigate] = useLocation();
  const initial = new URLSearchParams(useSearch()).get("signal") as Signal | null;
  const [signal, setSignal] = useState<Signal | "all">(initial && ["red", "yellow", "green"].includes(initial) ? initial : "all");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const q = trpc.productionDesign.recipes.useQuery(undefined, { retry: 1 });
  const rows: any[] = (q.data as any[]) ?? [];
  const shown = useMemo(() => rows.filter((r) => (signal === "all" || r.signal === signal) && (!term.trim() || String(r.productName).includes(term.trim()))), [rows, signal, term]);
  const count = (s: Signal) => rows.filter((r) => r.signal === s).length;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title="제품 배합" description="품목제조보고의 배합비와 1배치 총 생산량으로 공정마다 몇 kg 이 들어가는지 계산됩니다. 고칠 제품은 '배합 열기'." />
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "red", "yellow", "green"] as const).map((s) => (
            <Button key={s} variant={signal === s ? "default" : "outline"} className="h-11" onClick={() => setSignal(s)}>
              {s === "all" ? `전체 ${rows.length}` : `${signalLabel(s)} ${count(s)}`}
            </Button>
          ))}
          <Input className="h-11 w-56 ml-auto" placeholder="제품 이름 찾기" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        {q.isLoading && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-1 animate-spin" />불러오는 중…</CardContent></Card>}
        {q.isError && <Card><CardContent className="py-8 text-center text-sm text-red-700">{q.error?.message}</CardContent></Card>}
        <div className="space-y-2" data-testid="recipe-list">
          {shown.map((r) => (
            <Card key={r.reportId} className={cn(r.signal === "red" && "border-red-300")}>
              <CardContent className="py-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <SignalBadge signal={r.signal} />
                  <button type="button" className="font-medium hover:underline text-left" onClick={() => setOpen(open === r.reportId ? null : r.reportId)}>{r.productName}</button>
                  <span className="text-xs text-muted-foreground">배합 v{r.versionNo}{r.approved ? " · 승인" : " · 초안"}{r.massBasis ? " · 원물·공정 환산" : ""}</span>
                  <span className="text-sm">1배치 {fmtKg(r.batchTargetKg)}</span>
                  <Button variant="outline" className="h-11 ml-auto" onClick={() => navigate(EDIT_PATHS.recipe(r.reportId))}>배합 열기</Button>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {(r.loads as any[]).map((l) => (
                    <span key={l.label} className={cn("rounded border px-2 py-0.5", l.label === "공정 지정 없음" ? "border-amber-300 bg-amber-50" : "bg-muted/40")}>{l.label} {fmtKg(l.kg)}</span>
                  ))}
                </div>
                {(open === r.reportId || r.signal === "red") && r.issues.length > 0 && (
                  <ul className="text-sm list-disc pl-5">{(r.issues as any[]).map((i, k) => <li key={k} className={i.level === "red" ? "text-red-700" : "text-amber-800"}>{i.text}</li>)}</ul>
                )}
              </CardContent>
            </Card>
          ))}
          {!q.isLoading && !shown.length && <p className="text-sm text-muted-foreground">조건에 맞는 제품이 없습니다.</p>}
        </div>
      </div>
    </DashboardLayout>
  );
}
