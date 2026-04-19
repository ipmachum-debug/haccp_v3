/**
 * ApprovalManagement.tsx 분해 — 7개 액션 다이얼로그 묶음.
 *
 * 포함:
 *  - 검토 확인 (review)
 *  - 최종 승인 (approve)
 *  - 반려 (reject)
 *  - 승인 요청 삭제 (cancel)
 *  - 일괄 처리 확인 (batchConfirm)
 *  - 품목제조보고 승인 (recipeApprove)
 *  - 품목제조보고 반려 (recipeReject)
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserCheck, ShieldCheck, XCircle, Trash2 } from "lucide-react";

import type { ApprovalRequest, PendingRecipe } from "./types";
import { REQUEST_TYPE_LABELS } from "./constants";

export interface ApprovalActionDialogsProps {
  // 선택된 엔티티
  selectedRequest: ApprovalRequest | null;
  selectedRecipe: PendingRecipe | null;

  // 코멘트 / 반려 사유
  comment: string;
  setComment: (v: string) => void;
  rejectionReason: string;
  setRejectionReason: (v: string) => void;

  // 권한
  canApprove: boolean;

  // 일괄 처리 컨텍스트
  batchConfirmAction: "review" | "approve";
  selectedReviewCount: number;
  selectedApprovalCount: number;

  // 다이얼로그 open 상태
  reviewDialogOpen: boolean;
  setReviewDialogOpen: (v: boolean) => void;
  approveDialogOpen: boolean;
  setApproveDialogOpen: (v: boolean) => void;
  rejectDialogOpen: boolean;
  setRejectDialogOpen: (v: boolean) => void;
  cancelDialogOpen: boolean;
  setCancelDialogOpen: (v: boolean) => void;
  batchConfirmDialogOpen: boolean;
  setBatchConfirmDialogOpen: (v: boolean) => void;
  recipeApproveDialogOpen: boolean;
  setRecipeApproveDialogOpen: (v: boolean) => void;
  recipeRejectDialogOpen: boolean;
  setRecipeRejectDialogOpen: (v: boolean) => void;

  // pending 상태
  reviewPending: boolean;
  approvePending: boolean;
  rejectReviewPending: boolean;
  rejectApprovalPending: boolean;
  autoReviewApprovePending: boolean;
  deletePending: boolean;
  batchReviewPending: boolean;
  batchApprovePending: boolean;
  approveRecipePending: boolean;
  rejectRecipePending: boolean;

  // 핸들러
  onReview: () => void;
  onAutoReviewApprove: () => void;
  onApprove: () => void;
  onReject: () => void;
  onCancel: () => void;
  onConfirmBatchReview: () => void;
  onConfirmBatchApprove: () => void;
  onApproveRecipe: (recipeId: number) => void;
  onRejectRecipe: (recipeId: number, reason: string) => void;
}

export function ApprovalActionDialogs(props: ApprovalActionDialogsProps) {
  const {
    selectedRequest,
    selectedRecipe,
    comment,
    setComment,
    rejectionReason,
    setRejectionReason,
    canApprove,
    batchConfirmAction,
    selectedReviewCount,
    selectedApprovalCount,
    reviewDialogOpen,
    setReviewDialogOpen,
    approveDialogOpen,
    setApproveDialogOpen,
    rejectDialogOpen,
    setRejectDialogOpen,
    cancelDialogOpen,
    setCancelDialogOpen,
    batchConfirmDialogOpen,
    setBatchConfirmDialogOpen,
    recipeApproveDialogOpen,
    setRecipeApproveDialogOpen,
    recipeRejectDialogOpen,
    setRecipeRejectDialogOpen,
    reviewPending,
    approvePending,
    rejectReviewPending,
    rejectApprovalPending,
    autoReviewApprovePending,
    deletePending,
    batchReviewPending,
    batchApprovePending,
    approveRecipePending,
    rejectRecipePending,
    onReview,
    onAutoReviewApprove,
    onApprove,
    onReject,
    onCancel,
    onConfirmBatchReview,
    onConfirmBatchApprove,
    onApproveRecipe,
    onRejectRecipe,
  } = props;

  return (
    <>
      {/* 검토 다이얼로그 */}
      <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserCheck className="h-5 w-5 text-orange-600" />
              검토 확인
            </DialogTitle>
            <DialogDescription className="text-xs">
              검토 완료 시 승인 대기 상태로 이동합니다.
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="text-sm border rounded p-2 bg-muted/50 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">유형:</span>
                <span className="font-medium text-xs">
                  {REQUEST_TYPE_LABELS[selectedRequest.requestType] ||
                    selectedRequest.requestType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">제목:</span>
                <span className="font-medium text-xs truncate max-w-[200px]">
                  {selectedRequest.title}
                </span>
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="review-comment" className="text-xs">
              검토 코멘트 (선택)
            </Label>
            <Textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="검토 코멘트..."
              rows={2}
              className="text-sm"
            />
          </div>
          <DialogFooter className="flex-wrap gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setReviewDialogOpen(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600"
              onClick={onReview}
              disabled={reviewPending}
            >
              {reviewPending ? "..." : "검토 완료"}
            </Button>
            {canApprove && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={onAutoReviewApprove}
                disabled={autoReviewApprovePending}
              >
                {autoReviewApprovePending ? "..." : "검토+승인"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 승인 다이얼로그 */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-green-600" />
              최종 승인
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="text-sm border rounded p-2 bg-muted/50 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">유형:</span>
                <span className="font-medium text-xs">
                  {REQUEST_TYPE_LABELS[selectedRequest.requestType] ||
                    selectedRequest.requestType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">제목:</span>
                <span className="font-medium text-xs truncate max-w-[200px]">
                  {selectedRequest.title}
                </span>
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs">승인 코멘트 (선택)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="승인 코멘트..."
              rows={2}
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setApproveDialogOpen(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={onApprove}
              disabled={approvePending}
            >
              {approvePending ? "..." : "최종 승인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 반려 다이얼로그 */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <XCircle className="h-5 w-5 text-red-600" />
              반려
            </DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">반려 사유 (필수)</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="반려 사유..."
              rows={2}
              className="text-sm"
              required
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectDialogOpen(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={onReject}
              disabled={
                !comment.trim() || rejectReviewPending || rejectApprovalPending
              }
            >
              {rejectReviewPending || rejectApprovalPending ? "..." : "반려"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 다이얼로그 */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-red-600">
              <Trash2 className="h-5 w-5" />
              승인 요청 삭제
            </DialogTitle>
            <DialogDescription className="text-xs">
              이 승인 요청을 완전히 삭제합니다. 삭제된 데이터는 복구할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="text-sm py-1 space-y-1">
              <p className="font-medium">{selectedRequest.title}</p>
              <p className="text-xs text-muted-foreground">
                #{selectedRequest.id} ·{" "}
                {REQUEST_TYPE_LABELS[selectedRequest.requestType] ||
                  selectedRequest.requestType}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancelDialogOpen(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={onCancel}
              disabled={deletePending}
            >
              {deletePending ? "삭제 중..." : "삭제 확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일괄 처리 확인 다이얼로그 */}
      <Dialog
        open={batchConfirmDialogOpen}
        onOpenChange={setBatchConfirmDialogOpen}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">
              {batchConfirmAction === "review"
                ? "일괄 검토 확인"
                : "일괄 승인 확인"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {batchConfirmAction === "review"
                ? `${selectedReviewCount}건 일괄 검토`
                : `${selectedApprovalCount}건 일괄 승인`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBatchConfirmDialogOpen(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              className={
                batchConfirmAction === "review"
                  ? "bg-orange-500 hover:bg-orange-600"
                  : "bg-green-600 hover:bg-green-700"
              }
              onClick={
                batchConfirmAction === "review"
                  ? onConfirmBatchReview
                  : onConfirmBatchApprove
              }
              disabled={batchReviewPending || batchApprovePending}
            >
              {batchReviewPending || batchApprovePending ? "..." : "확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 품목제조보고 승인 다이얼로그 */}
      <Dialog
        open={recipeApproveDialogOpen}
        onOpenChange={setRecipeApproveDialogOpen}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">품목제조보고 승인</DialogTitle>
          </DialogHeader>
          {selectedRecipe && (
            <div className="text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">레시피:</span>
                <span className="font-medium">{selectedRecipe.recipeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">버전:</span>
                <span>{selectedRecipe.version}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecipeApproveDialogOpen(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (selectedRecipe) onApproveRecipe(selectedRecipe.id);
              }}
              disabled={approveRecipePending}
            >
              {approveRecipePending ? "..." : "승인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 품목제조보고 반려 다이얼로그 */}
      <Dialog
        open={recipeRejectDialogOpen}
        onOpenChange={setRecipeRejectDialogOpen}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">품목제조보고 반려</DialogTitle>
          </DialogHeader>
          <div>
            <Label className="text-xs">반려 사유 (필수)</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="반려 사유..."
              rows={2}
              className="text-sm"
              required
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRecipeRejectDialogOpen(false)}
            >
              취소
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (selectedRecipe && rejectionReason.trim())
                  onRejectRecipe(selectedRecipe.id, rejectionReason);
              }}
              disabled={!rejectionReason.trim() || rejectRecipePending}
            >
              {rejectRecipePending ? "..." : "반려"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
