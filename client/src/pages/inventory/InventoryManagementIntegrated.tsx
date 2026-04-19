import React, { useState, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsTrigger, TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, RotateCw, AlertCircle, Calendar, PackageMinus, PackagePlus, Settings, RefreshCw, Factory, ScanBarcode, Truck, Clock, ShieldCheck, Play, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Layers } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";
import { Badge } from "@/components/ui/badge";

// 재고 도메인 타입 (trpc proxy 가 깊은 타입을 완전히 전파하지 못해 명시 추출)
type InventoryLot = RouterOutput["inventory"]["list"][number];
type InboundReceipt = RouterOutput["inventory"]["getInboundHistory"][number];
type TurnoverRow = RouterOutput["inventory"]["getTurnoverAnalysis"][number];
type TrendRow = RouterOutput["inventory"]["getTrend"][number];
type PurchaseSuggestion = RouterOutput["inventory"]["getPurchaseOrderSuggestions"][number];
type SubsidiaryLot = RouterOutput["inventory"]["listLots"][number];
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import LotTraceabilityModal from "@/components/LotTraceabilityModal";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { usePaginatedSort, SortableHeader, PaginationBar } from "@/components/PaginatedTable";

/* ─── Extracted components ─── */
import { fmt, fmtDate, won, Empty, Loading, StatCard, StyledTable, TH, TD, SectionTitle } from "@/components/inventory/InventoryHelpers";
import { PartnerSearchInput } from "@/components/inventory/PartnerSearchInput";
import { MaterialSearchInput } from "@/components/inventory/MaterialSearchInput";
import { MaterialStockView } from "@/components/inventory/MaterialStockView";
import { ProductStockView, ProductReceiptInfo, ProductReleaseTab } from "@/components/inventory/ProductStockView";
import { ProductTrendCard, ProductTurnoverCard } from "@/components/inventory/ProductAnalytics";
import { PredictionTab } from "@/components/inventory/PredictionTab";

/* ─── 2026-04-19 분해: ReleaseTab + 재고 액션 버튼 ─── */
import { ReleaseTab } from "./_inventoryManagement/ReleaseTab";

/* ═══════════════════════════════════════════════════
   메인 컴포넌트
   ═══════════════════════════════════════════════════ */
