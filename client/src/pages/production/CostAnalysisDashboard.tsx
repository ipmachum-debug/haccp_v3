import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Package, TrendingUp, TrendingDown, BarChart3, Info, Loader2, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

/** 제품 행 펼침 — 원재료별 단가 커버리지 (2026-10-13, CEO 요청: 91% 면 빠진 9% 가 뭔지 보여야 함) */
function ProductMaterialRows({ productId, colSpan }: { productId: number; colSpan: number }) {
  const L = useIndustryLabel();
  const { data, isLoading } = trpc.costAnalysis.getProductMaterialCoverage.useQuery({ productId });
  type Row = { materialId: number; materialName: string; unit: string | null; totalQuantity: number; batchCount: number; unitPrice: number; totalCost: number; priced: boolean; unpricedBatchCount: number };
  const mats: Row[] = (data as any)?.materials ?? [];
  const missing = mats.filter((m) => !m.priced);
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30">
      <TableCell colSpan={colSpan} className="p-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />원재료 불러오는 중...</div>
        ) : mats.length === 0 ? (
          <p className="text-sm text-muted-foreground">이 제품의 배치에 원재료 투입 기록이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>원재료 {data.totalCount}종 중 단가 있음 <b>{data.pricedCount}</b> · 없음 <b className={missing.length > 0 ? "text-amber-600" : ""}>{missing.length}</b></span>
              {data.batchesWithoutInputs > 0 && (
                <Badge variant="outline" className="text-amber-700 border-amber-300">투입 기록 없는 {L("batch")} {data.batchesWithoutInputs}개 (원가 계산 불가)</Badge>
              )}
              {missing.length > 0 && <span className="text-xs text-muted-foreground">단가는 "단가 관리" 탭에서 입력하면 바로 반영됩니다.</span>}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="text-left py-1">원재료</th>
                  <th className="text-right py-1">총 사용량</th>
                  <th className="text-right py-1">{L("batch")} 수</th>
                  <th className="text-right py-1">단가</th>
                  <th className="text-right py-1">총 비용</th>
                </tr>
              </thead>
              <tbody>
                {mats.map((m) => (
                  <tr key={m.materialId} className={`border-b last:border-0 ${!m.priced ? "bg-amber-50 dark:bg-amber-950/30" : ""}`}>
                    <td className="py-1">
                      <span className="flex items-center gap-1.5">
                        {!m.priced && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                        {m.materialName}
                        {m.materialName.includes("정제수") && <span className="text-[10px] text-blue-600">원가제외</span>}
                      </span>
                    </td>
                    <td className="py-1 text-right font-mono">{m.totalQuantity.toLocaleString("ko-KR")} {m.unit ?? "kg"}</td>
                    <td className="py-1 text-right">{m.batchCount}</td>
                    <td className="py-1 text-right font-mono">{m.priced ? (m.unitPrice > 0 ? `₩${m.unitPrice.toLocaleString("ko-KR")}` : "-") : <span className="text-amber-700 font-semibold">단가 없음</span>}</td>
                    <td className="py-1 text-right font-mono">{m.totalCost > 0 ? `₩${m.totalCost.toLocaleString("ko-KR")}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export default function CostAnalysisDashboard() {
  const L = useIndustryLabel();
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);

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
            {/* 2026-10-13: product.list 는 h_products_v2 행 → 필드명이 productName. 'name' 을 읽어 항목이 빈 줄로 보이던 문제 */}
            {products?.map((product: any) => (
              <SelectItem key={product.id} value={product.id.toString()}>
                {product.productName ?? product.name ?? `제품 #${product.id}`}
                {product.productCode ? <span className="ml-1 text-xs text-muted-foreground font-mono">{product.productCode}</span> : null}
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
              <CardTitle className="text-sm font-medium">{L("product")} 수</CardTitle>
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
                {filteredProducts.map((p: any) => {
                  const open = expandedProductId === p.productId;
                  return (
                    <>
                      <TableRow
                        key={p.productId}
                        className="cursor-pointer"
                        onClick={() => setExpandedProductId(open ? null : p.productId)}
                        title="클릭하면 원재료별 단가 커버리지가 펼쳐집니다"
                      >
                        <TableCell className="font-medium">
                          <span className="flex items-center gap-1.5">
                            {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            {p.productName}
                          </span>
                        </TableCell>
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
                      {open && <ProductMaterialRows key={`${p.productId}-detail`} productId={p.productId} colSpan={7} />}
                    </>
                  );
                })}
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
