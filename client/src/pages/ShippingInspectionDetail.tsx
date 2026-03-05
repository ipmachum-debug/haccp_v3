import { useState } from "react";
import { useParams, useLocation } from "wouter";
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
import { ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

export default function ShippingInspectionDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const inspectionId = params.id ? parseInt(params.id, 10) : 0;

  const { data: inspection, isLoading, refetch } = trpc.inspection.shipping.getById.useQuery({ id: inspectionId });

  const updateStatusMutation = trpc.inspection.shipping.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("검사 상태가 변경되었습니다");
      refetch();
    },
    onError: (error) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  const handleStatusChange = (newStatus: "pending" | "completed" | "rejected") => {
    if (confirm(`검사 상태를 "${getStatusLabel(newStatus)}"(으)로 변경하시겠습니까?`)) {
      updateStatusMutation.mutate({ id: inspectionId, status: newStatus });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pending: "secondary",
      completed: "default",
      rejected: "destructive",
    };
    const labels: Record<string, string> = {
      pending: "대기",
      completed: "완료",
      rejected: "반려",
    };
    return (
    <DashboardLayout>

      <Badge variant={variants[status] || "default"}>
        {labels[status] || status}
      </Badge>
    
    </DashboardLayout>
  );
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: "대기",
      completed: "완료",
      rejected: "반려",
    };
    return labels[status] || status;
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return <Badge variant="secondary">미검사</Badge>;
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      pass: "default",
      fail: "destructive",
      na: "secondary",
    };
    const labels: Record<string, string> = {
      pass: "합격",
      fail: "불합격",
      na: "해당없음",
    };
    return (
      <Badge variant={variants[result] || "secondary"}>
        {labels[result] || result}
      </Badge>
    );
  };

  const getPassedIcon = (passed: boolean | null) => {
    if (passed === null) return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
    return passed ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : (
      <XCircle className="h-4 w-4 text-red-600" />
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!inspection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">검사 기록을 찾을 수 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/dashboard/inspections/shipping")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">출하 검사 상세</h1>
            <p className="text-muted-foreground mt-1">
              검사 ID: {inspection.id}
            </p>
          </div>
        </div>
        {getStatusBadge(inspection.status)}
      </div>

      {/* 기본 정보 */}
      <Card>
        <CardHeader>
          <CardTitle>검사 기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">제품명</p>
              <p className="text-lg font-semibold">{inspection.productName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">배치 코드</p>
              <p className="text-lg">{inspection.batchCode}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">검사일</p>
              <p className="text-lg">{new Date(inspection.inspectionDate).toLocaleDateString('ko-KR')}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">검사자</p>
              <p className="text-lg">{inspection.inspectorName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">수량</p>
              <p className="text-lg">{inspection.quantity || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">검사 결과</p>
              <div className="mt-1">{getResultBadge(inspection.inspectionResult)}</div>
            </div>
          </div>
          {inspection.notes && (
            <div className="mt-4">
              <p className="text-sm font-medium text-muted-foreground">비고</p>
              <p className="text-base mt-1">{inspection.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 검사 항목 */}
      <Card>
        <CardHeader>
          <CardTitle>검사 항목</CardTitle>
          <CardDescription>
            총 {inspection.items?.length || 0}개 항목
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">순서</TableHead>
                <TableHead>항목명</TableHead>
                <TableHead>기준</TableHead>
                <TableHead>결과</TableHead>
                <TableHead className="w-[100px] text-center">합격 여부</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inspection.items && inspection.items.length > 0 ? (
                inspection.items.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.sortOrder}</TableCell>
                    <TableCell className="font-medium">{item.itemName}</TableCell>
                    <TableCell>{item.standard}</TableCell>
                    <TableCell>{item.result}</TableCell>
                    <TableCell className="text-center">
                      {getPassedIcon(item.passed)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    검사 항목이 없습니다
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 상태 변경 */}
      <Card>
        <CardHeader>
          <CardTitle>상태 변경</CardTitle>
          <CardDescription>
            검사 상태를 변경할 수 있습니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant={inspection.status === "pending" ? "default" : "outline"}
              onClick={() => handleStatusChange("pending")}
              disabled={updateStatusMutation.isPending || inspection.status === "pending"}
            >
              대기
            </Button>
            <Button
              variant={inspection.status === "completed" ? "default" : "outline"}
              onClick={() => handleStatusChange("completed")}
              disabled={updateStatusMutation.isPending || inspection.status === "completed"}
            >
              완료
            </Button>
            <Button
              variant={inspection.status === "rejected" ? "default" : "outline"}
              onClick={() => handleStatusChange("rejected")}
              disabled={updateStatusMutation.isPending || inspection.status === "rejected"}
            >
              반려
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
