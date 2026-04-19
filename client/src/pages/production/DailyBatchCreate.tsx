import { useState, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import AIProductionParser from "@/components/production/AIProductionParser";
import {
  Loader2, Plus, Trash2, Package, FlaskConical,
  Calendar, CheckCircle2, GripVertical, Shuffle, ArrowDown, ArrowUp, Sparkles, ChevronsUpDown, Check
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

import { todayLocal } from "../../lib/dateUtils";

interface BatchItem {
  id: string;
  productId: string;
  plannedQuantityKg: string;
  mode: "auto" | "manual";
  skuOutputs: Record<number, string>;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

// ============================================================
// Drag & Drop helpers (pure HTML5 DnD, no external library)
// ============================================================
function useDragReorder(items: BatchItem[], setItems: (items: BatchItem[]) => void) {
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const onDragStart = (index: number) => {
    dragItem.current = index;
  };
  const onDragEnter = (index: number) => {
    dragOverItem.current = index;
  };
  const onDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) { dragItem.current = null; dragOverItem.current = null; return; }
    const copy = [...items];
    const [removed] = copy.splice(dragItem.current, 1);
    copy.splice(dragOverItem.current, 0, removed);
    setItems(copy);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return { onDragStart, onDragEnter, onDragEnd };
}

export default function DailyBatchCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // Global settings
  const [workDate, setWorkDate] = useState(todayLocal());
  const [dayStartTime, setDayStartTime] = useState("09:00");
  const [defaultMode, setDefaultMode] = useState<"auto" | "manual">("auto");
  const [memo, setMemo] = useState("");

  // Scheduling policy
  const [metalAllocation, setMetalAllocation] = useState<"EQUAL" | "PROPORTIONAL">("PROPORTIONAL");
  const [passOrder, setPassOrder] = useState<"INPUT_ORDER" | "PLANNED_QTY_DESC">("INPUT_ORDER");

  // Equipment allocation mode for same-day mixed processes
  const [equipAllocation, setEquipAllocation] = useState<"RANDOM" | "SEQUENTIAL">("RANDOM");

  // AI Parser visibility
  const [showAIParser, setShowAIParser] = useState(false);

  // Batch items
  const [items, setItems] = useState<BatchItem[]>([
    { id: generateId(), productId: "", plannedQuantityKg: "", mode: "auto", skuOutputs: {} },
  ]);

  // Product list
  const { data: rawProductsData, isLoading: productsLoading } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (rawProductsData as any)?.items ?? (Array.isArray(rawProductsData) ? rawProductsData : []);

  // SKU list
  const { data: allSkus } = trpc.productSku.listAll.useQuery({ itemType: "own_product" }, { enabled: true });

  // Bulk create mutation
  const bulkCreateMutation = trpc.batch.bulkCreateForDay.useMutation({
    onSuccess: (data: any) => {
      if (data.createdCount === 0) {
        // 모든 배치 생성 실패
        const errors = (data.errors || []).map((e: any) => e.error);
        if (errors.length === 0) {
          // fallback: batches에서 에러 추출
          (data.batches || []).filter((b: any) => b.error).forEach((b: any) => errors.push(b.error));
        }
        const errorMsg = errors.length > 0
          ? errors.slice(0, 3).join("; ")
          : "알 수 없는 오류";
        toast.error(`배치 생성 실패: ${errorMsg}`);
        return;
      }
      if (data.createdCount < data.totalRequested) {
        toast.warning(`${data.createdCount}/${data.totalRequested}개 배치 생성 (일부 실패)`);
      } else {
        toast.success(`${data.createdCount}개 배치 생성 완료! (그룹: ${data.dayBatchGroup || ""})`);
      }
      setLocation("/dashboard/batch");
    },
    onError: (error: { message: string; data?: { zodError?: { fieldErrors: Record<string, string[]> } } }) => {
      const detail = error.data?.zodError
        ? `검증 오류: ${JSON.stringify(error.data.zodError.fieldErrors)}`
        : error.message;
      toast.error(`생성 실패: ${detail}`);
    },
  });

  // Drag & Drop
  const { onDragStart, onDragEnter, onDragEnd } = useDragReorder(items, setItems);

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
    setItems([...items, { id: generateId(), productId: "", plannedQuantityKg: "", mode: defaultMode, skuOutputs: {} }]);
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

  // Move item up/down
  const moveItem = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    const copy = [...items];
    [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
    setItems(copy);
  };

  // Shuffle items randomly (for mixed 증숙기/교반 random allocation)
  const shuffleItems = () => {
    const filled = items.filter(i => i.productId);
    const empty = items.filter(i => !i.productId);
    // Fisher-Yates shuffle
    for (let i = filled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [filled[i], filled[j]] = [filled[j], filled[i]];
    }
    setItems([...filled, ...empty]);
    toast.success("배치 순서가 랜덤으로 섞였습니다");
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
        equipAllocation,
      },
      items: items.map((item, idx) => {
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
          batchOrder: idx + 1,
          ...(skuOutputs.length > 0 ? { skuOutputs } : {}),
        };
      }),
      memo: memo || undefined,
    };

    bulkCreateMutation.mutate(payload as any);
  };

  // AI Parser: 확인된 항목을 배치 아이템으로 변환
  const handleAIConfirm = useCallback((confirmedItems: Array<{ productId: number; productName: string; quantityKg: number }>) => {
    const newItems: BatchItem[] = confirmedItems.map(ci => ({
      id: generateId(),
      productId: String(ci.productId),
      plannedQuantityKg: String(ci.quantityKg),
      mode: defaultMode,
      skuOutputs: {},
    }));

    // 기존 빈 항목 제거 후 추가
    const existingFilled = items.filter(i => i.productId);
    // 중복 제품 제거 (이미 있는 productId는 수량만 업데이트)
    const merged = [...existingFilled];
    for (const newItem of newItems) {
      const existing = merged.find(m => m.productId === newItem.productId);
      if (existing) {
        existing.plannedQuantityKg = String(
          parseFloat(existing.plannedQuantityKg || "0") + parseFloat(newItem.plannedQuantityKg || "0")
        );
      } else {
        merged.push(newItem);
      }
    }
    setItems(merged.length > 0 ? merged : [{ id: generateId(), productId: "", plannedQuantityKg: "", mode: defaultMode, skuOutputs: {} }]);
    setShowAIParser(false);
  }, [items, defaultMode]);

  // Calculate total
  const totalKg = items.reduce((sum, item) => sum + (parseFloat(item.plannedQuantityKg) || 0), 0);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              하루 복수품목 일괄 배치 생성
            </h1>
            <p className="text-muted-foreground mt-1">
              작업일자를 선택하고 생산할 품목을 한 번에 등록합니다. 드래그로 순서를 변경하세요.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowAIParser(!showAIParser)}
              variant={showAIParser ? "default" : "outline"}
              className={showAIParser ? "bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white" : "border-indigo-300 text-indigo-600 hover:bg-indigo-50"}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              AI 자동입력
            </Button>
            <Button variant="outline" onClick={() => setLocation("/dashboard/batch")}>
              배치 목록으로
            </Button>
          </div>
        </div>

        {/* AI Production Parser */}
        {showAIParser && (
          <AIProductionParser
            onConfirm={handleAIConfirm}
            onClose={() => setShowAIParser(false)}
          />
        )}

        {/* Global Settings Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              작업일자 및 기본 설정
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label>작업일자 *</Label>
                <Input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>배치 시작시간 *</Label>
                <Input
                  type="time"
                  value={dayStartTime}
                  onChange={(e) => setDayStartTime(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground">첫 배치 시작 기준시간</p>
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
              <div className="space-y-2">
                <Label>설비 배분 (동일공정)</Label>
                <Select value={equipAllocation} onValueChange={(v) => setEquipAllocation(v as "RANDOM" | "SEQUENTIAL")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RANDOM">랜덤 배분</SelectItem>
                    <SelectItem value="SEQUENTIAL">순차 배분</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">증숙/교반 혼합시 설비 배분</p>
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
                  생산 품목 ({items.length}건) - 배치 순서 = 금속탐지 통과 순서
                </CardTitle>
                <CardDescription>
                  드래그하여 순서 변경 가능. 총 생산량: <strong>{totalKg.toFixed(1)}kg</strong>
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={shuffleItems} size="sm" variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50">
                  <Shuffle className="h-4 w-4 mr-1" />
                  순서 랜덤
                </Button>
                <Button onClick={addItem} size="sm" variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  품목 추가
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {items.map((item, index) => {
                const skusForProduct = getSkusForProduct(item.productId);
                return (
                  <Card
                    key={item.id}
                    className="border-dashed cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={() => onDragStart(index)}
                    onDragEnter={() => onDragEnter(index)}
                    onDragEnd={onDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                  >
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-2">
                        {/* Drag handle + order badge */}
                        <div className="flex flex-col items-center gap-1 shrink-0 mt-1">
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <Badge
                            variant={index === 0 ? "default" : "outline"}
                            className={`text-xs ${index === 0 ? "bg-orange-500" : ""}`}
                          >
                            {index + 1}
                          </Badge>
                          <div className="flex flex-col gap-0.5">
                            <button
                              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                              onClick={() => moveItem(index, "up")}
                              disabled={index === 0}
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
                              onClick={() => moveItem(index, "down")}
                              disabled={index === items.length - 1}
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3">
                          {/* Product */}
                          <div className="md:col-span-2 space-y-1">
                            <Label className="text-xs">제품 *</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal">
                                  {item.productId
                                    ? products.find((p: any) => String(p.id) === item.productId)?.productName || "제품 선택"
                                    : "제품 검색/선택"}
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[300px] p-0" align="start">
                                <Command>
                                  <CommandInput placeholder="제품명 검색..." />
                                  <CommandList>
                                    <CommandEmpty>검색 결과 없음</CommandEmpty>
                                    <CommandGroup>
                                      {products.map((p: any) => {
                                        const isSelected = item.productId === String(p.id);
                                        const isUsed = selectedProductIds.includes(String(p.id)) && !isSelected;
                                        return (
                                          <CommandItem
                                            key={p.id}
                                            value={p.productName}
                                            disabled={isUsed}
                                            onSelect={() => {
                                              updateItem(item.id, "productId", String(p.id));
                                            }}
                                            className={cn(isUsed && "opacity-40")}
                                          >
                                            <Check className={cn("mr-2 h-4 w-4", isSelected ? "opacity-100" : "opacity-0")} />
                                            {p.productName}
                                            {isUsed && " (이미 선택됨)"}
                                          </CommandItem>
                                        );
                                      })}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
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

                      {/* SKU Outputs with conversion */}
                      {item.productId && skusForProduct.length > 0 && (() => {
                        const plannedKg = parseFloat(item.plannedQuantityKg) || 0;
                        // SKU별 환산 계산
                        const skuCalcs = skusForProduct.map((sku: any) => {
                          const kgPerUnit = parseFloat(sku.kgPerSalesUnit) || 0;
                          const inputQty = parseInt(item.skuOutputs[sku.id] || "0") || 0;
                          const estimatedQty = kgPerUnit > 0 && plannedKg > 0 ? Math.floor(plannedKg / kgPerUnit) : 0;
                          const inputKg = inputQty * kgPerUnit;
                          return { ...sku, kgPerUnit, estimatedQty, inputQty, inputKg };
                        });
                        const totalSkuKg = skuCalcs.reduce((s, c) => s + c.inputKg, 0);
                        const totalSkuQty = skuCalcs.reduce((s, c) => s + c.inputQty, 0);

                        return (
                          <div className="mt-3 ml-10 pl-4 border-l-2 border-dashed border-blue-200">
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-medium text-muted-foreground">
                                SKU별 예상 생산수량
                                {plannedKg > 0 && (
                                  <span className="ml-2 text-blue-600 font-normal">
                                    (생산량 {plannedKg.toFixed(1)}kg 기준)
                                  </span>
                                )}
                              </div>
                              {totalSkuKg > 0 && (
                                <Badge variant="outline" className={`text-[10px] ${Math.abs(totalSkuKg - plannedKg) < 0.01 ? "border-green-400 text-green-700 bg-green-50" : "border-orange-400 text-orange-700 bg-orange-50"}`}>
                                  SKU 환산: {totalSkuKg.toFixed(1)}kg / {plannedKg.toFixed(1)}kg
                                </Badge>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              {skuCalcs.map((calc: any) => (
                                <div key={calc.id} className="flex items-center gap-2 bg-gray-50 rounded-md px-2 py-1.5">
                                  {/* SKU 이름 + 규격 */}
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs font-medium truncate block" title={calc.skuName}>
                                      {calc.skuName || `${calc.netWeightG}g`}
                                    </span>
                                    {calc.kgPerUnit > 0 && (
                                      <span className="text-[10px] text-muted-foreground">
                                        {calc.netWeightG ? `${calc.netWeightG}g` : ""}
                                        {calc.piecesPerPack > 1 ? ` × ${calc.piecesPerPack}ea` : ""}
                                        {calc.packsPerBox > 1 ? ` × ${calc.packsPerBox}pack` : ""}
                                        {" = "}{calc.kgPerUnit}kg/{calc.salesUnit}
                                      </span>
                                    )}
                                  </div>

                                  {/* 예상수량 표시 */}
                                  {calc.estimatedQty > 0 && (
                                    <span className="text-[10px] text-blue-500 whitespace-nowrap">
                                      예상 {calc.estimatedQty}{calc.salesUnit}
                                    </span>
                                  )}

                                  {/* 수량 입력 */}
                                  <Input
                                    type="number"
                                    className="h-7 w-20 text-xs text-right"
                                    placeholder={calc.estimatedQty > 0 ? String(calc.estimatedQty) : "0"}
                                    value={item.skuOutputs[calc.id] || ""}
                                    onChange={(e) => updateSkuOutput(item.id, calc.id, e.target.value)}
                                  />
                                  <span className="text-[10px] text-muted-foreground w-8">{calc.salesUnit}</span>

                                  {/* 환산중량 */}
                                  {calc.inputQty > 0 && calc.kgPerUnit > 0 && (
                                    <span className="text-[10px] text-emerald-600 font-medium whitespace-nowrap min-w-[50px] text-right">
                                      = {calc.inputKg.toFixed(1)}kg
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>

                            {/* SKU 합산 요약 */}
                            {totalSkuQty > 0 && (
                              <div className="mt-2 pt-1.5 border-t border-dashed flex items-center justify-end gap-3 text-xs">
                                <span className="text-muted-foreground">합계:</span>
                                <span className="font-medium">{totalSkuQty.toLocaleString()}개</span>
                                <span className="font-medium text-emerald-600">{totalSkuKg.toFixed(1)}kg</span>
                                {plannedKg > 0 && Math.abs(totalSkuKg - plannedKg) >= 0.01 && (
                                  <span className="text-orange-500 text-[10px]">
                                    (차이: {(totalSkuKg - plannedKg) > 0 ? "+" : ""}{(totalSkuKg - plannedKg).toFixed(1)}kg)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
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
                `${items.filter((i) => i.productId).length}개 품목 배치 순차 생성 (드래그 순서 = 배치 순서 = 금속탐지 통과 순서)`,
                `배치 시작시간: ${dayStartTime} → 설비/공정 기준 자동 시간 계산`,
                "품목별 원재료 투입 계획 (BOM 배합비 x 생산량)",
                "CCP 기록지 자동 생성 (공정그룹별 설비 기준값 적용)",
                `설비 배분: ${equipAllocation === "RANDOM" ? "증숙기/교반기 랜덤 배분" : "순차 배분"}`,
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
            className="flex-1 bg-orange-500 hover:bg-orange-600"
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
