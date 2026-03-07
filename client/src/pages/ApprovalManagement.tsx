import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { 
  CheckCircle, Clock, XCircle, AlertCircle, FileText, Package, Droplet, 
  ClipboardCheck, FileCheck, Utensils, TrendingUp, Eye, Printer, 
  ClipboardList, CheckSquare, Square, ListChecks, ArrowRight,
  ThermometerSun, Shield, Beaker, Bug, Snowflake, Droplets, 
  Scale, Wrench, Truck, GraduationCap, Trash2, AlertTriangle,
  UserCheck, ShieldCheck, RefreshCw, History, Filter, Ban
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { ApprovalSealRow } from "@/components/SealGenerator";
import { CcpInspectionCard } from "@/components/CcpInspectionCard";

// ============================================================================
// 승인 요청 유형 라벨 및 아이콘 (체크리스트 폼 타입 포함)
// ============================================================================

const REQUEST_TYPE_LABELS: Record<string, string> = {
  batch_production: "배치 CCP 기록지 승인",
  batch_approval: "배치 승인",
  batch_completion: "생산일지 (배치완료)",
  ccp_form: "CCP 모니터링 기록지",
  daily_log: "일반위생관리 및 공정점검표",
  weekly_log: "주간 일반위생관리 및 방충방서 점검표",
  monthly_log: "월간 일반위생관리 및 CCP 검증점검표",
  pest_control_checklist: "방충·방서 점검표",
  employee_health_check: "종사자 건강상태 확인 일지",
  inventory_adjustment: "재고 조정",
  material_inspection: "원재료 검사",
  hygiene_inspection: "위생 점검",
  document_approval: "문서 승인",
  recipe_change: "품목제조보고 변경",
  ccp_deviation: "CCP 이탈",
  temperature_humidity_check: "온·습도 점검표",
  personal_hygiene_check: "개인위생 점검표",
  sanitation_record: "세척·소독 기록",
  consumer_complaint: "소비자 불만 처리",
  airborne_bacteria_test: "낙하균 검사",
  air_compressor: "압축공기 필터 관리",
  air_compressor_maintenance: "에어콤프레샤 관리",
  daily_disposal_record: "일일폐기기록",
  equipment_history: "설비 이력 관리",
  equipment_inspection: "설비 점검 기록",
  finished_product_check: "완제품 검사",
  food_recall_notice: "식품 회수 통보서",
  handover_document: "인수인계 문서",
  hygiene_facility_check: "위생시설 점검표",
  illumination_check: "조도 점검표",
  product_test_log: "제품 시험 일지",
  product_test_report: "제품 시험 성적서",
  self_quality_inspection: "자체 품질 검사",
  supplier_inspection: "공급업체 점검",
  surface_contamination_test: "표면오염 검사",
  training_log: "교육 훈련 일지",
  vehicle_temperature_check: "차량 온도 점검",
  waste_management: "폐기물관리대장",
  water_management_check: "용수관리 점검표",
  weight_quality_check: "중량 품질 검사",
  workplace_hygiene_check: "작업장 위생 점검",
  checklist_approval: "체크리스트 승인",
};

const REQUEST_TYPE_ICONS: Record<string, any> = {
  batch_production: ClipboardCheck,
  batch_approval: Package,
  batch_completion: Package,
  ccp_form: ClipboardCheck,
  daily_log: Shield,
  weekly_log: Shield,
  monthly_log: Shield,
  pest_control_checklist: Shield,
  inventory_adjustment: TrendingUp,
  material_inspection: Droplet,
  hygiene_inspection: ClipboardCheck,
  document_approval: FileCheck,
  recipe_change: Utensils,
  ccp_deviation: AlertCircle,
  temperature_humidity_check: ThermometerSun,
  personal_hygiene_check: Shield,
  sanitation_record: Droplets,
  consumer_complaint: AlertTriangle,
  airborne_bacteria_test: Beaker,
  equipment_inspection: Wrench,
  training_log: GraduationCap,
  vehicle_temperature_check: Truck,
  waste_management: Trash2,
  water_management_check: Droplets,
  workplace_hygiene_check: ClipboardCheck,
};

const REQUEST_CATEGORIES: Record<string, string> = {
  batch_production: "CCP",
  batch_approval: "생산",
  batch_completion: "생산",
  ccp_form: "CCP",
  daily_log: "위생",
  weekly_log: "위생",
  monthly_log: "위생",
  pest_control_checklist: "위생",
  inventory_adjustment: "생산",
  material_inspection: "검사",
  hygiene_inspection: "위생",
  document_approval: "문서",
  recipe_change: "생산",
  ccp_deviation: "CCP",
  temperature_humidity_check: "위생",
  personal_hygiene_check: "위생",
  sanitation_record: "위생",
  consumer_complaint: "품질",
  airborne_bacteria_test: "검사",
  air_compressor: "설비",
  air_compressor_maintenance: "설비",
  daily_disposal_record: "위생",
  equipment_history: "설비",
  equipment_inspection: "설비",
  finished_product_check: "검사",
  food_recall_notice: "품질",
  handover_document: "문서",
  hygiene_facility_check: "위생",
  illumination_check: "위생",
  product_test_log: "검사",
  product_test_report: "검사",
  self_quality_inspection: "검사",
  supplier_inspection: "검사",
  surface_contamination_test: "검사",
  training_log: "교육",
  vehicle_temperature_check: "위생",
  waste_management: "위생",
  water_management_check: "위생",
  weight_quality_check: "검사",
  workplace_hygiene_check: "위생",
  checklist_approval: "위생",
};

const CATEGORY_COLORS: Record<string, string> = {
  "생산": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  "검사": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  "위생": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  "CCP": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  "문서": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  "품질": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  "설비": "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  "교육": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
};

// 3단계 승인 상태 라벨 및 색상
const STATUS_LABELS: Record<string, string> = {
  pending: "대기 중",
  pending_review: "검토 대기",
  pending_approval: "승인 대기",
  approved: "승인됨",
  rejected: "반려됨",
  cancelled: "취소됨",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  pending_review: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  pending_approval: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

// 3단계 승인 진행 표시 컴포넌트 (compact)
function ApprovalStepsInline({ status }: { status: string }) {
  const steps = [
    { key: "작성", done: true },
    { key: "검토", done: status === "pending_approval" || status === "approved" },
    { key: "승인", done: status === "approved" },
  ];
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px]">
      {steps.map((step, i) => (
        <span key={step.key} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-gray-300 mx-0.5">{">"}</span>}
          <span className={step.done ? "text-green-600 font-semibold" : "text-gray-400"}>
            {step.done ? "\u2713" : "\u25CB"}{step.key}
          </span>
        </span>
      ))}
    </span>
  );
}

