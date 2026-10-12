/**
 * /dashboard/ccp/:id — CCP 점검 기록 단건 상세
 *
 * 배치 상세의 CCP 탭과 같은 설비별 카드(CcpInspectionCard)를 쓴다.
 * 이전에는 온도/시간/압력 3칸짜리 범용 폼이었고, 설비명·가열시간·배치 총소요시간·배치 번호를
 * 보여주지 못했다(자동 생성 설비행은 measured_at 이 없어 "측정 시각 -" 로만 보였음).
 */
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CcpInspectionCard } from "@/components/ccp/CcpInspectionCard";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Boxes, CheckCircle2, Loader2, UserCheck } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";
import confetti from "canvas-confetti";

const CCP_LIST_PATH = "/quality/ccp-monitoring";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성중",
  submitted: "제출됨",
  approved: "승인됨",
  rejected: "반려됨",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  rejected: "destructive",
};

const CCP_TYPE_LABEL: Record<string, string> = {
  "CCP-1B": "교반/증숙",
  "CCP-2B": "오븐굽기",
  "CCP-3B": "냉각",
  "CCP-4P": "금속검출",
};

function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" });
}

export default function CcpInspection() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const instanceId = params.id ? parseInt(params.id, 10) : 0;

  const { data: detail, isLoading, refetch } = trpc.ccp.getInstanceDetail.useQuery(
    { instanceId },
    { enabled: !!instanceId }
  );

  type DetailRow = { rowType: string; result?: string | null; equipmentId?: number | null };
  const measurementRows: DetailRow[] = ((detail?.rows ?? []) as DetailRow[]).filter((r) => r.rowType === "measurement");
  const judgedCount = measurementRows.filter((r) => r.result === "PASS" || r.result === "FAIL").length;
  const equipmentCount = new Set(measurementRows.filter((r) => r.equipmentId != null).map((r) => r.equipmentId)).size;
  const canSubmit = detail?.status === "draft" || detail?.status === "rejected";

  const updateStatusMutation = trpc.ccp.updateStatus.useMutation({
    onSuccess: () => {
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"],
      });
      toast.success("CCP 점검이 제출되었습니다");
      setLocation(CCP_LIST_PATH);
    },
    onError: (error: { message: string }) => {
      toast.error(`제출 실패: ${error.message}`);
    },
  });

  const requestReviewMutation = trpc.approval.requestCcpReview.useMutation({
    onSuccess: () => {
      toast.success("CCP 검토 요청이 전송되었습니다");
    },
    onError: (error: { message: string }) => {
      toast.error(`검토 요청 실패: ${error.message}`);
    },
  });

  const handleSubmit = () => {
    if (measurementRows.length === 0) {
      toast.error("점검 행이 없습니다. 설비 측정값을 먼저 입력해주세요");
      return;
    }
    if (judgedCount === 0) {
      toast.error("판정(PASS/FAIL)이 하나도 없습니다. 측정값을 입력하고 저장해주세요");
      return;
    }
    updateStatusMutation.mutate({ instanceId, status: "submitted" });
  };

  const handleRequestReview = () => {
    if (!detail) return;
    requestReviewMutation.mutate({
      ccpInstanceId: instanceId,
      title: `CCP 점검 검토 요청 — ${detail.productName ?? "제품 미지정"} ${detail.ccpType}`,
      description: `배치 ${detail.batchCode ?? "-"} · 작업일 ${fmtDate(detail.workDate)} · 판정 ${judgedCount}/${measurementRows.length}건`,
      priority: "high" as const,
    });
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:gap-6">
        {/* 헤더 */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-4">
            <Button variant="outline" size="icon" onClick={() => setLocation(CCP_LIST_PATH)} title="CCP 기록 목록">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 flex-wrap">
                {detail ? (detail.productName ?? "제품 미지정") : "CCP 점검 기록"}
                {detail && (
                  <>
                    <Badge variant="outline" className="font-mono text-xs">
                      {detail.ccpType}
                      {CCP_TYPE_LABEL[detail.ccpType] ? ` ${CCP_TYPE_LABEL[detail.ccpType]}` : ""}
                    </Badge>
                    <Badge variant={STATUS_VARIANT[detail.status] ?? "outline"} className="text-xs">
                      {STATUS_LABEL[detail.status] ?? detail.status}
                    </Badge>
                  </>
                )}
              </h1>
              {detail && (
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-x-3 gap-y-1 flex-wrap">
                  <span>작업일 {fmtDate(detail.workDate)}</span>
                  {detail.batchId && (
                    <Link href={`/dashboard/batch/${detail.batchId}`} className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                      <Boxes className="h-3.5 w-3.5" />
                      배치 {detail.batchCode ?? `#${detail.batchId}`}
                    </Link>
                  )}
                  {detail.processGroupName && <span>공정 {detail.processGroupName}</span>}
                  {equipmentCount > 0 && <span>설비 {equipmentCount}대</span>}
                  <span>
                    판정 {judgedCount}/{measurementRows.length}건
                  </span>
                  <span className="text-gray-400">#{detail.id}</span>
                </p>
              )}
            </div>
          </div>
          {detail && (
            <div className="flex gap-2">
              <Button onClick={handleSubmit} disabled={!canSubmit || updateStatusMutation.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {updateStatusMutation.isPending ? "제출 중..." : canSubmit ? "점검 완료 및 제출" : STATUS_LABEL[detail.status]}
              </Button>
              {measurementRows.length > 0 && (
                <Button
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleRequestReview}
                  disabled={requestReviewMutation.isPending}
                >
                  <UserCheck className="mr-2 h-4 w-4" />
                  검토 요청
                </Button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            불러오는 중...
          </div>
        ) : !detail ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <p>CCP 기록 #{instanceId} 을(를) 찾을 수 없습니다.</p>
              <p className="text-xs mt-1">삭제되었거나 다른 사업장의 기록일 수 있습니다.</p>
              <Button variant="outline" className="mt-4" onClick={() => setLocation(CCP_LIST_PATH)}>
                목록으로
              </Button>
            </CardContent>
          </Card>
        ) : (
          <CcpInspectionCard ccp={detail} onRecordSaved={() => void refetch()} defaultExpanded />
        )}
      </div>
    </DashboardLayout>
  );
}
