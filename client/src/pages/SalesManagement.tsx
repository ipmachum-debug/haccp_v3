import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { skipToken } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Save, Search, FileText, Building2, X, Package, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ExcelBulkUploadModal from "@/components/ExcelBulkUploadModal";

/* ─── Partner inline search/autocomplete ─── */
function PartnerInlineSearch({ selectedId, selectedName, onSelect, onClear, partnerType, label = "거래처 *" }: {
  selectedId: string; selectedName: string;
  onSelect: (id: string, name: string) => void; onClear: () => void;
  partnerType?: "supplier" | "customer" | "subcontractor";
  label?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const q = trpc.partners.search.useQuery(
    open ? { search: search || "", partnerType, limit: 20 } : skipToken,
    { staleTime: 10_000 }
  );
  const results: any[] = (q.data as any[]) ?? [];
  return (
    <div className="space-y-1 relative">
      <Label className="text-xs font-medium">{label}</Label>
      {selectedId ? (
        <div className="flex items-center gap-1.5 h-8 px-2.5 border rounded-md bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-300">
          <Building2 className="h-3 w-3 text-emerald-600 shrink-0" />
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300 truncate flex-1">{selectedName}</span>
          <button type="button" onClick={onClear} className="text-muted-foreground hover:text-red-500 transition shrink-0"><X className="h-3 w-3" /></button>
        </div>
      ) : (
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
          <input type="text" value={search} placeholder="거래처 검색 (클릭 시 전체 목록)"
            onChange={e => { setSearch(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            className="w-full h-8 pl-7 pr-2 border rounded-md text-sm bg-background focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition" />
        </div>
      )}
      {open && !selectedId && (
        <div className="absolute z-[9999] top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-xl max-h-52 overflow-y-auto">
          {q.isFetching && <div className="px-3 py-2 text-xs text-muted-foreground text-center">검색 중...</div>}
          {!q.isFetching && results.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground text-center">{search ? "검색 결과 없음" : "등록된 거래처가 없습니다"}</div>}
          {results.map((p: any) => (
            <button key={p.id} type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-muted text-xs flex items-center gap-2 border-b last:border-0"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(String(p.id), p.company_name); setSearch(""); setOpen(false); }}>
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

/* ─── Item inline search/autocomplete (SKU 지원) ─── */
function ItemInlineSearch({ onSelect, allItems, skuList }: {
  onSelect: (item: any) => void;
  allItems: any[];
  skuList: any[];
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  // SKU가 있는 품목(own_product)은 SKU 단위로 표시, 나머지는 품목 단위로 표시
  const combinedItems = useMemo(() => {
    const result: any[] = [];
    // SKU가 있는 품목ID 수집
    const itemIdsWithSku = new Set(skuList.map((s: any) => s.itemId));

    // SKU 항목을 먼저 추가 (품목명 [SKU명] 형태)
    for (const sku of skuList) {
      result.push({
        id: sku.itemId,
        skuId: sku.id,
        skuCode: sku.skuCode,
        skuName: sku.skuName,
        itemName: sku.itemName,
        itemType: sku.itemType,
        displayName: `${sku.itemName} [${sku.skuName}]`,
        salesUnit: sku.salesUnit || "box",
        unitPrice: sku.unitPrice ? Number(sku.unitPrice) : 0,
        _displayType: "SKU",
        _isSku: true,
      });
    }

    // SKU가 없는 품목 추가 (기존 방식)
    for (const item of allItems) {
      if (!itemIdsWithSku.has(item.id)) {
        result.push({
          ...item,
          displayName: item.itemName || item.name || "-",
          _isSku: false,
        });
      }
    }
    return result;
  }, [allItems, skuList]);

  const filtered = useMemo(() => {
    if (!search) return combinedItems.slice(0, 30);
    const q = search.toLowerCase();
    return combinedItems.filter((m: any) =>
      (m.displayName || "").toLowerCase().includes(q) ||
      (m.skuCode || "").toLowerCase().includes(q) ||
      (m.category || "").toLowerCase().includes(q) ||
      (m._displayType || "").toLowerCase().includes(q)
    ).slice(0, 30);
  }, [search, combinedItems]);

  return (
    <div className="relative">
      <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
      <input type="text" value={search} placeholder="품목/SKU 검색"
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        className="w-full h-7 pl-6 pr-2 border-0 shadow-none text-sm bg-transparent hover:bg-muted/50 focus:ring-0 focus:bg-muted/30 rounded transition" />
      {open && (
        <div className="absolute z-[9999] top-full left-0 mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-xl max-h-64 overflow-y-auto min-w-[360px]" style={{ width: 'max-content', maxWidth: '480px' }}>
          {filtered.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground text-center">{search ? "검색 결과 없음" : "품목/SKU를 검색하세요"}</div>}
          {filtered.map((m: any, idx: number) => (
            <button key={`${m.id}-${m.skuId || 'item'}-${idx}`} type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-muted text-xs flex items-center gap-2 border-b last:border-0"
              onMouseDown={e => e.preventDefault()}
              onClick={() => { onSelect(m); setSearch(""); setOpen(false); }}>
              <Package className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{m.displayName}</span>
              {m._isSku ? (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {m.salesUnit || "SKU"}
                </Badge>
              ) : (
                m._displayType && <span className="text-[10px] px-1 py-0 rounded bg-muted shrink-0">{m._displayType}</span>
              )}
              {(m.unitPrice > 0 || m.defaultUnitPrice) && (
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {Number(m.unitPrice || m.defaultUnitPrice || 0).toLocaleString()}원
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  raw_material: "원재료",
  own_product: "자사제품",
  external_product: "외부제품",
  subsidiary: "부자재",
};

const PACKAGING_UNITS = [
  { value: "kg", label: "kg" },
  { value: "g", label: "g" },
  { value: "L", label: "L" },
  { value: "mL", label: "mL" },
  { value: "EA", label: "EA" },
  { value: "box", label: "Box" },
  { value: "pack", label: "Pack" },
  { value: "roll", label: "Roll" },
  { value: "sheet", label: "Sheet" },
  { value: "bag", label: "Bag" },
] as const;

type SaleItem = {
  id: string;
  itemMasterId?: number;
  itemType?: string;
  itemName: string;
  skuId?: number;
  skuCode?: string;
  skuName?: string;
  packagingSize?: number;
  packagingUnit?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxAmount: number;
  totalAmount: number;
  taxType?: "taxed" | "tax-free" | "zero-rated";
};

export default function SalesManagement() {
  return (
    <DashboardLayout>
      <SalesManagementContent />
    </DashboardLayout>
  );
}

function SalesManagementContent() {
  const { toast } = useToast();
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  
  const [transactionDate, setTransactionDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [selectedPartnerName, setSelectedPartnerName] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  
  const [materialSearchItemId, setMaterialSearchItemId] = useState<string | null>(null);
  
  const [items, setItems] = useState<SaleItem[]>([
    {
      id: `${Date.now()}-1`,
      itemType: "",
      itemName: "",
      packagingSize: 0,
      packagingUnit: "kg",
      quantity: 0,
      unitPrice: 0,
      amount: 0,
      taxAmount: 0,
      totalAmount: 0,
      taxType: "taxed",
    },
  ]);

  // 품목 마스터 조회 (자사제품, 원재료, 외부제품, 부자재)
  const { data: ownProductItems } = trpc.itemMaster.list.useQuery({
    itemType: "own_product" as any,
    isActive: 1,
    limit: 500,
  });
  const { data: rawMaterialItems } = trpc.itemMaster.list.useQuery({
    itemType: "raw_material" as any,
    isActive: 1,
    limit: 500,
  });
  const { data: externalItems } = trpc.itemMaster.list.useQuery({
    itemType: "external_product" as any,
    isActive: 1,
    limit: 500,
  });
  const { data: subsidiaryItems } = trpc.itemMaster.list.useQuery({
    itemType: "subsidiary" as any,
    isActive: 1,
    limit: 500,
  });

  // SKU 전체 목록 조회 (매출 등록용 - SKU 단위 품목 선택)
  const { data: allSkuList } = trpc.productSku.listAll.useQuery({});

  // 모든 판매 가능 품목 통합
  const allSaleItems = [
    ...(ownProductItems?.items ?? []).map((item: any) => ({
      ...item,
      _displayType: "자사제품",
    })),
    ...(rawMaterialItems?.items ?? []).map((item: any) => ({
      ...item,
      _displayType: "원재료",
    })),
    ...(externalItems?.items ?? []).map((item: any) => ({
      ...item,
      _displayType: "외부제품",
    })),
    ...(subsidiaryItems?.items ?? []).map((item: any) => ({
      ...item,
      _displayType: "부자재",
    })),
  ];

  const utils = trpc.useUtils();
  const createMutation = trpc.haccpIntegration.createSale.useMutation({
    onSuccess: () => {
      utils.haccpIntegration.getAllSales.invalidate();
      toast({ title: "매출 거래가 등록되었습니다." });
      // 폼 초기화
      setSelectedPartnerId("");
      setSelectedPartnerName("");
      setTransactionDate(new Date().toISOString().split("T")[0]);
      setMemo("");
      setItems([
        {
          id: `${Date.now()}-1`,
          itemType: "",
          itemName: "",
          packagingSize: 0,
          packagingUnit: "kg",
          quantity: 0,
          unitPrice: 0,
          amount: 0,
          taxAmount: 0,
          totalAmount: 0,
          taxType: "taxed",
        },
      ]);
    },
    onError: (error: any) => {
      toast({ title: "오류", description: error.message, variant: "destructive" });
    },
  });

  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: `${Date.now()}-${items.length + 1}`,
        itemType: "",
        itemName: "",
        packagingSize: 0,
        packagingUnit: "kg",
        quantity: 0,
        unitPrice: 0,
        amount: 0,
        taxAmount: 0,
        totalAmount: 0,
        taxType: "taxed",
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length === 1) {
      toast({ title: "최소 1개의 품목이 필요합니다.", variant: "destructive" });
      return;
    }
    setItems(items.filter((item) => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof SaleItem, value: any) => {
    setItems(
      items.map((item) => {
        if (item.id !== id) return item;

        const updatedItem = { ...item, [field]: value };

        if (field === "quantity" || field === "unitPrice" || field === "taxType") {
          const quantity = field === "quantity" ? Number(value) : item.quantity;
          const unitPrice = field === "unitPrice" ? Number(value) : item.unitPrice;
          const taxType = field === "taxType" ? value : item.taxType;
          const amount = quantity * unitPrice;
          
          let taxAmount = 0;
          if (taxType === "taxed") {
            taxAmount = Math.round(amount * 0.1);
          }
          const totalAmount = amount + taxAmount;

          updatedItem.quantity = quantity;
          updatedItem.unitPrice = unitPrice;
          updatedItem.amount = amount;
          updatedItem.taxAmount = taxAmount;
          updatedItem.totalAmount = totalAmount;
        }

        return updatedItem;
      })
    );
  };

  const handleItemMasterSelect = (selectedMasterItem: any) => {
    if (!materialSearchItemId) return;

    setItems(
      items.map((item) => {
        if (item.id !== materialSearchItemId) return item;

        // SKU가 선택된 경우 SKU 정보 우선 사용
        const hasSku = !!selectedMasterItem.selectedSku;
        return {
          ...item,
          itemMasterId: selectedMasterItem.id,
          itemType: selectedMasterItem.itemType,
          itemName: hasSku
            ? `${selectedMasterItem.itemName} [${selectedMasterItem.skuName}]`
            : (selectedMasterItem.itemName || ""),
          unitPrice: hasSku
            ? Number(selectedMasterItem.unitPrice || selectedMasterItem.defaultUnitPrice || 0)
            : Number(selectedMasterItem.defaultUnitPrice || 0),
          packagingUnit: hasSku
            ? (selectedMasterItem.salesUnit || selectedMasterItem.baseUnit || "kg")
            : (selectedMasterItem.baseUnit || "kg"),
          skuId: selectedMasterItem.skuId || undefined,
          skuCode: selectedMasterItem.skuCode || undefined,
        };
      })
    );

    setMaterialSearchItemId(null);
  };

  const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const totalTaxAmount = items.reduce((sum, item) => sum + item.taxAmount, 0);
  const grandTotal = items.reduce((sum, item) => sum + item.totalAmount, 0);

  const handleSave = () => {
    if (!selectedPartnerId) {
      toast({ title: "거래처를 선택해주세요.", variant: "destructive" });
      return;
    }

    if (items.some((item) => !item.itemName || item.quantity <= 0 || item.unitPrice <= 0)) {
      toast({ title: "모든 품목 정보를 입력해주세요.", variant: "destructive" });
      return;
    }

    setIsSaving(true);

    let successCount = 0;
    let failCount = 0;

    items.forEach((item) => {
      createMutation.mutate(
        {
          transactionDate,
          partnerId: Number(selectedPartnerId),
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          amount: item.amount,
          taxAmount: item.taxAmount,
          unit: item.packagingUnit || undefined,
          memo: memo || undefined,
        },
        {
          onSuccess: () => {
            successCount++;
            if (successCount + failCount === items.length) {
              setIsSaving(false);
              toast({
                title: `매출 등록 완료`,
                description: `성공: ${successCount}건, 실패: ${failCount}건`,
              });
            }
          },
          onError: () => {
            failCount++;
            if (successCount + failCount === items.length) {
              setIsSaving(false);
              toast({
                title: `매출 등록 완료`,
                description: `성공: ${successCount}건, 실패: ${failCount}건`,
                variant: failCount > 0 ? "destructive" : "default",
              });
            }
          },
        }
      );
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPartnerId, items, transactionDate, memo]);

  return (
    <div className="space-y-0">
      {/* 헤더 - 컴팩트 */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            매출 등록
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ctrl+S (저장)
          </p>
        </div>
        <Button onClick={() => setBulkUploadOpen(true)} variant="outline" size="sm" className="gap-1.5 text-xs">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          엑셀 일괄등록
        </Button>
      </div>

      {/* 거래 정보 - 한 줄 */}
      <div className="bg-muted/30 rounded-md p-3 mb-3 border">
        <div className="grid grid-cols-4 gap-3">
          <PartnerInlineSearch
            selectedId={selectedPartnerId}
            selectedName={selectedPartnerName}
            onSelect={(id, name) => { setSelectedPartnerId(id); setSelectedPartnerName(name); }}
            onClear={() => { setSelectedPartnerId(""); setSelectedPartnerName(""); }}
          />

          <div className="space-y-1">
            <Label className="text-xs font-medium">날짜 *</Label>
            <Input
              type="date"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">구분</Label>
            <Select value="매출" disabled>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="매출">매출</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium">비고</Label>
            <Input
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="비고"
              className="h-8 text-sm"
            />
          </div>
        </div>
      </div>

      {/* 품목 정보 */}
      <div className="bg-card rounded-md border">
        <div className="px-3 py-2 border-b flex items-center justify-between bg-muted/30">
          <h2 className="text-sm font-semibold">품목 정보 ({items.filter(i => i.itemName).length}/{items.length})</h2>
          <Button onClick={handleAddItem} size="sm" variant="outline" className="h-7 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            품목 추가
          </Button>
        </div>
        <div className="relative">
          <div className="relative w-full" style={{ overflow: 'visible' }}>
            <table className="w-full caption-bottom text-sm">
            <TableHeader className="bg-muted/80">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[36px] text-center py-1.5 text-xs font-semibold">#</TableHead>
                <TableHead className="w-[60px] text-center py-1.5 text-xs font-semibold">구분</TableHead>
                <TableHead className="min-w-[160px] py-1.5 text-xs font-semibold">품목명</TableHead>
                <TableHead className="w-[140px] py-1.5 text-xs font-semibold text-center">포장규격</TableHead>
                <TableHead className="w-[80px] py-1.5 text-xs font-semibold text-right">수량</TableHead>
                <TableHead className="w-[100px] py-1.5 text-xs font-semibold text-right">단가</TableHead>
                <TableHead className="w-[100px] py-1.5 text-xs font-semibold">과세</TableHead>
                <TableHead className="w-[90px] py-1.5 text-xs font-semibold text-right">공급가액</TableHead>
                <TableHead className="w-[80px] py-1.5 text-xs font-semibold text-right">부가세</TableHead>
                <TableHead className="w-[100px] py-1.5 text-xs font-semibold text-right">합계</TableHead>
                <TableHead className="w-[36px] py-1.5"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={item.id} className="hover:bg-blue-50/50 relative" style={{ overflow: 'visible' }}>
                  <TableCell className="text-center py-1 text-xs text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="text-center py-1">
                    {item.itemType ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">
                        {ITEM_TYPE_LABELS[item.itemType] || "-"}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="py-1" style={{ overflow: 'visible', position: 'relative' }}>
                    {item.itemName ? (
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium truncate flex-1 px-1">{item.itemName}</span>
                        <button type="button" onClick={() => handleItemChange(item.id, "itemName", "")} className="text-muted-foreground hover:text-red-500 shrink-0"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <ItemInlineSearch allItems={allSaleItems} skuList={allSkuList ?? []} onSelect={(m) => {
                        setItems(prev => prev.map(row => {
                          if (row.id !== item.id) return row;
                          const isSku = !!m._isSku;
                          const unitPrice = isSku
                            ? (m.unitPrice || row.unitPrice)
                            : (m.defaultUnitPrice ? Number(m.defaultUnitPrice) : row.unitPrice);
                          const amount = row.quantity * unitPrice;
                          const taxAmount = row.taxType === "taxed" ? Math.round(amount * 0.1) : 0;
                          return {
                            ...row,
                            itemMasterId: m.id,
                            itemType: m.itemType,
                            itemName: isSku ? m.displayName : (m.itemName || m.name || ""),
                            skuId: isSku ? m.skuId : undefined,
                            skuCode: isSku ? m.skuCode : undefined,
                            skuName: isSku ? m.skuName : undefined,
                            unitPrice,
                            packagingUnit: isSku ? (m.salesUnit || "box") : (m.baseUnit || row.packagingUnit),
                            amount,
                            taxAmount,
                            totalAmount: amount + taxAmount,
                          };
                        }));
                      }} />
                    )}
                  </TableCell>
                  <TableCell className="py-1">
                    <div className="flex items-center gap-0.5">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={item.packagingSize ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "") {
                            handleItemChange(item.id, "packagingSize", 0);
                          } else {
                            const num = Math.round(parseFloat(val) * 10) / 10;
                            handleItemChange(item.id, "packagingSize", num);
                          }
                        }}
                        placeholder="0"
                        className="h-7 text-sm text-right w-[55px] border-0 shadow-none focus-visible:ring-0 px-1"
                      />
                      <Select value={item.packagingUnit || "kg"} onValueChange={(value) => handleItemChange(item.id, "packagingUnit", value)}>
                        <SelectTrigger className="h-7 w-[65px] text-xs border-0 shadow-none focus:ring-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PACKAGING_UNITS.map((unit) => (
                            <SelectItem key={unit.value} value={unit.value} className="text-xs">{unit.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell className="py-1">
                    <Input type="number" value={item.quantity || ""} onChange={(e) => handleItemChange(item.id, "quantity", Number(e.target.value))} placeholder="0" className="h-7 text-sm text-right border-0 shadow-none focus-visible:ring-0 px-1" />
                  </TableCell>
                  <TableCell className="py-1">
                    <Input type="number" value={item.unitPrice || ""} onChange={(e) => handleItemChange(item.id, "unitPrice", Number(e.target.value))} placeholder="0" className="h-7 text-sm text-right border-0 shadow-none focus-visible:ring-0 px-1" />
                  </TableCell>
                  <TableCell className="py-1">
                    <Select value={item.taxType || "taxed"} onValueChange={(value) => handleItemChange(item.id, "taxType", value)}>
                      <SelectTrigger className="h-7 text-xs border-0 shadow-none focus:ring-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="taxed" className="text-xs">과세(10%)</SelectItem>
                        <SelectItem value="tax-free" className="text-xs">비과세</SelectItem>
                        <SelectItem value="zero-rated" className="text-xs">면세</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="py-1 text-right text-xs">{item.amount.toLocaleString()}</TableCell>
                  <TableCell className="py-1 text-right text-xs">{item.taxAmount.toLocaleString()}</TableCell>
                  <TableCell className="py-1 text-right text-xs font-semibold">{item.totalAmount.toLocaleString()}</TableCell>
                  <TableCell className="py-1 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(item.id)}
                      disabled={items.length === 1}
                      className="h-7 w-7 p-0"
                    >
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-blue-50 dark:bg-blue-950/20 font-semibold hover:bg-blue-50 dark:hover:bg-blue-950/20">
                <TableCell colSpan={7} className="text-right py-2 text-sm">합계</TableCell>
                <TableCell className="text-right py-2 text-sm">{totalAmount.toLocaleString()}</TableCell>
                <TableCell className="text-right py-2 text-sm">{totalTaxAmount.toLocaleString()}</TableCell>
                <TableCell className="text-right py-2 text-sm text-blue-600 dark:text-blue-400">{grandTotal.toLocaleString()}</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
            </table>
          </div>
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-end gap-2 mt-3">
        <Button onClick={handleSave} disabled={isSaving} className="min-w-[100px]">
          <Save className="h-4 w-4 mr-1.5" />
          {isSaving ? "저장 중..." : "저장"}
        </Button>
      </div>

      {/* 엑셀 일괄등록 모달 */}
      <ExcelBulkUploadModal
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        mode="sale"
      />
    </div>
  );
}
