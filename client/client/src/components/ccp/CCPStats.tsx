import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export function CCPStats() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  const { data: stats, isLoading } = trpc.ccpMonitoring.getCcpMonitoringStats.useQuery({
    startDate: new Date(dateRange.startDate),
    endDate: new Date(dateRange.endDate),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>CCP 모니터링 통계</CardTitle>
          <CardDescription>
            기간별 CCP 모니터링 현황 및 적합률
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 기간 선택 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">시작일</Label>
              <Input
                id="startDate"
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">종료일</Label>
              <Input
                id="endDate"
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* 통계 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats && stats.length > 0 ? (
                stats.map((stat) => {
                  const totalRecords = Number(stat.totalRecords) || 0;
                  const passedRecords = Number(stat.passedRecords) || 0;
                  const failedRecords = Number(stat.failedRecords) || 0;
                  const passRate = totalRecords > 0 ? ((passedRecords / totalRecords) * 100).toFixed(1) : "0.0";

                  return (
                    <Card key={stat.ccpType}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium">
                          {stat.ccpType}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">총 기록</span>
                          <span className="text-2xl font-bold">{totalRecords}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-green-600 flex items-center gap-1">
                            <CheckCircle className="h-4 w-4" />
                            적합
                          </span>
                          <span className="text-sm font-semibold">{passedRecords}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-red-600 flex items-center gap-1">
                            <XCircle className="h-4 w-4" />
                            부적합
                          </span>
                          <span className="text-sm font-semibold">{failedRecords}</span>
                        </div>
                        <div className="pt-2 border-t">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">적합률</span>
                            <span className="text-lg font-bold text-primary">{passRate}%</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <div className="col-span-4 text-center text-muted-foreground py-8">
                  선택한 기간에 데이터가 없습니다
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
