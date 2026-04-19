import { useState } from "react";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Package, Plus, Calendar, Clock } from "lucide-react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";

import { todayLocal } from "../../lib/dateUtils";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
export default function MaterialReceiptManagement() {
  const L = useIndustryLabel();
  const [activeTab, setActiveTab] = useTabWithUrl('tab', 'lots');
  const [isReceiveDialogOpen, setIsReceiveDialogOpen] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);

  // 품목 목록 조회 (원재료 + 부재료 + 외주제품)
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999, itemTypes: ["raw_material", "subsidiary", "external_product"] });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);

  // 재고 LOT 목록 조회
  const { data: lots = [], refetch: refetchLots } = trpc.inventory.list.useQuery();

  // 원재료 입고 mutation
  const receiveMaterialMutation = trpc.inventory.receiveMaterial.useMutation({
    onSuccess: () => {
      toast.success("원재료가 입고되었습니다.");
      setIsReceiveDialogOpen(false);
      refetchLots();
    },
    onError: (error: { message: string }) => {
      toast.error(`입고 실패: ${error.message}`);
    },
  });

  // 폼 제출
  const handleReceiveMaterial = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const materialId = parseInt(formData.get("materialId") as string);
    const quantity = parseFloat(formData.get("quantity") as string);
    const unit = formData.get("unit") as string;
    const receiptDate = formData.get("receiptDate") as string;
    const expiryDate = formData.get("expiryDate") as string;
    const lotNumber = formData.get("lotNumber") as string;
    const location = formData.get("location") as string;

    receiveMaterialMutation.mutate({
      materialId,
      quantity,
      unit,
      receiptDate,
      expiryDate: expiryDate || undefined,
      lotNumber: lotNumber || undefined,
      location: location || undefined,
    });
  };

  // FEFO 순서로 LOT 조회
  const { data: fefoLots = [] } = trpc.inventory.getLotsByMaterialFefo.useQuery(
    { materialId: selectedMaterialId! },
    { enabled: !!selectedMaterialId }
  );

  // 재고 거래 내역 조회
  const { data: transactions = [] } = trpc.inventory.getInventoryTransactions.useQuery({});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">원재료 입고 관리</h1>
          <p className="text-muted-foreground mt-1">
            원재료 입고, LOT 관리, 재고 거래 내역 조회
          </p>
        </div>
        <Dialog open={isReceiveDialogOpen} onOpenChange={setIsReceiveDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              원재료 입고
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <form onSubmit={handleReceiveMaterial}>
              <DialogHeader>
                <DialogTitle>원재료 입고</DialogTitle>
                <DialogDescription>
                  입고할 원재료 정보를 입력하세요. LOT 번호는 자동 생성됩니다.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="materialId">원재료 *</Label>
                  <Select name="materialId" required>
                    <SelectTrigger>
                      <SelectValue placeholder="원재료 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {materials.map((material: any) => (
                        <SelectItem key={material.id} value={material.id.toString()}>
                          {material.materialName} ({material.materialCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="quantity">수량 *</Label>
                    <Input
                      id="quantity"
                      name="quantity"
                      type="number"
                      step="0.01"
                      required
                      placeholder="100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="unit">단위 *</Label>
                    <Input
                      id="unit"
                      name="unit"
                      required
                      placeholder="kg"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receiptDate">입고일 *</Label>
                  <Input
                    id="receiptDate"
                    name="receiptDate"
                    type="date"
                    required
                    defaultValue={todayLocal()}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiryDate">유통기한</Label>
                  <Input
                    id="expiryDate"
                    name="expiryDate"
                    type="date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lotNumber">LOT 번호 (선택)</Label>
                  <Input
                    id="lotNumber"
                    name="lotNumber"
                    placeholder="미입력 시 자동 생성"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="location">보관 위치</Label>
                  <Input
                    id="location"
                    name="location"
                    placeholder="예: A-01"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsReceiveDialogOpen(false)}
                >
                  취소
                </Button>
                <Button type="submit" disabled={receiveMaterialMutation.isPending}>
                  {receiveMaterialMutation.isPending ? "처리 중..." : "입고"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="lots">재고 LOT 목록</TabsTrigger>
          <TabsTrigger value="fefo">FEFO 조회</TabsTrigger>
          <TabsTrigger value="transactions">거래 내역</TabsTrigger>
        </TabsList>

        <TabsContent value="lots" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>재고 LOT 목록</CardTitle>
              <CardDescription>
                전체 재고 LOT 목록을 확인할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>LOT 번호</TableHead>
                    <TableHead>원재료</TableHead>
                    <TableHead>수량</TableHead>
                    <TableHead>가용 수량</TableHead>
                    <TableHead>입고일</TableHead>
                    <TableHead>유통기한</TableHead>
                    <TableHead>보관 위치</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        등록된 LOT가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lots.map((lot: any) => (
                      <TableRow key={lot.id}>
                        <TableCell className="font-mono">{lot.lotNumber}</TableCell>
                        <TableCell>
                          {materials.find((m: any) => m.id === lot.materialId)?.materialName || "-"}
                        </TableCell>
                        <TableCell>{lot.quantity} {lot.unit}</TableCell>
                        <TableCell>{lot.availableQuantity} {lot.unit}</TableCell>
                        <TableCell>
                          {lot.receiptDate ? new Date(lot.receiptDate).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell>
                          {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString() : "-"}
                        </TableCell>
                        <TableCell>{lot.location || "-"}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              lot.status === "available"
                                ? "bg-green-100 text-green-700"
                                : lot.status === "used"
                                ? "bg-gray-100 text-gray-700"
                                : lot.status === "expired"
                                ? "bg-red-100 text-red-700"
                                : lot.status === "disposed"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {lot.status === "available"
                              ? "사용 가능"
                              : lot.status === "used"
                              ? "사용됨"
                              : lot.status === "expired"
                              ? "만료"
                              : lot.status === "disposed"
                              ? "폐기"
                              : "예약"}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fefo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>FEFO 순서 조회</CardTitle>
              <CardDescription>
                원재료별로 유통기한이 가까운 순서로 LOT를 조회합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>원재료 선택</Label>
                <Select
                  value={selectedMaterialId?.toString() || ""}
                  onValueChange={(value) => setSelectedMaterialId(parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="원재료를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((material: any) => (
                      <SelectItem key={material.id} value={material.id.toString()}>
                        {material.materialName} ({material.materialCode})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedMaterialId && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>LOT 번호</TableHead>
                      <TableHead>가용 수량</TableHead>
                      <TableHead>입고일</TableHead>
                      <TableHead>유통기한</TableHead>
                      <TableHead>보관 위치</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fefoLots.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          사용 가능한 LOT가 없습니다.
                        </TableCell>
                      </TableRow>
                    ) : (
                      fefoLots.map((lot: any, index: any) => (
                        <TableRow key={lot.id}>
                          <TableCell className="font-mono">
                            {index === 0 && (
                              <span className="inline-flex items-center mr-2 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                                우선 사용
                              </span>
                            )}
                            {lot.lotNumber}
                          </TableCell>
                          <TableCell>{lot.availableQuantity} {lot.unit}</TableCell>
                          <TableCell>
                            {lot.receiptDate ? new Date(lot.receiptDate).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell>
                            {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell>{lot.location || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>재고 거래 내역</CardTitle>
              <CardDescription>
                원재료 입고, 사용, 폐기 등의 거래 내역을 확인할 수 있습니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>거래 유형</TableHead>
                    <TableHead>LOT 번호</TableHead>
                    <TableHead>수량</TableHead>
                    <TableHead>거래 후 재고</TableHead>
                    <TableHead>거래일시</TableHead>
                    <TableHead>비고</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        거래 내역이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              tx.transactionType === "receipt"
                                ? "bg-green-100 text-green-700"
                                : tx.transactionType === "usage"
                                ? "bg-blue-100 text-blue-700"
                                : tx.transactionType === "disposal"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {tx.transactionType === "receipt"
                              ? "입고"
                              : tx.transactionType === "usage"
                              ? "사용"
                              : tx.transactionType === "disposal"
                              ? "폐기"
                              : tx.transactionType === "adjustment"
                              ? "조정"
                              : "이동"}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono">
                          {lots.find((l: any) => l.id === tx.lotId)?.lotNumber || "-"}
                        </TableCell>
                        <TableCell>
                          {tx.transactionType === "receipt" || tx.transactionType === "adjustment"
                            ? "+"
                            : "-"}
                          {tx.quantity} {tx.unit}
                        </TableCell>
                        <TableCell>-</TableCell>
                        <TableCell>
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : "-"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{tx.notes || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
