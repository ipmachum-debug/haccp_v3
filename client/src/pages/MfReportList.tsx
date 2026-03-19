import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Search, FileText, Eye, Edit, Trash2, Plus, Filter, CheckSquare, FileDown, AlertTriangle, Shield, Save, FlaskConical } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import ProductionLogsSection from "@/components/ProductionLogsSection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";


// CCP 매핑 섹션 컴포넌트
function CcpMappingSection({ productId, productName }: { productId: number; productName: string }) {
  const CCP_TYPES = [
    { value: "CCP-1B", label: "CCP-1B", description: "금속검출 (입고)" },
    { value: "CCP-2B", label: "CCP-2B", description: "금속검출 (포장 전)" },
    { value: "CCP-3B", label: "CCP-3B", description: "자외선 살균" },
    { value: "CCP-4P", label: "CCP-4P", description: "금속검출 (최종)" },
  ];

  const CCP_TYPE_COLORS: Record<string, string> = {
    "CCP-1B": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "CCP-2B": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "CCP-3B": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    "CCP-4P": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };

  // 제품-CCP 매핑 정보 조회
  const { data: mappingData, refetch: refetchMappings } = trpc.ccpMonitoring.getProductCcpMappings.useQuery(
    { productId },
    { enabled: !!productId }
  );

  // 제품별 CCP 스펙 조회
  const { data: productSpecs, refetch: refetchSpecs } = trpc.ccpMonitoring.getProductCcpSpecs.useQuery(
    { productId },
    { enabled: !!productId }
  );

  // process_flags 업데이트
  const updateProcessFlagsMutation = trpc.ccpMonitoring.updateProductProcessFlags.useMutation({
    onSuccess: () => {
      toast.success("CCP 매핑이 저장되었습니다.");
      refetchMappings();
    },
    onError: (err: any) => toast.error(`저장 실패: ${err.message}`),
  });

  // 매핑 데이터에서 현재 제품 정보 추출
  const productMapping = Array.isArray(mappingData) ? (mappingData as any[]).find((m: any) => m.id === productId) : null;
  const processFlags = productMapping?.process_flags || "";
  const mappedCcpTypes = productMapping?.mapped_ccp_types ? String(productMapping.mapped_ccp_types).split(",").filter(Boolean) : [];

  // 현재 활성 CCP 타입 목록
  const activeCcpTypes: string[] = [];
  if (processFlags.includes("STEAMING")) activeCcpTypes.push("CCP-1B");
  if (processFlags.includes("MIXING") || processFlags.includes("STIRRING")) activeCcpTypes.push("CCP-2B");
  if (processFlags.includes("UV") || processFlags.includes("COOLING")) activeCcpTypes.push("CCP-3B");
  if (processFlags.includes("METAL_DETECTION")) activeCcpTypes.push("CCP-4P");

  // 스펙 찾기
  const getSpecForCcpType = (ccpType: string) => {
    if (!productSpecs || !Array.isArray(productSpecs)) return null;
    return productSpecs.find((s: any) => (s.ccpType || s.ccp_type) === ccpType) || null;
  };

  // CCP 타입 토글
  const [localCcpTypes, setLocalCcpTypes] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && activeCcpTypes.length > 0) {
      setLocalCcpTypes(activeCcpTypes);
      setInitialized(true);
    } else if (!initialized && processFlags === "" && mappingData) {
      setInitialized(true);
    }
  }, [activeCcpTypes, initialized, processFlags, mappingData]);

  const handleToggle = (ccpType: string) => {
    setLocalCcpTypes((prev) =>
      prev.includes(ccpType) ? prev.filter((t) => t !== ccpType) : [...prev, ccpType]
    );
  };

  const handleSaveMapping = () => {
    const flagMap: Record<string, string> = {
      "CCP-1B": "STEAMING",
      "CCP-2B": "MIXING",
      "CCP-3B": "UV",
      "CCP-4P": "METAL_DETECTION",
    };
    const flags = localCcpTypes.map((t) => flagMap[t] || t).join(",");
    updateProcessFlagsMutation.mutate({ productId, processFlags: flags });
  };

  return (
    <div className="space-y-4">
      {/* CCP 타입 매핑 체크박스 */}
      <div className="grid grid-cols-2 gap-2">
        {CCP_TYPES.map((ccp) => {
          const isActive = localCcpTypes.includes(ccp.value);
          const spec = getSpecForCcpType(ccp.value);
          return (
            <div
              key={ccp.value}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                isActive ? "bg-primary/5 border-primary" : "hover:bg-accent/50"
              }`}
              onClick={() => handleToggle(ccp.value)}
            >
              <Checkbox checked={isActive} onCheckedChange={() => handleToggle(ccp.value)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <Badge className={`${CCP_TYPE_COLORS[ccp.value]} text-[10px] px-1.5 py-0`}>{ccp.label}</Badge>
                  <span className="text-xs text-muted-foreground truncate">{ccp.description}</span>
                </div>
                {isActive && spec && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {(spec.minTempC || spec.min_temp_c) && `온도: ${spec.minTempC || spec.min_temp_c}~${spec.maxTempC || spec.max_temp_c}°C`}
                    {(spec.feSensitivity || spec.fe_sensitivity) && `Fe: ${spec.feSensitivity || spec.fe_sensitivity} / SUS: ${spec.susSensitivity || spec.sus_sensitivity}`}
                    {!(spec.minTempC || spec.min_temp_c) && !(spec.feSensitivity || spec.fe_sensitivity) && "한계기준 설정됨"}
                  </div>
                )}
                {isActive && !spec && (
                  <div className="text-[10px] text-orange-500 mt-1">한계기준 미설정</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSaveMapping}
          disabled={updateProcessFlagsMutation.isPending}
        >
          {updateProcessFlagsMutation.isPending ? (
            <><Loader2 className="mr-1 h-3 w-3 animate-spin" />저장 중...</>
          ) : (
            <><Save className="mr-1 h-3 w-3" />매핑 저장</>
          )}
        </Button>
      </div>

      {/* 한계기준 요약 테이블 */}
      {localCcpTypes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-1.5 font-medium">CCP</th>
                <th className="text-right p-1.5 font-medium">온도 (°C)</th>
                <th className="text-right p-1.5 font-medium">시간 (분)</th>
                <th className="text-right p-1.5 font-medium">압력 (bar)</th>
                <th className="text-right p-1.5 font-medium">감도 (Fe/SUS)</th>
              </tr>
            </thead>
            <tbody>
              {localCcpTypes.map((ccpType) => {
                const spec = getSpecForCcpType(ccpType);
                return (
                  <tr key={ccpType} className="border-b">
                    <td className="p-1.5">
                      <Badge className={`${CCP_TYPE_COLORS[ccpType]} text-[10px] px-1.5 py-0`}>{ccpType}</Badge>
                    </td>
                    <td className="p-1.5 text-right">
                      {spec && (spec.minTempC || spec.min_temp_c)
                        ? `${spec.minTempC || spec.min_temp_c} ~ ${spec.maxTempC || spec.max_temp_c}`
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-1.5 text-right">
                      {spec && (spec.minDurationMin || spec.min_duration_min)
                        ? `${spec.minDurationMin || spec.min_duration_min} ~ ${spec.maxDurationMin || spec.max_duration_min}`
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-1.5 text-right">
                      {spec && (spec.minPressureBar || spec.min_pressure_bar)
                        ? `${spec.minPressureBar || spec.min_pressure_bar} ~ ${spec.maxPressureBar || spec.max_pressure_bar}`
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-1.5 text-right">
                      {spec && (spec.feSensitivity || spec.fe_sensitivity)
                        ? `${spec.feSensitivity || spec.fe_sensitivity} / ${spec.susSensitivity || spec.sus_sensitivity}`
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        한계기준 상세 설정은 마스터 데이터 &gt; 제품-CCP 매핑 탭에서 관리할 수 있습니다.
      </p>
    </div>
  );
}

// 오차 분석 섹션 컴포넌트
function DeviationAnalysisSection({ versionId }: { versionId: number }) {
  const { data: analysis, isLoading } = trpc.mfReport.getDeviationAnalysis.useQuery(
    { versionId },
    { enabled: !!versionId }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        <span className="text-sm text-muted-foreground">오차 분석 데이터 로딩 중...</span>
      </div>
    );
  }

  if (!analysis || !analysis.materialAnalysis || analysis.materialAnalysis.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground">
        완료된 배치 데이터가 없어 오차 분석을 수행할 수 없습니다.
        <br />배치 생산이 진행되면 자동으로 분석 데이터가 축적됩니다.
      </div>
    );
  }

  const getConfidenceBadge = (level: string) => {
    switch (level) {
      case "stable": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">안정</Badge>;
      case "moderate": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">보통</Badge>;
      case "initial": return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">초기</Badge>;
      default: return <Badge variant="outline">데이터 부족</Badge>;
    }
  };

  const getDeviationColor = (deviation: number | null) => {
    if (deviation === null) return "";
    const abs = Math.abs(deviation);
    if (abs > 2.0) return "text-red-600 dark:text-red-400 font-bold";
    if (abs > 1.0) return "text-orange-600 dark:text-orange-400 font-semibold";
    if (abs > 0.5) return "text-yellow-600 dark:text-yellow-400";
    return "text-green-600 dark:text-green-400";
  };

  const hasSuggestions = analysis.materialAnalysis.some((m: any) => m.suggestion);

  return (
    <div className="space-y-4">
      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{analysis.totalBatches}</div>
          <div className="text-xs text-muted-foreground">총 배치 수</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{analysis.completedBatchesWithActual}</div>
          <div className="text-xs text-muted-foreground">실측 데이터 보유</div>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold">{analysis.materialAnalysis.length}</div>
          <div className="text-xs text-muted-foreground">분석 원재료 수</div>
        </div>
      </div>

      {/* 원재료별 오차 분석 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-2 font-medium">원재료</th>
              <th className="text-right p-2 font-medium">법적 (%)</th>
              <th className="text-right p-2 font-medium">보정 (%)</th>
              <th className="text-right p-2 font-medium">실제 평균 (%)</th>
              <th className="text-right p-2 font-medium">오차</th>
              <th className="text-right p-2 font-medium">표준편차</th>
              <th className="text-center p-2 font-medium">배치 수</th>
              <th className="text-center p-2 font-medium">신뢰도</th>
            </tr>
          </thead>
          <tbody>
            {analysis.materialAnalysis.map((mat: any, idx: number) => (
              <tr key={idx} className={`border-b hover:bg-muted/20 ${mat.suggestion ? "bg-orange-50 dark:bg-orange-950/20" : ""}`}>
                <td className="p-2 font-medium">{mat.materialName}</td>
                <td className="p-2 text-right font-mono text-muted-foreground">{mat.legalPct.toFixed(1)}</td>
                <td className="p-2 text-right font-mono">{mat.correctedPct.toFixed(1)}</td>
                <td className="p-2 text-right font-mono">
                  {mat.avgActualRatio !== null ? mat.avgActualRatio.toFixed(2) : "-"}
                </td>
                <td className={`p-2 text-right font-mono ${getDeviationColor(mat.avgDeviation)}`}>
                  {mat.avgDeviation !== null ? `${mat.avgDeviation > 0 ? "+" : ""}${mat.avgDeviation.toFixed(2)}%` : "-"}
                </td>
                <td className="p-2 text-right font-mono text-muted-foreground">
                  {mat.stdDeviation !== null ? `±${mat.stdDeviation.toFixed(2)}` : "-"}
                </td>
                <td className="p-2 text-center">{mat.batchCount}</td>
                <td className="p-2 text-center">{getConfidenceBadge(mat.confidenceLevel)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 수정 제안 */}
      {hasSuggestions && (
        <div className="border border-orange-200 dark:border-orange-800 rounded-lg p-4 bg-orange-50 dark:bg-orange-950/30">
          <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            품목제조보고 수정 검토 제안
          </h4>
          <p className="text-xs text-orange-600 dark:text-orange-400 mb-3">
            아래 원재료는 실제 생산 데이터와 법적 배합비 간 유의미한 차이가 감지되었습니다.
            법적 배합비는 자동으로 변경되지 않으며, 수정이 필요한 경우 새로운 버전을 생성해야 합니다.
          </p>
          <div className="space-y-2">
            {analysis.materialAnalysis
              .filter((m: any) => m.suggestion)
              .map((mat: any, idx: number) => (
                <div key={idx} className="text-sm p-2 bg-white dark:bg-gray-900 rounded border border-orange-100 dark:border-orange-900">
                  <span className="font-medium">{mat.materialName}:</span>{" "}
                  <span className="text-muted-foreground">{mat.suggestion}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 범례 */}
      <div className="text-xs text-muted-foreground border-t pt-3 space-y-1">
        <p><strong>오차 색상 기준:</strong> <span className="text-green-600">0.5% 이하</span> | <span className="text-yellow-600">0.5~1.0%</span> | <span className="text-orange-600">1.0~2.0%</span> | <span className="text-red-600">2.0% 초과</span></p>
        <p><strong>신뢰도 등급:</strong> 데이터 부족 (5회 미만) &rarr; 초기 (5~9회) &rarr; 보통 (10~19회) &rarr; 안정 (20회 이상)</p>
        <p><strong>수정 제안 조건:</strong> 배치 10회 이상 + 평균 오차 &plusmn;1% 이상 + 표준편차 2% 미만</p>
      </div>
    </div>
  );
}

export default function MfReportList({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedReport, setSelectedReport] = useState<number | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkAction, setBulkAction] = useState<string>("");
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportReportId, setExportReportId] = useState<number | null>(null);
  const [exportMode, setExportMode] = useState<"summary" | "detailed">("summary");

  // 재고 차감 입력
  const [deductDialogOpen, setDeductDialogOpen] = useState(false);
  const [deductReportId, setDeductReportId] = useState<number | null>(null);
  const [batchKg, setBatchKg] = useState(10);
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0]);
  const [producedQuantity, setProducedQuantity] = useState(100);
  const [notes, setNotes] = useState("");

  // 품목제조보고 목록 조회
  const { data: reports, isLoading, refetch } = trpc.mfReport.list.useQuery();
  
  // 일괄 처리 mutation
  const bulkUpdateStatusMutation = trpc.mfReport.bulkUpdateStatus.useMutation({
    onSuccess: () => {
      toast.success("상태가 변경되었습니다");
      refetch();
      setSelectedIds([]);
    },
    onError: () => {
      toast.error("상태 변경에 실패했습니다");
    },
  });
  
  const bulkDeleteMutation = trpc.mfReport.bulkDelete.useMutation({
    onSuccess: () => {
      toast.success("삭제되었습니다");
      refetch();
      setSelectedIds([]);
    },
    onError: () => {
      toast.error("삭제에 실패했습니다");
    },
  });
  
  const bulkExportPdfMutation = trpc.mfReport.bulkExportPdf.useMutation({
    onSuccess: (data: any) => {
      toast.success("PDF가 생성되었습니다");
      // PDF 다운로드 처리
      const blob = new Blob([data as any], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `품목제조보고_일괄_${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
    onError: () => {
      toast.error("PDF 생성에 실패했습니다");
    },
  });

  // 품목제조보고 상세 조회
  const { data: reportDetail, isLoading: isDetailLoading } = trpc.mfReport.getById.useQuery(
    { id: selectedReport! },
    { enabled: !!selectedReport }
  );

  // 품목제조보고 버전 목록 조회
  const { data: versions } = trpc.mfReport.getVersions.useQuery(
    { mfReportId: selectedReport! },
    { enabled: !!selectedReport }
  );

  // 필터링된 목록
  const filteredReports = reports?.filter((report: any) => {
    // 검색어 필터
    const matchesSearch = report.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      report.reportNo?.toLowerCase().includes(searchTerm.toLowerCase());
    
    // 상태 필터
    const matchesStatus = statusFilter === "ALL" || report.status === statusFilter;
    
    // 날짜 범위 필터
    let matchesDateRange = true;
    if (startDate || endDate) {
      const reportDate = new Date(report.reportDate);
      if (startDate) {
        const start = new Date(startDate);
        matchesDateRange = matchesDateRange && reportDate >= start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchesDateRange = matchesDateRange && reportDate <= end;
      }
    }
    
    return matchesSearch && matchesStatus && matchesDateRange;
  });

  // 선택 토글
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredReports?.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredReports?.map((r: any) => r.id) || []);
    }
  };
  
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };
  
  // 일괄 작업 실행
  const handleBulkAction = () => {
    if (selectedIds.length === 0) {
      toast.error("항목을 선택해주세요");
      return;
    }
    
    if (!bulkAction) {
      toast.error("작업을 선택해주세요");
      return;
    }
    
    if (bulkAction === "delete") {
      if (confirm(`${selectedIds.length}개 항목을 삭제하시겠습니까?`)) {
        bulkDeleteMutation.mutate({ ids: selectedIds });
      }
    } else if (bulkAction === "pdf") {
      bulkExportPdfMutation.mutate({ ids: selectedIds });
    } else {
      bulkUpdateStatusMutation.mutate({ 
        ids: selectedIds, 
        status: bulkAction as "ACTIVE" | "INACTIVE" | "ARCHIVED" 
      });
    }
  };
  
  // 상세 보기
  const handleViewDetail = (reportId: number) => {
    setSelectedReport(reportId);
    setDetailDialogOpen(true);
  };

  // 품목제조보고 수정
  const handleEdit = (reportId: number) => {
    setLocation(`/dashboard/mf-report/modify/${reportId}`);
  };

  // 보정배합비 / 공정매핑 관리
  const handleFormula = (reportId: number) => {
    setLocation(`/dashboard/mf-report/edit/${reportId}`);
  };

  // 배합표 출력
  const handleExportLabel = (reportId: number) => {
    setExportReportId(reportId);
    setExportDialogOpen(true);
  };

  // tRPC utils 사용
  const utils = trpc.useUtils();

  const handleConfirmExport = async () => {
    if (!exportReportId) return;

    try {
      // 최신 버전 ID 조회
      const versions = await utils.mfReport.getVersions.fetch({ mfReportId: exportReportId });
      if (!versions || versions.length === 0) {
        toast.error("버전 정보를 찾을 수 없습니다");
        return;
      }

      const latestVersion = versions[0];
      const result = await utils.mfReport.generateLabel.fetch({
        versionId: latestVersion.id,
        mode: exportMode,
      });

      // Base64 PDF 다운로드
      const pdfBlob = new Blob(
        [Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0))],
        { type: "application/pdf" }
      );
      const url = window.URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `배합표_${exportMode === "summary" ? "요약" : "상세"}_${new Date().toISOString().split("T")[0]}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast.success("배합표가 다운로드되었습니다");
      setExportDialogOpen(false);
    } catch (error) {
      toast.error(`배합표 출력 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  };

  // 재고 차감 mutation
  const deductInventoryMutation = trpc.mfReport.deductInventory.useMutation({
    onSuccess: () => {
      toast.success("재고 차감이 완료되었습니다");
      utils.mfReport.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`재고 차감 실패: ${error.message}`);
    },
  });

  // 재고 차감 다이얼로그 열기
  const handleDeductInventory = (reportId: number) => {
    setDeductReportId(reportId);
    setDeductDialogOpen(true);
  };

  // 재고 차감 확인
  const handleConfirmDeduct = async () => {
    if (!deductReportId) return;

    try {
      // 최신 버전 ID 조회
      const versions = await utils.mfReport.getVersions.fetch({ mfReportId: deductReportId });
      if (!versions || versions.length === 0) {
        toast.error("버전 정보를 찾을 수 없습니다");
        return;
      }

      const latestVersion = versions[0];
      deductInventoryMutation.mutate({
        versionId: latestVersion.id,
        batchKg,
        productionDate,
        producedQuantity,
        notes: notes || undefined,
      });

      setDeductDialogOpen(false);
    } catch (error) {
      toast.error(`재고 차감 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  };

  // 상태 배지 색상
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return <Badge variant="default">활성</Badge>;
      case "INACTIVE":
        return <Badge variant="secondary">비활성</Badge>;
      case "ARCHIVED":
        return <Badge variant="outline">보관</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

    const content = (
      <>
    <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">품목제조보고</h1>
          <p className="text-muted-foreground mt-1">제품별 품목제조보고서를 관리합니다</p>
        </div>
        <Button onClick={() => setLocation("/dashboard/mf-report/create")}>
          <Plus className="w-4 h-4 mr-2" />
          신규 등록
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>품목제조보고 목록</CardTitle>
          <CardDescription>등록된 품목제조보고서를 조회하고 관리할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent>
          {/* 일괄 작업 */}
          {selectedIds.length > 0 && (
            <div className="flex gap-4 items-center mb-4 p-4 bg-muted rounded-lg">
              <span className="text-sm font-medium">
                {selectedIds.length}개 항목 선택됨
              </span>
              <Select value={bulkAction} onValueChange={setBulkAction}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="작업 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">활성으로 변경</SelectItem>
                  <SelectItem value="INACTIVE">비활성으로 변경</SelectItem>
                  <SelectItem value="ARCHIVED">보관으로 변경</SelectItem>
                  <SelectItem value="pdf">PDF 출력</SelectItem>
                  <SelectItem value="delete">삭제</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleBulkAction} disabled={!bulkAction}>
                <CheckSquare className="w-4 h-4 mr-2" />
                실행
              </Button>
              <Button variant="outline" onClick={() => setSelectedIds([])}>
                선택 취소
              </Button>
            </div>
          )}
          
          {/* 검색 및 필터 */}
          <div className="space-y-4 mb-6">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="제품명 또는 보고서 번호로 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="status-filter" className="mb-2 block">상태</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter">
                    <SelectValue placeholder="상태 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">전체</SelectItem>
                    <SelectItem value="ACTIVE">활성</SelectItem>
                    <SelectItem value="INACTIVE">비활성</SelectItem>
                    <SelectItem value="ARCHIVED">보관</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex-1">
                <Label htmlFor="start-date" className="mb-2 block">시작 날짜</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              
              <div className="flex-1">
                <Label htmlFor="end-date" className="mb-2 block">종료 날짜</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              
              <Button
                variant="outline"
                onClick={() => {
                  setStatusFilter("ALL");
                  setStartDate("");
                  setEndDate("");
                  setSearchTerm("");
                }}
              >
                <Filter className="w-4 h-4 mr-2" />
                필터 초기화
              </Button>
            </div>
          </div>

          {/* 테이블 */}
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredReports && filteredReports.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedIds.length === filteredReports.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>보고서 번호</TableHead>
                  <TableHead>제품명</TableHead>
                  <TableHead>보고일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report: any) => (
                  <TableRow key={report.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(report.id)}
                        onCheckedChange={() => toggleSelect(report.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{report.reportNo}</TableCell>
                    <TableCell>{report.productName || "-"}</TableCell>
                    <TableCell>
                      {report.reportDate ? new Date(report.reportDate).toLocaleDateString("ko-KR") : "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(report.status || "ACTIVE")}</TableCell>
                    <TableCell>
                      {report.createdAt ? new Date(report.createdAt).toLocaleDateString("ko-KR") : "-"}
                    </TableCell>
                    <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetail(report.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(report.id)}
                          title="품목제조보고 수정"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleFormula(report.id)}
                          title="보정배합비 / 공정매핑 관리"
                        >
                          <FlaskConical className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleExportLabel(report.id)}
                          title="배합표 출력"
                        >
                          <FileDown className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeductInventory(report.id)}
                          title="재고 차감 실행"
                        >
                          <CheckSquare className="w-4 h-4" />
                        </Button>
                      </div>
                    </div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>등록된 품목제조보고가 없습니다</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setLocation("/dashboard/mf-report/create")}
              >
                <Plus className="w-4 h-4 mr-2" />
                첫 품목제조보고 등록하기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 상세 보기 다이얼로그 */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>품목제조보고 상세</DialogTitle>
            <DialogDescription>품목제조보고서의 상세 정보를 확인합니다</DialogDescription>
          </DialogHeader>

          {isDetailLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : reportDetail ? (
            <div className="space-y-6">
              {/* 기본 정보 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">보고서 번호</label>
                  <p className="text-base mt-1">{reportDetail.reportNo}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">제품명</label>
                  <p className="text-base mt-1">{reportDetail.productName || "-"}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">보고일</label>
                  <p className="text-base mt-1">
                    {reportDetail.reportDate
                      ? new Date(reportDetail.reportDate).toLocaleDateString("ko-KR")
                      : "-"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">상태</label>
                  <div className="mt-1">{getStatusBadge(reportDetail.status || "ACTIVE")}</div>
                </div>
              </div>

              {/* 최신 버전 정보 */}
              {reportDetail.latestVersion && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">최신 버전 정보</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">버전</label>
                      <p className="text-base mt-1">v{reportDetail.latestVersion.versionNo}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">승인 상태</label>
                      <div className="mt-1">
                        {reportDetail.latestVersion.approvalStatus === "APPROVED" ? (
                          <Badge variant="default">승인됨</Badge>
                        ) : reportDetail.latestVersion.approvalStatus === "DRAFT" ? (
                          <Badge variant="secondary">초안</Badge>
                        ) : (
                          <Badge variant="outline">
                            {reportDetail.latestVersion.approvalStatus}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">시행일</label>
                      <p className="text-base mt-1">
                        {new Date(reportDetail.latestVersion.effectiveFrom).toLocaleDateString(
                          "ko-KR"
                        )}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">변경 사유</label>
                      <p className="text-base mt-1">
                        {reportDetail.latestVersion.changeReason || "-"}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 배합비 (법적 + 보정) */}
              {reportDetail.ingredients && reportDetail.ingredients.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">배합비 ({reportDetail.ingredients.length}종)</h3>
                  <p className="text-xs text-muted-foreground mb-2">법적 배합비: 식약처 신고용 (정제수 포함) | 보정 배합비: 재고 차감/원료수불용 (정제수 제외)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="text-left p-2 font-medium">순번</th>
                          <th className="text-left p-2 font-medium">구분</th>
                          <th className="text-left p-2 font-medium">원재료명</th>
                          <th className="text-right p-2 font-medium">법적 (%)</th>
                          <th className="text-right p-2 font-medium">보정 (%)</th>
                          <th className="text-center p-2 font-medium">차감</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportDetail.ingredients.map((ing: any, idx: number) => {
                          const isWater = ing.materialId === 191;
                          return (
                            <tr key={ing.id || idx} className={`border-b hover:bg-accent/50 ${isWater ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}>
                              <td className="p-2">{ing.lineNo || idx + 1}</td>
                              <td className="p-2">
                                <Badge variant={ing.materialType === "RAW" ? "default" : ing.materialType === "MIXED" ? "secondary" : "outline"}>
                                  {ing.materialType === "RAW" ? "원재료" : ing.materialType === "MIXED" ? "혼합재제" : "부재료"}
                                </Badge>
                              </td>
                              <td className="p-2 font-medium">
                                {ing.materialName || ing.flavorName || `ID: ${ing.materialId}`}
                                {isWater && <span className="ml-1 text-xs text-blue-500">(차감제외)</span>}
                              </td>
                              <td className="p-2 text-right font-mono">{Number(ing.quantity).toFixed(2)}</td>
                              <td className="p-2 text-right font-mono font-semibold">
                                {isWater ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : (
                                  <span className="text-emerald-600 dark:text-emerald-400">
                                    {ing.correctedQuantity ? Number(ing.correctedQuantity).toFixed(2) : Number(ing.quantity).toFixed(2)}
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-center">{ing.isDeductible ? "✓" : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 font-semibold">
                          <td colSpan={3} className="p-2 text-right">합계</td>
                          <td className="p-2 text-right font-mono">
                            {reportDetail.ingredients.reduce((sum: number, ing: any) => sum + Number(ing.quantity), 0).toFixed(2)}%
                          </td>
                          <td className="p-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                            {reportDetail.ingredients
                              .filter((ing: any) => ing.materialId !== 191)
                              .reduce((sum: number, ing: any) => sum + Number(ing.correctedQuantity || ing.quantity), 0).toFixed(2)}%
                          </td>
                          <td></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* 생산 이력 */}
              {reportDetail.latestVersion && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">생산 이력</h3>
                  <ProductionLogsSection versionId={reportDetail.latestVersion.id} />
                </div>
              )}

              {/* 오차 분석 (배치 학습 기반) */}
              {reportDetail.latestVersion && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    오차 분석
                    <Badge variant="outline" className="text-xs font-normal">배치 학습 기반</Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    실제 배치 생산 데이터를 기반으로 보정 배합비 대비 실제 투입 비율의 오차를 분석합니다.
                    배치가 축적될수록 분석 정확도가 향상됩니다.
                  </p>
                  <DeviationAnalysisSection versionId={reportDetail.latestVersion.id} />
                </div>
              )}
              {/* CCP 매핑 정보 */}
              {reportDetail.productId && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    CCP 매핑
                    <Badge variant="outline" className="text-xs font-normal">제품별 CCP 관리</Badge>
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    이 제품에 적용되는 CCP(중요관리점) 타입과 한계기준을 확인하고 수정할 수 있습니다.
                  </p>
                  <CcpMappingSection productId={reportDetail.productId} productName={reportDetail.productName || ""} />
                </div>
              )}
              {/* 버전 이력 */}
              {versions && versions.length > 0 && (
                <div className="border rounded-lg p-4">
                  <h3 className="font-semibold mb-3">버전 이력 ({versions.length}개)</h3>
                  <div className="space-y-2">
                    {versions.map((version: any) => (
                      <div
                        key={version.id}
                        className="flex justify-between items-center p-2 bg-muted/50 rounded"
                      >
                        <div>
                          <span className="font-medium">v{version.versionNo}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            {new Date(version.effectiveFrom).toLocaleDateString("ko-KR")}
                          </span>
                        </div>
                        <Badge
                          variant={
                            version.approvalStatus === "APPROVED"
                              ? "default"
                              : version.approvalStatus === "DRAFT"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {version.approvalStatus === "APPROVED"
                            ? "승인됨"
                            : version.approvalStatus === "DRAFT"
                            ? "초안"
                            : version.approvalStatus}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
                  닫기
                </Button>
                <Button onClick={() => handleEdit(reportDetail.id)}>
                  <Edit className="w-4 h-4 mr-2" />
                  수정
                </Button>
                <Button onClick={() => handleFormula(reportDetail.id)} variant="outline">
                  <FlaskConical className="w-4 h-4 mr-2" />
                  보정배합비
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 배합표 출력 다이얼로그 */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>배합표 출력</DialogTitle>
            <DialogDescription>
              출력할 배합표 형식을 선택하세요
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="exportMode">출력 형식</Label>
              <Select value={exportMode} onValueChange={(value: "summary" | "detailed") => setExportMode(value)}>
                <SelectTrigger id="exportMode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">요약형 (원재료 + 중간재)</SelectItem>
                  <SelectItem value="detailed">상세형 (BOM 펼침)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                {exportMode === "summary"
                  ? "요약형: 원재료와 중간재를 그대로 표시합니다."
                  : "상세형: 중간재의 구성 요소를 모두 펼쳐서 표시합니다."}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleConfirmExport}>
                <FileDown className="w-4 h-4 mr-2" />
                다운로드
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 재고 차감 입력 다이얼로그 */}
      <Dialog open={deductDialogOpen} onOpenChange={setDeductDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>재고 차감 실행</DialogTitle>
            <DialogDescription>
              배치 크기, 생산일자, 생산량을 입력하세요
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="batchKg">배치 크기 (kg)</Label>
              <Input
                id="batchKg"
                type="number"
                value={batchKg}
                onChange={(e) => setBatchKg(Number(e.target.value))}
                min={0.01}
                step={0.01}
              />
            </div>
            <div>
              <Label htmlFor="productionDate">생산일자</Label>
              <Input
                id="productionDate"
                type="date"
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="producedQuantity">생산량 (개)</Label>
              <Input
                id="producedQuantity"
                type="number"
                value={producedQuantity}
                onChange={(e) => setProducedQuantity(Number(e.target.value))}
                min={1}
                step={1}
              />
            </div>
            <div>
              <Label htmlFor="notes">비고 (선택사항)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="추가 메모를 입력하세요"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeductDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleConfirmDeduct}>
                재고 차감 실행
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
      </>
    );
    if (embedded) return content;
    return <DashboardLayout>{content}</DashboardLayout>;
}