export default function ApprovalManagement() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"review" | "approval" | "history" | "recipe" | "recipeHistory">("review");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
  const [recipeApproveDialogOpen, setRecipeApproveDialogOpen] = useState(false);
  const [recipeRejectDialogOpen, setRecipeRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  // 처리이력 날짜 필터
  const [historyDateFrom, setHistoryDateFrom] = useState("");
  const [historyDateTo, setHistoryDateTo] = useState("");
  // 일괄승인 확인 다이얼로그
  const [batchConfirmDialogOpen, setBatchConfirmDialogOpen] = useState(false);
  const [batchConfirmAction, setBatchConfirmAction] = useState<"review" | "approve">("review");

  // ============================================================================
  // 현재 사용자 승인 권한 조회
  // ============================================================================
  const { data: myApprovalRole } = trpc.organization.getMyApprovalRole.useQuery();
  const canReview = myApprovalRole?.approvalRole === "reviewer" || myApprovalRole?.approvalRole === "approver";
  const canApprove = myApprovalRole?.approvalRole === "approver";
  const currentRole = myApprovalRole?.approvalRole || "none";
  // ============================================================================
  // 3단계 승인 데이터 조회
  // ============================================================================

  // 검토 대기 목록 (pending_review + 기존 pending)
  const { data: reviewRequests, refetch: refetchReview } = trpc.approval.list.useQuery(
    { status: "pending_review" }
  );
  const { data: pendingRequests, refetch: refetchPending } = trpc.approval.list.useQuery(
    { status: "pending" }
  );

  // 승인 대기 목록 (pending_approval)
  const { data: approvalRequests, refetch: refetchApproval } = trpc.approval.list.useQuery(
    { status: "pending_approval" }
  );

  // 승인 이력 조회
  const { data: historyAll, refetch: refetchHistory } = trpc.approval.list.useQuery(
    { 
      status: statusFilter === "all" ? undefined : statusFilter as any,
      requestType: typeFilter === "all" ? undefined : typeFilter as any,
    },
    { enabled: activeTab === "history" }
  );
  // 문서 결재 설정 + 직원 목록 조회 (직인 표시용)
  const { data: allApprovalSettings = [] } = trpc.organization.approvalSettings.list.useQuery();
  const { data: allEmployees = [] } = trpc.organization.employees.list.useQuery();
  // CCP 기록 조회 (batch_production 상세 보기용)
  const batchIdForCcp = (selectedRequest?.requestType === "batch_production" || selectedRequest?.requestType === "batch_approval") && selectedRequest?.referenceId
    ? Number(selectedRequest.referenceId) : 0;
  const { data: ccpListForApproval, refetch: refetchCcpForApproval } = trpc.ccp.getByBatchId.useQuery(
    { batchId: batchIdForCcp },
    { enabled: !!batchIdForCcp && detailDialogOpen }
  );
  // CCP 기록지(h_ccp_form_records) 조회 (batch_production 상세)
  const { data: ccpFormRecords = [], refetch: refetchCcpFormRecords } = trpc.ccpForm.getByBatch.useQuery(
    { batchId: batchIdForCcp },
    { enabled: !!batchIdForCcp && detailDialogOpen }
  );
  const getApprovalSettingNames = (requestType: string) => {
    const setting = (allApprovalSettings as any[]).find((s: any) => s.documentType === requestType);
    if (!setting) return null;
    const findName = (empId: number) => {
      const emp = (allEmployees as any[]).find((e: any) => e.id === empId);
      return emp?.name || null;
    };
    return {
      writerName: findName(setting.authorEmployeeId),
      reviewerName: findName(setting.reviewerEmployeeId),
      approverName: findName(setting.approverEmployeeId),
    };
  };
  // 처리이력: approved, rejected만 표시 (statusFilter가 all일 때) + 날짜 필터
  const historyRequests = (() => {
    let list = statusFilter === "all" 
      ? (historyAll || []).filter((r: any) => r.status === "approved" || r.status === "rejected" || r.status === "cancelled")
      : historyAll || [];
    // 날짜 필터 적용
    if (historyDateFrom) {
      list = list.filter((r: any) => {
        const d = r.approvedAt || r.rejectedAt || r.requestedAt || r.createdAt;
        return d && new Date(d).toISOString().split("T")[0] >= historyDateFrom;
      });
    }
    if (historyDateTo) {
      list = list.filter((r: any) => {
        const d = r.approvedAt || r.rejectedAt || r.requestedAt || r.createdAt;
        return d && new Date(d).toISOString().split("T")[0] <= historyDateTo;
      });
    }
    return list;
  })();

  // 품목제조보고 승인 대기 목록 조회
  const { data: pendingRecipes, refetch: refetchPendingRecipes } = trpc.recipeApproval.getPending.useQuery(
    undefined,
    { enabled: activeTab === "recipe" }
  );

  // 품목제조보고 승인 이력 조회
  const [recipeStatusFilter, setRecipeStatusFilter] = useState<string>("all");
  const { data: recipeHistory, refetch: refetchRecipeHistory } = trpc.recipeApproval.getHistory.useQuery(
    {
      approvalStatus: recipeStatusFilter === "all" ? undefined : recipeStatusFilter,
    },
    { enabled: activeTab === "recipeHistory" }
  );

  // 검토 대기 합산 (pending_review + pending) - approved/cancelled 제외 + 중복 제거
  const allReviewRequests = (() => {
    const combined = [...(reviewRequests || []), ...(pendingRequests || [])];
    const filtered = combined.filter((r: any) => 
      r.status === "pending_review" || r.status === "pending"
    );
    const seen = new Set<number>();
    return filtered.filter((r: any) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  })();

  // ============================================================================
  // 3단계 승인 Mutations
  // ============================================================================

  // 검토 완료 (pending_review -> pending_approval)
  const reviewMutation = trpc.genericChecklist.reviewChecklist.useMutation({
    onSuccess: (data) => {
      toast.success("검토 완료", { description: data.message || "검토가 완료되어 승인 대기로 이동했습니다." });
      setReviewDialogOpen(false);
      setComment("");
      setSelectedRequest(null);
      setSelectedIds([]);
      refetchReview();
      refetchPending();
      refetchApproval();
      setActiveTab("approval");
    },
    onError: (error) => {
      toast.error("검토 실패", { description: error.message });
    },
  });

  // 최종 승인 (pending_approval -> approved)
  const approveMutation = trpc.genericChecklist.approveChecklist.useMutation({
    onSuccess: (data) => {
      toast.success("승인 완료", { description: data.message || "최종 승인이 완료되었습니다." });
      setApproveDialogOpen(false);
      setComment("");
      setSelectedRequest(null);
      setSelectedIds([]);
      refetchApproval();
      refetchHistory();
      setActiveTab("history");
    },
    onError: (error) => {
      toast.error("승인 실패", { description: error.message });
    },
  });

  // 반려 처리
  const rejectReviewMutation = trpc.genericChecklist.reviewChecklist.useMutation({
    onSuccess: (data) => {
      toast.success("반려 완료", { description: data.message || "요청이 반려되었습니다." });
      setRejectDialogOpen(false);
      setComment("");
      setSelectedRequest(null);
      setSelectedIds([]);
      refetchReview();
      refetchPending();
      refetchApproval();
      refetchHistory();
    },
    onError: (error) => {
      toast.error("반려 실패", { description: error.message });
    },
  });

  const rejectApprovalMutation = trpc.genericChecklist.approveChecklist.useMutation({
    onSuccess: (data) => {
      toast.success("반려 완료", { description: data.message || "승인이 반려되었습니다." });
      setRejectDialogOpen(false);
      setComment("");
      setSelectedRequest(null);
      setSelectedIds([]);
      refetchReview();
      refetchPending();
      refetchApproval();
      refetchHistory();
    },
    onError: (error) => {
      toast.error("반려 실패", { description: error.message });
    },
  });

  // 삭제 처리 (DB에서 완전 삭제)
  const deleteMutation = trpc.approval.deleteRequest.useMutation({
    onSuccess: () => {
      toast.success("삭제 완료", { description: "승인 요청이 삭제되었습니다." });
      setCancelDialogOpen(false);
      setComment("");
      setSelectedRequest(null);
      refetchReview();
      refetchPending();
      refetchApproval();
      refetchHistory();
    },
    onError: (error) => {
      toast.error("삭제 실패", { description: error.message });
    },
  });

  // 일괄 삭제 처리
  const deleteMultipleMutation = trpc.approval.deleteMultipleRequests.useMutation({
    onSuccess: (data) => {
      toast.success("일괄 삭제 완료", { description: data.message });
      setSelectedIds([]);
      refetchReview();
      refetchPending();
      refetchApproval();
      refetchHistory();
    },
    onError: (error) => {
      toast.error("일괄 삭제 실패", { description: error.message });
    },
  });

  // 품목제조보고 승인/반려
  const approveRecipeMutation = trpc.recipeApproval.approve.useMutation({
    onSuccess: () => {
      toast.success("승인 완료", { description: "품목제조보고가 승인되었습니다." });
      setRecipeApproveDialogOpen(false);
      setSelectedRecipe(null);
      refetchPendingRecipes();
    },
    onError: (error) => {
      toast.error("승인 실패", { description: error.message });
    },
  });

  const rejectRecipeMutation = trpc.recipeApproval.reject.useMutation({
    onSuccess: () => {
      toast.success("반려 완료", { description: "품목제조보고가 반려되었습니다." });
      setRecipeRejectDialogOpen(false);
      setRejectionReason("");
      setSelectedRecipe(null);
      refetchPendingRecipes();
    },
    onError: (error) => {
      toast.error("반려 실패", { description: error.message });
    },
  });

  // 일괄 검토 완료
  const batchReviewMutation = trpc.genericChecklist.batchReviewChecklists.useMutation({
    onSuccess: (data) => {
      toast.success("일괄 검토 완료", { description: data.message });
      setSelectedIds([]);
      setBatchConfirmDialogOpen(false);
      refetchReview();
      refetchPending();
      refetchApproval();
    },
    onError: (error) => {
      toast.error("일괄 검토 실패", { description: error.message });
    },
  });

  // 일괄 최종 승인
  const batchApproveMutation = trpc.genericChecklist.batchApproveChecklists.useMutation({
    onSuccess: (data) => {
      toast.success("일괄 승인 완료", { description: data.message });
      setSelectedIds([]);
      setBatchConfirmDialogOpen(false);
      refetchApproval();
      refetchHistory();
      setActiveTab("history");
    },
    onError: (error) => {
      toast.error("일괄 승인 실패", { description: error.message });
    },
  });

  // 승인자 자동 검토+승인
  const autoReviewApproveMutation = trpc.genericChecklist.approveWithAutoReview.useMutation({
    onSuccess: (data) => {
      toast.success("검토 및 승인 완료", { description: data.message });
      setSelectedIds([]);
      setReviewDialogOpen(false);
      setComment("");
      setSelectedRequest(null);
      refetchReview();
      refetchPending();
      refetchApproval();
      refetchHistory();
    },
    onError: (error) => {
      toast.error("처리 실패", { description: error.message });
    },
  });

  // ============================================================================
  // 핸들러
  // ============================================================================

  const handleReview = () => {
    if (!selectedRequest) return;
    reviewMutation.mutate({ approvalRequestId: selectedRequest.id, action: "approve", comments: comment || undefined });
  };

  const handleApprove = () => {
    if (!selectedRequest) return;
    approveMutation.mutate({ approvalRequestId: selectedRequest.id, action: "approve", comments: comment || undefined });
  };

  const handleReject = () => {
    if (!selectedRequest || !comment.trim()) {
      toast.error("반려 사유를 입력해주세요.");
      return;
    }
    const status = selectedRequest.status;
    if (status === "pending_review" || status === "pending") {
      rejectReviewMutation.mutate({ approvalRequestId: selectedRequest.id, action: "reject", comments: comment });
    } else if (status === "pending_approval") {
      rejectApprovalMutation.mutate({ approvalRequestId: selectedRequest.id, action: "reject", comments: comment });
    }
  };

  const handleCancel = () => {
    if (!selectedRequest) return;
    deleteMutation.mutate({ requestId: selectedRequest.id });
  };

  const handleBatchDelete = () => {
    if (selectedIds.length === 0) {
      toast.error("삭제할 항목을 선택해주세요.");
      return;
    }
    deleteMultipleMutation.mutate({ requestIds: selectedIds });
  };

  // 일괄 검토 핸들러 (확인 다이얼로그 경유)
  const handleBatchReview = () => {
    const reviewIds = selectedIds.filter(id => 
      allReviewRequests.some((r: any) => r.id === id)
    );
    if (reviewIds.length === 0) {
      toast.error("검토할 항목을 선택해주세요.");
      return;
    }
    setBatchConfirmAction("review");
    setBatchConfirmDialogOpen(true);
  };

  const confirmBatchReview = () => {
    const reviewIds = selectedIds.filter(id => 
      allReviewRequests.some((r: any) => r.id === id)
    );
    batchReviewMutation.mutate({ approvalRequestIds: reviewIds });
  };

  // 일괄 승인 핸들러 (확인 다이얼로그 경유)
  const handleBatchApprove = () => {
    const approveIds = selectedIds.filter(id => 
      (approvalRequests || []).some((r: any) => r.id === id)
    );
    if (approveIds.length === 0) {
      toast.error("승인할 항목을 선택해주세요.");
      return;
    }
    setBatchConfirmAction("approve");
    setBatchConfirmDialogOpen(true);
  };

  const confirmBatchApprove = () => {
    const approveIds = selectedIds.filter(id => 
      (approvalRequests || []).some((r: any) => r.id === id)
    );
    batchApproveMutation.mutate({ approvalRequestIds: approveIds });
  };

  // 검토 대기 탭에서 승인자가 일괄 검토+승인 (바로 승인)
  const handleBatchDirectApprove = () => {
    const reviewIds = selectedIds.filter(id => 
      allReviewRequests.some((r: any) => r.id === id)
    );
    if (reviewIds.length === 0) {
      toast.error("승인할 항목을 선택해주세요.");
      return;
    }
    batchApproveMutation.mutate({ approvalRequestIds: reviewIds });
  };

  // 승인자 자동 검토+승인 핸들러
  const handleAutoReviewApprove = () => {
    if (!selectedRequest) return;
    autoReviewApproveMutation.mutate({ approvalRequestId: selectedRequest.id, comments: comment || undefined });
  };

  const handleRefreshAll = () => {
    refetchReview();
    refetchPending();
    refetchApproval();
    refetchHistory();
    toast.success("새로고침 완료");
  };

  // 체크박스 토글
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = (list: any[]) => {
    const allIds = list.map((r: any) => r.id);
    const allSelected = allIds.length > 0 && allIds.every((id: number) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : allIds);
  };

  // 카테고리 필터링
  const filterByCategory = (list: any[]) => {
    if (categoryFilter === "all") return list;
    return list.filter((r: any) => {
      const cat = REQUEST_CATEGORIES[r.requestType] || "기타";
      return cat === categoryFilter;
    });
  };

  const filteredReview = filterByCategory(allReviewRequests);
  const filteredApproval = filterByCategory(
    (approvalRequests || []).filter((r: any) => r.status === "pending_approval")
  );

  // 카테고리별 통계
  const reviewCategoryStats = allReviewRequests.reduce((acc: Record<string, number>, r: any) => {
    const cat = REQUEST_CATEGORIES[r.requestType] || "기타";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 선택된 항목 수 계산
  const selectedReviewCount = selectedIds.filter(id => allReviewRequests.some((r: any) => r.id === id)).length;
  const selectedApprovalCount = selectedIds.filter(id => (approvalRequests || []).some((r: any) => r.id === id)).length;

  // ============================================================================
  // 컴팩트 테이블 행 렌더링
  // ============================================================================

  const renderRequestRow = (request: any, mode: "review" | "approve" | "readonly" = "readonly") => {
    const Icon = REQUEST_TYPE_ICONS[request.requestType] || FileText;
    const category = REQUEST_CATEGORIES[request.requestType] || "기타";
    const categoryColor = CATEGORY_COLORS[category] || "bg-gray-100 text-gray-800";
    const isSelected = selectedIds.includes(request.id);
    const dateStr = request.requestedAt
      ? format(new Date(request.requestedAt), "MM.dd HH:mm")
      : request.createdAt
        ? format(new Date(request.createdAt), "MM.dd HH:mm")
        : "-";

    return (
      <div
        key={request.id}
        className={`flex items-center gap-2 px-3 py-2.5 border-b last:border-b-0 hover:bg-accent/40 transition-colors text-sm ${
          isSelected ? "bg-blue-50/60 dark:bg-blue-950/10" : ""
        }`}
      >
        {/* 체크박스 */}
        {mode !== "readonly" && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleSelect(request.id); }}
            className="flex-shrink-0 text-muted-foreground hover:text-blue-600"
          >
            {isSelected
              ? <CheckSquare className="w-4 h-4 text-blue-600" />
              : <Square className="w-4 h-4" />
            }
          </button>
        )}

        {/* 아이콘 + 카테고리 */}
        <div className="flex-shrink-0 flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <Badge className={`${categoryColor} text-[10px] px-1.5 py-0`}>{category}</Badge>
        </div>

        {/* 제목 + 유형 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium truncate text-sm">
              {request.title || REQUEST_TYPE_LABELS[request.requestType] || request.requestType}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <span>{request.requester?.name || "?"}</span>
            <span>{dateStr}</span>
            <ApprovalStepsInline status={request.status} />
          </div>
        </div>

        {/* 상태 */}
        <Badge className={`${STATUS_COLORS[request.status] || STATUS_COLORS.pending} text-[10px] px-1.5 py-0 flex-shrink-0`}>
          {STATUS_LABELS[request.status] || request.status}
        </Badge>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0"
            onClick={() => { setSelectedRequest(request); setDetailDialogOpen(true); }}
            title="상세"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>

          {mode === "review" && (request.status === "pending_review" || request.status === "pending") && canReview && (
            <>
              <Button
                size="sm" className="h-7 px-2 text-xs bg-orange-500 hover:bg-orange-600"
                onClick={() => { setSelectedRequest(request); setComment(""); setReviewDialogOpen(true); }}
                title="검토완료"
              >
                <UserCheck className="h-3 w-3 mr-0.5" />검토
              </Button>
              {canApprove && (
                <Button
                  size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                  onClick={() => { setSelectedRequest(request); setComment(""); handleAutoReviewApprove(); }}
                  disabled={autoReviewApproveMutation.isPending}
                  title="바로승인"
                >
                  <ShieldCheck className="h-3 w-3 mr-0.5" />승인
                </Button>
              )}
              <Button
                size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                onClick={() => { setSelectedRequest(request); setComment(""); setRejectDialogOpen(true); }}
                title="반려"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {mode === "approve" && request.status === "pending_approval" && canApprove && (
            <>
              <Button
                size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700"
                onClick={() => { setSelectedRequest(request); setComment(""); setApproveDialogOpen(true); }}
                title="최종승인"
              >
                <ShieldCheck className="h-3 w-3 mr-0.5" />승인
              </Button>
              <Button
                size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                onClick={() => { setSelectedRequest(request); setComment(""); setRejectDialogOpen(true); }}
                title="반려"
              >
                <XCircle className="h-3.5 w-3.5" />
              </Button>
            </>
          )}

          {mode === "readonly" && request.status === "approved" && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
              onClick={() => setLocation("/dashboard/document-output")}
              title="문서출력"
            >
              <Printer className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* 삭제 버튼 */}
          <Button
            size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
            onClick={() => { setSelectedRequest(request); setComment(""); setCancelDialogOpen(true); }}
            title="삭제"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold">승인 관리</h1>
            <p className="text-sm text-muted-foreground">
              작성 &rarr; 검토 &rarr; 최종승인
              {currentRole !== "none" && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {currentRole === "approver" ? "승인자" : currentRole === "reviewer" ? "검토자" : "일반"}
                </Badge>
              )}
            </p>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleRefreshAll}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />새로고침
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/document-approval")}>
              <FileCheck className="h-3.5 w-3.5 mr-1" />문서 승인
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard/document-output")}>
              <Printer className="h-3.5 w-3.5 mr-1" />문서 출력
            </Button>
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Card className={`cursor-pointer transition-all hover:shadow-md ${activeTab === "review" ? "ring-2 ring-orange-400" : ""}`}
            onClick={() => setActiveTab("review")}
          >
            <CardContent className="py-3 px-3 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                <UserCheck className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">검토 대기</p>
                <p className="text-xl font-bold text-orange-600">{allReviewRequests.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all hover:shadow-md ${activeTab === "approval" ? "ring-2 ring-blue-400" : ""}`}
            onClick={() => setActiveTab("approval")}
          >
            <CardContent className="py-3 px-3 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">승인 대기</p>
                <p className="text-xl font-bold text-blue-600">{(approvalRequests || []).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all hover:shadow-md ${activeTab === "recipe" ? "ring-2 ring-purple-400" : ""}`}
            onClick={() => setActiveTab("recipe")}
          >
            <CardContent className="py-3 px-3 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                <Utensils className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">품목제조보고</p>
                <p className="text-xl font-bold text-purple-600">{(pendingRecipes || []).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all hover:shadow-md ${activeTab === "history" ? "ring-2 ring-green-400" : ""}`}
            onClick={() => setActiveTab("history")}
          >
            <CardContent className="py-3 px-3 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30">
                <History className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">처리 이력</p>
                <p className="text-xl font-bold text-green-600">{(historyRequests || []).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer transition-all hover:shadow-md ${activeTab === "recipeHistory" ? "ring-2 ring-gray-400" : ""}`}
            onClick={() => setActiveTab("recipeHistory")}
          >
            <CardContent className="py-3 px-3 flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-900/30">
                <FileText className="h-4 w-4 text-gray-600" />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">품목제조 이력</p>
                <p className="text-xl font-bold text-gray-600">{(recipeHistory || []).length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 카테고리 필터 (검토/승인 탭에서만) */}
        {(activeTab === "review" || activeTab === "approval") && allReviewRequests.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <Badge
              variant={categoryFilter === "all" ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => setCategoryFilter("all")}
            >
              전체 ({allReviewRequests.length + (approvalRequests || []).length})
            </Badge>
            {Object.entries(reviewCategoryStats).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <Badge
                key={cat}
                variant={categoryFilter === cat ? "default" : "outline"}
                className={`cursor-pointer text-xs ${categoryFilter === cat ? "" : CATEGORY_COLORS[cat] || ""}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat} ({count})
              </Badge>
            ))}
          </div>
        )}

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as any); setSelectedIds([]); }}>
          <TabsList className="flex flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="review" className="flex items-center gap-1 text-xs px-2 py-1.5">
              <UserCheck className="h-3.5 w-3.5" />
              검토 대기
              {allReviewRequests.length > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{allReviewRequests.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approval" className="flex items-center gap-1 text-xs px-2 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5" />
              승인 대기
              {(approvalRequests || []).length > 0 && (
                <Badge variant="destructive" className="ml-1 h-4 px-1 text-[10px]">{(approvalRequests || []).length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1 text-xs px-2 py-1.5">
              <History className="h-3.5 w-3.5" />
              처리 이력
            </TabsTrigger>
            <TabsTrigger value="recipe" className="flex items-center gap-1 text-xs px-2 py-1.5">
              <Utensils className="h-3.5 w-3.5" />
              품목제조보고
              {pendingRecipes && pendingRecipes.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px]">{pendingRecipes.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="recipeHistory" className="flex items-center gap-1 text-xs px-2 py-1.5">
              <FileText className="h-3.5 w-3.5" />
              품목제조 이력
            </TabsTrigger>
          </TabsList>

          {/* ============================================================ */}
          {/* 검토 대기 탭 */}
          {/* ============================================================ */}
          <TabsContent value="review" className="space-y-2 mt-2">
            {filteredReview.length > 0 && (
              <div className="flex items-center gap-2 py-1.5 flex-wrap">
                <button onClick={() => toggleSelectAll(filteredReview)}
                  className="text-muted-foreground hover:text-blue-600"
                >
                  {filteredReview.every((r: any) => selectedIds.includes(r.id))
                    ? <CheckSquare className="w-4 h-4 text-blue-600" />
                    : <Square className="w-4 h-4" />
                  }
                </button>
                <span className="text-xs text-muted-foreground">전체 선택 ({filteredReview.length}건)</span>
                {selectedReviewCount > 0 && (
                  <div className="flex gap-1.5 ml-auto flex-wrap">
                    {canReview && (
                      <Button size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600" onClick={handleBatchReview} disabled={batchReviewMutation.isPending}>
                        {batchReviewMutation.isPending ? "..." : `일괄 검토 (${selectedReviewCount})`}
                      </Button>
                    )}
                    {canApprove && (
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={handleBatchDirectApprove} disabled={batchApproveMutation.isPending}>
                        {batchApproveMutation.isPending ? "..." : `일괄 승인 (${selectedReviewCount})`}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}

            {filteredReview.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <UserCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">검토 대기 중인 요청이 없습니다</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {filteredReview.map((request: any) => renderRequestRow(request, "review"))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* 승인 대기 탭 */}
          {/* ============================================================ */}
          <TabsContent value="approval" className="space-y-2 mt-2">
            {filteredApproval.length > 0 && (
              <div className="flex items-center gap-2 py-1.5 flex-wrap">
                <button onClick={() => toggleSelectAll(filteredApproval)}
                  className="text-muted-foreground hover:text-blue-600"
                >
                  {filteredApproval.every((r: any) => selectedIds.includes(r.id))
                    ? <CheckSquare className="w-4 h-4 text-blue-600" />
                    : <Square className="w-4 h-4" />
                  }
                </button>
                <span className="text-xs text-muted-foreground">전체 선택 ({filteredApproval.length}건)</span>
                {selectedApprovalCount > 0 && canApprove && (
                  <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 ml-auto" onClick={handleBatchApprove} disabled={batchApproveMutation.isPending}>
                    {batchApproveMutation.isPending ? "..." : `일괄 승인 (${selectedApprovalCount})`}
                  </Button>
                )}
              </div>
            )}

            {filteredApproval.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">승인 대기 중인 요청이 없습니다</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {filteredApproval.map((request: any) => renderRequestRow(request, "approve"))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* 처리 이력 탭 */}
          {/* ============================================================ */}
          <TabsContent value="history" className="space-y-2 mt-2">
            <Card className="p-3">
              <div className="flex gap-2 flex-wrap items-end">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-muted-foreground font-medium">상태</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="approved">승인됨</SelectItem>
                      <SelectItem value="rejected">반려됨</SelectItem>
                      <SelectItem value="cancelled">취소됨</SelectItem>
                      <SelectItem value="pending_review">검토 대기</SelectItem>
                      <SelectItem value="pending_approval">승인 대기</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-muted-foreground font-medium">유형</label>
                  <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-[120px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="batch_production">배치 CCP</SelectItem>
                      <SelectItem value="ccp_form">CCP 기록지</SelectItem>
                      <SelectItem value="batch_approval">배치 승인</SelectItem>
                      <SelectItem value="checklist_approval">체크리스트</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-muted-foreground font-medium">시작일</label>
                  <Input type="date" value={historyDateFrom} onChange={(e) => setHistoryDateFrom(e.target.value)} className="w-[130px] h-8 text-xs" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] text-muted-foreground font-medium">종료일</label>
                  <Input type="date" value={historyDateTo} onChange={(e) => setHistoryDateTo(e.target.value)} className="w-[130px] h-8 text-xs" />
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => {
                  setStatusFilter("all"); setTypeFilter("all"); setHistoryDateFrom(""); setHistoryDateTo("");
                }}>
                  초기화
                </Button>
              </div>
            </Card>

            {!historyRequests || historyRequests.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <History className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">처리 이력이 없습니다</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {historyRequests.map((request: any) => renderRequestRow(request, "readonly"))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* 품목제조보고 탭 */}
          {/* ============================================================ */}
          <TabsContent value="recipe" className="space-y-2 mt-2">
            {!pendingRecipes || pendingRecipes.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Utensils className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">승인 대기 중인 품목제조보고가 없습니다</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {pendingRecipes.map((recipe: any) => (
                    <div key={recipe.id} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 hover:bg-accent/40 text-sm">
                      <Utensils className="h-4 w-4 text-purple-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{recipe.recipeName}</span>
                        <div className="text-xs text-muted-foreground">
                          v{recipe.version} | {recipe.batchSize} {recipe.batchUnit} | 수율 {recipe.yieldRate}%
                          <span className="ml-2">{format(new Date(recipe.createdAt), "MM.dd HH:mm")}</span>
                        </div>
                      </div>
                      <Badge className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5">대기</Badge>
                      <div className="flex gap-1">
                        <Button size="sm" className="h-7 px-2 text-xs"
                          onClick={() => { setSelectedRecipe(recipe); setRecipeApproveDialogOpen(true); }}
                        >
                          <CheckCircle className="h-3 w-3 mr-0.5" />승인
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 px-2 text-xs"
                          onClick={() => { setSelectedRecipe(recipe); setRecipeRejectDialogOpen(true); }}
                        >
                          <XCircle className="h-3 w-3 mr-0.5" />반려
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* 품목제조 이력 탭 */}
          {/* ============================================================ */}
          <TabsContent value="recipeHistory" className="space-y-2 mt-2">
            <div className="flex gap-2 flex-wrap">
              <Select value={recipeStatusFilter} onValueChange={setRecipeStatusFilter}>
                <SelectTrigger className="w-[140px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="APPROVED">승인됨</SelectItem>
                  <SelectItem value="REJECTED">반려됨</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!recipeHistory || recipeHistory.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">품목제조보고 이력이 없습니다</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  {recipeHistory.map((recipe: any) => (
                    <div key={recipe.id} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 hover:bg-accent/40 text-sm">
                      <Utensils className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{recipe.recipeName}</span>
                        <div className="text-xs text-muted-foreground">
                          v{recipe.version} | {recipe.batchSize} {recipe.batchUnit}
                          <span className="ml-2">{format(new Date(recipe.createdAt), "MM.dd HH:mm")}</span>
                          {recipe.approvalStatus === "REJECTED" && recipe.rejectionReason && (
                            <span className="ml-2 text-red-500">반려: {recipe.rejectionReason}</span>
                          )}
                        </div>
                      </div>
                      <Badge className={recipe.approvalStatus === "APPROVED"
                        ? "bg-green-100 text-green-800 text-[10px]"
                        : "bg-red-100 text-red-800 text-[10px]"
                      }>
                        {recipe.approvalStatus === "APPROVED" ? "승인" : "반려"}
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* ============================================================ */}
        {/* 검토 다이얼로그 */}
        {/* ============================================================ */}
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
                <div className="flex justify-between"><span className="text-muted-foreground">유형:</span><span className="font-medium text-xs">{REQUEST_TYPE_LABELS[selectedRequest.requestType] || selectedRequest.requestType}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">제목:</span><span className="font-medium text-xs truncate max-w-[200px]">{selectedRequest.title}</span></div>
              </div>
            )}
            <div>
              <Label htmlFor="review-comment" className="text-xs">검토 코멘트 (선택)</Label>
              <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="검토 코멘트..." rows={2} className="text-sm" />
            </div>
            <DialogFooter className="flex-wrap gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setReviewDialogOpen(false)}>취소</Button>
              <Button size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={handleReview} disabled={reviewMutation.isPending}>
                {reviewMutation.isPending ? "..." : "검토 완료"}
              </Button>
              {canApprove && (
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleAutoReviewApprove} disabled={autoReviewApproveMutation.isPending}>
                  {autoReviewApproveMutation.isPending ? "..." : "검토+승인"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 승인 다이얼로그 */}
        <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-5 w-5 text-green-600" />최종 승인</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="text-sm border rounded p-2 bg-muted/50 space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">유형:</span><span className="font-medium text-xs">{REQUEST_TYPE_LABELS[selectedRequest.requestType] || selectedRequest.requestType}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">제목:</span><span className="font-medium text-xs truncate max-w-[200px]">{selectedRequest.title}</span></div>
              </div>
            )}
            <div>
              <Label className="text-xs">승인 코멘트 (선택)</Label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="승인 코멘트..." rows={2} className="text-sm" />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setApproveDialogOpen(false)}>취소</Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={handleApprove} disabled={approveMutation.isPending}>
                {approveMutation.isPending ? "..." : "최종 승인"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 반려 다이얼로그 */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base"><XCircle className="h-5 w-5 text-red-600" />반려</DialogTitle>
            </DialogHeader>
            <div>
              <Label className="text-xs">반려 사유 (필수)</Label>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="반려 사유..." rows={2} className="text-sm" required />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRejectDialogOpen(false)}>취소</Button>
              <Button size="sm" variant="destructive" onClick={handleReject}
                disabled={!comment.trim() || rejectReviewMutation.isPending || rejectApprovalMutation.isPending}
              >
                {(rejectReviewMutation.isPending || rejectApprovalMutation.isPending) ? "..." : "반려"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 삭제 다이얼로그 */}
        <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-red-600"><Trash2 className="h-5 w-5" />승인 요청 삭제</DialogTitle>
              <DialogDescription className="text-xs">이 승인 요청을 완전히 삭제합니다. 삭제된 데이터는 복구할 수 없습니다.</DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="text-sm py-1 space-y-1">
                <p className="font-medium">{selectedRequest.title}</p>
                <p className="text-xs text-muted-foreground">#{selectedRequest.id} · {REQUEST_TYPE_LABELS[selectedRequest.requestType] || selectedRequest.requestType}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(false)}>취소</Button>
              <Button size="sm" variant="destructive" onClick={handleCancel} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? "삭제 중..." : "삭제 확인"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 일괄 처리 확인 다이얼로그 */}
        <Dialog open={batchConfirmDialogOpen} onOpenChange={setBatchConfirmDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-base">
                {batchConfirmAction === "review" ? "일괄 검토 확인" : "일괄 승인 확인"}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {batchConfirmAction === "review"
                  ? `${selectedReviewCount}건 일괄 검토`
                  : `${selectedApprovalCount}건 일괄 승인`
                }
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setBatchConfirmDialogOpen(false)}>취소</Button>
              <Button size="sm"
                className={batchConfirmAction === "review" ? "bg-orange-500 hover:bg-orange-600" : "bg-green-600 hover:bg-green-700"}
                onClick={batchConfirmAction === "review" ? confirmBatchReview : confirmBatchApprove}
                disabled={batchReviewMutation.isPending || batchApproveMutation.isPending}
              >
                {(batchReviewMutation.isPending || batchApproveMutation.isPending) ? "..." : "확인"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ============================================================ */}
        {/* 상세 보기 다이얼로그 */}
        {/* ============================================================ */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">승인 요청 상세</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {/* 3단계 진행 표시 */}
                <div className="p-2 bg-muted/50 rounded text-xs">
                  <ApprovalStepsInline status={selectedRequest.status} />
                </div>

                {/* 승인 직인 (승인 완료 시) */}
                {selectedRequest.status === "approved" && (() => {
                  const cfd = (selectedRequest as any).checklistFormData;
                  const approval = cfd?.approval;
                  const settingNames2 = getApprovalSettingNames(selectedRequest.requestType || "");
                  const writerName = settingNames2?.writerName || approval?.writerName || selectedRequest.requester?.name || "작성자";
                  const reviewerName = settingNames2?.reviewerName || approval?.reviewerName || selectedRequest.reviewer?.name || "검토자";
                  const approverName = settingNames2?.approverName || approval?.approverName || selectedRequest.approver?.name || "승인자";
                  return (
                    <div className="p-2 bg-muted/50 rounded flex justify-center">
                      <ApprovalSealRow
                        writer={{ name: writerName, date: selectedRequest.requestedAt || selectedRequest.createdAt }}
                        reviewer={selectedRequest.reviewedAt || approval?.reviewerApproved ? { name: reviewerName, date: selectedRequest.reviewedAt || selectedRequest.approvedAt } : undefined}
                        approver={selectedRequest.approvedAt || approval?.approverApproved ? { name: approverName, date: selectedRequest.approvedAt } : undefined}
                        size={45}
                      />
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-[10px] text-muted-foreground">유형</div><div className="font-medium text-xs">{REQUEST_TYPE_LABELS[selectedRequest.requestType] || selectedRequest.requestType}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">상태</div><Badge className={`${STATUS_COLORS[selectedRequest.status] || STATUS_COLORS.pending} text-[10px]`}>{STATUS_LABELS[selectedRequest.status] || selectedRequest.status}</Badge></div>
                  <div><div className="text-[10px] text-muted-foreground">제목</div><div className="font-medium text-xs">{selectedRequest.title}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">요청일</div><div className="text-xs">{selectedRequest.requestedAt ? format(new Date(selectedRequest.requestedAt), "PPP p", { locale: ko }) : "-"}</div></div>
                  {selectedRequest.reviewedAt && (<div><div className="text-[10px] text-muted-foreground">검토일</div><div className="text-xs">{format(new Date(selectedRequest.reviewedAt), "PPP p", { locale: ko })}</div></div>)}
                  {selectedRequest.approvedAt && (<div><div className="text-[10px] text-muted-foreground">승인일</div><div className="text-xs">{format(new Date(selectedRequest.approvedAt), "PPP p", { locale: ko })}</div></div>)}
                </div>
                {selectedRequest.description && (
                  <div className="border-t pt-2"><div className="text-[10px] text-muted-foreground mb-1">설명</div><div className="text-xs whitespace-pre-line">{selectedRequest.description}</div></div>
                )}
                {(selectedRequest.requestType === "batch_production" || selectedRequest.requestType === "batch_approval") && selectedRequest.referenceId && (
                  <div className="border-t pt-2">
                    <div className="text-xs font-semibold mb-1 flex items-center gap-1"><Package className="h-3.5 w-3.5 text-blue-600" />CCP 기록지 (배치 #{selectedRequest.referenceId})</div>
                    {(ccpFormRecords as any[]).length > 0 && (
                      <div className="mb-2 space-y-1">
                        {(ccpFormRecords as any[]).map((fr: any) => (
                          <div key={fr.id} className="flex items-center justify-between bg-gray-50 border rounded px-2 py-1 text-xs">
                            <span className="font-medium">{fr.ccpType} - {fr.processGroupName || '-'}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${fr.status === 'approved' ? 'bg-green-100 text-green-700' : fr.status === 'submitted' ? 'bg-blue-100 text-blue-700' : fr.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                              {fr.status === 'approved' ? 'OK' : fr.status === 'submitted' ? '검토중' : fr.status === 'rejected' ? '반려' : '작성중'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {ccpListForApproval && ccpListForApproval.length > 0 ? (
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {(ccpListForApproval as any[]).map((ccp: any) => (
                          <CcpInspectionCard key={ccp.id} ccp={ccp} onRecordSaved={refetchCcpForApproval} />
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">CCP 기록지를 불러오는 중이거나 생성되지 않았습니다.</div>
                    )}
                    <Button size="sm" variant="outline" className="w-full mt-2 text-blue-600 border-blue-300 h-7 text-xs"
                      onClick={() => { setDetailDialogOpen(false); setLocation(`/dashboard/batch/${selectedRequest.referenceId}`); }}
                    >배치 상세 / CCP 전체 보기</Button>
                  </div>
                )}
                {selectedRequest.reviewComments && (<div className="text-xs text-blue-600 bg-blue-50 p-2 rounded">검토: {selectedRequest.reviewComments}</div>)}
                {selectedRequest.notes && selectedRequest.status === "approved" && (<div className="text-xs text-green-600 bg-green-50 p-2 rounded">승인: {selectedRequest.notes}</div>)}
                {selectedRequest.rejectionReason && (<div className="text-xs text-red-600 bg-red-50 p-2 rounded">반려: {selectedRequest.rejectionReason}</div>)}
              </div>
            )}
            <DialogFooter className="flex-wrap gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setDetailDialogOpen(false)}>닫기</Button>
              {selectedRequest && ['daily_log', 'weekly_log', 'monthly_log'].includes(selectedRequest.requestType) && selectedRequest.status !== 'approved' && (() => {
                const routeMap: Record<string, string> = { daily_log: '/daily-log/daily', weekly_log: '/weekly-log/form', monthly_log: '/monthly-log/form' };
                const route = routeMap[selectedRequest.requestType];
                const dateMatch = selectedRequest.title?.match(/(\d{4}-\d{2}-\d{2})/);
                const dateParam = dateMatch ? dateMatch[1] : '';
                return (
                  <Button variant="outline" size="sm" className="text-amber-600 border-amber-300"
                    onClick={() => { setDetailDialogOpen(false); setLocation(`${route}?date=${dateParam}&id=${selectedRequest.referenceId}`); }}
                  ><FileText className="h-3.5 w-3.5 mr-1" />수정</Button>
                );
              })()}
              {selectedRequest && (selectedRequest.requestType === "batch_production" || selectedRequest.requestType === "batch_approval") && selectedRequest.referenceId && (
                <Button variant="outline" size="sm" className="text-blue-600"
                  onClick={() => { setDetailDialogOpen(false); setLocation(`/dashboard/batch/${selectedRequest.referenceId}`); }}
                ><Package className="h-3.5 w-3.5 mr-1" />배치</Button>
              )}
              {selectedRequest && (selectedRequest.status === "pending_review" || selectedRequest.status === "pending") && canReview && (
                <>
                  <Button size="sm" className="bg-orange-500 hover:bg-orange-600"
                    onClick={() => { setDetailDialogOpen(false); setComment(""); setReviewDialogOpen(true); }}
                  ><UserCheck className="h-3.5 w-3.5 mr-1" />검토</Button>
                  <Button size="sm" variant="destructive" onClick={() => { setDetailDialogOpen(false); setComment(""); setRejectDialogOpen(true); }}>반려</Button>
                </>
              )}
              {selectedRequest?.status === "pending_approval" && canApprove && (
                <>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700"
                    onClick={() => { setDetailDialogOpen(false); setComment(""); setApproveDialogOpen(true); }}
                  ><ShieldCheck className="h-3.5 w-3.5 mr-1" />승인</Button>
                  <Button size="sm" variant="destructive" onClick={() => { setDetailDialogOpen(false); setComment(""); setRejectDialogOpen(true); }}>반려</Button>
                </>
              )}
              {selectedRequest?.status === "approved" && (
                <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard/document-output")}><Printer className="h-3.5 w-3.5 mr-1" />출력</Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 품목제조보고 승인 다이얼로그 */}
        <Dialog open={recipeApproveDialogOpen} onOpenChange={setRecipeApproveDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-base">품목제조보고 승인</DialogTitle></DialogHeader>
            {selectedRecipe && (
              <div className="text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">레시피:</span><span className="font-medium">{selectedRecipe.recipeName}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">버전:</span><span>{selectedRecipe.version}</span></div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRecipeApproveDialogOpen(false)}>취소</Button>
              <Button size="sm" onClick={() => { if (selectedRecipe) approveRecipeMutation.mutate({ recipeId: selectedRecipe.id }); }} disabled={approveRecipeMutation.isPending}>
                {approveRecipeMutation.isPending ? "..." : "승인"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 품목제조보고 반려 다이얼로그 */}
        <Dialog open={recipeRejectDialogOpen} onOpenChange={setRecipeRejectDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-base">품목제조보고 반려</DialogTitle></DialogHeader>
            <div>
              <Label className="text-xs">반려 사유 (필수)</Label>
              <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} placeholder="반려 사유..." rows={2} className="text-sm" required />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setRecipeRejectDialogOpen(false)}>취소</Button>
              <Button size="sm" variant="destructive"
                onClick={() => { if (selectedRecipe && rejectionReason.trim()) rejectRecipeMutation.mutate({ recipeId: selectedRecipe.id, reason: rejectionReason }); }}
                disabled={!rejectionReason.trim() || rejectRecipeMutation.isPending}
              >
                {rejectRecipeMutation.isPending ? "..." : "반려"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
