/**
 * useChecklistForm - HACCP 체크리스트 폼 공통 엔진
 * 
 * 모든 체크리스트 폼이 이 훅 하나로 SAVE / DETAIL(getById) / APPROVAL 처리
 * 
 * 서버 API 계약 (SSOT):
 *   genericChecklist.create  → { formType, formDate, title?, formData, status? }
 *   genericChecklist.update  → { id, formDate?, title?, formData?, status? }
 *   genericChecklist.getById → { id } → record | null
 *   approval.createRequest   → { requestType, referenceType?, referenceId?, title, description?, priority? }
 */
import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

export interface ChecklistFormConfig {
  /** DB에 저장될 formType (예: "air_compressor_maintenance") */
  formType: string;
  /** 한글 제목 (예: "에어콤프레샤 관리일지") */
  title: string;
  /** 리스트 페이지 경로 (예: "/air-compressor-maintenance") */
  listPath: string;
}

export interface UseChecklistFormReturn {
  // 상태
  isEdit: boolean;
  formStatus: "new" | "saved" | "submitted";
  savedRecordId: number | null;
  isLoading: boolean;
  isSaving: boolean;
  isApproving: boolean;

  // 기존 데이터 (getById 결과)
  existingRecord: any;

  // 액션
  handleSave: (formData: any) => Promise<void>;
  handleApprovalRequest: (formData: any) => Promise<void>;

  // 네비게이션
  navigateToList: () => void;
  navigateToNew: () => void;
}

export function useChecklistForm(config: ChecklistFormConfig): UseChecklistFormReturn {
  const params = useParams<{ id?: string }>();
  const isEdit = !!params.id && params.id !== "new";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [formStatus, setFormStatus] = useState<"new" | "saved" | "submitted">(
    isEdit ? "saved" : "new"
  );
  const [savedRecordId, setSavedRecordId] = useState<number | null>(
    isEdit && params.id ? Number(params.id) : null
  );

  // ── Mutations ──
  const saveMutation = trpc.genericChecklist.create.useMutation({
    onSuccess: () => {
      toast({ title: "저장 완료", description: "데이터가 성공적으로 저장되었습니다." });
    },
    onError: (error: any) => {
      toast({ title: "저장 실패", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = trpc.genericChecklist.update.useMutation({
    onSuccess: () => {
      toast({ title: "수정 완료", description: "데이터가 성공적으로 수정되었습니다." });
    },
    onError: (error: any) => {
      toast({ title: "수정 실패", description: error.message, variant: "destructive" });
    },
  });

  const approvalRequestMutation = trpc.approval.createRequest.useMutation({
    onSuccess: () => {
      toast({ title: "승인 요청 완료", description: "관리자에게 승인 요청이 전송되었습니다." });
      setFormStatus("submitted");
      setTimeout(() => setLocation("/dashboard/approval"), 1500);
    },
    onError: (error: any) => {
      toast({ title: "승인 요청 실패", description: error.message, variant: "destructive" });
    },
  });

  // ── Query: 기존 데이터 로드 ──
  const { data: existingRecord, isLoading } = trpc.genericChecklist.getById.useQuery(
    { id: Number(params.id) },
    { enabled: isEdit && !!params.id && params.id !== "new" }
  );

  // 기존 레코드의 상태 반영
  useEffect(() => {
    if (existingRecord) {
      if (existingRecord.status === "submitted" || existingRecord.status === "approved") {
        setFormStatus("submitted");
      }
    }
  }, [existingRecord]);

  // ── 저장 핸들러 ──
  const handleSave = useCallback(async (formData: any) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      if (savedRecordId) {
        // 수정
        await updateMutation.mutateAsync({
          id: savedRecordId,
          formDate: today,
          formData,
          status: "draft",
        });
        setFormStatus("saved");
      } else {
        // 신규 생성
        const result = await saveMutation.mutateAsync({
          formType: config.formType,
          formDate: today,
          title: `${config.title} - ${today}`,
          formData,
          status: "draft",
        });
        if (result.id) {
          setSavedRecordId(result.id);
        }
        setFormStatus("saved");
      }
    } catch (e) {
      console.error("저장 오류:", e);
    }
  }, [savedRecordId, config.formType, config.title]);

  // ── 승인요청 핸들러 ──
  const handleApprovalRequest = useCallback(async (formData: any) => {
    if (!savedRecordId) {
      toast({
        title: "먼저 저장해주세요",
        description: "승인 요청 전에 먼저 저장이 필요합니다.",
        variant: "destructive",
      });
      return;
    }
    try {
      const today = new Date().toISOString().split("T")[0];
      // 1) 상태를 submitted로 업데이트
      await updateMutation.mutateAsync({
        id: savedRecordId,
        formDate: today,
        formData,
        status: "submitted",
      });
      // 2) 승인 요청 생성 (requestType 필수!)
      await approvalRequestMutation.mutateAsync({
        requestType: "checklist_approval",
        referenceType: "generic_checklist",
        referenceId: savedRecordId,
        title: `${config.title} - ${today}`,
        description: `작성일: ${today}`,
        priority: "medium",
      });
    } catch (e) {
      console.error("승인 요청 오류:", e);
    }
  }, [savedRecordId, config.title]);

  // ── 네비게이션 ──
  const navigateToList = useCallback(() => {
    setLocation(config.listPath);
  }, [config.listPath]);

  const navigateToNew = useCallback(() => {
    setLocation(`${config.listPath}/new`);
  }, [config.listPath]);

  return {
    isEdit,
    formStatus,
    savedRecordId,
    isLoading,
    isSaving: saveMutation.isPending || updateMutation.isPending,
    isApproving: approvalRequestMutation.isPending,
    existingRecord,
    handleSave,
    handleApprovalRequest,
    navigateToList,
    navigateToNew,
  };
}
