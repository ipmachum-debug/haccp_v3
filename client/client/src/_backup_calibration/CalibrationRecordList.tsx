import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Search, Edit, Trash2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function CalibrationRecordList() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [approvalStatus, setApprovalStatus] = useState<"draft" | "pending_review" | "approved" | "rejected" | undefined>();

  const { data: records, isLoading, refetch } = trpc.calibration.listRecords.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    approvalStatus,
  });

  const deleteMutation = trpc.calibration.deleteRecord.useMutation({
    onSuccess: () => {
      toast({
        title: "삭제 완료",
        description: "검교정 기록이 삭제되었습니다.",
      });
      refetch();
    },
    onError: (error) => {
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
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>검교정 기록 관리</CardTitle>
              <CardDescription>검교정 기록을 작성하고 관리합니다</CardDescription>
            </div>
            <Button onClick={() => setLocation("/calibration/records/new")}>
              <Plus className="mr-2 h-4 w-4" />
              새 기록 작성
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
          ) : records && records.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>설비코드</TableHead>
                  <TableHead>설비명</TableHead>
                  <TableHead>검교정구분</TableHead>
                  <TableHead>검교정일자</TableHead>
                  <TableHead>차기 검교정일자</TableHead>
                  <TableHead>결재상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((item) => (
                  <TableRow key={item.record.id}>
                    <TableCell className="font-medium">{item.equipment?.code || "-"}</TableCell>
                    <TableCell>{item.equipment?.name || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={item.equipment?.calibrationType === "certified" ? "default" : "secondary"}>
                        {item.equipment?.calibrationType === "certified" ? "공인기관" : "사내"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {item.record.calibrationDate instanceof Date ? item.record.calibrationDate.toISOString().split('T')[0] : item.record.calibrationDate}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {item.record.nextCalibrationDate instanceof Date ? item.record.nextCalibrationDate.toISOString().split('T')[0] : item.record.nextCalibrationDate}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(item.record.approvalStatus || "draft")}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setLocation(`/calibration/records/${item.record.id}`)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.record.id)}
                          disabled={deleteMutation.isPending || item.record.approvalStatus === "approved"}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p>등록된 검교정 기록이 없습니다.</p>
              <Button className="mt-4" onClick={() => setLocation("/calibration/records/new")}>
                <Plus className="mr-2 h-4 w-4" />
                첫 기록 작성하기
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
