import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { TrendingUp, Package, Download } from "lucide-react";
import { convertToCSV, downloadCSV } from "@/lib/csvExport";
import { toast } from "sonner";

import { todayLocal } from "../../lib/dateUtils";

export function ProductionTrendWidget() {
  const [days, setDays] = useState<number>(7);
  const { data, isLoading } = trpc.dashboard.getProductionTrend.useQuery({ days });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">배치 생산 추이</h3>
          <Package className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <div className="h-4 bg-muted animate-pulse rounded" />
          <div className="h-4 bg-muted animate-pulse rounded w-3/4" />
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">배치 생산 추이</h3>
          <Package className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">데이터가 없습니다</p>
      </Card>
    );
  }

  const trend = data.trend || [];
  const maxCount = Math.max(...trend.map((t: any) => t.count), 1);

  return (
    <Card className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-2">
        <h3 className="text-base md:text-lg font-semibold">배치 생산 추이</h3>
        <div className="flex items-center gap-2">
          <Button
            variant={days === 1 ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(1)}
            className="text-xs"
          >
            오늘
          </Button>
          <Button
            variant={days === 7 ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(7)}
            className="text-xs"
          >
            7일
          </Button>
          <Button
            variant={days === 30 ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(30)}
            className="text-xs"
          >
            30일
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (trend.length === 0) {
                toast.error("내보낼 데이터가 없습니다");
                return;
              }
              const csv = convertToCSV(
                trend,
                [
                  { key: "date", label: "날짜" },
                  { key: "count", label: "배치 수" },
                ]
              );
              downloadCSV(csv, `배치_생산_추이_${todayLocal()}.csv`);
              toast.success("CSV 파일이 다운로드되었습니다");
            }}
            className="text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {trend.map((item: any) => (
          <div key={item.date} className="space-y-1">
            <div className="flex justify-between text-xs md:text-sm">
              <span className="text-muted-foreground">{item.date}</span>
              <span className="font-medium">{item.count}개</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t">
        <div className="flex justify-between text-xs md:text-sm">
          <span className="text-muted-foreground">총 생산</span>
          <span className="font-semibold">{data.total}개</span>
        </div>
      </div>
    </Card>
  );
}
