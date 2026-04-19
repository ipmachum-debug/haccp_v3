import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Clock, Package, TrendingUp, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
export default function ProductionPrediction() {
  const L = useIndustryLabel();
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);
  const { data: predictionData, isLoading } = trpc.productionPrediction.getPredictionData.useQuery({
    productId: selectedProduct === "all" ? undefined : parseInt(selectedProduct),
  });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">데이터 로딩 중...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        {/* 헤더 */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">배치 생산 예측</h1>
            <p className="text-muted-foreground mt-2">
              과거 생산 데이터 기반 소요 시간 및 원재료 소비량 예측
            </p>
          </div>
          <Select value={selectedProduct} onValueChange={setSelectedProduct}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="제품 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 제품</SelectItem>
              {(products as any)?.map((product: any) => (
                <SelectItem key={product.id} value={product.id.toString()}>
                  {product.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 통계 카드 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 생산 시간</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {predictionData?.averageProductionTime || 0}시간
              </div>
              <p className="text-xs text-muted-foreground">
                지난 30일 평균
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">예상 생산 시간</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {predictionData?.predictedProductionTime || 0}시간
              </div>
              <p className="text-xs text-muted-foreground">
                다음 배치 예측
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 원재료 소비</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {predictionData?.averageMaterialConsumption || 0}kg
              </div>
              <p className="text-xs text-muted-foreground">
                배치당 평균
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">예측 정확도</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {predictionData?.predictionAccuracy || 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                과거 30일 기준
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 생산 시간 추이 차트 */}
        <Card>
          <CardHeader>
            <CardTitle>생산 시간 추이 및 예측</CardTitle>
            <CardDescription>
              과거 생산 시간 데이터와 향후 예측 시간
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={predictionData?.productionTimeChart || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis label={{ value: "시간 (h)", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="actual" stroke="#3b82f6" name="실제 생산 시간" />
                <Line type="monotone" dataKey="predicted" stroke="#f59e0b" strokeDasharray="5 5" name="예측 생산 시간" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 원재료 소비량 예측 차트 */}
        <Card>
          <CardHeader>
            <CardTitle>원재료 소비량 예측</CardTitle>
            <CardDescription>
              제품별 예상 원재료 소비량
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={predictionData?.materialConsumptionChart || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="material" />
                <YAxis label={{ value: "소비량 (kg)", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="average" fill="#3b82f6" name="평균 소비량" />
                <Bar dataKey="predicted" fill="#10b981" name="예측 소비량" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 예측 정확도 분석 */}
        <Card>
          <CardHeader>
            <CardTitle>예측 정확도 분석</CardTitle>
            <CardDescription>
              과거 예측과 실제 결과 비교
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={predictionData?.accuracyChart || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis label={{ value: "정확도 (%)", angle: -90, position: "insideLeft" }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="accuracy" stroke="#8b5cf6" name="예측 정확도" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
