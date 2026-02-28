import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";
import { Plus, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ForeignMaterialRecordList() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();

  const { data: records, isLoading, refetch } = trpc.foreignMaterialRecord.list.useQuery({});

  const deleteMutation = trpc.foreignMaterialRecord.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "이물 관리 기록 기록이 삭제되었습니다." });
      refetch();
    },
    onError: (error) => {
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            이물 관리 기록
          </CardTitle>
          <Button onClick={() => navigate("/foreign-material-record/new")}>
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
                  <TableHead>발견일</TableHead>
                  <TableHead>발견 위치</TableHead>
                  <TableHead>이물 유형</TableHead>
                  <TableHead>심각도</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records && records.length > 0 ? (
                  records.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell>{new Date(record.detectionDate).toLocaleDateString()}</TableCell>
                      <TableCell>{record.detectionLocation || "-"}</TableCell>
                      <TableCell>{record.materialType || "-"}</TableCell>
                      <TableCell>{record.severity || "-"}</TableCell>
                      <TableCell>{record.status || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/foreign-material-record/${record.id}`)}>수정</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(record.id)}>삭제</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      등록된 이물 관리 기록 기록이 없습니다.
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
