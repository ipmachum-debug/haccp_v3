import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, ArrowLeft, Save, FileDown, Eye, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";

// CCP 공정그룹 중 배합비 매핑 대상 (가열 3종만, 금속검출 제외)
const HEAT_CCP_TYPES = ["CCP-1B", "CCP-2B"];

export default function MfReportEdit() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const reportId = parseInt(id || "0");

  // === 데이터 로드 ===
  const { data: reportDetail, isLoading: isLoadingReport } = trpc.mfReport.getById.useQuery({ id: reportId });
  const { data: latestVersion, isLoading: isLoadingVersion } = trpc.mfReport.getVersions.useQuery({ mfReportId: reportId });
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  const { data: intermediates } = trpc.intermediate.list.useQuery();
  const { data: processGroupsData } = trpc.ccpMonitoring.getProcessGroups.useQuery({});

  // 가열 공정그룹만 필터 (CCP-1B, CCP-2B / 금속검출 CCP-4P 제외)
  const heatProcessGroups = useMemo(() => {
    const all = Array.isArray(processGroupsData) ? processGroupsData : [];
    return all.filter((pg: any) => HEAT_CCP_TYPES.includes(pg.ccp_type));
  }, [processGroupsData]);

  // === 폼 상태 ===
  const [productId, setProductId] = useState<number>(0);
  const [productName, setProductName] = useState<string>("");
  const [reportNo, setReportNo] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [yieldBasis, setYieldBasis] = useState<"UNIT" | "BATCH">("UNIT");
  const [unitWeightG, setUnitWeightG] = useState("");
  const [batchTargetKg, setBatchTargetKg] = useState("");

  // 배치당 총생산량 (제품 기준)
  const [batchProductionKg, setBatchProductionKg] = useState<string>("100");

  // 배합표 출력
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"summary" | "detailed">("summary");

  // 배치 계산 미리보기
  const [batchPreviewOpen, setBatchPreviewOpen] = useState(false);
  const [batchKg, setBatchKg] = useState(10);

  // === 원재료 구성 (배합비 100% 재료) ===
  const [ingredients, setIngredients] = useState<Array<{
    materialId?: number;
    intermediateId?: number;
    quantity: number;
    unit: string;
    isDeductible: number;
    materialType: "RAW" | "MIXED" | "FLAVOR_SPECIFIC";
    flavorName?: string;
    processGroupId?: number | null;
    adjustedWeightKg?: number | null;
    isAdditional: number;
  }>>([]);

  // === 추가 원재료 (배합비 100%에 미포함, 정제수 등) ===
  const [additionalIngredients, setAdditionalIngredients] = useState<Array<{
    materialId?: number;
    quantity: number;
    unit: string;
    processGroupId?: number | null;
    description: string;
  }>>([]);

  // 버전 ID
  const versionId = latestVersion?.[0]?.id || 0;

  // === 데이터 초기화 ===
  useEffect(() => {
    if (reportDetail && latestVersion && latestVersion.length > 0) {
      setProductId(reportDetail.productId);
      setProductName(reportDetail.productName || "");
      setReportNo(reportDetail.reportNo);
      setReportDate(new Date(reportDetail.reportDate).toISOString().split('T')[0]);

      const ver = latestVersion[0];
      if (ver.yieldBasis) setYieldBasis(ver.yieldBasis === "BATCH" ? "BATCH" : "UNIT");
      if (ver.unitWeightG) setUnitWeightG(String(ver.unitWeightG));
      if (ver.batchTargetKg) {
        setBatchTargetKg(String(ver.batchTargetKg));
        setBatchProductionKg(String(ver.batchTargetKg));
      }

      if (reportDetail.ingredients && reportDetail.ingredients.length > 0) {
        const mainIngs: typeof ingredients = [];
        const addIngs: typeof additionalIngredients = [];

        for (const ing of reportDetail.ingredients) {
          if (ing.isAdditional === 1) {
            addIngs.push({
              materialId: ing.materialId || undefined,
              quantity: Number(ing.quantity) || 0,
              unit: ing.unit || "kg",
              processGroupId: ing.processGroupId != null ? Number(ing.processGroupId) : null,
              description: ing.flavorName || "추가 원재료",
            });
          } else {
            mainIngs.push({
              materialId: ing.materialId || undefined,
              intermediateId: ing.intermediateId || undefined,
              quantity: Number(ing.quantity) || 0,
              unit: ing.unit || "%",
              isDeductible: ing.isDeductible ?? 1,
              materialType: ing.materialType || "RAW",
              flavorName: ing.flavorName || undefined,
              processGroupId: ing.processGroupId != null ? Number(ing.processGroupId) : null,
              adjustedWeightKg: ing.adjustedWeightKg != null ? Number(ing.adjustedWeightKg) : null,
              isAdditional: 0,
            });
          }
        }
        setIngredients(mainIngs);
        setAdditionalIngredients(addIngs);
      } else {
        setIngredients([]);
        setAdditionalIngredients([]);
      }
    }
  }, [reportDetail, latestVersion]);

  // === 원재료 CRUD ===
  const removeIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };
  const updateIngredient = (index: number, field: string, value: any) => {
    const updated = [...ingredients];
    updated[index] = { ...updated[index], [field]: value };
    setIngredients(updated);
  };

  // === 추가 원재료 CRUD ===
  const addAdditionalIngredient = () => {
    setAdditionalIngredients([...additionalIngredients, {
      quantity: 0, unit: "kg", processGroupId: null, description: "",
    }]);
  };
  const removeAdditionalIngredient = (index: number) => {
    setAdditionalIngredients(additionalIngredients.filter((_, i) => i !== index));
  };
  const updateAdditionalIngredient = (index: number, field: string, value: any) => {
    const updated = [...additionalIngredients];
    updated[index] = { ...updated[index], [field]: value };
    setAdditionalIngredients(updated);
  };

  // === 계산 ===
  const totalPercentage = ingredients.reduce((sum, ing) => sum + ing.quantity, 0);
  const isValid100Percent = Math.abs(totalPercentage - 100) < 0.01;
  const batchProdKg = parseFloat(batchProductionKg) || 0;

  // 재료명 헬퍼
  const getMaterialName = (ing: any) => {
    if (ing.materialId) {
      return materials?.find((m: any) => m.id === ing.materialId)?.materialName ||
             materials?.find((m: any) => m.id === ing.materialId)?.itemName || `재료#${ing.materialId}`;
    }
    if (ing.intermediateId) {
      return intermediates?.find((i: any) => i.id === ing.intermediateId)?.materialName || `중간재#${ing.intermediateId}`;
    }
    return "미선택";
  };

  // 비율 → 중량 환산 (배치 총생산량 기준)
  const calcWeightFromRatio = (ratioPercent: number) => {
    if (batchProdKg <= 0) return 0;
    return batchProdKg * (ratioPercent / 100);
  };

  // 수율조정 후 중량 합계
  const totalAdjustedWeight = useMemo(() => {
    let total = 0;
    for (const ing of ingredients) {
      if (ing.adjustedWeightKg != null && ing.adjustedWeightKg > 0) {
        total += ing.adjustedWeightKg;
      } else {
        total += calcWeightFromRatio(ing.quantity);
      }
    }
    for (const add of additionalIngredients) {
      total += add.quantity || 0;
    }
    return total;
  }, [ingredients, additionalIngredients, batchProdKg]);

  // 검증: 총생산량 대비 차이
  const weightDifference = totalAdjustedWeight - batchProdKg;
  const weightDiffPercent = batchProdKg > 0 ? (weightDifference / batchProdKg) * 100 : 0;

  // 공정그룹명 헬퍼
  const getProcessGroupName = (pgId: number | null | undefined) => {
    if (!pgId) return null;
    const pg = heatProcessGroups.find((g: any) => g.id === pgId);
    return pg ? pg.name : null;
  };

  // === Mutations ===
  const utils = trpc.useUtils();

  const updateMutation = trpc.mfReport.update.useMutation({
    onSuccess: () => {
      toast.success("품목제조보고가 저장되었습니다");
      utils.mfReport.getById.invalidate({ id: reportId });
      utils.mfReport.getVersions.invalidate({ mfReportId: reportId });
    },
    onError: (error: any) => {
      toast.error(`저장 실패: ${error.message}`);
    },
  });

  // 배치 계산 - 클라이언트 사이드
  const batchPreviewData = useMemo(() => {
    if (!batchPreviewOpen || batchKg <= 0 || ingredients.length === 0) return [];
    const ratio = batchKg / (batchProdKg > 0 ? batchProdKg : 100);
    const results: Array<{
      lineNo: number;
      materialType: string;
      materialName: string;
      requiredQuantity: string;
      unit: string;
      isAdditional: boolean;
    }> = [];

    let lineNo = 1;
    for (const ing of ingredients) {
      const baseWeight = calcWeightFromRatio(ing.quantity);
      const effectiveWeight = (ing.adjustedWeightKg != null && ing.adjustedWeightKg > 0) ? ing.adjustedWeightKg : baseWeight;
      const requiredQty = effectiveWeight * ratio;
      results.push({
        lineNo: lineNo++,
        materialType: ing.materialType || "RAW",
        materialName: getMaterialName(ing),
        requiredQuantity: requiredQty.toFixed(2),
        unit: "kg",
        isAdditional: false,
      });
    }
    for (const add of additionalIngredients) {
      const requiredQty = (add.quantity || 0) * ratio;
      results.push({
        lineNo: lineNo++,
        materialType: "RAW",
        materialName: add.materialId ? getMaterialName(add) : (add.description || "추가 원재료"),
        requiredQuantity: requiredQty.toFixed(2),
        unit: "kg",
        isAdditional: true,
      });
    }
    return results;
  }, [batchPreviewOpen, batchKg, ingredients, additionalIngredients, batchProdKg]);

  const handleBatchPreview = () => {
    if (ingredients.length === 0) {
      toast.error("원재료가 없습니다");
      return;
    }
    setBatchKg(batchProdKg > 0 ? batchProdKg : 100);
    setBatchPreviewOpen(true);
  };

  const handleConfirmExport = async () => {
    if (!reportId) return;
    try {
      const versions = await utils.mfReport.getVersions.fetch({ mfReportId: reportId });
      if (!versions || versions.length === 0) {
        toast.error("버전 정보를 찾을 수 없습니다");
        return;
      }
      const latestVer = versions[0];
      const result = await utils.mfReport.generateLabel.fetch({
        versionId: latestVer.id,
        mode: exportMode,
      });
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
    } catch (error: any) {
      console.error("배합표 출력 에러:", error);
      toast.error(`배합표 출력 실패: ${error?.message || "알 수 없는 오류"}`);
    }
  };

  const handleExportToExcel = () => {
    if (!batchPreviewData || batchPreviewData.length === 0) {
      toast.error("내보낼 데이터가 없습니다");
      return;
    }
    try {
      const headers = ["순번", "구분", "재료명", "필요량(kg)"];
      const rows = batchPreviewData.map((req: any) => [
        req.lineNo,
        req.isAdditional ? "추가" : (req.materialType === "RAW" ? "원재료" : "중간재"),
        req.materialName,
        req.requiredQuantity,
      ]);
      const csvContent = [headers.join(","), ...rows.map((row: any) => row.join(","))].join("\n");
      const bom = "\uFEFF";
      const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `배치계산_${batchKg}kg_${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("엑셀 파일이 다운로드되었습니다");
    } catch (error: any) {
      toast.error(`엑셀 내보내기 실패: ${error?.message || "알 수 없는 오류"}`);
    }
  };

  // === 저장 ===
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid100Percent) {
      toast.error(`원재료 합계는 100%여야 합니다 (현재: ${totalPercentage.toFixed(2)}%)`);
      return;
    }
    if (ingredients.length === 0) {
      toast.error("원재료를 1개 이상 추가해주세요");
      return;
    }

    // 메인 재료 + 추가 원재료 합쳐서 저장
    // processGroupId: null → 0 또는 undefined로 변환 (zod optional number)
    // adjustedWeightKg: null → undefined로 변환
    const allIngredients = [
      ...ingredients.map(ing => ({
        materialId: ing.materialId,
        intermediateId: ing.intermediateId,
        quantity: ing.quantity,
        unit: ing.unit,
        isDeductible: ing.isDeductible,
        materialType: ing.materialType,
        flavorName: ing.flavorName,
        processGroupId: (ing.processGroupId != null && ing.processGroupId > 0) ? ing.processGroupId : undefined,
        adjustedWeightKg: (ing.adjustedWeightKg != null && ing.adjustedWeightKg > 0) ? ing.adjustedWeightKg : undefined,
        isAdditional: 0,
      })),
      ...additionalIngredients.map(add => ({
        materialId: add.materialId,
        quantity: add.quantity,
        unit: add.unit || "kg",
        isDeductible: 0,
        materialType: "RAW" as const,
        flavorName: add.description,
        processGroupId: (add.processGroupId != null && add.processGroupId > 0) ? add.processGroupId : undefined,
        adjustedWeightKg: (add.quantity && add.quantity > 0) ? add.quantity : undefined,
        isAdditional: 1,
      })),
    ];

    updateMutation.mutate({
      mfReportId: reportId,
      reportNo,
      reportDate,
      yieldBasis,
      unitWeightG: unitWeightG ? parseFloat(unitWeightG) : undefined,
      batchTargetKg: batchProdKg > 0 ? batchProdKg : undefined,
      ingredients: allIngredients,
    });
  };

  // === 로딩/에러 ===
  if (isLoadingReport || isLoadingVersion) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!reportDetail) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Card>
            <CardContent className="py-8">
              <p className="text-center text-muted-foreground">품목제조보고를 찾을 수 없습니다</p>
              <div className="flex justify-center mt-4">
                <Button variant="outline" onClick={() => setLocation("/dashboard/mf-reports")}>
                  <ArrowLeft className="w-4 h-4 mr-2" />목록으로
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // === 렌더링 ===
  return (
    <DashboardLayout>
      <div className="space-y-6 pb-24">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold">품목제조보고 수정</h1>
            <p className="text-sm text-muted-foreground">{productName}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/dashboard/mf-reports")}>
            <ArrowLeft className="w-4 h-4 mr-1" />목록
          </Button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 기본 정보 */}
          <Card className="mb-3">
            <CardContent className="p-3">
              <div className="grid grid-cols-4 gap-3 items-end">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">제품</Label>
                  <div className="h-9 flex items-center px-3 rounded border bg-muted text-sm font-medium truncate">
                    {productName || "제품 정보 없음"}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">보고서 번호</Label>
                  <Input className="h-9 text-sm" value={reportNo} onChange={(e) => setReportNo(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1">보고 날짜</Label>
                  <Input className="h-9 text-sm" type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} required />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 font-semibold text-primary">배치 총생산량(kg)</Label>
                  <Input className="h-9 text-sm border-primary font-semibold" type="number" step="0.1" value={batchProductionKg}
                    onChange={(e) => { setBatchProductionKg(e.target.value); setBatchTargetKg(e.target.value); }}
                    placeholder="100" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 배합비 테이블 */}
          <Card className="mb-3">
            <CardHeader className="py-2 px-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold">배합비 구성</CardTitle>
                  <Badge variant={isValid100Percent ? "default" : "destructive"} className="text-xs px-2">
                    합계 {totalPercentage.toFixed(2)}%
                  </Badge>
                  {batchProdKg > 0 && (
                    <span className="text-xs text-muted-foreground">| 배치 {batchProdKg}kg 기준</span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {ingredients.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">원재료가 없습니다</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-muted/60 border-y text-xs text-muted-foreground">
                        <th className="px-3 py-2 text-left" style={{width: "36px"}}>#</th>
                        <th className="px-3 py-2 text-left" style={{minWidth: "180px"}}>원재료</th>
                        <th className="px-3 py-2 text-right" style={{width: "80px"}}>비율(%)</th>
                        <th className="px-3 py-2 text-right" style={{width: "100px"}}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="underline decoration-dotted cursor-help">환산중량(kg)</TooltipTrigger>
                              <TooltipContent><p className="text-xs">배치 총생산량 × 비율(%) 자동 환산</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </th>
                        <th className="px-3 py-2 text-right" style={{width: "110px"}}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="underline decoration-dotted cursor-help">수율조정(kg)</TooltipTrigger>
                              <TooltipContent><p className="text-xs">실제 투입량 (수율 반영). 미입력 시 환산중량 적용</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </th>
                        <th className="px-3 py-2 text-left" style={{width: "150px"}}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="underline decoration-dotted cursor-help">CCP 공정그룹</TooltipTrigger>
                              <TooltipContent><p className="text-xs">가열(교반기/증숙기/굽기) 공정 매칭</p></TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </th>
                        <th className="px-2 py-2 text-center" style={{width: "44px"}}>차감</th>
                        <th className="px-2 py-2 text-center" style={{width: "40px"}}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredients.map((ing, index) => {
                        const baseWeight = calcWeightFromRatio(ing.quantity);
                        const hasAdjustment = ing.adjustedWeightKg != null && ing.adjustedWeightKg > 0 && Math.abs(ing.adjustedWeightKg - baseWeight) > 0.001;

                        return (
                          <tr key={index} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">{index + 1}</td>
                            <td className="px-3 py-1.5 text-sm font-medium">{getMaterialName(ing)}</td>
                            <td className="px-3 py-1.5">
                              <Input
                                type="number" step="0.01"
                                className="h-8 text-sm text-right w-full border-0 shadow-none bg-transparent px-1 font-mono"
                                value={ing.quantity || ""}
                                onChange={(e) => updateIngredient(index, "quantity", parseFloat(e.target.value) || 0)}
                              />
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-sm text-muted-foreground">
                              {batchProdKg > 0 ? baseWeight.toFixed(2) : "-"}
                            </td>
                            <td className="px-3 py-1.5">
                              <Input
                                type="number" step="0.01"
                                className={`h-8 text-sm text-right w-full px-1 font-mono ${hasAdjustment ? "border-blue-400 bg-blue-50 text-blue-700 font-semibold" : "border-0 shadow-none bg-transparent"}`}
                                value={ing.adjustedWeightKg ?? ""}
                                onChange={(e) => updateIngredient(index, "adjustedWeightKg", e.target.value ? parseFloat(e.target.value) : null)}
                                placeholder={batchProdKg > 0 ? baseWeight.toFixed(2) : "-"}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <Select
                                value={ing.processGroupId?.toString() || "none"}
                                onValueChange={(v) => updateIngredient(index, "processGroupId", v === "none" ? null : parseInt(v))}
                              >
                                <SelectTrigger className="h-8 text-sm border-0 shadow-none bg-transparent px-1">
                                  <SelectValue placeholder="미지정" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">미지정</SelectItem>
                                  {heatProcessGroups.map((pg: any) => (
                                    <SelectItem key={pg.id} value={pg.id.toString()}>
                                      {pg.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <Checkbox
                                checked={ing.isDeductible === 1}
                                onCheckedChange={(checked) => updateIngredient(index, "isDeductible", checked ? 1 : 0)}
                                className="h-4 w-4"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-center">
                              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeIngredient(index)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40 border-t-2 font-semibold text-sm">
                        <td className="px-3 py-2" colSpan={2}>합계 (배합비 재료)</td>
                        <td className="px-3 py-2 text-right font-mono">
                          <span className={isValid100Percent ? "text-green-600" : "text-red-600"}>
                            {totalPercentage.toFixed(2)}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                          {batchProdKg > 0 ? batchProdKg.toFixed(2) : "-"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {batchProdKg > 0 ? ingredients.reduce((sum, ing) => {
                            const base = calcWeightFromRatio(ing.quantity);
                            return sum + ((ing.adjustedWeightKg != null && ing.adjustedWeightKg > 0) ? ing.adjustedWeightKg : base);
                          }, 0).toFixed(2) : "-"}
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 추가 원재료 (정제수 등) */}
          <Card className="mb-3">
            <CardHeader className="py-2 px-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold">추가 원재료</CardTitle>
                  <span className="text-xs text-muted-foreground">(배합비 100%에 미포함 · 정제수, 증기 등)</span>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addAdditionalIngredient}>
                  <Plus className="w-4 h-4 mr-1" />추가
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {additionalIngredients.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground text-sm border-t">
                  추가 원재료가 없습니다. 정제수 등 배합비에 포함되지 않는 재료를 추가하세요.
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/60 border-y text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left" style={{width: "36px"}}>#</th>
                      <th className="px-3 py-2 text-left" style={{width: "auto"}}>원재료</th>
                      <th className="px-3 py-2 text-left" style={{width: "160px"}}>설명</th>
                      <th className="px-3 py-2 text-right" style={{width: "100px"}}>투입량(kg)</th>
                      <th className="px-3 py-2 text-left" style={{width: "150px"}}>CCP 공정그룹</th>
                      <th className="px-2 py-2 text-center" style={{width: "40px"}}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {additionalIngredients.map((add, index) => (
                      <tr key={index} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-1.5 text-xs text-muted-foreground font-mono">+{index + 1}</td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={add.materialId?.toString() || "none"}
                            onValueChange={(v) => updateAdditionalIngredient(index, "materialId", v === "none" ? undefined : parseInt(v))}
                          >
                            <SelectTrigger className="h-8 text-sm border-0 shadow-none bg-transparent px-1">
                              <SelectValue placeholder="원재료 선택" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">선택 안 함</SelectItem>
                              {materials?.map((m: any) => (
                                <SelectItem key={m.id} value={m.id.toString()}>
                                  {m.materialName || m.itemName || `ID: ${m.id}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            className="h-8 text-sm border-0 shadow-none bg-transparent px-1"
                            value={add.description}
                            onChange={(e) => updateAdditionalIngredient(index, "description", e.target.value)}
                            placeholder="예: 정제수"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number" step="0.01"
                            className="h-8 text-sm text-right font-mono border-0 shadow-none bg-transparent px-1"
                            value={add.quantity || ""}
                            onChange={(e) => updateAdditionalIngredient(index, "quantity", parseFloat(e.target.value) || 0)}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-1.5">
                          <Select
                            value={add.processGroupId?.toString() || "none"}
                            onValueChange={(v) => updateAdditionalIngredient(index, "processGroupId", v === "none" ? null : parseInt(v))}
                          >
                            <SelectTrigger className="h-8 text-sm border-0 shadow-none bg-transparent px-1">
                              <SelectValue placeholder="미지정" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">미지정</SelectItem>
                              {heatProcessGroups.map((pg: any) => (
                                <SelectItem key={pg.id} value={pg.id.toString()}>
                                  {pg.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAdditionalIngredient(index)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* 생산량 검증 요약 */}
          {batchProdKg > 0 && ingredients.length > 0 && (
            <Card className={`mb-3 ${Math.abs(weightDiffPercent) < 1 ? "border-green-300" : Math.abs(weightDiffPercent) < 5 ? "border-yellow-300" : "border-red-300"}`}>
              <CardContent className="py-2 px-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-sm">
                    {Math.abs(weightDiffPercent) < 1 ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    ) : (
                      <AlertTriangle className={`w-5 h-5 shrink-0 ${Math.abs(weightDiffPercent) < 5 ? "text-yellow-500" : "text-red-500"}`} />
                    )}
                    <div className="flex flex-wrap items-center gap-x-3">
                      <span className="font-semibold">생산량 검증</span>
                      <span className="text-muted-foreground">|</span>
                      <span>배치 목표: <strong>{batchProdKg.toFixed(1)}kg</strong></span>
                      <span className="text-muted-foreground">|</span>
                      <span>실제 투입: <strong className="text-blue-600">{totalAdjustedWeight.toFixed(2)}kg</strong></span>
                      <span className="text-muted-foreground">|</span>
                      <span className={`font-semibold ${weightDifference > 0 ? "text-red-600" : weightDifference < 0 ? "text-blue-600" : "text-green-600"}`}>
                        차이: {weightDifference > 0 ? "+" : ""}{weightDifference.toFixed(2)}kg ({weightDiffPercent > 0 ? "+" : ""}{weightDiffPercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="w-4 h-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">수율조정 중량이 입력된 재료는 해당 값을, 미입력 재료는 환산중량을 사용하여 합산합니다.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 저장 및 기능 버튼 */}
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setExportDialogOpen(true)} disabled={!reportDetail}>
                <FileDown className="w-4 h-4 mr-1" />배합표 출력
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleBatchPreview}>
                <Eye className="w-4 h-4 mr-1" />배치 계산
              </Button>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setLocation("/dashboard/mf-reports")}>취소</Button>
              <Button type="submit" size="sm" disabled={updateMutation.isPending || !isValid100Percent}>
                {updateMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />저장 중...</>
                ) : (
                  <><Save className="w-4 h-4 mr-1" />저장</>
                )}
              </Button>
            </div>
          </div>
        </form>

        {/* 배합표 출력 다이얼로그 */}
        <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>배합표 출력</DialogTitle>
              <DialogDescription>출력할 배합표 형식을 선택하세요</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Select value={exportMode} onValueChange={(v: "summary" | "detailed") => setExportMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="summary">요약형 (원재료 + 중간재)</SelectItem>
                  <SelectItem value="detailed">상세형 (BOM 펼침)</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setExportDialogOpen(false)}>취소</Button>
                <Button onClick={handleConfirmExport}>
                  <FileDown className="w-4 h-4 mr-1" />다운로드
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* 배치 계산 미리보기 다이얼로그 */}
        <Dialog open={batchPreviewOpen} onOpenChange={setBatchPreviewOpen}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>배치 계산 미리보기</DialogTitle>
              <DialogDescription>배치 크기에 따른 원재료 필요량 (모든 단위: kg)</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="text-xs mb-1">배치 크기 (kg)</Label>
                  <Input type="number" value={batchKg} onChange={(e) => setBatchKg(parseFloat(e.target.value) || 10)} min="1" step="0.1" className="h-9" />
                </div>
                <Button onClick={() => toast.success("계산 완료")}>계산</Button>
              </div>
              {batchPreviewData && batchPreviewData.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 border-y text-xs text-muted-foreground">
                      <th className="px-3 py-2 text-left" style={{width: "36px"}}>#</th>
                      <th className="px-3 py-2 text-left" style={{width: "80px"}}>구분</th>
                      <th className="px-3 py-2 text-left">재료명</th>
                      <th className="px-3 py-2 text-right" style={{width: "110px"}}>필요량(kg)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchPreviewData.map((req: any) => (
                      <tr key={req.lineNo} className={`border-b ${req.isAdditional ? "bg-blue-50/50" : ""}`}>
                        <td className="px-3 py-1.5 text-xs font-mono">{req.lineNo}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {req.isAdditional ? (
                            <Badge variant="outline" className="text-xs px-1.5">추가</Badge>
                          ) : (
                            req.materialType === "RAW" ? "원재료" : "중간재"
                          )}
                        </td>
                        <td className="px-3 py-1.5">{req.materialName}</td>
                        <td className="px-3 py-1.5 text-right font-mono font-semibold">{req.requiredQuantity}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 border-t-2 font-semibold">
                      <td className="px-3 py-2" colSpan={3}>합계</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {batchPreviewData.reduce((sum: number, r: any) => sum + parseFloat(r.requiredQuantity), 0).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  배치 크기를 입력하면 자동 계산됩니다
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setBatchPreviewOpen(false)}>닫기</Button>
                <Button variant="secondary" onClick={handleExportToExcel} disabled={!batchPreviewData || batchPreviewData.length === 0}>
                  <FileDown className="w-4 h-4 mr-1" />엑셀
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
