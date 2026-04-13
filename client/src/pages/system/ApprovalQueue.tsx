import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, XCircle, Clock, FileText } from "lucide-react";
import { toast } from "sonner";

export default function ApprovalQueue() {
  const [selectedInstance, setSelectedInstance] = useState<number | null>(null);
  const [selectedInstances, setSelectedInstances] = useState<number[]>([]);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showBatchApproveDialog, setShowBatchApproveDialog] = useState(false);
  const [showBatchRejectDialog, setShowBatchRejectDialog] = useState(false);

  const utils = trpc.useUtils();
  const { data: pendingApprovals, isLoading } = trpc.qualityChecklist.getPendingApprovals.useQuery();

  const approveMutation = trpc.qualityChecklist.approveInstance.useMutation({
    onSuccess: () => {
      toast.success("체크리스트가 승인되었습니다");
      utils.qualityChecklist.getPendingApprovals.invalidate();
      setShowApproveDialog(false);
      setApprovalNotes("");
      setSelectedInstance(null);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const rejectMutation = trpc.qualityChecklist.rejectInstance.useMutation({
    onSuccess: () => {
      toast.success("체크리스트가 반려되었습니다");
      utils.qualityChecklist.getPendingApprovals.invalidate();
      setShowRejectDialog(false);
      setRejectionNotes("");
      setSelectedInstance(null);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const batchApproveMutation = trpc.qualityChecklist.batchApprove.useMutation({
    onSuccess: (data: any) => {
      toast.success(`${data.count}개 항목이 승인되었습니다`);
      utils.qualityChecklist.getPendingApprovals.invalidate();
      setShowBatchApproveDialog(false);
      setApprovalNotes("");
      setSelectedInstances([]);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const batchRejectMutation = trpc.qualityChecklist.batchReject.useMutation({
    onSuccess: (data: any) => {
      toast.success(`${data.count}개 항목이 반려되었습니다`);
      utils.qualityChecklist.getPendingApprovals.invalidate();
      setShowBatchRejectDialog(false);
      setRejectionNotes("");
      setSelectedInstances([]);
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const handleApprove = () => {
    if (!selectedInstance) return;
    approveMutation.mutate({ instanceId: selectedInstance, comments: approvalNotes });
  };

  const handleReject = () => {
    if (!selectedInstance) return;
    if (!rejectionNotes.trim()) {
      toast.error("반려 사유를 입력해주세요");
      return;
    }
    rejectMutation.mutate({ instanceId: selectedInstance, comments: rejectionNotes });
  };

  const handleBatchApprove = () => {
    if (selectedInstances.length === 0) {
      toast.error("선택된 항목이 없습니다");
      return;
    }
    batchApproveMutation.mutate({ instanceIds: selectedInstances, comments: approvalNotes });
  };

  const handleBatchReject = () => {
    if (selectedInstances.length === 0) {
      toast.error("선택된 항목이 없습니다");
      return;
    }
    if (!rejectionNotes.trim()) {
      toast.error("반려 사유를 입력해주세요");
      return;
    }
    batchRejectMutation.mutate({ instanceIds: selectedInstances, comments: rejectionNotes });
  };

  const toggleSelectInstance = (instanceId: number) => {
    setSelectedInstances(prev => 
      prev.includes(instanceId) 
        ? prev.filter(id => id !== instanceId)
        : [...prev, instanceId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedInstances.length === pendingApprovals?.length) {
      setSelectedInstances([]);
    } else {
      setSelectedInstances(pendingApprovals?.map((instance: any) => instance.id) || []);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4 md:py-8 px-4">
      <div className="space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
              승인 대기 목록
            </h1>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              내게 할당된 체크리스트를 검토하고 승인/반려할 수 있습니다
            </p>
          </div>
          {pendingApprovals && pendingApprovals.length > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAll}
                className="shrink-0"
              >
                {selectedInstances.length === pendingApprovals.length ? "선택 해제" : "전체 선택"}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => setShowBatchApproveDialog(true)}
                disabled={selectedInstances.length === 0}
                className="shrink-0"
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                일괄 승인 ({selectedInstances.length})
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBatchRejectDialog(true)}
                disabled={selectedInstances.length === 0}
                className="shrink-0"
              >
                <XCircle className="w-4 h-4 mr-1" />
                일괄 반려 ({selectedInstances.length})
              </Button>
            </div>
          )}
        </div>

        {!pendingApprovals || pendingApprovals.length === 0 ? (
          <Card>
            <CardContent className="py-8 md:py-12 text-center">
              <Clock className="w-12 h-12 md:w-16 md:h-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-base md:text-lg text-muted-foreground">승인 대기 중인 체크리스트가 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {pendingApprovals.map((instance: any) => (
              <Card key={instance.id} className="card-hover">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      <Checkbox
                        checked={selectedInstances.includes(instance.id)}
                        onCheckedChange={() => toggleSelectInstance(instance.id)}
                        className="mt-1"
                      />
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                          <FileText className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
                          <span className="truncate">체크리스트 #{instance.id}</span>
                        </CardTitle>
                        <CardDescription className="text-xs md:text-sm mt-1">
                          예정일: {instance.targetDate ? new Date(instance.targetDate).toLocaleDateString() : "-"}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className="flex items-center gap-1 self-start shrink-0">
                      <Clock className="w-3 h-3" />
                      승인 대기
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-xs md:text-sm">
                      <div>
                        <span className="text-muted-foreground">작성일:</span>
                        <p className="font-medium truncate">
                          {instance.createdAt ? new Date(instance.createdAt).toLocaleDateString() : "-"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">완료일:</span>
                        <p className="font-medium truncate">
                          {instance.completedAt ? new Date(instance.completedAt).toLocaleString() : "-"}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        onClick={() => {
                          setSelectedInstance(instance.id);
                          setShowApproveDialog(true);
                        }}
                        className="flex-1"
                        variant="default"
                        size="sm"
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        승인
                      </Button>
                      <Button
                        onClick={() => {
                          setSelectedInstance(instance.id);
                          setShowRejectDialog(true);
                        }}
                        className="flex-1"
                        variant="destructive"
                        size="sm"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        반려
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 승인 다이얼로그 - 모바일 최적화 */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">체크리스트 승인</DialogTitle>
            <DialogDescription className="text-sm md:text-base">
              이 체크리스트를 승인하시겠습니까? 승인 의견을 남길 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="승인 의견 (선택사항)"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={4}
              className="resize-none text-sm md:text-base"
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => { 
                setShowApproveDialog(false); 
                setApprovalNotes(""); 
                setSelectedInstance(null); 
              }}
              className="w-full sm:w-auto"
            >
              취소
            </Button>
            <Button 
              onClick={handleApprove} 
              disabled={approveMutation.isPending}
              className="w-full sm:w-auto"
            >
              {approveMutation.isPending ? "처리 중..." : "승인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 반려 다이얼로그 - 모바일 최적화 */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">체크리스트 반려</DialogTitle>
            <DialogDescription className="text-sm md:text-base">
              이 체크리스트를 반려하시겠습니까? 반려 사유를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="반려 사유 (필수)"
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.target.value)}
              rows={4}
              className="border-destructive resize-none text-sm md:text-base"
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => { 
                setShowRejectDialog(false); 
                setRejectionNotes(""); 
                setSelectedInstance(null); 
              }}
              className="w-full sm:w-auto"
            >
              취소
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject} 
              disabled={rejectMutation.isPending}
              className="w-full sm:w-auto"
            >
              {rejectMutation.isPending ? "처리 중..." : "반려"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일괄 승인 다이얼로그 */}
      <Dialog open={showBatchApproveDialog} onOpenChange={setShowBatchApproveDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">일괄 승인</DialogTitle>
            <DialogDescription className="text-sm md:text-base">
              선택한 {selectedInstances.length}개의 체크리스트를 일괄 승인하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="승인 의견 (선택사항)"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={4}
              className="resize-none text-sm md:text-base"
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => { 
                setShowBatchApproveDialog(false); 
                setApprovalNotes(""); 
              }}
              className="w-full sm:w-auto"
            >
              취소
            </Button>
            <Button 
              onClick={handleBatchApprove} 
              disabled={batchApproveMutation.isPending}
              className="w-full sm:w-auto"
            >
              {batchApproveMutation.isPending ? "처리 중..." : `${selectedInstances.length}개 승인`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일괄 반려 다이얼로그 */}
      <Dialog open={showBatchRejectDialog} onOpenChange={setShowBatchRejectDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">일괄 반려</DialogTitle>
            <DialogDescription className="text-sm md:text-base">
              선택한 {selectedInstances.length}개의 체크리스트를 일괄 반려하시겠습니까? 반려 사유를 입력해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="반려 사유 (필수)"
              value={rejectionNotes}
              onChange={(e) => setRejectionNotes(e.target.value)}
              rows={4}
              className="border-destructive resize-none text-sm md:text-base"
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              variant="outline" 
              onClick={() => { 
                setShowBatchRejectDialog(false); 
                setRejectionNotes(""); 
              }}
              className="w-full sm:w-auto"
            >
              취소
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBatchReject} 
              disabled={batchRejectMutation.isPending}
              className="w-full sm:w-auto"
            >
              {batchRejectMutation.isPending ? "처리 중..." : `${selectedInstances.length}개 반려`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
