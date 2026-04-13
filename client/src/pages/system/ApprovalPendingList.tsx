import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";

export default function ApprovalPendingList() {
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "cancelled" | undefined>("pending");
  const [requestTypeFilter, setRequestTypeFilter] = useState<string | undefined>(undefined);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  // 승인 요청 목록 조회
  const { data: requests = [], isLoading, refetch } = trpc.approval.list.useQuery({
    status: statusFilter,
    requestType: requestTypeFilter,
  });

  // 승인 처리
  const approveMutation = trpc.approval.approve.useMutation({
    onSuccess: () => {
      toast.success("승인이 완료되었습니다.");
      setIsApproveDialogOpen(false);
      setApproveNotes("");
      setSelectedRequest(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`승인 실패: ${error.message}`);
    },
  });

  // 거부 처리
  const rejectMutation = trpc.approval.reject.useMutation({
    onSuccess: () => {
      toast.success("거부가 완료되었습니다.");
      setIsRejectDialogOpen(false);
      setRejectReason("");
      setSelectedRequest(null);
      refetch();
    },
    onError: (error: any) => {
      toast.error(`거부 실패: ${error.message}`);
    },
  });

  // 승인 처리 핸들러
  const handleApprove = () => {
    if (!selectedRequest) return;
    approveMutation.mutate({
      requestId: selectedRequest.id,
      notes: approveNotes || undefined,
    });
  };

  // 거부 처리 핸들러
  const handleReject = () => {
    if (!selectedRequest || !rejectReason.trim()) {
      toast.error("거부 사유를 입력해주세요.");
      return;
    }
    rejectMutation.mutate({
      requestId: selectedRequest.id,
      rejectionReason: rejectReason,
    });
  };

  // 상태 뱃지 렌더링
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
            <Clock className="w-3 h-3 mr-1" />
            대기 중
          </Badge>
        );
      case "approved":
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            승인됨
          </Badge>
        );
      case "rejected":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
            <XCircle className="w-3 h-3 mr-1" />
            거부됨
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
            취소됨
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // 우선순위 뱃지 렌더링
  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return (
          <Badge variant="destructive" className="bg-red-600">
            <AlertCircle className="w-3 h-3 mr-1" />
            긴급
          </Badge>
        );
      case "high":
        return (
          <Badge variant="destructive" className="bg-orange-600">
            높음
          </Badge>
        );
      case "medium":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
            중간
          </Badge>
        );
      case "low":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-300">
            낮음
          </Badge>
        );
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  // 요청 유형 한글 변환
  const getRequestTypeLabel = (requestType: string) => {
    const labels: Record<string, string> = {
      batch_approval: "배치 승인",
      inventory_adjustment: "재고 조정",
      material_inspection: "원재료 검사",
      hygiene_inspection: "위생 점검",
      document_approval: "문서 승인",
      recipe_change: "레시피 변경",
      ccp_deviation: "CCP 이탈",
      ccp_review: "CCP 검토",
    };
    return labels[requestType] || requestType;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">승인 관리</h1>
          <p className="text-muted-foreground mt-2">승인 요청을 검토하고 처리합니다.</p>
        </div>

        {/* 필터 */}
        <Card>
          <CardHeader>
            <CardTitle>필터</CardTitle>
            <CardDescription>승인 요청을 필터링합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>상태</Label>
                <Select
                  value={statusFilter || "all"}
                  onValueChange={(value) => setStatusFilter(value === "all" ? undefined : value as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="pending">대기 중</SelectItem>
                    <SelectItem value="approved">승인됨</SelectItem>
                    <SelectItem value="rejected">거부됨</SelectItem>
                    <SelectItem value="cancelled">취소됨</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>요청 유형</Label>
                <Select
                  value={requestTypeFilter || "all"}
                  onValueChange={(value) => setRequestTypeFilter(value === "all" ? undefined : value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="batch_approval">배치 승인</SelectItem>
                    <SelectItem value="inventory_adjustment">재고 조정</SelectItem>
                    <SelectItem value="material_inspection">원재료 검사</SelectItem>
                    <SelectItem value="hygiene_inspection">위생 점검</SelectItem>
                    <SelectItem value="document_approval">문서 승인</SelectItem>
                    <SelectItem value="recipe_change">레시피 변경</SelectItem>
                    <SelectItem value="ccp_deviation">CCP 이탈</SelectItem>
                    <SelectItem value="ccp_review">CCP 검토</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 승인 요청 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>승인 요청 목록</CardTitle>
            <CardDescription>
              {isLoading ? "로딩 중..." : `총 ${requests.length}개의 요청`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : requests.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">승인 요청이 없습니다.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">ID</th>
                      <th className="text-left p-3 font-medium">제목</th>
                      <th className="text-left p-3 font-medium">요청 유형</th>
                      <th className="text-left p-3 font-medium">우선순위</th>
                      <th className="text-left p-3 font-medium">상태</th>
                      <th className="text-left p-3 font-medium">요청 일시</th>
                      <th className="text-left p-3 font-medium">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((request: any) => (
                      <tr key={request.id} className="border-b hover:bg-muted/50">
                        <td className="p-3">{request.id}</td>
                        <td className="p-3 font-medium">{request.title}</td>
                        <td className="p-3">{getRequestTypeLabel(request.requestType)}</td>
                        <td className="p-3">{getPriorityBadge(request.priority)}</td>
                        <td className="p-3">{getStatusBadge(request.status)}</td>
                        <td className="p-3">
                          {new Date(request.requestedAt).toLocaleString("ko-KR")}
                        </td>
                        <td className="p-3">
                          {request.status === "pending" && (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setIsApproveDialogOpen(true);
                                }}
                              >
                                승인
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setSelectedRequest(request);
                                  setIsRejectDialogOpen(true);
                                }}
                              >
                                거부
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 승인 다이얼로그 */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>승인 확인</DialogTitle>
            <DialogDescription>
              "{selectedRequest?.title}" 요청을 승인하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>코멘트 (선택)</Label>
              <Textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                placeholder="승인 코멘트를 입력하세요..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleApprove} disabled={approveMutation.isPending}>
              {approveMutation.isPending ? "처리 중..." : "승인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 거부 다이얼로그 */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>거부 확인</DialogTitle>
            <DialogDescription>
              "{selectedRequest?.title}" 요청을 거부하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>거부 사유 (필수)</Label>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="거부 사유를 입력하세요..."
                rows={4}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending || !rejectReason.trim()}
            >
              {rejectMutation.isPending ? "처리 중..." : "거부"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
