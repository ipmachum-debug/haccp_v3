import { useParams, useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, User, FileText } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

/**
 * 체크리스트 이력 조회 페이지
 * Phase 80: 각 체크리스트 인스턴스의 수정 이력 시각화
 */
export default function ChecklistHistory() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const instanceId = Number(id);

  const { data: history, isLoading } = trpc.qualityChecklist.getInstanceHistory.useQuery(
    { instanceId },
    { enabled: !!instanceId }
  );

  const { data: instance } = trpc.qualityChecklist.getInstance.useQuery(
    { id: instanceId },
    { enabled: !!instanceId }
  );

  if (isLoading) {
    return (
      <div className="container py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">이력을 불러오는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(`/checklist/${instanceId}`)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">체크리스트 이력</h1>
          {instance && instance.instance.targetDate && (
            <p className="text-sm text-muted-foreground mt-1">
              {new Date(instance.instance.targetDate).toLocaleDateString('ko-KR')}
            </p>
          )}
        </div>
      </div>

      {/* 이력 타임라인 */}
      {!history || history.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">아직 수정 이력이 없습니다.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {history.map((record, index) => (
            <Card key={record.id} className="p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                {/* 타임라인 인디케이터 */}
                <div className="flex md:flex-col items-center md:items-start gap-2 md:gap-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  {index < history.length - 1 && (
                    <div className="hidden md:block w-0.5 h-full bg-border mt-2" />
                  )}
                </div>

                {/* 이력 내용 */}
                <div className="flex-1 min-w-0">
                  {/* 시간 및 사용자 */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-sm font-medium">
                      {new Date(record.changedAt).toLocaleString('ko-KR')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({formatDistanceToNow(new Date(record.changedAt), { 
                        addSuffix: true, 
                        locale: ko 
                      })})
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      {record.userName || '알 수 없음'}
                    </span>
                  </div>

                  {/* 항목명 */}
                  <div className="mb-2">
                    <span className="text-sm font-medium text-primary">
                      {record.itemName}
                    </span>
                  </div>

                  {/* 변경 내용 */}
                  <div className="grid md:grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        이전 값
                      </div>
                      <div className="text-sm break-words">
                        {record.oldValue || <span className="text-muted-foreground italic">없음</span>}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-muted-foreground mb-1">
                        새 값
                      </div>
                      <div className="text-sm break-words font-medium">
                        {record.newValue || <span className="text-muted-foreground italic">없음</span>}
                      </div>
                    </div>
                  </div>

                  {/* 변경 사유 */}
                  {record.changeReason && (
                    <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800">
                      <div className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-1">
                        변경 사유
                      </div>
                      <div className="text-sm text-blue-800 dark:text-blue-200">
                        {record.changeReason}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
    </DashboardLayout>
  );
}
