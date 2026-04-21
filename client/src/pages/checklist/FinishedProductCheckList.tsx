import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";
import { Plus, FileText, Trash2, Edit, Send, Loader2, Printer, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

/** 완제품 출고검사 리스트 - 임베드 가능한 컴포넌트 */
export function FinishedProductCheckListContent() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();
  const [searchDate, setSearchDate] = useState("");

  const { data: records, isLoading, refetch } = trpc.genericChecklist.list.useQuery({
    formType: "finished_product_check",
  });

  const deleteMutation = trpc.genericChecklist.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "기록이 삭제되었습니다." });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  const submitMutation = trpc.genericChecklist.submitForReview.useMutation({
    onSuccess: () => {
      sonnerToast.success("승인 요청 완료");
      refetch();
    },
    onError: (error: { message: string }) => {
      sonnerToast.error("승인 요청 실패: " + error.message);
    },
  });

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleApprovalRequest = (record: any, e: React.MouseEvent) => {
    e.stopPropagation();
    submitMutation.mutate({
      id: record.id,
      requestType: "finished_product_check",
      title: `완제품 출고검사 - ${record.formDate}`,
      description: `${record.formDate} 완제품 출고검사일지\n${record.title || ''}\n[검토 필요]`,
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft": return <Badge variant="outline" className="text-xs">작성중</Badge>;
      case "submitted": return <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">승인대기</Badge>;
      case "approved": return <Badge variant="default" className="text-xs bg-green-100 text-green-800">승인완료</Badge>;
      case "rejected": return <Badge variant="destructive" className="text-xs">반려</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const filteredRecords = records?.filter((r: any) => {
    if (searchDate && !r.formDate?.startsWith(searchDate)) return false;
    return true;
  }) || [];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileText className="h-5 w-5 text-green-600" />
            완제품 출고검사 일지
          </h2>
          <p className="text-sm text-muted-foreground mt-1">완제품 출고 시 품질 검사 기록을 관리합니다</p>
        </div>
        <Button onClick={() => navigate("/finished-product-check/new")} className="gap-1">
          <Plus className="h-4 w-4" />
          신규 작성
        </Button>
      </div>

      {/* 필터 */}
      <div className="flex items-center gap-3">
        <Input type="month" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className="w-44 h-9" placeholder="월 선택" />
        {searchDate && (
          <Button variant="outline" size="sm" onClick={() => setSearchDate("")}>초기화</Button>
        )}
      </div>

      {/* 리스트 */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3" />
              로딩 중...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-12 text-center">No.</TableHead>
                  <TableHead className="w-32">작성일</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead className="text-center w-24">상태</TableHead>
                  <TableHead className="w-56 text-center">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.length > 0 ? (
                  filteredRecords.map((record: any, index: number) => (
                    <TableRow key={record.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/finished-product-check/${record.id}`)}>
                      <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{record.formDate}</TableCell>
                      <TableCell>{record.title || "-"}</TableCell>
                      <TableCell className="text-center">{getStatusBadge(record.status)}</TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1 justify-center">
                          {record.status === "draft" && (
                            <Button variant="default" size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                              onClick={(e) => handleApprovalRequest(record, e)}
                              disabled={submitMutation.isPending}>
                              {submitMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                              승인요청
                            </Button>
                          )}
                          {record.status === "approved" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs"
                              onClick={() => navigate(`/finished-product-check/${record.id}`)}>
                              <Printer className="h-3 w-3 mr-1" />출력
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-7 text-xs"
                            onClick={() => navigate(`/finished-product-check/${record.id}`)}>
                            <Eye className="h-3 w-3 mr-1" />{record.status === "draft" ? "수정" : "보기"}
                          </Button>
                          {record.status === "draft" && (
                            <Button variant="destructive" size="sm" className="h-7 text-xs"
                              onClick={(e) => handleDelete(record.id, e)}>
                              <Trash2 className="h-3 w-3 mr-1" />삭제
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                      <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/30" />
                      <p className="font-medium">등록된 출고검사 기록이 없습니다.</p>
                      <Button variant="link" className="mt-2" onClick={() => navigate("/finished-product-check/new")}>
                        새로운 기록 작성하기
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Standalone page (wrapped with DashboardLayout) */
export default function FinishedProductCheckList() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <FinishedProductCheckListContent />
      </div>
    </DashboardLayout>
  );
}
