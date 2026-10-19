/**
 * 생산 설계 > 제품 배합 > 시험 계산 (2026-10-19, 설계 18 2b) — 저장 없음
 *
 * 총 생산량(과 원하면 시작 시각)을 넣으면 오늘 생산과 같은 계산으로 회차 · 공정별 설비·시각·투입량 · 원료 양을 보여 준다.
 * 그날 이미 잡힌 생산은 빼고 빈 공장 기준. 배치·CCP·재고·분개·기록 어느 것도 만들지 않는다.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { fmtKg } from "@/components/design/DesignBits";
import { Calculator, Loader2 } from "lucide-react";

const qty = (n: number | null | undefined, unit: string) => (n == null ? "-" : `${Math.round(n * 1000) / 1000}${unit}`);

export function TrialCalcPanel({ reportId, batchTargetKg, isProductionVersion }: { reportId: number; batchTargetKg: number | null; isProductionVersion: boolean }) {
  const [kg, setKg] = useState(batchTargetKg ? String(batchTargetKg) : "");
  const [start, setStart] = useState("");
  const [args, setArgs] = useState<{ plannedKg: number; startTime?: string } | null>(null);
  const q = trpc.productionDesign.trialCalc.useQuery(
    { reportId, plannedKg: args?.plannedKg ?? 1, startTime: args?.startTime },
    { enabled: !!args, retry: false, refetchOnWindowFocus: false },
  );
  const d: any = q.data;
  const valid = Number(kg) > 0;
  const run = () => valid && setArgs({ plannedKg: Number(kg), startTime: /^\d{2}:\d{2}$/.test(start) ? start : undefined });

  return (
    <Card>
      <CardContent className="py-4 space-y-3" data-testid="trial-calc">
        <p className="text-sm text-muted-foreground">
          총 생산량을 넣으면 <b>오늘 생산과 같은 계산</b>으로 회차·설비 시각·원료 양을 미리 봅니다. <b>저장하지 않습니다</b> — 생산 건·CCP 기록·재고는 그대로입니다.
          그날 이미 잡힌 다른 생산은 빼고 빈 공장 기준입니다.
        </p>
        {!isProductionVersion && <p className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900">시험 계산은 지금 생산에 쓰는 버전으로 합니다 (이 화면의 버전이 아님).</p>}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">총 생산량(kg)
            <Input className="h-11 w-36" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} />
          </label>
          <label className="text-sm">시작 시각 (비우면 설비 작업 시작)
            <Input className="h-11 w-36" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <Button className="h-11" disabled={!valid || q.isFetching} onClick={run}>
            {q.isFetching ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Calculator className="h-4 w-4 mr-1" />}계산
          </Button>
          {batchTargetKg ? <span className="text-xs text-muted-foreground">1배치 {fmtKg(batchTargetKg)}</span> : null}
        </div>
        {q.isError && <p className="text-sm text-red-700">{q.error?.message}</p>}
        {d && !d.ok && <p className="text-sm text-red-700">{d.reason}</p>}
        {d?.ok && (
          <div className="space-y-3" data-testid="trial-result">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded border px-2 py-0.5">완제품 {fmtKg(d.plannedKg)}</span>
              <span className="rounded border px-2 py-0.5">회차 {d.roundsCount}{d.subBatchKg ? ` (1회 ${fmtKg(d.subBatchKg)})` : ""}</span>
              <span className="rounded border px-2 py-0.5">배합 v{d.versionNo ?? "?"} {d.approved ? "승인" : "초안"}{d.massBasis === "basis" ? " · 원물·공정 환산" : ""}</span>
            </div>
            {(d.blocking as string[]).length > 0 && (
              <ul className="list-disc pl-5 text-sm text-red-700">{(d.blocking as string[]).map((b, k) => <li key={k}>실제 생산 건을 만들 때 막힘: {b}</li>)}</ul>
            )}
            {(d.warnings as string[]).length > 0 && <ul className="list-disc pl-5 text-sm text-amber-800">{(d.warnings as string[]).map((w, k) => <li key={k}>{w}</li>)}</ul>}

            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="trial-schedule">
                <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground"><th className="p-2 text-left">공정</th><th className="p-2 text-left">회차</th><th className="p-2 text-left">설비</th><th className="p-2 text-left">시각</th><th className="p-2 text-right">공정 투입</th></tr></thead>
                <tbody>
                  {(d.processes as any[]).flatMap((p) => (p.rounds as any[]).map((rd, k) => (
                    <tr key={`${p.processGroupId}-${rd.seq}`} className="border-b last:border-0">
                      <td className="p-2">{k === 0 ? p.name : ""}</td>
                      <td className="p-2">{rd.roundNo}회</td>
                      <td className="p-2">{rd.equipmentName ?? "설비 없음"}</td>
                      <td className="p-2 whitespace-nowrap">{rd.plannedStart ?? "--:--"}{rd.plannedEnd ? `~${rd.plannedEnd}` : ""}{rd.heatingMin != null ? ` · 가열 ${rd.heatingMin}분` : ""}</td>
                      <td className="p-2 text-right">{rd.inputKg != null ? fmtKg(rd.inputKg) : "-"}</td>
                    </tr>
                  )))}
                  {!(d.processes as any[]).length && <tr><td colSpan={5} className="p-2 text-muted-foreground">가열 공정이 없습니다 (성형·금속검출만).</td></tr>}
                  {(d.common as string[]).map((c) => <tr key={c}><td className="p-2" colSpan={5}>{c} — 모든 제품 공통 (시각은 현장 기록)</td></tr>)}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="trial-ingredients">
                <thead><tr className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <th className="p-2 text-left">원료</th><th className="p-2 text-right">재고 차감 계획</th>{d.massBasis === "basis" && <th className="p-2 text-right">공정 투입(전처리 후)</th>}<th className="p-2 text-left">들어가는 곳</th>
                </tr></thead>
                <tbody>
                  {(d.ingredients as any[]).map((i) => (
                    <tr key={i.id} className="border-b last:border-0">
                      <td className="p-2">{i.name}</td>
                      <td className="p-2 text-right whitespace-nowrap">{i.deductQty != null ? qty(i.deductQty, i.unit) : <span className="text-xs text-muted-foreground">{i.deductible ? "계산 제외" : "차감 안 함"}</span>}</td>
                      {d.massBasis === "basis" && <td className="p-2 text-right">{i.processKg != null ? qty(i.processKg, "kg") : "-"}</td>}
                      <td className="p-2">{i.entryLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
