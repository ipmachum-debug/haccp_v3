import { useState, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatLocalDate } from "../../lib/dateUtils";

import {
  Calendar,
  Download,
  FileText,
  CheckCircle,
  Clock,
  Package,
  TrendingUp,
  TrendingDown,
  Edit,
  Trash2,
  Lock,
  Unlock,
  RefreshCw,
  Search,
  AlertCircle,
  XCircle,
  Printer,
} from "lucide-react";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// 날짜 유틸
function formatDate(d: Date) {
  return formatLocalDate(d);
}
function getYearMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function getDaysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export default function MaterialLedger({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
  const L = useIndustryLabel();
  const [activeTab, setActiveTab] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [selectedMonth, setSelectedMonth] = useState(getYearMonth(new Date()));
  const [searchTerm, setSearchTerm] = useState("");
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    materialId: number;
    materialName: string;
    day: number;
    type: "receiving" | "usage";
    currentValue: number;
  } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [rejectDialog, setRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // ===== 기간 보고서 (주간/월간) =====
  // 이번 주 (월~일) 자동 계산
  const getThisWeekRange = () => {
    const now = new Date();
    const day = now.getDay(); // 0=일, 1=월
    const diffToMon = day === 0 ? -6 : 1 - day; // 월요일까지 차이
    const mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { start: formatDate(mon), end: formatDate(sun) };
  };
  // 이번 달 (1일~말일)
  const getThisMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: formatDate(start), end: formatDate(end) };
  };

  const initWeek = getThisWeekRange();
  const [reportType, setReportType] = useState<"week" | "month" | "custom">("week");
  const [reportStart, setReportStart] = useState(initWeek.start);
  const [reportEnd, setReportEnd] = useState(initWeek.end);

  // 보고서 데이터
  const { data: reportData, refetch: refetchReport, isFetching: reportLoading } =
    trpc.materialLedger.getUsageReport.useQuery(
      { start: reportStart, end: reportEnd, type: reportType },
      { enabled: !!reportStart && !!reportEnd },
    );

  // ========== 데이터 조회 ==========
  // 대시보드 요약 (선택된 월 기준)
  const { data: _dashboardRaw, refetch: refetchDashboard } =
    trpc.materialLedger.getDashboard.useQuery({ yearMonth: selectedMonth });
  const dashboard = _dashboardRaw as any;

  // 일일 데이터
  const { data: dailyData, refetch: refetchDaily } =
    trpc.materialLedger.getDaily.useQuery({ date: selectedDate });

  // 월별 데이터
  const { data: monthlyData, refetch: refetchMonthly } =
    trpc.materialLedger.getMonthly.useQuery({ yearMonth: selectedMonth });

  // 승인 상태
  const { data: approvalData, refetch: refetchApproval } =
    trpc.materialLedger.getApproval.useQuery({ yearMonth: selectedMonth });

  // ========== Mutations ==========
  // 수정
  const updateMutation = trpc.materialLedger.upsertDaily.useMutation({
    onSuccess: () => {
      toast.success("데이터가 수정되었습니다.");
      refetchDaily();
      refetchMonthly();
      refetchDashboard();
      setEditDialog(null);
    },
    onError: (err: { message: string }) => toast.error(`수정 실패: ${err.message}`),
  });

  // 월별 집계
  const aggregateMutation = trpc.materialLedger.aggregateMonthly.useMutation({
    onSuccess: () => {
      toast.success("월별 집계가 완료되었습니다.");
      refetchMonthly();
      refetchDashboard();
    },
    onError: (err: { message: string }) => toast.error(`집계 실패: ${err.message}`),
  });

  // 승인 요청
  const submitApprovalMutation = trpc.materialLedger.submitApproval.useMutation({
    onSuccess: () => {
      toast.success("승인 요청이 제출되었습니다.");
      refetchApproval();
    },
    onError: (err: { message: string }) => toast.error(`승인 요청 실패: ${err.message}`),
  });

  // 승인
  const approveMutation = trpc.materialLedger.approve.useMutation({
    onSuccess: () => {
      toast.success("월마감이 승인되었습니다.");
      refetchApproval();
      refetchMonthly();
    },
    onError: (err: { message: string }) => toast.error(`승인 실패: ${err.message}`),
  });

  // 반려
  const rejectMutation = trpc.materialLedger.reject.useMutation({
    onSuccess: () => {
      toast.success("월마감이 반려되었습니다.");
      refetchApproval();
      setRejectDialog(false);
      setRejectReason("");
    },
    onError: (err: { message: string }) => toast.error(`반려 실패: ${err.message}`),
  });

  // 엑셀 다운로드
  const downloadMutation = trpc.materialLedger.downloadExcel.useMutation({
    onSuccess: (data: any) => {
      // base64 → Blob → 다운로드
      const byteChars = atob(data.base64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || `원료수불부_${selectedMonth}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("엑셀 파일이 다운로드되었습니다.");
    },
    onError: (err: { message: string }) => toast.error(`다운로드 실패: ${err.message}`),
  });

  // ========== 필터링 ==========
  const filteredDailyData = useMemo(() => {
    if (!dailyData || !Array.isArray(dailyData)) return [];
    if (!searchTerm) return dailyData;
    return dailyData.filter((item: any) =>
      item.material_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [dailyData, searchTerm]);

  const filteredMonthlyData = useMemo(() => {
    if (!monthlyData || !Array.isArray(monthlyData)) return [];
    if (!searchTerm) return monthlyData;
    return monthlyData.filter((item: any) =>
      item.material_name?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [monthlyData, searchTerm]);

  // ========== 핸들러 ==========
  const handleEdit = (
    materialId: number,
    materialName: string,
    day: number,
    type: "receiving" | "usage",
    currentValue: number
  ) => {
    setEditDialog({ open: true, materialId, materialName, day, type, currentValue });
    setEditValue(String(currentValue || 0));
  };

  const handleSaveEdit = () => {
    if (!editDialog) return;
    const val = parseFloat(editValue);
    if (isNaN(val) || val < 0) {
      toast.error("올바른 숫자를 입력하세요.");
      return;
    }
    const dayStr = String(editDialog.day).padStart(2, "0");
    const dateStr = `${selectedMonth}-${dayStr}`;
    updateMutation.mutate({
      ledgerDate: dateStr,
      materialId: editDialog.materialId,
      receivingQty: editDialog.type === "receiving" ? val : undefined,
      usageQty: editDialog.type === "usage" ? val : undefined,
    });
  };

  const handleAggregate = () => {
    aggregateMutation.mutate({ yearMonth: selectedMonth });
  };

  const handleSubmitApproval = () => {
    submitApprovalMutation.mutate({ yearMonth: selectedMonth });
  };

  const handleApprove = () => {
    approveMutation.mutate({ yearMonth: selectedMonth });
  };

  const handleReject = () => {
    if (!rejectReason.trim()) {
      toast.error("반려 사유를 입력하세요.");
      return;
    }
    rejectMutation.mutate({ yearMonth: selectedMonth, reason: rejectReason });
  };

  const handleDownloadExcel = () => {
    downloadMutation.mutate({ yearMonth: selectedMonth });
  };

  // 기간 보고서 빠른 선택
  const handleSelectThisWeek = () => {
    const r = getThisWeekRange();
    setReportType("week");
    setReportStart(r.start);
    setReportEnd(r.end);
  };
  const handleSelectThisMonth = () => {
    const r = getThisMonthRange();
    setReportType("month");
    setReportStart(r.start);
    setReportEnd(r.end);
  };
  const handleSelectLastWeek = () => {
    const now = new Date();
    const day = now.getDay();
    const diffToMon = day === 0 ? -6 : 1 - day;
    const thisMon = new Date(now);
    thisMon.setDate(now.getDate() + diffToMon);
    const lastMon = new Date(thisMon);
    lastMon.setDate(thisMon.getDate() - 7);
    const lastSun = new Date(lastMon);
    lastSun.setDate(lastMon.getDate() + 6);
    setReportType("week");
    setReportStart(formatDate(lastMon));
    setReportEnd(formatDate(lastSun));
  };
  const handleSelectLastMonth = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    setReportType("month");
    setReportStart(formatDate(start));
    setReportEnd(formatDate(end));
  };
  // 인쇄 미리보기 새 창 열기
  const handlePrintReport = () => {
    if (!reportStart || !reportEnd) return;
    const url = `/material-usage-report-print?start=${reportStart}&end=${reportEnd}&type=${reportType}&autoprint=1`;
    window.open(url, "_blank", "width=900,height=1100");
  };

  // ========== 승인 상태 배지 ==========
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />작성 중</Badge>;
      case "submitted":
        return <Badge className="bg-yellow-500 text-white border-transparent"><FileText className="w-3 h-3 mr-1" />승인 대기</Badge>;
      case "approved":
        return <Badge className="bg-green-600 text-white border-transparent"><CheckCircle className="w-3 h-3 mr-1" />승인 완료</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />반려</Badge>;
      default:
        return <Badge variant="outline">미등록</Badge>;
    }
  };

  // ========== 월 선택 옵션 ==========
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(getYearMonth(d));
    }
    return options;
  }, []);

  const daysInMonth = getDaysInMonth(selectedMonth);

    const content = (
      <>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">원료수불부</h1>
            <p className="text-muted-foreground">
              원재료 입고/사용/재고 관리 및 월별 마감
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { refetchDashboard(); refetchDaily(); refetchMonthly(); }}>
              <RefreshCw className="w-4 h-4 mr-2" />새로고침
            </Button>
          </div>
        </div>

        {/* 대시보드 요약 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">관리 원재료</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard?.materialCount || 0}종</div>
              <p className="text-xs text-muted-foreground">{dashboard?.yearMonth || selectedMonth} 기준</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">당월 총 입고량</CardTitle>
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {Number(dashboard?.totalReceiving || 0).toLocaleString()} kg
              </div>
              <p className="text-xs text-muted-foreground">
                금액: {Number(dashboard?.totalReceivingAmount || 0).toLocaleString()}원
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">당월 총 사용량</CardTitle>
              <TrendingDown className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {Number(dashboard?.totalUsage || 0).toLocaleString()} kg
              </div>
              <p className="text-xs text-muted-foreground">
                금액: {Number(dashboard?.totalUsageAmount || 0).toLocaleString()}원
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">마감 상태</CardTitle>
              <Lock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">
                {getStatusBadge(dashboard?.approvalStatus || "draft")}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{dashboard?.yearMonth || selectedMonth}</p>
            </CardContent>
          </Card>
        </div>

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="daily">
              <Calendar className="w-4 h-4 mr-2" />일일 입출고
            </TabsTrigger>
            <TabsTrigger value="edit">
              <Edit className="w-4 h-4 mr-2" />월간 편집 / 마감
            </TabsTrigger>
            <TabsTrigger value="report">
              <Printer className="w-4 h-4 mr-2" />기간 보고서 (인쇄·엑셀)
            </TabsTrigger>
          </TabsList>

          {/* ========== 탭 1: 일일 확인 ========== */}
          <TabsContent value="daily" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>일일 원재료 현황</CardTitle>
                    <CardDescription>선택한 날짜의 원재료 입고/사용 내역을 확인합니다.</CardDescription>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-44"
                    />
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="원재료 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 w-48"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="w-12 text-center sticky left-0 bg-slate-50 z-10">No</TableHead>
                        <TableHead className="w-48 sticky left-12 bg-slate-50 z-10">원재료명</TableHead>
                        <TableHead className="text-right w-28">전월재고(kg)</TableHead>
                        <TableHead className="text-right w-28 text-blue-600">입고(kg)</TableHead>
                        <TableHead className="text-right w-28 text-green-600">사용(kg)</TableHead>
                        <TableHead className="text-right w-28">현재고(kg)</TableHead>
                        <TableHead className="text-right w-32">단가(원)</TableHead>
                        <TableHead className="text-right w-32">입고금액(원)</TableHead>
                        <TableHead className="text-right w-32">사용금액(원)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDailyData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            {selectedDate}에 해당하는 데이터가 없습니다.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredDailyData.map((item: any, idx: number) => (
                          <TableRow key={item.material_id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <TableCell className="text-center sticky left-0 bg-inherit z-10">{idx + 1}</TableCell>
                            <TableCell className="font-medium sticky left-12 bg-inherit z-10">{item.material_name}</TableCell>
                            <TableCell className="text-right">{Math.max(Number(item.prev_stock || 0), 0).toFixed(1)}</TableCell>
                            <TableCell className="text-right text-blue-600 font-medium">
                              {Math.max(Number(item.receiving_qty || 0), 0).toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-medium">
                              {Math.max(Number(item.usage_qty || 0), 0).toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {Math.max(Number(item.current_stock || 0), 0).toFixed(1)}
                            </TableCell>
                            <TableCell className="text-right">{Number(item.unit_price || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right text-blue-600">
                              {Number(item.receiving_amount || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-green-600">
                              {Number(item.usage_amount || 0).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== 탭 2: 수정 / 삭제 ========== */}
          <TabsContent value="edit" className="space-y-4">
            {/* === 월마감 승인 (interleaved) === */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">📋 월마감 승인</CardTitle>
                    <CardDescription className="text-xs">
                      월간 원료수불부를 잠그고 회계 마감용으로 확정합니다.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(approvalData?.status || "draft")}
                    {(!approvalData?.status || approvalData.status === "draft" || approvalData.status === "rejected") && (
                      <Button size="sm" onClick={handleSubmitApproval} className="bg-yellow-500 hover:bg-yellow-600">
                        <FileText className="w-3.5 h-3.5 mr-1" />승인 요청
                      </Button>
                    )}
                    {approvalData?.status === "submitted" && (
                      <>
                        <Button size="sm" onClick={handleApprove} className="bg-green-600 hover:bg-green-700">
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />승인
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => setRejectDialog(true)}>
                          <XCircle className="w-3.5 h-3.5 mr-1" />반려
                        </Button>
                      </>
                    )}
                    {approvalData?.status === "approved" && (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <Lock className="w-3.5 h-3.5" /> 잠김 (승인 완료)
                      </span>
                    )}
                  </div>
                </div>
                {approvalData?.reject_reason && (
                  <div className="mt-2 p-2 bg-red-50 rounded border border-red-200 text-xs text-red-700">
                    <strong>반려 사유:</strong> {approvalData.reject_reason}
                  </div>
                )}
              </CardHeader>
            </Card>

            {/* === 월별 편집 그리드 === */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>월별 원료수불부 편집</CardTitle>
                    <CardDescription>
                      일별 입고/사용 데이터를 수정하거나 삭제할 수 있습니다.
                      {approvalData?.status === "approved" && (
                        <span className="text-red-500 ml-2">
                          (승인 완료된 월은 수정할 수 없습니다)
                        </span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                      <SelectTrigger className="w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAggregate} variant="outline">
                      <RefreshCw className="w-4 h-4 mr-2" />집계 실행
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <div className="mb-3">
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="원재료 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="rounded-md border overflow-auto max-h-[600px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="w-12 text-center sticky left-0 bg-slate-50 z-20">No</TableHead>
                          <TableHead className="w-40 sticky left-12 bg-slate-50 z-20">원재료명</TableHead>
                          <TableHead className="text-right w-20 bg-gray-100">전월재고</TableHead>
                          {Array.from({ length: daysInMonth }, (_, i) => (
                            <TableHead key={`rh-${i}`} className="text-center w-16 text-blue-600 bg-blue-50 text-xs">
                              {i + 1}일<br />입고
                            </TableHead>
                          ))}
                          <TableHead className="text-right w-20 bg-blue-100 font-bold">입고합계</TableHead>
                          {Array.from({ length: daysInMonth }, (_, i) => (
                            <TableHead key={`uh-${i}`} className="text-center w-16 text-green-600 bg-green-50 text-xs">
                              {i + 1}일<br />사용
                            </TableHead>
                          ))}
                          <TableHead className="text-right w-20 bg-green-100 font-bold">사용합계</TableHead>
                          <TableHead className="text-right w-20 bg-orange-100 font-bold">월말재고</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMonthlyData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3 + daysInMonth * 2 + 3} className="text-center py-8 text-muted-foreground">
                              {selectedMonth}에 해당하는 데이터가 없습니다. 집계를 실행하세요.
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredMonthlyData.map((item: any, idx: number) => {
                            const isApproved = approvalData?.status === "approved";
                            return (
                              <TableRow key={item.material_id} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                                <TableCell className="text-center sticky left-0 bg-inherit z-10">{idx + 1}</TableCell>
                                <TableCell className="font-medium text-sm sticky left-12 bg-inherit z-10 whitespace-nowrap">
                                  {item.material_name}
                                </TableCell>
                                <TableCell className="text-right bg-gray-50">{Math.max(Number(item.prev_stock || 0), 0).toFixed(1)}</TableCell>
                                {Array.from({ length: daysInMonth }, (_, i) => {
                                  const dayKey = `receiving_day_${String(i + 1).padStart(2, "0")}`;
                                  const val = Number(item[dayKey] || 0);
                                  return (
                                    <TableCell
                                      key={`r-${i}`}
                                      className={`text-center text-xs cursor-pointer hover:bg-blue-100 transition-colors ${val > 0 ? "text-blue-700 font-medium bg-blue-50/50" : "text-gray-300"}`}
                                      onClick={() => !isApproved && handleEdit(item.material_id, item.material_name, i + 1, "receiving", val)}
                                    >
                                      {val > 0 ? val.toLocaleString() : "-"}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-right font-bold text-blue-700 bg-blue-50">
                                  {Number(item.receiving_total || 0).toLocaleString()}
                                </TableCell>
                                {Array.from({ length: daysInMonth }, (_, i) => {
                                  const dayKey = `usage_day_${String(i + 1).padStart(2, "0")}`;
                                  const val = Number(item[dayKey] || 0);
                                  return (
                                    <TableCell
                                      key={`u-${i}`}
                                      className={`text-center text-xs cursor-pointer hover:bg-green-100 transition-colors ${val > 0 ? "text-green-700 font-medium bg-green-50/50" : "text-gray-300"}`}
                                      onClick={() => !isApproved && handleEdit(item.material_id, item.material_name, i + 1, "usage", val)}
                                    >
                                      {val > 0 ? val.toLocaleString() : "-"}
                                    </TableCell>
                                  );
                                })}
                                <TableCell className="text-right font-bold text-green-700 bg-green-50">
                                  {Number(item.usage_total || 0).toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-bold text-orange-700 bg-orange-50">
                                  {Math.max(Number(item.end_stock || 0), 0).toFixed(1)}
                                </TableCell>
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ========== 탭 3: 기간 보고서 (주간/월간) ========== */}
          <TabsContent value="report" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>원료수불 기간 보고서</CardTitle>
                <CardDescription>
                  실제 생산(배치) 기준으로 사용된 원재료를 날짜 / 제품 / 품목제조번호별로 정리합니다.
                  주간 또는 월간 단위로 합계가 자동 계산되어 인쇄할 수 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 빠른 선택 */}
                <div className="flex flex-wrap gap-2 items-center">
                  <Label className="font-medium">빠른 선택:</Label>
                  <Button
                    size="sm"
                    variant={reportType === "week" ? "default" : "outline"}
                    onClick={handleSelectThisWeek}
                  >
                    이번 주
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleSelectLastWeek}>
                    지난 주
                  </Button>
                  <Button
                    size="sm"
                    variant={reportType === "month" ? "default" : "outline"}
                    onClick={handleSelectThisMonth}
                  >
                    이번 달
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleSelectLastMonth}>
                    지난 달
                  </Button>
                </div>

                {/* 커스텀 기간 */}
                <div className="flex flex-wrap gap-3 items-end">
                  <div>
                    <Label className="text-xs">시작일</Label>
                    <Input
                      type="date"
                      value={reportStart}
                      onChange={(e) => {
                        setReportStart(e.target.value);
                        setReportType("custom");
                      }}
                      className="w-44"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">종료일</Label>
                    <Input
                      type="date"
                      value={reportEnd}
                      onChange={(e) => {
                        setReportEnd(e.target.value);
                        setReportType("custom");
                      }}
                      className="w-44"
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => refetchReport()}
                    disabled={reportLoading}
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${reportLoading ? "animate-spin" : ""}`} />
                    조회
                  </Button>
                  <Button
                    onClick={handlePrintReport}
                    className="bg-blue-600 hover:bg-blue-700"
                    disabled={!reportData || (reportData?.totals?.batchCount ?? 0) === 0}
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    인쇄 미리보기
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadExcel}
                    disabled={downloadMutation.isPending}
                  >
                    {downloadMutation.isPending ? (
                      <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />생성 중...</>
                    ) : (
                      <><Download className="w-4 h-4 mr-2" />월간 엑셀 ({selectedMonth})</>
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      window.location.href = "/dashboard/accounting/material-usage-reports";
                    }}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    보고서 관리 (생성/검토/승인)
                  </Button>
                </div>

                {/* 요약 카드 */}
                {reportData && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                    <div className="p-3 rounded-lg border bg-slate-50">
                      <div className="text-xs text-muted-foreground">생산 배치</div>
                      <div className="text-xl font-bold">{reportData.totals?.batchCount ?? 0}건</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-slate-50">
                      <div className="text-xs text-muted-foreground">생산 제품</div>
                      <div className="text-xl font-bold">{reportData.totals?.productCount ?? 0}종</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-slate-50">
                      <div className="text-xs text-muted-foreground">사용 원재료</div>
                      <div className="text-xl font-bold">{reportData.totals?.materialCount ?? 0}종</div>
                    </div>
                    <div className="p-3 rounded-lg border bg-blue-50">
                      <div className="text-xs text-blue-700">총 사용량</div>
                      <div className="text-xl font-bold text-blue-700">
                        {Number(reportData.totals?.totalUsage || 0).toLocaleString()} kg
                      </div>
                    </div>
                  </div>
                )}

                {/* 미리보기: 원재료별 합계 */}
                {/* ★ 서버는 materialWeeklyTotal 필드로 반환 (materialSummary 아님) */}
                {reportData && (reportData.materialWeeklyTotal?.length ?? 0) > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-amber-50 px-3 py-2 text-sm font-medium border-b">
                      원재료별 사용 합계 (정제수 제외)
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 text-center">No</TableHead>
                          <TableHead>원재료 코드</TableHead>
                          <TableHead>원재료명</TableHead>
                          <TableHead className="text-right">총 사용량</TableHead>
                          <TableHead className="text-center">단위</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reportData.materialWeeklyTotal || []).map((m: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-center">{i + 1}</TableCell>
                            <TableCell>{m.materialCode || "-"}</TableCell>
                            <TableCell>{m.materialName}</TableCell>
                            <TableCell className="text-right">
                              {Number(m.totalQuantity || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-center">{m.unit || "kg"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* 미리보기: 날짜별 배치 (최대 5건만 표시) */}
                {reportData && (reportData.batches?.length ?? 0) > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-blue-50 px-3 py-2 text-sm font-medium border-b">
                      날짜별 배치 / 제품 / 원재료 사용 (인쇄용 보고서에 모두 포함됨)
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>일자</TableHead>
                          <TableHead>배치코드</TableHead>
                          <TableHead>제품명</TableHead>
                          <TableHead>품목제조번호</TableHead>
                          <TableHead className="text-right">실수량</TableHead>
                          <TableHead className="text-center">사용 원재료</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reportData.batches || []).slice(0, 30).map((b: any) => (
                          <TableRow key={b.batchId}>
                            <TableCell>{b.plannedDate}</TableCell>
                            <TableCell className="font-mono text-xs">{b.batchCode}</TableCell>
                            <TableCell>{b.productName}</TableCell>
                            <TableCell className="text-xs">{b.productCode || "-"}</TableCell>
                            <TableCell className="text-right">
                              {Number(b.actualQuantity || b.plannedQuantity || 0).toLocaleString()} {b.unit || ""}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline">{(b.inputs || []).length}종</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {reportData.batches.length > 30 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground bg-slate-50">
                        ... 외 {reportData.batches.length - 30}건. 인쇄 미리보기에서 전체 확인 가능합니다.
                      </div>
                    )}
                  </div>
                )}

                {reportData && (reportData.totals?.batchCount ?? 0) === 0 && (
                  <div className="p-6 text-center text-muted-foreground bg-slate-50 rounded-lg">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    해당 기간에 완료된 생산 배치가 없습니다.
                  </div>
                )}

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium mb-1">기간 보고서 안내</p>
                      <ul className="space-y-1 text-xs">
                        <li>• 실제 생산(배치)에 사용된 원재료만 출력됩니다 (정제수 제외).</li>
                        <li>• 날짜별로 배치 → 제품 → 품목제조번호 → 사용 원재료 순으로 정리됩니다.</li>
                        <li>• 주간/월간 단위로 원재료별 합계가 자동 계산됩니다.</li>
                        <li>• 월마감 승인 완료 후 출력하는 것을 권장합니다.</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

        </Tabs>
      </div>

      {/* ========== 수정 다이얼로그 ========== */}
      <Dialog open={!!editDialog?.open} onOpenChange={(open) => !open && setEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>데이터 수정</DialogTitle>
            <DialogDescription>
              {editDialog?.materialName} - {selectedMonth}-{String(editDialog?.day || 0).padStart(2, "0")}일{" "}
              {editDialog?.type === "receiving" ? "입고량" : "사용량"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>현재 값: {editDialog?.currentValue || 0} kg</Label>
              <Input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="새 값을 입력하세요 (kg)"
                min={0}
                step={0.1}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>취소</Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========== 반려 다이얼로그 ========== */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>월마감 반려</DialogTitle>
            <DialogDescription>
              {selectedMonth} 원료수불부 월마감을 반려합니다. 사유를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="반려 사유를 입력하세요"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(false)}>취소</Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? "처리 중..." : "반려"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </>
    );
    if (embedded) return content;
    return <DashboardLayout>{content}</DashboardLayout>;
}
