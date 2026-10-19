/**
 * 원료 출고 확인 (2026-10-19 #608 검토 P1, 2026-10-20 #610 시범 전 재확인) — 생산 건 화면 안에서 예외 줄만 푼다 (전수 재입력 없음)
 *
 * 보이는 줄 (서버가 나눈 종류):
 *   애매     — 줄 번호 없는 옛 출고와 대응이 애매. '고른 옛 출고로 인정'(재고 변화 없음) / '옛 출고와 무관 — 지금 출고'
 *   미출고   — 출고가 없는 줄(보류 줄 포함). 고를 옛 출고가 없으니 판정 없이 '실제 투입 확인 — 출고' 하나
 *   출고 대기 — 이미 '새로 출고' 로 정했는데 출고가 안 된 줄(재고·연결 오류). '다시 출고' — 다시 판정하지 않는다
 * 이 줄들은 출고 완료로 보지 않아 승인·완료가 막힌다. 출고는 공통 출고 엔진(먼저 들어온 LOT 부터, 업무일자 = 생산일).
 * 결정·출고는 관리자만 (서버가 원료 연결·단위·수량·중복을 다시 검사).
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";

const KIND_LABEL: Record<string, string> = { ambiguous: "옛 출고와 대응 애매", unissued: "미출고", pending: "출고 대기" };

export default function LineIssueExceptions({ batchId, canResolve }: { batchId: number; canResolve: boolean }) {
  const utils = trpc.useUtils();
  const { data = [] } = trpc.batch.lineIssueExceptions.useQuery({ batchId }, { enabled: !!batchId });
  const [picked, setPicked] = useState<Record<number, number[]>>({});
  const [busyLine, setBusyLine] = useState<number | null>(null);
  const done = (r: { issued?: boolean; messages?: string[] }) => {
    if (r?.issued === false) toast.error(`출고하지 못했습니다 — ${(r.messages ?? []).join(" / ") || "재고·원료 연결을 확인하세요"}. 확인 기록은 남았으니 고친 뒤 '다시 출고' 만 누르세요.`);
    else toast.success("처리했습니다.");
    utils.batch.lineIssueExceptions.invalidate({ batchId });
    utils.batch.invalidate();
  };
  const onErr = (e: { message: string }) => toast.error(e.message);
  const resolve = trpc.batch.resolveLineIssue.useMutation({ onSuccess: done, onError: onErr, onSettled: () => setBusyLine(null) });
  const issue = trpc.batch.issueLine.useMutation({ onSuccess: done, onError: onErr, onSettled: () => setBusyLine(null) });
  const pending = resolve.isPending || issue.isPending;
  if (!(data as any[]).length) return null;

  const confirmIssue = (l: any) =>
    window.confirm(`${l.materialName} ${l.quantity}${l.unit} 를 이 생산 건에 실제로 넣었습니까?\n\n확인하면 재고에서 출고합니다 (먼저 들어온 LOT 부터, 날짜는 생산일).\n넣지 않았다면 취소하고 관리자에게 알리세요.`);

  return (
    <Card className="border-amber-300" data-testid="line-issue-exceptions">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-amber-600" />원료 출고 확인 필요 {(data as any[]).length}줄</CardTitle>
        <CardDescription>이 줄들은 출고 완료로 보지 않아 승인·완료가 막힙니다. 저절로 다시 차감하지도 않습니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {(data as any[]).map((l) => (
          <div key={l.lineId} className="rounded-md border p-2 text-sm space-y-1" data-testid="line-issue-row" data-kind={l.kind}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{l.materialName}</span>
              <span>{l.quantity}{l.unit}</span>
              <span className="text-xs text-muted-foreground">투입 줄 #{l.lineId}</span>
              <span className="text-xs rounded border px-1.5 py-0.5 bg-amber-50 border-amber-200 text-amber-800">{KIND_LABEL[l.kind] ?? l.kind}{l.held ? " · 보류" : ""}</span>
            </div>
            {l.reason && <p className="text-xs text-muted-foreground">{l.reason}</p>}
            {l.kind !== "ambiguous" && l.stock && (
              <p className="text-xs text-muted-foreground" data-testid="line-stock">
                {l.stock.trusted ? "원료 연결 확인됨" : "원료 연결 미확인 — 출고할 수 없습니다"} · 재고 LOT {l.stock.lots}개 · 남은 양 {l.stock.available}{l.unit}
                {l.stock.trusted && l.stock.available + 0.0005 < l.quantity ? " · 모자란 양은 회사 음수 재고 정책대로 기록됩니다" : ""}
              </p>
            )}
            {l.kind === "ambiguous" && l.candidates.length > 0 && (
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
                {l.kind === "ambiguous" ? (
                  <>
                    <Button size="sm" variant="outline" className="h-10" disabled={pending || !(picked[l.lineId] ?? []).length}
                      onClick={() => { setBusyLine(l.lineId); resolve.mutate({ batchInputId: l.lineId, action: "existing", txIds: picked[l.lineId] }); }}>
                      {busyLine === l.lineId && resolve.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}고른 옛 출고로 인정
                    </Button>
                    <Button size="sm" variant="outline" className="h-10" disabled={pending}
                      onClick={() => { if (!confirmIssue(l)) return; setBusyLine(l.lineId); resolve.mutate({ batchInputId: l.lineId, action: "issue_new" }); }}>
                      옛 출고와 무관 — 지금 출고
                    </Button>
                  </>
                ) : (
                  <Button size="sm" className="h-10" data-testid="issue-line" disabled={pending || (l.stock != null && !l.stock.trusted)}
                    onClick={() => { if (l.kind === "unissued" && !confirmIssue(l)) return; setBusyLine(l.lineId); issue.mutate({ batchInputId: l.lineId }); }}>
                    {busyLine === l.lineId && issue.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                    {l.kind === "pending" ? "다시 출고" : "실제 투입 확인 — 출고"}
                  </Button>
                )}
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
