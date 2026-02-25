import { useState, useMemo } from "react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, TrendingUp, RotateCw, AlertCircle, Calendar, Search, PackageMinus, PackagePlus, Settings } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import LotTraceabilityModal from "@/components/LotTraceabilityModal";

export default function InventoryManagement() {
  const [trendPeriod, setTrendPeriod] = useState<"week" | "month">("week");
  const [lotModalOpen, setLotModalOpen] = useState(false);
  
  // 재고 현황 대시보드 조회
  const { data: dashboard, isLoading: isLoadingDashboard } = trpc.inventory.getDashboard.useQuery();
  
  // 재고 이동 추이 조회
  const trendDates = useMemo(() => {
    const end = new Date();
    const start = new Date();
    if (trendPeriod === "week") {
      start.setDate(end.getDate() - 7);
    } else {
      start.setMonth(end.getMonth() - 1);
    }
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }, [trendPeriod]);
  
  const { data: trend, isLoading: isLoadingTrend } = trpc.inventory.getTrend.useQuery(trendDates);
  
  // 재고 회전율 분석 조회
  const { data: turnoverAnalysis, isLoading: isLoadingTurnover } = trpc.inventory.getTurnoverAnalysis.useQuery(trendDates);
  
  return (
    <DashboardLayout>
      <div className="container py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">재고 관리</h1>
              <p className="text-muted-foreground">재고 현황, 예측, 회전율 분석을 한눈에 확인하세요</p>
            </div>
          </div>
          <Button onClick={() => setLotModalOpen(true)} variant="outline">
            <Search className="h-4 w-4 mr-2" />
            LOT 추적
          </Button>
        </div>

        <Tabs defaultValue="current" className="space-y-6">
          <TabsList className="grid w-full grid-cols-9 gap-1">
            <TabsTrigger value="current" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span>재고현황</span>
            </TabsTrigger>
            <TabsTrigger value="release" className="flex items-center gap-2">
              <PackageMinus className="h-4 w-4" />
              <span>재고출고</span>
            </TabsTrigger>
            <TabsTrigger value="receipt" className="flex items-center gap-2">
              <PackagePlus className="h-4 w-4" />
              <span>입고관리</span>
            </TabsTrigger>
            <TabsTrigger value="trend" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              <span>이동추이</span>
            </TabsTrigger>
            <TabsTrigger value="turnover" className="flex items-center gap-2">
              <RotateCw className="h-4 w-4" />
              <span>회전율</span>
            </TabsTrigger>
            <TabsTrigger value="prediction" className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span>재고예측</span>
            </TabsTrigger>
            <TabsTrigger value="purchase" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              <span>발주제안</span>
            </TabsTrigger>
            <TabsTrigger value="adjustment" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              <span>재고조정</span>
            </TabsTrigger>
          </TabsList>

          {/* 재고 현황 탭 */}
          <TabsContent value="current" className="space-y-4">
            {/* 통계 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">전체 LOT 수</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoadingDashboard ? "-" : dashboard?.stats.totalLots.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">가용 LOT 수</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoadingDashboard ? "-" : dashboard?.stats.availableLots.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">총 재고 가치</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {isLoadingDashboard ? "-" : `₩${dashboard?.stats.totalValue.toLocaleString()}`}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-destructive">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span>유통기한 임박</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {isLoadingDashboard ? "-" : dashboard?.stats.expiringSoonLots.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
              
              <Card className="border-warning">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-warning" />
                    <span>재고 부족</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-warning">
                    {isLoadingDashboard ? "-" : dashboard?.stats.lowStockCount.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* 재고 부족 원재료 */}
            {dashboard && dashboard.lowStockMaterials.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-warning" />
                    <span>재고 부족 원재료</span>
                  </CardTitle>
                  <CardDescription>
                    최소 재고 수준 이하의 원재료 목록
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>원재료</TableHead>
                        <TableHead>현재 재고</TableHead>
                        <TableHead>최소 재고</TableHead>
                        <TableHead>LOT 수</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.lowStockMaterials.map((material) => (
                        <TableRow key={material.materialId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{material.materialName}</div>
                              <div className="text-sm text-muted-foreground">{material.materialCode}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="destructive">
                              {Number(material.totalQuantity).toFixed(2)} {material.unit}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {parseFloat(material.safetyStockLevel || "0").toFixed(2)} {material.unit}
                          </TableCell>
                          <TableCell>{material.lotCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            
            {/* 유통기한 임박 LOT */}
            {dashboard && dashboard.expiringLots.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-destructive" />
                    <span>유통기한 임박 LOT</span>
                  </CardTitle>
                  <CardDescription>
                    유통기한 경고 기간 이내의 LOT 목록
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>LOT 번호</TableHead>
                        <TableHead>원재료</TableHead>
                        <TableHead>가용 수량</TableHead>
                        <TableHead>유통기한</TableHead>
                        <TableHead>남은 일수</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.expiringLots.map((lot) => (
                        <TableRow key={lot.id}>
                          <TableCell className="font-medium">{lot.lotNumber}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{lot.materialName}</div>
                              <div className="text-sm text-muted-foreground">{lot.materialCode}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {parseFloat(lot.availableQuantity).toFixed(2)} {lot.unit}
                          </TableCell>
                          <TableCell>
                            {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString("ko-KR") : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={lot.daysUntilExpiry && lot.daysUntilExpiry <= 3 ? "destructive" : "secondary"}>
                              {lot.daysUntilExpiry !== null ? `${lot.daysUntilExpiry}일` : "-"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
            
            {/* 원재료별 재고 현황 */}
            <Card>
              <CardHeader>
                <CardTitle>원재료별 재고 현황</CardTitle>
                <CardDescription>
                  전체 원재료의 재고 현황 및 가치
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingDashboard ? (
                  <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
                ) : !dashboard || dashboard.materialStocks.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    재고 데이터가 없습니다.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>원재료</TableHead>
                        <TableHead>총 수량</TableHead>
                        <TableHead>LOT 수</TableHead>
                        <TableHead>단가</TableHead>
                        <TableHead>총 가치</TableHead>
                        <TableHead>상태</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dashboard.materialStocks.map((material) => (
                        <TableRow key={material.materialId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{material.materialName}</div>
                              <div className="text-sm text-muted-foreground">{material.materialCode}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {Number(material.totalQuantity).toFixed(2)} {material.unit}
                          </TableCell>
                          <TableCell>{material.lotCount}</TableCell>
                          <TableCell>₩{parseFloat(material.unitPrice || "0").toLocaleString()}</TableCell>
                          <TableCell className="font-medium">
                            ₩{material.totalValue.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            {material.isLowStock ? (
                              <Badge variant="destructive">재고 부족</Badge>
                            ) : (
                              <Badge variant="secondary">정상</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 이동 추이 탭 */}
          <TabsContent value="trend" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>재고 이동 추이</CardTitle>
                    <CardDescription>
                      일별 입고/사용/조정 내역
                    </CardDescription>
                  </div>
                  <Select value={trendPeriod} onValueChange={(v) => setTrendPeriod(v as "week" | "month")}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="week">최근 7일</SelectItem>
                      <SelectItem value="month">최근 30일</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingTrend ? (
                  <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
                ) : !trend || trend.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    선택한 기간에 데이터가 없습니다.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>일자</TableHead>
                        <TableHead>입고</TableHead>
                        <TableHead>사용</TableHead>
                        <TableHead>조정</TableHead>
                        <TableHead>순변동</TableHead>
                        <TableHead>거래 건수</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trend.map((row) => (
                        <TableRow key={row.date}>
                          <TableCell className="font-medium">{row.date}</TableCell>
                          <TableCell className="text-green-600">+{Number(row.receiptQuantity || 0).toFixed(2)}</TableCell>
                          <TableCell className="text-red-600">-{Number(row.usageQuantity || 0).toFixed(2)}</TableCell>
                          <TableCell>{Number(row.adjustmentQuantity || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={Number(row.netChange || 0) >= 0 ? "default" : "secondary"}>
                              {Number(row.netChange || 0) >= 0 ? "+" : ""}{Number(row.netChange || 0).toFixed(2)}
                            </Badge>
                          </TableCell>
                          <TableCell>{row.transactionCount}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 회전율 탭 */}
          <TabsContent value="turnover" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>원재료별 재고 회전율 분석</CardTitle>
                <CardDescription>
                  {trendPeriod === "week" ? "최근 7일" : "최근 30일"} 기준 재고 회전율 및 재고 일수
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingTurnover ? (
                  <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
                ) : !turnoverAnalysis || turnoverAnalysis.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    선택한 기간에 데이터가 없습니다.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>원재료</TableHead>
                        <TableHead>총 사용량</TableHead>
                        <TableHead>현재 재고</TableHead>
                        <TableHead>회전율</TableHead>
                        <TableHead>재고 일수</TableHead>
                        <TableHead>일평균 사용량</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {turnoverAnalysis.map((material) => (
                        <TableRow key={material.materialId}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{material.materialName}</div>
                              <div className="text-sm text-muted-foreground">{material.materialCode}</div>
                            </div>
                          </TableCell>
                          <TableCell>{Number(material.usageQuantity || 0).toFixed(2)}</TableCell>
                          <TableCell>{Number(material.averageInventory || 0).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant={material.turnoverRate >= 1 ? "default" : "secondary"}>
                              {material.turnoverRate.toFixed(2)}
                            </Badge>
                          </TableCell>
                          <TableCell>{material.averageHoldingPeriod.toFixed(0)}일</TableCell>
                          <TableCell>{material.efficiency}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 재고 예측 탭 */}
          <TabsContent value="prediction" className="space-y-4">
            <PredictionTab />
          </TabsContent>

          {/* 발주 제안 탭 */}
          <TabsContent value="purchase" className="space-y-4">
            <PurchaseOrderTab />
          </TabsContent>

          {/* 재고출고 탭 */}
          <TabsContent value="release" className="space-y-4">
            <ReleaseTab />
          </TabsContent>

          {/* 입고관리 탭 */}
          <TabsContent value="receipt" className="space-y-4">
            <ReceiptTab />
          </TabsContent>

          {/* 재고조정 탭 */}
          <TabsContent value="adjustment" className="space-y-4">
            <AdjustmentTab />
          </TabsContent>
        </Tabs>

      {/* LOT 추적 모달 */}
      <LotTraceabilityModal open={lotModalOpen} onOpenChange={setLotModalOpen} />
    </div>
  </DashboardLayout>
  );
}

// 재고 예측 탭 컴포넌트
function PredictionTab() {
  const [daysAhead, setDaysAhead] = useState(30);
  
  const { data: predictions, isLoading } = trpc.inventory.predictAllShortage.useQuery({ days: daysAhead });
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>재고 부족 예측</CardTitle>
            <CardDescription>
              과거 사용 패턴을 기반으로 향후 재고 부족 시점을 예측합니다.
            </CardDescription>
          </div>
          <Select value={daysAhead.toString()} onValueChange={(v) => setDaysAhead(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7일 후</SelectItem>
              <SelectItem value="14">14일 후</SelectItem>
              <SelectItem value="30">30일 후</SelectItem>
              <SelectItem value="60">60일 후</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
        ) : !predictions || predictions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            예측 기간 내에 재고 부족이 예상되는 원재료가 없습니다.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>원재료</TableHead>
                <TableHead>현재 재고</TableHead>
                <TableHead>일평균 사용량</TableHead>
                <TableHead>예상 부족 날짜</TableHead>
                <TableHead>남은 일수</TableHead>
                <TableHead>우선순위</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {predictions.map((pred) => (
                <TableRow key={pred.materialId}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{pred.materialName}</div>
                      <div className="text-sm text-muted-foreground">{pred.materialCode}</div>
                    </div>
                  </TableCell>
                  <TableCell>{pred.currentStock.toFixed(2)} {pred.unit}</TableCell>
                  <TableCell>{pred.avgDailyUsage.toFixed(2)} {pred.unit}</TableCell>
                  <TableCell>
                    {pred.predictedShortageDate
                      ? new Date(pred.predictedShortageDate).toLocaleDateString("ko-KR")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={pred.daysUntilShortage <= 7 ? "destructive" : pred.daysUntilShortage <= 14 ? "secondary" : "default"}>
                      {pred.daysUntilShortage}일
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={pred.daysUntilShortage <= 7 ? "destructive" : pred.daysUntilShortage <= 14 ? "secondary" : "outline"}>
                      {pred.daysUntilShortage <= 7 ? "긴급" : pred.daysUntilShortage <= 14 ? "높음" : "보통"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// 발주 제안 탭 컴포넌트
function PurchaseOrderTab() {
  const [daysAhead, setDaysAhead] = useState(30);
  const utils = trpc.useUtils();
  
  const { data: suggestions, isLoading } = trpc.inventory.getPurchaseOrderSuggestions.useQuery({ days: daysAhead });
  
  const approveMutation = trpc.inventory.approvePurchaseOrder.useMutation({
    onSuccess: () => {
      utils.inventory.getPurchaseOrderSuggestions.invalidate();
      alert("발주 제안이 승인되었습니다.");
    },
    onError: (error) => {
      alert(`오류: ${error.message}`);
    },
  });
  
  const rejectMutation = trpc.inventory.rejectPurchaseOrder.useMutation({
    onSuccess: () => {
      utils.inventory.getPurchaseOrderSuggestions.invalidate();
      alert("발주 제안이 거부되었습니다.");
    },
    onError: (error) => {
      alert(`오류: ${error.message}`);
    },
  });
  
  const handleApprove = (materialId: number, quantity: number) => {
    if (confirm("이 발주 제안을 승인하시겠습니까?")) {
      approveMutation.mutate({ materialId, quantity });
    }
  };
  
  const handleReject = (materialId: number) => {
    const reason = prompt("거부 사유를 입력하세요 (선택사항):");
    if (reason !== null) {
      rejectMutation.mutate({ materialId, reason: reason || undefined });
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>자동 발주 제안</CardTitle>
            <CardDescription>
              재고 예측을 기반으로 최적의 발주 수량과 시기를 제안합니다.
            </CardDescription>
          </div>
          <Select value={daysAhead.toString()} onValueChange={(v) => setDaysAhead(parseInt(v))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7일 후</SelectItem>
              <SelectItem value="14">14일 후</SelectItem>
              <SelectItem value="30">30일 후</SelectItem>
              <SelectItem value="60">60일 후</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
        ) : !suggestions || suggestions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            발주가 필요한 원재료가 없습니다.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>원재료</TableHead>
                <TableHead>현재 재고</TableHead>
                <TableHead>권장 발주량</TableHead>
                <TableHead>예상 비용</TableHead>
                <TableHead>예상 도착일</TableHead>
                  <TableHead>우선순위</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((sugg) => (
                  <TableRow key={sugg.materialId}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{sugg.materialName}</div>
                        <div className="text-sm text-muted-foreground">{sugg.materialCode}</div>
                      </div>
                    </TableCell>
                    <TableCell>{sugg.currentStock.toFixed(2)} {sugg.unit}</TableCell>
                    <TableCell className="font-medium">{sugg.recommendedOrderQuantity.toFixed(2)} {sugg.unit}</TableCell>
                    <TableCell>₩{(sugg.recommendedOrderQuantity * 1000).toLocaleString()}</TableCell>
                    <TableCell>
                      {sugg.shortageDate
                        ? new Date(sugg.shortageDate).toLocaleDateString("ko-KR")
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sugg.priority === "urgent" ? "destructive" : "outline"}>
                        {sugg.priority === "urgent" ? "긴급" : "보통"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(sugg.materialId, sugg.recommendedOrderQuantity)}
                          disabled={approveMutation.isPending}
                        >
                          승인
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(sugg.materialId)}
                          disabled={rejectMutation.isPending}
                        >
                          거부
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// 재고출고 탭 컴포넌트

// 재고출고 탭 컴포넌트 (이카운트 스타일 전표 형태)
function ReleaseTab() {
  const utils = trpc.useUtils();
  const today = new Date().toISOString().split("T")[0];
  
  // 전표 헤더 상태
  const [releaseDate, setReleaseDate] = useState(today);
  const [releaseType, setReleaseType] = useState<string>("production");
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("none");
  const [memo, setMemo] = useState("");
  const [autoCreateSale, setAutoCreateSale] = useState(false);
  
  // 품목 행 상태
  interface ReleaseItem {
    id: number;
    lotId: string;
    materialName: string;
    availableQty: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    amount: string;
  }
  const [items, setItems] = useState<ReleaseItem[]>([
    { id: 1, lotId: "", materialName: "", availableQty: "", quantity: "", unit: "", unitPrice: "0", amount: "0" }
  ]);
  const [nextItemId, setNextItemId] = useState(2);
  
  // 출고 이력 필터
  const [historyStartDate, setHistoryStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [historyEndDate, setHistoryEndDate] = useState(today);
  
  // API 호출
  const { data: lots } = trpc.inventory.list.useQuery();
  const { data: partners } = trpc.partners.list.useQuery({ partnerType: "customer" });
  const { data: outboundHistory, isLoading: historyLoading } = trpc.inventory.getOutboundHistory.useQuery({
    limit: 30,
    startDate: historyStartDate,
    endDate: historyEndDate
  });
  
  const releaseMutation = trpc.inventory.releaseStock.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
      utils.inventory.getDashboard.invalidate();
      utils.inventory.getOutboundHistory.invalidate();
    },
    onError: (error: any) => {
      alert(`출고 실패: ${error.message}`);
    },
  });
  
  // LOT 선택 시 자동 채우기
  const handleLotChange = (itemId: number, lotIdStr: string) => {
    const lot = lots?.find((l: any) => l.id.toString() === lotIdStr);
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          lotId: lotIdStr,
          materialName: lot?.materialName || "",
          availableQty: lot?.availableQuantity || "0",
          unit: lot?.unit || "",
          unitPrice: lot?.unitPrice || "0",
          quantity: "",
          amount: "0"
        };
      }
      return item;
    }));
  };
  
  // 수량 변경 시 금액 자동 계산
  const handleQuantityChange = (itemId: number, qty: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const amount = qty && item.unitPrice ? (parseFloat(qty) * parseFloat(item.unitPrice)).toFixed(0) : "0";
        return { ...item, quantity: qty, amount };
      }
      return item;
    }));
  };
  
  // 단가 변경 시 금액 자동 계산
  const handlePriceChange = (itemId: number, price: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const amount = item.quantity && price ? (parseFloat(item.quantity) * parseFloat(price)).toFixed(0) : "0";
        return { ...item, unitPrice: price, amount };
      }
      return item;
    }));
  };
  
  // 행 추가
  const addItem = () => {
    setItems(prev => [...prev, {
      id: nextItemId,
      lotId: "",
      materialName: "",
      availableQty: "",
      quantity: "",
      unit: "",
      unitPrice: "0",
      amount: "0"
    }]);
    setNextItemId(prev => prev + 1);
  };
  
  // 행 삭제
  const removeItem = (itemId: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(item => item.id !== itemId));
  };
  
  // 합계 계산
  const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
  const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  
  // 출고 처리
  const handleSubmit = async () => {
    const validItems = items.filter(item => item.lotId && item.quantity && parseFloat(item.quantity) > 0);
    if (validItems.length === 0) {
      alert("출고할 품목을 1개 이상 입력해주세요.");
      return;
    }
    
    // 가용재고 초과 체크
    for (const item of validItems) {
      if (parseFloat(item.availableQty) > 0 && parseFloat(item.quantity) > parseFloat(item.availableQty)) {
        alert(`${item.materialName}: 출고 수량(${item.quantity})이 가용 재고(${item.availableQty})를 초과합니다.`);
        return;
      }
    }
    
    const typeLabel = releaseType === "production" ? "생산투입" : releaseType === "sale" ? "판매출고" : releaseType === "disposal" ? "폐기" : "기타";
    if (!confirm(`${validItems.length}건의 품목을 [${typeLabel}] 출고하시겠습니까?\n총 수량: ${totalQuantity.toFixed(2)}\n총 금액: ₩${totalAmount.toLocaleString()}`)) {
      return;
    }
    
    try {
      // 순차적으로 각 품목 출고 처리
      for (const item of validItems) {
        const partnerName = selectedPartnerId !== "none" ? partners?.find((p: any) => p.id.toString() === selectedPartnerId)?.companyName : undefined;
        const reasonParts = [typeLabel];
        if (partnerName) reasonParts.push(partnerName);
        if (memo) reasonParts.push(memo);
        
        await releaseMutation.mutateAsync({
          lotId: parseInt(item.lotId),
          quantity: parseFloat(item.quantity),
          releaseDate: releaseDate,
          reason: reasonParts.join(" | "),
          destination: partnerName || undefined
        });
      }
      
      alert(`${validItems.length}건의 출고가 완료되었습니다.`);
      
      // 폼 초기화
      setItems([{ id: nextItemId, lotId: "", materialName: "", availableQty: "", quantity: "", unit: "", unitPrice: "0", amount: "0" }]);
      setNextItemId(prev => prev + 1);
      setMemo("");
      setSelectedPartnerId("none");
    } catch (error: any) {
      // 에러는 mutation의 onError에서 처리됨
    }
  };
  
  return (
    <div className="space-y-4">
      {/* 전표 헤더 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <PackageMinus className="h-5 w-5" />
                재고 출고 전표
              </CardTitle>
              <CardDescription>출고 정보를 입력하고 품목을 추가하세요.</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">
              {releaseDate}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* 전표 정보 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">출고일자</label>
              <input
                type="date"
                value={releaseDate}
                onChange={(e) => setReleaseDate(e.target.value)}
                className="w-full h-9 px-3 border rounded-md text-sm bg-background"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">출고유형</label>
              <Select value={releaseType} onValueChange={setReleaseType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">생산투입</SelectItem>
                  <SelectItem value="sale">판매출고</SelectItem>
                  <SelectItem value="disposal">폐기</SelectItem>
                  <SelectItem value="other">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">거래처 (선택)</label>
              <Select value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="거래처 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안함</SelectItem>
                  {partners?.map((p: any) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      {p.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">메모</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                className="w-full h-9 px-3 border rounded-md text-sm bg-background"
                placeholder="메모 입력"
              />
            </div>
          </div>
          
          {/* 품목 테이블 */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[50px] text-center">No</TableHead>
                  <TableHead className="min-w-[200px]">LOT 선택</TableHead>
                  <TableHead className="min-w-[120px]">원재료명</TableHead>
                  <TableHead className="w-[100px] text-right">가용재고</TableHead>
                  <TableHead className="w-[110px] text-right">출고수량</TableHead>
                  <TableHead className="w-[70px] text-center">단위</TableHead>
                  <TableHead className="w-[110px] text-right">단가</TableHead>
                  <TableHead className="w-[120px] text-right">금액</TableHead>
                  <TableHead className="w-[50px] text-center"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    <TableCell className="text-center text-muted-foreground text-sm">{idx + 1}</TableCell>
                    <TableCell>
                      <Select value={item.lotId} onValueChange={(v) => handleLotChange(item.id, v)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="LOT 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {lots?.filter((lot: any) => parseFloat(lot.availableQuantity) > 0 || lot.id.toString() === item.lotId).map((lot: any) => (
                            <SelectItem key={lot.id} value={lot.id.toString()}>
                              <span className="text-xs">{lot.lotNumber} - {lot.materialName} ({lot.availableQuantity} {lot.unit})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm">{item.materialName || "-"}</TableCell>
                    <TableCell className="text-right text-sm">
                      {item.availableQty ? (
                        <span className={parseFloat(item.availableQty) <= 0 ? "text-red-500" : ""}>
                          {parseFloat(item.availableQty).toFixed(1)}
                        </span>
                      ) : "-"}
                    </TableCell>
                    <TableCell>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                        className="w-full h-8 px-2 border rounded text-sm text-right bg-background"
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{item.unit || "-"}</TableCell>
                    <TableCell>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => handlePriceChange(item.id, e.target.value)}
                        className="w-full h-8 px-2 border rounded text-sm text-right bg-background"
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {parseFloat(item.amount) > 0 ? `₩${parseInt(item.amount).toLocaleString()}` : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-red-400 hover:text-red-600 text-xs p-1"
                          title="행 삭제"
                        >
                          ✕
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {/* 합계 행 */}
                <TableRow className="bg-muted/30 font-medium border-t-2">
                  <TableCell colSpan={4} className="text-right text-sm">합계</TableCell>
                  <TableCell className="text-right text-sm">{totalQuantity > 0 ? totalQuantity.toFixed(2) : "-"}</TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                  <TableCell className="text-right text-sm font-bold">
                    {totalAmount > 0 ? `₩${totalAmount.toLocaleString()}` : "-"}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          
          {/* 행 추가 + 액션 버튼 */}
          <div className="flex items-center justify-between mt-3">
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="text-xs">
              <PackageMinus className="h-3 w-3 mr-1" />
              품목 추가
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {items.filter(i => i.lotId && i.quantity).length}건 선택됨
              </span>
              <Button
                onClick={handleSubmit}
                disabled={releaseMutation.isPending || items.every(i => !i.lotId || !i.quantity)}
                size="sm"
              >
                {releaseMutation.isPending ? "처리 중..." : "출고 저장"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 출고 이력 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">출고 이력</CardTitle>
              <CardDescription>최근 출고 내역을 확인합니다.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={historyStartDate}
                onChange={(e) => setHistoryStartDate(e.target.value)}
                className="h-8 px-2 border rounded text-xs bg-background"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <input
                type="date"
                value={historyEndDate}
                onChange={(e) => setHistoryEndDate(e.target.value)}
                className="h-8 px-2 border rounded text-xs bg-background"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">로딩 중...</div>
          ) : !outboundHistory || outboundHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">출고 이력이 없습니다.</div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-center w-[50px]">No</TableHead>
                    <TableHead>일시</TableHead>
                    <TableHead>원재료명</TableHead>
                    <TableHead>LOT번호</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-center">단위</TableHead>
                    <TableHead>사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outboundHistory.map((record: any, idx: number) => (
                    <TableRow key={record.id} className="hover:bg-muted/30">
                      <TableCell className="text-center text-muted-foreground text-xs">{idx + 1}</TableCell>
                      <TableCell className="text-xs">
                        {record.createdAt ? new Date(record.createdAt).toLocaleDateString("ko-KR") : "-"}
                      </TableCell>
                      <TableCell className="text-sm">{record.materialName || "-"}</TableCell>
                      <TableCell className="text-xs font-mono">{record.lotNumber || "-"}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{record.quantity}</TableCell>
                      <TableCell className="text-center text-xs">{record.unit}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{record.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// 입고관리 탭 컴포넌트
function ReceiptTab() {
  const { data: receipts, isLoading } = trpc.inventory.getReceiptHistory.useQuery();
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>입고 내역</CardTitle>
        <CardDescription>재고 입고 이력을 확인합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
        ) : !receipts || receipts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">입고 내역이 없습니다.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>입고일</TableHead>
                <TableHead>LOT 번호</TableHead>
                <TableHead>원재료</TableHead>
                <TableHead>수량</TableHead>
                <TableHead>유통기한</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.map((receipt: any) => (
                <TableRow key={receipt.id}>
                  <TableCell>{new Date(receipt.receiptDate).toLocaleDateString("ko-KR")}</TableCell>
                  <TableCell className="font-medium">{receipt.lotNumber}</TableCell>
                  <TableCell>{receipt.materialName}</TableCell>
                  <TableCell>{receipt.quantity} {receipt.unit}</TableCell>
                  <TableCell>
                    {receipt.expiryDate ? new Date(receipt.expiryDate).toLocaleDateString("ko-KR") : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// 재고조정 탭 컴포넌트
function AdjustmentTab() {
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<"increase" | "decrease">("increase");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  
  const { data: lots } = trpc.inventory.list.useQuery();
  
  const adjustMutation = trpc.inventory.adjustStock.useMutation({
    onSuccess: () => {
      utils.inventory.list.invalidate();
      utils.inventory.getDashboard.invalidate();
      alert("재고 조정이 완료되었습니다.");
      setSelectedLotId(null);
      setQuantity("");
      setReason("");
    },
    onError: (error) => {
      alert(`조정 실패: ${error.message}`);
    },
  });
  
  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLotId || !quantity || !reason) {
      alert("모든 필드를 입력해주세요.");
      return;
    }
    
    const adjustedQty = adjustmentType === "increase" ? parseFloat(quantity) : -parseFloat(quantity);
    
    if (confirm(`재고를 ${adjustmentType === "increase" ? "증가" : "감소"}시키겠습니까?`)) {
      adjustMutation.mutate({
        lotId: selectedLotId,
        quantityChange: adjustedQty,
        reason,
      });
    }
  };
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>재고 조정</CardTitle>
        <CardDescription>재고 수량을 수동으로 조정합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleAdjust} className="space-y-4">
          <div>
            <label className="text-sm font-medium">LOT 선택</label>
            <Select value={selectedLotId?.toString() || ""} onValueChange={(v) => setSelectedLotId(parseInt(v))}>
              <SelectTrigger>
                <SelectValue placeholder="LOT를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {lots?.map((lot: any) => (
                  <SelectItem key={lot.id} value={lot.id.toString()}>
                    {lot.lotNumber} - {lot.materialName} (현재: {lot.availableQuantity} {lot.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium">조정 유형</label>
            <Select value={adjustmentType} onValueChange={(v: any) => setAdjustmentType(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="increase">증가</SelectItem>
                <SelectItem value="decrease">감소</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium">조정 수량</label>
            <input
              type="number"
              step="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="조정 수량"
            />
          </div>
          
          <div>
            <label className="text-sm font-medium">조정 사유 (필수)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full p-2 border rounded"
              placeholder="조정 사유를 입력하세요"
              required
            />
          </div>
          
          <Button type="submit" disabled={adjustMutation.isPending}>
            {adjustMutation.isPending ? "처리 중..." : "조정 처리"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
