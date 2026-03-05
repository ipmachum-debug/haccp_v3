import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { Plus, FileText, Search, ArrowLeft, UserCheck, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function PersonalHygieneCheckList() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();
  const [searchDate, setSearchDate] = useState("");

  const { data: records, isLoading, refetch } = trpc.personalHygieneCheck.list.useQuery({});

  const deleteMutation = trpc.personalHygieneCheck.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "개인위생 점검 기록이 삭제되었습니다." });
      refetch();
    },
    onError: (error: any) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
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
                    <UserCheck className="h-5 w-5 text-purple-600" />
                    개인 위생관리 점검표
                  </CardTitle>
                  <CardDescription className="mt-1">
                    K-HACCP 표준 양식에 맞춰 개인위생 점검 기록을 관리합니다
                  </CardDescription>
                </div>
              </div>
              <Button onClick={() => navigate("/personal-hygiene-check/new")} className="gap-1">
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
              <Button variant="outline" size="sm">
                <Search className="h-4 w-4 mr-1" />
                검색
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
                      <TableHead className="w-32">점검일</TableHead>
                      <TableHead>점검자</TableHead>
                      <TableHead className="text-center">점검 인원</TableHead>
                      <TableHead className="text-center">점검 결과</TableHead>
                      <TableHead className="text-center">승인 상태</TableHead>
                      <TableHead className="w-32 text-center">작업</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records && records.length > 0 ? (
                      records.map((record: any, index: number) => (
                        <TableRow key={record.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/personal-hygiene-check/${record.id}`)}>
                          <TableCell className="text-center text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">{new Date(record.checkDate).toLocaleDateString("ko-KR")}</TableCell>
                          <TableCell>{record.inspectorId || "-"}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={record.checkResult === "pass" ? "default" : "destructive"} className="text-xs">
                              {record.checkResult === "pass" ? "적합" : "부적합"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">
                              작성완료
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-wrap gap-1 justify-center">
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate(`/personal-hygiene-check/${record.id}`)}>
                                수정
                              </Button>
                              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => handleDelete(record.id)}>
                                삭제
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          등록된 개인위생 점검 기록이 없습니다.
                          <br />
                          <Button variant="link" className="mt-2" onClick={() => navigate("/personal-hygiene-check/new")}>
                            새로운 점검표 작성하기
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
