/**
 * BatchApprovalPanel — 배치 승인 카드 (2026-10-13, CCP 단일 흐름 2단계 첫 PR)
 *
 * 이전 카드는 h_batch_approvals(0행)·h_ccp_records(1행) 를 읽어 항상 "점검 기록 없음 / 승인 이력 없음" 이었다.
 * 지금은 실제 승인 흐름(승인관리 h_approval_requests: batch_production + ccp_form)과 공식 CCP 기록지를 읽고,
 * 승인·반려 버튼은 승인관리 대기목록과 같은 함수(approveRequest / rejectRequest)를 호출한다.
 */
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CheckCircle2, Clock, History as HistoryIcon, Loader2, XCircle } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const STATUS_LABEL: Record<string, string> = {
  pending_writer: "작성자 검토 대기",
  pending_review: "검토 대기",
  pending_approval: "승인 대기",
  pending: "대기",
  approved: "승인 완료",
  rejected: "반려",
  cancelled: "취소",
  draft: "작성중",
  submitted: "제출됨",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  approved: "default",
  rejected: "destructive",
  cancelled: "outline",
  draft: "outline",
  submitted: "secondary",
  pending_writer: "outline",
  pending_review: "secondary",
  pending_approval: "secondary",
  pending: "secondary",
};

const CCP_TYPE_LABEL: Record<string, string> = {
  "CCP-1B": "교반/증숙",
  "CCP-2B": "오븐굽기",
  "CCP-3B": "냉각",
  "CCP-4P": "금속검출",
};

