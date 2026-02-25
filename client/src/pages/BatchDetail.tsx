import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Package, Zap, CheckCircle2, Clock, AlertTriangle, Plus, FileDown, Trash2, Edit, CheckSquare, Square, UserCheck, DollarSign, TrendingUp, History as HistoryIcon } from "lucide-react";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { CcpInspectionCard } from "@/components/CcpInspectionCard";
import ApprovalTimeline from "@/components/ApprovalTimeline";
import { BatchCompletionDialog } from "@/components/batch/BatchCompletionDialog";

export default function BatchDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const batchId = params.id ? parseInt(params.id, 10) : 0;

  const { data: batch, isLoading } = trpc.batch.getById.useQuery({ id: batchId });
  const { data: ccpList, refetch: refetchCcps } = trpc.ccp.getByBatchId.useQuery({ batchId }, { enabled: !!batchId });
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
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
  
  // 차트 색상
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
  
  const { data: lots, refetch: refetchLots } = trpc.inventory.getLotsByMaterialId.useQuery(
    { materialId: selectedMaterialId! },
    { enabled: !!selectedMaterialId }
  );
  
  const utils = trpc.useUtils();

  const updateStatusMutation = trpc.batch.updateStatus.useMutation({
    onSuccess: async (data, variables) => {
      toast.success("배치 상태가 변경되었습니다");
      
      // 배치 완료 시 승인 요청 자동 생성
      if (variables.status === "completed" && batch) {
        try {
          await utils.client.approval.createRequest.mutate({
            requestType: "batch_production",
            referenceType: "batch",
            referenceId: batchId,
            title: `배치 생산 승인 - ${batch.batchCode}`,
            description: `계획일: ${new Date(batch.plannedDate).toLocaleDateString()}\n상태: 완료\n배치 코드: ${batch.batchCode}`,
            priority: "high" as const,
          });
          toast.success("배치 완료 및 승인 요청이 생성되었습니다.");
        } catch (error) {
          toast.error("배치는 완료되었으나 승인 요청 생성에 실패했습니다.");
        }
      }
    },
    onError: (error) => {
      toast.error(`오류: ${error.message}`);
    },
  });
  
  const generateCcpMutation = trpc.batch.generateCcp.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      refetchCcps();
    },
    onError: (error) => {
      toast.error(`CCP 생성 실패: ${error.message}`);
    },
  });
  
  const generateHaccpReportMutation = trpc.batch.generateHaccpReport.useMutation({
    onSuccess: (result) => {
      // Base64 PDF를 다운로드
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
      a.download = `HACCP_Report_${batch?.batchCode || batchId}_${new Date().toISOString().split('T')[0]}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("HACCP 보고서가 다운로드되었습니다");
    },
    onError: (error) => {
      toast.error(`HACCP 보고서 생성 실패: ${error.message}`);
    },
  });
  
  const addMaterialInputMutation = trpc.inventory.addMaterialInput.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      refetchInputs();
      refetchLots();
      // 폼 초기화
      setSelectedMaterialId(null);
      setSelectedLotId(null);
      setInputQuantity("");
    },
    onError: (error) => {
      toast.error(`투입 실패: ${error.message}`);
    },
  });
  
  const updateRevenueMutation = trpc.batch.updateRevenue.useMutation({
    onSuccess: () => {
      toast.success("매출액이 업데이트되었습니다");
      setRevenueInput("");
      window.location.reload(); // 페이지 새로고침으로 수익성 정보 갱신
    },
    onError: (error) => {
      toast.error(`오류: ${error.message}`);
    },
  });
  
  const deleteMaterialInputMutation = trpc.inventory.deleteMaterialInput.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      refetchInputs();
      refetchLots();
    },
    onError: (error) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });
  
  const requestApprovalMutation = trpc.approval.requestBatchApproval.useMutation({
    onSuccess: () => {
      toast.success("배치 승인 요청이 전송되었습니다");
    },
    onError: (error) => {
      toast.error(`승인 요청 실패: ${error.message}`);
    },
  });
  
  const approveBatchMutation = trpc.batch.approve.useMutation({
    onSuccess: () => {
      toast.success("배치가 승인되었습니다");
      window.location.reload();
    },
    onError: (error) => {
      toast.error(`승인 실패: ${error.message}`);
    },
  });
  
  const rejectBatchMutation = trpc.batch.reject.useMutation({
    onSuccess: () => {
      toast.success("배치가 반려되었습니다");
      window.location.reload();
    },
    onError: (error) => {
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
    if (confirm("원재료 투입 내역을 삭제하시겠습니까? 재고가 자동으로 복구됩니다.")) {
      deleteMaterialInputMutation.mutate({ inputId });
    }
  };
  
  const bulkDeleteCcpMutation = trpc.ccp.bulkDelete.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      refetchCcps();
      setSelectedCcpIds([]);
    },
    onError: (error) => {
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
    generateCcpMutation.mutate({ batchId });
  };
  
  const handleAddMaterialInput = () => {
    if (!selectedMaterialId || !selectedLotId || !inputQuantity) {
      toast.error("원재료, LOT, 수량을 모두 입력해주세요");
      return;
    }
    
    const selectedLot = lots?.find((lot: any) => lot.id === selectedLotId);
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

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!batch) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
          <Package className="h-16 w-16 text-muted-foreground" />
          <p className="text-muted-foreground">배치를 찾을 수 없습니다</p>
          <Button onClick={() => setLocation("/batches")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            목록으로 돌아가기
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" onClick={() => setLocation("/batches")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{batch.batchCode}</h1>
              <p className="text-muted-foreground mt-1">배치 상세 정보</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
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
            <CardDescription>배치의 기본 정보입니다</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">배치 코드</div>
                <div className="text-lg font-semibold mt-1">{batch.batchCode}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">생성일</div>
                <div className="text-lg font-semibold mt-1">
                  {new Date(batch.createdAt).toLocaleDateString("ko-KR")}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 상태 관리 및 승인 */}
        <Card>
          <CardHeader>
            <CardTitle>상태 관리 및 승인</CardTitle>
            <CardDescription>배치의 생산 단계를 변경하거나 승인/반려하세요</CardDescription>
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
                  <h4 className="text-sm font-semibold mb-2">배치 승인</h4>
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
                                  {ccpCheckStatus.incompleteCcps.map((ccp: any, idx: number) => (
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
                            if (confirm("배치를 승인하시겠습니까?")) {
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
              <CardDescription>배치 승인 요청 및 처리 과정을 확인하세요</CardDescription>
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
            <CardDescription>배치의 매출액을 입력하여 수익성을 분석하세요</CardDescription>
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
                  <CardDescription>배치 생산 비용 분석 및 원재료별 비용 현황</CardDescription>
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
                  {/* 총 비용 요약 */}
                  <div className="space-y-4">
                    <div className="p-6 border rounded-lg bg-blue-50 dark:bg-blue-950">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">총 원재료 비용</p>
                          <p className="text-3xl font-bold mt-1">
                            {batchCost.totalCost.toLocaleString('ko-KR')}원
                          </p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-blue-600" />
                      </div>
                    </div>
                    
                    {/* 원재료별 비용 목록 */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm">원재료별 상세 비용</h4>
                      <div className="space-y-2">
                        {batchCost.materialCosts.map((item, index) => (
                          <div key={item.materialId} className="p-3 border rounded-lg">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">{item.materialName}</span>
                              <span className="font-bold">{item.totalCost.toLocaleString('ko-KR')}원</span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1">
                              <div className="flex justify-between">
                                <span>수량:</span>
                                <span>{item.quantity.toLocaleString('ko-KR')} {item.unit}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>단가:</span>
                                <span>{item.unitPrice.toLocaleString('ko-KR')}원/{item.unit}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>비용 비율:</span>
                                <span>{((item.totalCost / batchCost.totalCost) * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  {/* 비용 분포 차트 */}
                  <div className="space-y-4">
                    <h4 className="font-semibold text-sm">비용 분포</h4>
                    <div className="h-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={batchCost.materialCosts.map(item => ({
                              name: item.materialName,
                              value: item.totalCost,
                            }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={(entry) => `${((entry.value / batchCost.totalCost) * 100).toFixed(1)}%`}
                            outerRadius={120}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {batchCost.materialCosts.map((entry, index) => (
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
            <CardTitle>원재료 투입</CardTitle>
            <CardDescription>배치에 투입된 원재료 목록입니다</CardDescription>
          </CardHeader>
          <CardContent>
            {/* 원재료 투입 폼 */}
            <div className="space-y-4 mb-6 p-4 border rounded-lg">
              <h3 className="font-semibold">원재료 투입 추가</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="material">원재료 *</Label>
                  <Select
                    value={selectedMaterialId?.toString() || ""}
                    onValueChange={(value) => {
                      setSelectedMaterialId(parseInt(value));
                      setSelectedLotId(null);
                    }}
                  >
                    <SelectTrigger id="material">
                      <SelectValue placeholder="원재료 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials?.items?.map((material: any) => (
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
                      {lots?.map((lot: any) => (
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

            {/* 원재료 투입 내역 */}
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
                    {batchInputs.map((input: any) => (
                      <tr key={input.id} className="border-b hover:bg-accent/50">
                        <td className="p-3">{input.materialName || `원재료 #${input.materialId}`}</td>
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

        {/* CCP 점검 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>CCP 점검</CardTitle>
                <CardDescription>중요관리점(CCP) 점검 기록입니다</CardDescription>
              </div>
              <div className="flex gap-2">
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
                <Button
                  onClick={handleGenerateCcp}
                  disabled={generateCcpMutation.isPending}
                  size="sm"
                >
                  <Zap className="mr-2 h-4 w-4" />
                  {generateCcpMutation.isPending ? "CCP 생성 중..." : "CCP 자동 생성"}
                </Button>
                {batch.status === "completed" && batch.completionReportUrl ? (
                  <Button
                    onClick={() => window.open(batch.completionReportUrl!, "_blank")}
                    size="sm"
                    variant="default"
                  >
                    <FileDown className="mr-2 h-4 w-4" />
                    배치 완료 보고서 다운로드
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
                    {generateHaccpReportMutation.isPending ? "HACCP 보고서 생성 중..." : "HACCP 보고서 생성"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!ccpList || ccpList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                <p>아직 CCP가 생성되지 않았습니다</p>
                <p className="text-sm mt-2">"배치 생성" 버튼을 클릭하여 CCP를 자동 생성하세요</p>
              </div>
            ) : (
              <div className="space-y-4">
                {ccpList.map((ccp: any) => (
                  <CcpInspectionCard key={ccp.id} ccp={ccp} onRecordSaved={refetchCcps} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
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
            // 배치 정보 재조회
            window.location.reload();
          }}
        />
      )}
    </DashboardLayout>
  );
}
