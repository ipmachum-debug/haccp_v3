import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface BatchCompletionDialogProps {
  batchId: number;
  batchCode: string;
  plannedQuantity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BatchCompletionDialog({
  batchId,
  batchCode,
  plannedQuantity,
  open,
  onOpenChange,
  onSuccess,
}: BatchCompletionDialogProps) {
  const [actualQuantity, setActualQuantity] = useState("");
  const [defectQuantity, setDefectQuantity] = useState("");
  const [revenue, setRevenue] = useState("");
  const [completionNotes, setCompletionNotes] = useState("");

  // 배치 완료 전 체크리스트 조회
  const { data: checklist, isLoading: checklistLoading } =
    trpc.batch.checkCompletionReadiness.useQuery(
      { batchId },
      { enabled: open }
    );

  // 배치 완료 mutation
  const completeMutation = trpc.batch.complete.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      if (result.data.pdfGenerated) {
        toast.info("HACCP 보고서 PDF가 생성되었습니다.");
      }
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 다이얼로그가 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setActualQuantity("");
      setDefectQuantity("");
      setRevenue("");
      setCompletionNotes("");
    }
  }, [open]);

  const handleComplete = () => {
    const actualQty = parseFloat(actualQuantity);
    const defectQty = defectQuantity ? parseFloat(defectQuantity) : undefined;
    const rev = revenue ? parseFloat(revenue) : undefined;

    if (isNaN(actualQty) || actualQty < 0) {
      toast.error("실제 생산량을 올바르게 입력해주세요.");
      return;
    }

    if (defectQty !== undefined && (isNaN(defectQty) || defectQty < 0)) {
      toast.error("불량 수량을 올바르게 입력해주세요.");
      return;
    }

    if (rev !== undefined && (isNaN(rev) || rev < 0)) {
      toast.error("매출액을 올바르게 입력해주세요.");
      return;
    }

    // idempotency 키 생성 (배치 ID + 타임스탬프 + 랜덤 값)
    const idempotencyKey = `batch-${batchId}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    completeMutation.mutate({
      batchId,
      actualQuantity: actualQty,
      defectQuantity: defectQty,
      revenue: rev,
      completionNotes: completionNotes || undefined,
      idempotencyKey,
    });
  };

  const canComplete =
    checklist?.canComplete &&
    actualQuantity &&
    !isNaN(parseFloat(actualQuantity));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>배치 완료 확인</DialogTitle>
          <DialogDescription>
            배치 {batchCode}를 완료하시겠습니까? 완료 후에는 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 체크리스트 */}
          {checklistLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : checklist ? (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">완료 전 체크리스트</h3>

              {/* 원재료 투입 확인 */}
              <div className="flex items-start gap-2">
                {checklist.checks.hasMaterialInputs.passed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">원재료 투입 확인</p>
                  <p className="text-xs text-muted-foreground">
                    {checklist.checks.hasMaterialInputs.message}
                  </p>
                </div>
              </div>

              {/* CCP 점검 확인 */}
              <div className="flex items-start gap-2">
                {checklist.checks.ccpCompleted.passed ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">CCP 점검 완료 확인</p>
                  <p className="text-xs text-muted-foreground">
                    {checklist.checks.ccpCompleted.message}
                  </p>
                </div>
              </div>

              {/* 경고 메시지 */}
              {!checklist.canComplete && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {checklist.warnings.join(" ")}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : null}

          {/* 입력 폼 */}
          <div className="space-y-4 border-t pt-4">
            <div className="grid gap-2">
              <Label htmlFor="plannedQuantity">계획 생산량</Label>
              <Input
                id="plannedQuantity"
                value={plannedQuantity}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="actualQuantity">
                실제 생산량 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="actualQuantity"
                type="number"
                min="0"
                step="0.01"
                placeholder="실제 생산된 수량을 입력하세요"
                value={actualQuantity}
                onChange={(e) => setActualQuantity(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="defectQuantity">불량 수량 (선택)</Label>
              <Input
                id="defectQuantity"
                type="number"
                min="0"
                step="0.01"
                placeholder="불량품 수량 (선택)"
                value={defectQuantity}
                onChange={(e) => setDefectQuantity(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="revenue">매출액 (선택)</Label>
              <Input
                id="revenue"
                type="number"
                min="0"
                step="0.01"
                placeholder="매출액 (선택)"
                value={revenue}
                onChange={(e) => setRevenue(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="completionNotes">완료 메모 (선택)</Label>
              <Textarea
                id="completionNotes"
                placeholder="완료 관련 메모를 입력하세요 (선택)"
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={completeMutation.isPending}
          >
            취소
          </Button>
          <Button
            onClick={handleComplete}
            disabled={!canComplete || completeMutation.isPending}
          >
            {completeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                완료 처리 중...
              </>
            ) : (
              "배치 완료"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
