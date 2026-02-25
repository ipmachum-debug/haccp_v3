import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Package, Plus, AlertTriangle, Download, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Inventory() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [lotNumber, setLotNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [expiryDate, setExpiryDate] = useState("");
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: lots, isLoading, refetch } = trpc.inventory.list.useQuery();
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  const exportInventory = trpc.excel.exportInventory.useMutation();

  const createLotMutation = trpc.inventory.createLot.useMutation({
    onSuccess: (result) => {
      toast.success(result.message);
      refetch();
      setIsDialogOpen(false);
      // 폼 초기화
      setMaterialId(null);
      setLotNumber("");
      setQuantity("");
      setUnit("kg");
      setExpiryDate("");
      setReceiptDate(new Date().toISOString().split("T")[0]);
    },
    onError: (error) => {
      toast.error(`입고 실패: ${error.message}`);
    },
  });

  const deleteLotMutation = trpc.inventory.deleteLot.useMutation({
    onSuccess: () => {
      toast.success("재고 LOT가 성공적으로 삭제되었습니다.");
      refetch();
    },
    onError: (error) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleDeleteLot = async (lotId: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteLotMutation.mutateAsync({ lotId });
    } catch (error: any) {
      // 이미 onError에서 처리됨
    }
  };

  const handleCreateLot = () => {
    if (!materialId || !lotNumber || !quantity) {
      toast.error("원재료, LOT 번호, 수량을 모두 입력해주세요");
      return;
    }

    createLotMutation.mutate({
      materialId,
      lotNumber,
      quantity,
      unit,
      expiryDate: expiryDate || undefined,
      receiptDate: receiptDate || undefined,
    });
  };

  // 상태 배지 스타일
  const getStatusBadge = (status: string) => {
    const styles = {
      available: "bg-green-100 text-green-700",
      reserved: "bg-blue-100 text-blue-700",
      used: "bg-gray-100 text-gray-700",
      expired: "bg-red-100 text-red-700",
      disposed: "bg-orange-100 text-orange-700",
    };
    const labels = {
      available: "사용 가능",
      reserved: "예약됨",
      used: "사용됨",
      expired: "만료됨",
      disposed: "폐기됨",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || styles.disposed}`}>
        {labels[status as keyof typeof labels] || "폐기됨"}
      </span>
    );
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 p-4 md:p-8">
        {/* 헤더 */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">재고 관리</h1>
            <p className="text-muted-foreground mt-1">원재료 재고 LOT를 관리합니다</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              onClick={async () => {
                const result = await exportInventory.mutateAsync();
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename;
                link.click();
              }} 
              disabled={exportInventory.isPending}
              className="min-h-[44px] min-w-[44px]"
            >
              <Download className="mr-2 h-4 w-4" />
              Excel 다운로드
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="min-h-[44px] min-w-[44px]">
                  <Plus className="mr-2 h-4 w-4" />
                  재고 입고
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>재고 입고</DialogTitle>
                <DialogDescription>새로운 재고 LOT를 생성합니다</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="material">원재료 *</Label>
                  <Select
                    value={materialId?.toString() || ""}
                    onValueChange={(value) => setMaterialId(parseInt(value))}
                  >
                    <SelectTrigger id="material" className="min-h-[44px]">
                      <SelectValue placeholder="원재료 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials?.map((material: any) => (
                        <SelectItem key={material.id} value={material.id.toString()}>
                          {material.materialName} ({material.materialCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lotNumber">LOT 번호 *</Label>
                  <Input
                    id="lotNumber"
                    placeholder="LOT-2026-001"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    className="min-h-[44px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">수량 *</Label>
                    <Input
                      id="quantity"
                      type="number"
                      step="0.001"
                      placeholder="0.000"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">단위 *</Label>
                    <Select value={unit} onValueChange={setUnit}>
                      <SelectTrigger id="unit" className="min-h-[44px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="mL">mL</SelectItem>
                        <SelectItem value="ea">ea</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="receiptDate">입고일</Label>
                  <Input
                    id="receiptDate"
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="min-h-[44px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expiryDate">유통기한</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className="min-h-[44px]"
                  />
                </div>

                <Button
                  onClick={handleCreateLot}
                  disabled={createLotMutation.isPending}
                  className="w-full min-h-[44px]"
                >
                  {createLotMutation.isPending ? "입고 중..." : "입고 완료"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* 재고 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>재고 LOT 목록</CardTitle>
            <CardDescription>현재 보유 중인 재고 LOT 목록입니다</CardDescription>
          </CardHeader>
          <CardContent>
            {!lots || lots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Package className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">재고가 없습니다</p>
                <p className="text-sm text-muted-foreground mt-2">
                  "재고 입고" 버튼을 클릭하여 새로운 재고를 추가하세요
                </p>
              </div>
            ) : (
              <>
                {/* 데스크톱: 테이블 뷰 */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium">LOT 번호</th>
                        <th className="text-left p-3 font-medium">원재료</th>
                        <th className="text-left p-3 font-medium">수량</th>
                        <th className="text-left p-3 font-medium">가용 수량</th>
                        <th className="text-left p-3 font-medium">입고일</th>
                        <th className="text-left p-3 font-medium">유통기한</th>
                        <th className="text-left p-3 font-medium">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lots.map((lot: any) => {
                        const isExpiringSoon =
                          lot.expiryDate &&
                          new Date(lot.expiryDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                        const isLowStock =
                          parseFloat(lot.availableQuantity) < parseFloat(lot.quantity) * 0.2;

                        return (
                          <tr key={lot.id} className="border-b hover:bg-accent/50">
                            <td className="p-3 font-medium">{lot.lotNumber}</td>
                            <td className="p-3">
                              <div>
                                <div className="font-medium">{lot.materialName}</div>
                                <div className="text-sm text-muted-foreground">{lot.materialCode}</div>
                              </div>
                            </td>
                            <td className="p-3">
                              {lot.quantity} {lot.unit}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {lot.availableQuantity} {lot.unit}
                                {isLowStock && (
                                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              {lot.receiptDate
                                ? new Date(lot.receiptDate).toLocaleDateString("ko-KR")
                                : "-"}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                {lot.expiryDate
                                  ? new Date(lot.expiryDate).toLocaleDateString("ko-KR")
                                  : "-"}
                                {isExpiringSoon && (
                                  <AlertTriangle
                                    className="h-4 w-4 text-red-500"
                                  />
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              {getStatusBadge(lot.status)}
                            </td>
                            <td className="p-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteLot(lot.id)}
                                disabled={deleteLotMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 모바일: 카드 뷰 */}
                <div className="md:hidden space-y-4">
                  {lots.map((lot: any) => {
                    const isExpiringSoon =
                      lot.expiryDate &&
                      new Date(lot.expiryDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                    const isLowStock =
                      parseFloat(lot.availableQuantity) < parseFloat(lot.quantity) * 0.2;

                    return (
                      <Card key={lot.id} className="hover:bg-accent/50 transition-colors">
                        <CardContent className="p-4 space-y-3">
                          {/* LOT 번호 */}
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-base">{lot.lotNumber}</span>
                            {getStatusBadge(lot.status)}
                          </div>

                          {/* 원재료 */}
                          <div>
                            <div className="font-medium">{lot.materialName}</div>
                            <div className="text-sm text-muted-foreground">{lot.materialCode}</div>
                          </div>

                          {/* 수량 정보 */}
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-muted-foreground">수량</div>
                              <div className="font-medium">{lot.quantity} {lot.unit}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">가용 수량</div>
                              <div className="font-medium flex items-center gap-1">
                                {lot.availableQuantity} {lot.unit}
                                {isLowStock && (
                                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 날짜 정보 */}
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <div className="text-muted-foreground">입고일</div>
                              <div className="font-medium">
                                {lot.receiptDate
                                  ? new Date(lot.receiptDate).toLocaleDateString("ko-KR")
                                  : "-"}
                              </div>
                            </div>
                            <div>
                              <div className="text-muted-foreground">유통기한</div>
                              <div className="font-medium flex items-center gap-1">
                                {lot.expiryDate
                                  ? new Date(lot.expiryDate).toLocaleDateString("ko-KR")
                                  : "-"}
                                {isExpiringSoon && (
                                  <AlertTriangle className="h-4 w-4 text-red-500" />
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
