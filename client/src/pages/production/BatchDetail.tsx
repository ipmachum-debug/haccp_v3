import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";

// 배치 상세 도메인 타입 — trpc proxy 가 깊은 타입을 완전히 전파하지 못해 명시 추출
type MaterialRow = RouterOutput["material"]["list"]["items"][number];
type BatchInput = RouterOutput["inventory"]["getBatchInputs"][number];
type InventoryLot = RouterOutput["inventory"]["getLotsByMaterialId"][number];
type CcpInstance = RouterOutput["ccp"]["getByBatchId"][number];
type BatchCostMaterial = {
  materialId?: number;
  materialName: string;
  unitPrice?: number | string;
  usedAmount?: number | string;
  cost?: number | string;
  totalCost?: number | string;
  isWater?: boolean;
  [k: string]: unknown;
};
type CcpCheckIncomplete = { ccpType: string; reason?: string; message?: string };
type AiAlert = { id: number; level?: string; title?: string; message?: string; [k: string]: unknown };
import { ArrowLeft, Package, Zap, CheckCircle2, Clock, AlertTriangle, Plus, FileDown, Trash2, Edit, CheckSquare, Square, UserCheck, DollarSign, TrendingUp, History as HistoryIcon, Loader2, RefreshCw, Settings, ClipboardCheck, Brain, Shield, XCircle } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { CcpInspectionCard } from "@/components/ccp/CcpInspectionCard";
import { CcpMonitoringForms } from "@/components/ccp/CcpMonitoringForms";
import ApprovalTimeline from "@/components/dashboard/ApprovalTimeline";
import { BatchCompletionDialog } from "@/components/batch/BatchCompletionDialog";

import { todayLocal } from "../../lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
// 2026-04-19 분해: AI 리스크 요약 카드 → _batchDetail/BatchAIRiskCard
import { BatchAIRiskCard } from "./_batchDetail/BatchAIRiskCard";

/** 배치 기본정보 요약 (BOM 배치량 + 배치수 + 처리모드 + 생성일) */
function BatchInfoSummary({ productId, plannedQuantity, mode, createdAt }: {
  productId?: number; plannedQuantity?: number; mode?: string | null; createdAt: string | Date;
}) {
  const L = useIndustryLabel();
  const { data: bomData } = trpc.ccpForm.getBomBatchKg.useQuery(
    { productId: productId! },
    { enabled: !!productId }
  );
  const bomBatchKg = bomData?.bomBatchKg;
  const batchCount = bomBatchKg && plannedQuantity && bomBatchKg > 0
    ? Math.ceil(plannedQuantity / bomBatchKg) : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
      <div>
        <div className="text-sm font-medium text-muted-foreground">BOM 1{L("batch")} 기준량</div>
        <div className="text-lg font-semibold mt-1">
          {bomBatchKg ? `${bomBatchKg.toLocaleString("ko-KR")} kg` : <span className="text-muted-foreground">-</span>}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium text-muted-foreground">{`${L("batch")} 수`}</div>
        <div className="text-lg font-semibold mt-1">
          {batchCount ? (
            <span>{batchCount}배치 <span className="text-sm font-normal text-muted-foreground">({plannedQuantity}kg ÷ {bomBatchKg}kg)</span></span>
          ) : <span className="text-muted-foreground">-</span>}
        </div>
      </div>
      <div>
        <div className="text-sm font-medium text-muted-foreground">처리 모드</div>
        <div className="text-lg font-semibold mt-1">{mode === "auto" ? "자동" : "수동"}</div>
      </div>
      <div>
        <div className="text-sm font-medium text-muted-foreground">생성일</div>
        <div className="text-lg font-semibold mt-1">
          {new Date(createdAt).toLocaleDateString("ko-KR")}
        </div>
      </div>
    </div>
  );
}

