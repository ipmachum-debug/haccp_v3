/**
 * 원재료 수동 소모 탭 (폐기/샘플/기타) — InventoryManagementIntegrated.tsx 에서 분리 (2026-04-19)
 *
 * 기능:
 *  - FEFO 순 LOT 선택으로 원재료 소모 처리
 *  - 월별 소모 현황 요약 (원재료별 소계 + 일별 그룹)
 *  - BOM 자동 소모 안내 + 일괄 차감/동기화 버튼 포함
 */
import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsTrigger, TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, RotateCw, AlertCircle, Calendar, PackageMinus, PackagePlus, Settings, RefreshCw, Factory, ScanBarcode, Truck, Clock, ShieldCheck, Play, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Layers } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { fmt, fmtDate, won, Empty, Loading, StatCard, StyledTable, TH, TD, SectionTitle } from "@/components/inventory/InventoryHelpers";
import { RetroactiveDeductionButton, StockSyncButton } from "./StockActionButtons";
import type { InventoryLot } from "./types";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export function ReleaseTab() {
  const L = useIndustryLabel();
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
    onError: (e: { message: string }) => alert(`소모 처리 실패: ${e.message}`),
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
    return (lots as InventoryLot[])
      .filter((l) => parseFloat(String(l.availableQuantity)) > 0 || selectedIds.has(l.id.toString()))
      .sort((a, b) => {
        if (a.expiryDate && b.expiryDate) return new Date(a.expiryDate as string | Date).getTime() - new Date(b.expiryDate as string | Date).getTime();
        if (a.expiryDate) return -1;
        if (b.expiryDate) return 1;
        return 0;
      });
  }, [lots, items]);

  const getAvailableLotsForItem = (currentItemId: number) => {
    const selectedIds = new Set(items.filter(i => i.id !== currentItemId && i.lotId).map(i => i.lotId));
    return availableLots.filter((l) => !selectedIds.has(l.id.toString()));
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
    const lot = (lots as InventoryLot[] | undefined)?.find((l) => l.id.toString() === lotIdStr);
    setItems(p => p.map(i => i.id === itemId ? { ...i, lotId: lotIdStr, materialName: lot?.materialName || "", availableQty: String(lot?.availableQuantity ?? "0"), unit: lot?.unit || "", unitPrice: String(lot?.unitPrice ?? "0"), expiryDate: lot?.expiryDate ? String(lot.expiryDate).slice(0, 10) : "", lotNumber: lot?.lotNumber || "", quantity: "", amount: "0" } : i));
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
            <SectionTitle icon={PackageMinus} title={`${L("material")} 수동 소모`} desc="폐기/샘플/기타 (FEFO 순)" />
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
                    <h4 className="text-xs font-semibold text-muted-foreground">{`${L("material")}별 월간 소계`}</h4>
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
                                            {/* PR-W7: LOT 번호 또는 재고미등록 뱃지 (둘 중 하나만 표시) */}
                                            {item.lotNumber ? (
                                              <span className="font-mono text-muted-foreground">{item.lotNumber}</span>
                                            ) : item.isLotMissing ? (
                                              <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-amber-100 text-amber-800 border-amber-300">
                                                재고미등록
                                              </Badge>
                                            ) : null}
                                            {/* PR-W7: 사용자 메모만 표시 (자동출고 raw notes 는 백엔드에서 NULL 처리됨) */}
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
