import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Activity, TrendingUp, Clock, FileText } from "lucide-react";
import { Link } from "wouter";

/**
 * 모듈별 최근 작성 통계 위젯
 * - 최근 활동 로그 표시
 * - 모듈별 작성 건수 통계
 */
export function RecentActivityWidget() {
  // const { data: activities, isLoading } = trpc.system.getRecentActivities.useQuery({ limit: 10 });
  // const { data: stats } = trpc.system.getStats.useQuery();
  const activities: any[] = [];
  const stats: any = null;
  const isLoading = false;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            최근 활동
          </CardTitle>
          <CardDescription>시스템의 최근 활동을 확인하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">로딩 중...</div>
        </CardContent>
      </Card>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            최근 활동
          </CardTitle>
          <CardDescription>시스템의 최근 활동을 확인하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground py-4">
            최근 활동이 없습니다
          </div>
        </CardContent>
      </Card>
    );
  }

  // 활동 타입별 아이콘
  const getActionIcon = (action: string) => {
    switch (action) {
      case "create":
        return "✨";
      case "update":
        return "✏️";
      case "delete":
        return "🗑️";
      case "approve":
        return "✅";
      case "reject":
        return "❌";
      default:
        return "📝";
    }
  };

  // 활동 타입별 라벨
  const getActionLabel = (action: string) => {
    switch (action) {
      case "create":
        return "생성";
      case "update":
        return "수정";
      case "delete":
        return "삭제";
      case "approve":
        return "승인";
      case "reject":
        return "반려";
      default:
        return action;
    }
  };

  // 엔티티 타입별 라벨
  const getEntityLabel = (entityType: string) => {
    switch (entityType) {
      case "batch":
        return "배치";
      case "ccp":
        return "CCP 점검";
      case "checklist":
        return "체크리스트";
      case "health_certificate":
        return "보건증";
      case "pest_control":
        return "해충 방제";
      case "material_inspection":
        return "원재료 검사";
      default:
        return entityType;
    }
  };

  // 시간 포맷
  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}일 전`;
    if (hours > 0) return `${hours}시간 전`;
    if (minutes > 0) return `${minutes}분 전`;
    return "방금 전";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" />
          최근 활동
        </CardTitle>
        <CardDescription>시스템의 최근 활동을 확인하세요</CardDescription>
      </CardHeader>
      <CardContent>
        {/* 통계 요약 */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
              <div className="text-2xl font-bold text-blue-600">{stats?.batchesInProgress || 0}</div>
              <div className="text-xs text-muted-foreground">진행 중인 배치</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-950">
              <div className="text-2xl font-bold text-green-600">{stats?.batchesCompletedToday || 0}</div>
              <div className="text-xs text-muted-foreground">오늘 완료</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-950">
              <div className="text-2xl font-bold text-purple-600">{stats?.batchesCompletedWeek || 0}</div>
              <div className="text-xs text-muted-foreground">이번 주 완료</div>
            </div>
          </div>
        )}

        {/* 최근 활동 목록 */}
        <div className="space-y-2">
          <div className="text-sm font-medium mb-2">최근 작성 내역</div>
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="text-lg">{getActionIcon(activity.action)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-medium">{activity.userEmail}</span>
                  <span className="text-muted-foreground"> {getActionLabel(activity.action)} </span>
                  <span className="font-medium">{getEntityLabel(activity.entityType)}</span>
                </div>
                {activity.description && (
                  <div className="text-xs text-muted-foreground truncate">
                    {activity.description}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {formatTime(activity.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
