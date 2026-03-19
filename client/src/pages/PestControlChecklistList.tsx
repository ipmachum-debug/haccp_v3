import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Edit, Trash2, Calendar, Bug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PestControlChecklistList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<"draft" | "pending_review" | "approved" | "rejected" | undefined>();

  const { data: checklists, isLoading, refetch } = trpc.pestControl.list.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    approvalStatus,
  });

  const deleteMutation = trpc.pestControl.delete.useMutation({
    onSuccess: () => {
      toast({
        title: "삭제 완료",
        description: "체크리스트가 삭제되었습니다.",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary">임시저장</Badge>;
      case "pending_review":
        return <Badge variant="default">검토중</Badge>;
      case "approved":
        return <Badge className="bg-green-500">승인완료</Badge>;
      case "rejected":
        return <Badge variant="destructive">반려</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bug className="h-6 w-6" />
                방충·방서 점검표
              </CardTitle>
              <CardDescription>포충등/포서통 위치별 포획수를 기록하고 관리합니다</CardDescription>
            </div>
            <Button onClick={() => setLocation("/pest-control/checklists/new")}>
              <Plus className="mr-2 h-4 w-4" />
              새 점검표 작성
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* 검색 및 필터 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">시작일</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">종료일</label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">결재 상태</label>
              <Select
                value={approvalStatus || "all"}
                onValueChange={(value) => setApprovalStatus(value === "all" ? undefined : value as any)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="draft">임시저장</SelectItem>
                  <SelectItem value="pending_review">검토중</SelectItem>
                  <SelectItem value="approved">승인완료</SelectItem>
                  <SelectItem value="rejected">반려</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                  setApprovalStatus(undefined);
                }}
              >
                필터 초기화
              </Button>
            </div>
          </div>

          {/* 테이블 */}
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : checklists && checklists.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>점검 일자</TableHead>
                  <TableHead>점검자</TableHead>
                  <TableHead>확인자</TableHead>
                  <TableHead>결재상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checklists.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {item.checkDate instanceof Date ? item.checkDate.toISOString().split('T')[0] : item.checkDate}
                      </div>
                    </TableCell>
                    <TableCell>{item.inspector}</TableCell>
                    <TableCell>{item.confirmer || "-"}</TableCell>
                    <TableCell>{getStatusBadge(item.approvalStatus || "draft")}</TableCell>
                    <TableCell className="text-right"><div className="flex flex-wrap gap-1 justify-end">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation(`/pest-control/checklists/${item.id}`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          disabled={deleteMutation.isPending || item.approvalStatus === "approved"}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
</div>                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Bug className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>등록된 점검표가 없습니다.</p>
              <Button className="mt-4" onClick={() => setLocation("/pest-control/checklists/new")}>
                <Plus className="mr-2 h-4 w-4" />
                첫 점검표 작성하기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
