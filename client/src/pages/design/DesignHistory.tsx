/**
 * 생산 설계 > 변경·적용 이력 (2026-10-19, 설계 18 §13 1단계)
 *   무엇이(배합·설비·공정·일지 설정) 언제 누가 어떻게 바뀌었고(전 → 후), 그 뒤 몇 건의 생산·CCP 기록에 적용됐는지.
 *   배합 승인·반려도 함께. 읽기 전용.
 */
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { fmtVal } from "@/components/design/DesignBits";
import { Loader2 } from "lucide-react";

const KIND: Record<string, string> = { recipe: "배합 수정", "recipe-approval": "배합 승인", process: "공정", equipment: "설비", "daily-log": "일지 설정" };

export default function DesignHistory() {
  const [kind, setKind] = useState<string>("all");
  const q = trpc.productionDesign.history.useQuery({ limit: 200 }, { retry: 1 });
  const rows: any[] = (q.data as any[]) ?? [];
  const shown = useMemo(() => rows.filter((r) => kind === "all" || r.kind === kind), [rows, kind]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title="변경·적용 이력" description="무엇이 바뀌었고 어느 생산부터 적용됐는지 — 바꾸기 전·후와 그 뒤 만들어진 생산 건을 함께 봅니다." />
        <div className="flex flex-wrap gap-2">
          {["all", "recipe", "recipe-approval", "process", "equipment", "daily-log"].map((k) => (
            <Button key={k} variant={kind === k ? "default" : "outline"} className="h-11" onClick={() => setKind(k)}>
              {k === "all" ? `전체 ${rows.length}` : `${KIND[k]} ${rows.filter((r) => r.kind === k).length}`}
            </Button>
          ))}
        </div>
        {q.isLoading && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-1 animate-spin" />불러오는 중…</CardContent></Card>}
        {q.isError && <Card><CardContent className="py-8 text-center text-sm text-red-700">{q.error?.message}</CardContent></Card>}
        {!q.isLoading && !shown.length && !q.isError && (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">기록이 없습니다. 이제부터 배합·설비·공정을 고치면 바꾸기 전·후가 여기에 남습니다.</CardContent></Card>
        )}
        <div className="space-y-2" data-testid="history-list">
          {shown.map((h, i) => (
            <Card key={i}>
              <CardContent className="py-3 space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="rounded border px-2 py-0.5 text-xs">{KIND[h.kind] ?? h.kind}</span>
                  <span className="font-medium">{h.title}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{h.at}{h.who ? ` · ${h.who}` : ""}</span>
                </div>
                {h.description && <p className="text-sm text-muted-foreground">{h.description}</p>}
                {h.changes.length > 0 && (
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-muted-foreground"><th className="text-left font-normal py-1">항목</th><th className="text-left font-normal">바꾸기 전</th><th className="text-left font-normal">바꾼 뒤</th></tr></thead>
                    <tbody>
                      {(h.changes as any[]).map((c, k) => (
                        <tr key={k} className="border-t">
                          <td className="py-1 pr-2">{c.field}</td>
                          <td className="py-1 pr-2 text-muted-foreground line-through decoration-muted-foreground/40">{fmtVal(c.before)}</td>
                          <td className="py-1 font-medium">{fmtVal(c.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {h.appliedCount != null && (
                  <p className="text-xs text-muted-foreground">적용: {h.appliedLabel} <b className="text-foreground">{h.appliedCount}건</b>{h.appliedFirst ? ` (첫 ${h.appliedFirst})` : ""}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
