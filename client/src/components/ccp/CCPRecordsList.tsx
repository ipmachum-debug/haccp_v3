import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { Loader2, Eye, Shield, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "작성중", variant: "outline" },
  submitted: { label: "제출됨", variant: "secondary" },
  approved: { label: "승인됨", variant: "default" },
  rejected: { label: "반려됨", variant: "destructive" },
};

const CCP_TYPE_COLORS: Record<string, string> = {
  "CCP-1B": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "CCP-2B": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "CCP-3B": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "CCP-4P": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

export function CCPRecordsList() {
  const [filters, setFilters] = useState({
    ccpType: "all" as "all" | "CCP-1B" | "CCP-2B" | "CCP-3B" | "CCP-4P",
    status: "all" as "all" | "draft" | "submitted" | "approved" | "rejected",
    startDate: "",
    endDate: "",
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // h_ccp_instances 테이블에서 실제 배치 기반 CCP 기록 조회
  const { data: records, isLoading, refetch } = trpc.ccp.getAllRecords.useQuery({
    ccpType: filters.ccpType === "all" ? undefined : filters.ccpType,
    status: filters.status === "all" ? undefined : filters.status as any,
  });

  const bulkDeleteMutation = trpc.ccp.bulkDelete.useMutation({
    onSuccess: (data: any) => {
      toast.success("삭제 완료", { description: data.message });
      setSelectedIds([]);
      setDeleteDialogOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error("삭제 실패", { description: error.message });
    },
  });

  // 날짜 필터링 (클라이언트 사이드)
  const filteredRecords = useMemo(() => {
    let result = records || [];
    if (filters.startDate) {
      result = result.filter((r: any) => r.workDate && new Date(r.workDate) >= new Date(filters.startDate));
    }
    if (filters.endDate) {
      result = result.filter((r: any) => r.workDate && new Date(r.workDate) <= new Date(filters.endDate));
    }
    return result;
  }, [records, filters.startDate, filters.endDate]);

  const allIds = filteredRecords.map((r: any) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id: number) => selectedIds.includes(id));

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allIds);
    }
  };

  const executeDelete = () => {
    if (selectedIds.length === 0) return;
    bulkDeleteMutation.mutate({ instanceIds: selectedIds });
  };

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-red-600" />
              CCP 모니터링 기록
            </CardTitle>
            <CardDescription className="text-xs">
              배치 기반 CCP 점검 기록 조회 · 관리
            </CardDescription>
          </div>
          {selectedIds.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="h-8"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {selectedIds.length}건 삭제
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pb-4">
        {/* 필터 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="space-y-1">
            <Label htmlFor="ccpType" className="text-xs">CCP 유형</Label>
            <Select
              value={filters.ccpType}
              onValueChange={(value) => setFilters({ ...filters, ccpType: value as any })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="CCP-1B">CCP-1B</SelectItem>
                <SelectItem value="CCP-2B">CCP-2B</SelectItem>
                <SelectItem value="CCP-3B">CCP-3B</SelectItem>
                <SelectItem value="CCP-4P">CCP-4P</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="status" className="text-xs">상태</Label>
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value as any })}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="전체" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="draft">작성중</SelectItem>
                <SelectItem value="submitted">제출됨</SelectItem>
                <SelectItem value="approved">승인됨</SelectItem>
                <SelectItem value="rejected">반려됨</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="startDate" className="text-xs">시작일</Label>
            <Input
              id="startDate"
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="endDate" className="text-xs">종료일</Label>
            <Input
              id="endDate"
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">&nbsp;</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setFilters({ ccpType: "all", status: "all", startDate: "", endDate: "" }); setSelectedIds([]); }}
              className="w-full h-9"
            >
              초기화
            </Button>
          </div>
        </div>

        {/* 기록 목록 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filteredRecords.length > 0 ? (
          <div className="space-y-2">
            {/* 전체선택 */}
            <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={allSelected}
                onCheckedChange={toggleSelectAll}
                className="h-4 w-4"
              />
              <span>전체선택 ({filteredRecords.length}건)</span>
            </div>

            {filteredRecords.map((record: any) => {
              const statusInfo = STATUS_BADGE[record.status] || STATUS_BADGE.draft;
              const ccpColor = CCP_TYPE_COLORS[record.ccpType] || "";
              const workDate = record.workDate
                ? new Date(record.workDate).toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" })
                : "-";
              const createdDate = record.createdAt
                ? new Date(record.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })
                : "-";
              const isSelected = selectedIds.includes(record.id);

              return (
                <div
                  key={record.id}
                  className={`flex items-center gap-2 px-3 py-2 border rounded-md hover:bg-accent/40 transition-colors ${
                    isSelected ? "bg-accent/30 border-primary/30" : ""
                  }`}
                >
                  {/* 체크박스 */}
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(record.id)}
                    className="h-4 w-4 flex-shrink-0"
                  />

                  {/* 상태 */}
                  <Badge variant={statusInfo.variant} className="text-xs flex-shrink-0">
                    {statusInfo.label}
                  </Badge>

                  {/* CCP 유형 */}
                  <Badge className={`${ccpColor} text-xs flex-shrink-0`}>
                    {record.ccpType}
                  </Badge>

                  {/* 제품명 + 메타 */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{record.productName || "제품 미지정"}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span>작업일 {workDate}</span>
                      <span>· 생성 {createdDate}</span>
                      {record.batchCode && <span>· 배치 {record.batchCode}</span>}
                      <span className="text-gray-400">#{record.id}</span>
                    </div>
                  </div>

                  {/* 상세보기 */}
                  <Link href={`/dashboard/ccp/${record.id}`}>
                    <Button variant="ghost" size="sm" className="h-8 px-2">
                      <Eye className="h-4 w-4 mr-1" />
                      상세
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Shield className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">CCP 기록이 없습니다</p>
            <p className="text-xs mt-1">배치 생산 시 CCP 기록이 자동으로 생성됩니다</p>
          </div>
        )}
      </CardContent>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>CCP 기록 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 <strong>{selectedIds.length}건</strong>의 CCP 모니터링 기록을 삭제합니다.
              <br />
              관련된 점검 행(rows)도 함께 삭제되며, 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {bulkDeleteMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-1" /> 삭제 중...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-1" /> 삭제</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
