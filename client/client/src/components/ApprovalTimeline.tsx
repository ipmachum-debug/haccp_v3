import { trpc } from "@/lib/trpc";
import { CheckCircle2, AlertTriangle, Clock } from "lucide-react";

interface ApprovalTimelineProps {
  batchId: number;
}

export default function ApprovalTimeline({ batchId }: ApprovalTimelineProps) {
  const { data: approvals, isLoading } = trpc.batch.getApprovals.useQuery({ batchId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Clock className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">로딩 중...</span>
      </div>
    );
  }

  if (!approvals || approvals.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        승인 이력이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {approvals.map((approval: any, index: number) => (
        <div key={approval.id} className="flex gap-4">
          {/* 타임라인 아이콘 */}
          <div className="flex flex-col items-center">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${
                approval.status === "approved"
                  ? "border-green-500 bg-green-50 dark:bg-green-950"
                  : approval.status === "rejected"
                  ? "border-red-500 bg-red-50 dark:bg-red-950"
                  : "border-yellow-500 bg-yellow-50 dark:bg-yellow-950"
              }`}
            >
              {approval.status === "approved" ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              ) : approval.status === "rejected" ? (
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              ) : (
                <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              )}
            </div>
            {index < approvals.length - 1 && (
              <div className="h-full w-0.5 bg-border mt-2" />
            )}
          </div>

          {/* 승인 정보 */}
          <div className="flex-1 pb-8">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold">
                {approval.status === "approved"
                  ? "승인 완료"
                  : approval.status === "rejected"
                  ? "반려"
                  : "승인 대기"}
              </span>
              <span className="text-xs text-muted-foreground">
                {approval.approvalDate
                  ? new Date(approval.approvalDate).toLocaleString("ko-KR")
                  : new Date(approval.createdAt).toLocaleString("ko-KR")}
              </span>
            </div>

            {approval.approverName && (
              <div className="text-sm text-muted-foreground">
                승인자: {approval.approverName}
              </div>
            )}

            {approval.rejectionReason && (
              <div className="mt-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-sm">
                <div className="font-semibold text-red-700 dark:text-red-400 mb-1">
                  반려 사유
                </div>
                <div>{approval.rejectionReason}</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
