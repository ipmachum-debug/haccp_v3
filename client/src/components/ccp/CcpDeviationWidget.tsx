import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertTriangle } from "lucide-react";

export function CcpDeviationWidget() {
  const { data: deviations, isLoading } = trpc.dashboard.getCcpDeviationTrend.useQuery();

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            CCP 이탈 추이 (최근 7일)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">로딩 중...</div>
        </CardContent>
      </Card>
    );
  }

  const total = deviations?.reduce((sum: number, d: any) => sum + d.count, 0) || 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          CCP 이탈 추이 (최근 7일)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="text-xl md:text-2xl font-bold">{total}건</div>
          <div className="space-y-2">
            {deviations && deviations.length > 0 ? (
              deviations.slice(0, 5).map((deviation: any, index: number) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{deviation.date}</span>
                  <span className="font-medium">{deviation.count}건</span>
                </div>
              ))
            ) : (
              <div className="text-sm text-muted-foreground">이탈 기록이 없습니다</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
