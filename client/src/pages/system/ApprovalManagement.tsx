// ═══════════════════════════════════════════════════════════════
// ApprovalManagement.tsx - 승인 관리 페이지
// 3단계 승인 워크플로 (작성 → 검토 → 승인)
// 검토 대기, 승인 대기, 처리 이력, 품목제조보고 승인 탭
// ═══════════════════════════════════════════════════════════════
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
// Phase Plugin-6: Approval Engine — Plugin 기반 승인 entity / 탭 동적화
import { useDomainPlugin } from "@/domain/useDomainPlugin";
import { getApprovalEntityTypes } from "@/domain/engines/clientApprovalEngine";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

// 2026-04-19 분해: 도메인 타입 / 상수 / 유틸 컴포넌트 분리
import type {
  ApprovalRequest, ApprovalSetting, EmployeeRow,
  PendingRecipe, RecipeHistory, CcpFormRecord, CcpInstance,
} from "./_approvalManagement/types";
import {
  REQUEST_TYPE_LABELS, REQUEST_TYPE_ICONS, REQUEST_CATEGORIES,
  CATEGORY_COLORS, STATUS_LABELS, STATUS_COLORS,
} from "./_approvalManagement/constants";
import { ApprovalStepsInline } from "./_approvalManagement/ApprovalStepsInline";
import { RequestRow } from "./_approvalManagement/RequestRow";
import { RequestDetailDialog } from "./_approvalManagement/RequestDetailDialog";
import { ApprovalActionDialogs } from "./_approvalManagement/ApprovalActionDialogs";
import { useApprovalMutations } from "./_approvalManagement/useApprovalMutations";

