/**
 * 원료수불 보고서 관리 페이지 (자동 생성 모드)
 * -----------------------------------------------------------------------------
 * 사용자 요청: "주간/월간은 자동 생성으로. 사용량이 자동을 API로 데이터, 합계가 적용. 너무 불편해."
 *
 * 핵심 변경:
 *   1) 페이지 로드 즉시 "이번 주" + "이번 달" 보고서 데이터를 자동 fetch (getUsageReport)
 *      → 사용자가 클릭 없이 바로 데이터/합계를 볼 수 있음
 *   2) [인쇄 미리보기] 버튼 → 즉시 인쇄 페이지 새 창 (스냅샷 저장 없이)
 *   3) [검토 요청 → 워크플로 시작] 버튼 → 스냅샷 저장 + h_approval_requests 등록
 *   4) 저장된 스냅샷 보고서 목록은 아래쪽에 별도로 표시
 *   5) 서버에 createReport/listReports 등 신규 procedure 가 없어도 페이지가 깨지지 않음
 *      (graceful fallback)
 */
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  CheckCircle,
  Clock,
  FileText,
  Printer,
  RefreshCw,
  Trash2,
  XCircle,
  Eye,
  Send,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Search,
} from "lucide-react";
import { formatLocalDate } from "../../lib/dateUtils";

// ============================================================================
// 유틸 - 주간/월간 범위 계산
// ============================================================================
function getWeekRange(baseDate: Date): { start: string; end: string } {
  const day = baseDate.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(baseDate);
  mon.setDate(baseDate.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: formatLocalDate(mon), end: formatLocalDate(sun) };
}
function getMonthRange(baseDate: Date): { start: string; end: string } {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  return { start: formatLocalDate(start), end: formatLocalDate(end) };
}
function getThisWeekRange(): { start: string; end: string } {
  return getWeekRange(new Date());
}
function getThisMonthRange(): { start: string; end: string } {
  return getMonthRange(new Date());
}
function shiftWeek(range: { start: string; end: string }, weeks: number): { start: string; end: string } {
  const start = new Date(range.start + "T00:00:00");
  start.setDate(start.getDate() + weeks * 7);
  return getWeekRange(start);
}
function shiftMonth(range: { start: string; end: string }, months: number): { start: string; end: string } {
  const start = new Date(range.start + "T00:00:00");
  start.setMonth(start.getMonth() + months);
  return getMonthRange(start);
}

// 상태 뱃지
const STATUS_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  draft: { label: "작성중", cls: "bg-slate-100 text-slate-700", icon: FileText },
  pending_review: { label: "검토대기", cls: "bg-yellow-100 text-yellow-700", icon: Clock },
  pending_approval: { label: "승인대기", cls: "bg-orange-100 text-orange-700", icon: Clock },
  approved: { label: "승인", cls: "bg-green-100 text-green-700", icon: CheckCircle },
  rejected: { label: "반려", cls: "bg-red-100 text-red-700", icon: XCircle },
};

