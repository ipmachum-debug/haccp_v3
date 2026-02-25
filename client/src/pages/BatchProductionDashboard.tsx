import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, AlertTriangle, Clock, Package } from "lucide-react";

export default function BatchProductionDashboard() {
  const { data: activeBatches, isLoading: loadingBatches, refetch: refetchActiveBatches } = trpc.productionDashboard.getActiveBatches.useQuery();
  const { data: batchStats, isLoading: loadingStats, refetch: refetchBatchStats } = trpc.productionDashboard.getBatchStats.useQuery();

  const handleRefresh = () => {
    refetchActiveBatches();
    refetchBatchStats();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">생산 현황</h1>
            <p className="text-muted-foreground">실시간 배치 생산 상태를 모니터링합니다</p>
          </div>
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            새로고침
          </Button>
        </div>

        {/* 통계 카드 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">계획됨</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loadingStats ? "..." : batchStats?.planned || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">진행 중</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{loadingStats ? "..." : batchStats?.in_progress || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">완료</CardTitle>
              <Package className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{loadingStats ? "..." : batchStats?.completed || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">출하됨</CardTitle>
              <Package className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{loadingStats ? "..." : batchStats?.shipped || 0}</div>
            </CardContent>
          </Card>
        </div>

        {/* 진행 중인 배치 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>진행 중인 배치</CardTitle>
            <CardDescription>현재 생산 중인 배치의 실시간 진행률과 예상 완료 시간</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingBatches ? (
              <p className="text-center text-muted-foreground py-8">로딩 중...</p>
            ) : !activeBatches || activeBatches.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">진행 중인 배치가 없습니다.</p>
            ) : (
              <div className="space-y-4">
                {activeBatches.map((batch) => (
                  <Card key={batch.id} className={batch.isDelayed ? "border-red-500" : ""}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{batch.batchCode}</CardTitle>
                          {batch.isDelayed && (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              지연
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline">{batch.progress}%</Badge>
                      </div>
                      <CardDescription>
                        예상 완료: {batch.estimatedCompletion ? new Date(batch.estimatedCompletion).toLocaleString("ko-KR") : "미정"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Progress value={batch.progress} className="h-2" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
