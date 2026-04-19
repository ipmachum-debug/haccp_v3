import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";
import { Plus, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function CapaRecordList() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();

  const { data: records, isLoading, refetch } = trpc.capaRecord.list.useQuery({});

  const deleteMutation = trpc.capaRecord.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "개선조치(CAPA) 기록 기록이 삭제되었습니다." });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            개선조치(CAPA) 기록
          </CardTitle>
          <Button onClick={() => navigate("/capa-record/new")}>
            <Plus className="h-4 w-4 mr-2" />
            신규 등록
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CAPA 번호</TableHead>
                  <TableHead>발생일</TableHead>
                  <TableHead>문제 설명</TableHead>
                  <TableHead>시정 조치</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>우선순위</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records && records.length > 0 ? (
                  records.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.capaNumber || "-"}</TableCell>
                      <TableCell>{new Date(record.issueDate).toLocaleDateString()}</TableCell>
                      <TableCell>{record.problemDescription || "-"}</TableCell>
                      <TableCell>{record.correctiveAction || "-"}</TableCell>
                      <TableCell>{record.preventiveAction || "-"}</TableCell>
                      <TableCell>{record.status || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/capa-record/${record.id}`)}>수정</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(record.id)}>삭제</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      등록된 개선조치(CAPA) 기록 기록이 없습니다.
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
