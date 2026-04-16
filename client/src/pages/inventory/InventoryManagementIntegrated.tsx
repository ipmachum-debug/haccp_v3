import React, { useState, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsTrigger, TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, RotateCw, AlertCircle, Calendar, PackageMinus, PackagePlus, Settings, RefreshCw, Factory, ScanBarcode, Truck, Clock, ShieldCheck, Play, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Layers } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
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
    return (rawTurnoverAnalysis as any[]).map((m: any) => ({
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
    return (rawTrend as any[]).map((r: any) => ({
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
                    <Select value={trendPeriod} onValueChange={(v) => setTrendPeriod(v as any)}>
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
function TrendTablePaginated({ data }: { data: any[] }) {
  const {
    sort, handleSort, pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(data, {
    defaultSort: { key: "date", direction: "desc" },
    defaultPageSize: 30,
    sortFn: (a: any, b: any, key: string, dir) => {
      if (["receiptQuantity", "usageQuantity", "adjustmentQuantity", "netChange", "transactionCount"].includes(key)) {
        const aVal = Number(a[key]) || 0;
        const bVal = Number(b[key]) || 0;
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aVal = String(a[key] || "");
      const bVal = String(b[key] || "");
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
          {pageData.map((r: any) => {
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
function TurnoverTablePaginated({ data }: { data: any[] }) {
  const {
    sort, handleSort, pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(data, {
    defaultSort: { key: "turnoverRate", direction: "desc" },
    defaultPageSize: 30,
    sortFn: (a: any, b: any, key: string, dir) => {
      if (["turnoverRate", "usageQuantity", "averageInventory", "averageHoldingPeriod"].includes(key)) {
        const aVal = Number(a[key]) || 0;
        const bVal = Number(b[key]) || 0;
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aVal = String(a[key] || "");
      const bVal = String(b[key] || "");
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
          {pageData.map((m: any) => (
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
              {suggs.map((s: any) => (
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
function RetroactiveDeductionButton({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<"idle" | "checking" | "running" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");

  const retroMut = trpc.inventory.retroactiveDeduction.useMutation({
    onSuccess: (data: any) => {
      if (data.processedBatches === 0) {
        setResultMsg("모든 배치의 원재료가 이미 차감되어 있습니다.");
      } else {
        setResultMsg(`${data.processedBatches}개 배치 처리 완료 (원재료 ${data.totalDeducted}건 차감, 총 원가 ₩${data.totalCost.toLocaleString()})`);
      }
      setStatus("done");
      onComplete();
    },
    onError: (e: any) => {
      setResultMsg(`오류: ${e.message}`);
      setStatus("done");
    }
  });

  const dryRunMut = trpc.inventory.retroactiveDeduction.useMutation({
    onSuccess: (data: any) => {
      if (data.processedBatches === 0 && data.errors?.length) {
        setResultMsg("차감 대상 배치가 없습니다.");
        setStatus("idle");
        return;
      }
      const details = data.details?.map((d: any) =>
        `  - 배치 ${d.batchNumber}: 원재료 ${d.materialsIssued}건`
      ).join("\n") || "";
      if (confirm(`소급 차감 대상: ${data.processedBatches}개 배치\n\n${details}\n\n재고에서 원재료를 차감하시겠습니까?`)) {
        setStatus("running");
        retroMut.mutate({ dryRun: false });
      } else {
        setStatus("idle");
      }
    },
    onError: (e: any) => {
      setResultMsg(`확인 오류: ${e.message}`);
      setStatus("done");
    }
  });

  const handleClick = useCallback(() => {
    setStatus("checking");
    setResultMsg("");
    dryRunMut.mutate({ dryRun: true });
  }, []);

  if (status === "done" && resultMsg) {
    return (
      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-green-700 dark:text-green-400">{resultMsg}</span>
        <button onClick={() => { setStatus("idle"); setResultMsg(""); }} className="text-[10px] text-blue-600 underline">닫기</button>
      </div>
    );
  }

  return (
    <div className="mt-2.5">
      <Button
        size="sm"
        variant="outline"
        disabled={status === "checking" || status === "running"}
        onClick={handleClick}
        className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/30"
      >
        <Play className="h-3 w-3 mr-1" />
        {status === "checking" ? "확인 중..." : status === "running" ? "차감 처리 중..." : "배치 재고 일괄 차감"}
      </Button>
      <span className="text-[10px] text-muted-foreground ml-2">백업 데이터 등으로 누락된 배치별 원재료 재고 차감 실행</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   소모 데이터 → 현황(재고) 일괄 동기화 버튼
   ═══════════════════════════════════════════════════ */
function StockSyncButton({ onComplete }: { onComplete: () => void }) {
  const [status, setStatus] = useState<"idle" | "checking" | "running" | "done">("idle");
  const [resultMsg, setResultMsg] = useState("");
  const [details, setDetails] = useState<any[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  const syncMut = trpc.inventory.syncStockFromConsumption.useMutation({
    onSuccess: (data: any) => {
      if (data.materialsProcessed === 0 && data.errors?.length) {
        setResultMsg(data.errors[0] || "동기화 대상이 없습니다.");
        setDetails([]);
      } else {
        setResultMsg(`${data.materialsProcessed}개 원재료 동기화 완료 (총 ${data.totalDeducted.toFixed(1)} 차감)`);
        setDetails(data.details || []);
      }
      setStatus("done");
      onComplete();
    },
    onError: (e: any) => {
      setResultMsg(`오류: ${e.message}`);
      setStatus("done");
    }
  });

  const dryRunMut = trpc.inventory.syncStockFromConsumption.useMutation({
    onSuccess: (data: any) => {
      if (data.materialsProcessed === 0 && data.errors?.length) {
        setResultMsg(data.errors[0] || "동기화 대상이 없습니다.");
        setStatus("done");
        return;
      }
      const summary = data.details?.map((d: any) =>
        `  - ${d.materialName}: ${d.warnings?.[0] || `${d.consumedQty.toFixed(1)}${d.unit}`}`
      ).join("\n") || "";
      if (confirm(`재고 동기화 대상: ${data.details?.length || 0}개 원재료\n\n${summary}\n\n소모 데이터 기준으로 현황 재고를 차감하시겠습니까?\n(소모총량 - 기차감량 = 미반영분만 차감)\n\n※ LOT의 available_quantity와 h_inventory가 감소합니다.`)) {
        setStatus("running");
        syncMut.mutate({ dryRun: false });
      } else {
        setStatus("idle");
      }
    },
    onError: (e: any) => {
      setResultMsg(`확인 오류: ${e.message}`);
      setStatus("done");
    }
  });

  const handleClick = useCallback(() => {
    setStatus("checking");
    setResultMsg("");
    setDetails([]);
    dryRunMut.mutate({ dryRun: true });
  }, []);

  if (status === "done" && resultMsg) {
    return (
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-emerald-700 dark:text-emerald-400">{resultMsg}</span>
          <button onClick={() => { setStatus("idle"); setResultMsg(""); setDetails([]); }} className="text-[10px] text-blue-600 underline">닫기</button>
          {details.length > 0 && (
            <button onClick={() => setShowDetails(!showDetails)} className="text-[10px] text-blue-600 underline">
              {showDetails ? "상세 접기" : "상세 보기"}
            </button>
          )}
        </div>
        {showDetails && details.length > 0 && (
          <div className="text-[10px] text-muted-foreground space-y-0.5 pl-2 border-l-2 border-emerald-200 dark:border-emerald-800">
            {details.map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <span className="font-medium">{d.materialName}</span>
                <span>소모 {d.consumedQty.toFixed(1)} → LOT차감 {d.deductedQty.toFixed(1)}{d.unit}</span>
                {d.warnings?.length > 0 && <span className="text-amber-500">{d.warnings[0]}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <Button
        size="sm"
        variant="outline"
        disabled={status === "checking" || status === "running"}
        onClick={handleClick}
        className="h-7 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-600 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
      >
        <RefreshCw className={`h-3 w-3 mr-1 ${status === "running" ? "animate-spin" : ""}`} />
        {status === "checking" ? "확인 중..." : status === "running" ? "동기화 중..." : "소모→현황 재고 동기화"}
      </Button>
      <span className="text-[10px] text-muted-foreground ml-2">소모 탭 집계 데이터를 현황 재고에 일괄 반영</span>
    </div>
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
  const [submitProgress, setSubmitProgress] = useState<{ current: number; total: number } | null>(null);

  // 월별 페이지네이션
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [expandedMaterials, setExpandedMaterials] = useState<Set<string>>(new Set());

  interface RI { id: number; lotId: string; materialName: string; availableQty: string; quantity: string; unit: string; unitPrice: string; amount: string; expiryDate: string; lotNumber: string; }
  const emptyRItem = (): RI => ({ id: Date.now() + Math.random(), lotId: "", materialName: "", availableQty: "", quantity: "", unit: "", unitPrice: "0", amount: "0", expiryDate: "", lotNumber: "" });
  const [items, setItems] = useState<RI[]>([emptyRItem()]);

  const { data: lots, isLoading: lotsLoading } = trpc.inventory.list.useQuery();
  const { data: summary, isLoading: summaryLoading } = trpc.inventory.getConsumptionSummary.useQuery({ year: viewYear, month: viewMonth });
  const mut = trpc.inventory.releaseStock.useMutation({
    onSuccess: () => { utils.inventory.list.invalidate(); utils.inventory.getDashboard.invalidate(); utils.inventory.getConsumptionSummary.invalidate(); },
    onError: (e: any) => alert(`소모 처리 실패: ${e.message}`),
  });

  // 월 이동
  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
    setExpandedDates(new Set()); setExpandedMaterials(new Set());
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
    setExpandedDates(new Set()); setExpandedMaterials(new Set());
  };
  const goToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear()); setViewMonth(now.getMonth() + 1);
    setExpandedDates(new Set()); setExpandedMaterials(new Set());
  };

  const toggleDate = (date: string) => {
    setExpandedDates(prev => { const s = new Set(prev); s.has(date) ? s.delete(date) : s.add(date); return s; });
  };
  const toggleMaterial = (key: string) => {
    setExpandedMaterials(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  };

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
  const addItem = () => setItems(p => [...p, emptyRItem()]);
  const removeItem = (id: number) => { if (items.length > 1) setItems(p => p.filter(i => i.id !== id)); };
  const totalQty = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
  const filledItems = items.filter(i => i.lotId && i.quantity && parseFloat(i.quantity) > 0);
  const hasOverflow = items.some(i => i.lotId && i.quantity && i.availableQty && parseFloat(i.quantity) > parseFloat(i.availableQty) && parseFloat(i.availableQty) > 0);

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
      {/* BOM 자동 소모 안내 + 소급 차감 */}
      <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10 dark:border-blue-800">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40 shrink-0">
              <Factory className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-1">생산 투입 시 원재료 자동 소모</h4>
              <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed">
                배치 생산 시 BOM(레시피)에 등록된 원재료가 <strong>자동으로 재고에서 차감</strong>됩니다.<br/>
                이 탭은 <strong>폐기, 샘플 출고, 기타 수동 소모</strong> 처리에 사용하세요.
              </p>
              <div className="flex items-center gap-3 mt-2 text-[10px] flex-wrap">
                <span className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-1"><ShieldCheck className="h-3 w-3" />생산투입 = BOM 자동 차감</span>
                <span className="text-orange-600 dark:text-orange-400 font-medium flex items-center gap-1"><PackageMinus className="h-3 w-3" />폐기/기타 = 수동 처리</span>
              </div>
              <RetroactiveDeductionButton onComplete={() => {
                utils.inventory.getDashboard.invalidate();
                utils.inventory.getConsumptionSummary.invalidate();
                utils.inventory.list.invalidate();
              }} />
              <StockSyncButton onComplete={() => {
                utils.inventory.getDashboard.invalidate();
                utils.inventory.getConsumptionSummary.invalidate();
                utils.inventory.list.invalidate();
              }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 수동 소모 입력 폼 */}
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

      {/* 월별 소모 현황 요약 */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionTitle icon={Layers} title="월별 소모 현황" desc={summary ? `${summary.totalRecords}건` : undefined} />
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              <button onClick={goToday} className="text-sm font-semibold min-w-[120px] text-center hover:text-orange-600 transition-colors">
                {viewYear}년 {viewMonth}월
              </button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {summaryLoading ? <Loading /> : !summary || summary.totalRecords === 0 ? <Empty text={`${viewYear}년 ${viewMonth}월 소모 이력 없음`} /> : (
            <div className="space-y-4">
              {/* 월간 요약 카드 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={PackageMinus} label="총 소모 건수" value={summary.totalRecords.toLocaleString()} color="amber" sub="건" />
                <StatCard icon={Layers} label="원재료 종류" value={summary.materialTotals.length.toLocaleString()} color="blue" sub="종" />
                <StatCard icon={Package} label="총 소모량" value={fmt(summary.grandTotalQuantity)} color="red" />
                <StatCard icon={Calendar} label="소모 일수" value={summary.dailyGroups.length.toLocaleString()} color="slate" sub="일" />
              </div>

              {/* 원재료별 월간 소계 */}
              {summary.materialTotals.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/30 px-3 py-2 border-b">
                    <h4 className="text-xs font-semibold text-muted-foreground">원재료별 월간 소계</h4>
                  </div>
                  <div className="divide-y">
                    {summary.materialTotals.map((mt: any) => (
                      <div key={mt.materialId} className="flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{mt.materialName}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{mt.count}건</Badge>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-mono font-bold text-orange-700 dark:text-orange-400">{fmt(mt.totalQuantity)}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">{mt.unit}</span>
                          {mt.totalAmount > 0 && (
                            <span className="text-[10px] text-muted-foreground ml-2">{won(mt.totalAmount)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 일별 그룹 (접이식) */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/30 px-3 py-2 border-b">
                  <h4 className="text-xs font-semibold text-muted-foreground">일별 소모 상세</h4>
                </div>
                <div className="divide-y">
                  {summary.dailyGroups.map((day: any) => {
                    const isDateExpanded = expandedDates.has(day.date);
                    return (
                      <div key={day.date}>
                        {/* 날짜 헤더 */}
                        <button onClick={() => toggleDate(day.date)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/20 transition-colors text-left">
                          <div className="flex items-center gap-2">
                            {isDateExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className="text-xs font-semibold">{fmtDate(day.date)}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{day.recordCount}건</Badge>
                            <span className="text-[10px] text-muted-foreground">{day.materialGroups.length}종 원재료</span>
                          </div>
                          <span className="text-xs font-mono font-bold text-orange-700 dark:text-orange-400">
                            {fmt(day.totalQuantity)}
                            {day.totalAmount > 0 && <span className="text-muted-foreground font-normal ml-2">{won(day.totalAmount)}</span>}
                          </span>
                        </button>

                        {/* 원재료 그룹 (날짜 확장 시) */}
                        {isDateExpanded && (
                          <div className="bg-muted/10 border-t">
                            {day.materialGroups.map((mg: any) => {
                              const matKey = `${day.date}-${mg.materialId}`;
                              const isMatExpanded = expandedMaterials.has(matKey);
                              return (
                                <div key={matKey}>
                                  {/* 원재료 소계 행 */}
                                  <button onClick={() => toggleMaterial(matKey)}
                                    className="w-full flex items-center justify-between px-6 py-2 hover:bg-muted/20 transition-colors text-left border-b border-dashed">
                                    <div className="flex items-center gap-2">
                                      {isMatExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                                      <span className="text-xs font-medium">{mg.materialName}</span>
                                      <Badge variant="outline" className="text-[10px] px-1 py-0">{mg.items.length}건</Badge>
                                    </div>
                                    <span className="text-xs font-mono font-semibold">
                                      {fmt(mg.subtotalQty)} <span className="text-muted-foreground font-normal">{mg.unit}</span>
                                    </span>
                                  </button>

                                  {/* 개별 소모 상세 (원재료 확장 시) */}
                                  {isMatExpanded && (
                                    <div className="bg-background/50">
                                      {mg.items.map((item: any, idx: number) => (
                                        <div key={idx} className="flex items-center justify-between px-10 py-1.5 text-[11px] border-b border-dotted last:border-0">
                                          <div className="flex items-center gap-3">
                                            <span className="text-muted-foreground w-4 text-right">{idx+1}</span>
                                            {item.sourceType === "BATCH" ? (
                                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">배치#{item.sourceId}</Badge>
                                            ) : (
                                              <span className="text-muted-foreground">{item.sourceType || "수동"}</span>
                                            )}
                                            {item.lotNumber && <span className="font-mono text-muted-foreground">{item.lotNumber}</span>}
                                            {item.notes && <span className="text-muted-foreground truncate max-w-[200px]">{item.notes}</span>}
                                          </div>
                                          <span className="font-mono whitespace-nowrap">
                                            {fmt(item.quantity)} <span className="text-muted-foreground">{item.unit}</span>
                                            {item.amount > 0 && <span className="text-muted-foreground ml-2">{won(item.amount)}</span>}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 월간 총합계 */}
                <div className="bg-orange-50/50 dark:bg-orange-950/20 border-t-2 border-orange-300 dark:border-orange-800 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-bold">월간 합계</span>
                  <div className="text-right">
                    <span className="text-sm font-mono font-bold text-orange-700 dark:text-orange-400">{summary.totalRecords}건</span>
                    <span className="text-xs text-muted-foreground mx-2">|</span>
                    <span className="text-sm font-mono font-bold text-orange-700 dark:text-orange-400">{fmt(summary.grandTotalQuantity)}</span>
                    {summary.grandTotalAmount > 0 && (
                      <>
                        <span className="text-xs text-muted-foreground mx-2">|</span>
                        <span className="text-sm font-mono font-bold">{won(summary.grandTotalAmount)}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
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
    onError: (e: any) => alert(`실패: ${e.message}`),
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

/* ═══════════════════════════════════════════════════
   부자재 · 외주제품 재고 현황 (간소화 LOT 뷰)
   ═══════════════════════════════════════════════════ */
function SubsidiaryStockView({ filterType }: { filterType: "subsidiary" | "external_product" }) {
  const { data: allLots, isLoading } = trpc.inventory.listLots.useQuery();
  const label = filterType === "subsidiary" ? "부자재" : "외주제품";

  const subsidiaryLots = useMemo(() => {
    if (!allLots) return [];
    return (allLots as any[]).filter((lot: any) => lot.itemType === filterType);
  }, [allLots, filterType]);

  const activeLots = subsidiaryLots.filter((l: any) => l.status === "available");
  const totalValue = activeLots.reduce((sum: number, l: any) => {
    return sum + (parseFloat(l.availableQuantity || "0") * parseFloat(l.unitPrice || "0"));
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
                  {subsidiaryLots.map((lot: any) => (
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
