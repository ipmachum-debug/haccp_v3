/**
 * ItemMasterManagement 분해 — 3개 다이얼로그.
 *  - ItemFormDialog    품목 등록/수정 (코드 자동 생성)
 *  - SkuFormDialog     SKU 등록 (코드 자동 생성)
 *  - SkuEditDialog     SKU 수정
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export type ItemType = "raw_material" | "own_product" | "external_product" | "subsidiary";

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  raw_material: "원재료",
  own_product: "자사제품",
  external_product: "외부제품",
  subsidiary: "부자재",
};

// ============================================================
// 품목 폼 다이얼로그 (코드 자동 생성 연동)
// ============================================================
export function ItemFormDialog({ open, onOpenChange, itemType, initialData, isEdit, onSubmit, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: ItemType;
  initialData?: any;
  isEdit?: boolean;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  // 카테고리 목록 조회
  const categoryType = itemType === 'subsidiary' ? 'product' : (itemType === 'own_product' || itemType === 'external_product' ? 'product' : 'material');
  const { data: categoriesData } = trpc.categories.listByType.useQuery({ type: categoryType });
  const rawCatData = categoriesData as any;
  const categories = Array.isArray(rawCatData) ? rawCatData : (rawCatData?.categories ?? []);

  // 코드 자동 생성 (신규 등록 시)
  const { data: generatedCode } = trpc.itemMaster.generateCode.useQuery(
    { itemType },
    { enabled: !isEdit && open }
  );

  const [form, setForm] = useState({
    itemCode: initialData?.itemCode || "",
    itemName: initialData?.itemName || "",
    itemType: itemType,
    category: initialData?.category || "",
    baseUnit: initialData?.baseUnit || "kg",
    supplierId: initialData?.supplierId || undefined,
    purchaseUnit: initialData?.purchaseUnit || "",
    purchaseConversionRate: Number(initialData?.purchaseConversionRate) || 1,
    productReportNo: initialData?.productReportNo || "",
    shelfLifeDays: initialData?.shelfLifeDays || undefined,
    defaultUnitPrice: Number(initialData?.defaultUnitPrice || 0),
    description: initialData?.description || "",
  });

  // 자동 생성 코드 적용
  useEffect(() => {
    if (!isEdit && generatedCode?.code && open) {
      setForm(prev => ({ ...prev, itemCode: generatedCode.code }));
    }
  }, [generatedCode, isEdit, open]);

  // 다이얼로그 열릴 때 초기화
  useEffect(() => {
    if (open) {
      if (isEdit && initialData) {
        setForm({
          itemCode: initialData.itemCode || "",
          itemName: initialData.itemName || "",
          itemType: itemType,
          category: initialData.category || "",
          baseUnit: initialData.baseUnit || "kg",
          supplierId: initialData.supplierId || undefined,
          purchaseUnit: initialData.purchaseUnit || "",
          purchaseConversionRate: Number(initialData.purchaseConversionRate) || 1,
          productReportNo: initialData.productReportNo || "",
          shelfLifeDays: initialData.shelfLifeDays || undefined,
          defaultUnitPrice: Number(initialData.defaultUnitPrice || 0),
          description: initialData.description || "",
        });
      } else {
        setForm({
          itemCode: generatedCode?.code || "",
          itemName: "",
          itemType: itemType,
          category: "",
          baseUnit: "kg",
          supplierId: undefined,
          purchaseUnit: "",
          purchaseConversionRate: 1,
          productReportNo: "",
          shelfLifeDays: undefined,
          defaultUnitPrice: 0,
          description: "",
        });
      }
    }
  }, [open, isEdit, initialData, itemType]);

  const handleSubmit = () => {
    if (!form.itemName) return;
    const data: any = { ...form };
    if (!isEdit) {
      data.itemType = itemType;
    }
    if (isEdit) {
      delete data.itemCode;
      delete data.itemType;
    }
    if (data.purchaseConversionRate !== undefined) data.purchaseConversionRate = Number(data.purchaseConversionRate);
    if (data.defaultUnitPrice !== undefined) data.defaultUnitPrice = Number(data.defaultUnitPrice);
    if (data.shelfLifeDays !== undefined && data.shelfLifeDays !== null) data.shelfLifeDays = Number(data.shelfLifeDays);
    if (data.supplierId !== undefined && data.supplierId !== null) data.supplierId = Number(data.supplierId);
    Object.keys(data).forEach(key => {
      if (key === 'itemName' || key === 'baseUnit') return;
      if (data[key] === '' || data[key] === undefined) delete data[key];
    });
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'number' && isNaN(data[key])) delete data[key];
    });
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `${ITEM_TYPE_LABELS[itemType]} 수정` : `${ITEM_TYPE_LABELS[itemType]} 등록`}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "품목 정보를 수정합니다." : "새로운 품목을 등록합니다."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {!isEdit && (
              <div className="space-y-2">
                <Label>품목코드 * (자동생성)</Label>
                <Input
                  value={form.itemCode}
                  onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
                  placeholder="자동 생성됨"
                  className="font-mono bg-muted/50"
                />
              </div>
            )}
            <div className={`space-y-2 ${isEdit ? "col-span-2" : ""}`}>
              <Label>품목명 *</Label>
              <Input
                value={form.itemName}
                onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                placeholder="품목명 입력"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  {form.category && !categories.some((cat: any) => cat.name === form.category) && (
                    <SelectItem key="current" value={form.category}>
                      {form.category} (미등록)
                    </SelectItem>
                  )}
                  {categories.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>기본단위</Label>
              <Select value={form.baseUnit} onValueChange={(v) => setForm({ ...form, baseUnit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                  <SelectItem value="mL">mL</SelectItem>
                  <SelectItem value="EA">EA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {(itemType === "raw_material" || itemType === "subsidiary") && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>구매단위</Label>
                <Input
                  value={form.purchaseUnit}
                  onChange={(e) => setForm({ ...form, purchaseUnit: e.target.value })}
                  placeholder="예: 포대, 박스"
                />
              </div>
              <div className="space-y-2">
                <Label>환산율 (구매→기본)</Label>
                <Input
                  type="number"
                  value={form.purchaseConversionRate}
                  onChange={(e) => setForm({ ...form, purchaseConversionRate: Number(e.target.value) })}
                  placeholder="1"
                />
              </div>
            </div>
          )}
          {(itemType === "own_product" || itemType === "external_product") && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>품목제조보고 번호</Label>
                <Input
                  value={form.productReportNo}
                  onChange={(e) => setForm({ ...form, productReportNo: e.target.value })}
                  placeholder="보고 번호"
                />
              </div>
              <div className="space-y-2">
                <Label>유통기한 (일)</Label>
                <Input
                  type="number"
                  value={form.shelfLifeDays || ""}
                  onChange={(e) => setForm({ ...form, shelfLifeDays: Number(e.target.value) || undefined })}
                  placeholder="예: 90"
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>기본단가 (원)</Label>
            <Input
              type="number"
              value={form.defaultUnitPrice || ""}
              onChange={(e) => setForm({ ...form, defaultUnitPrice: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>설명</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="품목 설명"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "처리 중..." : isEdit ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SKU 생성 다이얼로그 (코드 자동 생성)
// ============================================================
export function SkuFormDialog({ open, onOpenChange, itemId, itemCode, itemName, onSubmit, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: number;
  itemCode: string;
  itemName: string;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const { data: generatedSkuCode } = trpc.productSku.generateCode.useQuery(
    { parentItemCode: itemCode },
    { enabled: open }
  );

  const [form, setForm] = useState({
    skuCode: "",
    skuName: "",
    netWeightG: 0,
    piecesPerPack: 1,
    packsPerBox: 1,
    salesUnit: "box",
    kgPerSalesUnit: 0,
    unitPrice: 0,
    barcode: "",
    isDefault: 0,
  });

  useEffect(() => {
    if (generatedSkuCode?.code && open) {
      setForm(prev => ({ ...prev, skuCode: generatedSkuCode.code }));
    }
  }, [generatedSkuCode, open]);

  useEffect(() => {
    if (open) {
      setForm({
        skuCode: generatedSkuCode?.code || "",
        skuName: "",
        netWeightG: 0,
        piecesPerPack: 1,
        packsPerBox: 1,
        salesUnit: "box",
        kgPerSalesUnit: 0,
        unitPrice: 0,
        barcode: "",
        isDefault: 0,
      });
    }
  }, [open]);

  // 자동 계산: 개당 중량 × 팩당 개수 × 박스당 팩수 = 판매단위당 kg
  const autoCalcKg = () => {
    if (form.netWeightG > 0 && form.piecesPerPack > 0 && form.packsPerBox > 0) {
      const kg = (form.netWeightG * form.piecesPerPack * form.packsPerBox) / 1000;
      setForm(prev => ({ ...prev, kgPerSalesUnit: Number(kg.toFixed(4)) }));
    }
  };

  const handleSubmit = () => {
    if (!form.skuName || form.kgPerSalesUnit <= 0) return;
    onSubmit({
      itemId,
      ...form,
      skuCode: form.skuCode || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>SKU 등록</DialogTitle>
          <DialogDescription>
            {itemName} ({itemCode})의 새로운 포장 규격을 등록합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SKU 코드 (자동생성)</Label>
              <Input
                value={form.skuCode}
                onChange={(e) => setForm({ ...form, skuCode: e.target.value })}
                placeholder="자동 생성됨"
                className="font-mono bg-muted/50"
              />
            </div>
            <div className="space-y-2">
              <Label>SKU 명칭 *</Label>
              <Input
                value={form.skuName}
                onChange={(e) => setForm({ ...form, skuName: e.target.value })}
                placeholder={`${itemName} 60g×30ea`}
              />
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg space-y-3">
            <h4 className="font-semibold text-sm">포장 규격</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">개당 중량 (g)</Label>
                <Input
                  type="number"
                  value={form.netWeightG || ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm(prev => ({ ...prev, netWeightG: v }));
                  }}
                  onBlur={autoCalcKg}
                  placeholder="60"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">팩당 개수</Label>
                <Input
                  type="number"
                  value={form.piecesPerPack}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm(prev => ({ ...prev, piecesPerPack: v }));
                  }}
                  onBlur={autoCalcKg}
                  placeholder="30"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">박스당 팩수</Label>
                <Input
                  type="number"
                  value={form.packsPerBox}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm(prev => ({ ...prev, packsPerBox: v }));
                  }}
                  onBlur={autoCalcKg}
                  placeholder="1"
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              자동 계산: {form.netWeightG}g × {form.piecesPerPack}ea × {form.packsPerBox}pack = {((form.netWeightG * form.piecesPerPack * form.packsPerBox) / 1000).toFixed(4)} kg/판매단위
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>판매단위</Label>
              <Select value={form.salesUnit} onValueChange={(v) => setForm({ ...form, salesUnit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="box">박스 (box)</SelectItem>
                  <SelectItem value="pack">팩 (pack)</SelectItem>
                  <SelectItem value="ea">개 (ea)</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="set">세트 (set)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>판매단위당 kg *</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.kgPerSalesUnit || ""}
                onChange={(e) => setForm({ ...form, kgPerSalesUnit: Number(e.target.value) })}
                placeholder="1.8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>단가 (원)</Label>
              <Input
                type="number"
                value={form.unitPrice || ""}
                onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>바코드</Label>
              <Input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="바코드 번호"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "등록 중..." : "SKU 등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SKU 수정 다이얼로그
// ============================================================
export function SkuEditDialog({ open, onOpenChange, sku, itemName, onSubmit, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: any;
  itemName: string;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    skuName: sku?.skuName || "",
    netWeightG: Number(sku?.netWeightG || 0),
    piecesPerPack: sku?.piecesPerPack || 1,
    packsPerBox: sku?.packsPerBox || 1,
    salesUnit: sku?.salesUnit || "box",
    kgPerSalesUnit: Number(sku?.kgPerSalesUnit || 0),
    unitPrice: Number(sku?.unitPrice || 0),
    barcode: sku?.barcode || "",
    isDefault: sku?.isDefault || 0,
  });

  useEffect(() => {
    if (open && sku) {
      setForm({
        skuName: sku.skuName || "",
        netWeightG: Number(sku.netWeightG || 0),
        piecesPerPack: sku.piecesPerPack || 1,
        packsPerBox: sku.packsPerBox || 1,
        salesUnit: sku.salesUnit || "box",
        kgPerSalesUnit: Number(sku.kgPerSalesUnit || 0),
        unitPrice: Number(sku.unitPrice || 0),
        barcode: sku.barcode || "",
        isDefault: sku.isDefault || 0,
      });
    }
  }, [open, sku]);

  const autoCalcKg = () => {
    if (form.netWeightG > 0 && form.piecesPerPack > 0 && form.packsPerBox > 0) {
      const kg = (form.netWeightG * form.piecesPerPack * form.packsPerBox) / 1000;
      setForm(prev => ({ ...prev, kgPerSalesUnit: Number(kg.toFixed(4)) }));
    }
  };

  const handleSubmit = () => {
    if (!form.skuName || form.kgPerSalesUnit <= 0) return;
    onSubmit({
      id: sku.id,
      ...form,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>SKU 수정</DialogTitle>
          <DialogDescription>
            {itemName} - {sku?.skuCode} 수정
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SKU 코드</Label>
              <Input
                value={sku?.skuCode || ""}
                disabled
                className="font-mono bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>SKU 명칭 *</Label>
              <Input
                value={form.skuName}
                onChange={(e) => setForm({ ...form, skuName: e.target.value })}
              />
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg space-y-3">
            <h4 className="font-semibold text-sm">포장 규격</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">개당 중량 (g)</Label>
                <Input
                  type="number"
                  value={form.netWeightG || ""}
                  onChange={(e) => setForm(prev => ({ ...prev, netWeightG: Number(e.target.value) }))}
                  onBlur={autoCalcKg}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">팩당 개수</Label>
                <Input
                  type="number"
                  value={form.piecesPerPack}
                  onChange={(e) => setForm(prev => ({ ...prev, piecesPerPack: Number(e.target.value) }))}
                  onBlur={autoCalcKg}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">박스당 팩수</Label>
                <Input
                  type="number"
                  value={form.packsPerBox}
                  onChange={(e) => setForm(prev => ({ ...prev, packsPerBox: Number(e.target.value) }))}
                  onBlur={autoCalcKg}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              자동 계산: {form.netWeightG}g × {form.piecesPerPack}ea × {form.packsPerBox}pack = {((form.netWeightG * form.piecesPerPack * form.packsPerBox) / 1000).toFixed(4)} kg/판매단위
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>판매단위</Label>
              <Select value={form.salesUnit} onValueChange={(v) => setForm({ ...form, salesUnit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="box">박스 (box)</SelectItem>
                  <SelectItem value="pack">팩 (pack)</SelectItem>
                  <SelectItem value="ea">개 (ea)</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="set">세트 (set)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>판매단위당 kg *</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.kgPerSalesUnit || ""}
                onChange={(e) => setForm({ ...form, kgPerSalesUnit: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>단가 (원)</Label>
              <Input
                type="number"
                value={form.unitPrice || ""}
                onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>바코드</Label>
              <Input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>기본 SKU</Label>
              <Select value={String(form.isDefault)} onValueChange={(v) => setForm({ ...form, isDefault: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">아니오</SelectItem>
                  <SelectItem value="1">예</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "수정 중..." : "SKU 수정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