import {
  CheckCircle, Clock, XCircle, AlertCircle, FileText, Package, Droplet,
  ClipboardCheck, FileCheck, Utensils, TrendingUp, Eye, Printer,
  ClipboardList, CheckSquare, Square, ListChecks, ArrowRight,
  Shield, Trash2, AlertTriangle,
  UserCheck, ShieldCheck, RefreshCw, History, Filter, Ban,
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
import { CcpInspectionCard } from "@/components/ccp/CcpInspectionCard";

import { formatLocalDate } from "../../lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function ApprovalManagement() {
  const L = useIndustryLabel();
  const [, setLocation] = useLocation();
  // Phase Plugin-6: 산업 plugin 기반 — "품목제조보고" 탭은 HACCP 전용
  // (food plugin 의 approvals.entityTypes 에 "food_product_report" 정의됨)
  const { plugin: domainPlugin } = useDomainPlugin();
  const approvalEntityTypes = domainPlugin ? getApprovalEntityTypes(domainPlugin) : [];
  const showRecipeTab = !domainPlugin // 폴백: legacy 동작 (모두 노출)
    || approvalEntityTypes.some((t) => t.code === "food_product_report");
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

  // ═══════════════════════════════════════════════════════════════
  // 상태 및 권한 조회
  // ═══════════════════════════════════════════════════════════════
  const { data: myApprovalRole } = trpc.organization.getMyApprovalRole.useQuery();
  const canReview = myApprovalRole?.approvalRole === "reviewer" || myApprovalRole?.approvalRole === "approver";
  const canApprove = myApprovalRole?.approvalRole === "approver";
  const currentRole = myApprovalRole?.approvalRole || "none";
  // ═══════════════════════════════════════════════════════════════
  // 3단계 승인 데이터 조회 (tRPC queries)
  // ═══════════════════════════════════════════════════════════════

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
      status: statusFilter === "all" ? undefined : statusFilter as "pending_review" | "pending_approval" | "approved" | "rejected" | "cancelled",
      requestType: typeFilter === "all" ? undefined : typeFilter as string,
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
    const setting = (allApprovalSettings as ApprovalSetting[]).find((s) => s.documentType === requestType);
    if (!setting) return null;
    const findName = (empId: number | null | undefined) => {
      if (empId == null) return null;
      const emp = (allEmployees as EmployeeRow[]).find((e) => e.id === empId);
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
    let list: ApprovalRequest[] = statusFilter === "all"
      ? ((historyAll as ApprovalRequest[] | undefined) || []).filter((r) => r.status === "approved" || r.status === "rejected" || r.status === "cancelled")
      : ((historyAll as ApprovalRequest[] | undefined) || []);
    // 날짜 필터 적용
    if (historyDateFrom) {
      list = list.filter((r) => {
        const d = r.approvedAt || r.rejectedAt || r.requestedAt || r.createdAt;
        return d && formatLocalDate(new Date(d as string | Date)) >= historyDateFrom;
      });
    }
    if (historyDateTo) {
      list = list.filter((r) => {
        const d = r.approvedAt || r.rejectedAt || r.requestedAt || r.createdAt;
        return d && formatLocalDate(new Date(d as string | Date)) <= historyDateTo;
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
  const allReviewRequests: ApprovalRequest[] = (() => {
    const combined = [...((reviewRequests as ApprovalRequest[] | undefined) || []), ...((pendingRequests as ApprovalRequest[] | undefined) || [])];
    const filtered = combined.filter((r) =>
      r.status === "pending_review" || r.status === "pending"
    );
    const seen = new Set<number>();
    return filtered.filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  })();

  // ═══════════════════════════════════════════════════════════════
  // 3단계 승인 Mutations — useApprovalMutations 훅으로 캡슐화 (2026-04-19 분해)
  // ═══════════════════════════════════════════════════════════════
  const {
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
  } = useApprovalMutations({
    setReviewDialogOpen,
    setApproveDialogOpen,
    setRejectDialogOpen,
    setCancelDialogOpen,
    setBatchConfirmDialogOpen,
    setRecipeApproveDialogOpen,
    setRecipeRejectDialogOpen,
    setComment,
    setRejectionReason,
    setSelectedRequest,
    setSelectedRecipe,
    setSelectedIds,
    setActiveTab,
    refetchReview,
    refetchPending,
    refetchApproval,
    refetchHistory,
    refetchPendingRecipes,
  });

  // ═══════════════════════════════════════════════════════════════
  // 이벤트 핸들러 (승인, 반려, 삭제, 일괄 처리)
  // ═══════════════════════════════════════════════════════════════

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
      allReviewRequests.some((r) => r.id === id)
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
      allReviewRequests.some((r) => r.id === id)
    );
    batchReviewMutation.mutate({ approvalRequestIds: reviewIds });
  };

  // 일괄 승인 핸들러 (확인 다이얼로그 경유)
  const handleBatchApprove = () => {
    const approveIds = selectedIds.filter(id => 
      ((approvalRequests as ApprovalRequest[] | undefined) || []).some((r) => r.id === id)
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
      ((approvalRequests as ApprovalRequest[] | undefined) || []).some((r) => r.id === id)
    );
    batchApproveMutation.mutate({ approvalRequestIds: approveIds });
  };

  // 검토 대기 탭에서 승인자가 일괄 검토+승인 (바로 승인)
  const handleBatchDirectApprove = () => {
    const reviewIds = selectedIds.filter(id => 
      allReviewRequests.some((r) => r.id === id)
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

  const toggleSelectAll = (list: ApprovalRequest[]) => {
    const allIds = list.map((r) => r.id);
    const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));
    setSelectedIds(allSelected ? [] : allIds);
  };

  // 카테고리 필터링
  const filterByCategory = (list: ApprovalRequest[]): ApprovalRequest[] => {
    if (categoryFilter === "all") return list;
    return list.filter((r) => {
      const cat = REQUEST_CATEGORIES[r.requestType] || "기타";
      return cat === categoryFilter;
    });
  };

  const filteredReview = filterByCategory(allReviewRequests);
  const filteredApproval = filterByCategory(
    ((approvalRequests as ApprovalRequest[] | undefined) || []).filter((r) => r.status === "pending_approval")
  );

  // 카테고리별 통계
  const reviewCategoryStats = allReviewRequests.reduce<Record<string, number>>((acc, r) => {
    const cat = REQUEST_CATEGORIES[r.requestType] || "기타";
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  // 선택된 항목 수 계산
  const selectedReviewCount = selectedIds.filter(id => allReviewRequests.some((r) => r.id === id)).length;
  const selectedApprovalCount = selectedIds.filter(id => ((approvalRequests as ApprovalRequest[] | undefined) || []).some((r) => r.id === id)).length;

  // ═══════════════════════════════════════════════════════════════
  // 테이블 행 렌더링 (컴팩트 모드)
  // ═══════════════════════════════════════════════════════════════

  const renderRequestRow = (
    request: ApprovalRequest,
    mode: "review" | "approve" | "readonly" = "readonly"
  ) => {
    const settingNames = getApprovalSettingNames(request.requestType || "");
    return (
      <RequestRow
        key={request.id}
        request={request}
        mode={mode}
        isSelected={selectedIds.includes(request.id)}
        canReview={canReview}
        canApprove={canApprove}
        writerName={settingNames?.writerName}
        reviewerName={settingNames?.reviewerName}
        approverName={settingNames?.approverName}
        autoReviewApprovePending={autoReviewApproveMutation.isPending}
        onToggleSelect={toggleSelect}
        onOpenDetail={(r) => { setSelectedRequest(r); setDetailDialogOpen(true); }}
        onOpenReview={(r) => { setSelectedRequest(r); setComment(""); setReviewDialogOpen(true); }}
        onAutoReviewApprove={(r) => { setSelectedRequest(r); setComment(""); handleAutoReviewApprove(); }}
        onOpenApprove={(r) => { setSelectedRequest(r); setComment(""); setApproveDialogOpen(true); }}
        onOpenReject={(r) => { setSelectedRequest(r); setComment(""); setRejectDialogOpen(true); }}
        onOpenCancel={(r) => { setSelectedRequest(r); setComment(""); setCancelDialogOpen(true); }}
        onNavigate={setLocation}
      />
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
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as typeof activeTab); setSelectedIds([]); }}>
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
            {/* ★ Phase Plugin-6: 품목제조보고는 HACCP 전용 (식품안전관리법 §31) */}
            {showRecipeTab && (
              <>
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
              </>
            )}
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
                  {filteredReview.every((r: ApprovalRequest) => selectedIds.includes(r.id))
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
                  {filteredReview.map((request: ApprovalRequest) => renderRequestRow(request, "review"))}
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
                  {filteredApproval.every((r: ApprovalRequest) => selectedIds.includes(r.id))
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
                  {filteredApproval.map((request: ApprovalRequest) => renderRequestRow(request, "approve"))}
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
                      <SelectItem value="batch_production">{L("batch")} CCP</SelectItem>
                      <SelectItem value="ccp_form">CCP 기록지</SelectItem>
                      <SelectItem value="batch_approval">{L("batch")} 승인</SelectItem>
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
                  {historyRequests.map((request: ApprovalRequest) => renderRequestRow(request, "readonly"))}
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
                  {pendingRecipes.map((recipe: PendingRecipe) => (
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
                  {recipeHistory.map((recipe: RecipeHistory) => (
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
        {/* 액션 다이얼로그 묶음 (2026-04-19 분해: ApprovalActionDialogs) */}
        {/* 검토 / 승인 / 반려 / 삭제 / 일괄 / 레시피승인 / 레시피반려 */}
        {/* ============================================================ */}
        <ApprovalActionDialogs
          selectedRequest={selectedRequest}
          selectedRecipe={selectedRecipe}
          comment={comment}
          setComment={setComment}
          rejectionReason={rejectionReason}
          setRejectionReason={setRejectionReason}
          canApprove={canApprove}
          batchConfirmAction={batchConfirmAction}
          selectedReviewCount={selectedReviewCount}
          selectedApprovalCount={selectedApprovalCount}
          reviewDialogOpen={reviewDialogOpen}
          setReviewDialogOpen={setReviewDialogOpen}
          approveDialogOpen={approveDialogOpen}
          setApproveDialogOpen={setApproveDialogOpen}
          rejectDialogOpen={rejectDialogOpen}
          setRejectDialogOpen={setRejectDialogOpen}
          cancelDialogOpen={cancelDialogOpen}
          setCancelDialogOpen={setCancelDialogOpen}
          batchConfirmDialogOpen={batchConfirmDialogOpen}
          setBatchConfirmDialogOpen={setBatchConfirmDialogOpen}
          recipeApproveDialogOpen={recipeApproveDialogOpen}
          setRecipeApproveDialogOpen={setRecipeApproveDialogOpen}
          recipeRejectDialogOpen={recipeRejectDialogOpen}
          setRecipeRejectDialogOpen={setRecipeRejectDialogOpen}
          reviewPending={reviewMutation.isPending}
          approvePending={approveMutation.isPending}
          rejectReviewPending={rejectReviewMutation.isPending}
          rejectApprovalPending={rejectApprovalMutation.isPending}
          autoReviewApprovePending={autoReviewApproveMutation.isPending}
          deletePending={deleteMutation.isPending}
          batchReviewPending={batchReviewMutation.isPending}
          batchApprovePending={batchApproveMutation.isPending}
          approveRecipePending={approveRecipeMutation.isPending}
          rejectRecipePending={rejectRecipeMutation.isPending}
          onReview={handleReview}
          onAutoReviewApprove={handleAutoReviewApprove}
          onApprove={handleApprove}
          onReject={handleReject}
          onCancel={handleCancel}
          onConfirmBatchReview={confirmBatchReview}
          onConfirmBatchApprove={confirmBatchApprove}
          onApproveRecipe={(recipeId) => approveRecipeMutation.mutate({ recipeId })}
          onRejectRecipe={(recipeId, reason) => rejectRecipeMutation.mutate({ recipeId, reason })}
        />

        {/* ============================================================ */}
        {/* 상세 보기 다이얼로그 (2026-04-19 분해: _approvalManagement/RequestDetailDialog) */}
        {/* ============================================================ */}
        <RequestDetailDialog
          open={detailDialogOpen}
          onOpenChange={setDetailDialogOpen}
          request={selectedRequest}
          canReview={canReview}
          canApprove={canApprove}
          settingNames={selectedRequest ? getApprovalSettingNames(selectedRequest.requestType || "") : null}
          ccpFormRecords={(ccpFormRecords as CcpFormRecord[]) || []}
          ccpListForApproval={ccpListForApproval as CcpInstance[] | undefined}
          onRecordSaved={refetchCcpForApproval}
          onClose={() => setDetailDialogOpen(false)}
          onOpenReview={() => { setComment(""); setReviewDialogOpen(true); }}
          onOpenApprove={() => { setComment(""); setApproveDialogOpen(true); }}
          onOpenReject={() => { setComment(""); setRejectDialogOpen(true); }}
          onNavigate={setLocation}
        />
      </div>
    </DashboardLayout>
  );
}
