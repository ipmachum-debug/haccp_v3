import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Download } from "lucide-react";
import { convertToCSV, downloadCSV } from "@/lib/csvExport";
import { toast } from "sonner";

import { todayLocal } from "../../lib/dateUtils";

export function MonthlyCcpDeviationWidget() {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = trpc.dashboard.getMonthlyCcpDeviationRate.useQuery({ days });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">월별 CCP 이탈 비율</h3>
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
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
          <h3 className="text-lg font-semibold">월별 CCP 이탈 비율</h3>
          <AlertTriangle className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">데이터가 없습니다</p>
      </Card>
    );
  }

  const rateColor = data.rate > 10 ? "text-destructive" : data.rate > 5 ? "text-yellow-600" : "text-green-600";

  return (
    <Card className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-2">
        <h3 className="text-base md:text-lg font-semibold">CCP 이탈 비율</h3>
        <div className="flex items-center gap-2">
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
            variant={days === 90 ? "default" : "outline"}
            size="sm"
            onClick={() => setDays(90)}
            className="text-xs"
          >
            90일
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (!data) {
                toast.error("내보낼 데이터가 없습니다");
                return;
              }
              const csv = convertToCSV(
                [
                  {
                    period: `${days}일`,
                    rate: data.rate,
                    total: data.total,
                    deviations: data.deviations,
                  },
                ],
                [
                  { key: "period", label: "기간" },
                  { key: "rate", label: "이탈 비율(%)" },
                  { key: "total", label: "총 검사 횟수" },
                  { key: "deviations", label: "이탈 건수" },
                ]
              );
              downloadCSV(csv, `CCP_이탈_비율_${todayLocal()}.csv`);
              toast.success("CSV 파일이 다운로드되었습니다");
            }}
            className="text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            CSV
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-center">
          <div className={`text-3xl md:text-4xl font-bold ${rateColor}`}>
            {data.rate}%
          </div>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">이탈 비율</p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-lg md:text-xl font-semibold">{data.total}</div>
            <p className="text-xs text-muted-foreground">총 점검</p>
          </div>
          <div className="text-center">
            <div className="text-lg md:text-xl font-semibold text-destructive">{data.deviations}</div>
            <p className="text-xs text-muted-foreground">이탈 발생</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
