import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";
import { Plus, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function WaterUsageCheckList() {
  const [, setLocation] = useLocation();
  const navigate = (path: string) => setLocation(path);
  const { toast } = useToast();

  const { data: records, isLoading, refetch } = trpc.waterUsageCheck.list.useQuery({});

  const deleteMutation = trpc.waterUsageCheck.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료", description: "용수 사용 점검 기록이 삭제되었습니다." });
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
            용수 사용 점검
          </CardTitle>
          <Button onClick={() => navigate("/water-usage-check/new")}>
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
                  <TableHead>사용 구역</TableHead>
                  <TableHead>용수 출처</TableHead>
                  <TableHead>사용량</TableHead>
                  <TableHead>점검 결과</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records && records.length > 0 ? (
                  records.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell>{new Date(record.checkDate).toLocaleDateString()}</TableCell>
                      <TableCell>{record.usageArea || "-"}</TableCell>
                      <TableCell>{record.waterSource || "-"}</TableCell>
                      <TableCell>{record.usageAmount || "-"}</TableCell>
                      <TableCell>{record.checkResult || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/water-usage-check/${record.id}`)}>수정</Button>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(record.id)}>삭제</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      등록된 용수 사용 점검 기록이 없습니다.
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