// ============================================================================
// 자동 미리보기 카드 (이번 주 / 이번 달)
// ============================================================================
function AutoReportCard({
  title,
  type,
  range,
  refetchSavedList,
}: {
  title: string;
  type: "week" | "month";
  range: { start: string; end: string };
  refetchSavedList: () => void;
}) {
  // ────────────────────────────────────────────────────────────
  // ★ 자동 데이터 조회 (페이지 로드 즉시 — 클릭 불필요)
  // ────────────────────────────────────────────────────────────
  const { data: rawReport, isLoading, refetch, isFetching, error } =
    trpc.materialLedger.getUsageReport.useQuery(
      { start: range.start, end: range.end, type },
      {
        enabled: !!range.start && !!range.end,
        refetchOnWindowFocus: false,
      },
    );
  const report = rawReport as any;

  // 검토요청 (스냅샷 저장 + h_approval_requests 등록)
  const submitMutation = trpc.materialLedger.createReport?.useMutation({
    onSuccess: () => {
      toast.success(`${title} 검토 요청이 등록되었습니다.`);
      refetchSavedList();
    },
    onError: (e: { message: string }) => toast.error(`검토요청 실패: ${e.message}`),
  });

  const handlePrint = () => {
    const url = `/material-usage-report-print?start=${range.start}&end=${range.end}&type=${type}&autoprint=1`;
    window.open(url, "_blank", "width=900,height=1100");
  };

  const handlePreview = () => {
    const url = `/material-usage-report-print?start=${range.start}&end=${range.end}&type=${type}`;
    window.open(url, "_blank", "width=900,height=1100");
  };

  const handleSubmitReview = () => {
    if (!submitMutation) {
      toast.error("서버 업데이트가 필요합니다. 관리자에게 문의하세요.");
      return;
    }
    submitMutation.mutate({
      type,
      start: range.start,
      end: range.end,
      autoSubmit: true,
    });
  };

  // ★ 2026-04-13 변경: 최외곽 Card wrapper 를 parent 로 옮김 (네비게이션 헤더와 합치기 위함)
  //    → 여기서는 Card 없는 순수 콘텐츠만 반환
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b">
        <div className="text-sm">
          <span className="text-muted-foreground">기간:</span>{" "}
          <span className="font-medium">{range.start} ~ {range.end}</span>{" "}
          {report?.period?.label && (
            <span className="text-blue-600 font-medium ml-2">
              ({report.period.label})
            </span>
          )}
          {isFetching && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500 inline ml-2" />}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" variant="outline" onClick={handlePreview}>
            <Eye className="w-4 h-4 mr-1" /> 미리보기
          </Button>
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handlePrint}
            disabled={!report || (report?.totals?.batchCount ?? 0) === 0}
            >
              <Printer className="w-4 h-4 mr-1" /> 인쇄
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleSubmitReview}
              disabled={
                !report ||
                (report?.totals?.batchCount ?? 0) === 0 ||
                submitMutation?.isPending
              }
            >
              <Send className="w-4 h-4 mr-1" />
              {submitMutation?.isPending ? "등록 중..." : "검토요청"}
            </Button>
        </div>
      </div>
      <div>
        {isLoading ? (
          <div className="p-6 text-center text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            데이터 조회 중...
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            <AlertCircle className="w-4 h-4 inline mr-1" />
            데이터 조회 실패: {(error as any)?.message || "알 수 없는 오류"}
          </div>
        ) : !report ? (
          <div className="p-6 text-center text-muted-foreground">데이터 없음</div>
        ) : (
          <div className="space-y-4">
            {/* === 자동 합계 카드 === */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-xs text-blue-700">생산 배치</div>
                <div className="text-xl font-bold text-blue-700">
                  {report.totals?.batchCount || 0}건
                </div>
              </div>
              <div className="p-3 rounded-lg bg-cyan-50 border border-cyan-200">
                <div className="text-xs text-cyan-700">생산 제품</div>
                <div className="text-xl font-bold text-cyan-700">
                  {report.totals?.productCount || 0}종
                </div>
              </div>
              <div className="p-3 rounded-lg bg-purple-50 border border-purple-200">
                <div className="text-xs text-purple-700">사용 원재료</div>
                <div className="text-xl font-bold text-purple-700">
                  {report.totals?.materialCount || 0}종
                </div>
              </div>
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="text-xs text-green-700">총 생산량</div>
                <div className="text-xl font-bold text-green-700">
                  {Number(report.summary?.productionKg || 0).toLocaleString()} kg
                </div>
              </div>
              <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
                <div className="text-xs text-orange-700">총 원재료</div>
                <div className="text-xl font-bold text-orange-700">
                  {Number(report.totals?.totalUsage || 0).toLocaleString()} kg
                </div>
              </div>
            </div>

            {/* === 자동 데이터 (생산실적 + 원재료별 합계) === */}
            {(report.totals?.batchCount ?? 0) === 0 ? (
              <div className="p-6 text-center text-muted-foreground bg-slate-50 rounded">
                해당 기간에 생산 실적이 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* 생산실적 */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-cyan-50 px-3 py-2 text-sm font-semibold border-b">
                    🏭 생산 실적 ({report.productions?.length || 0}건)
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">날짜</TableHead>
                          <TableHead className="text-xs">제품명</TableHead>
                          <TableHead className="text-xs text-right">생산량</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(report.productions || []).slice(0, 50).map((p: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{p.date?.slice(5)}</TableCell>
                            <TableCell className="text-xs">{p.productName}</TableCell>
                            <TableCell className="text-xs text-right">
                              {Number(p.quantity).toLocaleString()} {p.unit}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* 원재료별 합계 */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-amber-50 px-3 py-2 text-sm font-semibold border-b">
                    🧰 원재료별 합계 ({report.materialWeeklyTotal?.length || 0}종)
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">원재료명</TableHead>
                          <TableHead className="text-xs text-right">총 사용량</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(report.materialWeeklyTotal || []).slice(0, 50).map((m: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="text-xs">{m.materialName}</TableCell>
                            <TableCell className="text-xs text-right">
                              {Number(m.totalQuantity).toLocaleString()} {m.unit}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================
interface MaterialUsageReportListProps {
  embedded?: boolean;
  [key: string]: any;
}
export default function MaterialUsageReportList(props: MaterialUsageReportListProps = {}) {
  const { embedded } = props;

  // ★ 기간 선택 상태 (이전 주/이전 달 등 과거 데이터 열람 지원)
  // 2026-04-13: 사용자 요청 — "이번 주/이번 달 이외의 과거 데이터는 확인/승인 불가"
  //  → 주간/월간 카드가 각각 독립된 range 상태를 가지며 네비게이션 버튼으로 이동 가능
  const [weekRange, setWeekRange] = useState(getThisWeekRange);
  const [monthRange, setMonthRange] = useState(getThisMonthRange);

  // 기간 필터 (저장된 스냅샷 목록 검색용)
  const [savedFilter, setSavedFilter] = useState<{
    reportType: "all" | "week" | "month" | "custom";
    status: "all" | "draft" | "pending_review" | "pending_approval" | "approved" | "rejected";
    startFrom: string;
    startTo: string;
  }>({
    reportType: "all",
    status: "all",
    startFrom: "",
    startTo: "",
  });

  // ────────────────────────────────────────────────────────────
  // 저장된 스냅샷 보고서 (graceful fallback)
  // ────────────────────────────────────────────────────────────
  const listReportsQuery = (trpc as any).materialLedger.listReports?.useQuery
    ? (trpc as any).materialLedger.listReports.useQuery(
        {
          limit: 200,
          reportType: savedFilter.reportType === "all" ? undefined : savedFilter.reportType,
          status: savedFilter.status === "all" ? undefined : savedFilter.status,
          startFrom: savedFilter.startFrom || undefined,
          startTo: savedFilter.startTo || undefined,
        },
        { refetchOnWindowFocus: false, retry: false },
      )
    : { data: [], refetch: () => {}, isFetching: false, error: null };

  const reports = listReportsQuery.data || [];
  const refetchList = () => listReportsQuery.refetch?.();
  const procedureMissing = !!listReportsQuery.error;

  // 반려 다이얼로그 상태
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; id: number | null }>({
    open: false,
    id: null,
  });
  const [rejectReason, setRejectReason] = useState("");

  // 스냅샷 액션 mutations (graceful)
  const reviewMutation = (trpc as any).materialLedger.reviewReport?.useMutation({
    onSuccess: () => { toast.success("검토 완료"); refetchList(); },
    onError: (e: { message: string }) => toast.error(`검토 실패: ${e.message}`),
  });
  const approveMutation = (trpc as any).materialLedger.approveReport?.useMutation({
    onSuccess: () => { toast.success("승인 완료"); refetchList(); },
    onError: (e: { message: string }) => toast.error(`승인 실패: ${e.message}`),
  });
  const rejectMutation = (trpc as any).materialLedger.rejectReport?.useMutation({
    onSuccess: () => {
      toast.success("반려 완료");
      setRejectDialog({ open: false, id: null });
      setRejectReason("");
      refetchList();
    },
    onError: (e: { message: string }) => toast.error(`반려 실패: ${e.message}`),
  });
  const deleteMutation = (trpc as any).materialLedger.deleteReport?.useMutation({
    onSuccess: () => { toast.success("삭제 완료"); refetchList(); },
    onError: (e: { message: string }) => toast.error(`삭제 실패: ${e.message}`),
  });

  const handlePrint = (id: number) => {
    window.open(
      `/material-usage-report-print?id=${id}&autoprint=1`,
      "_blank",
      "width=900,height=1100",
    );
  };
  const handleView = (id: number) => {
    window.open(`/material-usage-report-print?id=${id}`, "_blank", "width=900,height=1100");
  };
  const handleDelete = (id: number, status: string) => {
    if (status === "approved") {
      if (!confirm("승인된 보고서입니다. 정말 삭제하시겠습니까?")) return;
    } else if (!confirm("보고서를 삭제하시겠습니까?")) return;
    deleteMutation?.mutate({ id });
  };

  const content = (
    <>
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">원료수불 보고서</h1>
          <p className="text-muted-foreground">
            주간/월간 보고서 자동 표시 · 좌우 화살표 또는 달력으로 과거 기간 탐색 ·
            저장된 스냅샷은 필터로 검색·검토·승인·인쇄 가능
          </p>
        </div>

        {/* 서버 업데이트 안내 (procedure 없을 때) */}
        {procedureMissing && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">서버 업데이트 필요</p>
                <p className="text-xs mt-1">
                  보고서 저장/검토/승인 기능은 서버 재배포 + DB 마이그레이션 후 활성화됩니다.
                  <br />
                  <code className="bg-amber-100 px-1 rounded">npx tsx scripts/migrate-material-usage-reports.ts</code>
                  {" → "}
                  <code className="bg-amber-100 px-1 rounded">./deploy.sh</code>
                  <br />
                  단, 미리보기/인쇄/데이터 조회는 즉시 가능합니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* === 주간 보고서 (기간 네비게이션 포함) === */}
        <Card className="border-2 border-blue-100">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <CardTitle className="text-base">주간 보고서</CardTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWeekRange(shiftWeek(weekRange, -1))}
                  title="이전 주"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWeekRange(getThisWeekRange())}
                  className="px-3"
                >
                  이번 주
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWeekRange(shiftWeek(weekRange, 1))}
                  title="다음 주"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <div className="ml-2 flex items-center gap-1">
                  <Input
                    type="date"
                    value={weekRange.start}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setWeekRange(getWeekRange(new Date(e.target.value + "T00:00:00")));
                    }}
                    className="w-36 h-8 text-xs"
                    title="원하는 날짜 선택 → 해당 주로 이동"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <AutoReportCard
              title="주간 보고서"
              type="week"
              range={weekRange}
              refetchSavedList={refetchList}
            />
          </CardContent>
        </Card>

        {/* === 월간 보고서 (기간 네비게이션 포함) === */}
        <Card className="border-2 border-green-100">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-green-600" />
                <CardTitle className="text-base">월간 보고서</CardTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMonthRange(shiftMonth(monthRange, -1))}
                  title="이전 달"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMonthRange(getThisMonthRange())}
                  className="px-3"
                >
                  이번 달
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMonthRange(shiftMonth(monthRange, 1))}
                  title="다음 달"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <div className="ml-2 flex items-center gap-1">
                  <Input
                    type="month"
                    value={monthRange.start.slice(0, 7)}
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const [y, m] = e.target.value.split("-").map(Number);
                      setMonthRange(getMonthRange(new Date(y, m - 1, 1)));
                    }}
                    className="w-36 h-8 text-xs"
                    title="원하는 월 선택"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <AutoReportCard
              title="월간 보고서"
              type="month"
              range={monthRange}
              refetchSavedList={refetchList}
            />
          </CardContent>
        </Card>

        {/* === 저장된 스냅샷 보고서 === */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>저장된 보고서 (스냅샷)</CardTitle>
                <CardDescription>
                  검토요청·승인·반려 워크플로우를 거치는 공식 보고서 ({reports.length}건)
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={refetchList}
                disabled={listReportsQuery.isFetching}
              >
                <RefreshCw
                  className={`w-4 h-4 ${listReportsQuery.isFetching ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* === 저장 보고서 필터 === */}
            <div className="flex flex-wrap gap-2 items-end pb-3 border-b mb-3">
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground">유형</label>
                <Select
                  value={savedFilter.reportType}
                  onValueChange={(v: any) => setSavedFilter((f) => ({ ...f, reportType: v }))}
                >
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="week">주간</SelectItem>
                    <SelectItem value="month">월간</SelectItem>
                    <SelectItem value="custom">커스텀</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground">상태</label>
                <Select
                  value={savedFilter.status}
                  onValueChange={(v: any) => setSavedFilter((f) => ({ ...f, status: v }))}
                >
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="draft">작성중</SelectItem>
                    <SelectItem value="pending_review">검토대기</SelectItem>
                    <SelectItem value="pending_approval">승인대기</SelectItem>
                    <SelectItem value="approved">승인</SelectItem>
                    <SelectItem value="rejected">반려</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground">기간 시작</label>
                <Input
                  type="date"
                  value={savedFilter.startFrom}
                  onChange={(e) => setSavedFilter((f) => ({ ...f, startFrom: e.target.value }))}
                  className="w-36 h-8 text-xs"
                />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] text-muted-foreground">기간 종료</label>
                <Input
                  type="date"
                  value={savedFilter.startTo}
                  onChange={(e) => setSavedFilter((f) => ({ ...f, startTo: e.target.value }))}
                  className="w-36 h-8 text-xs"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() =>
                  setSavedFilter({
                    reportType: "all",
                    status: "all",
                    startFrom: "",
                    startTo: "",
                  })
                }
              >
                <Search className="w-3.5 h-3.5 mr-1" /> 초기화
              </Button>
            </div>

            {procedureMissing ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                서버 업데이트 후 사용 가능합니다.
              </div>
            ) : reports.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">
                저장된 스냅샷이 없습니다. 위의 "검토요청" 버튼으로 보고서를 등록하세요.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">유형</TableHead>
                    <TableHead>기간 / 제목</TableHead>
                    <TableHead className="text-right">생산</TableHead>
                    <TableHead className="text-center">원재료</TableHead>
                    <TableHead className="text-center">상태</TableHead>
                    <TableHead className="text-center">생성일</TableHead>
                    <TableHead className="text-center">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r: any) => {
                    const badge = STATUS_BADGE[r.status] || STATUS_BADGE.draft;
                    const Icon = badge.icon;
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {r.reportType === "week" ? "주간" : r.reportType === "month" ? "월간" : "사용자"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm">{r.title}</div>
                          <div className="text-xs text-muted-foreground">{r.periodLabel}</div>
                        </TableCell>
                        <TableCell className="text-right text-xs">
                          {Number(r.summaryProductionKg || 0).toLocaleString()} kg
                        </TableCell>
                        <TableCell className="text-center text-xs">{r.materialCount || 0}종</TableCell>
                        <TableCell className="text-center">
                          <Badge className={badge.cls}>
                            <Icon className="w-3 h-3 mr-1" />
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {r.createdAt ? new Date(r.createdAt).toLocaleDateString("ko-KR") : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-center">
                            <Button size="sm" variant="outline" onClick={() => handleView(r.id)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handlePrint(r.id)}
                              disabled={r.status !== "approved"}
                              title={r.status === "approved" ? "인쇄" : "승인 후 인쇄 가능"}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                            {r.status === "pending_review" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="bg-blue-50"
                                onClick={() => reviewMutation?.mutate({ id: r.id })}
                              >
                                검토
                              </Button>
                            )}
                            {(r.status === "pending_review" || r.status === "pending_approval") && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="bg-green-50 text-green-700"
                                  onClick={() => approveMutation?.mutate({ id: r.id })}
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="bg-red-50 text-red-700"
                                  onClick={() => setRejectDialog({ open: true, id: r.id })}
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600"
                              onClick={() => handleDelete(r.id, r.status)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* === 반려 다이얼로그 === */}
      <Dialog
        open={rejectDialog.open}
        onOpenChange={(open) => setRejectDialog({ open, id: rejectDialog.id })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>보고서 반려</DialogTitle>
            <DialogDescription>반려 사유를 입력하세요.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="반려 사유"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, id: null })}>
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!rejectReason.trim()) {
                  toast.error("반려 사유를 입력하세요.");
                  return;
                }
                if (rejectDialog.id != null && rejectMutation) {
                  rejectMutation.mutate({ id: rejectDialog.id, reason: rejectReason });
                }
              }}
              disabled={rejectMutation?.isPending}
            >
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
