import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Info, Loader2, TrendingDown, TrendingUp } from "lucide-react";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
export default function BatchProfitabilityDashboard() {
  const L = useIndustryLabel();
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return formatLocalDate(date);
  });
  const [endDate, setEndDate] = useState(() => todayLocal());

  // 제품별 원가 요약
  const { data: productCosts, isLoading } = trpc.costAnalysis.getProductCostSummary.useQuery({
    startDate,
    endDate,
  });

  // 월별 원가 추이
  const { data: costTrend } = trpc.costAnalysis.getCostTrend.useQuery({ months: 6 });

  // kg당 원가 기준 정렬 (비싼 순)
  const sortedProducts = productCosts
    ? [...productCosts].sort((a: any, b: any) => b.avgCostPerKg - a.avgCostPerKg)
    : [];

  // 차트 데이터 - 제품별 kg당 원가 비교
  const chartData = sortedProducts.slice(0, 10).map((p: any) => ({
    name: p.productName.length > 8 ? p.productName.substring(0, 8) + "..." : p.productName,
    fullName: p.productName,
    avgCostPerKg: p.avgCostPerKg,
    minCostPerKg: p.minCostPerKg,
    maxCostPerKg: p.maxCostPerKg,
    batchCount: p.batchCount,
  }));

  // 전체 평균
  const overallAvg = productCosts && productCosts.length > 0
    ? Math.round(
        productCosts.reduce((s: number, p: any) => s + p.totalMaterialCost, 0) /
        productCosts.reduce((s: number, p: any) => s + p.totalQuantityKg, 0)
      )
    : 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">제품별 원가 비교</h1>
        <p className="text-muted-foreground text-sm">제품별 kg당 재료원가 비교 및 추이 분석</p>
      </div>

      {/* 기간 선택 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label>시작 날짜</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <Label>종료 날짜</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          매출 데이터(revenue) 입력 시 수익 분석이 가능합니다.
          현재는 입고 단가 기반 재료원가만 표시됩니다.
        </AlertDescription>
      </Alert>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">전체 평균 kg당 원가</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">₩{overallAvg.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">전 제품 가중 평균</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <TrendingUp className="h-4 w-4 text-red-500" />
              최고 원가 제품
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sortedProducts.length > 0 ? (
              <>
                <div className="text-xl font-bold">{sortedProducts[0].productName}</div>
                <p className="text-sm text-red-600 font-semibold">₩{sortedProducts[0].avgCostPerKg.toLocaleString()}/kg</p>
              </>
            ) : (
              <div className="text-muted-foreground">데이터 없음</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <TrendingDown className="h-4 w-4 text-green-500" />
              최저 원가 제품
            </CardTitle>
          </CardHeader>
          <CardContent>
            {sortedProducts.length > 0 ? (
              <>
                <div className="text-xl font-bold">{sortedProducts[sortedProducts.length - 1].productName}</div>
                <p className="text-sm text-green-600 font-semibold">₩{sortedProducts[sortedProducts.length - 1].avgCostPerKg.toLocaleString()}/kg</p>
              </>
            ) : (
              <div className="text-muted-foreground">데이터 없음</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 제품별 kg당 원가 차트 */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>제품별 kg당 재료원가 비교</CardTitle>
            <CardDescription>평균 / 최저 / 최고 kg당 원가 (Top 10)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="name" width={100} fontSize={12} />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      const labels: Record<string, string> = {
                        avgCostPerKg: "평균 kg당 원가",
                        minCostPerKg: "최저",
                        maxCostPerKg: "최고",
                      };
                      return [`₩${Number(value).toLocaleString()}`, labels[name] || name];
                    }}
                    labelFormatter={(_: any, payload: any) => payload?.[0]?.payload?.fullName || ""}
                  />
                  <Legend
                    formatter={(value: string) => {
                      const labels: Record<string, string> = {
                        avgCostPerKg: "평균",
                        minCostPerKg: "최저",
                        maxCostPerKg: "최고",
                      };
                      return labels[value] || value;
                    }}
                  />
                  <Bar dataKey="minCostPerKg" fill="#86efac" radius={[4,4,4,4]} />
                  <Bar dataKey="avgCostPerKg" fill="#3b82f6" radius={[4,4,4,4]} />
                  <Bar dataKey="maxCostPerKg" fill="#fca5a5" radius={[4,4,4,4]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 월별 kg당 원가 추이 */}
      {costTrend && costTrend.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>월별 kg당 평균 재료원가 추이</CardTitle>
            <CardDescription>전체 제품 평균 기준</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any, name: string) => {
                      if (name === "avgCostPerKg") return [`₩${Number(value).toLocaleString()}/kg`, "평균 kg당 원가"];
                      return [value, name];
                    }}
                  />
                  <Bar dataKey="avgCostPerKg" fill="#3b82f6" name="avgCostPerKg" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 제품별 상세 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>제품별 원가 상세</CardTitle>
        </CardHeader>
        <CardContent>
          {sortedProducts.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              해당 기간에 배치 데이터가 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제품명</TableHead>
                  <TableHead className="text-right">배치</TableHead>
                  <TableHead className="text-right">총 생산량</TableHead>
                  <TableHead className="text-right">총 재료원가</TableHead>
                  <TableHead className="text-right">평균 kg당 원가</TableHead>
                  <TableHead className="text-right">범위</TableHead>
                  <TableHead className="text-right">커버리지</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProducts.map((p: any) => {
                  const diff = p.avgCostPerKg - overallAvg;
                  const diffPercent = overallAvg > 0 ? Math.round((diff / overallAvg) * 100) : 0;
                  return (
                    <TableRow key={p.productId}>
                      <TableCell className="font-medium">{p.productName}</TableCell>
                      <TableCell className="text-right">{p.batchCount}개</TableCell>
                      <TableCell className="text-right">{p.totalQuantityKg.toLocaleString()} kg</TableCell>
                      <TableCell className="text-right">₩{p.totalMaterialCost.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <span className="font-semibold">₩{p.avgCostPerKg.toLocaleString()}</span>
                        <span className={`ml-2 text-xs ${diff > 0 ? "text-red-500" : "text-green-500"}`}>
                          {diff > 0 ? "+" : ""}{diffPercent}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        ₩{p.minCostPerKg.toLocaleString()} ~ ₩{p.maxCostPerKg.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={p.avgPriceCoverage >= 80 ? "default" : p.avgPriceCoverage >= 50 ? "secondary" : "destructive"} className="text-xs">
                          {p.avgPriceCoverage}%
                        </Badge>
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
  );
}
