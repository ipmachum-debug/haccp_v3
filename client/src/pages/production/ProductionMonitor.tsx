import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, CheckCircle2, AlertCircle, Clock, RefreshCw } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
export default function ProductionMonitor() {
  const L = useIndustryLabel();
  const { data: batches, isLoading, refetch, isFetching } = trpc.batch.getActiveBatches.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "in_progress":
        return (
          <Badge className="bg-blue-500">
            <Activity className="w-3 h-3 mr-1" />
            진행 중
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-green-500">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            완료
          </Badge>
        );
      case "delayed":
        return (
          <Badge className="bg-red-500">
            <AlertCircle className="w-3 h-3 mr-1" />
            지연
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            <Clock className="w-3 h-3 mr-1" />
            {status}
          </Badge>
        );
    }
  };

  const getProgressPercentage = (batch: any) => {
    if (batch.status === "completed") return 100;
    if (batch.status === "in_progress") {
      // 시작 시간과 예상 종료 시간을 기준으로 진행률 계산
      const now = new Date().getTime();
      const start = new Date(batch.startTime).getTime();
      const end = new Date(batch.expectedEndTime).getTime();
      const progress = ((now - start) / (end - start)) * 100;
      return Math.min(Math.max(progress, 0), 100);
    }
    return 0;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">배치 생산 현황 모니터링</h1>
          <p className="text-muted-foreground mt-2">
            배치 생산 상태를 확인하세요
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          새로고침
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              전체 배치
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batches?.length || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              진행 중
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-500">
              {batches?.filter((b: any) => b.status === "in_progress").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              완료
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {batches?.filter((b: any) => b.status === "completed").length || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              지연
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">
              {batches?.filter((b: any) => b.status === "delayed").length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 배치 목록 */}
      <div className="grid gap-4">
        {batches && batches.length > 0 ? (
          batches.map((batch: any) => {
            const progress = getProgressPercentage(batch);
            return (
              <Card key={batch.batchId} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CardTitle>{batch.batchNumber}</CardTitle>
                      {getStatusBadge(batch.status)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {batch.productName}
                    </div>
                  </div>
                  <CardDescription>
                    생산 수량: {batch.quantity} {batch.unit || "개"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 진행률 바 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">진행률</span>
                      <span className="font-medium">{progress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          batch.status === "completed"
                            ? "bg-green-500"
                            : batch.status === "delayed"
                            ? "bg-red-500"
                            : "bg-blue-500"
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {/* 시간 정보 */}
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">시작 시간</div>
                      <div className="font-medium">
                        {batch.startTime
                          ? new Date(batch.startTime).toLocaleString()
                          : "-"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">예상 종료</div>
                      <div className="font-medium">
                        {batch.expectedEndTime
                          ? new Date(batch.expectedEndTime).toLocaleString()
                          : "-"}
                      </div>
                    </div>
                  </div>

                  {/* CCP 점검 현황 */}
                  {batch.ccpCheckCount !== undefined && (
                    <div className="pt-2 border-t">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">CCP 점검 현황</span>
                        <span className="font-medium">
                          {batch.ccpCheckCompletedCount || 0} / {batch.ccpCheckCount}
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-1.5 mt-2">
                        <div
                          className="h-1.5 rounded-full bg-purple-500 transition-all duration-500"
                          style={{
                            width: `${
                              batch.ccpCheckCount > 0
                                ? ((batch.ccpCheckCompletedCount || 0) /
                                    batch.ccpCheckCount) *
                                  100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              현재 진행 중인 배치가 없습니다.
            </CardContent>
          </Card>
        )}
      </div>
      </div>
    </DashboardLayout>
  );
}
