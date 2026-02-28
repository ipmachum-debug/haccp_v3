import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import {
  Loader2, Plus, Trash2, Package, FlaskConical,
  Calendar, Clock, CheckCircle2, AlertTriangle, Settings2
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface BatchItem {
  id: string;
  productId: string;
  plannedQuantityKg: string;
  mode: "auto" | "manual";
  startTime: string;
  skuOutputs: Record<number, string>;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function DailyBatchCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Global settings
  const [workDate, setWorkDate] = useState(new Date().toISOString().split("T")[0]);
  const [dayStartTime, setDayStartTime] = useState("09:00");
  const [defaultMode, setDefaultMode] = useState<"auto" | "manual">("auto");
  const [memo, setMemo] = useState("");

  // Scheduling policy
  const [metalAllocation, setMetalAllocation] = useState<"EQUAL" | "PROPORTIONAL">("PROPORTIONAL");
  const [passOrder, setPassOrder] = useState<"INPUT_ORDER" | "PLANNED_QTY_DESC">("INPUT_ORDER");

  // Batch items
  const [items, setItems] = useState<BatchItem[]>([
    { id: generateId(), productId: "", plannedQuantityKg: "", mode: "auto", startTime: "", skuOutputs: {} },
  ]);

  // Product list
  const { data: rawProductsData, isLoading: productsLoading } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (rawProductsData as any)?.items ?? (Array.isArray(rawProductsData) ? rawProductsData : []);

  // SKU list
  const { data: allSkus } = trpc.productSku.listAll.useQuery({ itemType: "own_product" }, { enabled: true });

  // Bulk create mutation
  const bulkCreateMutation = trpc.batch.bulkCreateForDay.useMutation({
    onSuccess: (data: any) => {
      toast.success(`${data.createdCount}개 배치가 생성되었습니다!`);
      setLocation("/dashboard/batch");
    },
    onError: (error: any) => {
      toast.error(`생성 실패: ${error.message}`);
    },
  });

  // Helper: get SKUs for a product
  const getSkusForProduct = (productId: string) => {
    if (!allSkus || !productId) return [];
    const product = products.find((p: any) => p.id === parseInt(productId));
    if (!product) return [];
    return (allSkus as any[]).filter((sku: any) => sku.itemName === product.productName);
  };

  // Helper: get product name
  const getProductName = (productId: string) => {
    const product = products.find((p: any) => p.id === parseInt(productId));
    return product?.productName || "";
  };

  // Item management
  const addItem = () => {
    setItems([...items, { id: generateId(), productId: "", plannedQuantityKg: "", mode: defaultMode, startTime: "", skuOutputs: {} }]);
  };

  const removeItem = (id: string) => {
    if (items.length <= 1) {
      toast.error("최소 1개 품목이 필요합니다");
      return;
    }
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof BatchItem, value: any) => {
    setItems(items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const updateSkuOutput = (itemId: string, skuId: number, qty: string) => {
    setItems(items.map((item) => {
      if (item.id !== itemId) return item;
      return { ...item, skuOutputs: { ...item.skuOutputs, [skuId]: qty } };
    }));
  };

  // Validation
  const isValid = useMemo(() => {
    if (!workDate) return false;
    return items.every((item) => item.productId && parseFloat(item.plannedQuantityKg) > 0);
  }, [workDate, items]);

  // Already selected products (to prevent duplicates)
  const selectedProductIds = items.map((item) => item.productId).filter(Boolean);

  // Submit
  const handleSubmit = () => {
    if (!isValid) {
      toast.error("모든 품목의 제품과 생산량을 입력해주세요");
      return;
    }

    const payload = {
      siteId: (user as any)?.siteId || 1,
      workDate,
      dayStartTime,
      defaultMode,
      scheduling: {
        applyProcessSchedule: true,
        metalAllocation,
        passOrder,
      },
      items: items.map((item) => {
        const skuOutputs = Object.entries(item.skuOutputs)
          .filter(([, qty]) => qty && parseInt(qty) > 0)
          .map(([skuId, qty]) => ({
            skuId: parseInt(skuId),
            plannedQty: parseInt(qty),
          }));

        return {
          productId: parseInt(item.productId),
          plannedQuantityKg: parseFloat(item.plannedQuantityKg),
          mode: item.mode || undefined,
          startTime: item.startTime || undefined,
          ...(skuOutputs.length > 0 ? { skuOutputs } : {}),
        };
      }),
      memo: memo || undefined,
    };

    bulkCreateMutation.mutate(payload as any);
  };

  // Calculate total
  const totalKg = items.reduce((sum, item) => sum + (parseFloat(item.plannedQuantityKg) || 0), 0);

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              하루 복수품목 일괄 배치 생성
            </h1>
            <p className="text-muted-foreground mt-1">
              작업일자를 선택하고 생산할 품목을 한 번에 등록합니다
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/dashboard/batch")}>
            배치 목록으로
          </Button>
        </div>

        {/* Global Settings Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              작업일자 및 기본 설정
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>작업일자 *</Label>
                <Input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>작업 시작시간</Label>
                <Input
                  type="time"
                  value={dayStartTime}
                  onChange={(e) => setDayStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>기본 모드</Label>
                <Select value={defaultMode} onValueChange={(v) => setDefaultMode(v as "auto" | "manual")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">자동 (AUTO)</SelectItem>
                    <SelectItem value="manual">수동 (MANUAL)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>금속탐지 배분</Label>
                <Select value={metalAllocation} onValueChange={(v) => setMetalAllocation(v as "EQUAL" | "PROPORTIONAL")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PROPORTIONAL">비례 배분</SelectItem>
                    <SelectItem value="EQUAL">균등 배분</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Items Table */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  생산 품목 ({items.length}건)
                </CardTitle>
                <CardDescription>
                  품목별 생산량(kg)과 모드를 설정합니다. 총 생산량: <strong>{totalKg.toFixed(1)}kg</strong>
                </CardDescription>
              </div>
              <Button onClick={addItem} size="sm" variant="outline">
                <Plus className="h-4 w-4 mr-1" />
                품목 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, index) => {
                const skusForProduct = getSkusForProduct(item.productId);
                return (
                  <Card key={item.id} className="border-dashed">
                    <CardContent className="pt-4">
                      <div className="flex items-start gap-4">
                        <Badge variant="outline" className="mt-1 shrink-0">{index + 1}</Badge>

                        <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                          {/* Product */}
                          <div className="md:col-span-2 space-y-1">
                            <Label className="text-xs">제품 *</Label>
                            <Select
                              value={item.productId}
                              onValueChange={(v) => updateItem(item.id, "productId", v)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="제품 선택" />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map((p: any) => (
                                  <SelectItem
                                    key={p.id}
                                    value={String(p.id)}
                                    disabled={selectedProductIds.includes(String(p.id)) && item.productId !== String(p.id)}
                                  >
                                    {p.productName}
                                    {selectedProductIds.includes(String(p.id)) && item.productId !== String(p.id) ? " (이미 선택됨)" : ""}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Quantity */}
                          <div className="space-y-1">
                            <Label className="text-xs">생산량(kg) *</Label>
                            <Input
                              type="number"
                              className="h-9"
                              value={item.plannedQuantityKg}
                              onChange={(e) => updateItem(item.id, "plannedQuantityKg", e.target.value)}
                              placeholder="0.0"
                            />
                          </div>

                          {/* Mode */}
                          <div className="space-y-1">
                            <Label className="text-xs">모드</Label>
                            <Select
                              value={item.mode}
                              onValueChange={(v) => updateItem(item.id, "mode", v)}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="auto">AUTO</SelectItem>
                                <SelectItem value="manual">MANUAL</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Start Time */}
                          <div className="space-y-1">
                            <Label className="text-xs">시작시간</Label>
                            <Input
                              type="time"
                              className="h-9"
                              value={item.startTime}
                              onChange={(e) => updateItem(item.id, "startTime", e.target.value)}
                            />
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 mt-5 text-muted-foreground hover:text-red-500"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* SKU Outputs */}
                      {item.productId && skusForProduct.length > 0 && (
                        <div className="mt-3 ml-10 pl-4 border-l-2 border-dashed">
                          <div className="text-xs font-medium text-muted-foreground mb-2">
                            SKU별 예상 생산수량
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {skusForProduct.map((sku: any) => (
                              <div key={sku.id} className="flex items-center gap-2">
                                <span className="text-xs truncate max-w-[120px]" title={sku.skuName}>
                                  {sku.skuName || `${sku.netWeight}${sku.salesUnit}`}
                                </span>
                                <Input
                                  type="number"
                                  className="h-7 w-20 text-xs text-right"
                                  placeholder="0"
                                  value={item.skuOutputs[sku.id] || ""}
                                  onChange={(e) => updateSkuOutput(item.id, sku.id, e.target.value)}
                                />
                                <span className="text-[10px] text-muted-foreground">{sku.salesUnit}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Memo */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">메모 (선택)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="생산 관련 메모를 입력합니다"
              rows={2}
            />
          </CardContent>
        </Card>

        {/* Summary & Submit */}
        <Card className="border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-5 w-5" />
              자동 처리 항목
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {[
                `${items.filter((i) => i.productId).length}개 품목 배치 순차 생성`,
                "품목별 원재료 투입 계획 (BOM 배합비 × 생산량)",
                "CCP 기록지 자동 생성 (공정그룹별 설비 기준값 적용)",
                "금속탐지 SKU 통과기록 자동 생성 (시간 배분 계산)",
                "승인 요청 및 일일 보고서 자동 등록",
              ].map((text, i) => (
                <div key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{text}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={!isValid || bulkCreateMutation.isPending}
            className="flex-1"
            size="lg"
          >
            {bulkCreateMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                일괄 생성 중...
              </>
            ) : (
              <>
                <FlaskConical className="mr-2 h-5 w-5" />
                {items.filter((i) => i.productId).length}개 품목 일괄 배치 생성
              </>
            )}
          </Button>
          <Button variant="outline" size="lg" onClick={() => setLocation("/dashboard/batch")}>
            취소
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
