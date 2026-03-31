import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Line, Bar } from "react-chartjs-2";
import { formatLocalDate, todayLocal } from "../lib/dateUtils";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function InventoryTrend() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return formatLocalDate(date);
  });
  const [endDate, setEndDate] = useState(() => todayLocal());
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | undefined>(undefined);

  // 통합 API 호출
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  const { data: inventoryData, isLoading } = trpc.dashboard.getInventoryTrendData.useQuery({
    startDate,
    endDate,
    materialId: selectedMaterialId,
  }, {
    staleTime: 5 * 60 * 1000, // 5분
    gcTime: 10 * 60 * 1000, // 10분
  });

  const trendData = inventoryData?.inventoryTrend;
  const turnoverData = inventoryData?.turnoverAnalysis;
  const expiringStock = inventoryData?.expiringMaterials;
  const trendLoading = isLoading;
  const turnoverLoading = isLoading;
  const expiringLoading = isLoading;

  // 재고 사용 패턴 차트 데이터
  const usagePatternChartData = useMemo(() => {
    if (!trendData) return null;

    return {
      labels: trendData.map((item: any) => item.date),
      datasets: [
        {
          label: "입고 수량",
          data: trendData.map((item: any) => item.receiptQuantity),
          borderColor: "rgb(34, 197, 94)",
          backgroundColor: "rgba(34, 197, 94, 0.1)",
          tension: 0.4,
        },
        {
          label: "사용 수량",
          data: trendData.map((item: any) => item.usageQuantity),
          borderColor: "rgb(239, 68, 68)",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          tension: 0.4,
        },
        {
          label: "조정 수량",
          data: trendData.map((item: any) => item.adjustmentQuantity),
          borderColor: "rgb(59, 130, 246)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          tension: 0.4,
        },
      ],
    };
  }, [trendData]);

  // 재고 회전율 차트 데이터
  const turnoverChartData = useMemo(() => {
    if (!turnoverData) return null;

    const topTurnover = turnoverData.slice(0, 10);

    return {
      labels: topTurnover.map((item: any) => item.materialName),
      datasets: [
        {
          label: "회전율",
          data: topTurnover.map((item: any) => parseFloat(item.turnoverRate)),
          backgroundColor: "rgba(59, 130, 246, 0.6)",
          borderColor: "rgb(59, 130, 246)",
          borderWidth: 1,
        },
      ],
    };
  }, [turnoverData]);

  // 유통기한 임박 현황 차트 데이터
  const expiringChartData = useMemo(() => {
    if (!expiringStock) return null;

    return {
      labels: expiringStock.map((item: any) => `${item.materialName} (${item.lotNumber})`),
      datasets: [
        {
          label: "재고 수량",
          data: expiringStock.map((item: any) => item.quantity),
          backgroundColor: "rgba(239, 68, 68, 0.6)",
          borderColor: "rgb(239, 68, 68)",
          borderWidth: 1,
        },
      ],
    };
  }, [expiringStock]);

  const lineChartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const barChartOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top" as const,
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const handleApplyFilters = () => {
    // 필터 적용 시 자동으로 refetch됨
  };

  return (
    <DashboardLayout>
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">재고 추이 분석</h1>
          <p className="text-muted-foreground mt-2">
            재고 사용 패턴, 재고 회전율, 유통기한 임박 현황을 시각화합니다
          </p>
        </div>
      </div>

      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>필터</CardTitle>
          <CardDescription>기간 및 원재료를 선택하여 데이터를 필터링합니다</CardDescription>
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
              <Label htmlFor="material">원재료</Label>
              <Select
                value={selectedMaterialId?.toString() || "all"}
                onValueChange={(value) =>
                  setSelectedMaterialId(value === "all" ? undefined : parseInt(value))
                }
              >
                <SelectTrigger id="material">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {materials?.map((material: any) => (
                    <SelectItem key={material.id} value={material.id.toString()}>
                      {material.materialName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleApplyFilters} className="w-full">
                필터 적용
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 재고 사용 패턴 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>재고 사용 패턴</CardTitle>
          <CardDescription>일별 입고, 사용, 조정 수량 추이</CardDescription>
        </CardHeader>
        <CardContent>
          {trendLoading ? (
            <div className="h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">데이터를 불러오는 중...</p>
            </div>
          ) : usagePatternChartData ? (
            <div className="h-[400px]">
              <Line data={usagePatternChartData} options={lineChartOptions} />
            </div>
          ) : (
            <div className="h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">데이터가 없습니다</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 재고 회전율 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>재고 회전율 분석</CardTitle>
          <CardDescription>원재료별 재고 회전율 (상위 10개)</CardDescription>
        </CardHeader>
        <CardContent>
          {turnoverLoading ? (
            <div className="h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">데이터를 불러오는 중...</p>
            </div>
          ) : turnoverChartData ? (
            <div className="h-[400px]">
              <Bar data={turnoverChartData} options={barChartOptions} />
            </div>
          ) : (
            <div className="h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">데이터가 없습니다</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 유통기한 임박 현황 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>유통기한 임박 현황</CardTitle>
          <CardDescription>7일 이내 유통기한이 임박한 재고</CardDescription>
        </CardHeader>
        <CardContent>
          {expiringLoading ? (
            <div className="h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">데이터를 불러오는 중...</p>
            </div>
          ) : expiringChartData && expiringStock && expiringStock.length > 0 ? (
            <div className="h-[400px]">
              <Bar data={expiringChartData} options={barChartOptions} />
            </div>
          ) : (
            <div className="h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">유통기한 임박 재고가 없습니다</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 상세 데이터 테이블 - 재고 회전율 */}
      {turnoverData && turnoverData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>재고 회전율 상세 데이터</CardTitle>
            <CardDescription>원재료별 재고 회전율 및 재고 일수</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>원재료명</TableHead>
                  <TableHead>원재료 코드</TableHead>
                  <TableHead className="text-right">총 사용량</TableHead>
                  <TableHead className="text-right">현재 재고</TableHead>
                  <TableHead className="text-right">회전율</TableHead>
                  <TableHead className="text-right">재고 일수</TableHead>
                  <TableHead className="text-right">일평균 사용량</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {turnoverData.map((item: any) => (
                  <TableRow key={item.materialId}>
                    <TableCell className="font-medium">{item.materialName}</TableCell>
                    <TableCell>{item.materialCode}</TableCell>
                    <TableCell className="text-right">{item.totalUsage.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{item.totalStock.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{item.turnoverRate}</TableCell>
                    <TableCell className="text-right">{item.daysOfStock}일</TableCell>
                    <TableCell className="text-right">{item.avgDailyUsage}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 상세 데이터 테이블 - 유통기한 임박 */}
      {expiringStock && expiringStock.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>유통기한 임박 상세 데이터</CardTitle>
            <CardDescription>7일 이내 유통기한이 임박한 재고 목록</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>원재료명</TableHead>
                  <TableHead>LOT 번호</TableHead>
                  <TableHead>유통기한</TableHead>
                  <TableHead className="text-right">수량</TableHead>
                  <TableHead>단위</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiringStock.map((item: any, index: any) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.materialName}</TableCell>
                    <TableCell>{item.lotNumber}</TableCell>
                    <TableCell>{item.expiryDate}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
    </DashboardLayout>
  );
}
