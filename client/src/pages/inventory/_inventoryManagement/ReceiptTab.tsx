/**
 * 원재료 입고 탭 (LOT 자동생성) — InventoryManagementIntegrated.tsx 에서 분리 (2026-04-19)
 *
 * 기능:
 *  - 원재료/수량/단가/공급업체 선택 후 입고 등록 → LOT 자동 생성
 *  - 단가 > 0 이면 매입전표 자동 연동
 *  - 입고 내역 페이지네이션 + 정렬 (desktop 테이블 + mobile 카드)
 *  - 기존 데이터 LOT 일괄 생성 (backfill) 버튼
 */
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PackagePlus, RefreshCw, ShieldCheck, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { fmtDate, won, Empty, Loading, StyledTable, TH, TD, SectionTitle } from "@/components/inventory/InventoryHelpers";
import { PartnerSearchInput } from "@/components/inventory/PartnerSearchInput";
import { MaterialSearchInput } from "@/components/inventory/MaterialSearchInput";
import { usePaginatedSort, SortableHeader, PaginationBar } from "@/components/PaginatedTable";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export function ReceiptTab() {
  const L = useIndustryLabel();
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
                  label={L("material")}
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
  const L = useIndustryLabel();
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
            <SortableHeader label={L("material")} sortKey="materialName" currentSort={sort} onSort={handleSort} />
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
