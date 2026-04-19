/**
 * CCPLimitsManagement 분해 — 3개 다이얼로그.
 *  - ProcessGroupFormDialog      공정 그룹 + 제품 매핑
 *  - TimeProfileDialog           시간 프로파일 (공정별 시간)
 *  - ProductTimeProfileMapDialog 제품별 시간 현황
 */
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Plus, Edit, Trash2, Layers, Settings2, GripVertical, AlertTriangle, Clock, Package, Link2, Loader2, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  type ProductRow,
  type ProcessGroup,
  type ProcessGroupProduct,
  type EquipmentRow,
  type CcpLimitEquipment,
  type CcpLimitInitialData,
  ccpTypes,
  processTypes,
  getCcpColor,
} from "./constants";

// ========== 공정 그룹 폼 다이얼로그 (기존 + 제품 매핑 탭 추가) ==========
export function ProcessGroupFormDialog({
  open,
  onOpenChange,
  initialData,
  equipmentList,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: CcpLimitInitialData;
  equipmentList: EquipmentRow[];
  onSubmit: (data: Record<string, unknown>) => void;
}) {
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState(() => ({
    name: initialData?.name || "",
    ccpType: initialData?.ccp_type || initialData?.ccpType || "CCP-1B",
    description: initialData?.description || "",
    temperatureMin: initialData?.temperature_min || initialData?.temperatureMin || "",
    temperatureMax: initialData?.temperature_max || initialData?.temperatureMax || "",
    timeMin: initialData?.time_min || initialData?.timeMin || "",
    timeMax: initialData?.time_max || initialData?.timeMax || "",
    pressureMin: initialData?.pressure_min || initialData?.pressureMin || "",
    pressureMax: initialData?.pressure_max || initialData?.pressureMax || "",
    phMin: initialData?.ph_min || initialData?.phMin || "",
    phMax: initialData?.ph_max || initialData?.phMax || "",
    monitoringMethod: initialData?.monitoring_method || initialData?.monitoringMethod || "",
    correctiveAction: initialData?.corrective_action || initialData?.correctiveAction || "",
    selectedEquipmentIds: (initialData?.equipments || []).map((e: CcpLimitEquipment) => e.equipmentId || e.equipment_id) as number[],
    // 배치 운영 설정
    equipGroupMode: (initialData?.equip_group_mode || initialData?.equipGroupMode || "sequential") as "sequential" | "concurrent" | "grouped",
    equipIntervalMin: initialData?.equip_interval_min ?? initialData?.equipIntervalMin ?? 10,
    equipBatchSize: initialData?.equip_batch_size ?? initialData?.equipBatchSize ?? 1,
  }));

  // ★ 제품 매핑 상태 (수정 모드에서만)
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [productSearchTerm, setProductSearchTerm] = useState("");

  // 제품 목록 조회
  const { data: productData } = trpc.product.list.useQuery({ limit: 500 });
  const allProducts: ProductRow[] = (productData as { items?: ProductRow[] } | undefined)?.items ?? [];

  // 기존 매핑된 제품 조회 (수정 모드)
  const { data: mappedProducts } = trpc.ccpMonitoring.getProcessGroupProducts.useQuery(
    { processGroupId: initialData?.id },
    { enabled: !!initialData?.id }
  );

  // 매핑 데이터 초기화
  useEffect(() => {
    if (mappedProducts && Array.isArray(mappedProducts)) {
      setSelectedProductIds(mappedProducts.map((p: ProcessGroupProduct) => p.product_id));
    }
  }, [mappedProducts]);

  const queryClient = useQueryClient();

  // 매핑 저장 뮤테이션
  const updateProductsMutation = trpc.ccpMonitoring.updateProcessGroupProducts.useMutation({
    onSuccess: () => {
      toast.success("제품 매핑이 저장되었습니다");
      queryClient.invalidateQueries({ queryKey: [['ccpMonitoring', 'getProcessGroupProducts']] });
      queryClient.invalidateQueries({ queryKey: [['ccpMonitoring', 'getProcessGroups']] });
    },
    onError: (err: { message: string }) => toast.error("제품 매핑 실패: " + err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("공정 그룹명을 입력하세요");
      return;
    }
    onSubmit({
      name: form.name,
      ccpType: form.ccpType,
      description: form.description || undefined,
      temperatureMin: form.temperatureMin ? Number(form.temperatureMin) : undefined,
      temperatureMax: form.temperatureMax ? Number(form.temperatureMax) : undefined,
      timeMin: form.timeMin ? Number(form.timeMin) : undefined,
      timeMax: form.timeMax ? Number(form.timeMax) : undefined,
      pressureMin: form.pressureMin ? Number(form.pressureMin) : undefined,
      pressureMax: form.pressureMax ? Number(form.pressureMax) : undefined,
      phMin: form.phMin ? Number(form.phMin) : undefined,
      phMax: form.phMax ? Number(form.phMax) : undefined,
      monitoringMethod: form.monitoringMethod || undefined,
      correctiveAction: form.correctiveAction || undefined,
      equipmentIds: form.selectedEquipmentIds,
      // 배치 운영 설정
      equipGroupMode: form.equipGroupMode,
      equipIntervalMin: Number(form.equipIntervalMin) || 10,
      equipBatchSize: Number(form.equipBatchSize) || 1,
    });
  };

  const handleSaveProducts = () => {
    if (!initialData?.id) return;
    updateProductsMutation.mutate({
      processGroupId: initialData.id,
      productIds: selectedProductIds,
    });
  };

  // 해당 CCP 유형의 설비만 필터링
  const filteredEquipments = equipmentList.filter(
    (eq: EquipmentRow) => eq.ccpType === form.ccpType
  );

  const toggleEquipment = (eqId: number) => {
    setForm(prev => ({
      ...prev,
      selectedEquipmentIds: prev.selectedEquipmentIds.includes(eqId)
        ? prev.selectedEquipmentIds.filter((id: number) => id !== eqId)
        : [...prev.selectedEquipmentIds, eqId],
    }));
  };

  const toggleProduct = (productId: number) => {
    setSelectedProductIds(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  // 제품 검색 필터
  const filteredProducts = allProducts.filter((p: ProductRow) => {
    if (!productSearchTerm) return true;
    const term = productSearchTerm.toLowerCase();
    return (p.productName || "").toLowerCase().includes(term) ||
           (p.productCode || "").toLowerCase().includes(term);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            {initialData ? "공정 그룹 수정" : "새 공정 그룹 생성"}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="basic" className="text-xs">기본 정보 / CL</TabsTrigger>
            <TabsTrigger value="equipment" className="text-xs">설비 배정</TabsTrigger>
            <TabsTrigger value="products" className="text-xs" disabled={!initialData}>
              <Package className="h-3 w-3 mr-1" />
              제품 매핑 {initialData ? "" : "(저장 후)"}
            </TabsTrigger>
          </TabsList>

          {/* 탭 1: 기본 정보 + CL */}
          <TabsContent value="basic">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">공정 그룹명 *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="예: 가열공정"
                    className="h-9"
                    required
                  />
                </div>
                <div>
                  <Label className="text-xs">CCP 유형 *</Label>
                  <Select value={form.ccpType} onValueChange={(v) => setForm({ ...form, ccpType: v, selectedEquipmentIds: [] })}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ccpTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">설명</Label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="공정 그룹에 대한 설명"
                  className="h-9"
                />
              </div>

              {/* 법적 한계치 */}
              <div className="border rounded-lg p-3 bg-red-50/50">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <span className="font-semibold text-sm text-red-700">법적 한계기준 (CL)</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <Label className="text-xs text-gray-500">최소 온도 (°C)</Label>
                    <Input type="number" step="0.1" value={form.temperatureMin} onChange={(e) => setForm({ ...form, temperatureMin: e.target.value })} className="h-8 text-sm" placeholder="-" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">최대 온도 (°C)</Label>
                    <Input type="number" step="0.1" value={form.temperatureMax} onChange={(e) => setForm({ ...form, temperatureMax: e.target.value })} className="h-8 text-sm" placeholder="-" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">최소 시간 (분)</Label>
                    <Input type="number" value={form.timeMin} onChange={(e) => setForm({ ...form, timeMin: e.target.value })} className="h-8 text-sm" placeholder="-" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">최대 시간 (분)</Label>
                    <Input type="number" value={form.timeMax} onChange={(e) => setForm({ ...form, timeMax: e.target.value })} className="h-8 text-sm" placeholder="-" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">최소 압력 (MPa)</Label>
                    <Input type="number" step="0.01" value={form.pressureMin} onChange={(e) => setForm({ ...form, pressureMin: e.target.value })} className="h-8 text-sm" placeholder="-" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">최대 압력 (MPa)</Label>
                    <Input type="number" step="0.01" value={form.pressureMax} onChange={(e) => setForm({ ...form, pressureMax: e.target.value })} className="h-8 text-sm" placeholder="-" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">최소 pH</Label>
                    <Input type="number" step="0.1" value={form.phMin} onChange={(e) => setForm({ ...form, phMin: e.target.value })} className="h-8 text-sm" placeholder="-" />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">최대 pH</Label>
                    <Input type="number" step="0.1" value={form.phMax} onChange={(e) => setForm({ ...form, phMax: e.target.value })} className="h-8 text-sm" placeholder="-" />
                  </div>
                </div>
              </div>

              {/* 모니터링 방법 & 시정 조치 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">모니터링 방법</Label>
                  <Textarea
                    value={form.monitoringMethod}
                    onChange={(e) => setForm({ ...form, monitoringMethod: e.target.value })}
                    rows={2}
                    className="text-sm"
                    placeholder="온도계 확인, 센서 모니터링 등"
                  />
                </div>
                <div>
                  <Label className="text-xs">시정 조치</Label>
                  <Textarea
                    value={form.correctiveAction}
                    onChange={(e) => setForm({ ...form, correctiveAction: e.target.value })}
                    rows={2}
                    className="text-sm"
                    placeholder="한계 이탈 시 조치 사항"
                  />
                </div>

                {/* 배치 운영 설정 (공정그룹에서 기본값 관리) */}
                <div className="border rounded-lg p-4 bg-amber-50/60">
                  {/* 헤더 */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-bold text-amber-800">⚙ 설비 배치 운영 설정</span>
                    <span className="text-xs text-gray-500">(CCP 기록지 기본값으로 적용)</span>
                  </div>

                  {/* 운영 방식 - 전체 너비 */}
                  <div className="mb-3">
                    <Label className="text-xs font-medium text-gray-700 mb-1 block">운영 방식</Label>
                    <Select
                      value={form.equipGroupMode}
                      onValueChange={(v) => setForm({ ...form, equipGroupMode: v as typeof form.equipGroupMode })}
                    >
                      <SelectTrigger className="h-9 text-sm w-full">
                        <SelectValue placeholder="운영 방식 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sequential">
                          <div className="flex flex-col">
                            <span className="font-medium">순차</span>
                            <span className="text-xs text-gray-500">설비별 순서대로 1대씩</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="concurrent">
                          <div className="flex flex-col">
                            <span className="font-medium">동시</span>
                            <span className="text-xs text-gray-500">모든 설비에 동시 투입</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="grouped">
                          <div className="flex flex-col">
                            <span className="font-medium">묶음 순차</span>
                            <span className="text-xs text-gray-500">N대씩 그룹으로 순차 운영</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* 배치 간격 + 묶음 크기 - 2컬럼 */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <Label className="text-xs font-medium text-gray-700 mb-1 block">
                        배치 간격
                        <span className="text-gray-400 font-normal ml-1">(분)</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.equipIntervalMin}
                        onChange={(e) => setForm({ ...form, equipIntervalMin: Number(e.target.value) })}
                        className="h-9 text-sm"
                        placeholder="예: 10"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-gray-700 mb-1 block">
                        묶음 크기
                        <span className="text-gray-400 font-normal ml-1">(대)</span>
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={form.equipBatchSize}
                        onChange={(e) => setForm({ ...form, equipBatchSize: Number(e.target.value) })}
                        className={`h-9 text-sm ${form.equipGroupMode !== "grouped" ? "opacity-40 cursor-not-allowed" : ""}`}
                        placeholder="묶음 모드만 적용"
                        disabled={form.equipGroupMode !== "grouped"}
                      />
                    </div>
                  </div>

                  {/* 설명 텍스트 */}
                  <div className="rounded bg-amber-100/80 px-3 py-2">
                    <p className="text-xs text-amber-800 leading-relaxed">
                      {form.equipGroupMode === "sequential" && (
                        <>교반기1호→배치1, 교반기2호→배치2 순으로 설비를 1대씩 순서대로 배치에 할당합니다.</>
                      )}
                      {form.equipGroupMode === "concurrent" && (
                        <>모든 설비에 동시 투입합니다. (예: 금속검출기 — 모든 배치 동일 시간대 처리)</>
                      )}
                      {form.equipGroupMode === "grouped" && (
                        <>증숙기 1-2-3호 → <strong>{form.equipIntervalMin}분</strong> 후 → 증숙기 4-5-6호 순으로 {form.equipBatchSize}대씩 묶어 운영합니다.</>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>취소</Button>
                <Button type="submit" size="sm">{initialData ? "수정" : "생성"}</Button>
              </div>
            </form>
          </TabsContent>

          {/* 탭 2: 설비 배정 */}
          <TabsContent value="equipment">
            <div className="border rounded-lg p-3 bg-blue-50/50">
              <div className="flex items-center gap-2 mb-3">
                <Settings2 className="h-4 w-4 text-blue-600" />
                <span className="font-semibold text-sm text-blue-700">설비 병렬 그룹</span>
                <span className="text-xs text-gray-500">(이 공정에 속한 설비를 선택하세요)</span>
              </div>
              {filteredEquipments.length === 0 ? (
                <p className="text-sm text-gray-500 py-2">
                  {form.ccpType} 유형의 등록된 설비가 없습니다. 설비기준 탭에서 먼저 설비를 등록하세요.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                  {filteredEquipments.map((eq: EquipmentRow) => (
                    <label
                      key={eq.id}
                      className={`flex items-center gap-3 p-2 rounded-md border cursor-pointer transition-colors ${
                        form.selectedEquipmentIds.includes(eq.id) ? "bg-blue-100 border-blue-300" : "bg-white border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      <Checkbox
                        checked={form.selectedEquipmentIds.includes(eq.id)}
                        onCheckedChange={() => toggleEquipment(eq.id)}
                      />
                      <GripVertical className="h-4 w-4 text-gray-300" />
                      <div className="flex-1">
                        <span className="font-medium text-sm">{eq.name}</span>
                        <span className="text-xs text-gray-500 ml-2">{eq.code || ""}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{eq.type}</Badge>
                      {form.selectedEquipmentIds.includes(eq.id) && (
                        <Badge className="bg-blue-600 text-xs">
                          #{form.selectedEquipmentIds.indexOf(eq.id) + 1}
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
              )}
              {form.selectedEquipmentIds.length > 0 && (
                <p className="text-xs text-blue-600 mt-2">
                  선택된 {form.selectedEquipmentIds.length}개 설비가 병렬로 운영됩니다.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>취소</Button>
              <Button type="button" size="sm" onClick={handleSubmit}>{initialData ? "수정" : "생성"}</Button>
            </div>
          </TabsContent>

          {/* 탭 3: 제품 매핑 */}
          <TabsContent value="products">
            {initialData ? (
              <div className="space-y-3">
                {/* CCP-4P(금속검출): 수동 매핑 (SKU 단위) */}
                {form.ccpType === 'CCP-4P' ? (
                  <>
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Package className="h-4 w-4 text-green-600" />
                        <span className="font-semibold text-sm text-green-700 dark:text-green-300">금속검출 제품 매핑 (SKU 단위)</span>
                      </div>
                      <p className="text-[11px] text-green-600/80 dark:text-green-400/80">
                        최종 생산품(SKU) 단위로 금속탐지기를 통과해야 하는 제품을 선택하세요.
                      </p>
                    </div>

                    {/* 검색 */}
                    <Input
                      placeholder="제품명 또는 코드로 검색..."
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      className="h-8 text-sm"
                    />

                    {/* 선택된 제품 수 */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {selectedProductIds.length}개 제품 선택됨
                      </span>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setSelectedProductIds(allProducts.map((p: ProductRow) => p.id))}
                        >
                          전체 선택
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => setSelectedProductIds([])}
                        >
                          전체 해제
                        </Button>
                      </div>
                    </div>

                    {/* 제품 목록 (체크박스 수동 매핑) */}
                    <div className="max-h-[350px] overflow-y-auto border rounded-md">
                      {filteredProducts.length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                          등록된 제품이 없습니다.
                        </div>
                      ) : (
                        <div className="divide-y">
                          {filteredProducts.map((product: ProductRow) => (
                            <label
                              key={product.id}
                              className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                                selectedProductIds.includes(product.id)
                                  ? "bg-green-50 dark:bg-green-950/20"
                                  : "hover:bg-gray-50 dark:hover:bg-gray-900"
                              }`}
                            >
                              <Checkbox
                                checked={selectedProductIds.includes(product.id)}
                                onCheckedChange={() => toggleProduct(product.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{product.productName}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {product.productCode || "코드 없음"}
                                </div>
                              </div>
                              {selectedProductIds.includes(product.id) && (
                                <Badge className="bg-green-600 text-[10px] px-1.5 py-0">매핑됨</Badge>
                              )}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>닫기</Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveProducts}
                        disabled={updateProductsMutation.isPending}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {updateProductsMutation.isPending ? (
                          <><Loader2 className="h-3 w-3 mr-1 animate-spin" />저장 중...</>
                        ) : (
                          <><Save className="h-3 w-3 mr-1" />제품 매핑 저장</>
                        )}
                      </Button>
                    </div>
                  </>
                ) : (
                  /* CCP-1B/2B: BOM 원재료 기반 자동 매핑 (읽기 전용) */
                  <>
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-1">
                        <Link2 className="h-4 w-4 text-blue-600" />
                        <span className="font-semibold text-sm text-blue-700 dark:text-blue-300">BOM 원재료 기반 자동 매핑</span>
                      </div>
                      <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80">
                        품목제조보고서(BOM)에서 원재료에 "{initialData?.name || ''}" 공정이 태깅된 제품이 자동으로 표시됩니다.
                        매핑을 변경하려면 품목제조보고서에서 원재료의 CCP 공정그룹을 수정하세요.
                      </p>
                    </div>

                    {/* BOM 자동 매핑된 제품 목록 (읽기 전용) */}
                    <div className="max-h-[400px] overflow-y-auto border rounded-md">
                      {!mappedProducts || (mappedProducts as ProcessGroupProduct[]).length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                          <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          <p>BOM에서 이 공정으로 태깅된 원재료가 있는 제품이 없습니다.</p>
                          <p className="text-[10px] mt-1">품목제조보고서 → 원재료 → CCP 공정그룹 열에서 매핑하세요.</p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {(mappedProducts as ProcessGroupProduct[]).map((product: ProcessGroupProduct, idx: number) => (
                            <div
                              key={product.product_id}
                              className="flex items-center gap-3 px-3 py-2 bg-blue-50/30 dark:bg-blue-950/10"
                            >
                              <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-[10px] font-bold text-blue-600">
                                {idx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{product.product_name}</div>
                              </div>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-300 text-blue-600">
                                {product.mapping_source === 'BOM' ? 'BOM 자동' : product.mapping_source === 'MANUAL' ? '수동' : product.mapping_source}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-muted-foreground">
                        총 {(mappedProducts as ProcessGroupProduct[])?.length || 0}개 제품 자동 매핑됨
                      </span>
                      <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>닫기</Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                공정 그룹을 먼저 생성한 후 제품을 매핑할 수 있습니다.
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}


// ========== 시간 프로파일 관리 다이얼로그 ==========
// ccp_process_groups 기반으로 공정그룹의 time_min을 직접 편집
export function TimeProfileDialog({
  open,
  onOpenChange,
  onGroupUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupUpdated?: () => void;
}) {
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ timeMin: string; timeMax: string; description: string }>({
    timeMin: "",
    timeMax: "",
    description: "",
  });

  // 시간 설정 모달은 항상 전체 공정그룹을 독립적으로 조회
  const { data: allGroupData, refetch: refetchGroups } = trpc.ccpMonitoring.getProcessGroups.useQuery(undefined);

  const updateGroupMutation = trpc.ccpMonitoring.updateProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("공정그룹 시간 설정이 저장되었습니다");
      setEditingGroupId(null);
      refetchGroups();
      onGroupUpdated?.();
    },
    onError: (err: { message: string }) => toast.error("저장 실패: " + err.message),
  });

  const startEdit = (group: ProcessGroup) => {
    setEditingGroupId(group.id);
    setEditForm({
      timeMin: (group.time_min ?? "").toString(),
      timeMax: (group.time_max ?? "").toString(),
      description: group.description || "",
    });
  };

  const handleSave = (group: ProcessGroup) => {
    updateGroupMutation.mutate({
      id: group.id,
      // name, ccpType은 변경하지 않지만 현재 값을 유지
      name: group.name,
      ccpType: group.ccp_type,
      timeMin: editForm.timeMin !== "" ? Number(editForm.timeMin) : null,
      timeMax: editForm.timeMax !== "" ? Number(editForm.timeMax) : null,
      description: editForm.description || undefined,
      // 온도/압력은 기존 값 그대로 유지
      temperatureMin: group.temperature_min ?? null,
      temperatureMax: group.temperature_max ?? null,
      pressureMin: group.pressure_min ?? null,
      pressureMax: group.pressure_max ?? null,
    });
  };

  // CCP-4P 제외한 시간 관련 공정그룹만 표시
  const allGroups = Array.isArray(allGroupData) ? allGroupData : [];
  const timeGroups = allGroups.filter((g: ProcessGroup) => g.ccp_type !== "CCP-4P");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            공정별 시간 설정 관리
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 안내 */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              각 공정그룹의 기본 운영시간(time_min)을 직접 설정합니다.
              BOM에서 해당 공정그룹으로 매핑된 모든 제품에 이 시간이 적용됩니다.
              <br />
              <span className="font-semibold">배치 총소요시간 = 설비 사이클시간 + (공정 가열시간 - 설비 기본 가열시간)</span>
            </p>
          </div>

          {/* 공정그룹 시간 설정 테이블 */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableHead className="text-xs">공정그룹명</TableHead>
                  <TableHead className="text-xs w-[90px]">CCP 유형</TableHead>
                  <TableHead className="text-xs w-[110px] text-center">최소시간(분)</TableHead>
                  <TableHead className="text-xs w-[110px] text-center">최대시간(분)</TableHead>
                  <TableHead className="text-xs">설명</TableHead>
                  <TableHead className="text-xs w-[80px] text-center">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timeGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                      등록된 공정그룹이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  timeGroups.map((group: ProcessGroup) => (
                    <TableRow key={group.id}>
                      {editingGroupId === group.id ? (
                        <>
                          <TableCell className="font-medium text-sm">
                            {group.name}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${getCcpColor(group.ccp_type)}`}>
                              {group.ccp_type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editForm.timeMin}
                              onChange={(e) => setEditForm({ ...editForm, timeMin: e.target.value })}
                              className="h-7 text-xs text-center"
                              placeholder="분"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editForm.timeMax}
                              onChange={(e) => setEditForm({ ...editForm, timeMax: e.target.value })}
                              className="h-7 text-xs text-center"
                              placeholder="분 (선택)"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              className="h-7 text-xs"
                              placeholder="설명"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => handleSave(group)}
                                disabled={updateGroupMutation.isPending}
                              >
                                {updateGroupMutation.isPending ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Save className="h-3 w-3 text-green-600" />
                                )}
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingGroupId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-medium text-sm">{group.name}</TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] ${getCcpColor(group.ccp_type)}`}>
                              {group.ccp_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {group.time_min != null ? (
                              <span className="font-semibold text-blue-600">{group.time_min}분</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {group.time_max != null ? (
                              <span className="text-sm text-gray-500">{group.time_max}분</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {group.description || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-center">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(group)}>
                                <Edit className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <p className="text-[11px] text-muted-foreground text-right">
            * 금속검출(CCP-4P) 공정은 시간 설정이 적용되지 않습니다
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== 제품별 시간 현황 다이얼로그 ==========
// BOM 기반 매핑 결과를 공정그룹별로 그룹화하여 표시 (읽기 전용)
export function ProductTimeProfileMapDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [filterCcpType, setFilterCcpType] = useState<string>("all");

  // BOM 기반 제품-공정그룹 전체 매핑 조회 (getProcessGroupProducts 재활용)
  const { data: allMappings, isLoading } = trpc.ccpMonitoring.getProcessGroupProducts.useQuery(
    filterCcpType !== "all" ? { ccpType: filterCcpType } : {}
  );

  // 공정그룹 목록 (time_min 포함)
  const { data: processGroupData } = trpc.ccpMonitoring.getProcessGroups.useQuery(undefined);
  const processGroups = Array.isArray(processGroupData) ? processGroupData : [];

  const mappings = Array.isArray(allMappings) ? allMappings : [];

  // 공정그룹별로 그룹화
  type GroupedMapping = {
    processGroupId: number;
    groupName: string;
    ccpType: string;
    timeMin?: number | string | null;
    timeMax?: number | string | null;
    mappingSource?: string | null;
    products: Array<{ productId: number; productName: string }>;
  };
  const groupedByProcessGroup = mappings.reduce((acc: Record<string, GroupedMapping>, m: ProcessGroupProduct) => {
    const key = m.process_group_id?.toString() || "unknown";
    if (!acc[key]) {
      const group = processGroups.find((g: ProcessGroup) => g.id === m.process_group_id);
      acc[key] = {
        processGroupId: m.process_group_id,
        groupName: m.group_name || group?.name || "알 수 없음",
        ccpType: m.ccp_type || group?.ccp_type || "",
        timeMin: group?.time_min,
        timeMax: group?.time_max,
        mappingSource: m.mapping_source,
        products: [],
      };
    }
    acc[key].products.push({
      productId: m.product_id,
      productName: m.product_name,
    });
    return acc;
  }, {} as Record<string, GroupedMapping>);

  const groupedList = Object.values(groupedByProcessGroup);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            제품별 공정시간 현황
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* 안내 */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-700 dark:text-green-300">
              BOM 데이터에서 자동으로 연결된 제품-공정그룹 매핑 결과입니다.
              공정그룹별로 묶어서 어떤 제품이 해당 공정을 거치는지, 그리고 적용되는 시간을 확인할 수 있습니다.
              <br />
              시간 수정은 <span className="font-semibold">시간 설정 관리</span> 버튼에서 하세요.
            </p>
          </div>

          {/* CCP 유형 필터 */}
          <div className="flex items-center gap-2">
            <Select value={filterCcpType} onValueChange={setFilterCcpType}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="CCP 유형 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                {ccpTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">
              {groupedList.length}개 공정그룹 / {mappings.length}개 제품 매핑
            </span>
          </div>

          {/* 공정그룹별 제품 현황 */}
          {groupedList.length === 0 ? (
            <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
              {isLoading ? "데이터를 불러오는 중..." : "BOM 기반 매핑 데이터가 없습니다"}
            </div>
          ) : (
            <div className="space-y-3">
              {groupedList.map((group) => (
                <div key={group.processGroupId} className="border rounded-lg overflow-hidden">
                  {/* 공정그룹 헤더 */}
                  <div className="bg-gray-50 dark:bg-gray-900 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${getCcpColor(group.ccpType)}`}>
                        {group.ccpType}
                      </Badge>
                      <span className="font-semibold text-sm">{group.groupName}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {group.mappingSource === "BOM" ? "BOM 자동" : "수동 매핑"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {group.timeMin != null ? (
                        <span className="font-semibold text-blue-600 flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          최소 {group.timeMin}분
                          {group.timeMax ? ` ~ 최대 ${group.timeMax}분` : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">시간 미설정</span>
                      )}
                      <span className="text-muted-foreground">제품 {group.products.length}개</span>
                    </div>
                  </div>
                  {/* 제품 목록 */}
                  <div className="px-4 py-2 flex flex-wrap gap-1.5">
                    {group.products.map((p) => (
                      <Badge
                        key={p.productId}
                        variant="secondary"
                        className="text-[11px] font-normal"
                      >
                        {p.productName}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

