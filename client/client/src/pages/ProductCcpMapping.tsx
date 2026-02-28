import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Loader2, Save, Settings, Search, Edit, Trash2, Plus, ChevronRight, Thermometer, Timer, Gauge, Zap } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const CCP_TYPES = [
  { value: "CCP-1B", label: "CCP-1B", description: "금속검출 (입고검사)", icon: Zap },
  { value: "CCP-2B", label: "CCP-2B", description: "금속검출 (포장 전)", icon: Zap },
  { value: "CCP-3B", label: "CCP-3B", description: "자외선 살균", icon: Thermometer },
  { value: "CCP-4P", label: "CCP-4P", description: "금속검출 (최종)", icon: Gauge },
];

const CCP_TYPE_COLORS: Record<string, string> = {
  "CCP-1B": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "CCP-2B": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "CCP-3B": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "CCP-4P": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

// 한계기준 값 편집 다이얼로그
function SpecEditDialog({
  open,
  onClose,
  productId,
  productName,
  ccpType,
  existingSpec,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  productId: number;
  productName: string;
  ccpType: string;
  existingSpec: any | null;
  onSaved: () => void;
}) {
  const [formData, setFormData] = useState({
    minTempC: "",
    maxTempC: "",
    minDurationMin: "",
    maxDurationMin: "",
    minPressureBar: "",
    maxPressureBar: "",
    feSensitivity: "",
    susSensitivity: "",
    description: "",
  });

  useEffect(() => {
    if (existingSpec) {
      setFormData({
        minTempC: existingSpec.minTempC ?? existingSpec.min_temp_c ?? "",
        maxTempC: existingSpec.maxTempC ?? existingSpec.max_temp_c ?? "",
        minDurationMin: existingSpec.minDurationMin ?? existingSpec.min_duration_min ?? "",
        maxDurationMin: existingSpec.maxDurationMin ?? existingSpec.max_duration_min ?? "",
        minPressureBar: existingSpec.minPressureBar ?? existingSpec.min_pressure_bar ?? "",
        maxPressureBar: existingSpec.maxPressureBar ?? existingSpec.max_pressure_bar ?? "",
        feSensitivity: existingSpec.feSensitivity ?? existingSpec.fe_sensitivity ?? "",
        susSensitivity: existingSpec.susSensitivity ?? existingSpec.sus_sensitivity ?? "",
        description: existingSpec.description ?? "",
      });
    } else {
      setFormData({
        minTempC: "",
        maxTempC: "",
        minDurationMin: "",
        maxDurationMin: "",
        minPressureBar: "",
        maxPressureBar: "",
        feSensitivity: "",
        susSensitivity: "",
        description: "",
      });
    }
  }, [existingSpec, open]);

  const createMutation = trpc.ccpMonitoring.createProductCcpSpec.useMutation({
    onSuccess: () => {
      toast.success(`${productName}의 ${ccpType} 한계기준이 저장되었습니다.`);
      onSaved();
      onClose();
    },
    onError: (err: any) => toast.error(`저장 실패: ${err.message}`),
  });

  const updateMutation = trpc.ccpMonitoring.updateProductCcpSpec.useMutation({
    onSuccess: () => {
      toast.success(`${productName}의 ${ccpType} 한계기준이 수정되었습니다.`);
      onSaved();
      onClose();
    },
    onError: (err: any) => toast.error(`수정 실패: ${err.message}`),
  });

  const handleSave = () => {
    const data: any = {};
    if (formData.minTempC) data.minTempC = formData.minTempC;
    if (formData.maxTempC) data.maxTempC = formData.maxTempC;
    if (formData.minDurationMin) data.minDurationMin = Number(formData.minDurationMin);
    if (formData.maxDurationMin) data.maxDurationMin = Number(formData.maxDurationMin);
    if (formData.minPressureBar) data.minPressureBar = formData.minPressureBar;
    if (formData.maxPressureBar) data.maxPressureBar = formData.maxPressureBar;
    if (formData.feSensitivity) data.feSensitivity = formData.feSensitivity;
    if (formData.susSensitivity) data.susSensitivity = formData.susSensitivity;
    if (formData.description) data.description = formData.description;

    if (existingSpec) {
      const specId = existingSpec.id ?? existingSpec.id;
      updateMutation.mutate({ id: specId, ...data });
    } else {
      createMutation.mutate({ productId, ccpType, ...data });
    }
  };

  const isHeatingType = ccpType === "CCP-1B" || ccpType === "CCP-2B" || ccpType === "CCP-3B";
  const isMetalType = ccpType === "CCP-4P";
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Badge className={CCP_TYPE_COLORS[ccpType] || ""}>{ccpType}</Badge>
            한계기준 {existingSpec ? "수정" : "설정"}
          </DialogTitle>
          <DialogDescription>
            {productName} 제품의 {ccpType} 한계기준 값을 설정합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* 가열 관련 필드 */}
          {isHeatingType && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">최소 온도 (°C)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="예: 80.0"
                    value={formData.minTempC}
                    onChange={(e) => setFormData({ ...formData, minTempC: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">최대 온도 (°C)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="예: 100.0"
                    value={formData.maxTempC}
                    onChange={(e) => setFormData({ ...formData, maxTempC: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">최소 시간 (분)</Label>
                  <Input
                    type="number"
                    placeholder="예: 20"
                    value={formData.minDurationMin}
                    onChange={(e) => setFormData({ ...formData, minDurationMin: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">최대 시간 (분)</Label>
                  <Input
                    type="number"
                    placeholder="예: 40"
                    value={formData.maxDurationMin}
                    onChange={(e) => setFormData({ ...formData, maxDurationMin: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">최소 압력 (bar)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="예: 0.10"
                    value={formData.minPressureBar}
                    onChange={(e) => setFormData({ ...formData, minPressureBar: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">최대 압력 (bar)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="예: 0.20"
                    value={formData.maxPressureBar}
                    onChange={(e) => setFormData({ ...formData, maxPressureBar: e.target.value })}
                  />
                </div>
              </div>
            </>
          )}

          {/* 금속검출 관련 필드 */}
          {isMetalType && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Fe 감도</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="예: 1.50"
                  value={formData.feSensitivity}
                  onChange={(e) => setFormData({ ...formData, feSensitivity: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SUS 감도</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="예: 2.00"
                  value={formData.susSensitivity}
                  onChange={(e) => setFormData({ ...formData, susSensitivity: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* 비고 */}
          <div className="space-y-1">
            <Label className="text-xs">비고</Label>
            <Input
              placeholder="한계기준 관련 메모"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>취소</Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중...</>
              ) : (
                <><Save className="mr-2 h-4 w-4" />{existingSpec ? "수정" : "저장"}</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProductCcpMapping({ embedded = false }: { embedded?: boolean } = {}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [selectedProductName, setSelectedProductName] = useState("");
  const [selectedCcpTypes, setSelectedCcpTypes] = useState<string[]>([]);
  const [specDialogOpen, setSpecDialogOpen] = useState(false);
  const [editingCcpType, setEditingCcpType] = useState("");
  const [editingSpec, setEditingSpec] = useState<any>(null);

  // 제품 목록 조회
  const { data: rawProductsData, isLoading, refetch: refetchProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (rawProductsData as any)?.items ?? (Array.isArray(rawProductsData) ? rawProductsData : []);

  // 제품-CCP 매핑 정보 조회 (process_flags + product_ccp_specs 기반)
  const { data: mappingData, refetch: refetchMappings } = trpc.ccpMonitoring.getProductCcpMappings.useQuery({
    productId: selectedProduct || undefined,
  });

  // 선택된 제품의 CCP 스펙 조회
  const { data: productSpecs, refetch: refetchSpecs } = trpc.ccpMonitoring.getProductCcpSpecs.useQuery(
    { productId: selectedProduct || undefined },
    { enabled: !!selectedProduct }
  );

  // CCP 매핑 저장 (기존 API 활용)
  const updateMappingMutation = trpc.product.updateCcpMapping.useMutation({
    onSuccess: () => {
      toast.success("CCP 매핑이 저장되었습니다");
      refetchProducts();
      refetchMappings();
    },
    onError: (error: any) => {
      toast.error(`저장 실패: ${error.message}`);
    },
  });

  // process_flags 업데이트
  const updateProcessFlagsMutation = trpc.ccpMonitoring.updateProductProcessFlags.useMutation({
    onSuccess: () => {
      refetchMappings();
    },
  });

  // CCP 스펙 삭제
  const deleteSpecMutation = trpc.ccpMonitoring.deleteProductCcpSpec.useMutation({
    onSuccess: () => {
      toast.success("한계기준이 삭제되었습니다.");
      refetchSpecs();
      refetchMappings();
    },
    onError: (err: any) => toast.error(`삭제 실패: ${err.message}`),
  });

  const handleProductSelect = (product: any) => {
    setSelectedProduct(product.id);
    setSelectedProductName(product.productName);
    // process_flags에서 CCP 타입 추출
    const flags = product.processFlags || product.process_flags || "";
    const ccpTypes: string[] = [];
    if (flags.includes("STEAMING")) ccpTypes.push("CCP-1B");
    if (flags.includes("MIXING") || flags.includes("STIRRING")) ccpTypes.push("CCP-2B");
    if (flags.includes("UV") || flags.includes("COOLING")) ccpTypes.push("CCP-3B");
    if (flags.includes("METAL_DETECTION")) ccpTypes.push("CCP-4P");
    setSelectedCcpTypes(ccpTypes);
  };

  const handleCcpTypeToggle = (ccpType: string) => {
    setSelectedCcpTypes((prev) =>
      prev.includes(ccpType)
        ? prev.filter((t) => t !== ccpType)
        : [...prev, ccpType]
    );
  };

  const handleSaveMapping = () => {
    if (!selectedProduct) {
      toast.error("제품을 선택해주세요");
      return;
    }

    // process_flags 업데이트
    const flagMap: Record<string, string> = {
      "CCP-1B": "STEAMING",
      "CCP-2B": "MIXING",
      "CCP-3B": "UV",
      "CCP-4P": "METAL_DETECTION",
    };
    const flags = selectedCcpTypes.map((t) => flagMap[t] || t).join(",");
    updateProcessFlagsMutation.mutate({
      productId: selectedProduct,
      processFlags: flags,
    });

    // 기존 매핑 API도 호출 (호환성)
    updateMappingMutation.mutate({
      productId: selectedProduct,
      ccpTypes: selectedCcpTypes,
    });
  };

  const handleEditSpec = (ccpType: string, spec: any | null) => {
    setEditingCcpType(ccpType);
    setEditingSpec(spec);
    setSpecDialogOpen(true);
  };

  const handleDeleteSpec = (specId: number) => {
    if (confirm("이 한계기준을 삭제하시겠습니까?")) {
      deleteSpecMutation.mutate({ id: specId });
    }
  };

  // 필터링된 제품 목록
  const filteredProducts = products.filter((p: any) =>
    !searchTerm ||
    p.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.productCode?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 선택된 제품의 CCP별 스펙 매핑
  const getSpecForCcpType = (ccpType: string) => {
    if (!productSpecs || !Array.isArray(productSpecs)) return null;
    return productSpecs.find((s: any) => (s.ccpType || s.ccp_type) === ccpType) || null;
  };

  // 매핑 데이터에서 제품별 CCP 정보 추출
  const getProductMappingInfo = (productId: number) => {
    if (!mappingData || !Array.isArray(mappingData)) return null;
    return (mappingData as any[]).find((m: any) => m.id === productId);
  };

  const content = (
    <div className={embedded ? "flex flex-col gap-6" : "flex flex-col gap-6 p-8"}>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">제품-CCP 매핑 관리</h1>
          <p className="text-muted-foreground mt-2">
            제품별 CCP 타입 매핑 및 한계기준 값을 설정합니다
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 왼쪽: 제품 목록 (2/5) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">제품 목록</CardTitle>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="제품명 또는 코드 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[600px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {searchTerm ? "검색 결과가 없습니다" : "등록된 제품이 없습니다"}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredProducts.map((product: any) => {
                  const mapping = getProductMappingInfo(product.id);
                  const mappedTypes = mapping?.mapped_ccp_types
                    ? String(mapping.mapped_ccp_types).split(",").filter(Boolean)
                    : [];
                  const flags = product.processFlags || product.process_flags || "";

                  return (
                    <button
                      key={product.id}
                      onClick={() => handleProductSelect(product)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        selectedProduct === product.id
                          ? "bg-primary/10 border-primary ring-1 ring-primary/20"
                          : "hover:bg-accent hover:border-accent-foreground/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{product.productName}</div>
                          <div className="text-xs text-muted-foreground">{product.productCode}</div>
                        </div>
                        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                          {flags && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {flags.split(",").length}개 공정
                            </Badge>
                          )}
                          {mappedTypes.length > 0 && (
                            <Badge className="bg-primary/20 text-primary text-[10px] px-1.5 py-0">
                              {mappedTypes.length} CCP
                            </Badge>
                          )}
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 오른쪽: CCP 매핑 설정 (3/5) */}
        <div className="lg:col-span-3 space-y-6">
          {!selectedProduct ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Settings className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">제품을 선택하세요</h3>
                <p className="text-sm text-muted-foreground/70 mt-2 text-center">
                  왼쪽 목록에서 제품을 선택하면<br />
                  CCP 타입 매핑 및 한계기준을 설정할 수 있습니다.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* CCP 타입 매핑 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    CCP 타입 매핑
                    <Badge variant="outline">{selectedProductName}</Badge>
                  </CardTitle>
                  <CardDescription>
                    이 제품에 적용할 CCP 타입을 선택하세요. 배치 생성 시 자동으로 해당 CCP가 생성됩니다.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CCP_TYPES.map((ccpType) => {
                      const isChecked = selectedCcpTypes.includes(ccpType.value);
                      const IconComp = ccpType.icon;
                      return (
                        <div
                          key={ccpType.value}
                          className={`flex items-center space-x-3 p-3 rounded-lg border transition-all cursor-pointer ${
                            isChecked ? "bg-primary/5 border-primary" : "hover:bg-accent/50"
                          }`}
                          onClick={() => handleCcpTypeToggle(ccpType.value)}
                        >
                          <Checkbox
                            id={ccpType.value}
                            checked={isChecked}
                            onCheckedChange={() => handleCcpTypeToggle(ccpType.value)}
                          />
                          <div className="flex-1">
                            <Label htmlFor={ccpType.value} className="font-medium cursor-pointer text-sm">
                              <Badge className={`${CCP_TYPE_COLORS[ccpType.value]} mr-2`}>{ccpType.label}</Badge>
                              {ccpType.description}
                            </Label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end mt-4">
                    <Button
                      onClick={handleSaveMapping}
                      disabled={updateMappingMutation.isPending || updateProcessFlagsMutation.isPending}
                      size="sm"
                    >
                      {(updateMappingMutation.isPending || updateProcessFlagsMutation.isPending) ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />저장 중...</>
                      ) : (
                        <><Save className="mr-2 h-4 w-4" />매핑 저장</>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* CCP별 한계기준 값 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    CCP별 한계기준 값
                    <Badge variant="outline">{selectedProductName}</Badge>
                  </CardTitle>
                  <CardDescription>
                    각 CCP 타입별 한계기준(온도, 시간, 압력, 감도 등)을 설정합니다.
                    한계기준이 설정되면 모니터링 시 자동 판정에 활용됩니다.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedCcpTypes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      위에서 CCP 타입을 먼저 선택해주세요.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">CCP 타입</TableHead>
                          <TableHead>온도 (°C)</TableHead>
                          <TableHead>시간 (분)</TableHead>
                          <TableHead>압력 (bar)</TableHead>
                          <TableHead>감도 (Fe/SUS)</TableHead>
                          <TableHead>비고</TableHead>
                          <TableHead className="w-[100px] text-right">관리</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedCcpTypes.map((ccpType) => {
                          const spec = getSpecForCcpType(ccpType);
                          const hasSpec = !!spec;
                          return (
                            <TableRow key={ccpType}>
                              <TableCell>
                                <Badge className={CCP_TYPE_COLORS[ccpType] || ""}>{ccpType}</Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {hasSpec && (spec.minTempC || spec.min_temp_c || spec.maxTempC || spec.max_temp_c)
                                  ? `${spec.minTempC || spec.min_temp_c || "-"} ~ ${spec.maxTempC || spec.max_temp_c || "-"}`
                                  : <span className="text-muted-foreground">미설정</span>
                                }
                              </TableCell>
                              <TableCell className="text-sm">
                                {hasSpec && (spec.minDurationMin || spec.min_duration_min || spec.maxDurationMin || spec.max_duration_min)
                                  ? `${spec.minDurationMin || spec.min_duration_min || "-"} ~ ${spec.maxDurationMin || spec.max_duration_min || "-"}`
                                  : <span className="text-muted-foreground">미설정</span>
                                }
                              </TableCell>
                              <TableCell className="text-sm">
                                {hasSpec && (spec.minPressureBar || spec.min_pressure_bar || spec.maxPressureBar || spec.max_pressure_bar)
                                  ? `${spec.minPressureBar || spec.min_pressure_bar || "-"} ~ ${spec.maxPressureBar || spec.max_pressure_bar || "-"}`
                                  : <span className="text-muted-foreground">미설정</span>
                                }
                              </TableCell>
                              <TableCell className="text-sm">
                                {hasSpec && (spec.feSensitivity || spec.fe_sensitivity || spec.susSensitivity || spec.sus_sensitivity)
                                  ? `Fe:${spec.feSensitivity || spec.fe_sensitivity || "-"} / SUS:${spec.susSensitivity || spec.sus_sensitivity || "-"}`
                                  : <span className="text-muted-foreground">미설정</span>
                                }
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                                {spec?.description || "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEditSpec(ccpType, spec)}
                                    className="h-7 w-7 p-0"
                                  >
                                    {hasSpec ? <Edit className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                                  </Button>
                                  {hasSpec && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteSpec(spec.id)}
                                      className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* 안내 */}
              <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-900 dark:text-blue-100">
                  <strong>안내:</strong> CCP 매핑을 설정하면 배치 생성 시 자동으로 해당 CCP 인스턴스가 생성됩니다.
                  한계기준 값을 설정하면 모니터링 기록 시 자동 판정(적합/부적합)에 활용됩니다.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 한계기준 편집 다이얼로그 */}
      {selectedProduct && (
        <SpecEditDialog
          open={specDialogOpen}
          onClose={() => setSpecDialogOpen(false)}
          productId={selectedProduct}
          productName={selectedProductName}
          ccpType={editingCcpType}
          existingSpec={editingSpec}
          onSaved={() => {
            refetchSpecs();
            refetchMappings();
          }}
        />
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <DashboardLayout>
      {content}
    </DashboardLayout>
  );
}
