import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Package, TrendingUp, TrendingDown, BarChart3, Info, Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function CostAnalysisDashboard() {
  const L = useIndustryLabel();
  const [selectedProduct, setSelectedProduct] = useState<string>("all");

  // 제품 목록
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);

  // 제품별 원가 요약
  const { data: productCosts, isLoading: loadingProducts } = trpc.costAnalysis.getProductCostSummary.useQuery({});

  // 원재료별 사용량/비용 순위
  const { data: materialRanking, isLoading: loadingMaterials } = trpc.costAnalysis.getMaterialUsageRanking.useQuery({ limit: 15 });

  // 월별 원가 추이
  const { data: costTrend, isLoading: loadingTrend } = trpc.costAnalysis.getCostTrend.useQuery({ months: 6 });

  const isLoading = loadingProducts || loadingMaterials || loadingTrend;

  // 전체 통계 계산
  const totalStats = productCosts ? {
    totalBatches: productCosts.reduce((s: number, p: any) => s + p.batchCount, 0),
    totalQuantity: productCosts.reduce((s: number, p: any) => s + p.totalQuantityKg, 0),
    totalCost: productCosts.reduce((s: number, p: any) => s + p.totalMaterialCost, 0),
    productCount: productCosts.length,
    avgCostPerKg: 0 as number
  } : null;
  if (totalStats && totalStats.totalQuantity > 0) {
    totalStats.avgCostPerKg = Math.round(totalStats.totalCost / totalStats.totalQuantity);
  }

  // 필터된 제품 데이터
  const filteredProducts = selectedProduct === "all"
    ? productCosts
    : productCosts?.filter((p: any) => p.productId.toString() === selectedProduct);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">원가 분석</h2>
          <p className="text-sm text-muted-foreground mt-1">
            입고 단가 기반 실질 재료원가 분석
          </p>
        </div>
        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="제품 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 제품</SelectItem>
            {products?.map((product: any) => (
              <SelectItem key={product.id} value={product.id.toString()}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 안내 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          원가는 배치 투입량 × 원재료 입고단가(최신 LOT 또는 마스터 단가)로 계산됩니다. 
          단가 미등록 원재료는 0원으로 처리됩니다.
        </AlertDescription>
      </Alert>

      {/* 요약 카드 */}
      {totalStats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 생산량</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalStats.totalQuantity.toLocaleString()} kg
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {totalStats.totalBatches}개 배치 · {totalStats.productCount}개 제품
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 재료원가</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{totalStats.totalCost.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                전체 배치 합산
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 kg당 원가</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ₩{totalStats.avgCostPerKg.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                전체 제품 평균
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">제품 수</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalStats.productCount}개
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                원가 분석 대상
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 월별 원가 추이 */}
      {costTrend && costTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>월별 원가 추이</CardTitle>
            <CardDescription>최근 6개월 생산량 및 kg당 재료원가 변동</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" orientation="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name === "totalMaterialCost") return [`₩${Number(value).toLocaleString()}`, "총 재료원가"];
                      if (name === "avgCostPerKg") return [`₩${Number(value).toLocaleString()}/kg`, "kg당 원가"];
                      if (name === "totalQuantityKg") return [`${Number(value).toLocaleString()} kg`, "생산량"];
                      return [value, name];
                    }}
                  />
                  <Legend
                    formatter={(value: string) => {
                      if (value === "totalMaterialCost") return "총 재료원가 (원)";
                      if (value === "avgCostPerKg") return "kg당 원가 (원)";
                      return value;
                    }}
                  />
                  <Bar yAxisId="left" dataKey="totalMaterialCost" fill="#3b82f6" name="totalMaterialCost" radius={[4,4,0,0]} />
                  <Line yAxisId="right" type="monotone" dataKey="avgCostPerKg" stroke="#ef4444" strokeWidth={2} name="avgCostPerKg" dot={{ r: 4 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 제품별 원가 비교 */}
      <Card>
        <CardHeader>
          <CardTitle>제품별 원가 비교</CardTitle>
          <CardDescription>제품별 kg당 재료원가 및 생산 통계</CardDescription>
        </CardHeader>
        <CardContent>
          {!filteredProducts || filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              원가 데이터가 없습니다. 배치와 원재료 투입 데이터를 먼저 등록해주세요.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제품명</TableHead>
                  <TableHead className="text-right">{`${L("batch")} 수`}</TableHead>
                  <TableHead className="text-right">총 생산량</TableHead>
                  <TableHead className="text-right">총 재료원가</TableHead>
                  <TableHead className="text-right">평균 kg당 원가</TableHead>
                  <TableHead className="text-right">최저~최고</TableHead>
                  <TableHead className="text-right">단가 커버리지</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((p: any) => (
                  <TableRow key={p.productId}>
                    <TableCell className="font-medium">{p.productName}</TableCell>
                    <TableCell className="text-right">{p.batchCount}개</TableCell>
                    <TableCell className="text-right">{p.totalQuantityKg.toLocaleString()} kg</TableCell>
                    <TableCell className="text-right">₩{p.totalMaterialCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-semibold">₩{p.avgCostPerKg.toLocaleString()}/kg</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      ₩{p.minCostPerKg.toLocaleString()} ~ ₩{p.maxCostPerKg.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.avgPriceCoverage >= 80 ? "default" : p.avgPriceCoverage >= 50 ? "secondary" : "destructive"}>
                        {p.avgPriceCoverage}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 원재료별 비용 순위 */}
      {materialRanking && materialRanking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>원재료별 비용 순위</CardTitle>
            <CardDescription>원재료별 총 사용량 및 비용 비중 (Top 15)</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>순위</TableHead>
                  <TableHead>{`${L("material")}명`}</TableHead>
                  <TableHead className="text-right">단가</TableHead>
                  <TableHead className="text-right">총 사용량</TableHead>
                  <TableHead className="text-right">총 비용</TableHead>
                  <TableHead className="text-right">비중</TableHead>
                  <TableHead className="text-right">사용 배치</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialRanking.map((m: any, idx: number) => (
                  <TableRow key={m.materialId}>
                    <TableCell className="font-medium">{idx + 1}</TableCell>
                    <TableCell>
                      {m.materialName}
                      {m.unitPrice === 0 && (
                        <AlertTriangle className="inline h-3 w-3 ml-1 text-amber-500" />
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.unitPrice > 0 ? `₩${m.unitPrice.toLocaleString()}/${m.unit}` : (
                        <span className="text-muted-foreground">미등록</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{m.totalQuantity.toLocaleString()} {m.unit}</TableCell>
                    <TableCell className="text-right">₩{m.totalCost.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(m.costShare, 100)}%` }} />
                        </div>
                        <span className="text-sm">{m.costShare}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{m.batchCount}개</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
