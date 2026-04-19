/**
 * ApprovalManagement 5단계 분해 — 11개 mutation 을 커스텀 훅으로 캡슐화.
 *
 * 각 mutation 의 성공/실패 토스트 + 다이얼로그 닫기 + 캐시 refetch 패턴이 동일해서
 * caller 쪽 상태 setter 를 config 로 받아 처리한다.
 */
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export interface ApprovalMutationsConfig {
  // 다이얼로그 open 상태 setter
  setReviewDialogOpen: (v: boolean) => void;
  setApproveDialogOpen: (v: boolean) => void;
  setRejectDialogOpen: (v: boolean) => void;
  setCancelDialogOpen: (v: boolean) => void;
  setBatchConfirmDialogOpen: (v: boolean) => void;
  setRecipeApproveDialogOpen: (v: boolean) => void;
  setRecipeRejectDialogOpen: (v: boolean) => void;

  // 선택 상태 setter
  setComment: (v: string) => void;
  setRejectionReason: (v: string) => void;
  setSelectedRequest: (v: null) => void;
  setSelectedRecipe: (v: null) => void;
  setSelectedIds: (v: number[]) => void;

  // 탭 전환
  setActiveTab: (tab: "review" | "approval" | "history" | "recipe" | "recipeHistory") => void;

  // 목록 refetch
  refetchReview: () => void;
  refetchPending: () => void;
  refetchApproval: () => void;
  refetchHistory: () => void;
  refetchPendingRecipes: () => void;
}

export function useApprovalMutations(cfg: ApprovalMutationsConfig) {
  // 공통 에러 핸들러 — 어떤 mutation 이든 `{ message: string }` 형태 에러 받음
  const errToast = (title: string) => (error: { message: string }) =>
    toast.error(title, { description: error.message });

  // 모든 목록 새로고침
  const refetchAllLists = () => {
    cfg.refetchReview();
    cfg.refetchPending();
    cfg.refetchApproval();
    cfg.refetchHistory();
  };

  // 선택 상태 리셋
  const resetSelection = () => {
    cfg.setComment("");
    cfg.setSelectedRequest(null);
    cfg.setSelectedIds([]);
  };

  // 검토 완료 (pending_review -> pending_approval)
  const reviewMutation = trpc.genericChecklist.reviewChecklist.useMutation({
    onSuccess: (data: { message?: string }) => {
      toast.success("검토 완료", {
        description: data.message || "검토가 완료되어 승인 대기로 이동했습니다.",
      });
      cfg.setReviewDialogOpen(false);
      resetSelection();
      cfg.refetchReview();
      cfg.refetchPending();
      cfg.refetchApproval();
      cfg.setActiveTab("approval");
    },
    onError: errToast("검토 실패"),
  });

  // 최종 승인
  const approveMutation = trpc.genericChecklist.approveChecklist.useMutation({
    onSuccess: (data: { message?: string }) => {
      toast.success("승인 완료", {
        description: data.message || "최종 승인이 완료되었습니다.",
      });
      cfg.setApproveDialogOpen(false);
      resetSelection();
      cfg.refetchApproval();
      cfg.refetchHistory();
      cfg.setActiveTab("history");
    },
    onError: errToast("승인 실패"),
  });

  // 반려 (검토 단계)
  const rejectReviewMutation = trpc.genericChecklist.reviewChecklist.useMutation({
    onSuccess: (data: { message?: string }) => {
      toast.success("반려 완료", { description: data.message || "요청이 반려되었습니다." });
      cfg.setRejectDialogOpen(false);
      resetSelection();
      refetchAllLists();
    },
    onError: errToast("반려 실패"),
  });

  // 반려 (승인 단계)
  const rejectApprovalMutation = trpc.genericChecklist.approveChecklist.useMutation({
    onSuccess: (data: { message?: string }) => {
      toast.success("반려 완료", { description: data.message || "승인이 반려되었습니다." });
      cfg.setRejectDialogOpen(false);
      resetSelection();
      refetchAllLists();
    },
    onError: errToast("반려 실패"),
  });

  // 삭제 (DB 완전 삭제)
  const deleteMutation = trpc.approval.deleteRequest.useMutation({
    onSuccess: () => {
      toast.success("삭제 완료", { description: "승인 요청이 삭제되었습니다." });
      cfg.setCancelDialogOpen(false);
      cfg.setComment("");
      cfg.setSelectedRequest(null);
      refetchAllLists();
    },
    onError: errToast("삭제 실패"),
  });

  // 일괄 삭제
  const deleteMultipleMutation = trpc.approval.deleteMultipleRequests.useMutation({
    onSuccess: (data: { message?: string }) => {
      toast.success("일괄 삭제 완료", { description: data.message });
      cfg.setSelectedIds([]);
      refetchAllLists();
    },
    onError: errToast("일괄 삭제 실패"),
  });

  // 품목제조보고 승인
  const approveRecipeMutation = trpc.recipeApproval.approve.useMutation({
    onSuccess: () => {
      toast.success("승인 완료", { description: "품목제조보고가 승인되었습니다." });
      cfg.setRecipeApproveDialogOpen(false);
      cfg.setSelectedRecipe(null);
      cfg.refetchPendingRecipes();
    },
    onError: errToast("승인 실패"),
  });

  // 품목제조보고 반려
  const rejectRecipeMutation = trpc.recipeApproval.reject.useMutation({
    onSuccess: () => {
      toast.success("반려 완료", { description: "품목제조보고가 반려되었습니다." });
      cfg.setRecipeRejectDialogOpen(false);
      cfg.setRejectionReason("");
      cfg.setSelectedRecipe(null);
      cfg.refetchPendingRecipes();
    },
    onError: errToast("반려 실패"),
  });

  // 일괄 검토 완료
  const batchReviewMutation = trpc.genericChecklist.batchReviewChecklists.useMutation({
    onSuccess: (data: { message?: string }) => {
      toast.success("일괄 검토 완료", { description: data.message });
      cfg.setSelectedIds([]);
      cfg.setBatchConfirmDialogOpen(false);
      cfg.refetchReview();
      cfg.refetchPending();
      cfg.refetchApproval();
    },
    onError: errToast("일괄 검토 실패"),
  });

  // 일괄 최종 승인
  const batchApproveMutation = trpc.genericChecklist.batchApproveChecklists.useMutation({
    onSuccess: (data: { message?: string }) => {
      toast.success("일괄 승인 완료", { description: data.message });
      cfg.setSelectedIds([]);
      cfg.setBatchConfirmDialogOpen(false);
      cfg.refetchApproval();
      cfg.refetchHistory();
      cfg.setActiveTab("history");
    },
    onError: errToast("일괄 승인 실패"),
  });

  // 승인자 자동 검토+승인
  const autoReviewApproveMutation = trpc.genericChecklist.approveWithAutoReview.useMutation({
    onSuccess: (data: { message?: string }) => {
      toast.success("검토 및 승인 완료", { description: data.message });
      cfg.setSelectedIds([]);
      cfg.setReviewDialogOpen(false);
      resetSelection();
      refetchAllLists();
    },
    onError: errToast("처리 실패"),
  });

  return {
    reviewMutation,
    approveMutation,
    rejectReviewMutation,
    rejectApprovalMutation,
    deleteMutation,
    deleteMultipleMutation,
    approveRecipeMutation,
    rejectRecipeMutation,
    batchReviewMutation,
    batchApproveMutation,
    autoReviewApproveMutation,
  };
}
