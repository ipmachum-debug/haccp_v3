import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Edit, Trash2, Layers, Settings2, GripVertical, AlertTriangle, Clock, Package, Link2, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

const ccpTypes = [
  { value: "CCP-1B", label: "CCP-1B (가열/증숙)", color: "bg-red-100 text-red-700" },
  { value: "CCP-2B", label: "CCP-2B (가열 굽기)", color: "bg-blue-100 text-blue-700" },
  { value: "CCP-3B", label: "CCP-3B (가열/볶음)", color: "bg-yellow-100 text-yellow-700" },
  { value: "CCP-4P", label: "CCP-4P (금속검출)", color: "bg-green-100 text-green-700" },
];

const processTypes = [
  { value: "MIX", label: "교반(MIX)" },
  { value: "STEAM", label: "증숙(STEAM)" },
  { value: "OVEN", label: "오븐(OVEN)" },
  { value: "COOL", label: "냉각(COOL)" },
  { value: "METAL", label: "금속검출(METAL)" },
];

function getCcpColor(type: string) {
  return ccpTypes.find(t => t.value === type)?.color || "bg-gray-100 text-gray-700";
}

// ========== 공정 그룹 폼 다이얼로그 (기존 + 제품 매핑 탭 추가) ==========
function ProcessGroupFormDialog({
  open,
  onOpenChange,
  initialData,
  equipmentList,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: any;
  equipmentList: any[];
  onSubmit: (data: any) => void;
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
    selectedEquipmentIds: (initialData?.equipments || []).map((e: any) => e.equipmentId || e.equipment_id) as number[],
  }));

  // ★ 제품 매핑 상태 (수정 모드에서만)
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([]);
  const [productSearchTerm, setProductSearchTerm] = useState("");

  // 제품 목록 조회
  const { data: productData } = trpc.product.list.useQuery({ limit: 500 });
  const allProducts = (productData as any)?.items ?? [];

  // 기존 매핑된 제품 조회 (수정 모드)
  const { data: mappedProducts } = trpc.ccpMonitoring.getProcessGroupProducts.useQuery(
    { processGroupId: initialData?.id },
    { enabled: !!initialData?.id }
  );

  // 매핑 데이터 초기화
  useEffect(() => {
    if (mappedProducts && Array.isArray(mappedProducts)) {
      setSelectedProductIds(mappedProducts.map((p: any) => p.product_id));
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
    onError: (err) => toast.error("제품 매핑 실패: " + err.message),
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
    (eq: any) => eq.ccpType === form.ccpType
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
  const filteredProducts = allProducts.filter((p: any) => {
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
                  {filteredEquipments.map((eq: any) => (
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
                          onClick={() => setSelectedProductIds(allProducts.map((p: any) => p.id))}
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
                          {filteredProducts.map((product: any) => (
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
                      {!mappedProducts || (mappedProducts as any[]).length === 0 ? (
                        <div className="text-center py-8 text-sm text-muted-foreground">
                          <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                          <p>BOM에서 이 공정으로 태깅된 원재료가 있는 제품이 없습니다.</p>
                          <p className="text-[10px] mt-1">품목제조보고서 → 원재료 → CCP 공정그룹 열에서 매핑하세요.</p>
                        </div>
                      ) : (
                        <div className="divide-y">
                          {(mappedProducts as any[]).map((product: any, idx: number) => (
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
                        총 {(mappedProducts as any[])?.length || 0}개 제품 자동 매핑됨
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
function TimeProfileDialog({
  open,
  onOpenChange,
  processGroups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  processGroups: any[];
}) {
  const [newProfile, setNewProfile] = useState({
    processType: "STEAM",
    profileName: "",
    timeMinutes: "",
    ccpProcessGroupId: "" as string,
    description: "",
  });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  // 시간 프로파일 목록 조회
  const { data: timeProfiles, refetch } = trpc.ccpMonitoring.getTimeProfiles.useQuery(undefined);
  const profiles = Array.isArray(timeProfiles) ? timeProfiles : [];

  const createMutation = trpc.ccpMonitoring.createTimeProfile.useMutation({
    onSuccess: () => {
      toast.success("시간 프로파일이 생성되었습니다");
      refetch();
      setNewProfile({ processType: "STEAM", profileName: "", timeMinutes: "", ccpProcessGroupId: "", description: "" });
    },
    onError: (err) => toast.error("생성 실패: " + err.message),
  });

  const updateMutation = trpc.ccpMonitoring.updateTimeProfile.useMutation({
    onSuccess: () => {
      toast.success("시간 프로파일이 수정되었습니다");
      refetch();
      setEditingId(null);
    },
    onError: (err) => toast.error("수정 실패: " + err.message),
  });

  const deleteMutation = trpc.ccpMonitoring.deleteTimeProfile.useMutation({
    onSuccess: () => {
      toast.success("시간 프로파일이 삭제되었습니다");
      refetch();
    },
    onError: (err) => toast.error("삭제 실패: " + err.message),
  });

  const handleCreate = () => {
    if (!newProfile.profileName.trim() || !newProfile.timeMinutes) {
      toast.error("프로파일명과 시간을 입력하세요");
      return;
    }
    createMutation.mutate({
      processType: newProfile.processType,
      profileName: newProfile.profileName,
      timeMinutes: Number(newProfile.timeMinutes),
      ccpProcessGroupId: newProfile.ccpProcessGroupId && newProfile.ccpProcessGroupId !== "none" ? Number(newProfile.ccpProcessGroupId) : undefined,
      description: newProfile.description || undefined,
    });
  };

  const handleUpdate = () => {
    if (!editingId) return;
    updateMutation.mutate({
      id: editingId,
      profileName: editForm.profileName,
      timeMinutes: editForm.timeMinutes ? Number(editForm.timeMinutes) : undefined,
      ccpProcessGroupId: editForm.ccpProcessGroupId && editForm.ccpProcessGroupId !== "none" ? Number(editForm.ccpProcessGroupId) : null,
      description: editForm.description,
    });
  };

  const startEdit = (profile: any) => {
    setEditingId(profile.id);
    setEditForm({
      profileName: profile.profile_name || profile.profileName,
      timeMinutes: (profile.time_minutes || profile.timeMinutes)?.toString() || "",
      ccpProcessGroupId: (profile.ccp_process_group_id || profile.ccpProcessGroupId)?.toString() || "",
      description: profile.description || "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            시간 프로파일 관리
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 안내 */}
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              시간 프로파일은 공정별 운영시간을 정의합니다. 예를 들어 "증숙 10분", "증숙 15분" 등 다양한 시간 설정을 만들고, 제품별로 적용할 수 있습니다.
              CL(한계기준) 범위를 벗어나는 시간은 생성 시 자동으로 차단됩니다.
            </p>
          </div>

          {/* 새 프로파일 생성 폼 */}
          <div className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900">
            <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              새 시간 프로파일 추가
            </h4>
            <div className="grid grid-cols-5 gap-2">
              <div>
                <Label className="text-[10px]">공정 유형</Label>
                <Select value={newProfile.processType} onValueChange={(v) => setNewProfile({ ...newProfile, processType: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {processTypes.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px]">프로파일명 *</Label>
                <Input
                  value={newProfile.profileName}
                  onChange={(e) => setNewProfile({ ...newProfile, profileName: e.target.value })}
                  placeholder="예: 증숙 10분"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px]">시간 (분) *</Label>
                <Input
                  type="number"
                  value={newProfile.timeMinutes}
                  onChange={(e) => setNewProfile({ ...newProfile, timeMinutes: e.target.value })}
                  placeholder="10"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px]">공정 그룹 (선택)</Label>
                <Select value={newProfile.ccpProcessGroupId} onValueChange={(v) => setNewProfile({ ...newProfile, ccpProcessGroupId: v })}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">없음</SelectItem>
                    {processGroups.map((g: any) => (
                      <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  size="sm"
                  className="h-8 w-full text-xs"
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                  추가
                </Button>
              </div>
            </div>
          </div>

          {/* 기존 프로파일 목록 */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableHead className="text-xs w-[100px]">공정</TableHead>
                  <TableHead className="text-xs">프로파일명</TableHead>
                  <TableHead className="text-xs w-[80px] text-center">시간(분)</TableHead>
                  <TableHead className="text-xs">공정 그룹</TableHead>
                  <TableHead className="text-xs">설명</TableHead>
                  <TableHead className="text-xs w-[80px] text-center">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                      등록된 시간 프로파일이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  profiles.map((profile: any) => (
                    <TableRow key={profile.id}>
                      {editingId === profile.id ? (
                        <>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {profile.process_type || profile.processType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Input
                              value={editForm.profileName}
                              onChange={(e) => setEditForm({ ...editForm, profileName: e.target.value })}
                              className="h-7 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editForm.timeMinutes}
                              onChange={(e) => setEditForm({ ...editForm, timeMinutes: e.target.value })}
                              className="h-7 text-xs text-center"
                            />
                          </TableCell>
                          <TableCell>
                            <Select value={editForm.ccpProcessGroupId} onValueChange={(v) => setEditForm({ ...editForm, ccpProcessGroupId: v })}>
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue placeholder="선택" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">없음</SelectItem>
                                {processGroups.map((g: any) => (
                                  <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
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
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleUpdate} disabled={updateMutation.isPending}>
                                <Save className="h-3 w-3 text-green-600" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingId(null)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {profile.process_type || profile.processType}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {profile.profile_name || profile.profileName}
                          </TableCell>
                          <TableCell className="text-center font-semibold text-sm">
                            {profile.time_minutes || profile.timeMinutes}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {profile.process_group_name || "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {profile.description || "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 justify-center">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEdit(profile)}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-500"
                                onClick={() => {
                                  if (confirm("이 시간 프로파일을 삭제하시겠습니까?")) {
                                    deleteMutation.mutate({ id: profile.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
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
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== 제품별 시간 프로파일 매핑 다이얼로그 ==========
function ProductTimeProfileMapDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [filterProcessType, setFilterProcessType] = useState<string>("all");
  const [addingProduct, setAddingProduct] = useState(false);
  const [newMap, setNewMap] = useState({ productId: "", processType: "STEAM", timeProfileId: "" });

  // 매핑 목록 조회
  const { data: maps, refetch } = trpc.ccpMonitoring.getProductTimeProfileMaps.useQuery(
    filterProcessType !== "all" ? { processType: filterProcessType } : undefined
  );
  const mapList = Array.isArray(maps) ? maps : [];

  // 시간 프로파일 목록
  const { data: timeProfiles } = trpc.ccpMonitoring.getTimeProfiles.useQuery(undefined);
  const profiles = Array.isArray(timeProfiles) ? timeProfiles : [];

  // 제품 목록
  const { data: productData } = trpc.product.list.useQuery({ limit: 500 });
  const allProducts = (productData as any)?.items ?? [];

  // 미매핑 증숙 제품
  const { data: unmappedProducts } = trpc.ccpMonitoring.getUnmappedSteamProducts.useQuery(undefined);
  const unmapped = Array.isArray(unmappedProducts) ? unmappedProducts : [];

  const updateMapMutation = trpc.ccpMonitoring.updateProductTimeProfileMap.useMutation({
    onSuccess: () => {
      toast.success("제품 시간 프로파일이 저장되었습니다");
      refetch();
      setAddingProduct(false);
      setNewMap({ productId: "", processType: "STEAM", timeProfileId: "" });
    },
    onError: (err) => toast.error("저장 실패: " + err.message),
  });

  const deleteMapMutation = trpc.ccpMonitoring.deleteProductTimeProfileMap.useMutation({
    onSuccess: () => {
      toast.success("매핑이 삭제되었습니다");
      refetch();
    },
    onError: (err) => toast.error("삭제 실패: " + err.message),
  });

  const handleSaveNew = () => {
    if (!newMap.productId || !newMap.timeProfileId) {
      toast.error("제품과 시간 프로파일을 선택하세요");
      return;
    }
    updateMapMutation.mutate({
      productId: Number(newMap.productId),
      processType: newMap.processType,
      timeProfileId: Number(newMap.timeProfileId),
    });
  };

  // 공정 유형별 필터된 프로파일
  const getProfilesForType = (processType: string) => {
    return profiles.filter((p: any) => (p.process_type || p.processType) === processType);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            제품별 시간 프로파일 매핑
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 안내 */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-lg p-3 border border-green-200 dark:border-green-800">
            <p className="text-xs text-green-700 dark:text-green-300">
              제품마다 공정별 시간을 다르게 설정할 수 있습니다. 예를 들어 "설기떡"은 증숙 10분, "인절미"는 증숙 15분으로 설정합니다.
              시간 프로파일을 먼저 생성한 후 제품에 매핑하세요.
            </p>
          </div>

          {/* 미매핑 경고 */}
          {unmapped.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                  증숙 공정 미매핑 제품 ({unmapped.length}개)
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {unmapped.map((p: any) => (
                  <Badge key={p.id} variant="outline" className="text-[10px] border-red-300 text-red-600">
                    {p.product_name}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-red-500 mt-1.5">
                위 제품들은 증숙 공정이 포함되어 있지만 시간 프로파일이 매핑되지 않았습니다. 배치 확정 시 경고가 표시됩니다.
              </p>
            </div>
          )}

          {/* 필터 + 추가 버튼 */}
          <div className="flex items-center justify-between">
            <Select value={filterProcessType} onValueChange={setFilterProcessType}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="공정 유형 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 공정</SelectItem>
                {processTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-8 text-xs" onClick={() => setAddingProduct(true)}>
              <Plus className="h-3 w-3 mr-1" />
              매핑 추가
            </Button>
          </div>

          {/* 새 매핑 추가 폼 */}
          {addingProduct && (
            <div className="border-2 border-dashed border-green-300 rounded-lg p-3 bg-green-50/50 dark:bg-green-950/20">
              <h4 className="text-xs font-medium mb-2">새 제품 시간 프로파일 매핑</h4>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label className="text-[10px]">제품 *</Label>
                  <Select value={newMap.productId} onValueChange={(v) => setNewMap({ ...newMap, productId: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="제품 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {allProducts.map((p: any) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.productName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">공정 유형 *</Label>
                  <Select value={newMap.processType} onValueChange={(v) => setNewMap({ ...newMap, processType: v, timeProfileId: "" })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {processTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px]">시간 프로파일 *</Label>
                  <Select value={newMap.timeProfileId} onValueChange={(v) => setNewMap({ ...newMap, timeProfileId: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {getProfilesForType(newMap.processType).map((tp: any) => (
                        <SelectItem key={tp.id} value={tp.id.toString()}>
                          {tp.profile_name || tp.profileName} ({tp.time_minutes || tp.timeMinutes}분)
                        </SelectItem>
                      ))}
                      {getProfilesForType(newMap.processType).length === 0 && (
                        <SelectItem value="_empty" disabled>해당 공정의 프로파일 없음</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-1">
                  <Button size="sm" className="h-8 text-xs flex-1" onClick={handleSaveNew} disabled={updateMapMutation.isPending}>
                    {updateMapMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "저장"}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAddingProduct(false)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 매핑 목록 테이블 */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-gray-900">
                  <TableHead className="text-xs">제품명</TableHead>
                  <TableHead className="text-xs w-[100px]">공정</TableHead>
                  <TableHead className="text-xs">시간 프로파일</TableHead>
                  <TableHead className="text-xs w-[80px] text-center">시간(분)</TableHead>
                  <TableHead className="text-xs w-[60px] text-center">삭제</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mapList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                      등록된 매핑이 없습니다. "매핑 추가" 버튼으로 제품별 시간 프로파일을 설정하세요.
                    </TableCell>
                  </TableRow>
                ) : (
                  mapList.map((m: any) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium text-sm">{m.product_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {m.process_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.profile_name}</TableCell>
                      <TableCell className="text-center font-semibold">{m.time_minutes}</TableCell>
                      <TableCell className="text-center">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-500"
                          onClick={() => {
                            if (confirm("이 매핑을 삭제하시겠습니까?")) {
                              deleteMapMutation.mutate({ id: m.id });
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== 공정그룹별 제품 매칭 현황 (읽기 전용 인라인 요약) ==========
function ProcessGroupProductSummary({ groupId, groupName }: { groupId: number; groupName: string }) {
  const { data: mappedProducts } = trpc.ccpMonitoring.getProcessGroupProducts.useQuery(
    { processGroupId: groupId },
    { enabled: !!groupId }
  );
  const products = Array.isArray(mappedProducts) ? mappedProducts : [];
  if (products.length === 0) return null;

  return (
    <div className="mt-2 bg-green-50 dark:bg-green-950/20 rounded-md p-2 border border-green-200 dark:border-green-800">
      <div className="text-[11px] font-semibold text-green-700 dark:text-green-300 flex items-center gap-1 mb-1">
        <Package className="h-3 w-3" />
        매칭 제품 ({products.length})
      </div>
      <div className="flex flex-wrap gap-1">
        {products.slice(0, 8).map((p: any) => (
          <Badge key={p.product_id} variant="outline" className="text-[10px] px-1.5 py-0 bg-white dark:bg-gray-800">
            {p.product_name}
            <span className="ml-1 text-gray-400">{p.mapping_source === "BOM" ? "B" : "M"}</span>
          </Badge>
        ))}
        {products.length > 8 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">+{products.length - 8}개</Badge>
        )}
      </div>
    </div>
  );
}

// ========== 메인 컴포넌트 ==========
export default function CCPLimitsManagement() {
  const [filterCcpType, setFilterCcpType] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<any>(null);
  const [isTimeProfileOpen, setIsTimeProfileOpen] = useState(false);
  const [isProductMapOpen, setIsProductMapOpen] = useState(false);

  // 공정 그룹 목록 조회
  const { data: processGroups, refetch } = trpc.ccpMonitoring.getProcessGroups.useQuery(
    filterCcpType !== "all" ? { ccpType: filterCcpType } : undefined
  );

  // 설비 목록 조회 (equipments 테이블 → { items, total, page, limit })
  const { data: equipmentData } = trpc.equipment.list.useQuery({});
  const equipmentList = (equipmentData as any)?.items ?? [];

  // 공정 그룹 생성
  const createMutation = trpc.ccpMonitoring.createProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("공정 그룹이 생성되었습니다");
      refetch();
      setIsCreateOpen(false);
    },
    onError: (err) => toast.error("생성 실패: " + err.message),
  });

  // 공정 그룹 수정
  const updateMutation = trpc.ccpMonitoring.updateProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("공정 그룹이 수정되었습니다");
      refetch();
      setEditingGroup(null);
    },
    onError: (err) => toast.error("수정 실패: " + err.message),
  });

  // 공정 그룹 삭제
  const deleteMutation = trpc.ccpMonitoring.deleteProcessGroup.useMutation({
    onSuccess: () => {
      toast.success("공정 그룹이 삭제되었습니다");
      refetch();
    },
    onError: (err) => toast.error("삭제 실패: " + err.message),
  });

  const groups = Array.isArray(processGroups) ? processGroups : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">CCP 공정 그룹 관리</CardTitle>
              <CardDescription className="text-sm">
                공정별로 설비를 병렬 그룹화하고 법적 한계기준(CL)을 설정합니다. 시간 프로파일과 제품 매핑으로 세밀한 관리가 가능합니다.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={filterCcpType} onValueChange={setFilterCcpType}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="CCP 유형 필터" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 CCP 유형</SelectItem>
                  {ccpTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" onClick={() => setIsTimeProfileOpen(true)} className="gap-1">
                <Clock className="h-3.5 w-3.5" />
                시간 프로파일
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsProductMapOpen(true)} className="gap-1">
                <Link2 className="h-3.5 w-3.5" />
                제품별 시간
              </Button>
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> 공정 그룹 추가
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {groups.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Layers className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">등록된 공정 그룹이 없습니다</p>
              <p className="text-sm mt-1">"공정 그룹 추가" 버튼을 클릭하여 CCP 공정을 설정하세요.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group: any) => {
                const eqs = group.equipments || [];
                const groupCcpType = group.ccp_type || group.ccpType;
                return (
                  <div key={group.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Layers className="h-5 w-5 text-gray-400" />
                          <span className="font-semibold text-base">{group.name}</span>
                        </div>
                        <Badge className={getCcpColor(groupCcpType)}>
                          {groupCcpType}
                        </Badge>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingGroup(group)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:text-red-700"
                          onClick={() => {
                            if (confirm("이 공정 그룹을 삭제하시겠습니까?")) {
                              deleteMutation.mutate({ id: group.id });
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {group.description && (
                      <p className="text-sm text-gray-500 mt-1 ml-7">{group.description}</p>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-4">
                      {/* 법적 한계치 */}
                      <div className="bg-red-50 rounded-md p-3">
                        <span className="text-xs font-semibold text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> 법적 한계기준 (CL)
                        </span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
                          {(group.temperature_min || group.temperature_max || group.temperatureMin || group.temperatureMax) && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-gray-500">온도</span>
                              <span className="font-medium">
                                {group.temperature_min || group.temperatureMin || "-"} ~ {group.temperature_max || group.temperatureMax || "-"} °C
                              </span>
                            </div>
                          )}
                          {(group.time_min || group.time_max || group.timeMin || group.timeMax) && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-gray-500">시간</span>
                              <span className="font-medium">
                                {group.time_min || group.timeMin || "-"} ~ {group.time_max || group.timeMax || "-"} 분
                              </span>
                            </div>
                          )}
                          {(group.pressure_min || group.pressure_max || group.pressureMin || group.pressureMax) && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-gray-500">압력</span>
                              <span className="font-medium">
                                {group.pressure_min || group.pressureMin || "-"} ~ {group.pressure_max || group.pressureMax || "-"} MPa
                              </span>
                            </div>
                          )}
                          {(group.ph_min || group.ph_max || group.phMin || group.phMax) && (
                            <div className="col-span-2 flex justify-between">
                              <span className="text-gray-500">pH</span>
                              <span className="font-medium">
                                {group.ph_min || group.phMin || "-"} ~ {group.ph_max || group.phMax || "-"}
                              </span>
                            </div>
                          )}
                          {!(group.temperature_min || group.temperature_max || group.temperatureMin || group.temperatureMax ||
                            group.time_min || group.time_max || group.timeMin || group.timeMax ||
                            group.pressure_min || group.pressure_max || group.pressureMin || group.pressureMax ||
                            group.ph_min || group.ph_max || group.phMin || group.phMax) && (
                            <p className="col-span-2 text-xs text-gray-400">한계기준 미설정</p>
                          )}
                        </div>
                      </div>

                      {/* 병렬 설비 그룹 */}
                      <div className="bg-blue-50 rounded-md p-3">
                        <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                          <Settings2 className="h-3 w-3" /> 병렬 설비 그룹 ({eqs.length}대)
                        </span>
                        {eqs.length === 0 ? (
                          <p className="text-xs text-gray-400 mt-2">설비가 배정되지 않았습니다</p>
                        ) : (
                          <div className="mt-2 space-y-1">
                            {eqs.map((eq: any, idx: number) => (
                              <div key={eq.id || idx} className="flex items-center gap-2 text-sm">
                                <Badge variant="outline" className="text-xs w-6 h-5 flex items-center justify-center p-0">
                                  {idx + 1}
                                </Badge>
                                <span className="font-medium">{eq.equipmentName || eq.equipment_name || eq.name}</span>
                                <span className="text-xs text-gray-400">{eq.equipmentCode || eq.code}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 모니터링 방법 & 시정 조치 */}
                    {((group.monitoring_method || group.monitoringMethod) || (group.corrective_action || group.correctiveAction)) && (
                      <div className="mt-2 grid grid-cols-2 gap-4 text-xs text-gray-500">
                        {(group.monitoring_method || group.monitoringMethod) && (
                          <div><span className="font-medium">모니터링:</span> {group.monitoring_method || group.monitoringMethod}</div>
                        )}
                        {(group.corrective_action || group.correctiveAction) && (
                          <div><span className="font-medium">시정조치:</span> {group.corrective_action || group.correctiveAction}</div>
                        )}
                      </div>
                    )}

                    {/* 제품 매칭 현황 (읽기 전용) */}
                    <ProcessGroupProductSummary groupId={group.id} groupName={group.name} />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 생성 다이얼로그 */}
      <ProcessGroupFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        equipmentList={equipmentList}
        onSubmit={(data) => createMutation.mutate(data)}
      />

      {/* 수정 다이얼로그 */}
      {editingGroup && (
        <ProcessGroupFormDialog
          open={!!editingGroup}
          onOpenChange={(open) => { if (!open) setEditingGroup(null); }}
          initialData={editingGroup}
          equipmentList={equipmentList}
          onSubmit={(data) => updateMutation.mutate({ id: editingGroup.id, ...data })}
        />
      )}

      {/* 시간 프로파일 관리 다이얼로그 */}
      <TimeProfileDialog
        open={isTimeProfileOpen}
        onOpenChange={setIsTimeProfileOpen}
        processGroups={groups}
      />

      {/* 제품별 시간 프로파일 매핑 다이얼로그 */}
      <ProductTimeProfileMapDialog
        open={isProductMapOpen}
        onOpenChange={setIsProductMapOpen}
      />
    </div>
  );
}
