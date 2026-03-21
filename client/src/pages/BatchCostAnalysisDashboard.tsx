import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertTriangle, Eye, Loader2, Package, TrendingUp } from "lucide-react";

export default function BatchCostAnalysisDashboard() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  // 배치별 재료원가 조회
  const { data: batchCosts, isLoading } = trpc.costAnalysis.getBatchMaterialCosts.useQuery({
    startDate,
    endDate,
    limit: 50,
  });

  // 선택된 배치 상세
  const { data: batchDetail, isLoading: loadingDetail } = trpc.costAnalysis.getBatchMaterialDetail.useQuery(
    { batchId: selectedBatchId! },
    { enabled: !!selectedBatchId }
  );

  // 전체 요약
  const summary = batchCosts ? {
    totalBatches: batchCosts.length,
    totalQuantity: batchCosts.reduce((s: number, b: any) => s + b.plannedQuantity, 0),
    totalCost: batchCosts.reduce((s: number, b: any) => s + b.materialCost, 0),
    avgCostPerKg: 0 as number,
    avgPriceCoverage: batchCosts.length > 0
      ? Math.round(batchCosts.reduce((s: number, b: any) => s + b.priceCoverage, 0) / batchCosts.length)
      : 0,
  } : null;
  if (summary && summary.totalQuantity > 0) {
    summary.avgCostPerKg = Math.round(summary.totalCost / summary.totalQuantity);
  }

  // 차트 데이터 (최근 10개 배치)
  const chartData = batchCosts?.slice(0, 10).map((b: any) => ({
    label: `${b.batchCode.split("-")[1] || b.batchCode}`,
    costPerKg: b.costPerKg,
    productName: b.productName,
    plannedQuantity: b.plannedQuantity,
  })).reverse() || [];

  // 색상 - 제품별
  const productColors: Record<string, string> = {};
  const colorPalette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];
  let colorIdx = 0;
  chartData.forEach((d: any) => {
    if (!productColors[d.productName]) {
      productColors[d.productName] = colorPalette[colorIdx % colorPalette.length];
      colorIdx++;
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">배치별 재료원가 분석</h1>
          <p className="text-muted-foreground text-sm">배치 투입량 × 입고단가 기반 실질 재료원가</p>
        </div>
      </div>

      {/* 기간 선택 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">분석 기간 선택</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="startDate">시작 날짜</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <Label htmlFor="endDate">종료 날짜</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && summary && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">전체 배치 수</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalBatches}개</div>
                <p className="text-xs text-muted-foreground">총 {summary.totalQuantity.toLocaleString()} kg</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">총 재료원가</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">₩{summary.totalCost.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">평균 kg당 원가</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">₩{summary.avgCostPerKg.toLocaleString()}/kg</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">평균 단가 커버리지</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${summary.avgPriceCoverage >= 80 ? "text-green-600" : summary.avgPriceCoverage >= 50 ? "text-amber-600" : "text-red-600"}`}>
                  {summary.avgPriceCoverage}%
                </div>
                <p className="text-xs text-muted-foreground">단가 등록된 원재료 비율</p>
              </CardContent>
            </Card>
          </div>

          {/* kg당 원가 차트 */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>배치별 kg당 재료원가 (최근 10개)</CardTitle>
                <CardDescription>배치별 재료원가를 kg 기준으로 비교</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="label" fontSize={12} />
                      <YAxis />
                      <Tooltip
                        formatter={(value: any) => [`₩${Number(value).toLocaleString()}/kg`, "kg당 원가"]}
                        labelFormatter={(label: any, payload: any) => {
                          const d = payload?.[0]?.payload;
                          return d ? `${d.productName} (${d.plannedQuantity}kg)` : label;
                        }}
                      />
                      <Bar dataKey="costPerKg" radius={[4,4,0,0]}>
                        {chartData.map((entry: any, index: number) => (
                          <Cell key={index} fill={productColors[entry.productName] || "#3b82f6"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* 범례 */}
                <div className="flex flex-wrap gap-3 mt-3 justify-center">
                  {Object.entries(productColors).map(([name, color]) => (
                    <div key={name} className="flex items-center gap-1.5 text-xs">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                      {name}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 배치별 상세 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle>배치별 상세 원가</CardTitle>
              <CardDescription>각 배치의 재료원가 상세 (클릭하여 원재료 내역 확인)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>배치 코드</TableHead>
                    <TableHead>제품명</TableHead>
                    <TableHead>생산일</TableHead>
                    <TableHead className="text-right">생산량</TableHead>
                    <TableHead className="text-right">재료원가</TableHead>
                    <TableHead className="text-right">kg당 원가</TableHead>
                    <TableHead className="text-right">원재료</TableHead>
                    <TableHead className="text-right">커버리지</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchCosts?.map((batch: any) => (
                    <TableRow key={batch.batchId}>
                      <TableCell className="font-medium">{batch.batchCode}</TableCell>
                      <TableCell>{batch.productName}</TableCell>
                      <TableCell>{batch.plannedDate}</TableCell>
                      <TableCell className="text-right">{batch.plannedQuantity} kg</TableCell>
                      <TableCell className="text-right font-semibold">₩{batch.materialCost.toLocaleString()}</TableCell>
                      <TableCell className="text-right">₩{batch.costPerKg.toLocaleString()}/kg</TableCell>
                      <TableCell className="text-right">{batch.pricedMaterialCount}/{batch.materialCount}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={batch.priceCoverage >= 80 ? "default" : batch.priceCoverage >= 50 ? "secondary" : "destructive"} className="text-xs">
                          {batch.priceCoverage}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedBatchId(batch.batchId)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                            <DialogHeader>
                              <DialogTitle>
                                {batch.batchCode} - 원재료 상세 내역
                              </DialogTitle>
                            </DialogHeader>
                            {loadingDetail ? (
                              <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin" />
                              </div>
                            ) : batchDetail ? (
                              <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="p-3 bg-muted rounded-lg text-center">
                                    <p className="text-xs text-muted-foreground">생산량</p>
                                    <p className="text-lg font-bold">{batchDetail.batchInfo.plannedQuantity} kg</p>
                                  </div>
                                  <div className="p-3 bg-muted rounded-lg text-center">
                                    <p className="text-xs text-muted-foreground">재료원가</p>
                                    <p className="text-lg font-bold">₩{batchDetail.totalCost.toLocaleString()}</p>
                                  </div>
                                  <div className="p-3 bg-blue-50 rounded-lg text-center">
                                    <p className="text-xs text-muted-foreground">kg당 원가</p>
                                    <p className="text-lg font-bold text-blue-600">₩{batchDetail.costPerKg.toLocaleString()}</p>
                                  </div>
                                </div>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>원재료</TableHead>
                                      <TableHead className="text-right">투입량</TableHead>
                                      <TableHead className="text-right">단가</TableHead>
                                      <TableHead className="text-right">비용</TableHead>
                                      <TableHead className="text-right">비중</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {batchDetail.materials.map((mat: any) => (
                                      <TableRow key={mat.materialId}>
                                        <TableCell className="font-medium">
                                          {mat.materialName}
                                          {mat.unitPrice === 0 && <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />}
                                        </TableCell>
                                        <TableCell className="text-right">{mat.quantity} {mat.unit}</TableCell>
                                        <TableCell className="text-right">
                                          {mat.unitPrice > 0 ? `₩${mat.unitPrice.toLocaleString()}` : <span className="text-muted-foreground">-</span>}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">₩{mat.cost.toLocaleString()}</TableCell>
                                        <TableCell className="text-right">
                                          <div className="flex items-center justify-end gap-1">
                                            <div className="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                              <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(mat.costShare, 100)}%` }} />
                                            </div>
                                            <span className="text-xs">{mat.costShare}%</span>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            ) : null}
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
