import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Plus, FileText, ArrowLeft, HeartPulse, Calendar, Trash2, Edit, Send, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function EmployeeHealthCheckList() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();
  const [searchDate, setSearchDate] = useState("");
  const [submittingId, setSubmittingId] = useState<number | null>(null);

  // genericChecklist API에서 employee_health_check 타입의 레코드 조회
  const { data: records, isLoading, refetch } = trpc.genericChecklist.list.useQuery({
    formType: "employee_health_check",
  });

  const deleteMutation = trpc.genericChecklist.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "종사자 건강상태 확인 일지가 삭제되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  // 승인 요청 mutation
  const submitForReviewMutation = trpc.genericChecklist.submitForReview.useMutation({
    onSuccess: () => {
      toast({ title: "승인 요청 완료", description: "검토자에게 승인 요청이 전송되었습니다." });
      setSubmittingId(null);
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "승인 요청 실패", description: error.message, variant: "destructive" });
      setSubmittingId(null);
    },
  });

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleSubmitForReview = (record: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("승인을 요청하시겠습니까?")) {
      setSubmittingId(record.id);
      submitForReviewMutation.mutate({
        id: record.id,
        requestType: "employee_health_check",
        title: record.title || `종사자 건강상태 확인 일지 - ${record.formDate}`,
        description: `작성일: ${record.formDate}`,
      });
    }
  };

  // 날짜 필터링
  const filteredRecords = records?.filter((record: any) => {
    if (!searchDate) return true;
    return record.formDate === searchDate;
  }) || [];

  // 승인 상태 표시
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-600 text-white text-xs">승인완료</Badge>;
      case "submitted":
        return <Badge className="bg-yellow-500 text-white text-xs">승인대기</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="text-xs">반려</Badge>;
      case "draft":
      default:
        return <Badge variant="outline" className="text-xs">작성중</Badge>;
    }
  };

  // 작성자 이름 추출
  const getWriterName = (record: any) => {
    try {
      const fd = record.formData as any;
      if (fd?.approval?.writerName) return fd.approval.writerName;
    } catch {}
    return "-";
  };

  // 점검 인원 추출
  const getEmployeeCount = (record: any) => {
    try {
      const fd = record.formData as any;
      if (fd?.employeeRows) {
        return fd.employeeRows.filter((r: any) => r.name && r.name.trim()).length;
      }
    } catch {}
    return 0;
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 max-w-[1200px]">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={() => navigate("/quality/checklists")}>
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  체크리스트
                </Button>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <HeartPulse className="h-5 w-5 text-pink-600" />
                    종사자 건강상태 확인 일지
                  </CardTitle>
                  <CardDescription className="mt-1">
                    작업장 출입 전 종사자 건강상태를 확인하고 기록합니다
                  </CardDescription>
                </div>
              </div>
              <Button onClick={() => navigate("/employee-health-check/new")} className="gap-1">
                <Plus className="h-4 w-4" />
                신규 작성
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* 검색 필터 */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                  className="w-40 h-9"
                />
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
                      <TableHead className="w-28">작성일</TableHead>
                      <TableHead>제목</TableHead>
                      <TableHead className="w-20 text-center">작성자</TableHead>
                      <TableHead className="w-20 text-center">점검인원</TableHead>
                      <TableHead className="w-24 text-center">승인 상태</TableHead>
                      <TableHead className="w-52 text-center">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.length > 0 ? (
                      filteredRecords.map((record: any, index: number) => (
                        <TableRow
                          key={record.id}
                          className="hover:bg-muted/30 cursor-pointer"
                          onClick={() => navigate(`/employee-health-check/${record.id}`)}
                        >
                          <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium text-sm">
                            {record.formDate || new Date(record.createdAt).toLocaleDateString("ko-KR")}
                          </TableCell>
                          <TableCell className="text-sm">
                            {record.title || `종사자 건강상태 확인 일지 - ${record.formDate}`}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {getWriterName(record)}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {getEmployeeCount(record)}명
                          </TableCell>
                          <TableCell className="text-center">
                            {getStatusBadge(record.status)}
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap gap-1 justify-center">
                              {record.status === "draft" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs text-blue-600 border-blue-300 hover:bg-blue-50"
                                  onClick={(e) => handleSubmitForReview(record, e)}
                                  disabled={submittingId === record.id}
                                >
                                  {submittingId === record.id ? (
                                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                  ) : (
                                    <Send className="h-3 w-3 mr-1" />
                                  )}
                                  승인요청
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => navigate(`/employee-health-check/${record.id}`)}
                              >
                                <Edit className="h-3 w-3 mr-1" />
                                수정
                              </Button>
                              {record.status === "draft" && (
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={(e) => handleDelete(record.id, e)}
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  삭제
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          등록된 종사자 건강상태 확인 일지가 없습니다.
                          <br />
                          <Button variant="link" className="mt-2" onClick={() => navigate("/employee-health-check/new")}>
                            새로운 일지 작성하기
                          </Button>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* 하단 안내 */}
            {filteredRecords.length > 0 && (
              <div className="mt-3 text-sm text-muted-foreground">
                총 {filteredRecords.length}건의 기록이 있습니다.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
