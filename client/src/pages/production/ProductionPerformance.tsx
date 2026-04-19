import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, TrendingUp, Package, CheckCircle, AlertTriangle } from "lucide-react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"];

export default function ProductionPerformance() {
  const L = useIndustryLabel();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  // 배치 목록 조회
  const { data: batchData } = trpc.batch.list.useQuery();
  const allBatches = batchData?.items || [];
  
  // 날짜 범위 내 배치 필터링
  const batches = allBatches?.filter((batch: any) => {
    const batchDate = new Date(batch.plannedDate);
    return batchDate >= dateRange.from && batchDate <= dateRange.to;
  });

  // CCP 점검 일정 조회
  const { data: schedules } = trpc.ccpSchedule.list.useQuery({
    startDate: format(dateRange.from, "yyyy-MM-dd"),
    endDate: format(dateRange.to, "yyyy-MM-dd"),
  });

  // 통계 계산
  const stats = {
    totalBatches: batches?.length || 0,
    completedBatches: batches?.filter((b: any) => b.status === "completed").length || 0,
    inProgressBatches: batches?.filter((b: any) => b.status === "in_progress").length || 0,
    failedBatches: batches?.filter((b: any) => b.status === "failed").length || 0,
    totalSchedules: schedules?.length || 0,
    completedSchedules: schedules?.filter((s: any) => s.status === "completed").length || 0,
    pendingSchedules: schedules?.filter((s: any) => s.status === "pending").length || 0,
  };

  // CCP 준수율
  const ccpComplianceRate = stats.totalSchedules > 0
    ? Math.round((stats.completedSchedules / stats.totalSchedules) * 100)
    : 0;

  // 배치 완료율
  const batchCompletionRate = stats.totalBatches > 0
    ? Math.round((stats.completedBatches / stats.totalBatches) * 100)
    : 0;

  // 배치 상태별 데이터 (파이 차트)
  const batchStatusData = [
    { name: "완료", value: stats.completedBatches, color: "#22c55e" },
    { name: "진행 중", value: stats.inProgressBatches, color: "#3b82f6" },
    { name: "실패", value: stats.failedBatches, color: "#ef4444" },
    { name: "계획됨", value: stats.totalBatches - stats.completedBatches - stats.inProgressBatches - stats.failedBatches, color: "#6b7280" },
  ].filter((item) => item.value > 0);

  // CCP 점검 상태별 데이터 (파이 차트)
  const ccpStatusData = [
    { name: "완료", value: stats.completedSchedules, color: "#22c55e" },
    { name: "대기", value: stats.pendingSchedules, color: "#3b82f6" },
    { name: "건너뜀", value: stats.totalSchedules - stats.completedSchedules - stats.pendingSchedules, color: "#6b7280" },
  ].filter((item) => item.value > 0);

  // 일별 생산량 데이터 (바 차트)
  const dailyProductionData = batches?.reduce((acc: any[], batch: any) => {
    const date = format(new Date(batch.plannedDate), "MM/dd");
    const existing = acc.find((item) => item.date === date);
    
    if (existing) {
      existing.count += 1;
      existing.quantity += parseFloat(batch.actualQuantity || batch.plannedQuantity);
    } else {
      acc.push({
        date,
        count: 1,
        quantity: parseFloat(batch.actualQuantity || batch.plannedQuantity),
      });
    }
    
    return acc;
  }, []) || [];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">생산 실적 보고서</h1>
            <p className="text-muted-foreground mt-2">
              기간별 생산량, CCP 준수율, 재고 회전율 등의 통계를 확인하세요
            </p>
          </div>
          
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[300px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "PPP", { locale: ko })} -{" "}
                        {format(dateRange.to, "PPP", { locale: ko })}
                      </>
                    ) : (
                      format(dateRange.from, "PPP", { locale: ko })
                    )
                  ) : (
                    <span>날짜 범위 선택</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="space-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const today = new Date();
                      setDateRange({ from: subDays(today, 7), to: today });
                    }}
                  >
                    최근 7일
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const today = new Date();
                      setDateRange({ from: subDays(today, 30), to: today });
                    }}
                  >
                    최근 30일
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const today = new Date();
                      setDateRange({ from: startOfMonth(today), to: endOfMonth(today) });
                    }}
                  >
                    이번 달
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* 주요 지표 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">총 생산 배치</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalBatches}</div>
              <p className="text-xs text-muted-foreground">
                완료: {stats.completedBatches} ({batchCompletionRate}%)
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CCP 준수율</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ccpComplianceRate}%</div>
              <p className="text-xs text-muted-foreground">
                {stats.completedSchedules} / {stats.totalSchedules} 완료
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">진행 중인 배치</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.inProgressBatches}</div>
              <p className="text-xs text-muted-foreground">
                현재 생산 중
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">실패한 배치</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.failedBatches}</div>
              <p className="text-xs text-muted-foreground">
                조치 필요
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 차트 */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* 일별 생산량 */}
          <Card>
            <CardHeader>
              <CardTitle>일별 생산량</CardTitle>
              <CardDescription>기간 내 일별 배치 수 및 생산량</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyProductionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="count" fill="#3b82f6" name="배치 수" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 배치 상태 분포 */}
          <Card>
            <CardHeader>
              <CardTitle>배치 상태 분포</CardTitle>
              <CardDescription>배치 상태별 비율</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={batchStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {batchStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* CCP 점검 상태 분포 */}
          <Card>
            <CardHeader>
              <CardTitle>CCP 점검 상태 분포</CardTitle>
              <CardDescription>CCP 점검 상태별 비율</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={ccpStatusData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {ccpStatusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 배치 완료율 추이 */}
          <Card>
            <CardHeader>
              <CardTitle>배치 완료율</CardTitle>
              <CardDescription>전체 배치 대비 완료된 배치 비율</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center h-[300px]">
                <div className="text-center">
                  <div className="text-6xl font-bold text-green-500">{batchCompletionRate}%</div>
                  <p className="text-muted-foreground mt-2">
                    {stats.completedBatches} / {stats.totalBatches} 배치 완료
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
