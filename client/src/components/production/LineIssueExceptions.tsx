/**
 * 원료 출고 확인 (2026-10-19, #608 검토 P1) — 생산 건 화면 안에서 예외 줄만 푼다 (전수 재입력 없음)
 *
 * 보이는 줄: 보류(별도 확인)·줄 번호 없는 옛 출고와 대응이 애매한 줄. 이 줄들은 출고 완료로 보지 않아 승인·완료가 막힌다.
 *   '기존 출고로 인정' — 고른 옛 출고(같은 원료·단위·수량)를 이 줄의 출고로 (재고 변화 없음)
 *   '새로 출고' — 옛 출고와 무관 — 보류를 풀고 다음 자동 출고(승인 관문 등)가 이 줄을 출고
 * 결정은 관리자만, 추가만 (서버가 원료·단위·수량·중복을 다시 검사).
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";

export default function LineIssueExceptions({ batchId, canResolve }: { batchId: number; canResolve: boolean }) {
  const utils = trpc.useUtils();
  const { data = [] } = trpc.batch.lineIssueExceptions.useQuery({ batchId }, { enabled: !!batchId });
  const [picked, setPicked] = useState<Record<number, number[]>>({});
  const resolve = trpc.batch.resolveLineIssue.useMutation({
    onSuccess: () => { toast.success("확인했습니다."); utils.batch.lineIssueExceptions.invalidate({ batchId }); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  if (!(data as any[]).length) return null;
  return (
    <Card className="border-amber-300" data-testid="line-issue-exceptions">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-amber-600" />원료 출고 확인 필요 {(data as any[]).length}줄</CardTitle>
        <CardDescription>이 줄들은 출고 완료로 보지 않아 승인·완료가 막힙니다. 다시 차감하지도 않습니다. 확인 후 하나를 고르세요.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(data as any[]).map((l) => (
          <div key={l.lineId} className="rounded-md border p-2 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{l.materialName}</span>
              <span>{l.quantity}{l.unit}</span>
              <span className="text-xs text-muted-foreground">투입 줄 #{l.lineId}</span>
              <span className="text-xs rounded border px-1.5 py-0.5 bg-amber-50 border-amber-200 text-amber-800">{l.state === "ambiguous" ? "옛 출고와 대응 애매" : "보류"}</span>
            </div>
            {l.reason && <p className="text-xs text-muted-foreground">{l.reason}</p>}
            {l.candidates.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {l.candidates.map((t: any) => {
                  const on = (picked[l.lineId] ?? []).includes(t.txId);
                  return (
                    <label key={t.txId} className="flex items-center gap-1 text-xs border rounded px-2 py-1 cursor-pointer">
                      <input type="checkbox" checked={on} disabled={!canResolve}
                        onChange={() => setPicked((p) => ({ ...p, [l.lineId]: on ? (p[l.lineId] ?? []).filter((x) => x !== t.txId) : [...(p[l.lineId] ?? []), t.txId] }))} />
                      옛 출고 #{t.txId} · {t.quantity}{t.unit}{t.date ? ` · ${t.date}` : ""}{t.lotId ? ` · LOT #${t.lotId}` : " · LOT 없음"}
                    </label>
                  );
                })}
              </div>
            )}
            {canResolve ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {l.candidates.length > 0 && (
                  <Button size="sm" variant="outline" className="h-10" disabled={resolve.isPending || !(picked[l.lineId] ?? []).length}
                    onClick={() => resolve.mutate({ batchInputId: l.lineId, action: "existing", txIds: picked[l.lineId] })}>
                    {resolve.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}고른 옛 출고로 인정
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-10" disabled={resolve.isPending}
                  onClick={() => resolve.mutate({ batchInputId: l.lineId, action: "issue_new" })}>
                  옛 출고와 무관 — 새로 출고
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">관리자가 확인합니다.</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
