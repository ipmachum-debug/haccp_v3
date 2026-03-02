import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsTrigger, TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, RotateCw, AlertCircle, Calendar, PackageMinus, PackagePlus, Settings, RefreshCw, Factory, ScanBarcode, Truck, BoxIcon, BarChart3, ShieldCheck, Clock, Layers, Hash } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import LotTraceabilityModal from "@/components/LotTraceabilityModal";

/* ───────────────────── helpers ───────────────────── */
const fmt = (v: any, d = 2) => Number(v || 0).toFixed(d);
const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString("ko-KR") : "-";
const won = (v: any) => `₩${Number(v || 0).toLocaleString()}`;
const Empty = ({ text = "데이터가 없습니다." }: { text?: string }) => (
  <div className="text-center py-12 text-muted-foreground text-base">{text}</div>
);
const Loading = () => <div className="text-center py-12 text-muted-foreground text-base animate-pulse">로딩 중...</div>;

/* ─────────── 통계 카드 ─────────── */
function StatCard({ icon: Icon, label, value, sub, color = "blue" }: {
  icon: any; label: string; value: string | number; sub?: string;
  color?: "blue" | "emerald" | "amber" | "red" | "purple" | "slate";
}) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-600/5 border-blue-200 dark:border-blue-800 dark:from-blue-500/20 dark:to-blue-600/10",
    emerald: "from-emerald-500/10 to-emerald-600/5 border-emerald-200 dark:border-emerald-800 dark:from-emerald-500/20",
    amber: "from-amber-500/10 to-amber-600/5 border-amber-200 dark:border-amber-800 dark:from-amber-500/20",
    red: "from-red-500/10 to-red-600/5 border-red-200 dark:border-red-800 dark:from-red-500/20",
    purple: "from-purple-500/10 to-purple-600/5 border-purple-200 dark:border-purple-800 dark:from-purple-500/20",
    slate: "from-slate-500/10 to-slate-600/5 border-slate-200 dark:border-slate-800 dark:from-slate-500/20",
  };
  const iconColors: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400", emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400", red: "text-red-600 dark:text-red-400",
    purple: "text-purple-600 dark:text-purple-400", slate: "text-slate-600 dark:text-slate-400",
  };
  const iconBg: Record<string, string> = {
    blue: "bg-blue-100 dark:bg-blue-900/40", emerald: "bg-emerald-100 dark:bg-emerald-900/40",
    amber: "bg-amber-100 dark:bg-amber-900/40", red: "bg-red-100 dark:bg-red-900/40",
    purple: "bg-purple-100 dark:bg-purple-900/40", slate: "bg-slate-100 dark:bg-slate-900/40",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-lg p-3 flex items-center gap-3`}>
      <div className={`p-2 rounded-lg ${iconBg[color]} shrink-0`}>
        <Icon className={`h-5 w-5 ${iconColors[color]}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground leading-none truncate">{label}</p>
        <p className="text-lg font-bold leading-tight mt-1 truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

/* ─────────── 테이블 래퍼 ─────────── */
const StyledTable = ({ children }: { children: React.ReactNode }) => (
  <div className="border rounded-lg overflow-hidden">
    <Table>{children}</Table>
  </div>
);
const TH = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => (
  <TableHead className={`text-xs h-9 font-semibold bg-muted/50 px-3 ${className}`}>{children}</TableHead>
);
const TD = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => (
  <TableCell className={`text-xs py-2 px-3 ${className}`}>{children}</TableCell>
);

/* ─────────── 섹션 제목 ─────────── */
function SectionTitle({ icon: Icon, title, desc, right }: { icon: any; title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
        {desc && <span className="text-xs text-muted-foreground ml-1">· {desc}</span>}
      </div>
      {right}
    </div>
  );
}

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
      <div className="py-3 px-2 md:px-4 space-y-4 max-w-full">

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
            <TabsTrigger value="release" className="text-xs gap-1 data-[state=active]:font-semibold"><PackageMinus className="h-3.5 w-3.5" />출고</TabsTrigger>
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
            {isMat ? <ReleaseTab /> : <ProductReleaseInfo />}
          </TabsContent>

          {/* ━━━ 입고 ━━━ */}
          <TabsContent value="receipt" className="space-y-5 mt-0">
            {isMat ? <ReceiptTab /> : <ProductReceiptInfo />}
          </TabsContent>

          {/* ━━━ 추이 ━━━ */}
          <TabsContent value="trend" className="mt-0">
            <Card>
              <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
                <div className="flex items-center justify-between">
                  <SectionTitle icon={TrendingUp} title={`${isMat ? "원재료" : "제품"} 재고 이동 추이`} desc={isMat ? "일별 입고/사용/조정" : "일별 생산/출고/조정"} />
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
                        <TH>{isMat ? "입고" : "생산"}</TH>
                        <TH>{isMat ? "사용" : "출고"}</TH>
                        <TH>조정</TH>
                        <TH>순변동</TH>
                        <TH className="text-center">건수</TH>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trend.map((r) => (
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
          </TabsContent>

          {/* ━━━ 회전율 ━━━ */}
          <TabsContent value="turnover" className="mt-0">
            <Card>
              <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
                <SectionTitle icon={RotateCw} title={`${isMat ? "원재료" : "제품"}별 회전율`} desc={trendPeriod === "week" ? "최근 7일" : "최근 30일"} />
              </CardHeader>
              <CardContent className="p-3">
                {isLoadingTurnover ? <Loading /> : !turnoverAnalysis?.length ? <Empty text="데이터 없음" /> : (
                  <StyledTable>
                    <TableHeader>
                      <TableRow>
                        <TH>{isMat ? "원재료" : "제품"}</TH>
                        <TH>{isMat ? "사용량" : "출고량"}</TH>
                        <TH>재고</TH>
                        <TH>회전율</TH>
                        <TH>재고일수</TH>
                        <TH>효율</TH>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {turnoverAnalysis.map((m) => (
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
   원재료 재고현황 뷰
   ═══════════════════════════════════════════════════ */
function MaterialStockView({ dashboard, isLoading }: { dashboard: any; isLoading: boolean }) {
  return (
    <div className="space-y-4">
      {/* 스탯 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={Layers} label="전체 LOT" value={isLoading ? "-" : dashboard?.stats.totalLots?.toLocaleString() || "0"} color="blue" />
        <StatCard icon={ShieldCheck} label="가용 LOT" value={isLoading ? "-" : dashboard?.stats.availableLots?.toLocaleString() || "0"} color="emerald" />
        <StatCard icon={BarChart3} label="총 재고가치" value={isLoading ? "-" : won(dashboard?.stats.totalValue)} color="slate" />
        <StatCard icon={Clock} label="유통기한 임박" value={isLoading ? "-" : dashboard?.stats.expiringSoonLots?.toLocaleString() || "0"} color="red" sub="7일 이내" />
        <StatCard icon={AlertCircle} label="재고 부족" value={isLoading ? "-" : dashboard?.stats.lowStockCount?.toLocaleString() || "0"} color="amber" sub="안전재고 미달" />
      </div>

      {/* 원재료별 전체 재고 */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <SectionTitle icon={Package} title="원재료별 재고 현황" />
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? <Loading /> : !dashboard?.materialStocks?.length ? <Empty /> : (
            <StyledTable>
              <TableHeader><TableRow>
                <TH>원재료</TH><TH>총 수량</TH><TH className="text-center">LOT</TH>
                <TH className="text-right">단가</TH><TH className="text-right">총 가치</TH><TH className="text-center">상태</TH>
              </TableRow></TableHeader>
              <TableBody>
                {dashboard.materialStocks.map((m: any) => (
                  <TableRow key={m.materialId} className="hover:bg-muted/30">
                    <TD>
                      <span className="font-medium">{m.materialName}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{m.materialCode}</span>
                    </TD>
                    <TD className="font-mono">{fmt(m.totalQuantity)} {m.unit}</TD>
                    <TD className="text-center">{m.lotCount}</TD>
                    <TD className="text-right text-muted-foreground">{won(m.unitPrice)}</TD>
                    <TD className="text-right font-medium">{won(m.totalValue)}</TD>
                    <TD className="text-center">
                      <Badge variant={m.isLowStock ? "destructive" : "secondary"} className="text-xs px-2.5 py-1">
                        {m.isLowStock ? "부족" : "정상"}
                      </Badge>
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </StyledTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   제품 재고현황 뷰 (배치 + SKU 기반)
   ═══════════════════════════════════════════════════ */
function ProductStockView() {
  const { data: batches, isLoading } = trpc.batch.list.useQuery({ limit: 100 });
  const { data: skuList } = trpc.productSku.listAll.useQuery();
  const { data: itemList } = trpc.itemMaster.list.useQuery({ itemType: "own_product" });

  const productInventory = useMemo(() => {
    if (!batches) return [];
    const batchList: any[] = Array.isArray(batches) ? batches : (batches as any)?.batches || [];
    const productMap = new Map<string, { productName: string; productCode: string; totalProduced: number; lotCount: number; latestBatch: string; skuCount: number; isOem: boolean }>();

    batchList.filter((b: any) => b.status === "completed").forEach((batch: any) => {
      const key = batch.productName || batch.productId?.toString() || "unknown";
      const existing = productMap.get(key) || {
        productName: batch.productName || "알 수 없음",
        productCode: batch.productCode || batch.batchCode?.split("-")?.[0] || "",
        totalProduced: 0, lotCount: 0, latestBatch: "", skuCount: 0, isOem: false,
      };
      existing.totalProduced += parseFloat(batch.actualQuantity || batch.plannedQuantity || "0");
      existing.lotCount += 1;
      existing.latestBatch = batch.endTime || batch.startTime || existing.latestBatch;
      productMap.set(key, existing);
    });

    const items = Array.isArray(itemList) ? itemList : (itemList as any)?.items || [];
    const skus = Array.isArray(skuList) ? skuList : [];
    items.forEach((item: any) => {
      const matchedSkus = skus.filter((s: any) => s.itemId === item.id);
      const key = item.itemName;
      const existing = productMap.get(key);
      if (existing) {
        existing.skuCount = matchedSkus.length;
        existing.isOem = !!item.oemSupplierId;
      }
    });

    return Array.from(productMap.values());
  }, [batches, skuList, itemList]);

  const totalProduced = productInventory.reduce((s, p) => s + p.totalProduced, 0);
  const totalBatches = productInventory.reduce((s, p) => s + p.lotCount, 0);
  const oemCount = productInventory.filter(p => p.isOem).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={BoxIcon} label="제품 종류" value={productInventory.length} color="blue" />
        <StatCard icon={Hash} label="총 생산 배치" value={totalBatches} color="emerald" />
        <StatCard icon={BarChart3} label="총 생산량" value={`${totalProduced.toFixed(1)} kg`} color="slate" />
        <StatCard icon={Truck} label="OEM 제품" value={oemCount} sub="외부 위탁 생산" color="purple" />
      </div>

      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <SectionTitle icon={Factory} title="제품별 재고 현황" desc="완료 배치 기준 · SKU/OEM 포함" />
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? <Loading /> : !productInventory.length ? <Empty text="제품 재고 없음" /> : (
            <StyledTable>
              <TableHeader><TableRow>
                <TH>제품명</TH><TH>코드</TH><TH className="text-right">생산량</TH>
                <TH className="text-center">배치</TH><TH className="text-center">SKU</TH>
                <TH className="text-center">유형</TH><TH>최근생산</TH>
              </TableRow></TableHeader>
              <TableBody>
                {productInventory.map((p, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    <TD className="font-medium">{p.productName}</TD>
                    <TD className="text-muted-foreground font-mono text-xs">{p.productCode}</TD>
                    <TD className="text-right font-mono">{p.totalProduced.toFixed(1)}</TD>
                    <TD className="text-center">{p.lotCount}</TD>
                    <TD className="text-center">
                      {p.skuCount > 0 ? <Badge className="text-xs px-2.5 py-1">{p.skuCount}</Badge> : <span className="text-muted-foreground">-</span>}
                    </TD>
                    <TD className="text-center">
                      {p.isOem ? <Badge variant="outline" className="text-xs px-2.5 py-1 border-purple-400 text-purple-600">OEM</Badge>
                               : <Badge variant="secondary" className="text-xs px-2.5 py-1">자사</Badge>}
                    </TD>
                    <TD className="text-muted-foreground">{fmtDate(p.latestBatch)}</TD>
                  </TableRow>
                ))}
              </TableBody>
            </StyledTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   제품 입고 안내 (생산 배치 연동)
   ═══════════════════════════════════════════════════ */
function ProductReceiptInfo() {
  const { data: batches } = trpc.batch.list.useQuery({ limit: 20 });
  const recentCompleted = useMemo(() => {
    const list: any[] = Array.isArray(batches) ? batches : (batches as any)?.batches || [];
    return list.filter((b: any) => b.status === "completed").slice(0, 10);
  }, [batches]);

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle icon={Factory} title="제품 입고 (생산 배치 연동)" desc="생산 완료 배치 자동 반영" />
      </CardHeader>
      <CardContent className="p-3">
        {!recentCompleted.length ? <Empty text="최근 완료 배치 없음" /> : (
          <StyledTable>
            <TableHeader><TableRow>
              <TH>배치번호</TH><TH>제품</TH><TH className="text-right">생산량</TH>
              <TH>완료일</TH><TH className="text-center">상태</TH>
            </TableRow></TableHeader>
            <TableBody>
              {recentCompleted.map((b: any) => (
                <TableRow key={b.id} className="hover:bg-muted/30">
                  <TD className="font-mono text-xs">{b.batchCode || b.batchNumber}</TD>
                  <TD className="font-medium">{b.productName || "-"}</TD>
                  <TD className="text-right font-mono">{fmt(b.actualQuantity || b.plannedQuantity)}</TD>
                  <TD className="text-muted-foreground">{fmtDate(b.endTime)}</TD>
                  <TD className="text-center">
                    <Badge variant="default" className="text-xs px-2.5 py-1 bg-emerald-600">입고완료</Badge>
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
   제품 출고 안내
   ═══════════════════════════════════════════════════ */
function ProductReleaseInfo() {
  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle icon={Truck} title="제품 출고 (판매/납품)" desc="SKU 단위 거래처 출고" />
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[
            { icon: BoxIcon, title: "SKU 단위 출고", desc: "포장 규격(box, pack 등) 기준 출고 수량 관리" },
            { icon: Truck, title: "거래처 연동", desc: "출고 시 거래처(고객사)를 선택하여 납품 이력 추적" },
            { icon: ScanBarcode, title: "LOT 추적", desc: "생산 배치 LOT와 연결되어 출고 제품 이력 추적" },
          ].map((item, i) => (
            <div key={i} className="border rounded-xl p-6 bg-muted/20 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-2.5 mb-3">
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <p className="text-base font-semibold">{item.title}</p>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════
   재고 예측 (원재료 전용)
   ═══════════════════════════════════════════════════ */
function PredictionTab() {
  const [days, setDays] = useState(30);
  const { data: preds, isLoading } = trpc.inventory.predictAllShortage.useQuery({ days });
  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <SectionTitle icon={AlertCircle} title="재고 부족 예측" desc="과거 사용 패턴 기반" />
          <Select value={days.toString()} onValueChange={(v) => setDays(+v)}>
            <SelectTrigger className="w-28 h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[7,14,30,60].map(d => <SelectItem key={d} value={d.toString()}>{d}일</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? <Loading /> : !preds?.length ? <Empty text="부족 예상 원재료 없음" /> : (
          <StyledTable>
            <TableHeader><TableRow>
              <TH>원재료</TH><TH>현재고</TH><TH>일평균</TH>
              <TH>부족일</TH><TH className="text-center">D-day</TH><TH className="text-center">우선</TH>
            </TableRow></TableHeader>
            <TableBody>
              {preds.map((p) => (
                <TableRow key={p.materialId} className="hover:bg-muted/30">
                  <TD>
                    <span className="font-medium">{p.materialName}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{p.materialCode}</span>
                  </TD>
                  <TD className="font-mono">{fmt(p.currentStock)} {p.unit}</TD>
                  <TD className="font-mono">{fmt(p.avgDailyUsage)} {p.unit}</TD>
                  <TD className="text-muted-foreground">{p.predictedShortageDate ? fmtDate(p.predictedShortageDate) : "-"}</TD>
                  <TD className="text-center">
                    <Badge variant={p.daysUntilShortage <= 7 ? "destructive" : "secondary"} className="text-xs px-2.5 py-1">{p.daysUntilShortage}일</Badge>
                  </TD>
                  <TD className="text-center">
                    <Badge variant={p.daysUntilShortage <= 7 ? "destructive" : p.daysUntilShortage <= 14 ? "secondary" : "outline"} className="text-xs px-2.5 py-1">
                      {p.daysUntilShortage <= 7 ? "긴급" : p.daysUntilShortage <= 14 ? "높음" : "보통"}
                    </Badge>
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
              {suggs.map((s) => (
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
   원재료 출고 탭 (전표 형태)
   ═══════════════════════════════════════════════════ */
function ReleaseTab() {
  const utils = trpc.useUtils();
  const today = new Date().toISOString().split("T")[0];
  const [releaseDate, setReleaseDate] = useState(today);
  const [releaseType, setReleaseType] = useState("production");
  const [selectedPartnerId, setSelectedPartnerId] = useState("none");
  const [memo, setMemo] = useState("");

  interface RI { id: number; lotId: string; materialName: string; availableQty: string; quantity: string; unit: string; unitPrice: string; amount: string; }
  const [items, setItems] = useState<RI[]>([{ id: 1, lotId: "", materialName: "", availableQty: "", quantity: "", unit: "", unitPrice: "0", amount: "0" }]);
  const [nextId, setNextId] = useState(2);
  const [hStart, setHStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; });
  const [hEnd, setHEnd] = useState(today);

  const { data: lots } = trpc.inventory.list.useQuery();
  const { data: partners } = trpc.partners.list.useQuery({ partnerType: "customer" });
  const { data: history, isLoading: hLoading } = trpc.inventory.getOutboundHistory.useQuery({ limit: 30, startDate: hStart, endDate: hEnd });
  const mut = trpc.inventory.releaseStock.useMutation({
    onSuccess: () => { utils.inventory.list.invalidate(); utils.inventory.getDashboard.invalidate(); utils.inventory.getOutboundHistory.invalidate(); },
    onError: (e: any) => alert(`출고 실패: ${e.message}`),
  });

  const handleLotChange = (itemId: number, lotIdStr: string) => {
    const lot = lots?.find((l: any) => l.id.toString() === lotIdStr);
    setItems(p => p.map(i => i.id === itemId ? { ...i, lotId: lotIdStr, materialName: lot?.materialName || "", availableQty: lot?.availableQuantity || "0", unit: lot?.unit || "", unitPrice: lot?.unitPrice || "0", quantity: "", amount: "0" } : i));
  };
  const handleQty = (id: number, q: string) => setItems(p => p.map(i => i.id === id ? { ...i, quantity: q, amount: q && i.unitPrice ? (parseFloat(q) * parseFloat(i.unitPrice)).toFixed(0) : "0" } : i));
  const handlePrice = (id: number, pr: string) => setItems(p => p.map(i => i.id === id ? { ...i, unitPrice: pr, amount: i.quantity && pr ? (parseFloat(i.quantity) * parseFloat(pr)).toFixed(0) : "0" } : i));
  const addItem = () => { setItems(p => [...p, { id: nextId, lotId: "", materialName: "", availableQty: "", quantity: "", unit: "", unitPrice: "0", amount: "0" }]); setNextId(p => p + 1); };
  const removeItem = (id: number) => { if (items.length > 1) setItems(p => p.filter(i => i.id !== id)); };
  const totalQty = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
  const totalAmt = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  const handleSubmit = async () => {
    const valid = items.filter(i => i.lotId && i.quantity && parseFloat(i.quantity) > 0);
    if (!valid.length) { alert("품목 입력 필요"); return; }
    for (const i of valid) { if (parseFloat(i.availableQty) > 0 && parseFloat(i.quantity) > parseFloat(i.availableQty)) { alert(`${i.materialName}: 가용 재고 초과`); return; } }
    const typeLabel = releaseType === "production" ? "생산투입" : releaseType === "sale" ? "판매출고" : releaseType === "disposal" ? "폐기" : "기타";
    if (!confirm(`${valid.length}건 [${typeLabel}] 출고?`)) return;
    try {
      for (const i of valid) {
        const pn = selectedPartnerId !== "none" ? partners?.find((p: any) => p.id.toString() === selectedPartnerId)?.companyName : undefined;
        await mut.mutateAsync({ lotId: parseInt(i.lotId), quantity: parseFloat(i.quantity), releaseDate, reason: [typeLabel, pn, memo].filter(Boolean).join(" | "), destination: pn || undefined });
      }
      alert(`${valid.length}건 출고 완료`);
      setItems([{ id: nextId, lotId: "", materialName: "", availableQty: "", quantity: "", unit: "", unitPrice: "0", amount: "0" }]); setNextId(p => p + 1); setMemo(""); setSelectedPartnerId("none");
    } catch {}
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <SectionTitle icon={PackageMinus} title="원재료 출고 전표" />
            <Badge variant="outline" className="text-sm font-mono px-3 py-1.5">{releaseDate}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">출고일</label>
              <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" />
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">유형</label>
              <Select value={releaseType} onValueChange={setReleaseType}>
                <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">생산투입</SelectItem>
                  <SelectItem value="sale">판매출고</SelectItem>
                  <SelectItem value="disposal">폐기</SelectItem>
                  <SelectItem value="other">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">거래처</label>
              <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안함</SelectItem>
                  {partners?.map((p: any) => <SelectItem key={p.id} value={p.id.toString()}>{p.companyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">메모</label>
              <input type="text" value={memo} onChange={e => setMemo(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" placeholder="메모 입력" />
            </div>
          </div>

          <StyledTable>
            <TableHeader><TableRow>
              <TH className="w-12 text-center">No</TH>
              <TH className="min-w-[180px]">LOT</TH>
              <TH>품명</TH>
              <TH className="text-right w-24">가용</TH>
              <TH className="text-right w-28">수량</TH>
              <TH className="text-center w-16">단위</TH>
              <TH className="text-right w-28">단가</TH>
              <TH className="text-right w-28">금액</TH>
              <TH className="w-12"></TH>
            </TableRow></TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={item.id}>
                  <TD className="text-center text-muted-foreground">{idx+1}</TD>
                  <TD className="py-2">
                    <Select value={item.lotId} onValueChange={v => handleLotChange(item.id, v)}>
                      <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="LOT 선택" /></SelectTrigger>
                      <SelectContent>{lots?.filter((l:any) => parseFloat(l.availableQuantity)>0 || l.id.toString()===item.lotId).map((l:any) => (
                        <SelectItem key={l.id} value={l.id.toString()}><span className="text-sm">{l.lotNumber} - {l.materialName} ({l.availableQuantity})</span></SelectItem>
                      ))}</SelectContent>
                    </Select>
                  </TD>
                  <TD>{item.materialName || "-"}</TD>
                  <TD className="text-right">{item.availableQty ? <span className={parseFloat(item.availableQty)<=0?"text-red-500":""}>{parseFloat(item.availableQty).toFixed(1)}</span> : "-"}</TD>
                  <TD className="py-2"><input type="number" step="0.01" min="0" value={item.quantity} onChange={e => handleQty(item.id, e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm text-right bg-background" /></TD>
                  <TD className="text-center text-muted-foreground">{item.unit || "-"}</TD>
                  <TD className="py-2"><input type="number" step="1" min="0" value={item.unitPrice} onChange={e => handlePrice(item.id, e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm text-right bg-background" /></TD>
                  <TD className="text-right font-medium">{parseFloat(item.amount)>0 ? won(item.amount) : "-"}</TD>
                  <TD className="text-center py-2">{items.length>1 && <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 text-base">✕</button>}</TD>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-medium border-t-2">
                <TD colSpan={4} className="text-right font-semibold">합계</TD>
                <TD className="text-right font-mono">{totalQty>0?totalQty.toFixed(2):"-"}</TD>
                <TD colSpan={2}></TD>
                <TD className="text-right font-bold">{totalAmt>0?won(totalAmt):"-"}</TD>
                <TD></TD>
              </TableRow>
            </TableBody>
          </StyledTable>

          <div className="flex items-center justify-between mt-5">
            <Button variant="outline" onClick={addItem} className="h-10 text-sm px-5"><PackageMinus className="h-4 w-4 mr-2" />품목 추가</Button>
            <Button onClick={handleSubmit} disabled={mut.isPending || items.every(i => !i.lotId || !i.quantity)} className="h-10 text-sm px-6">
              {mut.isPending ? "처리 중..." : "출고 저장"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 출고 이력 */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <SectionTitle icon={Clock} title="출고 이력" />
            <div className="flex items-center gap-2">
              <input type="date" value={hStart} onChange={e => setHStart(e.target.value)} className="h-10 px-3 border rounded-lg text-sm bg-background" />
              <span className="text-sm text-muted-foreground">~</span>
              <input type="date" value={hEnd} onChange={e => setHEnd(e.target.value)} className="h-10 px-3 border rounded-lg text-sm bg-background" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {hLoading ? <Loading /> : !history?.length ? <Empty text="출고 이력 없음" /> : (
            <StyledTable>
              <TableHeader><TableRow>
                <TH className="w-12 text-center">No</TH>
                <TH>일시</TH><TH>품명</TH><TH>LOT</TH>
                <TH className="text-right">수량</TH><TH>사유</TH>
              </TableRow></TableHeader>
              <TableBody>
                {history.map((r: any, i: number) => (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TD className="text-center text-muted-foreground">{i+1}</TD>
                    <TD className="text-muted-foreground">{fmtDate(r.createdAt)}</TD>
                    <TD>{r.materialName || "-"}</TD>
                    <TD className="font-mono text-xs">{r.lotNumber || "-"}</TD>
                    <TD className="text-right font-mono font-medium">{r.quantity} {r.unit}</TD>
                    <TD className="text-muted-foreground truncate max-w-[250px]">{r.notes || "-"}</TD>
                  </TableRow>
                ))}
              </TableBody>
            </StyledTable>
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
  const [matId, setMatId] = useState(""); const [qty, setQty] = useState(""); const [unit, setUnit] = useState("kg");
  const [price, setPrice] = useState(""); const [supplier, setSupplier] = useState(""); const [expiry, setExpiry] = useState("");
  const [rcptDate, setRcptDate] = useState(today); const [notes, setNotes] = useState(""); const [showForm, setShowForm] = useState(false);

  const { data: _raw } = trpc.material.list.useQuery({ limit: 9999 });
  const mats: any[] = (_raw as any)?.items ?? (Array.isArray(_raw) ? _raw : []);
  const { data: receipts, isLoading } = trpc.inventory.getInboundHistory.useQuery({ limit: 50 });

  const createMut = trpc.lotManagement.createReceivingWithLot.useMutation({
    onSuccess: (r: any) => { utils.inventory.getInboundHistory.invalidate(); utils.inventory.list.invalidate(); utils.inventory.getDashboard.invalidate();
      alert(`입고 완료! LOT: ${r.lotNumber}`); setMatId(""); setQty(""); setPrice(""); setSupplier(""); setExpiry(""); setNotes(""); setShowForm(false); },
    onError: (e: any) => alert(`실패: ${e.message}`),
  });
  const backfillMut = trpc.lotManagement.backfillLots.useMutation({
    onSuccess: (r: any) => { utils.inventory.getInboundHistory.invalidate(); utils.inventory.list.invalidate(); alert(`LOT 일괄 생성: ${r?.created || 0}건`); },
    onError: (e: any) => alert(`실패: ${e.message}`),
  });

  const handleSubmit = () => {
    if (!matId || !qty) { alert("원재료·수량 필수"); return; }
    const mat = mats.find((m: any) => m.id.toString() === matId);
    if (!mat) return;
    createMut.mutate({ materialId: mat.id, materialCode: mat.materialCode || `M${mat.id}`, quantity: parseFloat(qty), unit,
      unitPrice: price ? parseFloat(price) : undefined, supplierName: supplier || undefined, expiryDate: expiry || undefined, receiptDate: rcptDate || undefined, notes: notes || undefined });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <SectionTitle icon={PackagePlus} title="원재료 입고 (LOT 자동생성)" desc="입고 시 자동 LOT 번호 생성" />
            <div className="flex gap-2">
              <Button variant="outline" className="h-10 text-sm px-4" disabled={backfillMut.isPending}
                onClick={() => { if(confirm("기존 데이터 LOT 일괄 생성?")) backfillMut.mutate(); }}>
                <RefreshCw className={`h-4 w-4 mr-2 ${backfillMut.isPending?"animate-spin":""}`} />LOT 일괄
              </Button>
              <Button className="h-10 text-sm px-4" onClick={() => setShowForm(!showForm)}>
                <PackagePlus className="h-4 w-4 mr-2" />{showForm ? "접기" : "입고 등록"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showForm && (
          <CardContent className="px-6 pb-5 pt-5 border-b bg-blue-50/30 dark:bg-blue-950/10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-5">
              <div><label className="text-sm font-medium text-muted-foreground mb-2 block">원재료 *</label>
                <Select value={matId} onValueChange={setMatId}><SelectTrigger className="h-10 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>{mats.map((m:any) => <SelectItem key={m.id} value={m.id.toString()}>{m.materialName} ({m.materialCode || `M${m.id}`})</SelectItem>)}</SelectContent></Select></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-2 block">수량 *</label>
                <input type="number" step="0.01" value={qty} onChange={e=>setQty(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" placeholder="0" /></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-2 block">단위</label>
                <Select value={unit} onValueChange={setUnit}><SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{["kg","g","L","mL","EA","BOX"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-2 block">단가</label>
                <input type="number" step="1" value={price} onChange={e=>setPrice(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" placeholder="0" /></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-2 block">공급업체</label>
                <input type="text" value={supplier} onChange={e=>setSupplier(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" placeholder="업체명" /></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-2 block">입고일</label>
                <input type="date" value={rcptDate} onChange={e=>setRcptDate(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" /></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-2 block">소비기한</label>
                <input type="date" value={expiry} onChange={e=>setExpiry(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" /></div>
              <div><label className="text-sm font-medium text-muted-foreground mb-2 block">비고</label>
                <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" placeholder="비고" /></div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSubmit} disabled={createMut.isPending || !matId || !qty} className="h-10 text-sm px-6">
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
            <StyledTable>
              <TableHeader><TableRow>
                <TH>입고일</TH><TH>LOT</TH><TH>원재료</TH>
                <TH className="text-right">수량</TH><TH>공급업체</TH><TH>소비기한</TH>
              </TableRow></TableHeader>
              <TableBody>
                {receipts.map((r: any) => (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TD className="text-muted-foreground">{fmtDate(r.createdAt)}</TD>
                    <TD className="font-mono text-xs font-medium">{r.lotNumber || "-"}</TD>
                    <TD>{r.materialName} <span className="text-muted-foreground text-xs">{r.materialCode}</span></TD>
                    <TD className="text-right font-mono">{r.quantity} {r.unit}</TD>
                    <TD className="text-muted-foreground">{r.supplierName || "-"}</TD>
                    <TD className="text-muted-foreground">{fmtDate(r.expiryDate)}</TD>
                  </TableRow>
                ))}
              </TableBody>
            </StyledTable>
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
    onSuccess: () => { utils.inventory.list.invalidate(); utils.inventory.getDashboard.invalidate(); alert("조정 완료"); setLotId(null); setQty(""); setReason(""); },
    onError: (e) => alert(`실패: ${e.message}`),
  });
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotId || !qty || !reason) { alert("모든 필드 입력 필요"); return; }
    if (confirm(`재고 ${adjType === "increase" ? "증가" : "감소"}?`))
      mut.mutate({ lotId, quantityChange: adjType === "increase" ? parseFloat(qty) : -parseFloat(qty), reason });
  };

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle icon={Settings} title={`${isMat ? "원재료" : "제품"} 재고 조정`} desc="수량을 수동 조정합니다" />
      </CardHeader>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5 items-end">
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">LOT 선택</label>
            <Select value={lotId?.toString() || ""} onValueChange={v => setLotId(parseInt(v))}>
              <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="LOT 선택" /></SelectTrigger>
              <SelectContent>{lots?.map((l: any) => (
                <SelectItem key={l.id} value={l.id.toString()}><span className="text-sm">{l.lotNumber} - {l.materialName} ({l.availableQuantity} {l.unit})</span></SelectItem>
              ))}</SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">조정 유형</label>
            <Select value={adjType} onValueChange={(v: any) => setAdjType(v)}>
              <SelectTrigger className="h-10 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="increase">증가</SelectItem>
                <SelectItem value="decrease">감소</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">수량</label>
            <input type="number" step="0.01" value={qty} onChange={e => setQty(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" placeholder="0" />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground mb-2 block">사유 (필수)</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} className="w-full h-10 px-3 border rounded-lg text-sm bg-background" placeholder="조정 사유 입력" required />
          </div>
          <Button type="submit" disabled={mut.isPending} className="h-10 text-sm">
            {mut.isPending ? "처리 중..." : "조정 처리"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
