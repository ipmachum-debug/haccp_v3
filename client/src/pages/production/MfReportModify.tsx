import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import { formatLocalDate } from "../../lib/dateUtils";

interface IngredientRow {
  materialId?: number;
  intermediateId?: number;
  quantity: number;
  unit: string;
  isDeductible: number;
  materialType: "RAW" | "MIXED" | "FLAVOR_SPECIFIC";
  flavorName?: string;
  materialName?: string; // 백엔드에서 조회된 원재료명
}

export default function MfReportModify() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const reportId = parseInt(id || "0");

  // === 데이터 로드 ===
  const { data: reportDetail, isLoading: isLoadingReport } = trpc.mfReport.getById.useQuery({ id: reportId });
  const { data: latestVersion, isLoading: isLoadingVersion } = trpc.mfReport.getVersions.useQuery({ mfReportId: reportId });
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  const { data: intermediates } = trpc.intermediate.list.useQuery();

  // === 폼 상태 ===
  const [reportNo, setReportNo] = useState("");
  const [reportDate, setReportDate] = useState("");
  const [productName, setProductName] = useState("");
  const [yieldBasis, setYieldBasis] = useState<"UNIT" | "BATCH">("UNIT");
  const [unitWeightG, setUnitWeightG] = useState("");
  const [batchTargetKg, setBatchTargetKg] = useState("");

  // === 원재료 구성 ===
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);

  // === 새 원재료 추가 폼 ===
  const [newIngredient, setNewIngredient] = useState<IngredientRow>({
    quantity: 0,
    unit: "%",
    isDeductible: 1,
    materialType: "RAW",
  });

  // === Mutations ===
  const utils = trpc.useUtils();
  const updateMutation = trpc.mfReport.update.useMutation({
    onSuccess: () => {
      toast.success("품목제조보고가 수정되었습니다");
      utils.mfReport.getById.invalidate({ id: reportId });
      utils.mfReport.getVersions.invalidate({ mfReportId: reportId });
    },
    onError: (error: any) => {
      toast.error(`수정 실패: ${error.message}`);
    },
  });

  // === 데이터 초기화 ===
  useEffect(() => {
    if (reportDetail && latestVersion && latestVersion.length > 0) {
      setReportNo(reportDetail.reportNo || "");
      setReportDate(formatLocalDate(new Date(reportDetail.reportDate)));
      setProductName(reportDetail.productName || "");

      const ver = latestVersion[0];
      if (ver.yieldBasis) setYieldBasis(ver.yieldBasis === "BATCH" ? "BATCH" : "UNIT");
      if (ver.unitWeightG) setUnitWeightG(String(ver.unitWeightG));
      if (ver.batchTargetKg) setBatchTargetKg(String(ver.batchTargetKg));

      // 원재료 로드 (reportDetail.ingredients 또는 version.ingredients에서)
      const ingSource = reportDetail.ingredients || (ver as any).ingredients || [];
      if (ingSource.length > 0) {
        const mainIngredients = ingSource
          .filter((ing: any) => !ing.isAdditional || ing.isAdditional === 0)
          .map((ing: any) => ({
            materialId: ing.materialId || undefined,
            intermediateId: ing.intermediateId || undefined,
            quantity: parseFloat(ing.quantity) || 0,
            unit: ing.unit || "%",
            isDeductible: ing.isDeductible ?? 1,
            materialType: ing.materialType || "RAW",
            flavorName: ing.flavorName || undefined,
            materialName: ing.materialName || undefined,
          }));
        setIngredients(mainIngredients);
      }
    }
  }, [reportDetail, latestVersion]);

  // === 100% 검증 ===
  const totalPercentage = useMemo(() => {
    return ingredients.reduce((sum, ing) => sum + (ing.quantity || 0), 0);
  }, [ingredients]);
  const isValid100Percent = Math.abs(totalPercentage - 100) < 0.01;

  // === 원재료 추가 ===
  const handleAddIngredient = () => {
    if (!newIngredient.materialId && !newIngredient.intermediateId) {
      toast.error("원재료 또는 중간재를 선택하세요");
      return;
    }
    if (!newIngredient.quantity || newIngredient.quantity <= 0) {
      toast.error("비율을 입력하세요");
      return;
    }
    if (newIngredient.materialType === "FLAVOR_SPECIFIC" && !newIngredient.flavorName) {
      toast.error("부재료는 맛 이름을 입력해야 합니다");
      return;
    }
    setIngredients([...ingredients, { ...newIngredient }]);
    setNewIngredient({
      quantity: 0,
      unit: "%",
      isDeductible: 1,
      materialType: "RAW",
    });
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  // === 비율 수정 ===
  const handleQuantityChange = (index: number, value: string) => {
    const updated = [...ingredients];
    updated[index].quantity = parseFloat(value) || 0;
    setIngredients(updated);
  };

  // === 저장 (덮어쓰기 UPDATE) ===
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

    updateMutation.mutate({
      mfReportId: reportId,
      reportNo,
      reportDate,
      yieldBasis,
      unitWeightG: unitWeightG ? parseFloat(unitWeightG) : undefined,
      batchTargetKg: batchTargetKg ? parseFloat(batchTargetKg) : undefined,
      ingredients: ingredients.map((ing) => ({
        materialId: ing.materialId,
        intermediateId: ing.intermediateId,
        quantity: ing.quantity,
        unit: ing.unit,
        isDeductible: ing.isDeductible ?? 1,
        materialType: ing.materialType,
        flavorName: ing.flavorName,
      })),
    });
  };

  // === 헬퍼 ===
  const getMaterialName = (materialId?: number, storedName?: string) => {
    if (storedName) return storedName;
    if (!materialId || !materials) return "";
    const m = materials.find((mat: any) => mat.id === materialId);
    return m ? `${m.materialName} (${m.materialCode})` : `ID:${materialId}`;
  };

  const getIntermediateName = (intermediateId?: number) => {
    if (!intermediateId || !intermediates) return "";
    const i = (intermediates as any[]).find((item: any) => item.id === intermediateId);
    return i ? `${i.materialName} (${i.materialCode})` : `ID:${intermediateId}`;
  };

  // === 로딩/에러 ===
  if (isLoadingReport || isLoadingVersion) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!reportDetail) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <p className="text-muted-foreground">보고서를 찾을 수 없습니다.</p>
          <Button variant="outline" onClick={() => setLocation("/dashboard/manufacturing-standards")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> 목록으로
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-24">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard/manufacturing-standards")}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">품목제조보고 수정</h1>
              <p className="text-sm text-muted-foreground">{productName} — 보고서 기본정보 및 원재료 구성을 수정합니다</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 기본 정보 */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">기본 정보</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>제품명</Label>
                  <Input value={productName} disabled className="bg-muted" />
                </div>
                <div>
                  <Label>보고서 번호</Label>
                  <Input value={reportNo} onChange={(e) => setReportNo(e.target.value)} />
                </div>
                <div>
                  <Label>보고일</Label>
                  <Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>수율 기준</Label>
                  <Select value={yieldBasis} onValueChange={(v: "UNIT" | "BATCH") => setYieldBasis(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNIT">개수 기준</SelectItem>
                      <SelectItem value="BATCH">중량 기준</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>단위 중량 (g)</Label>
                  <Input type="number" value={unitWeightG} onChange={(e) => setUnitWeightG(e.target.value)} placeholder="예: 50" />
                </div>
                <div>
                  <Label>배치 목표 (kg)</Label>
                  <Input type="number" value={batchTargetKg} onChange={(e) => setBatchTargetKg(e.target.value)} placeholder="예: 10" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 원재료 구성 */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">원재료 및 혼합재제 구성</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              {/* 기존 원재료 테이블 */}
              {ingredients.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[80px]">No</TableHead>
                      <TableHead className="w-[100px]">타입</TableHead>
                      <TableHead>재료명</TableHead>
                      <TableHead className="w-[80px]">맛</TableHead>
                      <TableHead className="w-[120px]">비율 (%)</TableHead>
                      <TableHead className="w-[60px]">삭제</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ingredients.map((ing, index) => (
                      <TableRow key={index}>
                        <TableCell className="text-sm">{index + 1}</TableCell>
                        <TableCell className="text-sm">
                          {ing.materialType === "RAW" ? "원재료" : ing.materialType === "MIXED" ? "중간재" : "부재료"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {ing.materialType === "MIXED"
                            ? getIntermediateName(ing.intermediateId)
                            : getMaterialName(ing.materialId, ing.materialName)}
                        </TableCell>
                        <TableCell className="text-sm">{ing.flavorName || "-"}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={ing.quantity}
                            onChange={(e) => handleQuantityChange(index, e.target.value)}
                            className="h-8 text-sm"
                          />
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveIngredient(index)}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* 100% 합계 게이지 */}
              {ingredients.length > 0 && (
                <div className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">합계 비율</span>
                    <span className={`text-base font-bold ${isValid100Percent ? "text-green-600" : "text-red-600"}`}>
                      {totalPercentage.toFixed(2)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isValid100Percent ? "bg-green-500" : totalPercentage > 100 ? "bg-red-500" : "bg-yellow-500"
                      }`}
                      style={{ width: `${Math.min(totalPercentage, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isValid100Percent
                      ? "합계가 100%입니다."
                      : totalPercentage > 100
                      ? `합계가 100%를 초과합니다 (+${(totalPercentage - 100).toFixed(2)}%)`
                      : `합계가 100%에 미달합니다 (-${(100 - totalPercentage).toFixed(2)}%)`}
                  </p>
                </div>
              )}

              {/* 새 원재료 추가 */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3">원재료 추가</h4>
                <div className="grid grid-cols-6 gap-3 items-end">
                  <div>
                    <Label className="text-xs">타입</Label>
                    <Select
                      value={newIngredient.materialType}
                      onValueChange={(v: "RAW" | "MIXED" | "FLAVOR_SPECIFIC") =>
                        setNewIngredient({ ...newIngredient, materialType: v, materialId: undefined, intermediateId: undefined, flavorName: undefined })
                      }
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RAW">원재료</SelectItem>
                        <SelectItem value="MIXED">중간재</SelectItem>
                        <SelectItem value="FLAVOR_SPECIFIC">부재료(맛별)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2">
                    <Label className="text-xs">
                      {newIngredient.materialType === "MIXED" ? "중간재" : "원재료"}
                    </Label>
                    {newIngredient.materialType === "MIXED" ? (
                      <Select
                        value={newIngredient.intermediateId?.toString() || ""}
                        onValueChange={(v) => setNewIngredient({ ...newIngredient, intermediateId: parseInt(v), materialId: undefined })}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="중간재 선택" /></SelectTrigger>
                        <SelectContent>
                          {(intermediates as any[] || []).map((item: any) => (
                            <SelectItem key={item.id} value={item.id.toString()}>
                              {item.materialName} ({item.materialCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={newIngredient.materialId?.toString() || ""}
                        onValueChange={(v) => setNewIngredient({ ...newIngredient, materialId: parseInt(v), intermediateId: undefined })}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder="원재료 선택" /></SelectTrigger>
                        <SelectContent>
                          {materials.map((m: any) => (
                            <SelectItem key={m.id} value={m.id.toString()}>
                              {m.materialName} ({m.materialCode})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {newIngredient.materialType === "FLAVOR_SPECIFIC" && (
                    <div>
                      <Label className="text-xs">맛 이름</Label>
                      <Input
                        value={newIngredient.flavorName || ""}
                        onChange={(e) => setNewIngredient({ ...newIngredient, flavorName: e.target.value })}
                        placeholder="예: 딸기"
                        className="h-9"
                      />
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">비율 (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newIngredient.quantity || ""}
                      onChange={(e) => setNewIngredient({ ...newIngredient, quantity: parseFloat(e.target.value) || 0 })}
                      placeholder="예: 25.5"
                      className="h-9"
                    />
                  </div>

                  <div>
                    <Button type="button" size="sm" onClick={handleAddIngredient} className="h-9">
                      <Plus className="w-4 h-4 mr-1" /> 추가
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 저장/취소 버튼 */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setLocation("/dashboard/manufacturing-standards")}>
              <ArrowLeft className="w-4 h-4 mr-2" /> 취소
            </Button>
            <Button type="submit" disabled={updateMutation.isPending || !isValid100Percent}>
              {updateMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              저장 (덮어쓰기)
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
