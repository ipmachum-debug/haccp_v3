/**
 * 재고·LOT 정합성 점검 탭 (2026-10-15) — 시스템 관리 > 정합성 점검 (관리자 전용, 읽기 전용)
 *
 * 기간을 고르고 "점검" → 생산 흐름(원료 차감·제품 LOT·실적 kg·생산완료 분개·판매 출고 차감·승인 대기)과
 * 재고(음수 재고·LOT 잔량 vs 거래원장)를 대조한 결과를 보여 준다. 데이터는 바꾸지 않는다.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { offsetLocalDate, todayLocal } from "@/lib/dateUtils";
import { ShieldCheck, Loader2, ChevronDown, ChevronRight } from "lucide-react";

type Finding = { code: string; title: string; severity: "critical" | "high" | "medium" | "info"; count: number; samples: Array<Record<string, unknown>>; message?: string };

const SEV: Record<Finding["severity"], { label: string; cls: string }> = {
  critical: { label: "심각", cls: "bg-red-100 text-red-800" },
  high: { label: "높음", cls: "bg-orange-100 text-orange-800" },
  medium: { label: "보통", cls: "bg-amber-100 text-amber-800" },
  info: { label: "정보", cls: "bg-gray-100 text-gray-700" },
};

function SampleTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (!rows.length) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div className="mt-2 max-h-64 overflow-auto rounded border">
      <table className="w-full text-xs">
        <thead className="bg-muted/50"><tr>{cols.map((c) => <th key={c} className="px-2 py-1 text-left font-medium">{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">{cols.map((c) => <td key={c} className="px-2 py-1 tabular-nums">{r[c] == null ? "—" : String(r[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ConsistencyCheckPanel() {
  const [from, setFrom] = useState(offsetLocalDate(-30));
  const [to, setTo] = useState(todayLocal());
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const q = trpc.consistency.productionChain.useQuery(range ?? { from, to }, { enabled: !!range, retry: false, refetchOnWindowFocus: false });
  const findings = ((q.data?.findings ?? []) as Finding[]);
  const problems = findings.filter((f) => f.count > 0 && f.severity !== "info");

  return (
    <div className="space-y-4" data-testid="consistency-panel">
      <div className="rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-600" />재고·LOT 정합성 점검</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          배치 → 원료 차감 → 제품 LOT → 생산완료 분개 → 판매 출고 → LOT 차감이 서로 맞는지 대조합니다. 읽기 전용이며 데이터를 바꾸지 않습니다.
          배치는 생산일, 매출은 거래일 기준입니다. 음수 재고·LOT 잔량 점검은 기간과 무관하게 전체를 봅니다.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input type="date" className="h-9 w-40" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="시작일" />
          <span className="text-muted-foreground">~</span>
          <Input type="date" className="h-9 w-40" value={to} onChange={(e) => setTo(e.target.value)} aria-label="종료일" />
          <Button size="sm" onClick={() => { setRange({ from, to }); if (range && range.from === from && range.to === to) q.refetch(); }} disabled={q.isFetching} data-testid="consistency-run">
            {q.isFetching ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}점검
          </Button>
        </div>
      </div>

      {q.isError && <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">점검 실패: {q.error?.message}</div>}

      {q.data && (
        <>
          <div className={`rounded-md border px-3 py-2 text-sm ${problems.length ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900"}`} data-testid="consistency-summary">
            {q.data.range.from} ~ {q.data.range.to} · {problems.length ? `확인 필요 ${problems.length}항목` : "문제 없음"} · {q.data.durationMs}ms
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {findings.map((f) => {
              const isOpen = !!open[f.code];
              return (
                <li key={f.code} className="px-3 py-2" data-testid={`finding-${f.code}`}>
                  <button type="button" className="flex w-full items-center gap-2 text-left text-sm" onClick={() => setOpen((o) => ({ ...o, [f.code]: !o[f.code] }))} disabled={!f.samples.length}>
                    {f.samples.length ? (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : <span className="w-4" />}
                    <span className={`rounded px-1.5 py-0.5 text-[11px] ${f.count > 0 ? SEV[f.severity].cls : "bg-emerald-100 text-emerald-800"}`}>{f.count > 0 ? SEV[f.severity].label : "정상"}</span>
                    <span className="flex-1">{f.title}</span>
                    <span className="tabular-nums font-medium">{f.count}건</span>
                  </button>
                  {f.message && <p className="ml-6 mt-0.5 text-xs text-muted-foreground">{f.message}</p>}
                  {isOpen && <div className="ml-6"><SampleTable rows={f.samples} /><p className="mt-1 text-[11px] text-muted-foreground">{f.code} · 최대 20건 표시</p></div>}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
