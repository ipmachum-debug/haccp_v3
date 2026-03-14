import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PackageMinus, Loader2, AlertTriangle, DollarSign } from "lucide-react";
import { useLocation } from "wouter";
import { Checkbox } from "@/components/ui/checkbox";

export default function InventoryRelease() {
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState("");
  const [releaseDate, setReleaseDate] = useState(new Date().toISOString().split("T")[0]);
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("");
  const [autoCreateSale, setAutoCreateSale] = useState(true);
  const [unitPrice, setUnitPrice] = useState("");
  const [customerId, setCustomerId] = useState<number | null>(null);

  // 재고 LOT 목록 조회
  const { data: lots, refetch: refetchLots } = trpc.inventory.list.useQuery();

  // 원재료 목록 조회
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);

  // 거래처 목록 조회 (고객)
  const { data: customers } = trpc.partners.list.useQuery({ partnerType: "customer" });

  const [, navigate] = useLocation();

  // 매출 거래 생성 mutation
  const createSaleMutation = trpc.haccpIntegration.createSaleFromUsage.useMutation({
    onSuccess: (data: any) => {
      toast.success("매출 거래가 자동 생성되었습니다.", {
        action: {
          label: "보기",
          onClick: () => navigate("/sales"),
        },
      });
    },
    onError: (error: any) => {
      toast.error(`매출 거래 생성 실패: ${error.message}`);
    },
  });

  // 출고 mutation
  const releaseStockMutation = trpc.inventory.releaseStock.useMutation({
    onSuccess: async (data: any) => {
      toast.success("재고가 성공적으로 출고되었습니다.");
      
      // 자동 매출 거래 생성
      if (autoCreateSale && selectedLotId && unitPrice && customerId) {
        const selectedLot = lots?.find((lot: any) => lot.id === selectedLotId);
        const material = materials?.find((m: any) => m.id === selectedLot?.materialId);
        try {
          await createSaleMutation.mutateAsync({
            itemName: material?.materialName || "제품",
            quantity: quantity,
            unit: selectedLot?.unit || "개",
            unitPrice: unitPrice,
            partnerId: customerId,
          });
        } catch (error) {
          // 에러는 mutation의 onError에서 처리됨
        }
      }
      
      // 폼 초기화
      setSelectedLotId(null);
      setQuantity("");
      setUnitPrice("");
      setCustomerId(null);
      setReason("");
      setDestination("");
      setReleaseDate(new Date().toISOString().split("T")[0]);
      refetchLots();
    },
    onError: (error: any) => {
      toast.error(`출고 실패: ${error.message}`);
    },
  });

  const selectedLot = lots?.find((lot: any) => lot.id === selectedLotId);
  const availableQty = selectedLot ? parseFloat(selectedLot.availableQuantity) : 0;
  const requestedQty = parseFloat(quantity) || 0;
  const isInsufficientStock = requestedQty > availableQty;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedLotId) {
      toast.error("출고할 LOT를 선택해주세요.");
      return;
    }

    if (!quantity || parseFloat(quantity) <= 0) {
      toast.error("올바른 수량을 입력해주세요.");
      return;
    }

    // 재고 0개여도 출고 가능 (처음 프로그램 시작 시 재고 미입력 고려)
    // 단, 경고 메시지는 표시
    if (isInsufficientStock && availableQty > 0) {
      toast.warning(`가용 재고(${availableQty})보다 많은 수량을 출고합니다.`);
    }

    releaseStockMutation.mutate({
      lotId: selectedLotId,
      quantity: parseFloat(quantity),
      releaseDate,
      reason: reason || undefined,
      destination: destination || undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">재고 출고</h1>
          <p className="text-muted-foreground mt-2">
            재고 LOT에서 원재료를 출고합니다.
          </p>
        </div>

        {/* 출고 등록 폼 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PackageMinus className="w-5 h-5" />
              출고 등록
            </CardTitle>
            <CardDescription>
              출고할 LOT와 수량을 입력하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* LOT 선택 */}
                <div className="space-y-2 col-span-2">
                  <Label htmlFor="lot">재고 LOT *</Label>
                  <Select
                    value={selectedLotId?.toString() || ""}
                    onValueChange={(value) => setSelectedLotId(parseInt(value))}
                  >
                    <SelectTrigger id="lot">
                      <SelectValue placeholder="출고할 LOT 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {!lots || lots.length === 0 ? (
                        <SelectItem value="empty" disabled>
                          재고 LOT가 없습니다
                        </SelectItem>
                      ) : (
                        lots
                          .filter((lot: any) => parseFloat(lot.availableQuantity) > 0)
                          .map((lot: any) => {
                            const material = materials?.find((m: any) => m.id === lot.materialId);
                            return (
                              <SelectItem key={lot.id} value={lot.id.toString()}>
                                {lot.lotNumber} - {material?.materialName || "알 수 없음"} (가용: {lot.availableQuantity} {lot.unit})
                              </SelectItem>
                            );
                          })
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* 선택한 LOT 정보 표시 */}
                {selectedLot && (
                  <div className="col-span-2 p-4 bg-muted rounded-lg space-y-2">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">LOT 번호:</span>{" "}
                        <span className="font-medium">{selectedLot.lotNumber}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">가용 수량:</span>{" "}
                        <span className="font-medium">{selectedLot.availableQuantity} {selectedLot.unit}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">유통기한:</span>{" "}
                        <span className="font-medium">
                          {selectedLot.expiryDate ? new Date(selectedLot.expiryDate).toLocaleDateString() : "-"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 출고 수량 */}
                <div className="space-y-2">
                  <Label htmlFor="quantity">출고 수량 *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.01"
                    placeholder="예: 50"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  {isInsufficientStock && quantity && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="w-4 h-4" />
                      재고 부족 (가용: {availableQty} {selectedLot?.unit})
                    </div>
                  )}
                </div>

                {/* 출고일 */}
                <div className="space-y-2">
                  <Label htmlFor="releaseDate">출고일 *</Label>
                  <Input
                    id="releaseDate"
                    type="date"
                    value={releaseDate}
                    onChange={(e) => setReleaseDate(e.target.value)}
                  />
                </div>

                {/* 출고 사유 */}
                <div className="space-y-2">
                  <Label htmlFor="reason">출고 사유</Label>
                  <Input
                    id="reason"
                    placeholder="예: 생산 투입, 폐기 등"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </div>

                {/* 출고 목적지 */}
                <div className="space-y-2">
                  <Label htmlFor="destination">목적지</Label>
                  <Input
                    id="destination"
                    placeholder="예: 생산라인 A, 폐기장 등"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </div>
              </div>

              {/* 매출 거래 자동 생성 옵션 */}
              <div className="border-t pt-4 space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="autoCreateSale"
                    checked={autoCreateSale}
                    onCheckedChange={(checked) => setAutoCreateSale(checked as boolean)}
                  />
                  <Label htmlFor="autoCreateSale" className="flex items-center gap-2 cursor-pointer">
                    <DollarSign className="w-4 h-4" />
                    출고 시 매출 거래 자동 생성
                  </Label>
                </div>

                {autoCreateSale && (
                  <div className="grid grid-cols-2 gap-4 pl-6">
                    <div className="space-y-2">
                      <Label htmlFor="unitPrice">판매 단가 *</Label>
                      <Input
                        id="unitPrice"
                        type="number"
                        step="0.01"
                        placeholder="예: 10000"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customer">고객사 *</Label>
                      <Select
                        value={customerId?.toString() || ""}
                        onValueChange={(value) => setCustomerId(parseInt(value))}
                      >
                        <SelectTrigger id="customer">
                          <SelectValue placeholder="고객사 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {!customers || customers.length === 0 ? (
                            <SelectItem value="empty" disabled>
                              고객사가 없습니다
                            </SelectItem>
                          ) : (
                            customers.map((customer: any) => (
                              <SelectItem key={customer.id} value={customer.id.toString()}>
                                {customer.partnerName}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button 
                  type="submit" 
                  disabled={releaseStockMutation.isPending}
                >
                  {releaseStockMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      출고 처리 중...
                    </>
                  ) : (
                    <>
                      <PackageMinus className="w-4 h-4 mr-2" />
                      출고 등록
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 재고 현황 */}
        <Card>
          <CardHeader>
            <CardTitle>재고 현황</CardTitle>
            <CardDescription>
              현재 보유 중인 재고 LOT 목록입니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!lots || lots.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                재고가 없습니다.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>LOT 번호</TableHead>
                    <TableHead>원재료</TableHead>
                    <TableHead>총 수량</TableHead>
                    <TableHead>가용 수량</TableHead>
                    <TableHead>유통기한</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lots.map((lot: any) => {
                    const material = materials?.find((m: any) => m.id === lot.materialId);
                    const availableQty = parseFloat(lot.availableQuantity);
                    const totalQty = parseFloat(lot.quantity);
                    const usagePercent = ((totalQty - availableQty) / totalQty) * 100;
                    
                    return (
                      <TableRow key={lot.id}>
                        <TableCell className="font-medium">{lot.lotNumber}</TableCell>
                        <TableCell>{material?.materialName || "-"}</TableCell>
                        <TableCell>
                          {lot.quantity} {lot.unit}
                        </TableCell>
                        <TableCell>
                          {lot.availableQuantity} {lot.unit}
                        </TableCell>
                        <TableCell>
                          {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell>
                          {availableQty === 0 ? (
                            <Badge variant="secondary">소진</Badge>
                          ) : usagePercent > 80 ? (
                            <Badge variant="destructive">부족</Badge>
                          ) : usagePercent > 50 ? (
                            <Badge variant="outline">보통</Badge>
                          ) : (
                            <Badge variant="default">충분</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
