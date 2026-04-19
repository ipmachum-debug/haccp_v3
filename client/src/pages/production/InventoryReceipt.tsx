import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { PackagePlus, Loader2, DollarSign } from "lucide-react";
import { useLocation } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";

import { todayLocal } from "../../lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function InventoryReceipt() {
  const L = useIndustryLabel();
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [autoLot, setAutoLot] = useState(true);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [expiryDate, setExpiryDate] = useState("");
  const [receiptDate, setReceiptDate] = useState(todayLocal());
  const [autoCreatePurchase, setAutoCreatePurchase] = useState(true);
  const [unitPrice, setUnitPrice] = useState("");
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState("");

  // 품목 목록 조회 (원재료 + 부재료 + 외주제품)
  const { data: _rawMaterials, isLoading: materialsLoading } = trpc.material.list.useQuery({ limit: 9999, itemTypes: ["raw_material", "subsidiary", "external_product"] });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);

  // 재고 LOT 목록 조회
  const { data: lots, refetch: refetchLots } = trpc.inventory.list.useQuery();

  // 거래처 목록 조회
  const { data: suppliers } = trpc.partners.list.useQuery({ partnerType: "supplier" });

  const [, navigate] = useLocation();

  // 매입 거래 생성 mutation
  const createPurchaseMutation = trpc.haccpIntegration.createPurchaseFromReceipt.useMutation({
    onSuccess: (data: any) => {
      toast.success("매입 거래가 자동 생성되었습니다.", {
        action: {
          label: "보기",
          onClick: () => navigate("/purchases"),
        },
      });
    },
    onError: (error: { message: string }) => {
      toast.error(`매입 거래 생성 실패: ${error.message}`);
    },
  });

  // 수동 LOT 입고 mutation
  const createLotMutation = trpc.inventory.createLot.useMutation({
    onSuccess: async (data: any) => {
      toast.success("재고가 성공적으로 입고되었습니다.");
      
      if (autoCreatePurchase && selectedMaterialId && unitPrice && supplierId) {
        const selectedMaterial = materials?.find((m: any) => m.id === selectedMaterialId);
        try {
          await createPurchaseMutation.mutateAsync({
            inventoryTransactionId: data.lotId,
            itemName: selectedMaterial?.materialName || "재료",
            quantity: quantity,
            unit: unit,
            unitPrice: unitPrice,
            partnerId: supplierId,
          });
        } catch (error) {}
      }
      
      setSelectedMaterialId(null);
      setLotNumber("");
      setQuantity("");
      setUnitPrice("");
      setSupplierId(null);
      setSupplierName("");
      setExpiryDate("");
      setReceiptDate(todayLocal());
      refetchLots();
    },
    onError: (error: { message: string }) => {
      toast.error(`입고 실패: ${error.message}`);
    },
  });

  // LOT 자동생성 입고 mutation
  const createReceivingWithLotMutation = trpc.lotManagement.createReceivingWithLot.useMutation({
    onSuccess: async (result: any) => {
      toast.success(`입고 완료! LOT: ${result.lotNumber}`);
      
      if (autoCreatePurchase && selectedMaterialId && unitPrice && supplierId) {
        const selectedMaterial = materials?.find((m: any) => m.id === selectedMaterialId);
        try {
          await createPurchaseMutation.mutateAsync({
            inventoryTransactionId: result.lotId || 0,
            itemName: selectedMaterial?.materialName || "재료",
            quantity: quantity,
            unit: unit,
            unitPrice: unitPrice,
            partnerId: supplierId,
          });
        } catch (error) {}
      }
      
      setSelectedMaterialId(null);
      setLotNumber("");
      setQuantity("");
      setUnitPrice("");
      setSupplierId(null);
      setSupplierName("");
      setExpiryDate("");
      setReceiptDate(todayLocal());
      refetchLots();
    },
    onError: (error: { message: string }) => {
      toast.error(`입고 실패: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMaterialId) {
      toast.error("원재료를 선택해주세요.");
      return;
    }

    if (!quantity || parseFloat(quantity) <= 0) {
      toast.error("올바른 수량을 입력해주세요.");
      return;
    }

    if (autoLot) {
      // LOT 자동 생성
      const mat = materials?.find((m: any) => m.id === selectedMaterialId);
      const supplierLabel = supplierId ? suppliers?.find((s: any) => s.id === supplierId)?.companyName : supplierName;
      createReceivingWithLotMutation.mutate({
        materialId: selectedMaterialId,
        materialCode: mat?.materialCode || `M${selectedMaterialId}`,
        quantity: parseFloat(quantity),
        unit,
        unitPrice: unitPrice ? parseFloat(unitPrice) : undefined,
        supplierName: supplierLabel || undefined,
        expiryDate: expiryDate || undefined,
        receiptDate: receiptDate || undefined,
        notes: '',
      });
    } else {
      // 수동 LOT 번호
      if (!lotNumber.trim()) {
        toast.error("LOT 번호를 입력해주세요.");
        return;
      }
      createLotMutation.mutate({
        materialId: selectedMaterialId,
        lotNumber: lotNumber.trim(),
        quantity,
        unit,
        expiryDate: expiryDate || undefined,
        receiptDate: receiptDate || undefined,
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">재고 입고</h1>
          <p className="text-muted-foreground mt-2">
            원재료를 입고하고 LOT 번호를 등록합니다.
          </p>
        </div>

        {/* 입고 등록 폼 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5" />
              입고 등록
            </CardTitle>
            <CardDescription>
              원재료 정보와 LOT 번호를 입력하여 재고를 입고하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* 원재료 선택 */}
                <div className="space-y-2">
                  <Label htmlFor="material">{`${L("material")} *`}</Label>
                  <Select
                    value={selectedMaterialId?.toString() || ""}
                    onValueChange={(value) => {
                      setSelectedMaterialId(parseInt(value));
                      // 선택한 원재료의 기본 단위 설정
                      const material = materials?.find((m: any) => m.id === parseInt(value));
                      if (material?.unit) {
                        setUnit(material.unit);
                      }
                    }}
                  >
                    <SelectTrigger id="material">
                      <SelectValue placeholder="원재료 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {materialsLoading ? (
                        <SelectItem value="loading" disabled>
                          로딩 중...
                        </SelectItem>
                      ) : materials && materials.length > 0 ? (
                        materials.map((material: any) => (
                          <SelectItem key={material.id} value={material.id.toString()}>
                            {material.materialName} ({material.materialCode})
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="empty" disabled>
                          원재료가 없습니다
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* LOT 번호 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="lotNumber">LOT 번호</Label>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="autoLot"
                        checked={autoLot}
                        onCheckedChange={(v) => setAutoLot(!!v)}
                      />
                      <label htmlFor="autoLot" className="text-xs text-muted-foreground cursor-pointer">자동 생성</label>
                    </div>
                  </div>
                  {autoLot ? (
                    <div className="flex items-center h-10 px-3 border rounded-md bg-muted text-muted-foreground text-sm">
                      MAT-[코드]-[날짜]-[순번] 자동 생성
                    </div>
                  ) : (
                    <Input
                      id="lotNumber"
                      placeholder="예: LOT-2024-001"
                      value={lotNumber}
                      onChange={(e) => setLotNumber(e.target.value)}
                    />
                  )}
                </div>

                {/* 수량 */}
                <div className="space-y-2">
                  <Label htmlFor="quantity">수량 *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    placeholder="예: 100"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </div>

                {/* 단위 */}
                <div className="space-y-2">
                  <Label htmlFor="unit">단위 *</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger id="unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="kg">kg</SelectItem>
                      <SelectItem value="g">g</SelectItem>
                      <SelectItem value="L">L</SelectItem>
                      <SelectItem value="mL">mL</SelectItem>
                      <SelectItem value="개">개</SelectItem>
                      <SelectItem value="박스">박스</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 입고일 */}
                <div className="space-y-2">
                  <Label htmlFor="receiptDate">입고일</Label>
                  <Input
                    id="receiptDate"
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                  />
                </div>

                {/* 유통기한 */}
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">유통기한</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
              </div>

              {/* 매입 거래 자동 생성 옵션 */}
              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="autoCreatePurchase"
                    checked={autoCreatePurchase}
                    onCheckedChange={(checked) => setAutoCreatePurchase(checked as boolean)}
                  />
                  <Label htmlFor="autoCreatePurchase" className="flex items-center gap-2 cursor-pointer">
                    <DollarSign className="w-4 h-4" />
                    매입 거래 자동 생성
                  </Label>
                </div>

                {autoCreatePurchase && (
                  <div className="grid grid-cols-2 gap-4 pl-6">
                    {/* 거래처 선택 */}
                    <div className="space-y-2">
                      <Label htmlFor="supplier">거래처 *</Label>
                      <Select
                        value={supplierId?.toString() || ""}
                        onValueChange={(value) => setSupplierId(parseInt(value))}
                      >
                        <SelectTrigger id="supplier">
                          <SelectValue placeholder="거래처 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {suppliers?.map((supplier: any) => (
                            <SelectItem key={supplier.id} value={supplier.id.toString()}>
                              {supplier.companyName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* 단가 */}
                    <div className="space-y-2">
                      <Label htmlFor="unitPrice">단가 *</Label>
                      <Input
                        id="unitPrice"
                        type="number"
                        step="0.01"
                        placeholder="예: 10000"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={createLotMutation.isPending || createReceivingWithLotMutation.isPending}>
                  {(createLotMutation.isPending || createReceivingWithLotMutation.isPending) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      입고 처리 중...
                    </>
                  ) : (
                    <>
                      <PackagePlus className="w-4 h-4 mr-2" />
                      {autoLot ? "입고 (LOT 자동생성)" : "입고 등록"}
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 최근 입고 내역 */}
        <Card>
          <CardHeader>
            <CardTitle>최근 입고 내역</CardTitle>
            <CardDescription>
              최근 등록된 재고 LOT 목록입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!lots || lots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                입고 내역이 없습니다.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>LOT 번호</TableHead>
                    <TableHead>원재료</TableHead>
                    <TableHead>수량</TableHead>
                    <TableHead>가용 수량</TableHead>
                    <TableHead>입고일</TableHead>
                    <TableHead>유통기한</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lots.slice(0, 10).map((lot: any) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{lot.lotNumber}</TableCell>
                      <TableCell>
                        {materials?.find((m: any) => m.id === lot.materialId)?.materialName || "-"}
                      </TableCell>
                      <TableCell>
                        {lot.quantity} {lot.unit}
                      </TableCell>
                      <TableCell>
                        {lot.availableQuantity} {lot.unit}
                      </TableCell>
                      <TableCell>
                        {lot.receiptDate ? new Date(lot.receiptDate).toLocaleDateString() : "-"}
                      </TableCell>
                      <TableCell>
                        {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString() : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
