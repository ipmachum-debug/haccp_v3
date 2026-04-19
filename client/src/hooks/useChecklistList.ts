/**
 * useChecklistList - HACCP 체크리스트 리스트 공통 엔진
 * 
 * 모든 체크리스트 리스트가 이 훅 하나로 LIST / DELETE / APPROVAL REQUEST 처리
 * 
 * 서버 API 계약 (SSOT):
 *   genericChecklist.list   → { formType, startDate?, endDate?, status? }
 *   genericChecklist.delete → { id }
 *   approval.createRequest  → { requestType, referenceType?, referenceId?, title, description?, priority? }
 */
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

export interface ChecklistListConfig {
  /** DB formType (예: "air_compressor_maintenance") */
  formType: string;
  /** 한글 제목 (예: "공기압축기 정비일지") */
  title: string;
  /** 폼 페이지 기본 경로 (예: "/air-compressor-maintenance") */
  basePath: string;
}

export interface UseChecklistListReturn {
  // 데이터
  records: any[];
  filteredRecords: any[];
  isLoading: boolean;

  // 필터
  searchDate: string;
  setSearchDate: (v: string) => void;

  // 액션
  handleDelete: (id: number, e: React.MouseEvent) => void;
  handleApprovalRequest: (record: any, e: React.MouseEvent) => void;

  // 네비게이션
  navigateToForm: (id: number | "new") => void;
}

export function useChecklistList(config: ChecklistListConfig): UseChecklistListReturn {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [searchDate, setSearchDate] = useState("");

  // ── Query: 리스트 조회 ──
  const { data: records, isLoading, refetch } = trpc.genericChecklist.list.useQuery({
    formType: config.formType,
  });

  // ── Mutations ──
  const deleteMutation = trpc.genericChecklist.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "기록이 삭제되었습니다." });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  const approvalMutation = trpc.approval.createRequest.useMutation({
    onSuccess: () => {
      toast({ title: "승인 요청 완료", description: "승인관리 페이지에서 확인할 수 있습니다." });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "승인 요청 실패", description: error.message, variant: "destructive" });
    },
  });

  // ── 필터링 ──
  const filteredRecords = (records || []).filter((r: any) => {
    if (searchDate && !r.formDate?.startsWith(searchDate)) return false;
    return true;
  });

  // ── 삭제 핸들러 ──
  const handleDelete = useCallback((id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  }, []);

  // ── 승인요청 핸들러 (requestType 필수!) ──
  const handleApprovalRequest = useCallback((record: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("승인을 요청하시겠습니까?")) {
      approvalMutation.mutate({
        requestType: "checklist_approval",
        referenceType: "generic_checklist",
        referenceId: record.id,
        title: record.title || `${config.title} 승인 요청`,
        description: "체크리스트 승인 요청",
        priority: "medium",
      });
    }
  }, [config.title]);

  // ── 네비게이션 ──
  const navigateToForm = useCallback((id: number | "new") => {
    setLocation(`${config.basePath}/${id}`);
  }, [config.basePath]);

  return {
    records: records || [],
    filteredRecords,
    isLoading,
    searchDate,
    setSearchDate,
    handleDelete,
    handleApprovalRequest,
    navigateToForm,
  };
}
