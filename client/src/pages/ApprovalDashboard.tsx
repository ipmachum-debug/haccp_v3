import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, Clock, FileText, Eye, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { CcpInspectionCard } from "@/components/CcpInspectionCard";
import { toast } from "sonner";

export default function ApprovalDashboard() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "pending_review" | "approved" | "rejected">("pending");
  const [selectedApproval, setSelectedApproval] = useState<any>(null);

  // 승인 대기 항목 조회
  const { data: pendingApprovals, isLoading, refetch } = trpc.approval.getPendingApprovals.useQuery();

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">로딩 중...</div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" />대기 중</Badge>;
      case "pending_review":
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200"><Eye className="h-3 w-3 mr-1" />검토 대기</Badge>;
      case "approved":
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="h-3 w-3 mr-1" />승인됨</Badge>;
      case "rejected":
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" />반려됨</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "batch":
        return <Badge variant="secondary">배치 승인</Badge>;
      case "batch_production":
        return <Badge className="bg-indigo-100 text-indigo-800">배치 CCP</Badge>;
      case "batch_completion":
        return <Badge className="bg-purple-100 text-purple-800">생산완료</Badge>;
      case "inventory_adjustment":
        return <Badge variant="secondary">재고 조정</Badge>;
      case "ccp_review":
        return <Badge variant="secondary">CCP 검토</Badge>;
      case "mfr":
        return <Badge variant="secondary">품목제조보고</Badge>;
      default:
        return <Badge variant="secondary">{type}</Badge>;
    }
  };

  const handleViewDetail = (type: string, referenceId: number, approval?: any) => {
    switch (type) {
      case "batch":
        setLocation(`/dashboard/batch/${referenceId}`);
        break;
      case "batch_production":
      case "batch_completion":
        if (approval) {
          setSelectedApproval(approval);
        } else {
          setLocation(`/dashboard/batch/${referenceId}`);
        }
        break;
      case "inventory_adjustment":
        setLocation(`/dashboard/inventory/adjustments/${referenceId}`);
        break;
      case "ccp_review":
        setLocation(`/quality/ccp-monitoring`);
        break;
      case "mfr":
        setLocation(`/dashboard/mf-reports/${referenceId}`);
        break;
      default:
        break;
    }
  };

  // 필터링된 승인 항목
  const filteredApprovals = pendingApprovals?.filter((approval: any) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "pending") return approval.status === "pending" || approval.status === "pending_review";
    return approval.status === statusFilter;
  }) || [];

  // 통계 계산
  const stats = {
    total: pendingApprovals?.length || 0,
    pending: pendingApprovals?.filter((a: any) => a.status === "pending" || a.status === "pending_review").length || 0,
    approved: pendingApprovals?.filter((a: any) => a.status === "approved").length || 0,
    rejected: pendingApprovals?.filter((a: any) => a.status === "rejected").length || 0,
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">승인 워크플로우 대시보드</h1>
            <p className="text-muted-foreground mt-2">
              승인 대기 중인 항목을 한눈에 확인하고 관리하세요
            </p>
          </div>
          <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="상태 필터" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="pending">대기 중 (전체)</SelectItem>
              <SelectItem value="pending_review">검토 대기</SelectItem>
              <SelectItem value="approved">승인됨</SelectItem>
              <SelectItem value="rejected">반려됨</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                전체 항목
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                대기 중
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.pending}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                승인됨
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.approved}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                반려됨
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.rejected}건</div>
            </CardContent>
          </Card>
        </div>

        {/* 승인 항목 테이블 */}
        <Card>
          <CardHeader>
            <CardTitle>승인 항목 목록</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredApprovals.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                승인 대기 항목이 없습니다
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>유형</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>요청자</TableHead>
                    <TableHead>요청일시</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredApprovals.map((approval: any) => (
                    <TableRow key={`${approval.type}-${approval.id}`}>
                      <TableCell>{getTypeBadge(approval.type)}</TableCell>
                      <TableCell className="font-medium">{approval.title}</TableCell>
                      <TableCell>{approval.requesterName}</TableCell>
                      <TableCell>{new Date(approval.createdAt).toLocaleString("ko-KR")}</TableCell>
                      <TableCell>{getStatusBadge(approval.status)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetail(approval.type, approval.referenceId || approval.id, approval)}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          {(approval.type === "batch_production" || approval.type === "batch_completion") ? "CCP 확인" : "상세보기"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {/* CCP 기록지 인라인 다이얼로그 */}
        <ApprovalCcpDialog
          approval={selectedApproval}
          onClose={() => setSelectedApproval(null)}
          onActionComplete={() => {
            setSelectedApproval(null);
            refetch();
          }}
        />
      </div>
    </DashboardLayout>
  );
}

function ApprovalCcpDialog({ approval, onClose, onActionComplete }: { approval: any; onClose: () => void; onActionComplete: () => void }) {
  const batchId = approval?.referenceId;
  const approvalRequestId = approval?.id;
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectInput, setShowRejectInput] = useState(false);

  // CCP 인스턴스 조회 (ccp.getByBatchId - 올바른 엔드포인트 사용)
  const { data: ccpList } = trpc.ccp.getByBatchId.useQuery(
    { batchId: batchId! },
    { enabled: !!batchId && !!approval }
  );

  // 승인 처리 mutation
  const approveMutation = trpc.approval.approve.useMutation({
    onSuccess: () => {
      toast.success("승인 처리되었습니다");
      onActionComplete();
    },
    onError: (error) => {
      toast.error(`승인 실패: ${error.message}`);
    },
  });

  // 반려 처리 mutation
  const rejectMutation = trpc.approval.reject.useMutation({
    onSuccess: () => {
      toast.success("반려 처리되었습니다");
      setRejectReason("");
      setShowRejectInput(false);
      onActionComplete();
    },
    onError: (error) => {
      toast.error(`반려 실패: ${error.message}`);
    },
  });

  const isPending = approval?.status === "pending" || approval?.status === "pending_review";

  const handleApprove = () => {
    if (!approvalRequestId) return;
    if (confirm("이 승인 요청을 승인하시겠습니까?")) {
      approveMutation.mutate({ requestId: approvalRequestId, notes: "승인 완료" });
    }
  };

  const handleReject = () => {
    if (!approvalRequestId) return;
    if (!rejectReason.trim()) {
      toast.error("반려 사유를 입력해주세요");
      return;
    }
    rejectMutation.mutate({ requestId: approvalRequestId, rejectionReason: rejectReason.trim() });
  };

  const handlePrint = () => {
    if (batchId) {
      window.open(`/print-preview/${batchId}`, "_blank");
    }
  };

  return (
    <Dialog open={!!approval} onOpenChange={(open) => { if (!open) { onClose(); setShowRejectInput(false); setRejectReason(""); } }}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{approval?.title || "배치 CCP 기록지 확인"}</span>
            {approval?.status && getStatusBadgeInline(approval.status)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {approval?.description && (
            <div className="text-sm text-muted-foreground whitespace-pre-line bg-muted/50 p-3 rounded">
              {approval.description}
            </div>
          )}
          {ccpList && ccpList.length > 0 ? (
            ccpList.map((ccp: any) => (
              <CcpInspectionCard key={ccp.id} ccp={ccp} onRecordSaved={() => {}} />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {ccpList === undefined ? "로딩 중..." : "CCP 기록지가 없습니다"}
            </div>
          )}

          {/* 반려 사유 입력 */}
          {showRejectInput && (
            <div className="space-y-2 p-3 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
              <label className="text-sm font-medium text-red-700 dark:text-red-400">반려 사유</label>
              <Textarea
                placeholder="반려 사유를 입력하세요..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          )}
        </div>
        <DialogFooter className="flex gap-2">
          {isPending && (
            <>
              <Button
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={handleApprove}
                disabled={approveMutation.isPending}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {approveMutation.isPending ? "승인 중..." : "승인"}
              </Button>
              {showRejectInput ? (
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={rejectMutation.isPending}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  {rejectMutation.isPending ? "반려 중..." : "반려 확인"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setShowRejectInput(true)}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  반려
                </Button>
              )}
            </>
          )}
          {approval?.status === "approved" && (
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              인쇄
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function getStatusBadgeInline(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200 ml-2"><Clock className="h-3 w-3 mr-1" />대기 중</Badge>;
    case "pending_review":
      return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 ml-2"><Eye className="h-3 w-3 mr-1" />검토 대기</Badge>;
    case "approved":
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 ml-2"><CheckCircle className="h-3 w-3 mr-1" />승인됨</Badge>;
    case "rejected":
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 ml-2"><XCircle className="h-3 w-3 mr-1" />반려됨</Badge>;
    default:
      return <Badge variant="outline" className="ml-2">{status}</Badge>;
  }
}
