import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, RefreshCw, Trash2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * 실패 작업 관리 페이지
 * h_batch_completion_retries 테이블의 실패 작업을 조회하고 재시도할 수 있습니다.
 */
export default function FailedTasks() {
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);

  // 실패 작업 목록 조회
  const { data: failedTasks, isLoading, refetch } = trpc.admin.getFailedTasks.useQuery();

  // 재시도 mutation
  const retryMutation = trpc.admin.retryFailedTask.useMutation({
    onSuccess: () => {
      toast.success("작업이 성공적으로 재시도되었습니다");
      refetch();
      setSelectedTaskId(null);
    },
    onError: (error: any) => {
      toast.error(`재시도 실패: ${error.message}`);
    },
  });

  // 삭제 mutation
  const deleteMutation = trpc.admin.deleteFailedTask.useMutation({
    onSuccess: () => {
      toast.success("실패 작업이 삭제되었습니다");
      refetch();
      setSelectedTaskId(null);
    },
    onError: (error: any) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleRetry = (taskId: number) => {
    setSelectedTaskId(taskId);
    retryMutation.mutate({ taskId });
  };

  const handleDelete = (taskId: number) => {
    if (confirm("정말 이 작업을 삭제하시겠습니까?")) {
      setSelectedTaskId(taskId);
      deleteMutation.mutate({ taskId });
    }
  };

  if (isLoading) {
    return (
      <div className="container py-8">
        <Card>
          <CardHeader>
            <CardTitle>실패 작업 관리</CardTitle>
            <CardDescription>배치 완료 중 실패한 작업을 관리합니다</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            실패 작업 관리
          </CardTitle>
          <CardDescription>
            배치 완료 중 실패한 작업을 조회하고 재시도할 수 있습니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!failedTasks || failedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-lg font-medium">실패한 작업이 없습니다</p>
              <p className="text-sm text-muted-foreground mt-2">
                모든 배치 완료 작업이 정상적으로 처리되었습니다
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  총 {failedTasks.length}개의 실패 작업이 있습니다
                </p>
                <Button
                  onClick={() => refetch()}
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  새로고침
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>배치 ID</TableHead>
                    <TableHead>작업 유형</TableHead>
                    <TableHead>에러 메시지</TableHead>
                    <TableHead>재시도 횟수</TableHead>
                    <TableHead>생성 시간</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedTasks.map((task: any) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.batchId}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{task.taskType}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate" title={task.errorMessage}>
                        {task.errorMessage}
                      </TableCell>
                      <TableCell>
                        <Badge variant={task.retryCount >= 3 ? "destructive" : "secondary"}>
                          {task.retryCount}회
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(task.createdAt).toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            onClick={() => handleRetry(task.id)}
                            variant="outline"
                            size="sm"
                            disabled={
                              retryMutation.isPending && selectedTaskId === task.id
                            }
                          >
                            <RefreshCw
                              className={`h-4 w-4 mr-2 ${
                                retryMutation.isPending && selectedTaskId === task.id
                                  ? "animate-spin"
                                  : ""
                              }`}
                            />
                            재시도
                          </Button>
                          <Button
                            onClick={() => handleDelete(task.id)}
                            variant="ghost"
                            size="sm"
                            disabled={
                              deleteMutation.isPending && selectedTaskId === task.id
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
