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

/* ─── 2026-04-19 분해: 탭별 컴포넌트 분리 ─── */
import { ReleaseTab } from "./_inventoryManagement/ReleaseTab";
import { ReceiptTab } from "./_inventoryManagement/ReceiptTab";
import { AdjustmentTab } from "./_inventoryManagement/AdjustmentTab";
import { SubsidiaryStockView } from "./_inventoryManagement/SubsidiaryStockView";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

/* ═══════════════════════════════════════════════════
   메인 컴포넌트
   ═══════════════════════════════════════════════════ */
export default function InventoryManagement() {
  const L = useIndustryLabel();
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
              <p className="text-xs text-muted-foreground">{`${L("material")} · 제품 통합 재고 관리`}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* 세그먼트 토글 */}
            <div className="inline-flex items-center bg-gradient-to-r from-teal-600 to-emerald-600 rounded-lg p-0.5">
              <button onClick={() => setInventoryView("material")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  isMat ? "bg-white text-teal-700 shadow-sm" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                <Package className="h-3.5 w-3.5" />{`${L("material")}
              `}</button>
              <button onClick={() => setInventoryView("product")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 whitespace-nowrap ${
                  inventoryView === "product" ? "bg-white text-teal-700 shadow-sm" : "text-white/70 hover:text-white hover:bg-white/10"}`}>
                <Factory className="h-3.5 w-3.5" />{`${L("product")}
              `}</button>
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
                    <SectionTitle icon={TrendingUp} title={`${L("material")} 재고 이동 추이`} desc="일별 입고/소모/조정" />
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
                  <SectionTitle icon={RotateCw} title={`${L("material")}별 회전율`} desc={trendPeriod === "week" ? "최근 7일" : trendPeriod === "quarter" ? "최근 90일" : "최근 30일"} />
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
                <p className="text-lg font-medium">{`${L("product")} 재고 예측은 생산계획 기반으로 운영됩니다.`}</p>
                <p className="text-sm mt-2 opacity-70">파이프라인 → 생산계획에서 확인하세요.</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ━━━ 발주 ━━━ */}
          <TabsContent value="purchase" className="mt-0">
            {isMat ? <PurchaseOrderTab /> : (
              <Card><CardContent className="py-20 text-center text-muted-foreground">
                <Truck className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">{`${L("product")}은 자동 발주 대상이 아닙니다.`}</p>
                <p className="text-sm mt-2 opacity-70">OEM 제품 발주는 거래처 관리에서 처리하세요.</p>
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ━━━ 조정 ━━━ */}
          <TabsContent value="adjustment" className="mt-0">
            <AdjustmentTab
              view={
                inventoryView === "material"
                  ? "material"
                  : inventoryView === "subsidiary"
                  ? "subsidiary"
                  : inventoryView === "external"
                  ? "external"
                  : "product"
              }
            />
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
  const L = useIndustryLabel();
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
            <SortableHeader label={L("material")} sortKey="materialName" currentSort={sort} onSort={handleSort} />
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
  const L = useIndustryLabel();
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
              <TH>{`${L("material")}`}</TH><TH>현재고</TH><TH>안전재고</TH><TH>권장발주</TH>
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
