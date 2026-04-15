import { useState, useMemo, useCallback } from "react";
import { BoxIcon, Hash, BarChart3, Truck, Factory, Package, PackageMinus, Clock, ShieldCheck, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableHeader, TableRow, TableBody } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { StatCard, StyledTable, TH, TD, SectionTitle, Loading, Empty, fmt, fmtDate, won } from "./InventoryHelpers";
import { PartnerSearchInput } from "./PartnerSearchInput";
import { usePaginatedSort, PaginationBar } from "@/components/PaginatedTable";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";

/* ═══════════════════════════════════════════════════
   제품 재고현황 뷰 (배치 + SKU 기반)
   ═══════════════════════════════════════════════════ */
export function ProductStockView() {
  const { data: batches, isLoading: isLoadingBatches } = trpc.batch.list.useQuery({ limit: 500 });
  const { data: skuList } = trpc.productSku.listAll.useQuery();
  const { data: itemList, isLoading: isLoadingItems } = trpc.itemMaster.list.useQuery({ itemType: "own_product", limit: 500 });
  const { data: outboundByProduct } = trpc.inventory.getProductOutboundByProduct.useQuery();
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

    // 출고 데이터를 제품명 기준으로 맵 생성
    const outboundMap = new Map<string, { totalOutbound: number; outboundCount: number; lastReleaseDate: string | null }>();
    if (outboundByProduct && Array.isArray(outboundByProduct)) {
      (outboundByProduct as any[]).forEach((o: any) => {
        outboundMap.set(o.productName, {
          totalOutbound: o.totalOutbound || 0,
          outboundCount: o.outboundCount || 0,
          lastReleaseDate: o.lastReleaseDate || null,
        });
      });
    }

    // 품목마스터 기준으로 결합 (배치 없어도 0으로 표시)
    // itemMaster.legacyProductId === hBatches.productId 로 매칭
    const result = items.map((item: any) => {
      const matchedSkus = skus.filter((s: any) => s.itemId === item.id);
      const legacyId = Number(item.legacyProductId);
      const batchData = legacyId ? (batchMap.get(legacyId) || { totalProduced: 0, lotCount: 0, latestBatch: "" })
                                 : { totalProduced: 0, lotCount: 0, latestBatch: "" };
      const outData = outboundMap.get(item.itemName || "") || { totalOutbound: 0, outboundCount: 0, lastReleaseDate: null };
      const currentStock = batchData.totalProduced - outData.totalOutbound;
      return {
        productName: item.itemName || "알 수 없음",
        productCode: item.itemCode || "",
        totalProduced: batchData.totalProduced,
        totalOutbound: outData.totalOutbound,
        currentStock,
        outboundCount: outData.outboundCount,
        lotCount: batchData.lotCount,
        latestBatch: batchData.latestBatch,
        lastReleaseDate: outData.lastReleaseDate,
        skuCount: matchedSkus.length,
        isOem: !!item.oemSupplierId,
      };
    });
    // 최근 생산일 기준 내림차순 정렬
    result.sort((a: any, b: any) => {
      const toTs = (v: any): number => {
        if (!v) return 0;
        if (v instanceof Date) return v.getTime();
        if (typeof v === 'string') return new Date(v).getTime() || 0;
        return 0;
      };
      return toTs(b.latestBatch) - toTs(a.latestBatch);
    });
    return result;
  }, [batches, skuList, itemList, outboundByProduct]);

  const totalProduced = productInventory.reduce((s: any, p: any) => s + p.totalProduced, 0);
  const totalOutbound = productInventory.reduce((s: any, p: any) => s + p.totalOutbound, 0);
  const totalStock = productInventory.reduce((s: any, p: any) => s + p.currentStock, 0);
  const totalBatches = productInventory.reduce((s: any, p: any) => s + p.lotCount, 0);
  const oemCount = productInventory.filter((p: any) => p.isOem).length;

  const {
    pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(productInventory, {
    defaultSort: { key: "latestBatch", direction: "desc" },
    defaultPageSize: 30,
    sortFn: (a: any, b: any, key: string, dir) => {
      if (key === "latestBatch") {
        const toTs = (v: any): number => {
          if (!v) return 0;
          if (v instanceof Date) return v.getTime();
          if (typeof v === 'string') return new Date(v).getTime() || 0;
          return 0;
        };
        const aT = toTs(a.latestBatch), bT = toTs(b.latestBatch);
        return dir === "asc" ? aT - bT : bT - aT;
      }
      if (["totalProduced", "totalOutbound", "currentStock", "outboundCount", "lotCount", "skuCount"].includes(key)) {
        const aV = Number(a[key]) || 0, bV = Number(b[key]) || 0;
        return dir === "asc" ? aV - bV : bV - aV;
      }
      const aS = String(a[key] || ""), bS = String(b[key] || "");
      return dir === "asc" ? aS.localeCompare(bS, "ko") : bS.localeCompare(aS, "ko");
    },
  });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={BoxIcon} label="제품 종류" value={productInventory.length} color="blue" />
        <StatCard icon={Factory} label="총 생산량" value={`${totalProduced.toFixed(1)} kg`} color="emerald" />
        <StatCard icon={Truck} label="총 출고량" value={`${totalOutbound.toFixed(1)} kg`} color="amber" />
        <StatCard icon={Package} label="현재 재고" value={`${totalStock.toFixed(1)} kg`} color="slate" sub="생산 - 출고" />
        <StatCard icon={Hash} label="생산 배치" value={totalBatches} color="purple" />
      </div>

      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <SectionTitle icon={Factory} title="제품별 재고 현황" desc="품목마스터 기준 · SKU/OEM 포함" />
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? <Loading /> : !productInventory.length ? <Empty text="등록된 제품(품목마스터)이 없습니다" /> : (
            <>
              <StyledTable>
                <TableHeader><TableRow>
                  <TH>제품명</TH><TH>코드</TH>
                  <TH className="text-right">생산량</TH>
                  <TH className="text-right">출고량</TH>
                  <TH className="text-right">재고</TH>
                  <TH className="text-center">배치</TH>
                  <TH className="text-center">유형</TH><TH>최근생산</TH>
                </TableRow></TableHeader>
                <TableBody>
                  {pageData.map((p: any, i: any) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TD className="font-medium">{p.productName}</TD>
                      <TD className="text-muted-foreground font-mono text-xs">{p.productCode}</TD>
                      <TD className="text-right font-mono text-emerald-600 dark:text-emerald-400">{p.totalProduced.toFixed(1)}</TD>
                      <TD className="text-right font-mono text-orange-600 dark:text-orange-400">{p.totalOutbound > 0 ? p.totalOutbound.toFixed(1) : "-"}</TD>
                      <TD className="text-right font-mono font-semibold">
                        <span className={p.currentStock <= 0 ? "text-red-500" : p.currentStock < p.totalProduced * 0.1 ? "text-amber-600" : ""}>
                          {p.currentStock.toFixed(1)}
                        </span>
                      </TD>
                      <TD className="text-center">{p.lotCount}</TD>
                      <TD className="text-center">
                        {p.isOem ? <Badge variant="outline" className="text-xs px-2.5 py-1 border-purple-400 text-purple-600">OEM</Badge>
                                 : <Badge variant="secondary" className="text-xs px-2.5 py-1">자사</Badge>}
                      </TD>
                      <TD className="text-muted-foreground">{fmtDate(p.latestBatch)}</TD>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   제품 입고 안내 (생산 배치 연동)
   ═══════════════════════════════════════════════════ */
export function ProductReceiptInfo() {
  const { data: batches, isLoading } = trpc.batch.list.useQuery({ limit: 500 });
  const completedBatches = useMemo(() => {
    const list: any[] = Array.isArray(batches) ? batches : (batches as any)?.items || [];
    return list.filter((b: any) => b.status === "completed").sort((a: any, b: any) => {
      const toTs = (v: any): number => {
        if (!v) return 0;
        if (v instanceof Date) return v.getTime();
        if (typeof v === 'object' && typeof v.getTime === 'function') return v.getTime();
        if (typeof v === 'string') return new Date(v).getTime() || 0;
        if (typeof v === 'number') return v;
        return 0;
      };
      const dateA = toTs(a.endTime) || toTs(a.startTime);
      const dateB = toTs(b.endTime) || toTs(b.startTime);
      return dateB - dateA; // newest first
    });
  }, [batches]);

  const {
    pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(completedBatches, {
    defaultSort: { key: "endTime", direction: "desc" },
    defaultPageSize: 30,
  });

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle icon={Factory} title="제품 입고 (생산 배치 연동)" desc={`생산 완료 배치 ${completedBatches.length}건`} />
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? <Loading /> : !completedBatches.length ? <Empty text="완료 배치 없음" /> : (
          <>
            <StyledTable>
              <TableHeader><TableRow>
                <TH>배치번호</TH><TH>제품</TH><TH className="text-right">생산량</TH>
                <TH>완료일</TH><TH className="text-center">상태</TH>
              </TableRow></TableHeader>
              <TableBody>
                {pageData.map((b: any) => (
                  <TableRow key={b.id} className="hover:bg-muted/30">
                    <TD className="font-mono text-xs">{b.batchCode || b.batchNumber}</TD>
                    <TD className="font-medium">{b.productName || "-"}</TD>
                    <TD className="text-right font-mono">{fmt(b.actualQuantity || b.plannedQuantity)}</TD>
                    <TD className="text-muted-foreground">{fmtDate(b.endTime)}</TD>
                    <TD className="text-center">
                      <Badge variant="default" className="text-xs px-2.5 py-1 bg-emerald-600 text-white">입고완료</Badge>
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
        )}
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════
   제품 출고 (판매/납품) — LOT 기반 재고 차감
   ═══════════════════════════════════════════════════ */
export function ProductReleaseTab() {
  const utils = trpc.useUtils();
  const today = todayLocal();
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
  const [hStart, setHStart] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 90); return formatLocalDate(d); });
  const [hEnd, setHEnd] = useState(today);

  const { data: availableStock, isLoading: stockLoading } = trpc.inventory.getProductAvailableForRelease.useQuery();
  const { data: history, isLoading: hLoading } = trpc.inventory.getProductOutboundHistory.useQuery({ limit: 500, startDate: hStart, endDate: hEnd });
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
    // 최근일순 정렬
    list.sort((a: any, b: any) => {
      const da = String(a.releaseDate || "").replace(/\./g, "-");
      const db = String(b.releaseDate || "").replace(/\./g, "-");
      return db.localeCompare(da);
    });
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
        <StatCard icon={BarChart3} label="월 출고량" value={`${(outboundStats?.monthQuantity || 0).toFixed(1)} kg`} color="emerald" sub="최근 30일" />
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
            <OutboundHistoryTable data={filteredHistory} cancelMut={cancelMut} releaseTypeLabel={releaseTypeLabel} releaseTypeColor={releaseTypeColor} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   출고 이력 테이블 (페이지네이션 + 정렬)
   ═══════════════════════════════════════════════════ */
function OutboundHistoryTable({ data, cancelMut, releaseTypeLabel, releaseTypeColor }: {
  data: any[];
  cancelMut: any;
  releaseTypeLabel: (t: string) => string;
  releaseTypeColor: (t: string) => string;
}) {
  const {
    pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(data, {
    defaultSort: { key: "releaseDate", direction: "desc" },
    defaultPageSize: 30,
  });

  return (
    <div className="overflow-x-auto">
      <StyledTable>
        <TableHeader><TableRow>
          <TH className="w-10 text-center">No</TH>
          <TH>출고일</TH><TH>제품명</TH><TH>LOT</TH>
          <TH className="text-right">수량</TH><TH className="text-right">금액</TH>
          <TH>거래처</TH><TH>유형</TH><TH className="text-center">상태</TH><TH className="w-16 text-center">작업</TH>
        </TableRow></TableHeader>
        <TableBody>
          {pageData.map((r: any, i: number) => (
            <TableRow key={r.id} className={`hover:bg-muted/30 transition-colors ${r.status === "cancelled" ? "opacity-40" : ""}`}>
              <TD className="text-center text-muted-foreground">{startIdx + i}</TD>
              <TD className="text-muted-foreground whitespace-nowrap">{fmtDate(r.releaseDate)}</TD>
              <TD className={`font-medium ${r.status === "cancelled" ? "line-through" : ""}`}>{r.productName}</TD>
              <TD className="font-mono text-xs">{r.lotNumber || "-"}</TD>
              <TD className="text-right font-mono whitespace-nowrap">{parseFloat(r.quantity).toFixed(1)} {r.unit}</TD>
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
                  <button onClick={() => { if(confirm(`"${r.productName}" 출고를 취소하시겠습니까?\n\n출고일: ${fmtDate(r.releaseDate)}\n수량: ${parseFloat(r.quantity).toFixed(1)} ${r.unit}\n금액: ${won(r.totalAmount)}\n거래처: ${r.partnerName || "-"}`)) cancelMut.mutate({ outboundId: r.id }); }}
                    className="text-red-400 hover:text-red-600 text-xs underline transition-colors" disabled={cancelMut.isPending}>취소</button>
                )}
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
    </div>
  );
}
