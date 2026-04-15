import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";

// Chart.js 등록
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// 배치 생산 추이 차트
export function ProductionTrendChart() {
  const { data, isLoading } = trpc.dashboard.getProductionTrend.useQuery();

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>배치 생산 추이</CardTitle>
          <CardDescription>최근 7일간 배치 생산 현황</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            로딩 중...
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = {
    labels: data.trend.map((d: any) => d.date),
    datasets: [
      {
        label: "생산 배치 수",
        data: data.trend.map((d: any) => d.count),
        borderColor: "rgb(59, 130, 246)",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `${context.parsed.y}개 배치`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>배치 생산 추이</CardTitle>
        <CardDescription>최근 7일간 배치 생산 현황</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <Line data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}

// CCP 이탈 추이 차트
export function CcpDeviationTrendChart() {
  const { data, isLoading } = trpc.dashboard.getCcpDeviationTrend.useQuery();

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>CCP 이탈 추이</CardTitle>
          <CardDescription>최근 7일간 CCP 한계기준 이탈 발생 현황</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            로딩 중...
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = {
    labels: data.map((d: any) => d.date),
    datasets: [
      {
        label: "이탈 발생 건수",
        data: data.map((d: any) => d.count),
        backgroundColor: "rgba(239, 68, 68, 0.8)",
        borderColor: "rgb(239, 68, 68)",
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `${context.parsed.y}건 이탈`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
        },
      },
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>CCP 이탈 추이</CardTitle>
        <CardDescription>최근 7일간 CCP 한계기준 이탈 발생 현황</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <Bar data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}

// 원재료 소비 통계 차트
export function MaterialConsumptionChart() {
  const { data, isLoading } = trpc.dashboard.getMaterialConsumption.useQuery();

  if (isLoading || !data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>원재료 소비 현황</CardTitle>
          <CardDescription>최근 30일간 원재료 사용 비율</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            {isLoading ? "로딩 중..." : "데이터가 없습니다"}
          </div>
        </CardContent>
      </Card>
    );
  }

  const colors = [
    "rgba(59, 130, 246, 0.8)",
    "rgba(16, 185, 129, 0.8)",
    "rgba(251, 146, 60, 0.8)",
    "rgba(168, 85, 247, 0.8)",
    "rgba(236, 72, 153, 0.8)",
    "rgba(234, 179, 8, 0.8)",
  ];

  const chartData = {
    labels: data.map((d: any) => d.materialName),
    datasets: [
      {
        label: "사용량",
        data: data.map((d: any) => d.totalQuantity),
        backgroundColor: colors.slice(0, data.length),
        borderColor: colors.slice(0, data.length).map((c) => c.replace("0.8", "1")),
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "right" as const,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            const label = context.label || "";
            const value = context.parsed || 0;
            const total = (context.dataset.data as number[]).reduce((a: number, b: number) => a + b, 0);
            const percentage = ((value / total) * 100).toFixed(1);
            return `${label}: ${value}kg (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>원재료 소비 현황</CardTitle>
        <CardDescription>최근 30일간 원재료 사용 비율</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <Doughnut data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}

// 월별 CCP 이탈 비율 차트
export function MonthlyCcpDeviationRateChart() {
  const { data, isLoading } = trpc.dashboard.getMonthlyCcpDeviationRate.useQuery();

  if (isLoading || !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>월별 CCP 이탈 비율</CardTitle>
          <CardDescription>이번 달 CCP 이탈 현황</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            로딩 중...
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = {
    labels: ["이번 달"],
    datasets: [
      {
        label: "이탈 비율 (%)",
        data: [data.rate],
        borderColor: "rgb(239, 68, 68)",
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `이탈 비율: ${context.parsed.y.toFixed(1)}%`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        ticks: {
          callback: function (value: any) {
            return value + "%";
          },
        },
      },
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>월별 CCP 이탈 비율</CardTitle>
        <CardDescription>최근 6개월간 CCP 이탈 비율 추이</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <Line data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}
