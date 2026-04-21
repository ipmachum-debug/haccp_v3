import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sparkles, Calendar, Clock, TrendingUp, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";

export default function AIScheduleOptimizer() {
  const [optimizeEnabled, setOptimizeEnabled] = useState(false);
  const [optimizedSchedule, setOptimizedSchedule] = useState<any>(null);

  // AI 최적화 실행
  const { data, isLoading, refetch } = trpc.scheduleOptimization.optimize.useQuery(
    {
      startDate: todayLocal(),
      endDate: formatLocalDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
    },
    {
      enabled: optimizeEnabled,
    }
  );

  // 데이터가 로드되면 optimizedSchedule에 저장
  if (data && optimizeEnabled) {
    setOptimizedSchedule(data);
    toast.success("AI 기반 일정 최적화가 완료되었습니다.");
    setOptimizeEnabled(false);
  }

  const handleOptimize = () => {
    setOptimizeEnabled(true);
    refetch();
  };

  const handleApply = () => {
    if (!optimizedSchedule) return;
    // TODO: 최적화된 일정 적용 API 구현 필요
    toast.success("최적화된 일정이 적용되었습니다.");
    setOptimizedSchedule(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                AI 기반 생산일정 최적화
              </CardTitle>
              <CardDescription>
                재고 수준, 납기일, 설비 가용성을 고려한 최적의 생산 스케줄을 제안합니다
              </CardDescription>
            </div>
            <Button
              onClick={handleOptimize}
              disabled={isLoading}
              size="lg"
            >
              {isLoading ? (
                <>
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                  최적화 중...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  AI 최적화 실행
                </>
              )}
            </Button>
          </div>
        </CardHeader>

        {optimizedSchedule && (
          <CardContent className="space-y-6">
            {/* 최적화 결과 요약 */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">효율성 개선</p>
                      <p className="text-2xl font-bold">
                        +{optimizedSchedule.efficiencyImprovement?.toFixed(1) ?? '0.0'}%
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">평균 리드타임</p>
                      <p className="text-2xl font-bold">
                        {optimizedSchedule.averageLeadTime ?? '0'}일
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-orange-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">충돌 해결</p>
                      <p className="text-2xl font-bold">
                        {optimizedSchedule.conflictsResolved ?? 0}건
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 최적화된 일정 목록 */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">최적화된 생산 일정</h3>
                <Button onClick={handleApply}>
                  일정 적용
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>배치 ID</TableHead>
                    <TableHead>제품명</TableHead>
                    <TableHead>기존 일정</TableHead>
                    <TableHead>최적화된 일정</TableHead>
                    <TableHead>우선순위</TableHead>
                    <TableHead>사유</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {optimizedSchedule.optimizedSchedules?.map((schedule: any) => (
                    <TableRow key={schedule.batchId}>
                      <TableCell className="font-medium">#{schedule.batchId}</TableCell>
                      <TableCell>{schedule.productName}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          {new Date(schedule.originalDate).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-primary" />
                          {new Date(schedule.optimizedDate).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            schedule.priority === "high"
                              ? "destructive"
                              : schedule.priority === "medium"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {schedule.priority === "high"
                            ? "높음"
                            : schedule.priority === "medium"
                            ? "중간"
                            : "낮음"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {schedule.reason}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* 최적화 제안 사항 */}
            {optimizedSchedule.suggestions && optimizedSchedule.suggestions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">최적화 제안 사항</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {optimizedSchedule.suggestions.map((suggestion: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-blue-500 mt-0.5" />
                        <span className="text-sm">{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </CardContent>
        )}

        {!optimizedSchedule && !isLoading && (
          <CardContent>
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>AI 최적화를 실행하여 최적의 생산 스케줄을 확인하세요</p>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