export default function InventoryManagement() {
  const [activeTab, setActiveTab] = useTabWithUrl("tab", "current");
  const [trendPeriod, setTrendPeriod] = useState<"week" | "month" | "quarter">("month");
  const [lotModalOpen, setLotModalOpen] = useState(false);
  const [inventoryView, setInventoryView] = useTabWithUrl("view", "material");
  const isMat = inventoryView === "material";
  const isSub = inventoryView === "subsidiary";
  const isExt = inventoryView === "external";

  const { data: dashboard, isLoading: isLoadingDashboard } = trpc.inventory.getDashboard.useQuery();

  const trendDates = useMemo(() => {
    const end = new Date(), start = new Date();
    if (trendPeriod === "week") start.setDate(end.getDate() - 7);
    else if (trendPeriod === "quarter") start.setDate(end.getDate() - 90);
    else start.setMonth(end.getMonth() - 1);
    return { startDate: start.toISOString().split("T")[0], endDate: end.toISOString().split("T")[0] };
  }, [trendPeriod]);

  const { data: rawTrend, isLoading: isLoadingTrend } = trpc.inventory.getTrend.useQuery(trendDates);
  const { data: rawTurnoverAnalysis, isLoading: isLoadingTurnover } = trpc.inventory.getTurnoverAnalysis.useQuery(trendDates);

  // 회전율 데이터 정규화: Number 변환 + 효율 한국어 라벨
  const turnoverAnalysis = useMemo(() => {
    if (!rawTurnoverAnalysis) return rawTurnoverAnalysis;
    const efficiencyMap: Record<string, string> = { high: "양호", medium: "적정", low: "주의" };
    return (rawTurnoverAnalysis as TurnoverRow[]).map((m) => ({
      ...m,
      turnoverRate: Number(m.turnoverRate) || 0,
      averageHoldingPeriod: Number(m.averageHoldingPeriod) || 0,
      usageQuantity: Number(m.usageQuantity) || 0,
      averageInventory: Number(m.averageInventory) || 0,
      efficiency: efficiencyMap[m.efficiency] || m.efficiency,
    }));
  }, [rawTurnoverAnalysis]);

  // NaN 방어: 서버 데이터 Number 변환
  const trend = useMemo(() => {
    if (!rawTrend) return rawTrend;
    return (rawTrend as TrendRow[]).map((r) => ({
      ...r,
      receiptQuantity: Number(r.receiptQuantity) || 0,
      usageQuantity: Number(r.usageQuantity) || 0,
      adjustmentQuantity: Number(r.adjustmentQuantity) || 0,
      netChange: Number(r.netChange) || ((Number(r.receiptQuantity) || 0) - (Number(r.usageQuantity) || 0) + (Number(r.adjustmentQuantity) || 0)),
      transactionCount: Number(r.transactionCount) || 0,
    }));
  }, [rawTrend]);

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
                  inventoryView === "product" ? "bg-white text-teal-700 shadow-sm" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                <Factory className="h-3.5 w-3.5" />제품
              </button>
              <button onClick={() => setInventoryView("subsidiary")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  isSub ? "bg-white text-teal-700 shadow-sm" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                <Package className="h-3.5 w-3.5" />부자재
              </button>
              <button onClick={() => setInventoryView("external")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  isExt ? "bg-white text-teal-700 shadow-sm" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                <Truck className="h-3.5 w-3.5" />외주제품
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
          {/* 탭: 모바일에서 수평 스와이프 가능 */}
          <div className="overflow-x-auto -mx-1 px-1">
            {(isSub || isExt) ? (
              <TabsList className="inline-flex w-auto min-w-full sm:grid sm:w-full sm:grid-cols-2 h-9">
                <TabsTrigger value="current" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><Package className="h-3.5 w-3.5" />현황</TabsTrigger>
                <TabsTrigger value="adjustment" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><Settings className="h-3.5 w-3.5" />재고 조정</TabsTrigger>
              </TabsList>
            ) : (
              <TabsList className="inline-flex w-auto min-w-full sm:grid sm:w-full sm:grid-cols-8 h-9">
                <TabsTrigger value="current" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><Package className="h-3.5 w-3.5" />현황</TabsTrigger>
                <TabsTrigger value="release" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><PackageMinus className="h-3.5 w-3.5" />{isMat ? "소모" : "출고"}</TabsTrigger>
                <TabsTrigger value="receipt" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><PackagePlus className="h-3.5 w-3.5" />입고</TabsTrigger>
                <TabsTrigger value="trend" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><TrendingUp className="h-3.5 w-3.5" />추이</TabsTrigger>
                <TabsTrigger value="turnover" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><RotateCw className="h-3.5 w-3.5" />회전율</TabsTrigger>
                <TabsTrigger value="prediction" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><AlertCircle className="h-3.5 w-3.5" />예측</TabsTrigger>
                <TabsTrigger value="purchase" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><Calendar className="h-3.5 w-3.5" />발주</TabsTrigger>
                <TabsTrigger value="adjustment" className="text-xs gap-1 whitespace-nowrap data-[state=active]:font-semibold"><Settings className="h-3.5 w-3.5" />조정</TabsTrigger>
              </TabsList>
            )}
          </div>

          {/* ━━━ 재고현황 ━━━ */}
          <TabsContent value="current" className="space-y-5 mt-0">
            {isSub ? <SubsidiaryStockView filterType="subsidiary" />
              : isExt ? <SubsidiaryStockView filterType="external_product" />
              : isMat ? <MaterialStockView dashboard={dashboard} isLoading={isLoadingDashboard} />
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
                    <Select value={trendPeriod} onValueChange={(v) => setTrendPeriod(v as typeof trendPeriod)}>
                      <SelectTrigger className="w-32 h-10 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="week">최근 7일</SelectItem>
                        <SelectItem value="month">최근 30일</SelectItem>
                        <SelectItem value="quarter">최근 90일</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent className="p-3">
                  {isLoadingTrend ? <Loading /> : !trend?.length ? <Empty text="선택 기간에 데이터 없음" /> : (
                    <TrendTablePaginated data={trend} />
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
                  <SectionTitle icon={RotateCw} title="원재료별 회전율" desc={trendPeriod === "week" ? "최근 7일" : trendPeriod === "quarter" ? "최근 90일" : "최근 30일"} />
                </CardHeader>
                <CardContent className="p-3">
                  {isLoadingTurnover ? <Loading /> : !turnoverAnalysis?.length ? <Empty text="데이터 없음" /> : (
                    <TurnoverTablePaginated data={turnoverAnalysis} />
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
   추이 테이블 (페이지네이션 + 정렬)
   ═══════════════════════════════════════════════════ */
function TrendTablePaginated({ data }: { data: TrendRow[] }) {
  const {
    sort, handleSort, pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(data, {
    defaultSort: { key: "date", direction: "desc" },
    defaultPageSize: 30,
    sortFn: (a: TrendRow, b: TrendRow, key: string, dir) => {
      if (["receiptQuantity", "usageQuantity", "adjustmentQuantity", "netChange", "transactionCount"].includes(key)) {
        const aVal = Number((a as unknown as Record<string, unknown>)[key]) || 0;
        const bVal = Number((b as unknown as Record<string, unknown>)[key]) || 0;
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aVal = String((a as unknown as Record<string, unknown>)[key] || "");
      const bVal = String((b as unknown as Record<string, unknown>)[key] || "");
      return dir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    },
  });

  return (
    <>
      <StyledTable>
        <TableHeader>
          <TableRow>
            <SortableHeader label="일자" sortKey="date" currentSort={sort} onSort={handleSort} />
            <SortableHeader label="입고" sortKey="receiptQuantity" currentSort={sort} onSort={handleSort} align="right" />
            <SortableHeader label="소모" sortKey="usageQuantity" currentSort={sort} onSort={handleSort} align="right" />
            <SortableHeader label="조정" sortKey="adjustmentQuantity" currentSort={sort} onSort={handleSort} align="right" />
            <SortableHeader label="순변동" sortKey="netChange" currentSort={sort} onSort={handleSort} align="right" />
            <SortableHeader label="건수" sortKey="transactionCount" currentSort={sort} onSort={handleSort} align="center" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(pageData as TrendRow[]).map((r) => {
            const nc = Number(r.netChange) || 0;
            return (
              <TableRow key={r.date} className="hover:bg-muted/30">
                <TD className="font-mono">{r.date}</TD>
                <TD className="text-right text-emerald-600 dark:text-emerald-400 font-medium">+{fmt(r.receiptQuantity)}</TD>
                <TD className="text-right text-red-500 dark:text-red-400 font-medium">{fmt(r.usageQuantity)}</TD>
                <TD className="text-right">{fmt(r.adjustmentQuantity)}</TD>
                <TD className="text-right">
                  <Badge variant={nc >= 0 ? "default" : "secondary"} className="text-xs px-2.5 py-1 font-mono">
                    {nc >= 0 ? "+" : ""}{fmt(nc)}
                  </Badge>
                </TD>
                <TD className="text-center">{r.transactionCount}</TD>
              </TableRow>
            );
          })}
        </TableBody>
      </StyledTable>
      <PaginationBar
        totalItems={totalItems} totalPages={totalPages}
        currentPage={pagination.page} pageSize={pagination.pageSize}
        startIdx={startIdx} endIdx={endIdx}
        onPageChange={setPage} onPageSizeChange={setPageSize}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════
   회전율 테이블 (페이지네이션 + 정렬)
   ═══════════════════════════════════════════════════ */
type TurnoverRowDisplay = Omit<TurnoverRow, "efficiency"> & { efficiency: string };
function TurnoverTablePaginated({ data }: { data: TurnoverRowDisplay[] }) {
  const {
    sort, handleSort, pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(data, {
    defaultSort: { key: "turnoverRate", direction: "desc" },
    defaultPageSize: 30,
    sortFn: (a: TurnoverRowDisplay, b: TurnoverRowDisplay, key: string, dir) => {
      if (["turnoverRate", "usageQuantity", "averageInventory", "averageHoldingPeriod"].includes(key)) {
        const aVal = Number((a as unknown as Record<string, unknown>)[key]) || 0;
        const bVal = Number((b as unknown as Record<string, unknown>)[key]) || 0;
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aVal = String((a as unknown as Record<string, unknown>)[key] || "");
      const bVal = String((b as unknown as Record<string, unknown>)[key] || "");
      return dir === "asc" ? aVal.localeCompare(bVal, "ko") : bVal.localeCompare(aVal, "ko");
    },
  });

  return (
    <>
      <StyledTable>
        <TableHeader>
          <TableRow>
            <SortableHeader label="원재료" sortKey="materialName" currentSort={sort} onSort={handleSort} />
            <SortableHeader label="소모량" sortKey="usageQuantity" currentSort={sort} onSort={handleSort} align="right" />
            <SortableHeader label="재고" sortKey="averageInventory" currentSort={sort} onSort={handleSort} align="right" />
            <SortableHeader label="회전율" sortKey="turnoverRate" currentSort={sort} onSort={handleSort} align="right" />
            <SortableHeader label="재고일수" sortKey="averageHoldingPeriod" currentSort={sort} onSort={handleSort} align="right" />
            <TH className="text-center">효율</TH>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(pageData as TurnoverRowDisplay[]).map((m) => (
            <TableRow key={m.materialId} className="hover:bg-muted/30">
              <TD>
                <span className="font-medium">{m.materialName}</span>
                <span className="text-muted-foreground ml-2 text-xs">{m.materialCode}</span>
              </TD>
              <TD className="text-right">{fmt(m.usageQuantity)}</TD>
              <TD className="text-right">{fmt(m.averageInventory)}</TD>
              <TD className="text-right">
                <Badge variant={Number(m.turnoverRate) >= 1 ? "default" : "secondary"} className="text-xs px-2.5 py-1">
                  {Number(m.turnoverRate).toFixed(2)}
                </Badge>
              </TD>
              <TD className="text-right">{Number(m.averageHoldingPeriod).toFixed(0)}일</TD>
              <TD className="text-center">
                <span className={`font-semibold ${m.efficiency === "양호" ? "text-emerald-600" : m.efficiency === "적정" ? "text-blue-600" : "text-amber-600"}`}>
                  {m.efficiency}
                </span>
              </TD>
            </TableRow>
          ))}
        </TableBody>
      </StyledTable>
      <PaginationBar
        totalItems={totalItems} totalPages={totalPages}
        currentPage={pagination.page} pageSize={pagination.pageSize}
        startIdx={startIdx} endIdx={endIdx}
        onPageChange={setPage} onPageSizeChange={setPageSize}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════
   발주 제안 (원재료 전용) - 현황 탭과 동일한 재고값 표시
   ═══════════════════════════════════════════════════ */
function PurchaseOrderTab() {
  const [days, setDays] = useState(30);
  const utils = trpc.useUtils();
  const { data: suggs, isLoading } = trpc.inventory.getPurchaseOrderSuggestions.useQuery({ days });
  const approveMut = trpc.inventory.approvePurchaseOrder.useMutation({
    onSuccess: () => {
      utils.inventory.getPurchaseOrderSuggestions.invalidate();
      utils.inventory.getDashboard.invalidate();
      alert("승인됨");
    },
  });
  const rejectMut = trpc.inventory.rejectPurchaseOrder.useMutation({
    onSuccess: () => { utils.inventory.getPurchaseOrderSuggestions.invalidate(); alert("거부됨"); },
  });

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <SectionTitle icon={Calendar} title="자동 발주 제안" desc="입고 · 현황 연동 재고 기반 최적 발주" />
          <Select value={days.toString()} onValueChange={(v) => setDays(+v)}>
            <SelectTrigger className="w-28 h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[7,14,30,60].map(d => <SelectItem key={d} value={d.toString()}>{d}일</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? <Loading /> : !suggs?.length ? <Empty text="원재료 데이터 없음" /> : (
          <StyledTable>
            <TableHeader><TableRow>
              <TH>원재료</TH><TH>현재고</TH><TH>안전재고</TH><TH>권장발주</TH>
              <TH className="text-center">우선</TH><TH className="text-center w-32">작업</TH>
            </TableRow></TableHeader>
            <TableBody>
              {(suggs as PurchaseSuggestion[]).map((s) => (
                <TableRow key={s.materialId} className={`hover:bg-muted/30 ${!s.needsOrder ? "opacity-50" : ""}`}>
                  <TD>
                    <span className="font-medium">{s.materialName}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{s.materialCode}</span>
                  </TD>
                  <TD className={`font-mono ${s.currentStock <= 0 ? "text-red-500 font-semibold" : ""}`}>
                    {fmt(s.currentStock)} {s.unit}
                  </TD>
                  <TD className="font-mono text-muted-foreground">{fmt(s.safetyStockLevel)} {s.unit}</TD>
                  <TD className="font-mono font-medium">{fmt(s.recommendedOrderQuantity)} {s.unit}</TD>
                  <TD className="text-center">
                    <Badge
                      variant={s.priority === "urgent" ? "destructive" : s.priority === "high" ? "secondary" : "outline"}
                      className="text-xs px-2.5 py-1"
                    >
                      {s.priority === "urgent" ? "긴급" : s.priority === "high" ? "높음" : "보통"}
                    </Badge>
                  </TD>
                  <TD className="text-center">
                    {s.needsOrder ? (
                      <div className="flex gap-2 justify-center">
                        <Button size="sm" className="h-9 text-sm px-4" onClick={() => { if(confirm("승인?")) approveMut.mutate({ materialId: s.materialId, quantity: s.recommendedOrderQuantity }); }}>승인</Button>
                        <Button size="sm" variant="ghost" className="h-9 text-sm px-4 text-muted-foreground" onClick={() => { const r = prompt("거부 사유:"); if(r !== null) rejectMut.mutate({ materialId: s.materialId, reason: r || undefined }); }}>거부</Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
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
   배치 재고 소급 차감 버튼 컴포넌트
   ═══════════════════════════════════════════════════ */

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

  const { data: _raw } = trpc.material.list.useQuery({ limit: 9999, itemTypes: ["raw_material", "subsidiary", "external_product"] });
  const mats: any[] = (_raw as any)?.items ?? (Array.isArray(_raw) ? _raw : []);
  const { data: receipts, isLoading } = trpc.inventory.getInboundHistory.useQuery({ limit: 9999 });

  const createMut = trpc.lotManagement.createReceivingWithLot.useMutation({
    onSuccess: (r: any) => {
      // 입고→현황→발주→예측 모든 탭 캐시 갱신
      utils.inventory.getInboundHistory.invalidate();
      utils.inventory.list.invalidate();
      utils.inventory.getDashboard.invalidate();
      utils.inventory.getPurchaseOrderSuggestions.invalidate();
      utils.inventory.predictAllShortage.invalidate();
      utils.inventory.getTrend.invalidate();
      utils.inventory.getTurnoverAnalysis.invalidate();
      const purchaseMsg = r.accountingPurchaseCreated ? "\n(매입전표 자동 생성됨)" : "";
      alert(`입고 완료! LOT: ${r.lotNumber}${purchaseMsg}`); setMatId(null); setMatName(""); setMatCode(""); setQty(""); setPrice(""); setSelectedSupplierId(null); setSelectedSupplierName(""); setExpiry(""); setNotes(""); setShowForm(false); },
    onError: (e: { message: string }) => alert(`실패: ${e.message}`),
  });
  const backfillMut = trpc.lotManagement.backfillLots.useMutation({
    onSuccess: (r: any) => {
      // LOT 일괄 생성 후 모든 탭 캐시 갱신
      utils.inventory.getInboundHistory.invalidate();
      utils.inventory.list.invalidate();
      utils.inventory.getDashboard.invalidate();
      utils.inventory.getPurchaseOrderSuggestions.invalidate();
      utils.inventory.predictAllShortage.invalidate();
      alert(`LOT 일괄 생성: ${r?.created || 0}건`);
    },
    onError: (e: { message: string }) => alert(`실패: ${e.message}`),
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
          <SectionTitle icon={Clock} title="입고 내역" desc={receipts ? `총 ${receipts.length}건` : undefined} />
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? <Loading /> : !receipts?.length ? <Empty text="입고 내역 없음" /> : (
            <ReceiptListPaginated receipts={receipts} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   입고 내역 페이지네이션 + 정렬 컴포넌트
   ═══════════════════════════════════════════════════ */
function ReceiptListPaginated({ receipts }: { receipts: any[] }) {
  const {
    sort, handleSort, pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(receipts, {
    defaultSort: { key: "receiptDate", direction: "desc" },
    defaultPageSize: 30,
    sortFn: (a: any, b: any, key: string, dir) => {
      let aVal = a[key], bVal = b[key];
      if (key === "receiptDate") {
        aVal = a.receiptDate || a.createdAt || "";
        bVal = b.receiptDate || b.createdAt || "";
      }
      if (["quantity", "unitPrice"].includes(key)) {
        aVal = parseFloat(aVal || "0"); bVal = parseFloat(bVal || "0");
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      aVal = String(aVal || ""); bVal = String(bVal || "");
      return dir === "asc" ? aVal.localeCompare(bVal, "ko") : bVal.localeCompare(aVal, "ko");
    },
  });

  return (
    <>
      <div className="hidden sm:block">
        <StyledTable>
          <TableHeader><TableRow>
            <SortableHeader label="입고일" sortKey="receiptDate" currentSort={sort} onSort={handleSort} />
            <SortableHeader label="LOT" sortKey="lotNumber" currentSort={sort} onSort={handleSort} />
            <SortableHeader label="원재료" sortKey="materialName" currentSort={sort} onSort={handleSort} />
            <SortableHeader label="수량" sortKey="quantity" currentSort={sort} onSort={handleSort} align="right" />
            <SortableHeader label="단가" sortKey="unitPrice" currentSort={sort} onSort={handleSort} align="right" />
            <SortableHeader label="공급업체" sortKey="supplierName" currentSort={sort} onSort={handleSort} />
            <SortableHeader label="소비기한" sortKey="expiryDate" currentSort={sort} onSort={handleSort} />
          </TableRow></TableHeader>
          <TableBody>
            {pageData.map((r: any) => (
              <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                <TD className="text-muted-foreground whitespace-nowrap">{fmtDate(r.receiptDate || r.createdAt)}</TD>
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
      <div className="sm:hidden space-y-2">
        {pageData.map((r: any) => (
          <div key={r.id} className="border rounded-lg p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium text-sm truncate">{r.materialName} <span className="text-muted-foreground text-xs">{r.materialCode}</span></p>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.receiptDate || r.createdAt)}</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1.5 border-t text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">수량</span><span className="font-mono font-semibold">{r.quantity} {r.unit}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">단가</span><span className="font-mono">{r.unitPrice ? won(r.unitPrice) : "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">LOT</span><span className="font-mono truncate ml-1">{r.lotNumber || "-"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">소비기한</span><span>{fmtDate(r.expiryDate)}</span></div>
              {r.supplierName && <div className="col-span-2 flex justify-between"><span className="text-muted-foreground">공급업체</span><span>{r.supplierName}</span></div>}
            </div>
          </div>
        ))}
      </div>
      <PaginationBar
        totalItems={totalItems} totalPages={totalPages}
        currentPage={pagination.page} pageSize={pagination.pageSize}
        startIdx={startIdx} endIdx={endIdx}
        onPageChange={setPage} onPageSizeChange={setPageSize}
      />
    </>
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
    onError: (e: { message: string }) => alert(`실패: ${e.message}`),
  });

  const selectedLot = (lots as InventoryLot[] | undefined)?.find((l) => l.id === lotId);
  const currentQty = selectedLot ? parseFloat(String(selectedLot.availableQuantity ?? "0")) : 0;
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
                <SelectContent>{(lots as InventoryLot[] | undefined)?.map((l) => (
                  <SelectItem key={l.id} value={l.id.toString()}>
                    <span className="text-xs">{l.lotNumber} - {l.materialName} ({l.availableQuantity} {l.unit})</span>
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">조정 유형 <span className="text-red-500">*</span></label>
              <Select value={adjType} onValueChange={(v) => setAdjType(v as typeof adjType)}>
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

/* ═══════════════════════════════════════════════════
   부자재 · 외주제품 재고 현황 (간소화 LOT 뷰)
   ═══════════════════════════════════════════════════ */
function SubsidiaryStockView({ filterType }: { filterType: "subsidiary" | "external_product" }) {
  const { data: allLots, isLoading } = trpc.inventory.listLots.useQuery();
  const label = filterType === "subsidiary" ? "부자재" : "외주제품";

  const subsidiaryLots = useMemo(() => {
    if (!allLots) return [];
    return (allLots as SubsidiaryLot[]).filter((lot) => lot.itemType === filterType);
  }, [allLots, filterType]);

  const activeLots = subsidiaryLots.filter((l) => l.status === "available");
  const totalValue = activeLots.reduce((sum, l) => {
    return sum + (parseFloat(String(l.availableQuantity ?? "0")) * parseFloat(String(l.unitPrice ?? "0")));
  }, 0);

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">로딩 중...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">전체 LOT</p>
          <p className="text-2xl font-bold text-teal-700">{subsidiaryLots.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">가용 LOT</p>
          <p className="text-2xl font-bold text-emerald-600">{activeLots.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">총 재고가치</p>
          <p className="text-2xl font-bold text-blue-700">₩{totalValue.toLocaleString()}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" /> {label} 재고 현황 · {subsidiaryLots.length}건
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {subsidiaryLots.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{label} 재고가 없습니다</p>
              <p className="text-xs mt-1">발주서 입고 확정 시 자동으로 재고가 생성됩니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-xs">LOT</th>
                  <th className="text-left p-3 font-medium text-xs">품목</th>
                  <th className="text-left p-3 font-medium text-xs">유형</th>
                  <th className="text-right p-3 font-medium text-xs">수량</th>
                  <th className="text-right p-3 font-medium text-xs">가용</th>
                  <th className="text-right p-3 font-medium text-xs">단가</th>
                  <th className="text-left p-3 font-medium text-xs">입고일</th>
                  <th className="text-center p-3 font-medium text-xs">상태</th>
                </tr></thead>
                <tbody>
                  {subsidiaryLots.map((lot) => (
                    <tr key={lot.id} className="border-b hover:bg-accent/50">
                      <td className="p-3 font-mono text-xs">{lot.lotNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-xs">{lot.materialName}</div>
                        <div className="text-[10px] text-muted-foreground">{lot.materialCode}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          filterType === "subsidiary" ? "bg-amber-100 text-amber-700" : "bg-purple-100 text-purple-700"
                        }`}>
                          {label}
                        </span>
                      </td>
                      <td className="p-3 text-right text-xs">{lot.quantity} {lot.unit}</td>
                      <td className="p-3 text-right text-xs font-bold">{lot.availableQuantity} {lot.unit}</td>
                      <td className="p-3 text-right text-xs">₩{parseFloat(lot.unitPrice || "0").toLocaleString()}</td>
                      <td className="p-3 text-xs">{lot.receiptDate ? new Date(lot.receiptDate).toLocaleDateString("ko-KR") : "-"}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          lot.status === "available" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          {lot.status === "available" ? "사용가능" : lot.status === "disposed" ? "폐기" : lot.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
