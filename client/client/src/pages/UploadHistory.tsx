/**
 * 업로드 이력 조회 페이지
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { History, FileSpreadsheet, CheckCircle, XCircle, AlertCircle, Trash2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const UPLOAD_TYPE_LABELS: Record<string, string> = {
  material: "원재료",
  supplier: "거래처",
  product: "제품",
};

export default function UploadHistory() {
  const [selectedType, setSelectedType] = useState<string>("all");
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [selectedErrors, setSelectedErrors] = useState<any[]>([]);

  // 업로드 이력 조회
  const { data: histories = [], refetch } = trpc.uploadHistory.getAll.useQuery();

  // 이력 삭제
  const deleteHistoryMutation = trpc.uploadHistory.delete.useMutation({
    onSuccess: () => {
      toast.success("이력이 삭제되었습니다");
      refetch();
    },
    onError: (error) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  // 필터링된 이력
  const filteredHistories = selectedType === "all"
    ? histories
    : histories.filter((h) => h.uploadType === selectedType);

  // 에러 상세 보기
  const handleViewErrors = (errors: any[]) => {
    setSelectedErrors(errors);
    setErrorDialogOpen(true);
  };

  // 이력 삭제
  const handleDelete = (id: number) => {
    if (confirm("이 이력을 삭제하시겠습니까?")) {
      deleteHistoryMutation.mutate({ id });
    }
  };

  return (
    <DashboardLayout>
      <div className="container py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <History className="h-8 w-8" />
              업로드 이력
            </h1>
            <p className="text-muted-foreground mt-1">
              일괄 업로드 기록을 조회하고 관리합니다
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>업로드 이력 목록</CardTitle>
                <CardDescription>
                  원재료, 거래처, 제품의 일괄 업로드 기록
                </CardDescription>
              </div>
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="타입 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="material">원재료</SelectItem>
                  <SelectItem value="supplier">거래처</SelectItem>
                  <SelectItem value="product">제품</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {filteredHistories.length === 0 ? (
              <div className="text-center py-12">
                <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">업로드 이력이 없습니다</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>타입</TableHead>
                    <TableHead>파일명</TableHead>
                    <TableHead>업로드자</TableHead>
                    <TableHead>전체</TableHead>
                    <TableHead>성공</TableHead>
                    <TableHead>실패</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>업로드 시간</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistories.map((history) => (
                    <TableRow key={history.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {UPLOAD_TYPE_LABELS[history.uploadType] || history.uploadType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{history.fileName}</TableCell>
                      <TableCell>{history.userName}</TableCell>
                      <TableCell>{history.totalCount}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          {history.successCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        {history.errorCount > 0 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleViewErrors(history.errors)}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            {history.errorCount}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {history.errorCount === 0 ? (
                          <Badge className="bg-green-500">완료</Badge>
                        ) : history.successCount > 0 ? (
                          <Badge className="bg-yellow-500">부분 성공</Badge>
                        ) : (
                          <Badge variant="destructive">실패</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {new Date(history.createdAt).toLocaleString("ko-KR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(history.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* 에러 상세 Dialog */}
        <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-red-500" />
                업로드 오류 상세
              </DialogTitle>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>행 번호</TableHead>
                    <TableHead>오류 메시지</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedErrors.map((error, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{error.row}</TableCell>
                      <TableCell className="text-red-600">{error.message || error.error}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
