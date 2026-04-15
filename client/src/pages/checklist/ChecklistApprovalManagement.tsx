import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { CheckCircle, XCircle, Eye, FileText, Calendar, User } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

/**
 * 체크리스트 승인 관리 페이지
 * 제출된 체크리스트를 승인/반려
 */

export default function ChecklistApprovalManagement() {
  const { toast } = useToast();
  const [selectedInstance, setSelectedInstance] = useState<any>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // 승인 대기 목록 조회
  const { data: pendingInstances = [], refetch } = trpc.checklistInstance.list.useQuery({
    status: "pending_review",
  });

  // 인스턴스 상세 조회
  const instanceDetail = trpc.checklistInstance.getById.useQuery(
    { id: selectedInstance?.id || 0 },
    { enabled: !!selectedInstance && isDetailDialogOpen }
  );

  // Mutations
  const approveMutation = trpc.checklistInstance.approve.useMutation({
    onSuccess: () => {
      toast({ title: "승인되었습니다." });
      refetch();
      setIsDetailDialogOpen(false);
      setSelectedInstance(null);
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = trpc.checklistInstance.reject.useMutation({
    onSuccess: () => {
      toast({ title: "반려되었습니다." });
      refetch();
      setIsRejectDialogOpen(false);
      setSelectedInstance(null);
      setRejectReason("");
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const handleApprove = (instance: any) => {
    if (confirm("승인하시겠습니까?")) {
      approveMutation.mutate({ id: instance.id });
    }
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast({ title: "오류", description: "반려 사유를 입력해주세요.", variant: "destructive" });
      return;
    }

    rejectMutation.mutate({
      id: selectedInstance.id,
      reason: rejectReason,
    });
  };

  const openDetailDialog = (instance: any) => {
    setSelectedInstance(instance);
    setIsDetailDialogOpen(true);
  };

  const openRejectDialog = (instance: any) => {
    setSelectedInstance(instance);
    setIsRejectDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: any }> = {
      pending: { label: "작성 대기", variant: "secondary" },
      in_progress: { label: "작성 중", variant: "default" },
      pending_review: { label: "승인 대기", variant: "default" },
      approved: { label: "승인 완료", variant: "default" },
      rejected: { label: "반려", variant: "destructive" },
      completed: { label: "완료", variant: "default" },
    };
    const config = statusMap[status] || { label: status, variant: "secondary" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-3xl font-bold">체크리스트 승인 관리</h1>
        <p className="text-muted-foreground mt-1">
          제출된 체크리스트를 검토하고 승인/반려합니다
        </p>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">승인 대기</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingInstances.length}건</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">오늘 승인</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0건</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">오늘 반려</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">0건</div>
          </CardContent>
        </Card>
      </div>

      {/* 승인 대기 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>승인 대기 목록</CardTitle>
          <CardDescription>제출된 체크리스트를 확인하고 처리하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {pendingInstances.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                승인 대기 중인 체크리스트가 없습니다.
              </div>
            ) : (
              pendingInstances.map((instance: any) => (
                <div key={instance.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{instance.template?.name || "템플릿 없음"}</h3>
                        {getStatusBadge(instance.status)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {instance.template?.description || ""}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span>
                            기간: {instance.periodKey}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          <span>작성자: {instance.createdBy}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          <span>
                            제출일: {instance.submittedAt ? format(new Date(instance.submittedAt), "yyyy-MM-dd HH:mm", { locale: ko }) : "-"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDetailDialog(instance)}
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        상세
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleApprove(instance)}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        승인
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => openRejectDialog(instance)}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        반려
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 상세 보기 다이얼로그 */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>체크리스트 상세</DialogTitle>
            <DialogDescription>
              {selectedInstance?.template?.name || ""}
            </DialogDescription>
          </DialogHeader>

          {instanceDetail.data && (
            <div className="space-y-4">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">기간</div>
                  <div className="font-medium">{instanceDetail.data.periodKey}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">상태</div>
                  <div>{getStatusBadge(instanceDetail.data.status)}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">작성자</div>
                  <div className="font-medium">{instanceDetail.data.createdBy}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">제출일</div>
                  <div className="font-medium">
                    {instanceDetail.data.submittedAt
                      ? format(new Date(instanceDetail.data.submittedAt), "yyyy-MM-dd HH:mm", { locale: ko })
                      : "-"}
                  </div>
                </div>
              </div>

              {/* 작성 내용 */}
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-3">작성 내용</h4>
                <div className="space-y-3">
                  {instanceDetail.data.data && Object.entries(instanceDetail.data.data).map(([key, value]) => (
                    <div key={key} className="grid grid-cols-3 gap-2 text-sm">
                      <div className="text-muted-foreground">{key}</div>
                      <div className="col-span-2 font-medium">{String(value)}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 첨부파일 */}
              {instanceDetail.data.attachments && instanceDetail.data.attachments.length > 0 && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-3">첨부파일</h4>
                  <div className="space-y-2">
                    {instanceDetail.data.attachments.map((file: any, index: number) => (
                      <div key={index} className="flex items-center gap-2 text-sm">
                        <FileText className="w-4 h-4" />
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {file.fileName}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
              닫기
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setIsDetailDialogOpen(false);
                handleApprove(selectedInstance);
              }}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              승인
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setIsDetailDialogOpen(false);
                openRejectDialog(selectedInstance);
              }}
            >
              <XCircle className="w-4 h-4 mr-2" />
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 반려 다이얼로그 */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>체크리스트 반려</DialogTitle>
            <DialogDescription>
              반려 사유를 입력해주세요. 작성자에게 전달됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rejectReason">반려 사유 *</Label>
              <Textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="반려 사유를 상세히 입력해주세요"
                rows={5}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRejectDialogOpen(false);
                setRejectReason("");
              }}
            >
              취소
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
