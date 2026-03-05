import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { SearchModal } from "@/components/common/SearchModal";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, Trash2, Save, Search, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ITEM_TYPE_LABELS: Record<string, string> = {
  raw_material: "원재료",
  own_product: "자사제품",
  external_product: "외부제품",

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
  
  const [transactionDate, setTransactionDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");
  const [selectedPartnerName, setSelectedPartnerName] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  
  const [isPartnerSearchOpen, setIsPartnerSearchOpen] = useState(false);
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

  // 거래처 목록 조회 (전체 - customer 타입이 없을 수 있으므로)
  const { data: partners = [] } = trpc.partners.list.useQuery({});

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
  // subsidiary_material은 DB 스키마에 없으므로 제거

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
    onError: (error) => {
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

        return {
          ...item,
          itemMasterId: selectedMasterItem.id,
          itemType: selectedMasterItem.itemType,
          itemName: selectedMasterItem.itemName || "",
          unitPrice: selectedMasterItem.defaultUnitPrice || 0,
          packagingUnit: selectedMasterItem.baseUnit || "kg",
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
      if (e.key === "F2" && !isPartnerSearchOpen && !materialSearchItemId) {
        e.preventDefault();
        setIsPartnerSearchOpen(true);
      }
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPartnerSearchOpen, materialSearchItemId, selectedPartnerId, items, transactionDate, memo]);

  return (
    <div className="space-y-0">
      {/* 헤더 - 컴팩트 */}
      <div className="mb-3">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          매출 등록
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          F2 (거래처 검색) | Ctrl+S (저장)
        </p>
      </div>

      {/* 거래 정보 - 한 줄 */}
      <div className="bg-muted/30 rounded-md p-3 mb-3 border">
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs font-medium">거래처 *</Label>
            <div className="flex gap-1">
              <Input
                value={selectedPartnerName}
                placeholder="거래처를 검색하세요"
                readOnly
                className="h-8 text-sm cursor-pointer"
                onClick={() => setIsPartnerSearchOpen(true)}
              />
              <Button variant="outline" size="sm" className="h-8 px-2 shrink-0" onClick={() => setIsPartnerSearchOpen(true)}>
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

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
        <div style={{ maxHeight: "400px", overflow: "auto" }}>
          <Table className="text-sm">
            <TableHeader className="sticky top-0 bg-muted/80 z-10">
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
                <TableRow key={item.id} className="hover:bg-blue-50/50">
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
                  <TableCell className="py-1">
                    <div className="flex items-center gap-1">
                      <Input
                        value={item.itemName}
                        readOnly
                        placeholder="검색..."
                        onClick={() => setMaterialSearchItemId(item.id)}
                        className="h-7 text-sm cursor-pointer border-0 shadow-none focus-visible:ring-0 bg-transparent hover:bg-muted/50 px-1"
                      />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0" onClick={() => setMaterialSearchItemId(item.id)}>
                        <Search className="h-3 w-3" />
                      </Button>
                    </div>
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
          </Table>
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-end gap-2 mt-3">
        <Button onClick={handleSave} disabled={isSaving} className="min-w-[100px]">
          <Save className="h-4 w-4 mr-1.5" />
          {isSaving ? "저장 중..." : "저장"}
        </Button>
      </div>

      {/* 거래처 검색 모달 */}
      <SearchModal
        open={isPartnerSearchOpen}
        onOpenChange={setIsPartnerSearchOpen}
        title="거래처 검색"
        data={partners}
        columns={[
          { key: "companyName", label: "회사명", searchable: true },
          { key: "bizNo", label: "사업자번호", searchable: true },
          { key: "ceoName", label: "대표자명" },
          { key: "phone", label: "전화번호" },
        ]}
        onSelect={(partner: any) => {
          setSelectedPartnerId(String(partner.id));
          setSelectedPartnerName(partner.companyName);
          setIsPartnerSearchOpen(false);
        }}
        searchPlaceholder="회사명 또는 사업자번호로 검색..."
      />

      {/* 품목 검색 모달 */}
      <SearchModal
        open={!!materialSearchItemId}
        onOpenChange={(open) => !open && setMaterialSearchItemId(null)}
        title="품목 검색 (자사제품 / 원재료 / 외부제품 / 부자재)"
        data={allSaleItems}
        columns={[
          { key: "_displayType", label: "구분", searchable: false, render: (value: any) => value || "-" },
          { key: "itemName", label: "품목명", searchable: true, render: (value: any, row: any) => value || row.name || "-" },
          { key: "category", label: "카테고리", searchable: true },
          { key: "baseUnit", label: "단위" },
          { key: "defaultUnitPrice", label: "단가", render: (value: any) => `${Number(value || 0).toLocaleString()}원` },
        ]}
        onSelect={handleItemMasterSelect}
        searchPlaceholder="품목명, 카테고리로 검색"
      />
    </div>
  );
}
