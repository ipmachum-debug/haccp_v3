import React, { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsTrigger, TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Package, TrendingUp, RotateCw, AlertCircle, Calendar, PackageMinus, PackagePlus, Settings, RefreshCw, Factory, ScanBarcode, Truck, Clock, ShieldCheck } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import LotTraceabilityModal from "@/components/LotTraceabilityModal";

/* ─── Extracted components ─── */
import { fmt, fmtDate, won, Empty, Loading, StatCard, StyledTable, TH, TD, SectionTitle } from "@/components/inventory/InventoryHelpers";
import { PartnerSearchInput } from "@/components/inventory/PartnerSearchInput";
import { MaterialSearchInput } from "@/components/inventory/MaterialSearchInput";
import { MaterialStockView } from "@/components/inventory/MaterialStockView";
import { ProductStockView, ProductReceiptInfo, ProductReleaseTab } from "@/components/inventory/ProductStockView";
import { ProductTrendCard, ProductTurnoverCard } from "@/components/inventory/ProductAnalytics";
import { PredictionTab } from "@/components/inventory/PredictionTab";

/* ═══════════════════════════════════════════════════
   메인 컴포넌트
   ═══════════════════════════════════════════════════ */
export default function InventoryManagement() {
  const [trendPeriod, setTrendPeriod] = useState<"week" | "month">("week");
  const [lotModalOpen, setLotModalOpen] = useState(false);
  const [inventoryView, setInventoryView] = useState<"material" | "product">("material");
  const isMat = inventoryView === "material";

  const { data: dashboard, isLoading: isLoadingDashboard } = trpc.inventory.getDashboard.useQuery();

  const trendDates = useMemo(() => {
    const end = new Date(), start = new Date();
    trendPeriod === "week" ? start.setDate(end.getDate() - 7) : start.setMonth(end.getMonth() - 1);
    return { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] };
  }, [trendPeriod]);

  const { data: trend, isLoading: isLoadingTrend } = trpc.inventory.getTrend.useQuery(trendDates);
  const { data: turnoverAnalysis, isLoading: isLoadingTurnover } = trpc.inventory.getTurnoverAnalysis.useQuery(trendDates);

  return (
    <DashboardLayout>
      <div className="space-y-4">

        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center shadow-sm">
              <Package className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight">재고 관리</h1>
              <p className="text-xs text-muted-foreground">원재료 · 제품 통합 재고 관리</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 세그먼트 토글 */}
            <div className="inline-flex items-center bg-gradient-to-r from-teal-600 to-emerald-600 rounded-lg p-0.5">
              <button onClick={() => setInventoryView("material")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  isMat ? "bg-white text-teal-700 shadow-sm" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                <Package className="h-3.5 w-3.5" />원재료
              </button>
              <button onClick={() => setInventoryView("product")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  !isMat ? "bg-white text-teal-700 shadow-sm" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                <Factory className="h-3.5 w-3.5" />제품
              </button>
            </div>
            {/* LOT 추적 */}
            <button onClick={() => setLotModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50/80 text-amber-700 hover:bg-amber-100 text-xs font-medium transition-all dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-700 dark:hover:bg-amber-900/50">
              <ScanBarcode className="h-3.5 w-3.5" />LOT 추적
            </button>
          </div>
        </div>

        {/* ── 탭 ── */}
        <Tabs defaultValue="current" className="space-y-3">
          <TabsList className="grid w-full grid-cols-8 h-9">
            <TabsTrigger value="current" className="text-xs gap-1 data-[state=active]:font-semibold"><Package className="h-3.5 w-3.5" />현황</TabsTrigger>
            <TabsTrigger value="release" className="text-xs gap-1 data-[state=active]:font-semibold"><PackageMinus className="h-3.5 w-3.5" />{isMat ? "소모" : "출고"}</TabsTrigger>
            <TabsTrigger value="receipt" className="text-xs gap-1 data-[state=active]:font-semibold"><PackagePlus className="h-3.5 w-3.5" />입고</TabsTrigger>
            <TabsTrigger value="trend" className="text-xs gap-1 data-[state=active]:font-semibold"><TrendingUp className="h-3.5 w-3.5" />추이</TabsTrigger>
            <TabsTrigger value="turnover" className="text-xs gap-1 data-[state=active]:font-semibold"><RotateCw className="h-3.5 w-3.5" />회전율</TabsTrigger>
            <TabsTrigger value="prediction" className="text-xs gap-1 data-[state=active]:font-semibold"><AlertCircle className="h-3.5 w-3.5" />예측</TabsTrigger>
            <TabsTrigger value="purchase" className="text-xs gap-1 data-[state=active]:font-semibold"><Calendar className="h-3.5 w-3.5" />발주</TabsTrigger>
            <TabsTrigger value="adjustment" className="text-xs gap-1 data-[state=active]:font-semibold"><Settings className="h-3.5 w-3.5" />조정</TabsTrigger>
          </TabsList>

          {/* ━━━ 재고현황 ━━━ */}
          <TabsContent value="current" className="space-y-5 mt-0">
            {isMat ? <MaterialStockView dashboard={dashboard} isLoading={isLoadingDashboard} />
                   : <ProductStockView />}
          </TabsContent>

          {/* ━━━ 출고 ━━━ */}
          <TabsContent value="release" className="space-y-5 mt-0">
            {isMat ? <ReleaseTab /> : <ProductReleaseTab />}
          </TabsContent>

          {/* ━━━ 입고 ━━━ */}
          <TabsContent value="receipt" className="space-y-5 mt-0">
            {isMat ? <ReceiptTab /> : <ProductReceiptInfo />}
          </TabsContent>

          {/* ━━━ 추이 ━━━ */}
          <TabsContent value="trend" className="mt-0">
            {isMat ? (
              <Card>
                <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
                  <div className="flex items-center justify-between">
                    <SectionTitle icon={TrendingUp} title="원재료 재고 이동 추이" desc="일별 입고/소모/조정" />
                    <Select value={trendPeriod} onValueChange={(v) => setTrendPeriod(v as any)}>
                      <SelectTrigger className="w-32 h-10 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">최근 7일</SelectItem>
                        <SelectItem value="month">최근 30일</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  {isLoadingTrend ? <Loading /> : !trend?.length ? <Empty text="선택 기간에 데이터 없음" /> : (
                    <StyledTable>
                      <TableHeader>
                        <TableRow>
                          <TH>일자</TH>
                          <TH>입고</TH>
                          <TH>소모</TH>
                          <TH>조정</TH>
                          <TH>순변동</TH>
                          <TH className="text-center">건수</TH>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {trend.map((r: any) => (
                          <TableRow key={r.date} className="hover:bg-muted/30">
                            <TD className="font-mono">{r.date}</TD>
                            <TD className="text-emerald-600 dark:text-emerald-400 font-medium">+{fmt(r.receiptQuantity)}</TD>
                            <TD className="text-red-500 dark:text-red-400 font-medium">-{fmt(r.usageQuantity)}</TD>
                            <TD>{fmt(r.adjustmentQuantity)}</TD>
                            <TD>
                              <Badge variant={Number(r.netChange || 0) >= 0 ? "default" : "secondary"} className="text-xs px-2.5 py-1 font-mono">
                                {Number(r.netChange || 0) >= 0 ? "+" : ""}{fmt(r.netChange)}
                              </Badge>
                            </TD>
                            <TD className="text-center">{r.transactionCount}</TD>
                          </TableRow>
                        ))}
                      </TableBody>
                    </StyledTable>
                  )}
                </CardContent>
              </Card>
            ) : (
              <ProductTrendCard trendDates={trendDates} trendPeriod={trendPeriod} setTrendPeriod={setTrendPeriod} />
            )}
          </TabsContent>

          {/* ━━━ 회전율 ━━━ */}
          <TabsContent value="turnover" className="mt-0">
            {isMat ? (
              <Card>
                <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
                  <SectionTitle icon={RotateCw} title="원재료별 회전율" desc={trendPeriod === "week" ? "최근 7일" : "최근 30일"} />
                </CardHeader>
                <CardContent className="p-3">
                  {isLoadingTurnover ? <Loading /> : !turnoverAnalysis?.length ? <Empty text="데이터 없음" /> : (
                    <StyledTable>
                      <TableHeader>
                        <TableRow>
                          <TH>원재료</TH>
                          <TH>소모량</TH>
                          <TH>재고</TH>
                          <TH>회전율</TH>
                          <TH>재고일수</TH>
                          <TH>효율</TH>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {turnoverAnalysis.map((m: any) => (
                          <TableRow key={m.materialId} className="hover:bg-muted/30">
                            <TD>
                              <span className="font-medium">{m.materialName}</span>
                              <span className="text-muted-foreground ml-2 text-xs">{m.materialCode}</span>
                            </TD>
                            <TD>{fmt(m.usageQuantity)}</TD>
                            <TD>{fmt(m.averageInventory)}</TD>
                            <TD>
                              <Badge variant={m.turnoverRate >= 1 ? "default" : "secondary"} className="text-xs px-2.5 py-1">
                                {m.turnoverRate.toFixed(2)}
                              </Badge>
                            </TD>
                            <TD>{m.averageHoldingPeriod.toFixed(0)}일</TD>
                            <TD>
                              <span className={`font-semibold ${m.efficiency === "양호" ? "text-emerald-600" : m.efficiency === "적정" ? "text-blue-600" : "text-amber-600"}`}>
                                {m.efficiency}
                              </span>
                            </TD>
                          </TableRow>
                        ))}
                      </TableBody>
                    </StyledTable>
                  )}
                </CardContent>
              </Card>
            ) : (
              <ProductTurnoverCard trendDates={trendDates} trendPeriod={trendPeriod} />
            )}
          </TabsContent>

          {/* ━━━ 예측 ━━━ */}
          <TabsContent value="prediction" className="mt-0">
            {isMat ? <PredictionTab /> : (
              <Card><CardContent className="py-20 text-center text-muted-foreground">
                <Factory className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">제품 재고 예측은 생산계획 기반으로 운영됩니다.</p>
                <p className="text-sm mt-2 opacity-70">파이프라인 → 생산계획에서 확인하세요.</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ━━━ 발주 ━━━ */}
          <TabsContent value="purchase" className="mt-0">
            {isMat ? <PurchaseOrderTab /> : (
              <Card><CardContent className="py-20 text-center text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">제품은 자동 발주 대상이 아닙니다.</p>
                <p className="text-sm mt-2 opacity-70">OEM 제품 발주는 거래처 관리에서 처리하세요.</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ━━━ 조정 ━━━ */}
          <TabsContent value="adjustment" className="mt-0">
            <AdjustmentTab isMat={isMat} />
          </TabsContent>
        </Tabs>

        <LotTraceabilityModal open={lotModalOpen} onOpenChange={setLotModalOpen} />
      </div>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════════════
   발주 제안 (원재료 전용)
   ═══════════════════════════════════════════════════ */
function PurchaseOrderTab() {
  const [days, setDays] = useState(30);
  const utils = trpc.useUtils();
  const { data: suggs, isLoading } = trpc.inventory.getPurchaseOrderSuggestions.useQuery({ days });
  const approveMut = trpc.inventory.approvePurchaseOrder.useMutation({ onSuccess: () => { utils.inventory.getPurchaseOrderSuggestions.invalidate(); alert("승인됨"); } });
  const rejectMut = trpc.inventory.rejectPurchaseOrder.useMutation({ onSuccess: () => { utils.inventory.getPurchaseOrderSuggestions.invalidate(); alert("거부됨"); } });

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Calendar} title="자동 발주 제안" desc="재고 예측 기반 최적 발주" />
          <Select value={days.toString()} onValueChange={(v) => setDays(+v)}>
            <SelectTrigger className="w-28 h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[7,14,30,60].map(d => <SelectItem key={d} value={d.toString()}>{d}일</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? <Loading /> : !suggs?.length ? <Empty text="발주 필요 원재료 없음" /> : (
          <StyledTable>
            <TableHeader><TableRow>
              <TH>원재료</TH><TH>현재고</TH><TH>권장발주</TH>
              <TH className="text-right">비용</TH><TH className="text-center">우선</TH><TH className="text-center w-32">작업</TH>
            </TableRow></TableHeader>
            <TableBody>
              {suggs.map((s: any) => (
                <TableRow key={s.materialId} className="hover:bg-muted/30">
                  <TD>
                    <span className="font-medium">{s.materialName}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{s.materialCode}</span>
                  </TD>
                  <TD className="font-mono">{fmt(s.currentStock)} {s.unit}</TD>
                  <TD className="font-mono font-medium">{fmt(s.recommendedOrderQuantity)} {s.unit}</TD>
                  <TD className="text-right text-muted-foreground">{won(s.recommendedOrderQuantity * 1000)}</TD>
                  <TD className="text-center">
                    <Badge variant={s.priority === "urgent" ? "destructive" : "outline"} className="text-xs px-2.5 py-1">
                      {s.priority === "urgent" ? "긴급" : "보통"}
                    </Badge>
                  </TD>
                  <TD className="text-center">
                    <div className="flex gap-2 justify-center">
                      <Button size="sm" className="h-9 text-sm px-4" onClick={() => { if(confirm("승인?")) approveMut.mutate({ materialId: s.materialId, quantity: s.recommendedOrderQuantity }); }}>승인</Button>
                      <Button size="sm" variant="ghost" className="h-9 text-sm px-4 text-muted-foreground" onClick={() => { const r = prompt("거부 사유:"); if(r !== null) rejectMut.mutate({ materialId: s.materialId, reason: r || undefined }); }}>거부</Button>
                    </div>
                  </TD>
                </TableRow>
              ))}
            </TableBody>
          </StyledTable>
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════
   원재료 수동 소모 (폐기/기타) — BOM 자동소모 안내
   ═══════════════════════════════════════════════════ */
function ReleaseTab() {
  const utils = trpc.useUtils();
  const today = new Date().toISOString().split("T")[0];
  const [releaseDate, setReleaseDate] = useState(today);
  const [releaseType, setReleaseType] = useState("disposal");
  const [memo, setMemo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [submitProgress, setSubmitProgress] = useState<{ current: number; total: number } | null>(null);

  interface RI { id: number; lotId: string; materialName: string; availableQty: string; quantity: string; unit: string; unitPrice: string; amount: string; expiryDate: string; lotNumber: string; }
  const emptyRItem = (): RI => ({ id: Date.now() + Math.random(), lotId: "", materialName: "", availableQty: "", quantity: "", unit: "", unitPrice: "0", amount: "0", expiryDate: "", lotNumber: "" });
  const [items, setItems] = useState<RI[]>([emptyRItem()]);
  const [hStart, setHStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; });
  const [hEnd, setHEnd] = useState(today);

  const { data: lots, isLoading: lotsLoading } = trpc.inventory.list.useQuery();
  const { data: history, isLoading: hLoading } = trpc.inventory.getOutboundHistory.useQuery({ limit: 50, startDate: hStart, endDate: hEnd });
  const mut = trpc.inventory.releaseStock.useMutation({
    onSuccess: () => { utils.inventory.list.invalidate(); utils.inventory.getDashboard.invalidate(); utils.inventory.getOutboundHistory.invalidate(); },
    onError: (e: any) => alert(`소모 처리 실패: ${e.message}`),
  });

  // 가용 재고가 있는 LOT만 필터, FEFO 순서
  const availableLots = useMemo(() => {
    if (!lots) return [];
    const selectedIds = new Set(items.map(i => i.lotId));
    return (lots as any[])
      .filter((l: any) => parseFloat(l.availableQuantity) > 0 || selectedIds.has(l.id.toString()))
      .sort((a: any, b: any) => {
        if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        if (a.expiryDate) return -1;
        if (b.expiryDate) return 1;
        return 0;
      });
  }, [lots, items]);

  const getAvailableLotsForItem = (currentItemId: number) => {
    const selectedIds = new Set(items.filter(i => i.id !== currentItemId && i.lotId).map(i => i.lotId));
    return availableLots.filter((l: any) => !selectedIds.has(l.id.toString()));
  };

  const isExpiringSoon = (dateStr: string) => {
    if (!dateStr) return false;
    const diff = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  };
  const isExpired = (dateStr: string) => {
    if (!dateStr) return false;
    return new Date(dateStr).getTime() < Date.now();
  };
  const daysUntilExpiry = (dateStr: string) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const handleLotChange = (itemId: number, lotIdStr: string) => {
    const lot = (lots as any[])?.find((l: any) => l.id.toString() === lotIdStr);
    setItems(p => p.map(i => i.id === itemId ? { ...i, lotId: lotIdStr, materialName: lot?.materialName || "", availableQty: lot?.availableQuantity || "0", unit: lot?.unit || "", unitPrice: lot?.unitPrice || "0", expiryDate: lot?.expiryDate || "", lotNumber: lot?.lotNumber || "", quantity: "", amount: "0" } : i));
  };
  const handleQty = (id: number, q: string) => setItems(p => p.map(i => i.id === id ? { ...i, quantity: q, amount: q && i.unitPrice ? (parseFloat(q) * parseFloat(i.unitPrice)).toFixed(0) : "0" } : i));
  const handlePrice = (id: number, pr: string) => setItems(p => p.map(i => i.id === id ? { ...i, unitPrice: pr, amount: i.quantity && pr ? (parseFloat(i.quantity) * parseFloat(pr)).toFixed(0) : "0" } : i));
  const addItem = () => setItems(p => [...p, emptyRItem()]);
  const removeItem = (id: number) => { if (items.length > 1) setItems(p => p.filter(i => i.id !== id)); };
  const totalQty = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
  const totalAmt = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const filledItems = items.filter(i => i.lotId && i.quantity && parseFloat(i.quantity) > 0);
  const hasOverflow = items.some(i => i.lotId && i.quantity && i.availableQty && parseFloat(i.quantity) > parseFloat(i.availableQty) && parseFloat(i.availableQty) > 0);

  const filteredHistory = useMemo(() => {
    if (!history) return [];
    let list = history as any[];
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = list.filter(r => r.materialName?.toLowerCase().includes(q) || r.lotNumber?.toLowerCase().includes(q) || r.notes?.toLowerCase().includes(q));
    }
    return list;
  }, [history, historySearch]);

  const handleSubmit = async () => {
    if (!filledItems.length) { alert("소모할 품목을 선택하고 수량을 입력해주세요."); return; }
    if (!releaseDate) { alert("일자를 선택해주세요."); return; }
    for (const i of filledItems) {
      if (parseFloat(i.availableQty) > 0 && parseFloat(i.quantity) > parseFloat(i.availableQty)) {
        alert(`${i.materialName}: 가용 재고(${parseFloat(i.availableQty).toFixed(1)})를 초과했습니다.`); return;
      }
    }
    const typeLabel = releaseType === "disposal" ? "폐기" : releaseType === "sample" ? "샘플" : "기타";
    const details = filledItems.map(i => `  - ${i.materialName} (${i.lotNumber}) ${i.quantity} ${i.unit}`).join("\n");
    if (!confirm(`[${typeLabel}] 원재료 소모 (${filledItems.length}건)\n\n${details}\n\n총 수량: ${totalQty.toFixed(2)}\n\n※ 재고에서 차감됩니다.\n진행하시겠습니까?`)) return;
    try {
      setSubmitProgress({ current: 0, total: filledItems.length });
      for (let idx = 0; idx < filledItems.length; idx++) {
        const i = filledItems[idx];
        setSubmitProgress({ current: idx + 1, total: filledItems.length });
        await mut.mutateAsync({ lotId: parseInt(i.lotId), quantity: parseFloat(i.quantity), releaseDate, reason: [typeLabel, memo].filter(Boolean).join(" | ") });
      }
      setSubmitProgress(null);
      alert(`${filledItems.length}건 소모 처리 완료`);
      setItems([emptyRItem()]); setMemo("");
    } catch { setSubmitProgress(null); }
  };

  return (
    <div className="space-y-5">
      {/* BOM 자동 소모 안내 */}
      <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 shrink-0">
              <Factory className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">생산 투입 시 원재료 자동 소모</h4>
              <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
                배치 생산 시 BOM(레시피)에 등록된 원재료가 <strong>자동으로 재고에서 차감</strong>됩니다.<br/>
                이 탭은 <strong>폐기, 샘플 출고, 기타 수동 소모</strong> 처리에 사용하세요.
              </p>
              <div className="flex gap-3 mt-2 text-[10px]">
                <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1"><ShieldCheck className="h-3 w-3" />생산투입 = BOM 자동 차감</span>
                <span className="text-orange-600 dark:text-orange-400 font-medium flex items-center gap-1"><PackageMinus className="h-3 w-3" />폐기/기타 = 수동 처리</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <SectionTitle icon={PackageMinus} title="원재료 수동 소모" desc="폐기/샘플/기타 (FEFO 순)" />
            <div className="flex items-center gap-2">
              {availableLots.length > 0 && (
                <Badge variant="outline" className="text-xs px-2 py-1 text-blue-600 border-blue-300">
                  가용 LOT {availableLots.length}건
                </Badge>
              )}
              <Button className="h-9 text-xs px-4" variant={showForm ? "secondary" : "default"} onClick={() => setShowForm(!showForm)}>
                <PackageMinus className="h-3.5 w-3.5 mr-1.5" />{showForm ? "접기" : "소모 등록"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showForm && (
          <CardContent className="px-4 pb-4 pt-4 border-b bg-orange-50/20 dark:bg-orange-950/10">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">일자 <span className="text-red-500">*</span></label>
                <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} max={today}
                  className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">소모 유형 <span className="text-red-500">*</span></label>
                <Select value={releaseType} onValueChange={setReleaseType}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="disposal">폐기</SelectItem>
                    <SelectItem value="sample">샘플 출고</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">사유/메모</label>
                <input type="text" value={memo} onChange={e => setMemo(e.target.value)} maxLength={200}
                  className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400 transition" placeholder="소모 사유 입력" />
              </div>
            </div>

            {lotsLoading ? <Loading /> : !availableLots.length ? (
              <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/10">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">가용 재고 LOT가 없습니다</p>
                <p className="text-xs mt-1.5 opacity-60">입고 등록 후 LOT가 생성되면 소모 처리할 수 있습니다.</p>
              </div>
            ) : (
              <>
                <StyledTable>
                  <TableHeader><TableRow>
                    <TH className="w-10 text-center">No</TH>
                    <TH className="min-w-[200px]">LOT <span className="text-red-500">*</span></TH>
                    <TH>품명</TH>
                    <TH className="text-center w-20">유효기한</TH>
                    <TH className="text-right w-20">가용</TH>
                    <TH className="text-right w-24">수량 <span className="text-red-500">*</span></TH>
                    <TH className="text-center w-14">단위</TH>
                    <TH className="w-10"></TH>
                  </TableRow></TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      const qtyOver = item.lotId && item.quantity && item.availableQty && parseFloat(item.quantity) > parseFloat(item.availableQty) && parseFloat(item.availableQty) > 0;
                      const expSoon = isExpiringSoon(item.expiryDate);
                      const expired = isExpired(item.expiryDate);
                      const lotOptions = getAvailableLotsForItem(item.id);
                      const dLeft = daysUntilExpiry(item.expiryDate);
                      return (
                        <TableRow key={item.id} className={qtyOver ? "bg-red-50/50 dark:bg-red-950/20" : expired ? "bg-red-50/30 dark:bg-red-950/10" : expSoon ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}>
                          <TD className="text-center text-muted-foreground">{idx+1}</TD>
                          <TD className="py-1.5">
                            <Select value={item.lotId} onValueChange={v => handleLotChange(item.id, v)}>
                              <SelectTrigger className={`h-9 text-xs ${!item.lotId ? "border-dashed" : ""}`}><SelectValue placeholder="LOT를 선택하세요" /></SelectTrigger>
                              <SelectContent>{lotOptions.map((l: any) => (
                                <SelectItem key={l.id} value={l.id.toString()}>
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="font-mono font-medium">{l.lotNumber}</span>
                                    <span className="text-muted-foreground">- {l.materialName}</span>
                                    <span className="text-emerald-600">({l.availableQuantity} {l.unit})</span>
                                    {l.expiryDate && isExpired(l.expiryDate) && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">만료</Badge>}
                                    {l.expiryDate && isExpiringSoon(l.expiryDate) && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">임박</Badge>}
                                  </div>
                                </SelectItem>
                              ))}</SelectContent>
                            </Select>
                            {item.lotNumber && <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">LOT: {item.lotNumber}</p>}
                          </TD>
                          <TD className="font-medium text-xs">{item.materialName || <span className="text-muted-foreground italic">LOT 선택 필요</span>}</TD>
                          <TD className="text-center text-xs">
                            {item.expiryDate ? (
                              <span className={expired ? "text-red-500 font-bold" : expSoon ? "text-amber-500 font-medium" : "text-muted-foreground"}>
                                {fmtDate(item.expiryDate)}
                                {expired && <span className="block text-[10px]">만료</span>}
                                {!expired && expSoon && dLeft !== null && <span className="block text-[10px]">D-{dLeft}</span>}
                              </span>
                            ) : "-"}
                          </TD>
                          <TD className="text-right text-xs">{item.availableQty ? <span className={parseFloat(item.availableQty)<=0?"text-red-500 font-medium":"text-emerald-600 font-medium"}>{parseFloat(item.availableQty).toFixed(1)}</span> : "-"}</TD>
                          <TD className="py-1.5">
                            <input type="number" step="0.01" min="0" value={item.quantity} onChange={e => handleQty(item.id, e.target.value)} placeholder="0" disabled={!item.lotId}
                              className={`w-full h-9 px-2 border rounded-lg text-xs text-right bg-background transition ${!item.lotId ? "opacity-50 cursor-not-allowed" : qtyOver ? "border-red-400 bg-red-50/50 text-red-600 dark:bg-red-950/30" : "focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"}`} />
                            {qtyOver && <p className="text-[10px] text-red-500 mt-0.5 text-right font-medium">재고 초과!</p>}
                          </TD>
                          <TD className="text-center text-xs text-muted-foreground">{item.unit || "-"}</TD>
                          <TD className="text-center py-1.5">{items.length>1 && <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 text-sm transition-colors" title="삭제">X</button>}</TD>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/30 font-medium border-t-2">
                      <TD colSpan={5} className="text-right text-xs font-semibold">합계</TD>
                      <TD className="text-right text-xs font-mono font-bold text-orange-700 dark:text-orange-400">{totalQty>0?totalQty.toFixed(2):"-"}</TD>
                      <TD colSpan={2}></TD>
                    </TableRow>
                  </TableBody>
                </StyledTable>

                <div className="flex items-center justify-between mt-4">
                  <Button variant="outline" size="sm" onClick={addItem} className="h-9 text-xs px-4"><PackageMinus className="h-3.5 w-3.5 mr-1.5" />품목 추가</Button>
                  <div className="flex items-center gap-3">
                    {filledItems.length > 0 && (
                      <span className="text-xs text-muted-foreground">{filledItems.length}건 선택됨</span>
                    )}
                    <Button size="sm" onClick={handleSubmit} disabled={mut.isPending || !filledItems.length || hasOverflow || !!submitProgress}
                      className="h-9 text-xs px-5 min-w-[120px] bg-orange-600 hover:bg-orange-700">
                      {submitProgress ? `처리 중 (${submitProgress.current}/${submitProgress.total})` : mut.isPending ? "처리 중..." : `소모 저장${filledItems.length > 0 ? ` (${filledItems.length}건)` : ""}`}
                    </Button>
                  </div>
                </div>

                {(hasOverflow || items.some(i => i.lotId && isExpired(i.expiryDate))) && (
                  <div className="mt-3 p-2.5 rounded-lg border border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700">
                    {hasOverflow && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" />가용 재고를 초과한 품목이 있습니다.</p>}
                    {items.some(i => i.lotId && isExpired(i.expiryDate)) && <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-1"><Clock className="h-3.5 w-3.5" />유효기한 만료 LOT가 포함되어 있습니다.</p>}
                  </div>
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* 소모 이력 */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionTitle icon={Clock} title="소모/투입 이력" desc={filteredHistory.length > 0 ? `${filteredHistory.length}건` : undefined} />
            <div className="flex items-center gap-2 flex-wrap">
              <input type="text" value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="품명/LOT/사유 검색" className="h-8 w-40 px-2.5 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-orange-500/20 transition" />
              <input type="date" value={hStart} onChange={e => setHStart(e.target.value)} className="h-8 px-2 border rounded-lg text-xs bg-background" />
              <span className="text-xs text-muted-foreground">~</span>
              <input type="date" value={hEnd} onChange={e => setHEnd(e.target.value)} className="h-8 px-2 border rounded-lg text-xs bg-background" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {hLoading ? <Loading /> : !filteredHistory.length ? <Empty text="소모 이력 없음" /> : (
            <div className="overflow-x-auto">
              <StyledTable>
                <TableHeader><TableRow>
                  <TH className="w-10 text-center">No</TH>
                  <TH>일시</TH><TH>품명</TH><TH>LOT</TH>
                  <TH className="text-right">수량</TH><TH>사유</TH>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredHistory.map((r: any, i: number) => (
                    <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                      <TD className="text-center text-muted-foreground">{i+1}</TD>
                      <TD className="text-muted-foreground whitespace-nowrap">{fmtDate(r.createdAt)}</TD>
                      <TD className="font-medium">{r.materialName || "-"}</TD>
                      <TD className="font-mono text-xs">{r.lotNumber || "-"}</TD>
                      <TD className="text-right font-mono font-medium whitespace-nowrap">{r.quantity} {r.unit}</TD>
                      <TD className="text-muted-foreground truncate max-w-[250px]">{r.notes || "-"}</TD>
                    </TableRow>
                  ))}
                </TableBody>
              </StyledTable>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   원재료 입고 탭 (LOT 자동생성)
   ═══════════════════════════════════════════════════ */
function ReceiptTab() {
  const utils = trpc.useUtils();
  const today = new Date().toISOString().split("T")[0];
  const [matId, setMatId] = useState<number | null>(null); const [matName, setMatName] = useState(""); const [qty, setQty] = useState(""); const [unit, setUnit] = useState("kg");
  const [price, setPrice] = useState(""); const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null); const [selectedSupplierName, setSelectedSupplierName] = useState(""); const [expiry, setExpiry] = useState("");
  const [rcptDate, setRcptDate] = useState(today); const [notes, setNotes] = useState(""); const [showForm, setShowForm] = useState(false);
  const [matCode, setMatCode] = useState("");

  const { data: _raw } = trpc.material.list.useQuery({ limit: 9999 });
  const mats: any[] = (_raw as any)?.items ?? (Array.isArray(_raw) ? _raw : []);
  const { data: receipts, isLoading } = trpc.inventory.getInboundHistory.useQuery({ limit: 50 });

  const createMut = trpc.lotManagement.createReceivingWithLot.useMutation({
    onSuccess: (r: any) => { utils.inventory.getInboundHistory.invalidate(); utils.inventory.list.invalidate(); utils.inventory.getDashboard.invalidate();
      const purchaseMsg = r.accountingPurchaseCreated ? "\n(매입전표 자동 생성됨)" : "";
      alert(`입고 완료! LOT: ${r.lotNumber}${purchaseMsg}`); setMatId(null); setMatName(""); setMatCode(""); setQty(""); setPrice(""); setSelectedSupplierId(null); setSelectedSupplierName(""); setExpiry(""); setNotes(""); setShowForm(false); },
    onError: (e: any) => alert(`실패: ${e.message}`),
  });
  const backfillMut = trpc.lotManagement.backfillLots.useMutation({
    onSuccess: (r: any) => { utils.inventory.getInboundHistory.invalidate(); utils.inventory.list.invalidate(); alert(`LOT 일괄 생성: ${r?.created || 0}건`); },
    onError: (e: any) => alert(`실패: ${e.message}`),
  });

  const totalAmount = (parseFloat(qty) || 0) * (parseFloat(price) || 0);

  const handleSubmit = () => {
    if (!matId || !qty) { alert("원재료와 수량은 필수입니다."); return; }
    createMut.mutate({
      materialId: matId,
      materialCode: matCode || `M${matId}`,
      quantity: parseFloat(qty),
      unit,
      unitPrice: price ? parseFloat(price) : undefined,
      partnerId: selectedSupplierId || undefined,
      supplierName: selectedSupplierName || undefined,
      expiryDate: expiry || undefined,
      receiptDate: rcptDate || undefined,
      notes: notes || undefined
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <SectionTitle icon={PackagePlus} title="원재료 입고 (LOT 자동생성)" desc="입고 시 LOT 자동 + 매입전표 연동" />
            <div className="flex gap-2">
              <Button variant="outline" className="h-9 text-xs px-4" disabled={backfillMut.isPending}
                onClick={() => { if(confirm("기존 데이터 LOT 일괄 생성?")) backfillMut.mutate(); }}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${backfillMut.isPending?"animate-spin":""}`} />LOT 일괄
              </Button>
              <Button className="h-9 text-xs px-4" onClick={() => setShowForm(!showForm)}>
                <PackagePlus className="h-3.5 w-3.5 mr-1.5" />{showForm ? "접기" : "입고 등록"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showForm && (
          <CardContent className="px-4 pb-4 pt-4 border-b bg-emerald-50/20 dark:bg-emerald-950/10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <div>
                <MaterialSearchInput
                  selectedId={matId}
                  selectedName={matName}
                  onSelect={(id, name, data) => { setMatId(id); setMatName(name); setMatCode(data?.materialCode || `M${id}`); if (data?.unit) setUnit(data.unit); }}
                  onClear={() => { setMatId(null); setMatName(""); setMatCode(""); }}
                  required
                  label="원재료"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">수량 <span className="text-red-500">*</span></label>
                <input type="number" step="0.01" min="0.01" value={qty} onChange={e=>setQty(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-emerald-500/20 transition" placeholder="0" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">단위</label>
                <Select value={unit} onValueChange={setUnit}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{["kg","g","L","mL","EA","BOX"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">단가 (원)</label>
                <input type="number" step="1" min="0" value={price} onChange={e=>setPrice(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-emerald-500/20 transition" placeholder="0" />
                {totalAmount > 0 && <p className="text-[10px] text-emerald-600 mt-0.5">총액: {won(totalAmount)}</p>}
              </div>
              <div>
                <PartnerSearchInput
                  partnerType="supplier"
                  selectedId={selectedSupplierId}
                  selectedName={selectedSupplierName}
                  onSelect={(id, name) => { setSelectedSupplierId(id); setSelectedSupplierName(name); }}
                  onClear={() => { setSelectedSupplierId(null); setSelectedSupplierName(""); }}
                  required={parseFloat(price) > 0}
                  label="공급업체 (거래처)"
                  placeholder="공급업체 검색 (사업자번호, 회사명)"
                />
                {parseFloat(price) > 0 && !selectedSupplierId && (
                  <p className="text-[10px] text-amber-500 mt-0.5">매입전표 생성 시 거래처 지정 권장</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">입고일</label>
                <input type="date" value={rcptDate} onChange={e=>setRcptDate(e.target.value)} max={today} className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-emerald-500/20 transition" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">소비기한</label>
                <input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-emerald-500/20 transition" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">비고</label>
                <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} maxLength={200} className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-emerald-500/20 transition" placeholder="비고" />
              </div>
            </div>
            {/* 미리보기 + 안내 */}
            {matId && qty && (
              <div className="p-3 rounded-lg border bg-muted/20 mb-4 flex items-center gap-4 flex-wrap text-xs">
                <span className="font-medium">{matName}</span>
                <span className="font-mono">{qty} {unit}</span>
                {parseFloat(price) > 0 && <span className="text-emerald-600">x {won(price)} = <strong>{won(totalAmount)}</strong></span>}
                {parseFloat(price) > 0 && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-emerald-400 text-emerald-600">
                    <ShieldCheck className="h-3 w-3 mr-1" />매입전표 자동생성
                  </Badge>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending || !matId || !qty} className="h-9 text-xs px-5 bg-emerald-600 hover:bg-emerald-700">
                {createMut.isPending ? "처리 중..." : "입고 저장 (LOT 자동)"}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <SectionTitle icon={Clock} title="입고 내역" />
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? <Loading /> : !receipts?.length ? <Empty text="입고 내역 없음" /> : (
            <div className="overflow-x-auto">
              <StyledTable>
                <TableHeader><TableRow>
                  <TH>입고일</TH><TH>LOT</TH><TH>원재료</TH>
                  <TH className="text-right">수량</TH><TH className="text-right">단가</TH><TH>공급업체</TH><TH>소비기한</TH>
                </TableRow></TableHeader>
                <TableBody>
                  {receipts.map((r: any) => (
                    <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                      <TD className="text-muted-foreground whitespace-nowrap">{fmtDate(r.createdAt)}</TD>
                      <TD className="font-mono text-xs font-medium">{r.lotNumber || "-"}</TD>
                      <TD>{r.materialName} <span className="text-muted-foreground text-xs">{r.materialCode}</span></TD>
                      <TD className="text-right font-mono">{r.quantity} {r.unit}</TD>
                      <TD className="text-right text-xs">{r.unitPrice ? won(r.unitPrice) : "-"}</TD>
                      <TD className="text-muted-foreground">{r.supplierName || "-"}</TD>
                      <TD className="text-muted-foreground">{fmtDate(r.expiryDate)}</TD>
                    </TableRow>
                  ))}
                </TableBody>
              </StyledTable>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   재고 조정 탭
   ═══════════════════════════════════════════════════ */
function AdjustmentTab({ isMat }: { isMat: boolean }) {
  const [lotId, setLotId] = useState<number | null>(null);
  const [adjType, setAdjType] = useState<"increase" | "decrease">("increase");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const { data: lots } = trpc.inventory.list.useQuery();
  const mut = trpc.inventory.adjustStock.useMutation({
    onSuccess: (r: any) => { utils.inventory.list.invalidate(); utils.inventory.getDashboard.invalidate(); alert(r?.message || "조정 완료"); setLotId(null); setQty(""); setReason(""); },
    onError: (e: any) => alert(`실패: ${e.message}`),
  });

  const selectedLot = lots?.find((l: any) => l.id === lotId) as any;
  const currentQty = selectedLot ? parseFloat(selectedLot.availableQuantity || 0) : 0;
  const changeAmt = parseFloat(qty) || 0;
  const previewQty = adjType === "increase" ? currentQty + changeAmt : Math.max(0, currentQty - changeAmt);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotId || !qty || !reason) { alert("LOT, 수량, 사유를 모두 입력해주세요."); return; }
    if (changeAmt <= 0) { alert("수량은 0보다 커야 합니다."); return; }
    const lotInfo = selectedLot ? `${selectedLot.lotNumber} (${selectedLot.materialName})` : `LOT #${lotId}`;
    if (confirm(`[${adjType === "increase" ? "증가" : "감소"}] ${lotInfo}\n\n현재: ${currentQty.toFixed(1)} ${selectedLot?.unit || ""}\n변경: ${adjType === "increase" ? "+" : "-"}${changeAmt.toFixed(1)}\n결과: ${previewQty.toFixed(1)} ${selectedLot?.unit || ""}\n\n사유: ${reason}\n\n진행하시겠습니까?`))
      mut.mutate({ lotId, quantityChange: adjType === "increase" ? changeAmt : -changeAmt, reason });
  };

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle icon={Settings} title={`${isMat ? "원재료" : "제품"} 재고 조정`} desc="재고 실사, 오류 보정 등 수동 조정" />
      </CardHeader>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">LOT 선택 <span className="text-red-500">*</span></label>
              <Select value={lotId?.toString() || ""} onValueChange={v => setLotId(parseInt(v))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="LOT 선택" /></SelectTrigger>
                <SelectContent>{lots?.map((l: any) => (
                  <SelectItem key={l.id} value={l.id.toString()}>
                    <span className="text-xs">{l.lotNumber} - {l.materialName} ({l.availableQuantity} {l.unit})</span>
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">조정 유형 <span className="text-red-500">*</span></label>
              <Select value={adjType} onValueChange={(v: any) => setAdjType(v)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">증가 (+)</SelectItem>
                  <SelectItem value="decrease">감소 (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">변경 수량 <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" min="0.01" value={qty} onChange={e => setQty(e.target.value)}
                className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 transition" placeholder="변경할 수량" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">사유 <span className="text-red-500">*</span></label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} maxLength={200}
                className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 transition" placeholder="조정 사유 (필수)" required />
            </div>
          </div>

          {/* 미리보기 */}
          {selectedLot && changeAmt > 0 && (
            <div className="p-3 rounded-lg border bg-muted/20 flex items-center gap-4 flex-wrap">
              <div className="text-xs">
                <span className="text-muted-foreground">LOT:</span> <span className="font-mono font-medium">{selectedLot.lotNumber}</span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">현재:</span> <span className="font-mono font-medium">{currentQty.toFixed(1)} {selectedLot.unit}</span>
              </div>
              <div className="text-xs">
                <span className={adjType === "increase" ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                  {adjType === "increase" ? "+" : "-"}{changeAmt.toFixed(1)}
                </span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">결과:</span> <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{previewQty.toFixed(1)} {selectedLot.unit}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={mut.isPending || !lotId || !qty || !reason} className="h-9 text-xs px-5">
              {mut.isPending ? "처리 중..." : "조정 처리"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
