import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";


export default function ApprovalPendingWidget() {

  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");

  // 승인 대기 목록 조회 (30초마다 자동 새로고침)
  const { data: pendingRequests, isLoading, refetch } = trpc.approval.list.useQuery(
    { status: "pending" },
    { refetchInterval: 30000 }
  );

  // 승인 처리
  const approveMutation = trpc.approval.approve.useMutation({
    onSuccess: () => {
      alert("승인이 완료되었습니다.");
      setIsDialogOpen(false);
      setNotes("");
      refetch();
    },
    onError: (error: any) => {
      alert(`승인 실패: ${error.message}`);
    },
  });

  // 거부 처리
  const rejectMutation = trpc.approval.reject.useMutation({
    onSuccess: () => {
      alert("거부가 완료되었습니다.");
      setIsDialogOpen(false);
      setRejectionReason("");
      refetch();
    },
    onError: (error: any) => {
      alert(`거부 실패: ${error.message}`);
    },
  });

  const handleApprove = () => {
    if (!selectedRequest) return;
    approveMutation.mutate({
      requestId: selectedRequest.id,
      notes,
    });
  };

  const handleReject = () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      alert("거부 사유를 입력해주세요.");
      return;
    }
    rejectMutation.mutate({
      requestId: selectedRequest.id,
      rejectionReason,
    });
  };

  const openDialog = (request: any) => {
    setSelectedRequest(request);
    setIsDialogOpen(true);
  };

  const getRequestTypeName = (type: string) => {
    const typeMap: Record<string, string> = {
      batch_approval: "배치 승인",
      ccp_review: "CCP 검토",
    };
    return typeMap[type] || type;
  };

  const getPriorityColor = (priority: string) => {
    const colorMap: Record<string, string> = {
      urgent: "destructive",
      high: "destructive",
      medium: "default",
      low: "secondary",
    };
    return colorMap[priority] || "default";
  };

  const getPriorityName = (priority: string) => {
    const nameMap: Record<string, string> = {
      urgent: "긴급",
      high: "높음",
      medium: "보통",
      low: "낮음",
    };
    return nameMap[priority] || priority;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>승인 대기 목록</CardTitle>
              <CardDescription>검토가 필요한 승인 요청</CardDescription>
            </div>
            <Badge variant="default" className="text-lg px-3 py-1">
              {pendingRequests?.length || 0}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : pendingRequests && pendingRequests.length > 0 ? (
            <div className="space-y-3">
              {pendingRequests.map((request: any) => (
                <div
                  key={request.id}
                  className="p-4 rounded-lg border bg-accent/50 hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => openDialog(request)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{getRequestTypeName(request.requestType)}</Badge>
                        <Badge variant={getPriorityColor(request.priority || "medium") as any}>
                          {getPriorityName(request.priority || "medium")}
                        </Badge>
                      </div>
                      <p className="font-medium">{request.title}</p>
                      {request.description && (
                        <p className="text-sm text-muted-foreground">{request.description}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>
                          {request.requestedAt
                            ? format(new Date(request.requestedAt), "yyyy-MM-dd HH:mm", {
                                locale: ko,
                              })
                            : "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">승인 대기 중인 요청이 없습니다.</div>
          )}
        </CardContent>
      </Card>

      {/* 승인 상세 모달 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>승인 요청 상세</DialogTitle>
            <DialogDescription>승인 또는 거부를 선택하고 코멘트를 입력하세요.</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{getRequestTypeName(selectedRequest.requestType)}</Badge>
                  <Badge variant={getPriorityColor(selectedRequest.priority || "medium") as any}>
                    {getPriorityName(selectedRequest.priority || "medium")}
                  </Badge>
                </div>
                <h3 className="text-lg font-semibold">{selectedRequest.title}</h3>
                {selectedRequest.description && (
                  <p className="text-sm text-muted-foreground">{selectedRequest.description}</p>
                )}
                <div className="text-xs text-muted-foreground">
                  요청 시간:{" "}
                  {selectedRequest.requestedAt
                    ? format(new Date(selectedRequest.requestedAt), "yyyy-MM-dd HH:mm", {
                        locale: ko,
                      })
                    : "-"}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">승인 코멘트 (선택)</label>
                <Textarea
                  placeholder="승인 시 추가할 코멘트를 입력하세요..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">거부 사유 (거부 시 필수)</label>
                <Textarea
                  placeholder="거부 사유를 입력하세요..."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              <XCircle className="mr-2 h-4 w-4" />
              거부
            </Button>
            <Button onClick={handleApprove} disabled={approveMutation.isPending}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              승인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
