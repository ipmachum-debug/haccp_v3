/**
 * 견적서 등록 페이지 — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 고객 선택 → 품목 라인 (제품/원재료/서비스) → 단가 자동 적용 → 저장
 * Phase B 거래처별 단가표 (resolvePrice) 연동
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
import { Plus, Trash2, Save, ArrowLeft, FileText, Sparkles, Repeat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { MaterialCombobox } from "@/components/inventory/MaterialCombobox";
import { ProductCombobox } from "@/components/inventory/ProductCombobox";
import { PartnerSearchInput } from "@/components/inventory/PartnerSearchInput";
import { todayLocal } from "@/lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

interface QuoLine {
  id: string;
  targetType: "material" | "product" | "service";
  materialId: number | null;
  productId: number | null;
  itemName: string;
  itemCode?: string;
  description?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountRate: number;
  amount: number;
  taxAmount: number;
  notes?: string;
}

function emptyLine(): QuoLine {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    targetType: "product",
    materialId: null,
    productId: null,
    itemName: "",
    itemCode: "",
    description: "",
    quantity: 0,
    unit: "EA",
    unitPrice: 0,
    discountRate: 0,
    amount: 0,
    taxAmount: 0,
    notes: "",
  };
}

export default function QuotationCreate() {
  const L = useIndustryLabel();
  return (
    <DashboardLayout>
      <QuotationCreateContent />
    </DashboardLayout>
  );
}

function QuotationCreateContent() {
  const L = useIndustryLabel();
  const [, navigate] = useLocation();
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [partnerName, setPartnerName] = useState<string>("");
  const [quoteDate, setQuoteDate] = useState<string>(todayLocal());
  const [validUntil, setValidUntil] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [paymentTerms, setPaymentTerms] = useState<string>("");
  const [deliveryTerms, setDeliveryTerms] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [lines, setLines] = useState<QuoLine[]>([emptyLine()]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(true);
  const [isNewPartner, setIsNewPartner] = useState(false); // 신규 거래처 임시 입력

  // Phase B: 반복 판매 품목 추천 (고객 선택 시)
  const { data: suggestions = [] } = trpc.quotation.suggestRepeatItems.useQuery(
    { partnerId: partnerId!, limit: 20 },
    { enabled: !!partnerId, staleTime: 30_000 },
  );

  const utils = trpc.useUtils();
  const createMutation = trpc.quotation.create.useMutation({
    onSuccess: (result: any) => {
      toast({ title: "견적서 생성 완료", description: result.message });
      utils.quotation.list.invalidate();
      navigate("/dashboard/accounting/quotations");
    },
    onError: (err: { message: string }) => {
      toast({ title: "생성 실패", description: err.message, variant: "destructive" });
    },
  });

  // 합계 계산
  const totals = lines.reduce(
    (acc, l) => {
      acc.amount += l.amount;
      acc.tax += l.taxAmount;
      return acc;
    },
    { amount: 0, tax: 0 },
  );
  const grandTotal = totals.amount + totals.tax;

  const handleAddLine = () => setLines((prev) => [...prev, emptyLine()]);

  // Phase B: 추천 품목을 클릭 1번으로 라인 추가
  const suggestionToLine = (s: any): QuoLine => {
    const qty = Math.round((s.avgQty || 1) * 10) / 10 || 1;
    const unitPrice = s.avgPrice || 0;
    const gross = qty * unitPrice;
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      targetType: s.targetType || "product",
      materialId: s.materialId,
      productId: s.productId,
      itemName: s.itemName,
      itemCode: s.itemCode || "",
      description: "",
      quantity: qty,
      unit: s.unit || "EA",
      unitPrice,
      discountRate: 0,
      amount: gross,
      taxAmount: Math.round(gross * 0.1),
      notes: "",
    };
  };

  const addSuggestedItem = (s: any) => {
    const exists = lines.some(
      (l) =>
        (s.productId && l.productId === s.productId) ||
        (s.materialId && l.materialId === s.materialId),
    );
    if (exists) {
      toast({
        title: "이미 추가된 품목",
        description: `${s.itemName} 은 이미 라인에 있습니다`,
      });
      return;
    }

    const newLine = suggestionToLine(s);
    const firstEmptyIdx = lines.findIndex((l) => !l.itemName && l.quantity === 0);
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
    const newLines: QuoLine[] = [];
    for (const s of top) {
      const exists =
        lines.some(
          (l) =>
            (s.productId && l.productId === s.productId) ||
            (s.materialId && l.materialId === s.materialId),
        ) ||
        newLines.some(
          (l) =>
            (s.productId && l.productId === s.productId) ||
            (s.materialId && l.materialId === s.materialId),
        );
      if (exists) continue;
      newLines.push(suggestionToLine(s));
    }
    if (newLines.length === 0) {
      toast({ title: "추가할 신규 품목이 없습니다" });
      return;
    }
    setLines((prev) => [
      ...prev.filter((l) => l.itemName || l.quantity > 0),
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
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const recalcLine = (l: QuoLine): QuoLine => {
    const gross = (l.quantity || 0) * (l.unitPrice || 0);
    const discount = gross * ((l.discountRate || 0) / 100);
    const amount = gross - discount;
    const taxAmount = Math.round(amount * 0.1);
    return { ...l, amount, taxAmount };
  };

  const updateLine = (id: string, patch: Partial<QuoLine>) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        return recalcLine({ ...l, ...patch });
      }),
    );
  };

  // 거래처별 단가 자동 적용
  const applyPartnerPrice = async (
    lineId: string,
    targetType: "material" | "product",
    itemId: number,
    itemName: string,
  ) => {
    if (!partnerId) return;
    try {
      const price = await utils.partnerPrice.resolvePrice.fetch({
        partnerId,
        targetType,
        ...(targetType === "material" ? { materialId: itemId } : { productId: itemId }),
      });
      if (price && price.unitPrice > 0) {
        updateLine(lineId, { unitPrice: price.unitPrice });
        toast({
          title: "거래처 단가 자동 적용",
          description: `${itemName}: ${price.unitPrice.toLocaleString()}원`,
        });
      }
    } catch {
      // 단가 없음 → 기본값 유지
    }
  };

  const handleSave = () => {
    if (!partnerId && !partnerName.trim()) {
      toast({ title: "거래처를 선택하거나 이름을 입력하세요", variant: "destructive" });
      return;
    }
    if (lines.some((l) => !l.itemName || l.quantity <= 0 || l.unitPrice < 0)) {
      toast({ title: "모든 품목의 품목명/수량/단가를 확인하세요", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      partnerId: partnerId || undefined,
      partnerName: partnerName || undefined,
      quoteDate,
      validUntil: validUntil || undefined,
      title: title || undefined,
      paymentTerms: paymentTerms || undefined,
      deliveryTerms: deliveryTerms || undefined,
      notes: notes || undefined,
      lines: lines.map((l) => ({
        targetType: l.targetType,
        materialId: l.materialId || undefined,
        productId: l.productId || undefined,
        itemName: l.itemName,
        itemCode: l.itemCode || undefined,
        description: l.description || undefined,
        quantity: l.quantity,
        unit: l.unit,
        unitPrice: l.unitPrice,
        discountRate: l.discountRate || undefined,
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
            <FileText className="h-5 w-5 text-indigo-600" />
            견적서 등록
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            고객에게 발송할 견적서를 작성합니다. 거래처별 단가가 자동 적용됩니다.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate("/dashboard/accounting/quotations")}
        >
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
              <div className="flex items-center justify-between">
                <Label className="text-xs">고객 *</Label>
                <button type="button" className="text-[10px] text-blue-600 hover:underline"
                  onClick={() => { setIsNewPartner(!isNewPartner); setPartnerId(null); setPartnerName(""); }}>
                  {isNewPartner ? "기존 거래처 선택" : "신규 거래처 직접 입력"}
                </button>
              </div>
              {isNewPartner ? (
                <input type="text" value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="거래처명 직접 입력 (미등록 업체)"
                  className="w-full h-10 px-3 border rounded-lg text-sm bg-amber-50 border-amber-300 focus:ring-2 focus:ring-amber-500/20" />
              ) : (
                <PartnerSearchInput
                  partnerType="customer"
                  selectedId={partnerId}
                  selectedName={partnerName}
                  onSelect={(id, name) => { setPartnerId(id); setPartnerName(name); }}
                  onClear={() => { setPartnerId(null); setPartnerName(""); }}
                  placeholder="고객 검색"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">견적일 *</Label>
              <Input
                type="date"
                value={quoteDate}
                onChange={(e) => setQuoteDate(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">유효기간</Label>
              <Input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <Label className="text-xs">견적 제목</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 2026년 1분기 식품 공급 견적"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">결제 조건</Label>
              <Input
                value={paymentTerms}
                onChange={(e) => setPaymentTerms(e.target.value)}
                placeholder="예: 월말 결제 30일"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">배송 조건</Label>
              <Input
                value={deliveryTerms}
                onChange={(e) => setDeliveryTerms(e.target.value)}
                placeholder="예: 본사 창고 인도"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 md:col-span-4">
              <Label className="text-xs">메모</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="특이사항 / 공지"
                rows={2}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase B: 자주 판매 품목 추천 패널 */}
      {partnerId && (suggestions as any[]).length > 0 && showSuggestions && (
        <Card className="border-2 border-violet-200 bg-gradient-to-br from-violet-50/50 to-indigo-50/30">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-600" />
                {partnerName} 에게 자주 판매한 품목
                <Badge variant="outline" className="text-[10px] bg-violet-100 text-violet-700">
                  AI 추천
                </Badge>
              </CardTitle>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                과거 견적/매출 이력 기반. 클릭 1번으로 라인 추가
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
              >
                ✕
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(suggestions as any[]).map((s: any, idx: number) => {
                const alreadyAdded = lines.some(
                  (l) =>
                    (s.productId && l.productId === s.productId) ||
                    (s.materialId && l.materialId === s.materialId),
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
                    title={`${s.purchaseCount}회 판매 · ${s.daysSinceLast}일 전 마지막 거래 · 평균 ${s.avgPrice?.toLocaleString()}원`}
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

              {/* 품목 타입 + 품목 선택 */}
              <div className="col-span-12 md:col-span-2">
                <Label className="text-[10px] text-muted-foreground">타입</Label>
                <Select
                  value={line.targetType}
                  onValueChange={(v) =>
                    updateLine(line.id, {
                      targetType: v as any,
                      materialId: null,
                      productId: null,
                      itemName: "",
                      itemCode: "",
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">{`${L("product")}`}</SelectItem>
                    <SelectItem value="material">{`${L("material")}`}</SelectItem>
                    <SelectItem value="service">서비스</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-12 md:col-span-4">
                <Label className="text-[10px] text-muted-foreground">품목 *</Label>
                {line.targetType === "service" ? (
                  <Input
                    value={line.itemName}
                    onChange={(e) => updateLine(line.id, { itemName: e.target.value })}
                    placeholder="서비스명 직접 입력"
                    className="h-9"
                  />
                ) : line.targetType === "material" ? (
                  <MaterialCombobox
                    selectedId={line.materialId}
                    selectedName={line.itemName}
                    itemTypes={["raw_material", "subsidiary", "external_product"]}
                    placeholder="품목 검색..."
                    onSelect={async (m) => {
                      updateLine(line.id, {
                        materialId: m.id,
                        productId: null,
                        itemName: m.materialName,
                        itemCode: m.materialCode,
                        unit: m.unit || line.unit,
                      });
                      await applyPartnerPrice(line.id, "material", m.id, m.materialName);
                    }}
                    onClear={() =>
                      updateLine(line.id, { materialId: null, itemName: "", itemCode: "" })
                    }
                  />
                ) : (
                  <ProductCombobox
                    selectedId={line.productId}
                    selectedName={line.itemName}
                    onSelect={async (p) => {
                      updateLine(line.id, {
                        productId: p.id,
                        materialId: null,
                        itemName: p.productName,
                        itemCode: p.productCode || "",
                      });
                      await applyPartnerPrice(line.id, "product", p.id, p.productName);
                    }}
                    onClear={() =>
                      updateLine(line.id, { productId: null, itemName: "", itemCode: "" })
                    }
                  />
                )}
              </div>

              <div className="col-span-4 md:col-span-1">
                <Label className="text-[10px] text-muted-foreground">수량 *</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={line.quantity || ""}
                  onChange={(e) =>
                    updateLine(line.id, { quantity: parseFloat(e.target.value) || 0 })
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

              <div className="col-span-4 md:col-span-1">
                <Label className="text-[10px] text-muted-foreground">할인%</Label>
                <Input
                  type="number"
                  value={line.discountRate || ""}
                  onChange={(e) =>
                    updateLine(line.id, { discountRate: parseFloat(e.target.value) || 0 })
                  }
                  min={0}
                  max={100}
                  step={0.01}
                  className="h-9 text-right"
                />
              </div>

              <div className="col-span-12 md:col-span-1 text-right">
                <Label className="text-[10px] text-muted-foreground">금액</Label>
                <div className="h-9 flex items-center justify-end pr-1 text-sm font-mono tabular-nums">
                  {Math.round(line.amount).toLocaleString()}원
                </div>
              </div>

              {/* 상세 설명 */}
              <div className="col-span-12">
                <Input
                  value={line.description}
                  onChange={(e) => updateLine(line.id, { description: e.target.value })}
                  placeholder="상세 설명/스펙 (선택)"
                  className="h-8 text-xs"
                />
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
                <span className="font-mono tabular-nums">
                  {Math.round(totals.amount).toLocaleString()}원
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">부가세</span>
                <span className="font-mono tabular-nums">
                  {Math.round(totals.tax).toLocaleString()}원
                </span>
              </div>
              <div className="flex items-center gap-4 text-base font-bold">
                <span>총액</span>
                <span className="font-mono tabular-nums text-indigo-600">
                  {Math.round(grandTotal).toLocaleString()}원
                </span>
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleSave}
              disabled={createMutation.isPending}
              className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMutation.isPending ? "저장 중..." : "견적서 저장 (작성 중)"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
