import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Package,
  Scale,
  Plus,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Info,
  Loader2,
  BarChart3,
  Box,
  Trash2,
} from "lucide-react";

export default function ProductionVerification() {
  return (
    <DashboardLayout>
      <ProductionVerificationContent />
    </DashboardLayout>
  );
}

function ProductionVerificationContent() {
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [activeTab, setActiveTab] = useState("input");
  const [isAddSkuDialogOpen, setIsAddSkuDialogOpen] = useState(false);
  const [isVerifyDialogOpen, setIsVerifyDialogOpen] = useState(false);

  // SKU 입력 폼 상태
  const [skuForm, setSkuForm] = useState({
    skuId: "",
    quantity: 0,
    defectiveQty: 0,
    notes: "",
  });

  // 검증 폼 상태
  const [verifyForm, setVerifyForm] = useState({
    plannedKg: 0,
    plannedSkuQty: 0,
    actualSkuQty: 0,
    wasteKg: 0,
    wasteReason: "",
    notes: "",
    skuId: undefined as number | undefined,
  });

  // 배치 목록 조회
  const { data: batchesData } = trpc.batch.list.useQuery({ limit: 100 });
  const batches = (batchesData as any)?.items ?? (Array.isArray(batchesData) ? batchesData : []);

  // 제품 목록 조회 (배치의 제품명 표시용)
  const { data: rawProductsData } = trpc.product.list.useQuery({ limit: 9999 });
  const productsList = (rawProductsData as any)?.items ?? (Array.isArray(rawProductsData) ? rawProductsData : []);
  const productMap = Object.fromEntries((productsList as any[]).map((p: any) => [p.id, p.productName || p.name || p.product_name]));
  const getProductName = (productId: any) => productMap[productId] || `제품#${productId}`;

  // SKU 목록 조회
  const { data: skuListData } = trpc.productSku.listAll.useQuery({});

  // 선택된 배치의 SKU 생산 실적 조회
  const { data: skuOutputs, refetch: refetchOutputs } = trpc.productionVerification.getSkuOutputs.useQuery(
    { batchId: Number(selectedBatchId) },
    { enabled: !!selectedBatchId }
  );

  // 선택된 배치의 검증 목록 조회
  const { data: verificationsData, refetch: refetchVerifications } = trpc.productionVerification.list.useQuery(
    { batchId: Number(selectedBatchId), limit: 50 },
    { enabled: !!selectedBatchId }
  );
  const verifications = (verificationsData as any)?.items ?? (Array.isArray(verificationsData) ? verificationsData : []);

  // SKU 생산 실적 등록 mutation
  const addSkuOutputMutation = trpc.productionVerification.addSkuOutput.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setIsAddSkuDialogOpen(false);
      setSkuForm({ skuId: "", quantity: 0, defectiveQty: 0, notes: "" });
      refetchOutputs();
    },
    onError: (error) => {
      toast.error(`등록 실패: ${error.message}`);
    },
  });

  // 생산 검증 등록 mutation
  const createVerificationMutation = trpc.productionVerification.create.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setIsVerifyDialogOpen(false);
      setVerifyForm({
        plannedKg: 0, plannedSkuQty: 0, actualSkuQty: 0,
        wasteKg: 0, wasteReason: "", notes: "", skuId: undefined,
      });
      refetchVerifications();
    },
    onError: (error) => {
      toast.error(`검증 실패: ${error.message}`);
    },
  });

  // 검증 상태 변경 mutation
  const updateStatusMutation = trpc.productionVerification.updateStatus.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchVerifications();
    },
    onError: (error) => {
      toast.error(`상태 변경 실패: ${error.message}`);
    },
  });

  // 선택된 배치 정보
  const selectedBatch = batches.find((b: any) => b.id?.toString() === selectedBatchId);

  // SKU 생산 실적 합계 계산
  const totalOutputKg = (skuOutputs || []).reduce((sum: number, o: any) => sum + Number(o.totalKg || 0), 0);
  const totalOutputQty = (skuOutputs || []).reduce((sum: number, o: any) => sum + Number(o.quantity || 0), 0);
  const totalDefective = (skuOutputs || []).reduce((sum: number, o: any) => sum + Number(o.defectiveQty || 0), 0);

  // 선택된 SKU의 kg 환산율 계산
  const selectedSku = (skuListData || []).find((s: any) => s.id?.toString() === skuForm.skuId);
  const estimatedKg = selectedSku ? skuForm.quantity * Number(selectedSku.kgPerSalesUnit || 1) : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-8 w-8" />
            생산 검증
          </h1>
          <p className="text-muted-foreground">
            생산 배치별 SKU 생산 실적을 입력하고, 계획 대비 실제 생산량을 검증합니다
          </p>
        </div>
      </div>

      {/* 안내 카드 */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800 space-y-1">
              <p className="font-medium">생산 검증 워크플로우</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-xs">1. 배치 선택</Badge>
                <ArrowRight className="h-3 w-3" />
                <Badge variant="outline" className="text-xs">2. SKU별 생산 실적 입력</Badge>
                <ArrowRight className="h-3 w-3" />
                <Badge variant="outline" className="text-xs">3. 자동 kg 환산</Badge>
                <ArrowRight className="h-3 w-3" />
                <Badge variant="outline" className="text-xs">4. 수율 검증</Badge>
              </div>
              <p className="text-xs text-blue-600">
                예) 콩고물쑥떡 270kg 생산 → 60g×30ea 100박스 + 60g×15ea 100박스 = 270kg 검증
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 배치 선택 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            배치 선택
          </CardTitle>
          <CardDescription>검증할 생산 배치를 선택하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>생산 배치</Label>
              <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                <SelectTrigger>
                  <SelectValue placeholder="배치 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {batches.map((batch: any) => (
                    <SelectItem key={batch.id} value={batch.id.toString()}>
                      {batch.batchCode} - {getProductName(batch.productId)} ({batch.plannedDate ? new Date(batch.plannedDate).toLocaleDateString("ko-KR") : ""})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedBatch && (
              <div className="space-y-2">
                <Label>배치 정보</Label>
                <div className="p-3 bg-muted rounded-md text-sm space-y-1">
                  <p><strong>배치번호:</strong> {selectedBatch.batchCode}</p>
                  <p><strong>제품:</strong> {getProductName(selectedBatch.productId)}</p>
                  <p><strong>계획 수량:</strong> {selectedBatch.plannedQuantity || "N/A"} kg</p>
                  <p><strong>생산일:</strong> {selectedBatch.plannedDate ? new Date(selectedBatch.plannedDate).toLocaleDateString("ko-KR") : "N/A"}</p>
                  <p><strong>상태:</strong> <Badge variant="outline">{selectedBatch.status}</Badge></p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 탭 - SKU 실적 / 검증 결과 */}
      {selectedBatchId && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="input" className="flex items-center gap-2">
              <Box className="h-4 w-4" />
              SKU 생산 실적
            </TabsTrigger>
            <TabsTrigger value="verify" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              검증 결과
            </TabsTrigger>
          </TabsList>

          {/* SKU 생산 실적 탭 */}
          <TabsContent value="input" className="space-y-4">
            {/* 요약 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">총 생산량 (kg)</div>
                  <div className="text-2xl font-bold text-green-600">{totalOutputKg.toFixed(1)} kg</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">총 생산 수량</div>
                  <div className="text-2xl font-bold">{totalOutputQty.toLocaleString()} 개</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">불량 수량</div>
                  <div className="text-2xl font-bold text-red-600">{totalDefective.toLocaleString()} 개</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-sm text-muted-foreground">SKU 종류</div>
                  <div className="text-2xl font-bold">{(skuOutputs || []).length} 종</div>
                </CardContent>
              </Card>
            </div>

            {/* SKU 실적 테이블 */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">SKU별 생산 실적</CardTitle>
                  <Dialog open={isAddSkuDialogOpen} onOpenChange={setIsAddSkuDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        SKU 실적 추가
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>SKU 생산 실적 입력</DialogTitle>
                        <DialogDescription>
                          생산된 SKU와 수량을 입력하면 자동으로 kg 환산됩니다
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>SKU 선택 *</Label>
                          <Select
                            value={skuForm.skuId}
                            onValueChange={(val) => setSkuForm({ ...skuForm, skuId: val })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="SKU를 선택하세요" />
                            </SelectTrigger>
                            <SelectContent>
                              {(skuListData || []).map((sku: any) => (
                                <SelectItem key={sku.id} value={sku.id.toString()}>
                                  {sku.itemName} - {sku.skuName} ({sku.salesUnit}) [{sku.kgPerSalesUnit}kg/단위]
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>생산 수량 *</Label>
                            <Input
                              type="number"
                              value={skuForm.quantity || ""}
                              onChange={(e) => setSkuForm({ ...skuForm, quantity: Number(e.target.value) })}
                              placeholder="0"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>불량 수량</Label>
                            <Input
                              type="number"
                              value={skuForm.defectiveQty || ""}
                              onChange={(e) => setSkuForm({ ...skuForm, defectiveQty: Number(e.target.value) })}
                              placeholder="0"
                            />
                          </div>
                        </div>
                        {selectedSku && skuForm.quantity > 0 && (
                          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
                            <div className="flex items-center gap-2 text-green-700">
                              <Scale className="h-4 w-4" />
                              <span className="font-medium">자동 kg 환산</span>
                            </div>
                            <p className="text-sm text-green-600 mt-1">
                              {skuForm.quantity} × {Number(selectedSku.kgPerSalesUnit)}kg = <strong>{estimatedKg.toFixed(3)} kg</strong>
                            </p>
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label>비고</Label>
                          <Textarea
                            value={skuForm.notes}
                            onChange={(e) => setSkuForm({ ...skuForm, notes: e.target.value })}
                            placeholder="비고 사항"
                            rows={2}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => {
                            if (!skuForm.skuId || skuForm.quantity <= 0) {
                              toast.error("SKU와 수량을 입력해주세요.");
                              return;
                            }
                            addSkuOutputMutation.mutate({
                              batchId: Number(selectedBatchId),
                              skuId: Number(skuForm.skuId),
                              quantity: skuForm.quantity,
                              defectiveQty: skuForm.defectiveQty,
                              notes: skuForm.notes || undefined,
                            });
                          }}
                          disabled={addSkuOutputMutation.isPending}
                        >
                          {addSkuOutputMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> 등록 중...</>
                          ) : (
                            "등록"
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>포장 단위</TableHead>
                        <TableHead className="text-right">생산 수량</TableHead>
                        <TableHead className="text-right">불량</TableHead>
                        <TableHead className="text-right">양품 수량</TableHead>
                        <TableHead className="text-right">kg 환산</TableHead>
                        <TableHead>비고</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(skuOutputs || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            SKU 생산 실적이 없습니다. "SKU 실적 추가" 버튼을 클릭하세요.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (skuOutputs || []).map((output: any) => (
                          <TableRow key={output.id}>
                            <TableCell className="font-medium">{output.skuName || "N/A"}</TableCell>
                            <TableCell>{output.salesUnit || "-"}</TableCell>
                            <TableCell className="text-right">{Number(output.quantity).toLocaleString()}</TableCell>
                            <TableCell className="text-right text-red-600">{Number(output.defectiveQty || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right font-semibold">
                              {(Number(output.quantity) - Number(output.defectiveQty || 0)).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-semibold">
                              {Number(output.totalKg || 0).toFixed(1)} kg
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">{output.notes || "-"}</TableCell>
                          </TableRow>
                        ))
                      )}
                      {(skuOutputs || []).length > 0 && (
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell colSpan={2}>합계</TableCell>
                          <TableCell className="text-right">{totalOutputQty.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-red-600">{totalDefective.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{(totalOutputQty - totalDefective).toLocaleString()}</TableCell>
                          <TableCell className="text-right text-green-600">{totalOutputKg.toFixed(1)} kg</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* 검증 등록 버튼 */}
            {(skuOutputs || []).length > 0 && (
              <div className="flex justify-end">
                <Dialog open={isVerifyDialogOpen} onOpenChange={setIsVerifyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="gap-2">
                      <CheckCircle2 className="h-5 w-5" />
                      생산 검증 등록
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>생산 검증 등록</DialogTitle>
                      <DialogDescription>
                        계획 대비 실제 생산량을 검증합니다. 수율과 차이가 자동 계산됩니다.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="p-3 bg-muted rounded-md text-sm">
                        <p><strong>배치:</strong> {selectedBatch?.batchNumber}</p>
                        <p><strong>SKU 실적 합계:</strong> {totalOutputKg.toFixed(1)} kg ({totalOutputQty}개)</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>계획 생산량 (kg) *</Label>
                          <Input
                            type="number"
                            value={verifyForm.plannedKg || ""}
                            onChange={(e) => setVerifyForm({ ...verifyForm, plannedKg: Number(e.target.value) })}
                            placeholder="예: 270"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>실제 생산량 (SKU 수량)</Label>
                          <Input
                            type="number"
                            value={totalOutputQty}
                            disabled
                            className="bg-muted"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>폐기량 (kg)</Label>
                          <Input
                            type="number"
                            value={verifyForm.wasteKg || ""}
                            onChange={(e) => setVerifyForm({ ...verifyForm, wasteKg: Number(e.target.value) })}
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>폐기 사유</Label>
                          <Input
                            value={verifyForm.wasteReason}
                            onChange={(e) => setVerifyForm({ ...verifyForm, wasteReason: e.target.value })}
                            placeholder="폐기 사유"
                          />
                        </div>
                      </div>
                      {verifyForm.plannedKg > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-md space-y-2">
                          <div className="flex items-center gap-2 text-amber-700 font-medium">
                            <BarChart3 className="h-4 w-4" />
                            자동 계산 결과
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground">실제 생산량:</span>
                              <span className="ml-2 font-semibold">{totalOutputKg.toFixed(1)} kg</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">차이:</span>
                              <span className={`ml-2 font-semibold ${totalOutputKg - verifyForm.plannedKg >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {(totalOutputKg - verifyForm.plannedKg) >= 0 ? "+" : ""}{(totalOutputKg - verifyForm.plannedKg).toFixed(1)} kg
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">수율:</span>
                              <span className={`ml-2 font-semibold ${(totalOutputKg / verifyForm.plannedKg * 100) >= 95 ? "text-green-600" : "text-amber-600"}`}>
                                {(totalOutputKg / verifyForm.plannedKg * 100).toFixed(1)}%
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">폐기율:</span>
                              <span className="ml-2 font-semibold text-red-600">
                                {verifyForm.plannedKg > 0 ? (verifyForm.wasteKg / verifyForm.plannedKg * 100).toFixed(1) : 0}%
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="space-y-2">
                        <Label>비고</Label>
                        <Textarea
                          value={verifyForm.notes}
                          onChange={(e) => setVerifyForm({ ...verifyForm, notes: e.target.value })}
                          placeholder="검증 관련 메모"
                          rows={2}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={() => {
                          if (verifyForm.plannedKg <= 0) {
                            toast.error("계획 생산량을 입력해주세요.");
                            return;
                          }
                          createVerificationMutation.mutate({
                            batchId: Number(selectedBatchId),
                            plannedKg: verifyForm.plannedKg,
                            actualSkuQty: totalOutputQty,
                            wasteKg: verifyForm.wasteKg,
                            wasteReason: verifyForm.wasteReason || undefined,
                            notes: verifyForm.notes || undefined,
                            skuId: verifyForm.skuId,
                          });
                        }}
                        disabled={createVerificationMutation.isPending}
                      >
                        {createVerificationMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> 검증 중...</>
                        ) : (
                          "검증 등록"
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </TabsContent>

          {/* 검증 결과 탭 */}
          <TabsContent value="verify" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">검증 이력</CardTitle>
                <CardDescription>이 배치의 생산 검증 결과를 확인합니다</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>검증일</TableHead>
                        <TableHead className="text-right">계획 (kg)</TableHead>
                        <TableHead className="text-right">실제 (kg)</TableHead>
                        <TableHead className="text-right">차이 (kg)</TableHead>
                        <TableHead className="text-right">수율</TableHead>
                        <TableHead className="text-right">폐기 (kg)</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead>관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(verifications || []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            검증 이력이 없습니다. SKU 실적을 입력한 후 검증을 등록하세요.
                          </TableCell>
                        </TableRow>
                      ) : (
                        (verifications || []).map((v: any) => {
                          const yieldRate = Number(v.yieldRate || 0);
                          const varianceKg = Number(v.varianceKg || 0);
                          return (
                            <TableRow key={v.id}>
                              <TableCell>
                                {v.createdAt ? new Date(v.createdAt).toLocaleDateString("ko-KR") : "-"}
                              </TableCell>
                              <TableCell className="text-right">{Number(v.plannedKg || 0).toFixed(1)}</TableCell>
                              <TableCell className="text-right font-semibold">{Number(v.actualTotalKg || 0).toFixed(1)}</TableCell>
                              <TableCell className={`text-right font-semibold ${varianceKg >= 0 ? "text-green-600" : "text-red-600"}`}>
                                <span className="flex items-center justify-end gap-1">
                                  {varianceKg >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                  {varianceKg >= 0 ? "+" : ""}{varianceKg.toFixed(1)}
                                </span>
                              </TableCell>
                              <TableCell className={`text-right font-semibold ${yieldRate >= 95 ? "text-green-600" : yieldRate >= 90 ? "text-amber-600" : "text-red-600"}`}>
                                {yieldRate.toFixed(1)}%
                              </TableCell>
                              <TableCell className="text-right text-red-600">{Number(v.wasteKg || 0).toFixed(1)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    v.status === "approved" ? "default" :
                                    v.status === "verified" ? "secondary" :
                                    v.status === "rejected" ? "destructive" : "outline"
                                  }
                                >
                                  {v.status === "approved" ? "승인" :
                                   v.status === "verified" ? "검증됨" :
                                   v.status === "rejected" ? "반려" : "대기"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {v.status === "pending" && (
                                  <div className="flex gap-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => updateStatusMutation.mutate({ id: v.id, status: "verified" })}
                                    >
                                      <CheckCircle2 className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="text-red-600"
                                      onClick={() => updateStatusMutation.mutate({ id: v.id, status: "rejected" })}
                                    >
                                      <AlertTriangle className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                                {v.status === "verified" && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => updateStatusMutation.mutate({ id: v.id, status: "approved" })}
                                  >
                                    승인
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* 배치 미선택 시 안내 */}
      {!selectedBatchId && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">생산 배치를 선택해주세요</p>
            <p className="text-sm mt-1">위에서 검증할 배치를 선택하면 SKU 실적 입력 및 검증을 진행할 수 있습니다.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
