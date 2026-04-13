import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { AlertCircle, CheckCircle, Clock, FileText } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

const statusLabels: Record<string, string> = {
  open: "열림",
  investigating: "조사 중",
  action_planned: "조치 계획",
  action_taken: "조치 완료",
  verifying: "검증 중",
  closed: "완료",
};

const statusColors: Record<string, string> = {
  open: "destructive",
  investigating: "default",
  action_planned: "secondary",
  action_taken: "default",
  verifying: "default",
  closed: "default",
};

const priorityLabels: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  critical: "긴급",
};

const priorityColors: Record<string, string> = {
  low: "default",
  medium: "secondary",
  high: "default",
  critical: "destructive",
};

export default function CorrectiveActionList() {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  
  const { data: allActions, isLoading: allLoading } = trpc.correctiveAction.list.useQuery(undefined, {
    enabled: !selectedStatus,
  });
  
  const { data: filteredActions, isLoading: filteredLoading } = trpc.correctiveAction.listByStatus.useQuery(
    { status: selectedStatus as any },
    { enabled: !!selectedStatus }
  );

  const actions = selectedStatus ? filteredActions : allActions;
  const isLoading = selectedStatus ? filteredLoading : allLoading;

  const statusOptions = [
    { value: null, label: "전체" },
    { value: "open", label: "열림" },
    { value: "investigating", label: "조사 중" },
    { value: "action_planned", label: "조치 계획" },
    { value: "action_taken", label: "조치 완료" },
    { value: "verifying", label: "검증 중" },
    { value: "closed", label: "완료" },
  ];

  return (
    <DashboardLayout>

    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">시정 조치 관리</h1>
          <p className="text-muted-foreground mt-1">
            CCP 이탈 및 품질 문제에 대한 시정 조치 현황을 관리합니다
          </p>
        </div>
      </div>

      {/* 상태 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>상태 필터</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map((option) => (
              <Button
                key={option.value || "all"}
                variant={selectedStatus === option.value ? "default" : "outline"}
                onClick={() => setSelectedStatus(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 시정 조치 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>시정 조치 목록</CardTitle>
          <CardDescription>
            {actions?.length || 0}건의 시정 조치 요청이 있습니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : !actions || actions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              시정 조치 요청이 없습니다
            </div>
          ) : (
            <>
              {/* 데스크톱 테이블 */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>제목</TableHead>
                      <TableHead>우선순위</TableHead>
                      <TableHead>상태</TableHead>
                      <TableHead>발생일</TableHead>
                      <TableHead>마감일</TableHead>
                      <TableHead>작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actions.map((action: any) => (
                      <TableRow key={action.id}>
                        <TableCell className="font-medium">#{action.id}</TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate">{action.title}</div>
                          <div className="text-sm text-muted-foreground">
                            {action.sourceType === "ccp_deviation" && "CCP 이탈"}
                            {action.sourceType === "quality_issue" && "품질 문제"}
                            {action.sourceType === "audit_finding" && "감사 발견"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={priorityColors[action.priority] as any}>
                            {priorityLabels[action.priority]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusColors[action.status] as any}>
                            {statusLabels[action.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(action.occurredAt).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>
                          {action.actionDueDate
                            ? new Date(action.actionDueDate).toLocaleDateString("ko-KR")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <Link href={`/corrective-action/${action.id}`}>
                            <Button variant="outline" size="sm">
                              <FileText className="h-4 w-4 mr-1" />
                              상세
                            </Button>
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 모바일 카드 */}
              <div className="md:hidden space-y-4">
                {actions.map((action: any) => (
                  <Card key={action.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <CardTitle className="text-base">
                            #{action.id} {action.title}
                          </CardTitle>
                          <CardDescription className="text-sm">
                            {action.sourceType === "ccp_deviation" && "CCP 이탈"}
                            {action.sourceType === "quality_issue" && "품질 문제"}
                            {action.sourceType === "audit_finding" && "감사 발견"}
                          </CardDescription>
                        </div>
                        <Badge variant={priorityColors[action.priority] as any} className="ml-2">
                          {priorityLabels[action.priority]}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">상태</span>
                        <Badge variant={statusColors[action.status] as any}>
                          {statusLabels[action.status]}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">발생일</span>
                        <span>{new Date(action.occurredAt).toLocaleDateString("ko-KR")}</span>
                      </div>
                      {action.actionDueDate && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">마감일</span>
                          <span>{new Date(action.actionDueDate).toLocaleDateString("ko-KR")}</span>
                        </div>
                      )}
                      <Link href={`/corrective-action/${action.id}`}>
                        <Button variant="outline" size="sm" className="w-full">
                          <FileText className="h-4 w-4 mr-1" />
                          상세 보기
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  
    </DashboardLayout>
  );
}
