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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save, ArrowLeft, ClipboardList } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MaterialCombobox } from "@/components/inventory/MaterialCombobox";
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
  const [partnerId, setPartnerId] = useState<string>("");
  const [orderDate, setOrderDate] = useState<string>(todayLocal());
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>("");
  const [deliveryAddress, setDeliveryAddress] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<POLine[]>([emptyLine()]);

  const { data: partnersData = [] } = trpc.partners.list.useQuery();
  const partners: any[] = Array.isArray(partnersData) ? partnersData : ((partnersData as any)?.items ?? []);

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
      partnerId: parseInt(partnerId),
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
              <Select value={partnerId} onValueChange={setPartnerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="공급업체를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {partners
                    .filter((p) => p.partnerType === "supplier" || !p.partnerType)
                    .map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.companyName || p.name}
                        {p.bizNo ? ` (${p.bizNo})` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
                          partnerId: parseInt(partnerId),
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