function fmt(v: Date | string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

type TimelineEvent = { at: Date; label: string; who: string | null; detail: string | null; kind: "request" | "review" | "approve" | "reject" | "history" };

type FormView = {
  id: number;
  ccpType: string;
  workDate: string | null;
  status: string;
  rowCount: number;
  deviationCount: number;
  approvalRequestId: number | null;
  approvalStatus: string | null;
  isDaily: boolean;
};

export default function BatchApprovalPanel({ batchId, batchLabel = "배치" }: { batchId: number; batchLabel?: string }) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { data: ov, isLoading } = trpc.batch.getApprovalOverview.useQuery({ batchId }, { enabled: !!batchId });

  const refresh = () => {
    utils.batch.getApprovalOverview.invalidate({ batchId });
    utils.approval.getPendingCount.invalidate();
  };

  const approveMutation = trpc.batch.approve.useMutation({
    onSuccess: () => { toast.success(`${batchLabel} 승인 요청이 승인되었습니다`); refresh(); },
    onError: (e: { message: string }) => toast.error(`승인 실패: ${e.message}`),
  });
  const rejectMutation = trpc.batch.reject.useMutation({
    onSuccess: () => { toast.success(`${batchLabel} 승인 요청이 반려되었습니다`); refresh(); },
    onError: (e: { message: string }) => toast.error(`반려 실패: ${e.message}`),
  });

  if (isLoading || !ov) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" /> 승인 현황 불러오는 중...
      </div>
    );
  }

  // 타임라인: 요청·검토·승인·반려 + 이력 테이블을 시간순으로
  const events: TimelineEvent[] = [];
  for (const r of ov.requests) {
    const short = r.requestType === "batch_production" ? `${batchLabel} 승인 요청` : r.requestType === "ccp_form" ? "CCP 기록지 요청" : r.requestType;
    if (r.requestedAt) events.push({ at: new Date(r.requestedAt), label: `${short} 등록`, who: r.requestedByName, detail: r.title, kind: "request" });
    if (r.reviewedAt) events.push({ at: new Date(r.reviewedAt), label: `${short} 검토`, who: r.reviewedByName, detail: r.reviewComments, kind: "review" });
    if (r.approvedAt) events.push({ at: new Date(r.approvedAt), label: `${short} 승인`, who: r.approvedByName, detail: r.notes, kind: "approve" });
    if (r.rejectedAt) events.push({ at: new Date(r.rejectedAt), label: `${short} 반려`, who: r.rejectedByName, detail: r.rejectionReason, kind: "reject" });
  }
  for (const h of ov.history) {
    if (!h.actionAt) continue;
    events.push({ at: new Date(h.actionAt), label: `결재 이력: ${STATUS_LABEL[h.action] ?? h.action} (#${h.requestId})`, who: h.actionByName, detail: h.comments, kind: "history" });
  }
  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  const br = ov.batchRequest;

  return (
    <div className="space-y-4">
      {/* 공식 CCP 기록지 상태 */}
      <div className="rounded-lg border p-3">
        <div className="text-sm font-semibold mb-2">공식 CCP 기록지</div>
        {ov.forms.length === 0 ? (
          <p className="text-sm text-muted-foreground">기록지가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-1">CCP</th>
                <th className="text-left py-1">기록지 상태</th>
                <th className="text-right py-1">행</th>
                <th className="text-right py-1">이탈</th>
                <th className="text-left py-1 pl-3">승인 요청</th>
              </tr>
            </thead>
            <tbody>
              {(ov.forms as FormView[]).map((f: FormView) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="py-1.5">
                    <span className="font-mono text-xs">{f.ccpType}</span>
                    {CCP_TYPE_LABEL[f.ccpType] && <span className="text-xs text-muted-foreground ml-1">{CCP_TYPE_LABEL[f.ccpType]}</span>}
                    {f.isDaily && <span className="text-[10px] text-muted-foreground ml-1">(일일 통합 {f.workDate})</span>}
                  </td>
                  <td className="py-1.5"><Badge variant={STATUS_VARIANT[f.status] ?? "outline"} className="text-xs">{STATUS_LABEL[f.status] ?? f.status}</Badge></td>
                  <td className="py-1.5 text-right font-mono">{f.rowCount}</td>
                  <td className={`py-1.5 text-right font-mono ${f.deviationCount > 0 ? "text-red-600 font-semibold" : ""}`}>{f.deviationCount}</td>
                  <td className="py-1.5 pl-3 text-xs">
                    {f.approvalStatus ? (STATUS_LABEL[f.approvalStatus] ?? f.approvalStatus) : <span className="text-muted-foreground">요청 없음</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 배치 승인 요청 + 버튼 */}
      {ov.decision === "approved" && br ? (
        <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">승인 완료</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {br.approvedByName ?? "-"} · {fmt(br.approvedAt)} · 요청 #{br.id}
          </p>
        </div>
      ) : ov.decision === "rejected" && br ? (
        <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-1">
            <XCircle className="h-5 w-5" />
            <span className="font-semibold">반려됨</span>
          </div>
          <p className="text-sm">{br.rejectionReason ?? "-"}</p>
          <p className="text-xs text-muted-foreground mt-1">{br.rejectedByName ?? "-"} · {fmt(br.rejectedAt)} · 요청 #{br.id}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className={`p-3 rounded-lg border text-sm ${ov.canApprove ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" : "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800"}`}>
            <div className="font-semibold mb-1 flex items-center gap-2">
              {br ? (
                <>
                  {batchLabel} 승인 요청 #{br.id}
                  <Badge variant={STATUS_VARIANT[br.status] ?? "outline"} className="text-xs">{STATUS_LABEL[br.status] ?? br.status}</Badge>
                </>
              ) : (
                <>{batchLabel} 승인 요청 없음</>
              )}
            </div>
            {ov.canApprove ? (
              <p className="text-xs text-muted-foreground">모든 기록지가 제출됐고 이탈이 없습니다. 승인할 수 있습니다.</p>
            ) : (
              <ul className="list-disc list-inside text-xs space-y-0.5">
                {(ov.blockers as string[]).map((b: string, i: number) => <li key={i}>{b}</li>)}
              </ul>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button
              className="bg-green-600 hover:bg-green-700"
              disabled={!ov.canApprove || approveMutation.isPending}
              onClick={() => { if (confirm(`${batchLabel} 승인 요청을 승인하시겠습니까?`)) approveMutation.mutate({ batchId }); }}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {approveMutation.isPending ? "승인 중..." : "승인"}
            </Button>
            <Button
              variant="destructive"
              disabled={!br || ov.decision !== "pending" || rejectMutation.isPending}
              onClick={() => {
                const reason = prompt("반려 사유를 입력해주세요:");
                if (reason && reason.trim()) rejectMutation.mutate({ batchId, rejectionReason: reason.trim() });
                else if (reason !== null) toast.error("반려 사유를 입력해주세요");
              }}
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              반려
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard/approval")}>
              승인관리로 이동
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">* 승인관리 화면의 "승인"과 같은 처리입니다. 기록지 승인은 각 기록지 요청에서 따로 합니다.</p>
        </div>
      )}

      {/* 승인 이력 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="h-4 w-4" />
            승인 이력
          </CardTitle>
          <CardDescription>이 {batchLabel}의 승인 요청과 기록지 요청의 등록·검토·승인·반려</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">승인 이력이 없습니다.</p>
          ) : (
            <ol className="relative border-l pl-4 space-y-3">
              {events.map((e, i) => (
                <li key={i} className="text-sm">
                  <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${e.kind === "approve" ? "bg-green-500" : e.kind === "reject" ? "bg-red-500" : e.kind === "review" ? "bg-blue-500" : "bg-gray-400"}`} />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{e.label}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{fmt(e.at)}</span>
                    {e.who && <span className="text-xs text-muted-foreground">· {e.who}</span>}
                  </div>
                  {e.detail && <div className="text-xs text-muted-foreground mt-0.5">{e.detail}</div>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
