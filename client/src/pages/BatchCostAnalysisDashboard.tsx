import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function BatchCostAnalysisDashboard() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // 배치별 비용 분석 데이터 조회
  const { data: costAnalysis, isLoading } = trpc.batch.getCostAnalysis.useQuery({
    startDate,
    endDate,
    limit: 50,
  });

  // 전체 요약 계산
  const summary = costAnalysis
    ? {
        totalBatches: costAnalysis.length,
        totalPlannedCost: costAnalysis.reduce((sum: any, b: any) => sum + b.plannedCost, 0),
        totalActualCost: costAnalysis.reduce((sum: any, b: any) => sum + b.actualCost, 0),
        underBudgetCount: costAnalysis.filter((b: any) => b.status === "under_budget").length,
        onBudgetCount: costAnalysis.filter((b: any) => b.status === "on_budget").length,
        overBudgetCount: costAnalysis.filter((b: any) => b.status === "over_budget").length,
      }
    : null;

  const totalCostDifference = summary
    ? summary.totalActualCost - summary.totalPlannedCost
    : 0;
  const avgCostDifferencePercent = summary && summary.totalPlannedCost > 0
    ? ((totalCostDifference / summary.totalPlannedCost) * 100).toFixed(2)
    : "0.00";

  // 차트 데이터 준비
  const chartData = costAnalysis?.slice(0, 10).map((batch: any) => ({
    batchCode: batch.batchCode,
    plannedCost: batch.plannedCost,
    actualCost: batch.actualCost,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">배치 생산 비용 분석 대시보드</h1>
          <p className="text-muted-foreground">계획 원가 vs 실제 원가 비교 분석</p>
        </div>
      </div>

      {/* 기간 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>분석 기간 선택</CardTitle>
          <CardDescription>비용 분석을 수행할 기간을 선택하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label htmlFor="startDate">시작 날짜</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="endDate">종료 날짜</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <Button onClick={() => {
              // 쿼리 재실행 (날짜 변경 시 자동으로 재실행됨)
            }}>
              조회
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div>데이터 로딩 중...</div>}

      {!isLoading && summary && (
        <>
          {/* 전체 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">전체 배치 수</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalBatches}개</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">계획 원가 합계</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalPlannedCost.toLocaleString()}원</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">실제 원가 합계</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.totalActualCost.toLocaleString()}원</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">원가 차이</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${totalCostDifference > 0 ? "text-red-600" : "text-green-600"}`}>
                  {totalCostDifference > 0 ? "+" : ""}{totalCostDifference.toLocaleString()}원
                </div>
                <p className="text-sm text-muted-foreground">
                  {avgCostDifferencePercent}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 예산 상태 요약 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-600">예산 절감</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{summary.underBudgetCount}개</div>
                <p className="text-sm text-muted-foreground">
                  전체의 {summary.totalBatches > 0 ? ((summary.underBudgetCount / summary.totalBatches) * 100).toFixed(1) : 0}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">예산 준수</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{summary.onBudgetCount}개</div>
                <p className="text-sm text-muted-foreground">
                  전체의 {summary.totalBatches > 0 ? ((summary.onBudgetCount / summary.totalBatches) * 100).toFixed(1) : 0}%
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-600">예산 초과</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{summary.overBudgetCount}개</div>
                <p className="text-sm text-muted-foreground">
                  전체의 {summary.totalBatches > 0 ? ((summary.overBudgetCount / summary.totalBatches) * 100).toFixed(1) : 0}%
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 비용 비교 차트 */}
          <Card>
            <CardHeader>
              <CardTitle>배치별 비용 비교 (최근 10개)</CardTitle>
              <CardDescription>계획 원가 vs 실제 원가</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="batchCode" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="plannedCost" fill="#8884d8" name="계획 원가" />
                    <Bar dataKey="actualCost" fill="#82ca9d" name="실제 원가" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 배치별 상세 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle>배치별 상세 비용 분석</CardTitle>
              <CardDescription>각 배치의 계획 원가와 실제 원가 비교</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>배치 코드</TableHead>
                    <TableHead>생산 날짜</TableHead>
                    <TableHead className="text-right">계획 원가</TableHead>
                    <TableHead className="text-right">실제 원가</TableHead>
                    <TableHead className="text-right">차이</TableHead>
                    <TableHead className="text-right">차이율</TableHead>
                    <TableHead>상태</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costAnalysis?.map((batch: any) => (
                    <TableRow key={batch.batchId}>
                      <TableCell className="font-medium">{batch.batchCode}</TableCell>
                      <TableCell>{new Date(batch.plannedDate).toLocaleDateString("ko-KR")}</TableCell>
                      <TableCell className="text-right">{batch.plannedCost.toLocaleString()}원</TableCell>
                      <TableCell className="text-right">{batch.actualCost.toLocaleString()}원</TableCell>
                      <TableCell className={`text-right ${batch.costDifference > 0 ? "text-red-600" : "text-green-600"}`}>
                        {batch.costDifference > 0 ? "+" : ""}{batch.costDifference.toLocaleString()}원
                      </TableCell>
                      <TableCell className={`text-right ${batch.costDifferencePercent > 0 ? "text-red-600" : "text-green-600"}`}>
                        {batch.costDifferencePercent > 0 ? "+" : ""}{batch.costDifferencePercent.toFixed(2)}%
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            batch.status === "under_budget"
                              ? "secondary"
                              : batch.status === "over_budget"
                              ? "destructive"
                              : "default"
                          }
                        >
                          {batch.status === "under_budget"
                            ? "절감"
                            : batch.status === "over_budget"
                            ? "초과"
                            : "준수"}
                        </Badge>
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
