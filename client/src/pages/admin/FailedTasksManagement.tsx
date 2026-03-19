import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Trash2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function FailedTasksManagement() {
  const utils = trpc.useUtils();

  // 실패한 작업 목록 조회
  const { data: failedTasks, isLoading } = trpc.system.getFailedBatchCompletionRetries.useQuery();

  // 수동 재시도
  const retryMutation = trpc.system.retryBatchCompletionTask.useMutation({
    onSuccess: () => {
      toast.success("작업이 성공적으로 재시도되었습니다.");
      utils.system.getFailedBatchCompletionRetries.invalidate();
    },
    onError: (error: any) => {
      toast.error(`재시도 실패: ${error.message}`);
    },
  });

  // 작업 삭제
  const deleteMutation = trpc.system.deleteBatchCompletionRetry.useMutation({
    onSuccess: () => {
      toast.success("재시도 작업이 삭제되었습니다.");
      utils.system.getFailedBatchCompletionRetries.invalidate();
    },
    onError: (error: any) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  const handleRetry = (taskId: number) => {
    if (confirm("이 작업을 수동으로 재시도하시겠습니까?")) {
      retryMutation.mutate({ taskId });
    }
  };

  const handleDelete = (taskId: number) => {
    if (confirm("이 재시도 작업을 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.")) {
      deleteMutation.mutate({ taskId });
    }
  };

  const getTaskTypeBadge = (taskType: string) => {
    switch (taskType) {
      case "pdf_generation":
        return <Badge variant="outline">PDF 생성</Badge>;
      case "notification":
        return <Badge variant="outline">알림 전송</Badge>;
      default:
        return <Badge variant="outline">{taskType}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">대기 중</Badge>;
      case "retrying":
        return <Badge variant="default">재시도 중</Badge>;
      case "success":
        return <Badge variant="default" className="bg-green-500">성공</Badge>;
      case "failed":
        return <Badge variant="destructive">실패</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>실패 작업 관리</CardTitle>
              <CardDescription>
                배치 완료 중 실패한 작업을 조회하고 수동으로 재시도할 수 있습니다.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => utils.system.getFailedBatchCompletionRetries.invalidate()}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              새로고침
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!failedTasks || failedTasks.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">실패한 작업이 없습니다.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>작업 ID</TableHead>
                  <TableHead>배치 ID</TableHead>
                  <TableHead>작업 유형</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>재시도 횟수</TableHead>
                  <TableHead>최대 재시도</TableHead>
                  <TableHead>오류 메시지</TableHead>
                  <TableHead>생성 시간</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedTasks.map((task: any) => (
                  <TableRow key={task.id}>
                    <TableCell className="font-medium">{task.id}</TableCell>
                    <TableCell>{task.batchId}</TableCell>
                    <TableCell>{getTaskTypeBadge(task.taskType)}</TableCell>
                    <TableCell>{getStatusBadge(task.status)}</TableCell>
                    <TableCell>{task.retryCount}</TableCell>
                    <TableCell>{task.maxRetries}</TableCell>
                    <TableCell className="max-w-xs truncate" title={task.errorMessage || ""}>
                      {task.errorMessage || "-"}
                    </TableCell>
                    <TableCell>
                      {task.createdAt ? new Date(task.createdAt).toLocaleString("ko-KR") : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRetry(task.id)}
                          disabled={retryMutation.isPending}
                        >
                          <RefreshCw className="h-4 w-4 mr-1" />
                          재시도
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(task.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          삭제
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
