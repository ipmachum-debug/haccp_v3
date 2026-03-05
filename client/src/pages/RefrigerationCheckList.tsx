import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";
import { Plus, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function RefrigerationCheckList() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();

  const { data: records, isLoading, refetch } = trpc.refrigerationCheck.list.useQuery({});

  const deleteMutation = trpc.refrigerationCheck.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "냉동·냉장 설비 점검 기록이 삭제되었습니다." });
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
    <DashboardLayout>
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            냉동·냉장 설비 점검
          </CardTitle>
          <Button onClick={() => navigate("/refrigeration-check/new")}>
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
                  <TableHead>점검일</TableHead>
                  <TableHead>설비명</TableHead>
                  <TableHead>설비 유형</TableHead>
                  <TableHead>온도</TableHead>
                  <TableHead>점검 결과</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records && records.length > 0 ? (
                  records.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell>{new Date(record.checkDate).toLocaleDateString()}</TableCell>
                      <TableCell>{record.equipmentName || "-"}</TableCell>
                      <TableCell>{record.equipmentType || "-"}</TableCell>
                      <TableCell>{record.temperature || "-"}</TableCell>
                      <TableCell>{record.checkResult || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/refrigeration-check/${record.id}`)}>수정</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(record.id)}>삭제</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      등록된 냉동·냉장 설비 점검 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
