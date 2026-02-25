import { useEffect, useRef } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface MaterialPriceChartProps {
  materialId: number;
  materialName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaterialPriceChart({
  materialId,
  materialName,
  open,
  onOpenChange,
}: MaterialPriceChartProps) {
  const { data: priceHistory, isLoading } = trpc.material.getPriceHistory.useQuery(
    { materialId },
    { enabled: open }
  );

  const chartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: `${materialName} 가격 변동 추이`,
        font: {
          size: 16,
          weight: "bold",
        },
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            const value = context.parsed.y;
            if (value === null) return "데이터 없음";
            return `단가: ${value.toLocaleString("ko-KR")}원`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          callback: function (value) {
            return value.toLocaleString("ko-KR") + "원";
          },
        },
      },
    },
  };

  const chartData = {
    labels: priceHistory?.map((item) =>
      new Date(item.date).toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
      })
    ) || [],
    datasets: [
      {
        label: "단가",
        data: priceHistory?.map((item) => item.price) || [],
        borderColor: "rgb(99, 102, 241)",
        backgroundColor: "rgba(99, 102, 241, 0.1)",
        tension: 0.3,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>원재료 가격 변동 추이</DialogTitle>
        </DialogHeader>
        <div className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">데이터를 불러오는 중...</p>
            </div>
          ) : priceHistory && priceHistory.length > 0 ? (
            <Line data={chartData} options={chartOptions} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">가격 변동 데이터가 없습니다.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
