import { useState, useMemo } from "react";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "lucide-react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from "chart.js";
import { Bar, Line, Pie } from "react-chartjs-2";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

export default function ProductionEfficiency() {
  const [activeTab, setActiveTab] = useTabWithUrl('tab', 'cost');
  const [dateRange, setDateRange] = useState({
    startDate: formatLocalDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    endDate: todayLocal(),
  });
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // 통합 API 호출
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);
  const { data: productionData } = trpc.dashboard.getProductionEfficiencyData.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  }, {
    staleTime: 5 * 60 * 1000, // 5분
    gcTime: 10 * 60 * 1000, // 10분
  });

  const costAnalysis = productionData?.costAnalysis;
  const timeAnalysis = productionData?.timeAnalysis;
  const defectAnalysis = productionData?.defectAnalysis;

  // 배치별 원가 분석 차트 데이터
  const costChartData = {
    labels: costAnalysis?.map((item: any) => `배치 ${item.batchCode}`) || [],
    datasets: [
      {
        label: "계획 원가",
        data: costAnalysis?.map((item: any) => Number(item.plannedCost || 0)) || [],
        backgroundColor: "rgba(59, 130, 246, 0.5)",
        borderColor: "rgba(59, 130, 246, 1)",
        borderWidth: 1,
      },
      {
        label: "실제 원가",
        data: costAnalysis?.map((item: any) => Number(item.actualCost || 0)) || [],
        backgroundColor: "rgba(239, 68, 68, 0.5)",
        borderColor: "rgba(239, 68, 68, 1)",
        borderWidth: 1,
      },
    ],
  };

  // 생산 시간 추이 차트 데이터
  const timeChartData = {
    labels: timeAnalysis?.map((item: any) => item.date) || [],
    datasets: [
      {
        label: "평균 생산 시간 (시간)",
        data: timeAnalysis?.map((item: any) => Number(item.avgProductionTime || 0)) || [],
        backgroundColor: "rgba(34, 197, 94, 0.5)",
        borderColor: "rgba(34, 197, 94, 1)",
        borderWidth: 2,
        tension: 0.4,
      },
    ],
  };

  // 불량률 분석 차트 데이터
  const defectChartData = {
    labels: defectAnalysis?.map((item: any) => item.productName) || [],
    datasets: [
      {
        label: "불량률 (%)",
        data: defectAnalysis?.map((item: any) => Number(item.defectRate || 0)) || [],
        backgroundColor: [
          "rgba(239, 68, 68, 0.5)",
          "rgba(249, 115, 22, 0.5)",
          "rgba(234, 179, 8, 0.5)",
          "rgba(34, 197, 94, 0.5)",
          "rgba(59, 130, 246, 0.5)",
          "rgba(168, 85, 247, 0.5)",
        ],
        borderColor: [
          "rgba(239, 68, 68, 1)",
          "rgba(249, 115, 22, 1)",
          "rgba(234, 179, 8, 1)",
          "rgba(34, 197, 94, 1)",
          "rgba(59, 130, 246, 1)",
          "rgba(168, 85, 247, 1)",
        ],
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
    },
  };

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">생산 효율성 대시보드</h1>
        <p className="text-muted-foreground">
          배치별 원가 분석, 생산 시간 추이, 불량률 분석을 확인하세요.
        </p>
      </div>

      {/* 필터 섹션 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>필터 설정</CardTitle>
          <CardDescription>분석 기간 및 제품을 선택하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">시작 날짜</Label>
              <div className="relative">
                <Input
                  id="startDate"
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, startDate: e.target.value })
                  }
                />
                <Calendar className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">종료 날짜</Label>
              <div className="relative">
                <Input
                  id="endDate"
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) =>
                    setDateRange({ ...dateRange, endDate: e.target.value })
                  }
                />
                <Calendar className="absolute right-3 top-2.5 h-5 w-5 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product">제품 선택</Label>
              <Select
                value={selectedProductId?.toString() || "all"}
                onValueChange={(value) =>
                  setSelectedProductId(value === "all" ? null : parseInt(value))
                }
              >
                <SelectTrigger id="product">
                  <SelectValue placeholder="전체 제품" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 제품</SelectItem>
                  {products?.map((product: any) => (
                    <SelectItem key={product.id} value={product.id.toString()}>
                      {product.productName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 차트 섹션 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cost">배치별 원가 분석</TabsTrigger>
          <TabsTrigger value="time">생산 시간 추이</TabsTrigger>
          <TabsTrigger value="defect">불량률 분석</TabsTrigger>
        </TabsList>

        <TabsContent value="cost">
          <Card>
            <CardHeader>
              <CardTitle>배치별 원가 분석</CardTitle>
              <CardDescription>
                계획 원가와 실제 원가를 비교하여 원가 차이를 분석합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                {costAnalysis && costAnalysis.length > 0 ? (
                  <Bar data={costChartData} options={chartOptions} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    선택한 기간에 데이터가 없습니다.
                  </div>
                )}
              </div>
              {costAnalysis && costAnalysis.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">상세 데이터</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4">배치 코드</th>
                          <th className="text-left py-2 px-4">제품명</th>
                          <th className="text-right py-2 px-4">계획 원가</th>
                          <th className="text-right py-2 px-4">실제 원가</th>
                          <th className="text-right py-2 px-4">원가 차이</th>
                          <th className="text-right py-2 px-4">차이율</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costAnalysis.map((item: any) => {
                          const planned = Number(item.plannedCost || 0);
                          const actual = Number(item.actualCost || 0);
                          const diff = actual - planned;
                          const diffRate = planned > 0 ? ((diff / planned) * 100).toFixed(1) : "0.0";
                          return (
                            <tr key={item.batchId} className="border-b hover:bg-muted/50">
                              <td className="py-2 px-4">{item.batchCode}</td>
                              <td className="py-2 px-4">{item.productName}</td>
                              <td className="text-right py-2 px-4">
                                {planned.toLocaleString()}원
                              </td>
                              <td className="text-right py-2 px-4">
                                {actual.toLocaleString()}원
                              </td>
                              <td className={`text-right py-2 px-4 ${diff > 0 ? "text-red-600" : "text-green-600"}`}>
                                {diff > 0 ? "+" : ""}{diff.toLocaleString()}원
                              </td>
                              <td className={`text-right py-2 px-4 ${Number(diffRate) > 0 ? "text-red-600" : "text-green-600"}`}>
                                {Number(diffRate) > 0 ? "+" : ""}{diffRate}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="time">
          <Card>
            <CardHeader>
              <CardTitle>생산 시간 추이 분석</CardTitle>
              <CardDescription>
                일별 평균 생산 시간을 분석하여 생산 효율성을 확인합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                {timeAnalysis && timeAnalysis.length > 0 ? (
                  <Line data={timeChartData} options={chartOptions} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    선택한 기간에 데이터가 없습니다.
                  </div>
                )}
              </div>
              {timeAnalysis && timeAnalysis.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">상세 데이터</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4">날짜</th>
                          <th className="text-right py-2 px-4">배치 수</th>
                          <th className="text-right py-2 px-4">평균 생산 시간</th>
                        </tr>
                      </thead>
                      <tbody>
                        {timeAnalysis.map((item: any, index: any) => (
                          <tr key={index} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-4">{item.date}</td>
                            <td className="text-right py-2 px-4">{item.totalBatches}개</td>
                            <td className="text-right py-2 px-4">
                              {Number(item.avgProductionTime || 0).toFixed(1)}시간
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="defect">
          <Card>
            <CardHeader>
              <CardTitle>불량률 분석</CardTitle>
              <CardDescription>
                제품별 불량률을 분석하여 품질 관리 포인트를 파악합니다.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                {defectAnalysis && defectAnalysis.length > 0 ? (
                  <Pie data={defectChartData} options={chartOptions} />
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    선택한 기간에 데이터가 없습니다.
                  </div>
                )}
              </div>
              {defectAnalysis && defectAnalysis.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">상세 데이터</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4">제품명</th>
                          <th className="text-right py-2 px-4">총 생산량</th>
                          <th className="text-right py-2 px-4">총 불량 수량</th>
                          <th className="text-right py-2 px-4">불량률</th>
                        </tr>
                      </thead>
                      <tbody>
                        {defectAnalysis.map((item: any, index: any) => (
                          <tr key={index} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-4">{item.productName}</td>
                            <td className="text-right py-2 px-4">
                              {Number(item.totalPlanned || 0).toLocaleString()}개
                            </td>
                            <td className="text-right py-2 px-4">
                              {(Number(item.totalPlanned || 0) - Number(item.totalActual || 0)).toLocaleString()}개
                            </td>
                            <td className={`text-right py-2 px-4 ${Number(item.defectRate || 0) > 5 ? "text-red-600 font-semibold" : ""}`}>
                              {Number(item.defectRate || 0).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </DashboardLayout>
  );
}
