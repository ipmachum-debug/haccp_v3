import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Calendar, Clock } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfDay, endOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { Link } from "wouter";
import { Button } from "./ui/button";

export function BatchScheduleWidget() {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // 월요일 시작
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });

  // 오늘 일정 조회
  const { data: todaySchedules } = trpc.batchSchedule.list.useQuery({
    startDate: startOfDay(today),
    endDate: endOfDay(today),
  });

  // 이번 주 일정 조회
  const { data: weekSchedules } = trpc.batchSchedule.list.useQuery({
    startDate: weekStart,
    endDate: weekEnd,
  });

  // 배치 정보 조회
  const { data: batchData } = trpc.batch.list.useQuery();
  const batches = batchData?.items || [];

  // 오늘 일정 수
  const todayCount = todaySchedules?.length || 0;

  // 이번 주 일정 수
  const weekCount = weekSchedules?.length || 0;

  // 오늘 일정 상세 정보
  const todayScheduleDetails = todaySchedules?.slice(0, 3).map((schedule: any) => {
    const batch = batches?.find((b: any) => b.id === schedule.batchId);
    return {
      id: schedule.id,
      batchCode: batch?.batchCode || `배치 ID: ${schedule.batchId}`,
      scheduledDate: schedule.scheduledDate,
      status: schedule.status,
    };
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle>생산 일정</CardTitle>
          </div>
          <Link href="/batch/schedule">
            <Button variant="ghost" size="sm">
              전체 보기
            </Button>
          </Link>
        </div>
        <CardDescription>오늘과 이번 주 배치 생산 일정</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 통계 요약 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1 p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">오늘</span>
            </div>
            <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">{todayCount}</span>
            <span className="text-xs text-blue-600 dark:text-blue-400">개 일정</span>
          </div>

          <div className="flex flex-col gap-1 p-3 rounded-lg bg-green-50 dark:bg-green-950">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-green-600 dark:text-green-400" />
              <span className="text-sm font-medium text-green-600 dark:text-green-400">이번 주</span>
            </div>
            <span className="text-2xl font-bold text-green-700 dark:text-green-300">{weekCount}</span>
            <span className="text-xs text-green-600 dark:text-green-400">개 일정</span>
          </div>
        </div>

        {/* 오늘 일정 목록 */}
        {todayScheduleDetails && todayScheduleDetails.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">오늘의 일정</h4>
            {todayScheduleDetails.map((schedule: any) => (
              <div
                key={schedule.id}
                className="flex items-center justify-between p-2 rounded-md bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium">{schedule.batchCode}</span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(schedule.scheduledDate), "HH:mm", { locale: ko })}
                  </span>
                </div>
                <div
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    schedule.status === "planned"
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                      : schedule.status === "in_progress"
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300"
                      : schedule.status === "completed"
                      ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                      : "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300"
                  }`}
                >
                  {schedule.status === "planned"
                    ? "계획됨"
                    : schedule.status === "in_progress"
                    ? "진행 중"
                    : schedule.status === "completed"
                    ? "완료"
                    : schedule.status}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-sm text-muted-foreground">
            오늘 예정된 일정이 없습니다.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
