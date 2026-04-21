import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, ArrowLeft, Eye } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { todayLocal } from "../../lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

interface IngredientRow {
  materialId?: number;
  intermediateId?: number;
  quantity: string;
  unit: string;
  isDeductible: boolean;
  materialType: "RAW" | "MIXED" | "FLAVOR_SPECIFIC";
  flavorName?: string; // 부재료의 경우 맛 이름
}

export default function MfReportCreate() {
  const L = useIndustryLabel();
  const [, setLocation] = useLocation();
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [reportCode, setReportCode] = useState("");
  const [productName, setProductName] = useState("");
  const [version, setVersion] = useState("1.0");
  // 맛 선택 제거됨
  const [yieldBasis, setYieldBasis] = useState<"UNIT" | "BATCH">("UNIT");
  const [unitWeightG, setUnitWeightG] = useState("");
  const [batchTargetKg, setBatchTargetKg] = useState("");
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);

  const [newIngredient, setNewIngredient] = useState<IngredientRow>({
    quantity: "",
    unit: "%",
    isDeductible: true,
    materialType: "RAW",
  });

  // 페이지 로드 시 바로 데이터를 fetch
  const { data: _rawProducts, isLoading: productsLoading } =
    trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);
  const { data: _rawMaterials, isLoading: materialsLoading } =
    trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  const { data: intermediates, isLoading: intermediatesLoading } =
    trpc.intermediate.list.useQuery(undefined);

  // 검색용 옵션 목록 생성
  const productOptions: SearchableSelectOption[] = useMemo(() =>
    (products || []).map((p: any) => ({
      value: p.id.toString(),
      label: `${p.productName} (${p.productCode})`,
    })), [products]);

  const materialOptions: SearchableSelectOption[] = useMemo(() =>
    (materials || []).map((m: any) => ({
      value: m.id.toString(),
      label: `${m.materialName} (${m.materialCode})`,
    })), [materials]);

  const intermediateOptions: SearchableSelectOption[] = useMemo(() =>
    (intermediates || []).map((i: any) => ({
      value: i.id.toString(),
      label: `${i.materialName} (${i.materialCode})`,
    })), [intermediates]);

  const createMutation = trpc.mfReport.create.useMutation({
    onSuccess: () => {
      toast.success("품목제조보고가 생성되었습니다");
      setLocation("/dashboard/manufacturing-standards");
    },
    onError: (error: { message: string }) => {
      toast.error(`생성 실패: ${error.message}`);
    },
  });

  const handleAddIngredient = () => {
    if (
      (!newIngredient.materialId && !newIngredient.intermediateId) ||
      !newIngredient.quantity
    ) {
      toast.error("원재료/중간재와 수량을 입력하세요");
      return;
    }

    // 부재료의 경우 맛 이름 필수
    if (newIngredient.materialType === "FLAVOR_SPECIFIC" && !newIngredient.flavorName) {
      toast.error("부재료는 맛 이름을 입력해야 합니다");
      return;
    }

    setIngredients([...ingredients, { ...newIngredient }]);
    setNewIngredient({
      quantity: "",
      unit: "kg",
      isDeductible: true,
      materialType: "RAW",
    });
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  // 100% 검증 로직
  const calculateTotalPercentage = () => {
    return ingredients.reduce((sum, ing) => sum + parseFloat(ing.quantity || "0"), 0);
  };

  const totalPercentage = calculateTotalPercentage();
  const isValid100Percent = Math.abs(totalPercentage - 100) < 0.01; // 소수점 오차 허용

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProductId || !reportCode || !productName || !version) {
      toast.error("모든 필수 항목을 입력하세요");
      return;
    }

    if (ingredients.length === 0) {
      toast.error("최소 1개 이상의 원재료/혼합재제를 추가하세요");
      return;
    }

    // 100% 검증
    if (!isValid100Percent) {
      toast.error(`원재료/혼합재제/부재료의 합계는 100%여야 합니다 (현재: ${totalPercentage.toFixed(2)}%)`);
      return;
    }

    createMutation.mutate({
      productId: parseInt(selectedProductId),
      reportNo: reportCode,
      reportDate: todayLocal(),
      yieldBasis,
      unitWeightG: unitWeightG ? parseFloat(unitWeightG) : undefined,
      batchTargetKg: batchTargetKg ? parseFloat(batchTargetKg) : undefined,
      ingredients: ingredients.map((ing) => ({
        materialId: ing.materialId,
        intermediateId: ing.intermediateId,
        quantity: parseFloat(ing.quantity),
        unit: ing.unit,
        isDeductible: ing.isDeductible ? 1 : 0,
        materialType: ing.materialType,
        flavorName: ing.flavorName,
      })),
    });
  };

  const getMaterialName = (materialId?: number) => {
    if (!materialId || !materials) return "";
    const material = materials.find((m: any) => m.id === materialId);
    return material ? `${material.materialName} (${material.materialCode})` : "";
  };

  const getIntermediateName = (intermediateId?: number) => {
    if (!intermediateId || !intermediates) return "";
    const intermediate = intermediates.find((i: any) => i.id === intermediateId);
    return intermediate
      ? `${intermediate.materialName} (${intermediate.materialCode})`
      : "";
  };

  // 로딩 스피너 제거 - 지연 로딩 방식으로 변경

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <h1 className="text-3xl font-bold mb-6">품목제조보고 등록</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="product">{L("product")} 선택 *</Label>
                <SearchableSelect
                  id="product"
                  options={productOptions}
                  value={selectedProductId}
                  onValueChange={setSelectedProductId}
                  placeholder="제품 검색..."
                  searchPlaceholder="제품명 또는 코드 검색..."
                  emptyMessage="검색 결과가 없습니다"
                  isLoading={productsLoading}
                />
              </div>

              <div>
                <Label htmlFor="reportCode">보고서 코드 *</Label>
                <Input
                  id="reportCode"
                  value={reportCode}
                  onChange={(e) => setReportCode(e.target.value)}
                  placeholder="예: MFR-001"
                />
              </div>

              <div>
                <Label htmlFor="productName">제품명 *</Label>
                <Input
                  id="productName"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="예: 팥앙금 떡"
                />
              </div>

              <div>
                <Label htmlFor="version">버전 *</Label>
                <Input
                  id="version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="예: 1.0"
                />
              </div>

              {/* 맛 선택 UI 제거됨 - 부재료로 대체 */}
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold mb-3">{`${L("batch")} 정보`}</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="yieldBasis">수율 기준</Label>
                  <Select value={yieldBasis} onValueChange={(value: "UNIT" | "BATCH") => setYieldBasis(value)}>
                    <SelectTrigger id="yieldBasis">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="UNIT">개수 기준</SelectItem>
                      <SelectItem value="BATCH">중량 기준</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="unitWeightG">단위 중량 (g)</Label>
                  <Input
                    id="unitWeightG"
                    type="number"
                    value={unitWeightG}
                    onChange={(e) => setUnitWeightG(e.target.value)}
                    placeholder="예: 50"
                  />
                </div>

                <div>
                  <Label htmlFor="batchTargetKg">{L("batch")} 목표 (kg)</Label>
                  <Input
                    id="batchTargetKg"
                    type="number"
                    value={batchTargetKg}
                    onChange={(e) => setBatchTargetKg(e.target.value)}
                    placeholder="예: 10"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{`${L("material")} 및 혼합재제 구성`}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-6 gap-4 items-end">
              <div>
                <Label htmlFor="materialType">재료 타입</Label>
                <Select
                  value={newIngredient.materialType}
                  onValueChange={(value: "RAW" | "MIXED" | "FLAVOR_SPECIFIC") =>
                    setNewIngredient({ ...newIngredient, materialType: value, materialId: undefined, intermediateId: undefined, flavorName: undefined })
                  }
                >
                  <SelectTrigger id="materialType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RAW">{L("material")}</SelectItem>
                    <SelectItem value="MIXED">중간재</SelectItem>
                    <SelectItem value="FLAVOR_SPECIFIC">부재료(맛별)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {newIngredient.materialType !== "FLAVOR_SPECIFIC" ? (
                <div className="col-span-2">
                  <Label htmlFor="ingredient">
                    {newIngredient.materialType === "RAW" ? "원재료" : "중간재"}
                  </Label>
                  {newIngredient.materialType === "MIXED" ? (
                    <SearchableSelect
                      id="ingredient"
                      options={intermediateOptions}
                      value={newIngredient.intermediateId?.toString() || ""}
                      onValueChange={(value) =>
                        setNewIngredient({ ...newIngredient, intermediateId: value ? parseInt(value) : undefined, materialId: undefined })
                      }
                      placeholder="중간재 검색..."
                      searchPlaceholder="중간재명 또는 코드 검색..."
                      emptyMessage="검색 결과가 없습니다"
                      isLoading={intermediatesLoading}
                    />
                  ) : (
                    <SearchableSelect
                      id="ingredient"
                      options={materialOptions}
                      value={newIngredient.materialId?.toString() || ""}
                      onValueChange={(value) =>
                        setNewIngredient({ ...newIngredient, materialId: value ? parseInt(value) : undefined, intermediateId: undefined })
                      }
                      placeholder="원재료 검색..."
                      searchPlaceholder="원재료명 또는 코드 검색..."
                      emptyMessage="검색 결과가 없습니다"
                      isLoading={materialsLoading}
                    />
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <Label htmlFor="flavorIngredientType">부재료 타입</Label>
                    <Select
                      value={newIngredient.intermediateId ? "MIXED" : "RAW"}
                      onValueChange={(value) => {
                        if (value === "MIXED") {
                          setNewIngredient({ ...newIngredient, materialId: undefined });
                        } else {
                          setNewIngredient({ ...newIngredient, intermediateId: undefined });
                        }
                      }}
                    >
                      <SelectTrigger id="flavorIngredientType">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RAW">{L("material")}</SelectItem>
                        <SelectItem value="MIXED">중간재</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="flavorIngredient">부재료 선택</Label>
                    {newIngredient.intermediateId || (!newIngredient.materialId && !newIngredient.intermediateId) ? (
                      <SearchableSelect
                        id="flavorIngredient"
                        options={intermediateOptions}
                        value={newIngredient.intermediateId?.toString() || ""}
                        onValueChange={(value) =>
                          setNewIngredient({ ...newIngredient, intermediateId: value ? parseInt(value) : undefined, materialId: undefined })
                        }
                        placeholder="중간재 검색..."
                        searchPlaceholder="중간재명 또는 코드 검색..."
                        emptyMessage="검색 결과가 없습니다"
                        isLoading={intermediatesLoading}
                      />
                    ) : (
                      <SearchableSelect
                        id="flavorIngredient"
                        options={materialOptions}
                        value={newIngredient.materialId?.toString() || ""}
                        onValueChange={(value) =>
                          setNewIngredient({ ...newIngredient, materialId: value ? parseInt(value) : undefined, intermediateId: undefined })
                        }
                        placeholder="원재료 검색..."
                        searchPlaceholder="원재료명 또는 코드 검색..."
                        emptyMessage="검색 결과가 없습니다"
                        isLoading={materialsLoading}
                      />
                    )}
                  </div>
                  <div>
                    <Label htmlFor="flavorName">맛 이름</Label>
                    <Input
                      id="flavorName"
                      value={newIngredient.flavorName || ""}
                      onChange={(e) =>
                        setNewIngredient({ ...newIngredient, flavorName: e.target.value })
                      }
                      placeholder="예: 딸기, 녹차, 초코"
                    />
                  </div>
                </>
              )}

              {/* 맛 이름 입력 필드는 부재료 선택 섹션에 포함됨 */}

              <div>
                <Label htmlFor="quantity">비율 (%)</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  value={newIngredient.quantity}
                  onChange={(e) =>
                    setNewIngredient({ ...newIngredient, quantity: e.target.value })
                  }
                  placeholder="예: 25.5"
                />
              </div>

              <div>
                <Label htmlFor="unit">단위</Label>
                <Input
                  id="unit"
                  value="%"
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isDeductible"
                  checked={newIngredient.isDeductible}
                  onCheckedChange={(checked) =>
                    setNewIngredient({ ...newIngredient, isDeductible: checked as boolean })
                  }
                />
                <Label htmlFor="isDeductible" className="text-sm">
                  재고 차감
                </Label>
              </div>

              <Button type="button" onClick={handleAddIngredient}>
                <Plus className="w-4 h-4 mr-2" />
                추가
              </Button>
            </div>

            {ingredients.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>재료 타입</TableHead>
                    <TableHead>재료명</TableHead>
                    <TableHead>맛 이름</TableHead>
                    <TableHead>수량</TableHead>
                    <TableHead>단위</TableHead>
                    <TableHead>재고 차감</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ingredients.map((ing, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {ing.materialType === "RAW" ? "원재료" : ing.materialType === "MIXED" ? "중간재" : "부재료"}
                      </TableCell>
                      <TableCell>
                        {ing.materialType === "MIXED"
                          ? getIntermediateName(ing.intermediateId)
                          : getMaterialName(ing.materialId)}
                      </TableCell>
                      <TableCell>{ing.flavorName || "-"}</TableCell>
                      <TableCell>{ing.quantity}</TableCell>
                      <TableCell>{ing.unit}</TableCell>
                      <TableCell>{ing.isDeductible ? "예" : "아니오"}</TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveIngredient(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* 100% 합계 검증 게이지 */}
            {ingredients.length > 0 && (
              <div className="mt-4 p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">합계 비율</span>
                  <span className={`text-lg font-bold ${
                    isValid100Percent ? "text-green-600" : "text-red-600"
                  }`}>
                    {totalPercentage.toFixed(2)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      isValid100Percent ? "bg-green-500" : totalPercentage > 100 ? "bg-red-500" : "bg-yellow-500"
                    }`}
                    style={{ width: `${Math.min(totalPercentage, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {isValid100Percent
                    ? "✓ 합계가 100%입니다."
                    : totalPercentage > 100
                    ? `⚠ 합계가 100%를 초과합니다 (+${(totalPercentage - 100).toFixed(2)}%)`
                    : `⚠ 합계가 100%에 미달합니다 (-${(100 - totalPercentage).toFixed(2)}%)`}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => setLocation("/dashboard/mf-report")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            취소
          </Button>

          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            생성
          </Button>
        </div>
      </form>


    </div>
    </DashboardLayout>
  );
}