export default function BatchDetail() {
  const L = useIndustryLabel();
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const batchId = params.id ? parseInt(params.id, 10) : 0;

  const { data: batch, isLoading } = trpc.batch.getById.useQuery({ id: batchId });
  const { data: ccpList, refetch: refetchCcps, isLoading: ccpLoading } = trpc.ccp.getByBatchId.useQuery(
    { batchId },
    { enabled: !!batchId }
  );
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as { items?: MaterialRow[] } | undefined)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  const { data: batchInputs, refetch: refetchInputs } = trpc.inventory.getBatchInputs.useQuery({ batchId }, { enabled: !!batchId });
  const { data: batchCost } = trpc.batch.getCost.useQuery({ batchId }, { enabled: !!batchId });
  const { data: batchCompletion } = trpc.batch.checkCompletion.useQuery({ batchId }, { enabled: !!batchId && batch?.mode === "manual" });

  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [inputQuantity, setInputQuantity] = useState("");
  const [selectedCcpIds, setSelectedCcpIds] = useState<number[]>([]);
  const [showCostAnalysis, setShowCostAnalysis] = useState(false);
  const [revenueInput, setRevenueInput] = useState("");
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  // 자동 CCP 생성 시도 여부 추적 (중복 방지)
  const autoCreateAttempted = useRef(false);
  // 자동 모드 승인관리 이동 여부 추적 (중복 방지)
  const autoNavigated = useRef(false);

  // 차트 색상
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  const { data: lots, refetch: refetchLots } = trpc.inventory.getLotsByMaterialId.useQuery(
    { materialId: selectedMaterialId! },
    { enabled: !!selectedMaterialId }
  );

  const utils = trpc.useUtils();

  const updateStatusMutation = trpc.batch.updateStatus.useMutation({
    onSuccess: async (data: { message?: string; [k: string]: unknown }, variables: { id: number; status: string; [k: string]: unknown }) => {
      toast.success(`${L("batch")} 상태가 변경되었습니다`);

      // 배치 완료 시 승인 요청 자동 생성
      if (variables.status === "completed" && batch) {
        try {
          await utils.client.approval.createRequest.mutate({
            requestType: "batch_production",
            referenceType: "batch",
            referenceId: batchId,
            title: `${L("batch")} 생산 승인 - ${batch.batchCode}`,
            description: `계획일: ${new Date(batch.plannedDate).toLocaleDateString()}\n상태: 완료\n${L("batch")} 코드: ${batch.batchCode}`,
            priority: "high" as const,
          });
          toast.success(`${L("batch")} 완료 및 승인 요청이 생성되었습니다.`);
        } catch (error) {
          toast.error(`${L("batch")}는 완료되었으나 승인 요청 생성에 실패했습니다.`);
        }
      }
    },
    onError: (error: { message: string }) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  // ── CCP 자동 생성 뮤테이션 ──
  const generateCcpMutation = trpc.batch.generateCcp.useMutation({
    onSuccess: (result: { message?: string; [k: string]: unknown }) => {
      if ((result as { alreadyExists?: boolean }).alreadyExists) {
        // 이미 있는 경우 조용히 refetch만
        refetchCcps();
        return;
      }
      const ccpCount = Number((result as { ccpCount?: number }).ccpCount ?? 0);
      if (ccpCount > 0) {
        toast.success(`CCP ${ccpCount}건 자동 생성 완료`, {
          description: result.message,
          duration: 4000,
        });
      } else {
        toast.warning("CCP 자동 생성 결과 없음", {
          description: result.message,
          duration: 5000,
        });
      }
      refetchCcps();

      // 자동 모드이고, CCP 자동 생성 성공 시 승인관리로 자동 이동 (중복 방지)
      // 이미 completed인 배치(백업 데이터 등)는 리다이렉트하지 않음
      if (batch?.mode === "auto" && batch?.status !== "completed" && ccpCount > 0 && !autoNavigated.current) {
        autoNavigated.current = true;
        toast.info("자동처리 완료: 승인관리로 이동합니다", {
          description: `CCP ${result.ccpCount}건 기록지 생성 완료 · 설비기준·공정기준 자동 삽입`,
          duration: 3000,
        });
        setTimeout(() => setLocation("/dashboard/approval"), 2000);
      }
    },
    onError: (error: { message: string }) => {
      toast.error(`CCP 생성 실패: ${error.message}`);
    },
  });

  // ── 페이지 로드 후 CCP 자동 생성 트리거 ──
  // 배치 조회 + CCP 목록 조회가 완료되고, CCP가 0건이면 자동으로 생성 시도
  // 이미 completed인 배치(백업/과거 데이터)는 자동 생성 건너뜀
  useEffect(() => {
    if (
      !ccpLoading &&
      !isLoading &&
      batch &&
      batch.status !== "completed" &&
      ccpList !== undefined &&
      ccpList.length === 0 &&
      !autoCreateAttempted.current &&
      !generateCcpMutation.isPending
    ) {
      autoCreateAttempted.current = true;
      console.log("[BatchDetail] CCP 없음 → 자동 생성 시도:", batchId);
      generateCcpMutation.mutate({ batchId });
    }
  }, [ccpLoading, isLoading, batch, ccpList]);

  const generateHaccpReportMutation = trpc.batch.generateHaccpReport.useMutation({
    onSuccess: (result: { message?: string; pdf: string; [k: string]: unknown }) => {
      const byteCharacters = atob(result.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `HACCP_Report_${batch?.batchCode || batchId}_${todayLocal()}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("HACCP 보고서가 다운로드되었습니다");
    },
    onError: (error: { message: string }) => {
      toast.error(`HACCP 보고서 생성 실패: ${error.message}`);
    },
  });

  const addMaterialInputMutation = trpc.inventory.addMaterialInput.useMutation({
    onSuccess: (result: { message?: string; [k: string]: unknown }) => {
      toast.success(result.message);
      refetchInputs();
      refetchLots();
      setSelectedMaterialId(null);
      setSelectedLotId(null);
      setInputQuantity("");
    },
    onError: (error: { message: string }) => {
      toast.error(`투입 실패: ${error.message}`);
    },
  });

  const updateRevenueMutation = trpc.batch.updateRevenue.useMutation({
    onSuccess: () => {
      toast.success("매출액이 업데이트되었습니다");
      setRevenueInput("");
      window.location.reload();
    },
    onError: (error: { message: string }) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  const deleteMaterialInputMutation = trpc.inventory.deleteMaterialInput.useMutation({
    onSuccess: (result: { message?: string; [k: string]: unknown }) => {
      toast.success(result.message);
      refetchInputs();
      refetchLots();
    },
    onError: (error: { message: string }) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const requestApprovalMutation = trpc.approval.requestBatchApproval.useMutation({
    onSuccess: () => {
      toast.success(`${L("batch")} 승인 요청이 전송되었습니다`);
    },
    onError: (error: { message: string }) => {
      toast.error(`승인 요청 실패: ${error.message}`);
    },
  });

  const approveBatchMutation = trpc.batch.approve.useMutation({
    onSuccess: () => {
      toast.success(`${L("batch")}가 승인되었습니다`);
      window.location.reload();
    },
    onError: (error: { message: string }) => {
      toast.error(`승인 실패: ${error.message}`);
    },
  });

  const rejectBatchMutation = trpc.batch.reject.useMutation({
    onSuccess: () => {
      toast.success(`${L("batch")}가 반려되었습니다`);
      window.location.reload();
    },
    onError: (error: { message: string }) => {
      toast.error(`반려 실패: ${error.message}`);
    },
  });

  const { data: approvalStatus } = trpc.batch.getApprovalStatus.useQuery(
    { batchId },
    { enabled: !!batchId }
  );

  const { data: ccpCheckStatus } = trpc.ccp.checkInspectionComplete.useQuery(
    { batchId },
    { enabled: !!batchId && batch?.status === "completed" }
  );

  const handleDeleteMaterialInput = (inputId: number) => {
    if (confirm(`${L("material")} 투입 내역을 삭제하시겠습니까? 재고가 자동으로 복구됩니다.`)) {
      deleteMaterialInputMutation.mutate({ inputId });
    }
  };

  const bulkDeleteCcpMutation = trpc.ccp.bulkDelete.useMutation({
    onSuccess: (result: { message?: string; [k: string]: unknown }) => {
      toast.success(result.message);
      refetchCcps();
      setSelectedCcpIds([]);
      // 삭제 후 자동 재생성 허용 (ref 리셋)
      autoCreateAttempted.current = false;
    },
    onError: (error: { message: string }) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleToggleCcp = (ccpId: number) => {
    setSelectedCcpIds((prev) =>
      prev.includes(ccpId) ? prev.filter((id) => id !== ccpId) : [...prev, ccpId]
    );
  };

  const handleBulkDeleteCcp = () => {
    if (selectedCcpIds.length === 0) {
      toast.error("삭제할 CCP를 선택해주세요");
      return;
    }
    if (confirm(`선택한 ${selectedCcpIds.length}건의 CCP를 삭제하시겠습니까?`)) {
      bulkDeleteCcpMutation.mutate({ instanceIds: selectedCcpIds });
    }
  };

  const handleGenerateCcp = () => {
    autoCreateAttempted.current = false; // 수동 재시도 허용
    generateCcpMutation.mutate({ batchId });
  };

  const handleAddMaterialInput = () => {
    if (!selectedMaterialId || !selectedLotId || !inputQuantity) {
      toast.error(`${L("material")}, LOT, 수량을 모두 입력해주세요`);
      return;
    }

    const selectedLot = lots?.find((lot: InventoryLot) => lot.id === selectedLotId);
    if (!selectedLot) {
      toast.error("선택한 LOT를 찾을 수 없습니다");
      return;
    }

    addMaterialInputMutation.mutate({
      batchId,
      materialId: selectedMaterialId,
      lotId: selectedLotId,
      quantity: inputQuantity,
      unit: selectedLot.unit,
    });
  };

  const handleStatusChange = (newStatus: "planned" | "in_progress" | "completed" | "shipped") => {
    updateStatusMutation.mutate({ id: batchId, status: newStatus });
  };

  // CCP 상태 배지
  const getCcpStatusBadge = () => {
    if (ccpLoading || generateCcpMutation.isPending) {
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          CCP 생성 중...
        </Badge>
      );
    }
    if (!ccpList || ccpList.length === 0) {
      return <Badge variant="destructive">CCP 미생성</Badge>;
    }
    const draftCount = ccpList.filter((c: CcpInstance) => c.status === "draft").length;
    const approvedCount = ccpList.filter((c: CcpInstance) => c.status === "approved").length;
    if (approvedCount === ccpList.length) {
      return <Badge className="bg-green-100 text-green-800">CCP 전체 승인됨</Badge>;
    }
    if (draftCount > 0) {
      return (
        <Badge variant="outline" className="text-orange-600 border-orange-300">
          CCP {ccpList.length}건 (작성 중 {draftCount})
        </Badge>
      );
    }
    return <Badge variant="outline">{ccpList.length}건</Badge>;
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span>{`${L("batch")} 정보 로딩 중...`}</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!batch) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Package className="h-16 w-16 text-muted-foreground" />
          <p className="text-muted-foreground">{`${L("batch")}를 찾을 수 없습니다`}</p>
          <Button onClick={() => setLocation("/dashboard/batch-management")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            목록으로 돌아가기
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setLocation("/dashboard/batch-management")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{batch.batchCode}</h1>
              <p className="text-muted-foreground mt-1">{(batch as any).productName || `${L("product")}명 없음`} · 배치 상세 정보</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getCcpStatusBadge()}
            {batch.mode === "manual" && batchCompletion && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
                <span className="text-sm font-medium">문서 완성도:</span>
                <span className={`text-sm font-bold ${
                  batchCompletion.completionRate === 100
                    ? "text-green-600"
                    : batchCompletion.completionRate >= 50
                      ? "text-orange-600"
                      : "text-red-600"
                }`}>
                  {batchCompletion.completionRate}%
                </span>
                <span className="text-xs text-muted-foreground">
                  ({batchCompletion.completedDocuments}/{batchCompletion.totalDocuments})
                </span>
              </div>
            )}
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                batch.status === "completed"
                  ? "bg-green-100 text-green-700"
                  : batch.status === "in_progress"
                    ? "bg-blue-100 text-blue-700"
                    : batch.status === "shipped"
                      ? "bg-purple-100 text-purple-700"
                      : "bg-orange-100 text-orange-700"
              }`}
            >
              {batch.status === "completed"
                ? "완료"
                : batch.status === "in_progress"
                  ? "진행 중"
                  : batch.status === "shipped"
                    ? "출하됨"
                    : "계획"}
            </span>
          </div>
        </div>

        {/* 배치 정보 카드 */}
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
            <CardDescription>{`${L("batch")}의 기본 정보입니다`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">{`${L("batch")} 코드`}</div>
                <div className="text-lg font-semibold mt-1">{batch.batchCode}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">{`${L("product")}명`}</div>
                <div className="text-lg font-semibold mt-1">{(batch as any).productName || "-"}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">계획 수량</div>
                <div className="text-lg font-semibold mt-1">
                  {batch.plannedQuantity ? `${parseFloat(batch.plannedQuantity).toLocaleString("ko-KR")} kg` : "-"}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">계획일</div>
                <div className="text-lg font-semibold mt-1">
                  {batch.plannedDate ? new Date(batch.plannedDate).toLocaleDateString("ko-KR") : "-"}
                </div>
              </div>
            </div>
            <BatchInfoSummary
              productId={(batch as any).productId ? Number((batch as any).productId) : undefined}
              plannedQuantity={batch.plannedQuantity ? parseFloat(batch.plannedQuantity) : undefined}
              mode={batch.mode}
              createdAt={batch.createdAt}
            />
          </CardContent>
        </Card>

        {/* AI 리스크 요약 카드 */}
        <BatchAIRiskCard batchId={batchId} />

        {/* 상태 관리 및 승인 */}
        <Card>
          <CardHeader>
            <CardTitle>상태 관리 및 승인</CardTitle>
            <CardDescription>{`${L("batch")}의 생산 단계를 변경하거나 승인/반려하세요`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 상태 변경 버튼 */}
              <div>
                <h4 className="text-sm font-semibold mb-2">생산 단계</h4>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant={batch.status === "planned" ? "default" : "outline"}
                    onClick={() => handleStatusChange("planned")}
                    disabled={updateStatusMutation.isPending}
                  >
                    계획
                  </Button>
                  <Button
                    variant={batch.status === "in_progress" ? "default" : "outline"}
                    onClick={() => handleStatusChange("in_progress")}
                    disabled={updateStatusMutation.isPending}
                  >
                    진행 중
                  </Button>
                  <Button
                    variant={batch.status === "completed" ? "default" : "outline"}
                    onClick={() => {
                      if (batch.status === "in_progress") {
                        setShowCompletionDialog(true);
                      } else {
                        handleStatusChange("completed");
                      }
                    }}
                    disabled={updateStatusMutation.isPending || batch.status === "completed"}
                  >
                    {batch.status === "completed" ? "완료됨" : "완료"}
                  </Button>
                  <Button
                    variant={batch.status === "shipped" ? "default" : "outline"}
                    onClick={() => handleStatusChange("shipped")}
                    disabled={updateStatusMutation.isPending}
                  >
                    출하됨
                  </Button>
                </div>
              </div>

              {/* 승인/반려 버튼 */}
              {batch.status === "completed" && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">{`${L("batch")} 승인`}</h4>
                  {approvalStatus?.status === "approved" ? (
                    <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                      <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-semibold">승인 완료</span>
                      </div>
                      {approvalStatus.approvalDate && (
                        <p className="text-sm text-muted-foreground mt-1">
                          승인 일시: {new Date(approvalStatus.approvalDate).toLocaleString("ko-KR")}
                        </p>
                      )}
                    </div>
                  ) : approvalStatus?.status === "rejected" ? (
                    <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-400 mb-2">
                        <AlertTriangle className="h-5 w-5" />
                        <span className="font-semibold">반려됨</span>
                      </div>
                      {approvalStatus.rejectionReason && (
                        <p className="text-sm">반려 사유: {approvalStatus.rejectionReason}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* CCP 점검 상태 표시 */}
                      {ccpCheckStatus && (
                        <div className={`p-3 rounded-lg border ${
                          ccpCheckStatus.allComplete
                            ? "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                            : "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800"
                        }`}>
                          <div className="text-sm">
                            <div className="font-semibold mb-1">
                              CCP 점검 상태: {ccpCheckStatus.completedCcps}/{ccpCheckStatus.totalCcps} 완료
                            </div>
                            <div className="text-xs text-muted-foreground">
                              적합: {ccpCheckStatus.passedCcps} | 부적합: {ccpCheckStatus.failedCcps}
                            </div>
                            {!ccpCheckStatus.allComplete && ccpCheckStatus.incompleteCcps.length > 0 && (
                              <div className="mt-2 text-xs">
                                <div className="font-semibold mb-1">미완료/부적합 CCP:</div>
                                <ul className="list-disc list-inside space-y-0.5">
                                  {ccpCheckStatus.incompleteCcps.map((ccp: CcpCheckIncomplete, idx: number) => (
                                    <li key={idx}>
                                      {ccp.ccpType} - {ccp.reason}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 승인/반려 버튼 */}
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            if (confirm(`${L("batch")}를 승인하시겠습니까?`)) {
                              approveBatchMutation.mutate({ batchId });
                            }
                          }}
                          disabled={
                            approveBatchMutation.isPending ||
                            !ccpCheckStatus?.allComplete
                          }
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          승인
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={() => {
                            const reason = prompt("반려 사유를 입력해주세요:");
                            if (reason && reason.trim()) {
                              rejectBatchMutation.mutate({
                                batchId,
                                rejectionReason: reason.trim()
                              });
                            } else if (reason !== null) {
                              toast.error("반려 사유를 입력해주세요");
                            }
                          }}
                          disabled={rejectBatchMutation.isPending}
                        >
                          <AlertTriangle className="mr-2 h-4 w-4" />
                          반려
                        </Button>
                      </div>

                      {!ccpCheckStatus?.allComplete && (
                        <p className="text-xs text-muted-foreground">
                          * 모든 CCP 점검이 완료되고 적합 판정을 받아야 승인할 수 있습니다.
                        </p>
                      )}
                      {/* 수동 모드: 승인관리 페이지로 이동 버튼 */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLocation("/dashboard/approval")}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        승인관리로 이동
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 승인 이력 타임라인 */}
        {batch.status === "completed" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <HistoryIcon className="h-5 w-5" />
                승인 이력
              </CardTitle>
              <CardDescription>{`${L("batch")} 승인 요청 및 처리 과정을 확인하세요`}</CardDescription>
            </CardHeader>
            <CardContent>
              <ApprovalTimeline batchId={batchId} />
            </CardContent>
          </Card>
        )}

        {/* 매출액 입력 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              매출액 관리
            </CardTitle>
            <CardDescription>{`${L("batch")}의 매출액을 입력하여 수익성을 분석하세요`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="revenue">매출액 (원)</Label>
                <Input
                  id="revenue"
                  type="number"
                  placeholder="매출액을 입력하세요"
                  value={revenueInput || batch.revenue || ""}
                  onChange={(e) => setRevenueInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const revenue = parseFloat(revenueInput);
                      if (!isNaN(revenue) && revenue >= 0) {
                        updateRevenueMutation.mutate({ batchId, revenue });
                      }
                    }
                  }}
                />
              </div>
              {batch.revenue && batchCost && (
                <div className="flex gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">원가</div>
                    <div className="text-lg font-semibold">{batchCost.totalCost.toLocaleString()}원</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">수익</div>
                    <div className={`text-lg font-semibold ${(parseFloat(batch.revenue) - batchCost.totalCost) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(parseFloat(batch.revenue) - batchCost.totalCost).toLocaleString()}원
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">수익률</div>
                    <div className={`text-lg font-semibold ${((parseFloat(batch.revenue) - batchCost.totalCost) / parseFloat(batch.revenue) * 100) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {((parseFloat(batch.revenue) - batchCost.totalCost) / parseFloat(batch.revenue) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 비용 분석 */}
        {batchCost && batchCost.materialCosts.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    비용 분석
                  </CardTitle>
                  <CardDescription>{`${L("batch")} 생산 비용 분석 및 ${L("material")}별 비용 현황`}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCostAnalysis(!showCostAnalysis)}
                >
                  {showCostAnalysis ? "숨기기" : "보기"}
                </Button>
              </div>
            </CardHeader>
            {showCostAnalysis && (
              <CardContent>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="p-6 border rounded-lg bg-blue-50 dark:bg-blue-950">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">{`총 ${L("material")} 비용`}</p>
                          <p className="text-3xl font-bold mt-1">
                            {batchCost.totalCost.toLocaleString('ko-KR')}원
                          </p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-blue-600" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">{`${L("material")}별 상세 비용`}</h4>
                      <div className="space-y-2">
                        {batchCost.materialCosts.map((item: BatchCostMaterial, index: number) => (
                          <div key={item.materialId} className={`p-3 border rounded-lg ${item.isWater ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-200' : ''}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm flex items-center gap-1.5">
                                {item.materialName}
                                {item.isWater && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border border-blue-200">원가제외</span>}
                              </span>
                              <span className="font-bold">{item.isWater ? '-' : `${Number(item.totalCost ?? 0).toLocaleString('ko-KR')}원`}</span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <div className="flex justify-between">
                                <span>수량:</span>
                                <span>{Number((item as { quantity?: number | string }).quantity ?? 0).toLocaleString('ko-KR')} {String((item as { unit?: string }).unit ?? '')}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>단가:</span>
                                <span>{item.isWater ? '-' : `${Number(item.unitPrice ?? 0).toLocaleString('ko-KR')}원/${String((item as { unit?: string }).unit ?? '')}`}</span>
                              </div>
                              {!item.isWater && (
                                <div className="flex justify-between">
                                  <span>비용 비율:</span>
                                  <span>{batchCost.totalCost > 0 ? ((Number(item.totalCost ?? 0) / batchCost.totalCost) * 100).toFixed(1) : 0}%</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="font-semibold text-sm">비용 분포</h4>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={batchCost.materialCosts.filter((item: BatchCostMaterial) => !item.isWater).map((item: BatchCostMaterial) => ({
                              name: item.materialName,
                              value: item.totalCost,
                            }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => `${batchCost.totalCost > 0 ? ((entry.value / batchCost.totalCost) * 100).toFixed(1) : 0}%`}
                            outerRadius={120}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {batchCost.materialCosts.filter((item: BatchCostMaterial) => !item.isWater).map((entry: BatchCostMaterial, index: number) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => `${value.toLocaleString('ko-KR')}원`} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* 원재료 투입 */}
        <Card>
          <CardHeader>
            <CardTitle>{`${L("material")} 투입`}</CardTitle>
            <CardDescription>{`${L("batch")}에 투입된 ${L("material")} 목록입니다`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 mb-6 p-4 border rounded-lg">
              <h3 className="font-semibold">{`${L("material")} 투입 추가`}</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="material">{`${L("material")} *`}</Label>
                  <Select
                    value={selectedMaterialId?.toString() || ""}
                    onValueChange={(value) => {
                      setSelectedMaterialId(parseInt(value));
                      setSelectedLotId(null);
                    }}
                  >
                    <SelectTrigger id="material">
                      <SelectValue placeholder={`${L("material")} 선택`} />
                    </SelectTrigger>
                    <SelectContent>
                      {(Array.isArray(materials) ? materials : []).map((material: any) => (
                        <SelectItem key={material.id} value={material.id.toString()}>
                          {material.materialName} ({material.materialCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lot">재고 LOT *</Label>
                  <Select
                    value={selectedLotId?.toString() || ""}
                    onValueChange={(value) => setSelectedLotId(parseInt(value))}
                    disabled={!selectedMaterialId}
                  >
                    <SelectTrigger id="lot">
                      <SelectValue placeholder="LOT 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {lots?.map((lot: InventoryLot) => (
                        <SelectItem key={lot.id} value={lot.id.toString()}>
                          {lot.lotNumber} (가용: {lot.availableQuantity}{lot.unit}, 유통기한: {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString("ko-KR") : "-"})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="quantity">투입 수량 *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.001"
                    placeholder="0.000"
                    value={inputQuantity}
                    onChange={(e) => setInputQuantity(e.target.value)}
                    disabled={!selectedLotId}
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={handleAddMaterialInput}
                    disabled={addMaterialInputMutation.isPending || !selectedMaterialId || !selectedLotId || !inputQuantity}
                    className="w-full"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {addMaterialInputMutation.isPending ? "투입 중..." : "투입"}
                  </Button>
                </div>
              </div>
            </div>

            {!batchInputs || batchInputs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                아직 투입된 원재료가 없습니다
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-medium">원재료명</th>
                      <th className="text-left p-3 font-medium">LOT ID</th>
                      <th className="text-left p-3 font-medium">계획 수량</th>
                      <th className="text-left p-3 font-medium">실제 수량</th>
                      <th className="text-left p-3 font-medium">단위</th>
                      <th className="text-left p-3 font-medium">투입 시간</th>
                      <th className="text-left p-3 font-medium">투입자</th>
                      <th className="text-right p-3 font-medium">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchInputs.map((input: BatchInput) => (
                      <tr key={input.id} className="border-b hover:bg-accent/50">
                        <td className="p-3">{String((input as { materialName?: string }).materialName ?? `원재료 #${input.materialId}`)}</td>
                        <td className="p-3">{input.lotId || "-"}</td>
                        <td className="p-3">{input.plannedQuantity}</td>
                        <td className="p-3">{input.actualQuantity || "-"}</td>
                        <td className="p-3">{input.unit}</td>
                        <td className="p-3">
                          {input.inputTime
                            ? new Date(input.inputTime).toLocaleString("ko-KR")
                            : "-"}
                        </td>
                        <td className="p-3">{input.inputBy || "-"}</td>
                        <td className="p-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteMaterialInput(input.id)}
                            disabled={deleteMaterialInputMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── CCP 점검 ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  CCP 점검
                  {getCcpStatusBadge()}
                </CardTitle>
                <CardDescription>
                  중요관리점(CCP) 점검 기록입니다 ·
                  {batch?.mode === "auto" ? (
                    <span className="ml-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                      <Zap className="inline h-3 w-3 mr-0.5" />
                      자동처리: 기록지 자동 생성 → 승인관리로 자동 이동
                    </span>
                  ) : (
                    <span className="ml-1 text-xs font-medium text-orange-600 dark:text-orange-400">
                      <ClipboardCheck className="inline h-3 w-3 mr-0.5" />
                      수동처리: 기초데이터 삽입됨 → 직접 확인 후 수동 승인
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                {selectedCcpIds.length > 0 && (
                  <Button
                    onClick={handleBulkDeleteCcp}
                    disabled={bulkDeleteCcpMutation.isPending}
                    size="sm"
                    variant="destructive"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {bulkDeleteCcpMutation.isPending ? "삭제 중..." : `선택 삭제 (${selectedCcpIds.length})`}
                  </Button>
                )}
                {/* CCP 자동 생성 / 재생성 버튼 */}
                <Button
                  onClick={handleGenerateCcp}
                  disabled={generateCcpMutation.isPending}
                  size="sm"
                  variant={(!ccpList || ccpList.length === 0) ? "default" : "outline"}
                >
                  {generateCcpMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      CCP 생성 중...
                    </>
                  ) : (!ccpList || ccpList.length === 0) ? (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      CCP 자동 생성
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      CCP 재생성
                    </>
                  )}
                </Button>
                {/* HACCP 보고서 / 배치 완료 보고서 */}
                {batch.status === "completed" && batch.completionReportUrl ? (
                  <Button
                    onClick={() => window.open(batch.completionReportUrl!, "_blank")}
                    size="sm"
                    variant="default"
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    배치 완료 보고서
                  </Button>
                ) : batch.status === "completed" ? (
                  <div className="text-sm text-muted-foreground px-4 py-2 rounded-md bg-muted">
                    보고서 생성 중...
                  </div>
                ) : (
                  <Button
                    onClick={() => generateHaccpReportMutation.mutate({ batchId })}
                    size="sm"
                    variant="outline"
                    disabled={generateHaccpReportMutation.isPending}
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    {generateHaccpReportMutation.isPending ? "보고서 생성 중..." : "HACCP 보고서"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* CCP 로딩 중 */}
            {(ccpLoading || generateCcpMutation.isPending) && (!ccpList || ccpList.length === 0) ? (
              <div className="flex flex-col items-center py-10 gap-3 text-muted-foreground">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="font-medium">
                  {generateCcpMutation.isPending
                    ? "공정그룹·설비 기준값을 적용하여 CCP를 자동 생성하고 있습니다..."
                    : "CCP 목록을 불러오는 중..."}
                </p>
                <p className="text-xs">설비기준(온도/압력) + 공정기준(시간) 자동 매핑 중</p>
              </div>
            ) : !ccpList || ccpList.length === 0 ? (
              /* CCP 없음 상태 */
              <div className="text-center py-10">
                <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                  <Settings className="h-8 w-8 text-orange-500" />
                </div>
                <p className="font-semibold text-lg mb-1">CCP가 생성되지 않았습니다</p>
                <p className="text-sm text-muted-foreground mb-4">
                  공정그룹-제품 연결이 없거나 설비가 등록되지 않았습니다.
                </p>
                <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                    확인 경로: 공정관리 → 공정그룹 → 제품연결 탭에서 이 제품이 연결되어 있는지 확인
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                    설비 등록: 공정관리 → 공정그룹 → 설비 탭에서 설비를 등록하세요
                  </div>
                </div>
                <Button onClick={handleGenerateCcp} disabled={generateCcpMutation.isPending}>
                  <Zap className="mr-2 h-4 w-4" />
                  CCP 자동 생성 재시도
                </Button>
              </div>
            ) : (
              /* CCP 목록 표시 */
              <div className="space-y-4">
                {/* 처리 흐름 안내 배너 */}
                {batch?.mode === "auto" ? (
                  <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-xs text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                    <Zap className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold">자동처리 완료:</span> 설비기준(온도/압력) · 공정기준(시간)이 자동으로 삽입되었습니다.<br />
                      각 CCP 카드에서 실측값을 확인한 후{" "}
                      <Button variant="link" className="h-auto p-0 text-xs font-semibold text-blue-700 dark:text-blue-300" onClick={() => setLocation("/dashboard/approval")}>
                        승인관리 →
                      </Button>
                      {" "}에서 승인 처리하세요.
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg text-sm text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                    <ClipboardCheck className="h-5 w-5 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-semibold mb-1">수동처리 흐름</div>
                      <ol className="text-xs space-y-0.5 mb-3 list-decimal list-inside">
                        <li>아래 CCP 카드에서 각 설비의 실측값(온도·압력·시간)을 확인·입력</li>
                        <li>모든 항목 확인 후 아래 <strong>승인 요청 등록</strong> 버튼 클릭</li>
                        <li>승인관리 페이지에서 최종 검토·승인 처리</li>
                      </ol>
                      <Button
                        size="sm"
                        className="bg-orange-600 hover:bg-orange-700 text-white w-full"
                        onClick={async () => {
                          try {
                            await utils.client.approval.createRequest.mutate({
                              requestType: "batch_production",
                              referenceType: "batch",
                              referenceId: batchId,
                              title: `[수동] 배치 CCP 승인 요청 - ${batch?.batchCode || ""}`,
                              description: `제품: ${batch?.productName || ""}
배치: ${batch?.batchCode || ""}
CCP 기록지 수동 확인 후 승인 요청`,
                              priority: "high" as const,
                            });
                            toast.success("승인 요청이 등록되었습니다. 승인관리 페이지로 이동합니다.");
                            setTimeout(() => setLocation("/dashboard/approval"), 1200);
                          } catch (err) {
                            toast.error("승인 요청 등록 실패: " + (err as Error)?.message);
                          }
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        승인 요청 등록 → 승인관리로 이동
                      </Button>
                    </div>
                  </div>
                )}
                {ccpList.map((ccp: CcpInstance) => (
                  <div key={ccp.id} className="relative">
                    {/* 체크박스 (삭제 선택용) */}
                    <button
                      className="absolute top-3 right-3 z-10"
                      onClick={() => handleToggleCcp(ccp.id)}
                    >
                      {selectedCcpIds.includes(ccp.id)
                        ? <CheckSquare className="h-5 w-5 text-primary" />
                        : <Square className="h-5 w-5 text-muted-foreground/40 hover:text-muted-foreground" />
                      }
                    </button>
                    <CcpInspectionCard key={ccp.id} ccp={ccp} onRecordSaved={refetchCcps} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── CCP 모니터링 기록지 (공식 양식) ── */}
        {batch && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                CCP 모니터링 기록지
                <Badge variant="outline" className="text-xs">공식 양식</Badge>
              </CardTitle>
              <CardDescription>
                중요관리점(CCP) 모니터링 일지 작성 · 배치수 자동계산(생산량 ÷ BOM배치량) · 승인요청 연동
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CcpMonitoringForms
                batchId={batchId}
                batchNumber={batch.batchCode}
                productId={(batch as any).productId ? Number((batch as any).productId) : undefined}
                productName={batch.productName ?? undefined}
                plannedQtyKg={batch.plannedQuantity ? parseFloat(batch.plannedQuantity) : undefined}
                workDate={batch.plannedDate ?? todayLocal()}
                onFormSaved={() => {
                  refetchCcps();
                }}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* 배치 완료 다이얼로그 */}
      {batch && (
        <BatchCompletionDialog
          batchId={batchId}
          batchCode={batch.batchCode}
          plannedQuantity={parseFloat(batch.plannedQuantity)}
          open={showCompletionDialog}
          onOpenChange={setShowCompletionDialog}
          onSuccess={() => {
            window.location.reload();
          }}
        />
      )}
    </DashboardLayout>
  );
}

// ============================================================================
// AI 리스크 요약 카드 컴포넌트
// ============================================================================
