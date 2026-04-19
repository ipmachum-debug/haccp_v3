/**
 * CCP 기록 목록 - 컴팩트 리스트 UI + 삭제 기능
 */
import { useState, useMemo } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "../../components/ui/dialog";
import { Link } from "wouter";
import {
  FileDown, Filter, Trash2, CheckSquare, Square, Eye,
  RefreshCw, Shield, Clock, AlertTriangle, CheckCircle2,
  Loader2, ClipboardCheck, Search, ListChecks
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  draft: { label: "작성중", color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
  submitted: { label: "제출됨", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  approved: { label: "승인됨", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected: { label: "반려됨", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const CCP_TYPE_COLORS: Record<string, string> = {
  "CCP-1B": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "CCP-2B": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "CCP-3B": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  "CCP-4P": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

export default function CcpRecords() {
  const [activeTab, setActiveTab] = useState<string>("all");
  const [filters, setFilters] = useState<{
    ccpType?: string;
    status?: "draft" | "submitted" | "approved" | "rejected";
    startDate?: string;
    endDate?: string;
    productId?: number;
  }>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // CCP 기록 조회
  const { data: ccpRecords, isLoading, refetch } = trpc.ccp.getAllRecords.useQuery({
    ccpType: filters.ccpType,
    status: filters.status,
  });

  // 제품 목록 조회
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);

  // 삭제 mutation
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

  // Excel export mutation
  const exportMutation = trpc.ccp.exportInspectionHistory.useMutation({
    onSuccess: (result: any) => {
      const byteCharacters = atob(result.file);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel 파일이 다운로드되었습니다");
    },
    onError: (error: { message: string }) => {
      toast.error(`Export 실패: ${error.message}`);
    },
  });

  // 필터링된 레코드
  const filteredRecords = useMemo(() => {
    let records = ccpRecords || [];
    if (filters.startDate) records = records.filter((r: any) => r.workDate && new Date(r.workDate) >= new Date(filters.startDate!));
    if (filters.endDate) records = records.filter((r: any) => r.workDate && new Date(r.workDate) <= new Date(filters.endDate!));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      records = records.filter((r: any) =>
        (r.ccpType || "").toLowerCase().includes(q) ||
        (r.productName || "").toLowerCase().includes(q) ||
        (r.batchCode || "").toLowerCase().includes(q)
      );
    }
    return records;
  }, [ccpRecords, filters.startDate, filters.endDate, searchQuery]);

  // 탭 변경
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setFilters((prev) => ({ ...prev, ccpType: value === "all" ? undefined : value }));
    setSelectedIds([]);
  };

  // 선택
  const toggleSelect = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const toggleSelectAll = () => {
    const allIds = filteredRecords.map((r: any) => r.id);
    setSelectedIds(allIds.length > 0 && allIds.every((id: number) => selectedIds.includes(id)) ? [] : allIds);
  };
  const allSelected = filteredRecords.length > 0 && filteredRecords.every((r: any) => selectedIds.includes(r.id));
  const selectedCount = filteredRecords.filter((r: any) => selectedIds.includes(r.id)).length;

  // 삭제
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) { toast.error("삭제할 항목을 선택해주세요"); return; }
    setDeleteDialogOpen(true);
  };

  const handleDeleteSingle = (id: number) => {
    setSelectedIds([id]);
    setDeleteDialogOpen(true);
  };

  const executeDelete = () => {
    bulkDeleteMutation.mutate({ instanceIds: selectedIds });
  };

  const handleExport = () => {
    exportMutation.mutate({
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      ccpType: filters.ccpType,
    });
  };

  const handleRefresh = () => { refetch(); toast.success("새로고침 완료"); };

  return (
    <DashboardLayout>
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-600" />CCP 기록
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">모든 배치의 CCP 점검 기록을 조회·관리합니다</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="h-3.5 w-3.5 mr-1" />필터
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport} disabled={exportMutation.isPending}>
            <FileDown className="h-3.5 w-3.5 mr-1" />Excel
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "전체", count: ccpRecords?.length ?? 0, color: "text-gray-600", bgColor: "bg-gray-50 dark:bg-gray-900/30" },
          { label: "작성중", count: ccpRecords?.filter((r: any) => r.status === "draft").length ?? 0, color: "text-yellow-600", bgColor: "bg-yellow-50 dark:bg-yellow-900/30" },
          { label: "승인됨", count: ccpRecords?.filter((r: any) => r.status === "approved").length ?? 0, color: "text-green-600", bgColor: "bg-green-50 dark:bg-green-900/30" },
          { label: "반려됨", count: ccpRecords?.filter((r: any) => r.status === "rejected").length ?? 0, color: "text-red-600", bgColor: "bg-red-50 dark:bg-red-900/30" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="py-2 px-3 flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${s.bgColor}`}>
                <ClipboardCheck className={`h-3.5 w-3.5 ${s.color}`} />
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.count}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 필터 패널 */}
      {showFilters && (
        <Card className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500">시작일</label>
              <Input type="date" value={filters.startDate || ""} onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))} className="w-32 h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500">종료일</label>
              <Input type="date" value={filters.endDate || ""} onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))} className="w-32 h-8 text-xs" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500">상태</label>
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v === "all" ? undefined : v as any }))}>
                <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="draft">작성중</SelectItem>
                  <SelectItem value="submitted">제출됨</SelectItem>
                  <SelectItem value="approved">승인됨</SelectItem>
                  <SelectItem value="rejected">반려됨</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-500">검색</label>
              <Input placeholder="CCP유형/제품/배치..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-36 h-8 text-xs" />
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { setFilters({}); setSearchQuery(""); setActiveTab("all"); }}>초기화</Button>
          </div>
        </Card>
      )}

      {/* 탭 */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="all" className="text-xs px-2.5 py-1.5">전체</TabsTrigger>
          <TabsTrigger value="CCP-1B" className="text-xs px-2.5 py-1.5">CCP-1B</TabsTrigger>
          <TabsTrigger value="CCP-2B" className="text-xs px-2.5 py-1.5">CCP-2B</TabsTrigger>
          <TabsTrigger value="CCP-3B" className="text-xs px-2.5 py-1.5">CCP-3B</TabsTrigger>
          <TabsTrigger value="CCP-4P" className="text-xs px-2.5 py-1.5">CCP-4P</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-2">
          <Card>
            {/* 선택바 */}
            {filteredRecords.length > 0 && (
              <div className="flex items-center gap-2 py-1.5 px-3 flex-wrap border-b bg-muted/30">
                <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-blue-600">
                  {allSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                </button>
                <span className="text-xs text-muted-foreground">전체 ({filteredRecords.length}건)</span>
                {selectedCount > 0 && (
                  <div className="flex gap-1.5 ml-auto">
                    <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDeleteSelected} disabled={bulkDeleteMutation.isPending}>
                      <Trash2 className="h-3 w-3 mr-0.5" />삭제 ({selectedCount})
                    </Button>
                  </div>
                )}
              </div>
            )}

            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                  <p className="text-xs">로딩 중...</p>
                </div>
              ) : filteredRecords.length > 0 ? (
                filteredRecords.map((record: any) => {
                  const isSelected = selectedIds.includes(record.id);
                  const status = STATUS_BADGE[record.status] || STATUS_BADGE.draft;
                  const ccpColor = CCP_TYPE_COLORS[record.ccpType] || "bg-gray-100 text-gray-700";
                  const workDate = record.workDate ? new Date(record.workDate).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "-";
                  const createdDate = record.createdAt ? new Date(record.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : "-";

                  return (
                    <div key={record.id}
                      className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-accent/40 transition-colors text-sm ${isSelected ? "bg-blue-50/60 dark:bg-blue-950/10" : ""}`}
                    >
                      <button onClick={(e) => { e.stopPropagation(); toggleSelect(record.id); }} className="flex-shrink-0 text-muted-foreground hover:text-blue-600">
                        {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                      </button>

                      {/* 상태 */}
                      <Badge className={`${status.color} text-[10px] px-1 py-0 flex-shrink-0`}>
                        {status.label}
                      </Badge>

                      {/* CCP 유형 */}
                      <Badge className={`${ccpColor} text-[10px] px-1 py-0 flex-shrink-0`}>
                        {record.ccpType}
                      </Badge>

                      {/* 제품 + 메타 */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-sm">{record.productName || "제품 미지정"}</div>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>작업 {workDate}</span>
                          <span>· 생성 {createdDate}</span>
                          {record.batchCode && <span>· {record.batchCode}</span>}
                          <span className="text-gray-300">#{record.id}</span>
                        </div>
                      </div>

                      {/* 버튼 */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Link href={`/ccp-inspection/${record.id}`}>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="상세">
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                          onClick={() => handleDeleteSingle(record.id)} title="삭제">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">CCP 기록이 없습니다</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />CCP 기록 삭제
            </DialogTitle>
            <DialogDescription className="text-xs">
              {selectedIds.length}건의 CCP 기록을 삭제하시겠습니까? 관련 측정 행 데이터도 함께 삭제됩니다. 삭제된 데이터는 복구할 수 없습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-40 overflow-y-auto space-y-1 py-2">
            {(ccpRecords || []).filter((r: any) => selectedIds.includes(r.id)).slice(0, 20).map((r: any) => (
              <div key={r.id} className="text-xs text-gray-600 flex items-center gap-1.5 py-0.5">
                <Shield className="h-3 w-3 text-gray-400 flex-shrink-0" />
                <Badge className={`${CCP_TYPE_COLORS[r.ccpType] || ""} text-[9px] px-1 py-0`}>{r.ccpType}</Badge>
                <span className="truncate">{r.productName || "제품 미지정"}</span>
                <span className="text-gray-400">#{r.id}</span>
              </div>
            ))}
            {selectedIds.length > 20 && <p className="text-xs text-gray-400">...외 {selectedIds.length - 20}건</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(false)} disabled={bulkDeleteMutation.isPending}>취소</Button>
            <Button variant="destructive" size="sm" onClick={executeDelete} disabled={bulkDeleteMutation.isPending}>
              {bulkDeleteMutation.isPending ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />삭제 중...</> : <><Trash2 className="h-3.5 w-3.5 mr-1" />삭제 ({selectedIds.length})</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </DashboardLayout>
  );
}
