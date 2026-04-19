import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Bar, Pie, Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from "chart.js";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

export default function InspectionStatistics() {
  const L = useIndustryLabel();
  const [inspectionType, setInspectionType] = useState<"material" | "hygiene" | "shipping">("material");
  const [dateRange, setDateRange] = useState<"week" | "month" | "quarter">("month");

  // 검사 통계 데이터 조회
  const { data: stats, isLoading, error } = trpc.inspection.getStatistics.useQuery(
    { type: inspectionType, range: dateRange },
    { retry: 1, retryDelay: 1000 }
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-center h-64">
            <div className="text-muted-foreground">로딩 중...</div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">검사 통계 대시보드</h1>
              <p className="text-muted-foreground mt-2">검사 통계 데이터를 불러올 수 없습니다.</p>
            </div>
          </div>
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">검사 데이터가 아직 없거나 서버와 연결할 수 없습니다.</p>
            <p className="text-xs mt-2 text-gray-400">{error.message}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const passRateData = {
    labels: ["합격", "불합격", "조건부/보류"],
    datasets: [
      {
        data: [
          stats?.passCount || 0,
          stats?.failCount || 0,
          stats?.conditionalCount || 0,
        ],
        backgroundColor: [
          "rgba(34, 197, 94, 0.8)",
          "rgba(239, 68, 68, 0.8)",
          "rgba(251, 191, 36, 0.8)",
        ],
        borderColor: [
          "rgb(34, 197, 94)",
          "rgb(239, 68, 68)",
          "rgb(251, 191, 36)",
        ],
        borderWidth: 1,
      },
    ],
  };

  const failReasonData = {
    labels: stats?.failReasons?.map((r: any) => r.reason) || [],
    datasets: [
      {
        label: "불합격 건수",
        data: stats?.failReasons?.map((r: any) => r.count) || [],
        backgroundColor: "rgba(239, 68, 68, 0.8)",
        borderColor: "rgb(239, 68, 68)",
        borderWidth: 1,
      },
    ],
  };

  const inspectorStatsData = {
    labels: stats?.inspectorStats?.map((s: any) => s.inspectorName) || [],
    datasets: [
      {
        label: "검사 건수",
        data: stats?.inspectorStats?.map((s: any) => s.totalCount) || [],
        backgroundColor: "rgba(59, 130, 246, 0.8)",
        borderColor: "rgb(59, 130, 246)",
        borderWidth: 1,
      },
      {
        label: "합격 건수",
        data: stats?.inspectorStats?.map((s: any) => s.passCount) || [],
        backgroundColor: "rgba(34, 197, 94, 0.8)",
        borderColor: "rgb(34, 197, 94)",
        borderWidth: 1,
      },
    ],
  };

  const trendData = {
    labels: stats?.trendData?.map((t: any) => t.date) || [],
    datasets: [
      {
        label: "검사 건수",
        data: stats?.trendData?.map((t: any) => t.count) || [],
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        tension: 0.4,
      },
      {
        label: "합격률 (%)",
        data: stats?.trendData?.map((t: any) => t.passRate) || [],
        borderColor: "rgb(34, 197, 94)",
        backgroundColor: "rgba(34, 197, 94, 0.1)",
        tension: 0.4,
        yAxisID: "y1",
      },
    ],
  };

  const trendOptions = {
    responsive: true,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    scales: {
      y: {
        type: "linear" as const,
        display: true,
        position: "left" as const,
        title: {
          display: true,
          text: "검사 건수",
        },
      },
      y1: {
        type: "linear" as const,
        display: true,
        position: "right" as const,
        title: {
          display: true,
          text: "합격률 (%)",
        },
        grid: {
          drawOnChartArea: false,
        },
        max: 100,
      },
    },
  };

  const getInspectionTypeLabel = () => {
    switch (inspectionType) {
      case "material":
        return "원재료 검사";
      case "hygiene":
        return "위생 점검";
      case "shipping":
        return "출하 검사";
      default:
        return "검사";
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">검사 통계 대시보드</h1>
            <p className="text-muted-foreground mt-2">
              검사 합격률, 불합격 사유 분석, 검사자별 통계를 확인하세요
            </p>
          </div>
          <div className="flex gap-4">
            <Select value={inspectionType} onValueChange={(value: any) => setInspectionType(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="검사 유형 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="material">원재료 검사</SelectItem>
                <SelectItem value="hygiene">위생 점검</SelectItem>
                <SelectItem value="shipping">출하 검사</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={(value: any) => setDateRange(value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="기간 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">최근 1주</SelectItem>
                <SelectItem value="month">최근 1개월</SelectItem>
                <SelectItem value="quarter">최근 3개월</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                총 검사 건수
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalCount || 0}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                합격률
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats?.passRate?.toFixed(1) || 0}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                불합격 건수
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats?.failCount || 0}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                평균 검사 시간
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.avgInspectionTime || 0}분</div>
            </CardContent>
          </Card>
        </div>

        {/* 차트 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{getInspectionTypeLabel()} 합격률</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center">
                <Pie data={passRateData} options={{ maintainAspectRatio: false }} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>불합격 사유 분석</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <Bar
                  data={failReasonData}
                  options={{
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          stepSize: 1,
                        },
                      },
                    },
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>검사자별 통계</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <Bar
                  data={inspectorStatsData}
                  options={{
                    maintainAspectRatio: false,
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: {
                          stepSize: 1,
                        },
                      },
                    },
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>검사 추이</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <Line data={trendData} options={trendOptions as any} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
