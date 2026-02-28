import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D"];

export default function CostAnalysis() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [productFilter, setProductFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("completed");

  // 배치 목록 조회 (원가 정보 포함)
  const { data: batchesData, isLoading } = trpc.batch.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    productId: productFilter === "all" ? undefined : parseInt(productFilter),
  });

  // 제품 목록 조회
  const { data: _rawProductsData } = trpc.product.list.useQuery({ limit: 9999 });
  const productsData = (_rawProductsData as any)?.items ?? (Array.isArray(_rawProductsData) ? _rawProductsData : []);

  const batches = batchesData?.items || [];
  const products = productsData || [];

  // 필터링된 배치
  const filteredBatches = batches.filter((batch) => {
    if (productFilter !== "all" && batch.productId !== parseInt(productFilter)) {
      return false;
    }
    return true;
  });

  // 배치별 원가 비교 데이터
  const costComparisonData = filteredBatches
    .filter((batch) => batch.plannedCost || batch.actualCost)
    .map((batch) => ({
      batchNumber: batch.batchCode || `BATCH-${batch.id}`,
      plannedCost: parseFloat(batch.plannedCost || "0"),
      actualCost: parseFloat(batch.actualCost || "0"),
      difference: parseFloat(batch.actualCost || "0") - parseFloat(batch.plannedCost || "0"),
    }));

  // 원가 차이 추세 데이터 (날짜별)
  const costTrendData = filteredBatches
    .filter((batch) => batch.actualCost && batch.completedAt)
    .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime())
    .map((batch) => ({
      date: new Date(batch.completedAt!).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }),
      difference: parseFloat(batch.actualCost || "0") - parseFloat(batch.plannedCost || "0"),
      differencePercent:
        parseFloat(batch.plannedCost || "0") > 0
          ? ((parseFloat(batch.actualCost || "0") - parseFloat(batch.plannedCost || "0")) /
              parseFloat(batch.plannedCost || "0")) *
            100
          : 0,
    }));

  // 원재료별 원가 비중 데이터 (샘플 데이터 - 실제로는 hBatchInputs에서 집계 필요)
  const materialCostData = [
    { name: "원재료 A", value: 30, cost: 300000 },
    { name: "원재료 B", value: 25, cost: 250000 },
    { name: "원재료 C", value: 20, cost: 200000 },
    { name: "원재료 D", value: 15, cost: 150000 },
    { name: "기타", value: 10, cost: 100000 },
  ];

  // 통계 계산
  const totalPlannedCost = filteredBatches.reduce(
    (sum, batch) => sum + parseFloat(batch.plannedCost || "0"),
    0
  );
  const totalActualCost = filteredBatches.reduce(
    (sum, batch) => sum + parseFloat(batch.actualCost || "0"),
    0
  );
  const totalDifference = totalActualCost - totalPlannedCost;
  const averageDifferencePercent =
    totalPlannedCost > 0 ? (totalDifference / totalPlannedCost) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-bold">원가 분석</h3>
        <p className="text-muted-foreground mt-1">
          배치별 계획 원가 vs 실제 원가 비교 및 원가 차이 추세 분석
        </p>
      </div>

      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>필터</CardTitle>
          <CardDescription>분석할 기간 및 제품을 선택하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">시작일</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">종료일</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="productFilter">제품</Label>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {products.map((product: any) => (
                    <SelectItem key={product.id} value={product.id.toString()}>
                      {product.productName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="statusFilter">배치 상태</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="completed">완료</SelectItem>
                  <SelectItem value="in_progress">진행 중</SelectItem>
                  <SelectItem value="planned">계획</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 계획 원가</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalPlannedCost.toLocaleString()}원
            </div>
            <p className="text-xs text-muted-foreground">
              {filteredBatches.length}개 배치
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 실제 원가</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalActualCost.toLocaleString()}원
            </div>
            <p className="text-xs text-muted-foreground">
              확정된 배치만 집계
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">원가 차이</CardTitle>
            {totalDifference >= 0 ? (
              <TrendingUp className="h-4 w-4 text-red-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                totalDifference >= 0 ? "text-red-500" : "text-green-500"
              }`}
            >
              {totalDifference >= 0 ? "+" : ""}
              {totalDifference.toLocaleString()}원
            </div>
            <p className="text-xs text-muted-foreground">
              {averageDifferencePercent >= 0 ? "+" : ""}
              {averageDifferencePercent.toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 원가 차이율</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {averageDifferencePercent.toFixed(2)}%
            </div>
            <p className="text-xs text-muted-foreground">
              계획 원가 대비 실제 원가
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 배치별 원가 비교 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>배치별 원가 비교</CardTitle>
          <CardDescription>계획 원가 vs 실제 원가 (단위: 원)</CardDescription>
        </CardHeader>
        <CardContent>
          {costComparisonData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              원가 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costComparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="batchNumber" />
                <YAxis />
                <Tooltip formatter={(value) => `${Number(value).toLocaleString()}원`} />
                <Legend />
                <Bar dataKey="plannedCost" fill="#8884d8" name="계획 원가" />
                <Bar dataKey="actualCost" fill="#82ca9d" name="실제 원가" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 원가 차이 추세 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>원가 차이 추세</CardTitle>
          <CardDescription>시간별 원가 차이 변화 (단위: 원)</CardDescription>
        </CardHeader>
        <CardContent>
          {costTrendData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              추세 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={costTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value) => `${Number(value).toLocaleString()}원`} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="difference"
                  stroke="#8884d8"
                  name="원가 차이"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 원재료별 원가 비중 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>원재료별 원가 비중</CardTitle>
            <CardDescription>전체 원가 중 원재료별 비중</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={materialCostData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name} (${entry.value}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {materialCostData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>원재료별 원가 상세</CardTitle>
            <CardDescription>원재료별 총 원가 (단위: 원)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {materialCostData.map((material, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="font-medium">{material.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{material.cost.toLocaleString()}원</div>
                    <div className="text-sm text-muted-foreground">{material.value}%</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
