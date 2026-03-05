import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Calendar,
  Users
} from "lucide-react";

/**
 * 체크리스트 통계 대시보드
 * 완료율, 평균 소요 시간, 부적합 발생 빈도 등 KPI 시각화
 */
export default function ChecklistStatistics() {
  const [timeRange, setTimeRange] = useState<string>("month");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // 체크리스트 인스턴스 목록 조회
  const { data: instances, isLoading } = trpc.qualityChecklist.listInstances.useQuery({});

  // 통계 계산
  const statistics = useMemo(() => {
    if (!instances) return null;

    const now = new Date();
    const filteredInstances = instances.filter((instance) => {
      // 시간 범위 필터
      const createdAt = new Date(instance.createdAt || "");
      let timeLimit = new Date();
      
      if (timeRange === "week") {
        timeLimit.setDate(now.getDate() - 7);
      } else if (timeRange === "month") {
        timeLimit.setMonth(now.getMonth() - 1);
      } else if (timeRange === "quarter") {
        timeLimit.setMonth(now.getMonth() - 3);
      } else if (timeRange === "year") {
        timeLimit.setFullYear(now.getFullYear() - 1);
      }

      if (createdAt < timeLimit) return false;

      // 카테고리 필터
      if (categoryFilter !== "all" && instance.category !== categoryFilter) {
        return false;
      }

      return true;
    });

    const total = filteredInstances.length;
    const completed = filteredInstances.filter((i) => i.status === "completed" || i.status === "approved").length;
    const pending = filteredInstances.filter((i) => i.status === "pending" || i.status === "in_progress").length;
    const rejected = filteredInstances.filter((i) => i.status === "rejected").length;
    const approved = filteredInstances.filter((i) => i.status === "approved").length;

    // 완료율
    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    // 승인율
    const approvalRate = completed > 0 ? (approved / completed) * 100 : 0;

    // 평균 소요 시간 (생성일 ~ 완료일)
    const completedInstances = filteredInstances.filter(
      (i) => (i.status === "completed" || i.status === "approved") && i.completedAt && i.createdAt
    );
    
    let avgCompletionTime = 0;
    if (completedInstances.length > 0) {
      const totalTime = completedInstances.reduce((sum, instance) => {
        const created = new Date(instance.createdAt!).getTime();
        const completed = new Date(instance.completedAt!).getTime();
        return sum + (completed - created);
      }, 0);
      avgCompletionTime = totalTime / completedInstances.length / (1000 * 60 * 60); // 시간 단위
    }

    // 카테고리별 통계
    const categoryStats: Record<string, { total: number; completed: number; rejected: number }> = {};
    filteredInstances.forEach((instance) => {
      const cat = instance.category || "기타";
      if (!categoryStats[cat]) {
        categoryStats[cat] = { total: 0, completed: 0, rejected: 0 };
      }
      categoryStats[cat].total++;
      if (instance.status === "completed" || instance.status === "approved") {
        categoryStats[cat].completed++;
      }
      if (instance.status === "rejected") {
        categoryStats[cat].rejected++;
      }
    });

    // 상태별 통계
    const statusStats = {
      pending: filteredInstances.filter((i) => i.status === "pending").length,
      in_progress: filteredInstances.filter((i) => i.status === "in_progress").length,
      completed: filteredInstances.filter((i) => i.status === "completed").length,
      pending_review: filteredInstances.filter((i) => i.status === "pending_review").length,
      approved: filteredInstances.filter((i) => i.status === "approved").length,
      rejected: filteredInstances.filter((i) => i.status === "rejected").length,
    };

    return {
      total,
      completed,
      pending,
      rejected,
      approved,
      completionRate,
      approvalRate,
      avgCompletionTime,
      categoryStats,
      statusStats,
    };
  }, [instances, timeRange, categoryFilter]);

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (!statistics) {
    return (
      <div className="container py-8">
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg text-muted-foreground">통계 데이터를 불러올 수 없습니다</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
            체크리스트 통계
          </h1>
          <p className="text-muted-foreground mt-2">
            체크리스트 작성 현황 및 KPI를 한눈에 확인하세요
          </p>
        </div>

        {/* 필터 */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="기간 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">최근 1주일</SelectItem>
                  <SelectItem value="month">최근 1개월</SelectItem>
                  <SelectItem value="quarter">최근 3개월</SelectItem>
                  <SelectItem value="year">최근 1년</SelectItem>
                  <SelectItem value="all">전체 기간</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="카테고리 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 카테고리</SelectItem>
                <SelectItem value="CCP">중요관리점(CCP)</SelectItem>
                <SelectItem value="SANITATION">위생관리</SelectItem>
                <SelectItem value="QUALITY">품질관리</SelectItem>
                <SelectItem value="SAFETY">안전관리</SelectItem>
                <SelectItem value="TRAINING">교육훈련</SelectItem>
                <SelectItem value="MAINTENANCE">설비유지보수</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* KPI 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 총 체크리스트 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                총 체크리스트
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{statistics.total}</div>
              <p className="text-xs text-muted-foreground mt-1">
                완료: {statistics.completed} / 대기: {statistics.pending}
              </p>
            </CardContent>
          </Card>

          {/* 완료율 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                완료율
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{statistics.completionRate.toFixed(1)}%</div>
              <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${statistics.completionRate}%` }}
                />
              </div>
            </CardContent>
          </Card>

          {/* 승인율 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                승인율
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{statistics.approvalRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                승인: {statistics.approved} / 반려: {statistics.rejected}
              </p>
            </CardContent>
          </Card>

          {/* 평균 소요 시간 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="w-4 h-4" />
                평균 소요 시간
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {statistics.avgCompletionTime < 1
                  ? `${(statistics.avgCompletionTime * 60).toFixed(0)}분`
                  : `${statistics.avgCompletionTime.toFixed(1)}시간`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">생성 ~ 완료</p>
            </CardContent>
          </Card>
        </div>

        {/* 상태별 통계 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              상태별 분포
            </CardTitle>
            <CardDescription>각 상태별 체크리스트 수량</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(statistics.statusStats).map(([status, count]) => {
                const percentage = statistics.total > 0 ? (count / statistics.total) * 100 : 0;
                const statusLabels: Record<string, { label: string; color: string }> = {
                  pending: { label: "대기", color: "bg-gray-500" },
                  in_progress: { label: "진행 중", color: "bg-blue-500" },
                  completed: { label: "완료", color: "bg-green-500" },
                  pending_review: { label: "승인 대기", color: "bg-yellow-500" },
                  approved: { label: "승인 완료", color: "bg-emerald-500" },
                  rejected: { label: "반려", color: "bg-red-500" },
                };
                const config = statusLabels[status] || { label: status, color: "bg-gray-500" };

                return (
                  <div key={status} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{config.label}</span>
                      <span className="text-muted-foreground">
                        {count}개 ({percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full ${config.color} transition-all`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 카테고리별 통계 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              카테고리별 통계
            </CardTitle>
            <CardDescription>각 카테고리별 완료율 및 반려율</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(statistics.categoryStats).map(([category, stats]) => {
                const completionRate = stats.total > 0 ? (stats.completed / stats.total) * 100 : 0;
                const rejectionRate = stats.total > 0 ? (stats.rejected / stats.total) * 100 : 0;

                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{category}</span>
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="bg-green-50">
                          완료 {stats.completed}
                        </Badge>
                        {stats.rejected > 0 && (
                          <Badge variant="outline" className="bg-red-50">
                            반려 {stats.rejected}
                          </Badge>
                        )}
                        <span className="text-muted-foreground">총 {stats.total}개</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>완료율: {completionRate.toFixed(1)}%</span>
                        {rejectionRate > 0 && <span>반려율: {rejectionRate.toFixed(1)}%</span>}
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${completionRate}%` }}
                        />
                        <div
                          className="h-full bg-red-500"
                          style={{ width: `${rejectionRate}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 주의사항 */}
        {statistics.rejected > 0 && (
          <Card className="border-yellow-500 bg-yellow-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-yellow-700">
                <AlertTriangle className="w-5 h-5" />
                주의 필요
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-yellow-700">
                반려된 체크리스트가 {statistics.rejected}개 있습니다. 반려 사유를 확인하고 재작성이 필요합니다.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
    </DashboardLayout>
  );
}
