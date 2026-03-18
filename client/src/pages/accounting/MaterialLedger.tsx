import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
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
} from "lucide-react";

// 날짜 유틸
function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}
function getYearMonth(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function getDaysInMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export default function MaterialLedger({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
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

  // ========== 데이터 조회 ==========
  // 대시보드 요약
  const { data: _dashboardRaw, refetch: refetchDashboard } =
    trpc.materialLedger.getDashboard.useQuery();
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
    onError: (err: any) => toast.error(`수정 실패: ${err.message}`),
  });

  // 월별 집계
  const aggregateMutation = trpc.materialLedger.aggregateMonthly.useMutation({
    onSuccess: () => {
      toast.success("월별 집계가 완료되었습니다.");
      refetchMonthly();
      refetchDashboard();
    },
    onError: (err: any) => toast.error(`집계 실패: ${err.message}`),
  });

  // 승인 요청
  const submitApprovalMutation = trpc.materialLedger.submitApproval.useMutation({
    onSuccess: () => {
      toast.success("승인 요청이 제출되었습니다.");
      refetchApproval();
    },
    onError: (err: any) => toast.error(`승인 요청 실패: ${err.message}`),
  });

  // 승인
  const approveMutation = trpc.materialLedger.approve.useMutation({
    onSuccess: () => {
      toast.success("월마감이 승인되었습니다.");
      refetchApproval();
      refetchMonthly();
    },
    onError: (err: any) => toast.error(`승인 실패: ${err.message}`),
  });

  // 반려
  const rejectMutation = trpc.materialLedger.rejectMonthly.useMutation({
    onSuccess: () => {
      toast.success("월마감이 반려되었습니다.");
      refetchApproval();
      setRejectDialog(false);
      setRejectReason("");
    },
    onError: (err: any) => toast.error(`반려 실패: ${err.message}`),
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
    onError: (err: any) => toast.error(`다운로드 실패: ${err.message}`),
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
      date: dateStr,
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

  // ========== 승인 상태 배지 ==========
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />작성 중</Badge>;
      case "submitted":
        return <Badge className="bg-yellow-500"><FileText className="w-3 h-3 mr-1" />승인 대기</Badge>;
      case "approved":
        return <Badge className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />승인 완료</Badge>;
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="daily">
              <Calendar className="w-4 h-4 mr-2" />일일 확인
            </TabsTrigger>
            <TabsTrigger value="edit">
              <Edit className="w-4 h-4 mr-2" />수정 / 삭제
            </TabsTrigger>
            <TabsTrigger value="approval">
              <CheckCircle className="w-4 h-4 mr-2" />월마감 승인
            </TabsTrigger>
            <TabsTrigger value="export">
              <Download className="w-4 h-4 mr-2" />출력 관리
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
                            <TableCell className="text-right">{Number(item.prev_stock || 0).toLocaleString()}</TableCell>
                            <TableCell className="text-right text-blue-600 font-medium">
                              {Number(item.receiving_qty || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-medium">
                              {Number(item.usage_qty || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              {Number(item.current_stock || 0).toLocaleString()}
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
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>월별 원료수불부 수정</CardTitle>
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
                                <TableCell className="text-right bg-gray-50">{Number(item.prev_stock || 0).toLocaleString()}</TableCell>
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
                                  {Number(item.end_stock || 0).toLocaleString()}
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

          {/* ========== 탭 3: 월마감 승인 ========== */}
          <TabsContent value="approval" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>월마감 승인 관리</CardTitle>
                  <CardDescription>월별 원료수불부의 승인 상태를 관리합니다.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Label>대상 월:</Label>
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
                  </div>

                  <div className="p-4 rounded-lg border bg-slate-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">현재 상태:</span>
                      {getStatusBadge(approvalData?.status || "draft")}
                    </div>
                    {approvalData?.submitted_by_name && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">요청자:</span>
                        <span>{approvalData.submitted_by_name}</span>
                      </div>
                    )}
                    {approvalData?.submitted_at && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">요청일:</span>
                        <span>{new Date(approvalData.submitted_at).toLocaleString("ko-KR")}</span>
                      </div>
                    )}
                    {approvalData?.approved_by_name && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">승인자:</span>
                        <span>{approvalData.approved_by_name}</span>
                      </div>
                    )}
                    {approvalData?.approved_at && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">승인일:</span>
                        <span>{new Date(approvalData.approved_at).toLocaleString("ko-KR")}</span>
                      </div>
                    )}
                    {approvalData?.reject_reason && (
                      <div className="p-2 bg-red-50 rounded border border-red-200 text-sm text-red-700">
                        <strong>반려 사유:</strong> {approvalData.reject_reason}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {(!approvalData?.status || approvalData.status === "draft" || approvalData.status === "rejected") && (
                      <Button onClick={handleSubmitApproval} className="bg-yellow-500 hover:bg-yellow-600">
                        <FileText className="w-4 h-4 mr-2" />승인 요청
                      </Button>
                    )}
                    {approvalData?.status === "submitted" && (
                      <>
                        <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700">
                          <CheckCircle className="w-4 h-4 mr-2" />승인
                        </Button>
                        <Button variant="destructive" onClick={() => setRejectDialog(true)}>
                          <XCircle className="w-4 h-4 mr-2" />반려
                        </Button>
                      </>
                    )}
                    {approvalData?.status === "approved" && (
                      <div className="flex items-center gap-2 text-green-600">
                        <Lock className="w-4 h-4" />
                        <span className="text-sm font-medium">승인 완료 - 데이터가 잠겨있습니다</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>월별 요약</CardTitle>
                  <CardDescription>{selectedMonth} 원료수불부 요약 정보</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm font-medium text-blue-700">총 입고량</span>
                      <span className="text-lg font-bold text-blue-700">
                        {Number(dashboard?.totalReceiving || 0).toLocaleString()} kg
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm font-medium text-green-700">총 사용량</span>
                      <span className="text-lg font-bold text-green-700">
                        {Number(dashboard?.totalUsage || 0).toLocaleString()} kg
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                      <span className="text-sm font-medium text-orange-700">총 입고금액</span>
                      <span className="text-lg font-bold text-orange-700">
                        {Number(dashboard?.totalReceivingAmount || 0).toLocaleString()} 원
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-purple-50 rounded-lg">
                      <span className="text-sm font-medium text-purple-700">총 사용금액</span>
                      <span className="text-lg font-bold text-purple-700">
                        {Number(dashboard?.totalUsageAmount || 0).toLocaleString()} 원
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-slate-100 rounded-lg">
                      <span className="text-sm font-medium">관리 원재료 수</span>
                      <span className="text-lg font-bold">{dashboard?.materialCount || 0}종</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ========== 탭 4: 출력 관리 ========== */}
          <TabsContent value="export" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>원료수불부 출력 관리</CardTitle>
                <CardDescription>
                  월별 원료수불부를 엑셀 파일로 다운로드하여 파일링할 수 있습니다.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center gap-4">
                  <Label>출력 대상 월:</Label>
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
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-2 border-dashed hover:border-blue-400 transition-colors cursor-pointer" onClick={handleDownloadExcel}>
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <Download className="w-12 h-12 text-blue-500 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">월별 원료수불부 엑셀</h3>
                      <p className="text-sm text-muted-foreground text-center">
                        {selectedMonth} 원료수불부를 엑셀 파일로 다운로드합니다.<br />
                        (원본 서식 적용)
                      </p>
                      <Button className="mt-4" disabled={downloadMutation.isPending}>
                        {downloadMutation.isPending ? (
                          <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />생성 중...</>
                        ) : (
                          <><Download className="w-4 h-4 mr-2" />다운로드</>
                        )}
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-8">
                      <FileText className="w-12 h-12 text-gray-400 mb-4" />
                      <h3 className="text-lg font-semibold mb-2 text-gray-500">인쇄용 PDF</h3>
                      <p className="text-sm text-muted-foreground text-center">
                        추후 지원 예정입니다.<br />
                        엑셀 파일을 다운로드 후 인쇄하세요.
                      </p>
                      <Button className="mt-4" variant="outline" disabled>
                        <FileText className="w-4 h-4 mr-2" />준비 중
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <h4 className="font-medium text-amber-800">출력 안내</h4>
                      <ul className="text-sm text-amber-700 mt-1 space-y-1">
                        <li>• 월마감 승인이 완료된 후 출력하는 것을 권장합니다.</li>
                        <li>• 엑셀 파일에는 원재료별 일별 입고/사용량, 합계, 금액이 포함됩니다.</li>
                        <li>• 다운로드된 파일은 HACCP 서류 파일링에 활용할 수 있습니다.</li>
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
