/**
 * 발주서 등록 페이지 — Phase A (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 공급업체 선택 → 품목 라인 여러 개 → 저장 (draft 상태)
 * MaterialCombobox 재사용
 * ═══════════════════════════════════════════════════════════════
 */
import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Save, ArrowLeft, ClipboardList, Repeat, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { MaterialCombobox } from "@/components/inventory/MaterialCombobox";
import { PartnerSearchInput } from "@/components/inventory/PartnerSearchInput";
import { todayLocal } from "@/lib/dateUtils";

interface POLine {
  id: string; // temp client id
  materialId: number | null;
  itemName: string;
  itemCode?: string;
  orderedQty: number;
  unit: string;
  unitPrice: number;
  taxAmount: number;
  notes?: string;
}

function emptyLine(): POLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    materialId: null,
    itemName: "",
    itemCode: "",
    orderedQty: 0,
    unit: "EA",
    unitPrice: 0,
    taxAmount: 0,
    notes: "",
  };
}

export default function PurchaseOrderCreate() {
  return (
    <DashboardLayout>
      <PurchaseOrderCreateContent />
    </DashboardLayout>
  );
}

function PurchaseOrderCreateContent() {
  const [, navigate] = useLocation();
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState<string>("");
  const [orderDate, setOrderDate] = useState<string>(todayLocal());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<POLine[]>([emptyLine()]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);

  // Phase B (2026-04-14): 거래처 선택 시 반복구매 이력 추천
  const { data: suggestions = [] } = trpc.purchaseOrder.suggestRepeatItems.useQuery(
    { partnerId: partnerId!, limit: 20 },
    { enabled: !!partnerId, staleTime: 30_000 },
  );

  const utils = trpc.useUtils();
  const createMutation = trpc.purchaseOrder.create.useMutation({
    onSuccess: (result: any) => {
      toast({ title: "발주서 생성 완료", description: result.message });
      utils.purchaseOrder.list.invalidate();
      navigate("/dashboard/accounting/purchase-orders");
    },
    onError: (err: any) => {
      toast({ title: "생성 실패", description: err.message, variant: "destructive" });
    },
  });

  // 합계 계산
  const totals = lines.reduce(
    (acc, l) => {
      const amount = (l.orderedQty || 0) * (l.unitPrice || 0);
      const tax = l.taxAmount || Math.round(amount * 0.1);
      acc.amount += amount;
      acc.tax += tax;
      return acc;
    },
    { amount: 0, tax: 0 },
  );
  const grandTotal = totals.amount + totals.tax;

  const handleAddLine = () => setLines([...lines, emptyLine()]);

  // Phase B: 추천 품목을 클릭 1번으로 라인 추가
  const addSuggestedItem = (s: any) => {
    const newLine: POLine = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      materialId: s.materialId,
      itemName: s.itemName,
      itemCode: s.itemCode || "",
      orderedQty: Math.round(s.avgQty * 10) / 10 || 1, // 평균 수량 반올림
      unit: s.unit || "EA",
      unitPrice: s.avgPrice || 0,
      taxAmount: Math.round((s.avgQty || 1) * (s.avgPrice || 0) * 0.1),
      notes: "",
    };

    // 현재 lines 에 이미 같은 materialId 가 있으면 skip
    const exists = lines.some(
      (l) => l.materialId === s.materialId && s.materialId !== null,
    );
    if (exists) {
      toast({
        title: "이미 추가된 품목",
        description: `${s.itemName} 은 이미 라인에 있습니다`,
      });
      return;
    }

    // 첫 빈 라인이 있으면 그 자리에 채움, 없으면 append
    const firstEmptyIdx = lines.findIndex(
      (l) => !l.itemName && l.orderedQty === 0,
    );
    if (firstEmptyIdx >= 0) {
      setLines((prev) =>
        prev.map((l, i) => (i === firstEmptyIdx ? { ...newLine, id: l.id } : l)),
      );
    } else {
      setLines((prev) => [...prev, newLine]);
    }

    toast({
      title: "품목 추가",
      description: `${s.itemName} (${s.avgPrice?.toLocaleString()}원)`,
    });
  };

  const addAllTopSuggestions = (topN: number) => {
    const top = (suggestions as any[]).slice(0, topN);
    const newLines: POLine[] = [];
    for (const s of top) {
      const exists =
        lines.some((l) => l.materialId === s.materialId && s.materialId !== null) ||
        newLines.some((l) => l.materialId === s.materialId && s.materialId !== null);
      if (exists) continue;
      newLines.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        materialId: s.materialId,
        itemName: s.itemName,
        itemCode: s.itemCode || "",
        orderedQty: Math.round(s.avgQty * 10) / 10 || 1,
        unit: s.unit || "EA",
        unitPrice: s.avgPrice || 0,
        taxAmount: Math.round((s.avgQty || 1) * (s.avgPrice || 0) * 0.1),
        notes: "",
      });
    }
    if (newLines.length === 0) {
      toast({ title: "추가할 신규 품목이 없습니다" });
      return;
    }
    // 빈 라인 제거 후 append
    setLines((prev) => [
      ...prev.filter((l) => l.itemName || l.orderedQty > 0),
      ...newLines,
    ]);
    toast({
      title: `상위 ${newLines.length}개 품목 추가`,
      description: "수량/단가 확인 후 저장하세요",
    });
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length === 1) {
      toast({ title: "최소 1개 품목이 필요합니다", variant: "destructive" });
      return;
    }
    setLines(lines.filter((l) => l.id !== id));
  };

  const updateLine = (id: string, patch: Partial<POLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const updated = { ...l, ...patch };
        // 금액/세액 자동 계산
        if ("orderedQty" in patch || "unitPrice" in patch) {
          const amt = (updated.orderedQty || 0) * (updated.unitPrice || 0);
          updated.taxAmount = Math.round(amt * 0.1);
        }
        return updated;
      }),
    );
  };

  const handleSave = () => {
    if (!partnerId) {
      toast({ title: "공급업체를 선택하세요", variant: "destructive" });
      return;
    }
    if (lines.some((l) => !l.itemName || l.orderedQty <= 0 || l.unitPrice < 0)) {
      toast({ title: "모든 품목의 품목명/수량/단가를 확인하세요", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      partnerId,
      orderDate,
      expectedDeliveryDate: expectedDeliveryDate || undefined,
      deliveryAddress: deliveryAddress || undefined,
      notes: notes || undefined,
      lines: lines.map((l) => ({
        materialId: l.materialId || undefined,
        itemName: l.itemName,
        itemCode: l.itemCode || undefined,
        orderedQty: l.orderedQty,
        unit: l.unit,
        unitPrice: l.unitPrice,
        taxAmount: l.taxAmount,
        notes: l.notes || undefined,
      })),
    });
  };

  return (
    <div className="p-4 space-y-4 max-w-6xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-purple-600" />
            발주서 등록
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            공급업체에 구매할 품목을 선택하여 발주서를 작성합니다
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/accounting/purchase-orders")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 목록으로
        </Button>
      </div>

      {/* 거래 기본 정보 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">거래 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">공급업체 *</Label>
              <PartnerSearchInput
                partnerType="supplier"
                selectedId={partnerId}
                selectedName={partnerName}
                onSelect={(id, name) => {
                  setPartnerId(id);
                  setPartnerName(name);
                }}
                onClear={() => {
                  setPartnerId(null);
                  setPartnerName("");
                }}
                placeholder="공급업체 검색 (F2)"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">발주일 *</Label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">납기 예정일</Label>
              <Input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <Label className="text-xs">납품 장소</Label>
              <Input
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="예: 본사 창고 1층"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <Label className="text-xs">메모</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="발주 관련 특이사항"
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase B (2026-04-14): 반복 구매 품목 추천 패널 */}
      {partnerId && (suggestions as any[]).length > 0 && showSuggestions && (
        <Card className="border-2 border-violet-200 bg-gradient-to-br from-violet-50/50 to-blue-50/30">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                {partnerName} 의 자주 구매 품목
                <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-700">
                  AI 추천
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                과거 발주/매입 이력 기반. 클릭 1번으로 라인 추가 · 평균 단가/수량 자동 입력
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => addAllTopSuggestions(5)}
                className="h-7 text-xs"
              >
                상위 5개
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => addAllTopSuggestions(10)}
                className="h-7 text-xs"
              >
                상위 10개
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSuggestions(false)}
                className="h-7 text-xs text-muted-foreground"
                title="접기"
              >
                ✕
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(suggestions as any[]).map((s: any, idx: number) => {
                const alreadyAdded = lines.some(
                  (l) => l.materialId === s.materialId && s.materialId !== null,
                );
                return (
                  <button
                    key={s.key || idx}
                    type="button"
                    onClick={() => addSuggestedItem(s)}
                    disabled={alreadyAdded}
                    className={`group relative text-left border rounded-lg px-3 py-2 transition-all ${
                      alreadyAdded
                        ? "bg-emerald-50 border-emerald-300 opacity-60 cursor-not-allowed"
                        : "bg-white border-violet-200 hover:border-violet-400 hover:shadow-md hover:-translate-y-0.5"
                    }`}
                    title={`${s.purchaseCount}회 구매 · ${s.daysSinceLast}일 전 마지막 주문 · 평균 ${s.avgPrice?.toLocaleString()}원`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Repeat className="h-3 w-3 text-violet-500" />
                      <span className="text-xs font-medium truncate max-w-[180px]">
                        {s.itemName}
                      </span>
                      {alreadyAdded && (
                        <span className="text-[9px] text-emerald-600 ml-1">✓ 추가됨</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="font-mono">
                        {s.avgPrice?.toLocaleString()}원
                      </span>
                      <span>·</span>
                      <span>{s.purchaseCount}회</span>
                      {s.daysSinceLast < 30 && (
                        <Badge
                          variant="outline"
                          className="h-3.5 px-1 py-0 text-[8px] bg-amber-100 text-amber-700 border-amber-300"
                        >
                          최근
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 품목 라인 */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">품목 ({lines.length})</CardTitle>
          <Button size="sm" variant="outline" onClick={handleAddLine}>
            <Plus className="h-3.5 w-3.5 mr-1" /> 품목 추가
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, idx) => (
            <div
              key={line.id}
              className="grid grid-cols-12 gap-2 p-3 border rounded-lg bg-muted/20"
            >
              <div className="col-span-12 flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">
                  라인 {idx + 1}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveLine(line.id)}
                  className="h-6 w-6 p-0 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="col-span-12 md:col-span-5">
                <Label className="text-[10px] text-muted-foreground">원재료 *</Label>
                <MaterialCombobox
                  selectedId={line.materialId}
                  selectedName={line.itemName}
                  onSelect={async (m) => {
                    updateLine(line.id, {
                      materialId: m.id,
                      itemName: m.materialName,
                      itemCode: m.materialCode,
                      unit: m.unit || line.unit,
                    });
                    // Phase B: 거래처별 단가 자동 적용
                    if (partnerId) {
                      try {
                        const price = await utils.partnerPrice.resolvePrice.fetch({
                          partnerId,
                          targetType: "material",
                          materialId: m.id,
                        });
                        if (price && price.unitPrice > 0) {
                          updateLine(line.id, { unitPrice: price.unitPrice });
                          toast({
                            title: "거래처 단가 자동 적용",
                            description: `${m.materialName}: ${price.unitPrice.toLocaleString()}원`,
                          });
                        }
                      } catch (err) {
                        // 단가가 없으면 조용히 무시
                      }
                    }
                  }}
                  onClear={() =>
                    updateLine(line.id, { materialId: null, itemName: "", itemCode: "" })
                  }
                  placeholder="원재료 검색..."
                />
              </div>

              <div className="col-span-4 md:col-span-2">
                <Label className="text-[10px] text-muted-foreground">수량 *</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={line.orderedQty || ""}
                  onChange={(e) =>
                    updateLine(line.id, { orderedQty: parseFloat(e.target.value) || 0 })
                  }
                  className="h-9"
                />
              </div>

              <div className="col-span-4 md:col-span-1">
                <Label className="text-[10px] text-muted-foreground">단위</Label>
                <Input
                  value={line.unit}
                  onChange={(e) => updateLine(line.id, { unit: e.target.value })}
                  className="h-9"
                />
              </div>

              <div className="col-span-4 md:col-span-2">
                <Label className="text-[10px] text-muted-foreground">단가 *</Label>
                <Input
                  type="number"
                  value={line.unitPrice || ""}
                  onChange={(e) =>
                    updateLine(line.id, { unitPrice: parseFloat(e.target.value) || 0 })
                  }
                  className="h-9 text-right"
                />
              </div>

              <div className="col-span-12 md:col-span-2 text-right">
                <Label className="text-[10px] text-muted-foreground">금액 (자동)</Label>
                <div className="h-9 flex items-center justify-end pr-1 text-sm font-mono tabular-nums">
                  {Math.round(line.orderedQty * line.unitPrice).toLocaleString()}원
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 합계 + 저장 */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">공급가</span>
                <span className="font-mono tabular-nums">{totals.amount.toLocaleString()}원</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">부가세</span>
                <span className="font-mono tabular-nums">{totals.tax.toLocaleString()}원</span>
              </div>
              <div className="flex items-center gap-4 text-base font-bold">
                <span>총액</span>
                <span className="font-mono tabular-nums text-purple-600">
                  {grandTotal.toLocaleString()}원
                </span>
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleSave}
              disabled={createMutation.isPending}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "저장 중..." : "발주서 저장 (작성 중)"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
