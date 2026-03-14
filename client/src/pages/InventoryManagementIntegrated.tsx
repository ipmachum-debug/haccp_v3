import { useState, useMemo, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsTrigger, TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, RotateCw, AlertCircle, Calendar, PackageMinus, PackagePlus, Settings, RefreshCw, Factory, ScanBarcode, Truck, BoxIcon, BarChart3, ShieldCheck, Clock, Layers, Hash, Building2, Search, Check, X } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { skipToken } from "@tanstack/react-query";
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
   거래처 검색/자동완성 입력 (비용전표 패턴)
   ═══════════════════════════════════════════════════ */
function PartnerSearchInput({ partnerType, selectedId, selectedName, onSelect, onClear, required = false, label, placeholder }: {
  partnerType?: "supplier" | "customer" | "subcontractor";
  selectedId: number | null;
  selectedName: string;
  onSelect: (id: number, name: string) => void;
  onClear: () => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  // 포커스 시 즉시 검색 (빈 검색어도 허용 → 전체 목록 표시)
  const q = trpc.partners.search.useQuery(
    open ? { search: search || "", partnerType, limit: 20 } : skipToken,
    { staleTime: 10_000 }
  );
  const results: any[] = (q.data as any[]) ?? [];
  return (
    <div className="relative">
      {label && <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label} {required && <span className="text-red-500">*</span>}</label>}
      {selectedId ? (
        <div className="flex items-center gap-2 h-9 px-3 border rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-700">
          <Building2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate flex-1">{selectedName}</span>
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-red-500 transition shrink-0"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} placeholder={placeholder || "거래처 검색 (클릭 시 전체 목록)"}
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            className="w-full h-9 pl-8 pr-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
        </div>
      )}
      {open && !selectedId && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-52 overflow-y-auto">
          {q.isFetching && <div className="px-3 py-2 text-xs text-muted-foreground text-center">검색 중...</div>}
          {!q.isFetching && results.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground text-center">{search ? "검색 결과 없음" : "등록된 거래처가 없습니다"}</div>}
          {results.map((p: any) => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-xs flex items-center gap-2 border-b last:border-0"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(p.id, p.company_name); setSearch(""); setOpen(false); }}>
              <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{p.company_name}</span>
              {p.biz_no && <span className="text-[10px] text-muted-foreground shrink-0">{p.biz_no}</span>}
              <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 ml-auto">
                {p.partner_type === "supplier" ? "공급" : p.partner_type === "customer" ? "고객" : "외주"}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   원재료 검색/자동완성 입력
   ═══════════════════════════════════════════════════ */
function MaterialSearchInput({ selectedId, selectedName, onSelect, onClear, required = false, label }: {
  selectedId: number | null;
  selectedName: string;
  onSelect: (id: number, name: string, data?: any) => void;
  onClear: () => void;
  required?: boolean;
  label?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data: _raw } = trpc.material.list.useQuery({ limit: 200, search: search || undefined });
  const mats: any[] = (_raw as any)?.items ?? (Array.isArray(_raw) ? _raw : []);

  return (
    <div className="relative">
      {label && <label className="text-xs font-medium text-muted-foreground mb-1.5 block">{label} {required && <span className="text-red-500">*</span>}</label>}
      {selectedId ? (
        <div className="flex items-center gap-2 h-9 px-3 border rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border-blue-300 dark:border-blue-700">
          <Package className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          <span className="text-xs font-medium text-blue-700 dark:text-blue-300 truncate flex-1">{selectedName}</span>
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-red-500 transition shrink-0"><X className="h-3.5 w-3.5" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} placeholder="원재료 검색 (클릭 시 전체 목록)"
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            className="w-full h-9 pl-8 pr-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
        </div>
      )}
      {open && !selectedId && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-52 overflow-y-auto">
          {mats.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground text-center">{search ? "검색 결과 없음" : "원재료를 검색하세요"}</div>}
          {mats.slice(0, 20).map((m: any) => (
            <button key={m.id} type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-xs flex items-center gap-2 border-b last:border-0"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(m.id, m.materialName || m.itemName || `M${m.id}`, m); setSearch(""); setOpen(false); }}>
              <Package className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{m.materialName || m.itemName}</span>
              <span className="text-[10px] text-muted-foreground shrink-0">{m.materialCode || m.itemCode || `M${m.id}`}</span>
              {m.unit && <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">{m.unit}</span>}
            </button>
          ))}
        </div>
      )}
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
  const { data: batches, isLoading: isLoadingBatches } = trpc.batch.list.useQuery({ limit: 500 });
  const { data: skuList } = trpc.productSku.listAll.useQuery();
  const { data: itemList, isLoading: isLoadingItems } = trpc.itemMaster.list.useQuery({ itemType: "own_product", limit: 500 });
  const isLoading = isLoadingBatches || isLoadingItems;

  const productInventory = useMemo(() => {
    // 품목마스터(own_product) 기준으로 시작 → 재고 0인 제품도 표시
    const items = Array.isArray(itemList) ? itemList : (itemList as any)?.items || [];
    if (!items.length) return [];

    // batch.list 응답: { items, total, page, limit } 구조
    const batchList: any[] = batches
      ? (Array.isArray(batches) ? batches : (batches as any)?.items || [])
      : [];
    const skus = Array.isArray(skuList) ? skuList : [];

    // 배치 데이터를 productId 기준으로 집계 (hBatches에는 productName이 없으므로 productId 사용)
    const batchMap = new Map<number, { totalProduced: number; lotCount: number; latestBatch: string }>();
    batchList.filter((b: any) => b.status === "completed").forEach((batch: any) => {
      const key = Number(batch.productId);
      if (!key) return;
      const existing = batchMap.get(key) || { totalProduced: 0, lotCount: 0, latestBatch: "" };
      existing.totalProduced += parseFloat(batch.actualQuantity || batch.plannedQuantity || "0");
      existing.lotCount += 1;
      existing.latestBatch = batch.endTime || batch.startTime || existing.latestBatch;
      batchMap.set(key, existing);
    });

    // 품목마스터 기준으로 결합 (배치 없어도 0으로 표시)
    // itemMaster.legacyProductId === hBatches.productId 로 매칭
    return items.map((item: any) => {
      const matchedSkus = skus.filter((s: any) => s.itemId === item.id);
      const legacyId = Number(item.legacyProductId);
      const batchData = legacyId ? (batchMap.get(legacyId) || { totalProduced: 0, lotCount: 0, latestBatch: "" })
                                 : { totalProduced: 0, lotCount: 0, latestBatch: "" };
      return {
        productName: item.itemName || "알 수 없음",
        productCode: item.itemCode || "",
        totalProduced: batchData.totalProduced,
        lotCount: batchData.lotCount,
        latestBatch: batchData.latestBatch,
        skuCount: matchedSkus.length,
        isOem: !!item.oemSupplierId,
      };
    });
  }, [batches, skuList, itemList]);

  const totalProduced = productInventory.reduce((s: any, p: any) => s + p.totalProduced, 0);
  const totalBatches = productInventory.reduce((s: any, p: any) => s + p.lotCount, 0);
  const oemCount = productInventory.filter((p: any) => p.isOem).length;

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
          <SectionTitle icon={Factory} title="제품별 재고 현황" desc="품목마스터 기준 · SKU/OEM 포함" />
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? <Loading /> : !productInventory.length ? <Empty text="등록된 제품(품목마스터)이 없습니다" /> : (
            <StyledTable>
              <TableHeader><TableRow>
                <TH>제품명</TH><TH>코드</TH><TH className="text-right">생산량</TH>
                <TH className="text-center">배치</TH><TH className="text-center">SKU</TH>
                <TH className="text-center">유형</TH><TH>최근생산</TH>
              </TableRow></TableHeader>
              <TableBody>
                {productInventory.map((p: any, i: any) => (
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
    const list: any[] = Array.isArray(batches) ? batches : (batches as any)?.items || [];
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
   제품 출고 (판매/납품) — LOT 기반 재고 차감
   ═══════════════════════════════════════════════════ */
function ProductReleaseTab() {
  const utils = trpc.useUtils();
  const today = new Date().toISOString().split("T")[0];
  const [releaseDate, setReleaseDate] = useState(today);
  const [releaseType, setReleaseType] = useState("sale");
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [selectedPartnerName, setSelectedPartnerName] = useState("");
  const [memo, setMemo] = useState("");
  const [showForm, setShowForm] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [historyType, setHistoryType] = useState("all");
  const [submitProgress, setSubmitProgress] = useState<{ current: number; total: number } | null>(null);

  interface PI { id: number; lotId: string; batchId: string; productName: string; availableQty: string; quantity: string; unit: string; unitPrice: string; amount: string; lotNumber: string; expiryDate: string; source: string; }
  const emptyItem = (): PI => ({ id: Date.now() + Math.random(), lotId: "", batchId: "", productName: "", availableQty: "", quantity: "", unit: "EA", unitPrice: "0", amount: "0", lotNumber: "", expiryDate: "", source: "" });
  const [items, setItems] = useState<PI[]>([emptyItem()]);
  const [hStart, setHStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split("T")[0]; });
  const [hEnd, setHEnd] = useState(today);

  const { data: availableStock, isLoading: stockLoading } = trpc.inventory.getProductAvailableForRelease.useQuery();
  const { data: history, isLoading: hLoading } = trpc.inventory.getProductOutboundHistory.useQuery({ limit: 50, startDate: hStart, endDate: hEnd });
  const { data: outboundStats } = trpc.inventory.getProductOutboundStats.useQuery();
  const createMut = trpc.inventory.createProductOutbound.useMutation({
    onSuccess: () => {
      utils.inventory.getProductOutboundHistory.invalidate();
      utils.inventory.getProductAvailableForRelease.invalidate();
      utils.inventory.getProductOutboundStats.invalidate();
      utils.inventory.getDashboard.invalidate();
      utils.inventory.list.invalidate();
    },
    onError: (e: any) => alert(`출고 실패: ${e.message}`),
  });
  const cancelMut = trpc.inventory.cancelProductOutbound.useMutation({
    onSuccess: () => {
      utils.inventory.getProductOutboundHistory.invalidate();
      utils.inventory.getProductAvailableForRelease.invalidate();
      utils.inventory.getProductOutboundStats.invalidate();
      utils.inventory.list.invalidate();
    },
    onError: (e: any) => alert(`취소 실패: ${e.message}`),
  });

  // 이미 선택된 재고를 다른 행에서 제외
  const getAvailableStockForItem = (currentItemId: number) => {
    if (!availableStock) return [];
    const selectedKeys = new Set(items.filter(i => i.id !== currentItemId && (i.lotId || i.batchId)).map(i => i.lotId ? `lot:${i.lotId}` : `batch:${i.batchId}`));
    return availableStock.filter((s: any) => {
      const key = s.lotId ? `lot:${s.lotId}` : `batch:${s.batchId}`;
      return !selectedKeys.has(key);
    });
  };

  const handleStockChange = (itemId: number, stockKey: string) => {
    // stockKey format: "lot:123" or "batch:456"
    const [type, id] = stockKey.split(":");
    const stock = availableStock?.find((s: any) =>
      type === "lot" ? s.lotId?.toString() === id : s.batchId?.toString() === id
    );
    setItems(p => p.map(i => i.id === itemId ? {
      ...i,
      lotId: stock?.lotId?.toString() || "",
      batchId: stock?.batchId?.toString() || "",
      productName: stock?.productName || "",
      availableQty: stock?.availableQuantity?.toString() || "0",
      lotNumber: stock?.lotNumber || "",
      expiryDate: stock?.expiryDate || "",
      unit: stock?.unit || "EA",
      unitPrice: (stock?.unitPrice || 0).toString(),
      quantity: "", amount: "0",
      source: stock?.source || ""
    } : i));
  };
  const handleQty = (id: number, q: string) => setItems(p => p.map(i => {
    if (i.id !== id) return i;
    return { ...i, quantity: q, amount: q && i.unitPrice ? (parseFloat(q) * parseFloat(i.unitPrice)).toFixed(0) : "0" };
  }));
  const handlePrice = (id: number, pr: string) => setItems(p => p.map(i => i.id === id ? { ...i, unitPrice: pr, amount: i.quantity && pr ? (parseFloat(i.quantity) * parseFloat(pr)).toFixed(0) : "0" } : i));
  const addItem = () => setItems(p => [...p, emptyItem()]);
  const removeItem = (id: number) => { if (items.length > 1) setItems(p => p.filter(i => i.id !== id)); };
  const totalQty = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
  const totalAmt = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const filledItems = items.filter(i => (i.lotId || i.batchId) && i.quantity && parseFloat(i.quantity) > 0);
  const hasOverflow = items.some(i => (i.lotId || i.batchId) && i.quantity && i.availableQty && parseFloat(i.quantity) > parseFloat(i.availableQty));

  // 이력 필터
  const filteredHistory = useMemo(() => {
    if (!history) return [];
    let list = history as any[];
    if (historyType !== "all") list = list.filter(r => r.releaseType === historyType);
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase();
      list = list.filter(r => r.productName?.toLowerCase().includes(q) || r.partnerName?.toLowerCase().includes(q) || r.lotNumber?.toLowerCase().includes(q));
    }
    return list;
  }, [history, historyType, historySearch]);

  const isExpiringSoon = (dateStr: string) => {
    if (!dateStr) return false;
    const diff = (new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 7;
  };
  const isExpired = (dateStr: string) => {
    if (!dateStr) return false;
    return new Date(dateStr).getTime() < Date.now();
  };

  const handleSubmit = async () => {
    if (!filledItems.length) { alert("출고할 품목을 선택하고 수량을 입력해주세요."); return; }
    if (!releaseDate) { alert("출고일을 선택해주세요."); return; }
    for (const i of filledItems) {
      if (parseFloat(i.availableQty) > 0 && parseFloat(i.quantity) > parseFloat(i.availableQty)) {
        alert(`${i.productName}: 가용 재고(${parseFloat(i.availableQty).toFixed(1)})를 초과했습니다.\n요청: ${i.quantity}`); return;
      }
    }
    if (releaseType === "sale" && !selectedPartnerId) {
      if (!confirm("거래처를 선택하지 않았습니다.\n판매 출고 시 거래처 지정을 권장합니다.\n\n회계 매출전표에 거래처 정보가 누락됩니다.\n계속 진행하시겠습니까?")) return;
    }
    const typeLabel = releaseType === "sale" ? "판매" : releaseType === "delivery" ? "납품" : releaseType === "sample" ? "샘플" : releaseType === "return" ? "반품" : "기타";
    const details = filledItems.map(i => `  - ${i.productName} ${i.quantity} ${i.unit}`).join("\n");
    if (!confirm(`[${typeLabel}] 제품 출고 (${filledItems.length}건)\n\n${details}\n\n총 수량: ${totalQty.toFixed(2)}\n총 금액: ${won(totalAmt)}\n\n※ 제품 재고에서 차감됩니다.\n${(releaseType === "sale" || releaseType === "delivery") ? "※ 매출전표가 자동 생성됩니다.\n" : ""}진행하시겠습니까?`)) return;
    try {
      setSubmitProgress({ current: 0, total: filledItems.length });
      for (let idx = 0; idx < filledItems.length; idx++) {
        const i = filledItems[idx];
        setSubmitProgress({ current: idx + 1, total: filledItems.length });
        await createMut.mutateAsync({
          lotId: i.lotId ? parseInt(i.lotId) : undefined,
          batchId: i.batchId ? parseInt(i.batchId) : undefined,
          productName: i.productName,
          quantity: parseFloat(i.quantity),
          unit: i.unit,
          unitPrice: parseFloat(i.unitPrice) || 0,
          partnerId: selectedPartnerId || undefined,
          partnerName: selectedPartnerName || undefined,
          releaseDate,
          releaseType: releaseType as any,
          lotNumber: i.lotNumber,
          notes: memo || undefined
        });
      }
      setSubmitProgress(null);
      alert(`${filledItems.length}건 제품 출고 완료\n\n(제품 재고에서 차감됨)${releaseType === "sale" || releaseType === "delivery" ? "\n(매출전표 자동 생성됨 → 회계 > 매출관리에서 확인)" : ""}`);
      setItems([emptyItem()]); setMemo(""); setSelectedPartnerId(null); setSelectedPartnerName("");
    } catch { setSubmitProgress(null); }
  };

  const releaseTypeLabel = (t: string) => t === "sale" ? "판매" : t === "delivery" ? "납품" : t === "sample" ? "샘플" : t === "return" ? "반품" : "기타";
  const releaseTypeColor = (t: string) => t === "sale" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" : t === "delivery" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : t === "sample" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" : t === "return" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-slate-100 text-slate-700";

  return (
    <div className="space-y-5">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Truck} label="총 출고 건" value={outboundStats?.totalOutbounds || 0} color="blue" />
        <StatCard icon={BarChart3} label="월 출고량" value={`${(outboundStats?.monthQuantity || 0).toFixed(1)}`} color="emerald" sub="최근 30일" />
        <StatCard icon={Package} label="월 출고액" value={won(outboundStats?.monthAmount || 0)} color="slate" sub="최근 30일" />
        <StatCard icon={BoxIcon} label="거래처" value={outboundStats?.partnerCount || 0} color="purple" sub="출고 거래처 수" />
      </div>

      {/* 출고 전표 */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <SectionTitle icon={Truck} title="제품 출고 전표" desc="재고 차감 + 매출전표 자동연동" />
            <div className="flex items-center gap-2">
              {availableStock && availableStock.length > 0 && (
                <Badge variant="outline" className="text-xs px-2 py-1 text-emerald-600 border-emerald-300">
                  출고 가능 {availableStock.length}건
                </Badge>
              )}
              <Button className="h-9 text-xs px-4" variant={showForm ? "secondary" : "default"} onClick={() => setShowForm(!showForm)}>
                <PackageMinus className="h-3.5 w-3.5 mr-1.5" />{showForm ? "접기" : "출고 등록"}
              </Button>
            </div>
          </div>
        </CardHeader>
        {showForm && (
          <CardContent className="px-4 pb-4 pt-4 border-b bg-blue-50/30 dark:bg-blue-950/10">
            {/* 헤더 필드 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">출고일 <span className="text-red-500">*</span></label>
                <input type="date" value={releaseDate} onChange={e => setReleaseDate(e.target.value)} max={today}
                  className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">출고 유형 <span className="text-red-500">*</span></label>
                <Select value={releaseType} onValueChange={setReleaseType}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">판매출고</SelectItem>
                    <SelectItem value="delivery">납품출고</SelectItem>
                    <SelectItem value="sample">샘플출고</SelectItem>
                    <SelectItem value="return">반품</SelectItem>
                    <SelectItem value="other">기타</SelectItem>
                  </SelectContent>
                </Select>
                {(releaseType === "sale" || releaseType === "delivery") && (
                  <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1"><ShieldCheck className="h-3 w-3" />매출전표 자동 생성 (회계 연동)</p>
                )}
              </div>
              <div>
                <PartnerSearchInput
                  selectedId={selectedPartnerId}
                  selectedName={selectedPartnerName}
                  onSelect={(id, name) => { setSelectedPartnerId(id); setSelectedPartnerName(name); }}
                  onClear={() => { setSelectedPartnerId(null); setSelectedPartnerName(""); }}
                  required={releaseType === "sale" || releaseType === "delivery"}
                  label="거래처"
                  placeholder="거래처 검색 (사업자번호, 회사명)"
                />
                {(releaseType === "sale" || releaseType === "delivery") && !selectedPartnerId && (
                  <p className="text-[10px] text-amber-500 mt-1">매출전표에 거래처 미지정 시 회계 불일치 발생</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">메모</label>
                <input type="text" value={memo} onChange={e => setMemo(e.target.value)} maxLength={200}
                  className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" placeholder="출고 메모 (선택)" />
                {memo.length > 0 && <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{memo.length}/200</p>}
              </div>
            </div>

            {/* 품목 테이블 */}
            {stockLoading ? <Loading /> : !availableStock?.length ? (
              <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/10">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">출고 가능한 제품 재고가 없습니다</p>
                <p className="text-xs mt-1.5 opacity-60">생산 완료 시 제품 재고(LOT)가 자동 생성됩니다.</p>
                <p className="text-xs mt-1 opacity-60">생산관리 &gt; 배치 완료 후 이곳에서 출고해주세요.</p>
              </div>
            ) : (
              <>
                <StyledTable>
                  <TableHeader><TableRow>
                    <TH className="w-10 text-center">No</TH>
                    <TH className="min-w-[220px]">제품 재고 (LOT) <span className="text-red-500">*</span></TH>
                    <TH>제품명</TH>
                    <TH className="text-center w-20">유효기한</TH>
                    <TH className="text-right w-20">가용</TH>
                    <TH className="text-right w-24">수량 <span className="text-red-500">*</span></TH>
                    <TH className="text-center w-14">단위</TH>
                    <TH className="text-right w-24">단가 (원)</TH>
                    <TH className="text-right w-24">금액</TH>
                    <TH className="w-10"></TH>
                  </TableRow></TableHeader>
                  <TableBody>
                    {items.map((item, idx) => {
                      const qtyOver = (item.lotId || item.batchId) && item.quantity && item.availableQty && parseFloat(item.quantity) > parseFloat(item.availableQty);
                      const expired = isExpired(item.expiryDate);
                      const expSoon = isExpiringSoon(item.expiryDate);
                      const stockOptions = getAvailableStockForItem(item.id);
                      const stockKey = item.lotId ? `lot:${item.lotId}` : item.batchId ? `batch:${item.batchId}` : "";
                      return (
                        <TableRow key={item.id} className={qtyOver ? "bg-red-50/50 dark:bg-red-950/20" : expired ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}>
                          <TD className="text-center text-muted-foreground">{idx+1}</TD>
                          <TD className="py-1.5">
                            <Select value={stockKey} onValueChange={v => handleStockChange(item.id, v)}>
                              <SelectTrigger className={`h-9 text-xs ${!stockKey ? "border-dashed" : ""}`}><SelectValue placeholder="제품 재고를 선택하세요" /></SelectTrigger>
                              <SelectContent>{stockOptions.map((s: any) => {
                                const key = s.lotId ? `lot:${s.lotId}` : `batch:${s.batchId}`;
                                return (
                                  <SelectItem key={key} value={key}>
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="font-mono font-medium">{s.lotNumber}</span>
                                      <span className="text-muted-foreground">- {s.productName}</span>
                                      <span className="text-emerald-600 font-medium">(잔량 {parseFloat(s.availableQuantity).toFixed(1)})</span>
                                      {s.expiryDate && isExpiringSoon(s.expiryDate) && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">임박</Badge>}
                                      {s.expiryDate && isExpired(s.expiryDate) && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">만료</Badge>}
                                    </div>
                                  </SelectItem>
                                );
                              })}</SelectContent>
                            </Select>
                            {item.lotNumber && <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">LOT: {item.lotNumber}</p>}
                          </TD>
                          <TD className="text-xs font-medium">{item.productName || <span className="text-muted-foreground italic">재고 선택 필요</span>}</TD>
                          <TD className="text-center text-xs">
                            {item.expiryDate ? (
                              <span className={expired ? "text-red-500 font-bold" : expSoon ? "text-amber-500 font-medium" : "text-muted-foreground"}>
                                {fmtDate(item.expiryDate)}
                                {expired && <span className="block text-[10px]">만료</span>}
                                {!expired && expSoon && <span className="block text-[10px]">임박</span>}
                              </span>
                            ) : "-"}
                          </TD>
                          <TD className="text-right text-xs">{item.availableQty ? <span className={parseFloat(item.availableQty)<=0?"text-red-500 font-medium":"text-emerald-600 font-medium"}>{parseFloat(item.availableQty).toFixed(1)}</span> : "-"}</TD>
                          <TD className="py-1.5">
                            <input type="number" step="0.01" min="0" max={item.availableQty || undefined} value={item.quantity}
                              onChange={e => handleQty(item.id, e.target.value)} placeholder="0" disabled={!stockKey}
                              className={`w-full h-9 px-2 border rounded-lg text-xs text-right bg-background transition ${!stockKey ? "opacity-50 cursor-not-allowed" : qtyOver ? "border-red-400 bg-red-50/50 text-red-600 dark:bg-red-950/30" : "focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"}`} />
                            {qtyOver && <p className="text-[10px] text-red-500 mt-0.5 text-right font-medium">재고 초과!</p>}
                          </TD>
                          <TD className="text-center text-xs text-muted-foreground">{item.unit}</TD>
                          <TD className="py-1.5"><input type="number" step="1" min="0" value={item.unitPrice} onChange={e => handlePrice(item.id, e.target.value)} placeholder="0" disabled={!stockKey}
                            className={`w-full h-9 px-2 border rounded-lg text-xs text-right bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition ${!stockKey ? "opacity-50 cursor-not-allowed" : ""}`} /></TD>
                          <TD className="text-right text-xs font-medium">{parseFloat(item.amount)>0 ? won(item.amount) : "-"}</TD>
                          <TD className="text-center py-1.5">{items.length>1 && <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600 text-sm transition-colors" title="삭제">X</button>}</TD>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/30 font-medium border-t-2">
                      <TD colSpan={5} className="text-right text-xs font-semibold">합계</TD>
                      <TD className="text-right text-xs font-mono font-bold text-blue-700 dark:text-blue-400">{totalQty>0?totalQty.toFixed(2):"-"}</TD>
                      <TD colSpan={2}></TD>
                      <TD className="text-right text-xs font-bold text-blue-700 dark:text-blue-400">{totalAmt>0?won(totalAmt):"-"}</TD>
                      <TD></TD>
                    </TableRow>
                  </TableBody>
                </StyledTable>

                <div className="flex items-center justify-between mt-4">
                  <Button variant="outline" size="sm" onClick={addItem} className="h-9 text-xs px-4"><PackageMinus className="h-3.5 w-3.5 mr-1.5" />품목 추가</Button>
                  <div className="flex items-center gap-3">
                    {filledItems.length > 0 && (
                      <span className="text-xs text-muted-foreground">{filledItems.length}건 선택됨</span>
                    )}
                    <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending || !filledItems.length || hasOverflow || !!submitProgress} className="h-9 text-xs px-5 min-w-[120px]">
                      {submitProgress ? `처리 중 (${submitProgress.current}/${submitProgress.total})` : createMut.isPending ? "처리 중..." : `출고 저장${filledItems.length > 0 ? ` (${filledItems.length}건)` : ""}`}
                    </Button>
                  </div>
                </div>

                {/* 유효성 경고 요약 */}
                {(hasOverflow || items.some(i => (i.lotId || i.batchId) && isExpired(i.expiryDate))) && (
                  <div className="mt-3 p-2.5 rounded-lg border border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-700">
                    {hasOverflow && <p className="text-xs text-red-600 flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5" />가용 재고를 초과한 품목이 있습니다. 수량을 확인해주세요.</p>}
                    {items.some(i => (i.lotId || i.batchId) && isExpired(i.expiryDate)) && <p className="text-xs text-amber-600 flex items-center gap-1.5 mt-1"><Clock className="h-3.5 w-3.5" />유효기한 만료 재고가 포함되어 있습니다.</p>}
                  </div>
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>

      {/* 출고 이력 */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionTitle icon={Clock} title="제품 출고 이력" desc={filteredHistory.length > 0 ? `${filteredHistory.length}건` : undefined} />
            <div className="flex items-center gap-2 flex-wrap">
              <input type="text" value={historySearch} onChange={e => setHistorySearch(e.target.value)} placeholder="제품/거래처/LOT 검색" className="h-8 w-40 px-2.5 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 transition" />
              <Select value={historyType} onValueChange={setHistoryType}>
                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="sale">판매</SelectItem>
                  <SelectItem value="delivery">납품</SelectItem>
                  <SelectItem value="sample">샘플</SelectItem>
                  <SelectItem value="return">반품</SelectItem>
                </SelectContent>
              </Select>
              <input type="date" value={hStart} onChange={e => setHStart(e.target.value)} className="h-8 px-2 border rounded-lg text-xs bg-background" />
              <span className="text-xs text-muted-foreground">~</span>
              <input type="date" value={hEnd} onChange={e => setHEnd(e.target.value)} className="h-8 px-2 border rounded-lg text-xs bg-background" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3">
          {hLoading ? <Loading /> : !filteredHistory.length ? <Empty text="출고 이력 없음" /> : (
            <div className="overflow-x-auto">
              <StyledTable>
                <TableHeader><TableRow>
                  <TH className="w-10 text-center">No</TH>
                  <TH>출고일</TH><TH>제품명</TH><TH>LOT</TH>
                  <TH className="text-right">수량</TH><TH className="text-right">금액</TH>
                  <TH>거래처</TH><TH>유형</TH><TH className="text-center">상태</TH><TH className="w-16 text-center">작업</TH>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredHistory.map((r: any, i: number) => (
                    <TableRow key={r.id} className={`hover:bg-muted/30 transition-colors ${r.status === "cancelled" ? "opacity-40" : ""}`}>
                      <TD className="text-center text-muted-foreground">{i+1}</TD>
                      <TD className="text-muted-foreground whitespace-nowrap">{fmtDate(r.releaseDate)}</TD>
                      <TD className={`font-medium ${r.status === "cancelled" ? "line-through" : ""}`}>{r.productName}</TD>
                      <TD className="font-mono text-xs">{r.lotNumber || "-"}</TD>
                      <TD className="text-right font-mono whitespace-nowrap">{r.quantity} {r.unit}</TD>
                      <TD className="text-right text-xs whitespace-nowrap">{won(r.totalAmount)}</TD>
                      <TD className="text-muted-foreground truncate max-w-[120px]">{r.partnerName || "-"}</TD>
                      <TD>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${releaseTypeColor(r.releaseType)}`}>
                          {releaseTypeLabel(r.releaseType)}
                        </span>
                      </TD>
                      <TD className="text-center">
                        <Badge variant={r.status === "cancelled" ? "destructive" : "secondary"} className="text-xs px-2 py-0.5">
                          {r.status === "cancelled" ? "취소" : "확정"}
                        </Badge>
                      </TD>
                      <TD className="text-center">
                        {r.status !== "cancelled" && (
                          <button onClick={() => { if(confirm(`"${r.productName}" 출고를 취소하시겠습니까?\n\n출고일: ${fmtDate(r.releaseDate)}\n수량: ${r.quantity} ${r.unit}\n금액: ${won(r.totalAmount)}\n거래처: ${r.partnerName || "-"}`)) cancelMut.mutate({ outboundId: r.id }); }}
                            className="text-red-400 hover:text-red-600 text-xs underline transition-colors" disabled={cancelMut.isPending}>취소</button>
                        )}
                      </TD>
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
   제품 출고 추이 (일별 판매/납품/샘플)
   ═══════════════════════════════════════════════════ */
function ProductTrendCard({ trendDates, trendPeriod, setTrendPeriod }: { trendDates: { startDate: string; endDate: string }; trendPeriod: string; setTrendPeriod: (v: any) => void }) {
  const { data: productTrend, isLoading } = trpc.inventory.getProductOutboundTrend.useQuery(trendDates);

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <SectionTitle icon={TrendingUp} title="제품 출고 추이" desc="일별 판매/납품/반품" />
          <Select value={trendPeriod} onValueChange={setTrendPeriod}>
            <SelectTrigger className="w-32 h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">최근 7일</SelectItem>
              <SelectItem value="month">최근 30일</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? <Loading /> : !productTrend?.length ? <Empty text="선택 기간에 출고 데이터 없음" /> : (
          <StyledTable>
            <TableHeader>
              <TableRow>
                <TH>일자</TH>
                <TH>판매출고</TH>
                <TH>샘플출고</TH>
                <TH>반품</TH>
                <TH className="text-right">출고액</TH>
                <TH className="text-center">건수</TH>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productTrend.map((r: any) => (
                <TableRow key={r.date} className="hover:bg-muted/30">
                  <TD className="font-mono">{r.date}</TD>
                  <TD className="text-blue-600 dark:text-blue-400 font-medium">{fmt(r.saleQuantity)}</TD>
                  <TD className="text-amber-600 dark:text-amber-400">{fmt(r.sampleQuantity)}</TD>
                  <TD className="text-red-500 dark:text-red-400">{fmt(r.returnQuantity)}</TD>
                  <TD className="text-right font-medium">{won(r.totalAmount)}</TD>
                  <TD className="text-center">{r.transactionCount}</TD>
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
   제품 재고 회전율 (생산 vs 출고)
   ═══════════════════════════════════════════════════ */
function ProductTurnoverCard({ trendDates, trendPeriod }: { trendDates: { startDate: string; endDate: string }; trendPeriod: string }) {
  const { data: turnover, isLoading } = trpc.inventory.getProductTurnoverAnalysis.useQuery(trendDates);

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle icon={RotateCw} title="제품별 회전율" desc={`${trendPeriod === "week" ? "최근 7일" : "최근 30일"} · 생산 vs 출고`} />
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? <Loading /> : !turnover?.length ? <Empty text="데이터 없음" /> : (
          <StyledTable>
            <TableHeader>
              <TableRow>
                <TH>제품</TH>
                <TH>생산량</TH>
                <TH>출고량</TH>
                <TH>재고</TH>
                <TH>회전율</TH>
                <TH>재고일수</TH>
                <TH>효율</TH>
              </TableRow>
            </TableHeader>
            <TableBody>
              {turnover.map((p: any) => (
                <TableRow key={p.productId} className="hover:bg-muted/30">
                  <TD>
                    <span className="font-medium">{p.productName}</span>
                    {p.productCode && <span className="text-muted-foreground ml-2 text-xs">{p.productCode}</span>}
                  </TD>
                  <TD className="text-emerald-600">{fmt(p.productionQuantity)}</TD>
                  <TD className="text-blue-600">{fmt(p.outboundQuantity)}</TD>
                  <TD>{fmt(p.currentStock)}</TD>
                  <TD>
                    <Badge variant={p.turnoverRate >= 1 ? "default" : "secondary"} className="text-xs px-2.5 py-1">
                      {p.turnoverRate.toFixed(2)}
                    </Badge>
                  </TD>
                  <TD>{p.averageHoldingPeriod >= 999 ? "-" : `${p.averageHoldingPeriod.toFixed(0)}일`}</TD>
                  <TD>
                    <span className={`font-semibold ${p.efficiency === "양호" ? "text-emerald-600" : p.efficiency === "적정" ? "text-blue-600" : "text-amber-600"}`}>
                      {p.efficiency}
                    </span>
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
              {preds.map((p: any) => (
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
