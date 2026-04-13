/**
 * 일일일지 목록 페이지 (일반위생관리 및 공정점검표)
 * - h_generic_checklist_records (form_type='daily_log') 기반
 * - 위생점검, 이물관리, 온도기록 상태 표시
 * - 해당일 생산품목 표시
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CalendarIcon, FileText, Search, RefreshCw, ChevronLeft, ChevronRight,
  ClipboardCheck, CheckCircle, Clock, AlertTriangle, Eye, Trash2, Thermometer, ShieldCheck
} from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: "작성중", color: "bg-gray-100 text-gray-700 border-gray-300" },
  submitted: { label: "제출됨", color: "bg-blue-100 text-blue-700 border-blue-300" },
  approved: { label: "승인완료", color: "bg-green-100 text-green-700 border-green-300" },
  rejected: { label: "반려", color: "bg-red-100 text-red-700 border-red-300" },
  pending_review: { label: "검토대기", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  pending_approval: { label: "승인대기", color: "bg-orange-100 text-orange-700 border-orange-300" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || { label: status, color: "bg-gray-100 text-gray-600" };
  return <Badge variant="outline" className={`text-xs ${s.color}`}>{s.label}</Badge>;
}

export default function DailyLogs() {
  const [, navigate] = useLocation();
  const today = new Date();

  // Filters
  const [startDate, setStartDate] = useState(() => format(startOfMonth(today), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(() => format(endOfMonth(today), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [keyword, setKeyword] = useState("");

  // API Query
  const utils = trpc.useUtils();
  const { data: dailyLogs = [], isLoading, refetch } = trpc.dailyLog.list.useQuery({
    startDate,
    endDate,
    status: statusFilter !== "all" ? statusFilter : undefined,
    limit: 100,
    offset: 0
  });
  const deleteMut = trpc.dailyLog.delete.useMutation({
    onSuccess: () => { utils.dailyLog.list.invalidate(); },
    onError: (e: any) => alert(`삭제 실패: ${e.message}`),
  });
  const handleDelete = (id: number, title: string, status: string) => {
    if (status === 'approved') { alert('승인완료된 일지는 삭제할 수 없습니다.'); return; }
    if (!confirm(`"${title}" 일일일지를 삭제하시겠습니까?\n\n※ 관련 승인요청도 함께 삭제됩니다.`)) return;
    deleteMut.mutate({ id });
  };

  // Filter by keyword
  const filteredLogs = useMemo(() => {
    if (!keyword) return dailyLogs;
    const kw = keyword.toLowerCase();
    return dailyLogs.filter((log: any) =>
      (log.title || "").toLowerCase().includes(kw) ||
      (log.log_date || "").includes(kw) ||
      (log.creator_name || "").toLowerCase().includes(kw)
    );
  }, [dailyLogs, keyword]);

  // Stats
  const totalCount = filteredLogs.length;
  const approvedCount = filteredLogs.filter((l: any) => l.status === "approved" || l.approval_status === "approved").length;
  const draftCount = filteredLogs.filter((l: any) => l.status === "draft").length;
  const pendingCount = filteredLogs.filter((l: any) => l.status === "submitted" || l.approval_status === "pending_review").length;

  // Quick date navigation
  const goToMonth = (offset: number) => {
    const base = new Date(startDate);
    base.setMonth(base.getMonth() + offset);
    setStartDate(format(startOfMonth(base), "yyyy-MM-dd"));
    setEndDate(format(endOfMonth(base), "yyyy-MM-dd"));
  };

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-blue-600" />
            일일일지 (일반위생관리 및 공정점검표)
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            일반위생관리, 이물관리, 온습도 점검 기록을 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            새로고침
          </Button>
          <Button size="sm" onClick={() => navigate("/daily-log/daily")}>
            <FileText className="h-4 w-4 mr-1" />
            새 일지 작성
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 일지</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">승인완료</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">작성중</CardTitle>
            <Clock className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-600">{draftCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">검토/승인 대기</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-[150px] h-8 text-sm"
                />
                <span className="text-muted-foreground">~</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[150px] h-8 text-sm"
                />
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goToMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 text-sm">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="draft">작성중</SelectItem>
                <SelectItem value="submitted">제출됨</SelectItem>
                <SelectItem value="approved">승인완료</SelectItem>
                <SelectItem value="rejected">반려</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="날짜, 작성자 검색..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Logs Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">일일일지 목록 (일반위생관리 및 공정점검표)</CardTitle>
          <CardDescription>
            {startDate} ~ {endDate} 기간의 위생관리 점검 기록입니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              로딩 중...
            </div>
          ) : filteredLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead className="w-[120px]">일지 날짜</TableHead>
                    <TableHead className="w-[100px] text-center">위생점검</TableHead>
                    <TableHead className="w-[100px] text-center">이물관리</TableHead>
                    <TableHead className="w-[80px] text-center">온도기록</TableHead>
                    <TableHead className="w-[80px]">작성자</TableHead>
                    <TableHead className="w-[90px] text-center">상태</TableHead>
                    <TableHead className="w-[90px] text-center">승인상태</TableHead>
                    <TableHead className="w-[60px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log: any, idx: number) => (
                    <TableRow key={log.id} className="hover:bg-muted/50">
                      <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1">
                          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {log.log_date || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {log.hygieneTotal > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <ShieldCheck className={`h-3.5 w-3.5 ${log.hygieneChecked === log.hygieneTotal ? 'text-green-500' : 'text-orange-500'}`} />
                            <span className={`text-xs font-medium ${log.hygieneChecked === log.hygieneTotal ? 'text-green-600' : 'text-orange-600'}`}>
                              {log.hygieneChecked}/{log.hygieneTotal}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.foreignTotal > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <ShieldCheck className={`h-3.5 w-3.5 ${log.foreignChecked === log.foreignTotal ? 'text-green-500' : 'text-orange-500'}`} />
                            <span className={`text-xs font-medium ${log.foreignChecked === log.foreignTotal ? 'text-green-600' : 'text-orange-600'}`}>
                              {log.foreignChecked}/{log.foreignTotal}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {log.hasTemp ? (
                          <Thermometer className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{log.creator_name || "-"}</TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={log.status || "draft"} />
                      </TableCell>
                      <TableCell className="text-center">
                        {log.approval_status ? (
                          <StatusBadge status={log.approval_status} />
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => navigate(`/daily-log/daily?id=${log.id}&date=${log.log_date}`)}
                            title="상세 보기"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {log.status !== 'approved' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                              onClick={() => handleDelete(log.id, log.title, log.status)}
                              disabled={deleteMut.isPending}
                              title="삭제"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">해당 기간에 일일일지가 없습니다.</p>
              <p className="text-xs text-muted-foreground mt-1">
                [새 일지 작성] 버튼으로 일반위생관리 및 공정점검표를 작성하세요.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
