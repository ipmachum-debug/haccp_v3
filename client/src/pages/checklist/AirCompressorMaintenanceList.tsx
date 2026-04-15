import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";
import { Plus, Search, FileText, Trash2, Edit , Send} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AirCompressorMaintenanceList() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();
  const [searchDate, setSearchDate] = useState("");
  const { data: records, isLoading, refetch } = trpc.genericChecklist.list.useQuery({
    formType: "air_compressor_maintenance",
  });
  const deleteMutation = trpc.genericChecklist.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "기록이 삭제되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });
  const approvalMutation = trpc.approval.createRequest.useMutation({
    onSuccess: () => {
      toast({ title: "승인 요청 완료", description: "승인관리 페이지에서 확인할 수 있습니다." });
      setTimeout(() => navigate("/dashboard/approval"), 1500);
    },
    onError: (error: any) => {
      toast({ title: "승인 요청 실패", description: error.message, variant: "destructive" });
    },
  });
  const handleApprovalRequest = (record: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("승인을 요청하시겠습니까?")) {
      approvalMutation.mutate({
        requestType: "checklist_approval",
        referenceType: "generic_checklist",
        referenceId: record.id,
        title: record.title || "air_compressor_maintenance",
        description: "체크리스트 승인 요청",
      });
    }
  };
  const handleDelete = (id: number, e: React.MouseEvent) => {
    if (window.confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
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
    <DashboardLayout>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle className="text-xl">공기압축기 정비일지</CardTitle>
                  <CardDescription className="mt-1">작성된 기록을 관리합니다</CardDescription>
                </div>
              </div>
              <Button onClick={() => navigate("/air-compressor-maintenance/new")} className="gap-1">
                <Plus className="h-4 w-4" />
                신규 작성
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Input type="month" value={searchDate} onChange={(e) => setSearchDate(e.target.value)} className="w-44 h-9" placeholder="월 선택" />
              </div>
              <Button variant="outline" size="sm" onClick={() => setSearchDate("")}>
                초기화
              </Button>
            </div>
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3"></div>
                로딩 중...
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
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
                        <TableRow key={record.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/air-compressor-maintenance/${record.id}`)}>
                          <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">{record.formDate}</TableCell>
                          <TableCell>{record.title || "-"}</TableCell>
                          <TableCell className="text-center">{getStatusBadge(record.status)}</TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap gap-1 justify-center">
                              {record.status === "draft" && <Button variant="default" size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={(e) => handleApprovalRequest(record, e)}><Send className="h-3 w-3 mr-1" />승인요청</Button>}
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate(`/air-compressor-maintenance/${record.id}`)}><Edit className="h-3 w-3 mr-1" />수정</Button>
                              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={(e) => handleDelete(record.id, e)}><Trash2 className="h-3 w-3 mr-1" />삭제</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          등록된 기록이 없습니다.
                          <br />
                          <Button variant="link" className="mt-2" onClick={() => navigate("/air-compressor-maintenance/new")}>
                            새로운 기록 작성하기
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
