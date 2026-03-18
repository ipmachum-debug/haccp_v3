import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Download, Lock, Unlock, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * 월 마감 페이지
 * 
 * 기능:
 * - Year/Month 선택
 * - 월 집계 생성
 * - 미마감 날짜 경고
 * - KPI 요약 카드
 * - 월 마감 확정
 * - PDF 다운로드
 * - 월 마감 재오픈
 */

export default function AccountingMonthlyClose() {
  return (
    <DashboardLayout>
      <AccountingMonthlyCloseContent />
    </DashboardLayout>
  );
}

function AccountingMonthlyCloseContent() {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // 현재 날짜 기준으로 초기값 설정
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-based

  // 재오픈 다이얼로그
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  // 월 마감 데이터 조회
  const { data: monthlyClose, isPending } = trpc.accountingMonthly.getDetail.useQuery({
    year: selectedYear,
    month: selectedMonth,
  });

  // 월 집계 생성
  const generateMutation = trpc.accountingMonthly.generateSummary.useMutation({
    onSuccess: () => {
      toast({
        title: "월 집계 생성 완료",
        description: `${selectedYear}년 ${selectedMonth}월 집계가 생성되었습니다.`,
      });
      utils.accountingMonthly.getDetail.invalidate({ year: selectedYear, month: selectedMonth });
    },
    onError: (error: any) => {
      toast({
        title: "월 집계 생성 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 월 마감 확정
  const closeMutation = trpc.accountingMonthly.confirmClose.useMutation({
    onSuccess: () => {
      toast({
        title: "월 마감 확정 완료",
        description: `${selectedYear}년 ${selectedMonth}월 마감이 확정되었습니다.`,
      });
      utils.accountingMonthly.getDetail.invalidate({ year: selectedYear, month: selectedMonth });
    },
    onError: (error: any) => {
      toast({
        title: "월 마감 확정 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 월 마감 재오픈
  const reopenMutation = trpc.accountingMonthly.lockClose.useMutation({
    onSuccess: () => {
      toast({
        title: "월 마감 재오픈 완료",
        description: `${selectedYear}년 ${selectedMonth}월 마감이 재오픈되었습니다.`,
      });
      setReopenDialogOpen(false);
      setReopenReason("");
      utils.accountingMonthly.getDetail.invalidate({ year: selectedYear, month: selectedMonth });
    },
    onError: (error: any) => {
      toast({
        title: "월 마감 재오픈 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // PDF 다운로드
  const exportPdfMutation = trpc.accountingMonthly.generatePDF.useMutation({
    onSuccess: (data: any) => {
      toast({
        title: "PDF 생성 완료",
        description: "월 리포트 PDF가 생성되었습니다.",
      });
      // PDF URL로 이동 (새 탭)
      window.open(data.pdfUrl, "_blank");
      utils.accountingMonthly.getDetail.invalidate({ year: selectedYear, month: selectedMonth });
    },
    onError: (error: any) => {
      toast({
        title: "PDF 생성 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    generateMutation.mutate({ year: selectedYear, month: selectedMonth });
  };

  const handleClose = () => {
    closeMutation.mutate({ year: selectedYear, month: selectedMonth });
  };

  const handleReopen = () => {
    if (!reopenReason.trim()) {
      toast({
        title: "재오픈 사유 필수",
        description: "재오픈 사유를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    reopenMutation.mutate({
      year: selectedYear,
      month: selectedMonth,
      reason: reopenReason,
    });
  };

  const handleExportPdf = () => {
    exportPdfMutation.mutate({ year: selectedYear, month: selectedMonth });
  };

  // 연도 옵션 (최근 5년)
  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i);

  // 월 옵션 (1~12)
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);

  // Summary 타입 정의
  type MonthlySummary = {
    totalIncome?: number;
    totalExpense?: number;
    netCashFlow?: number;
    totalTransactions?: number;
    dailyCloseCount?: number;
  };

  const summary = ((monthlyClose as any)?.summary as MonthlySummary) || monthlyClose || {};
  const missingDates = ((monthlyClose as any)?.missingCloseDates || monthlyClose?.missingDays || []) as string[];
  const isClosed = (monthlyClose as any)?.status === "closed" || (monthlyClose as any)?.closedAt;
  const canClose = monthlyClose && missingDates.length === 0 && !isClosed;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">월 마감 관리</h1>
          <p className="text-muted-foreground">일일 마감 데이터를 집계하여 월간 마감을 생성하고 확정합니다.</p>
        </div>
      </div>

      {/* Year/Month 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>마감 대상 월 선택</CardTitle>
          <CardDescription>마감할 연도와 월을 선택하세요.</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
          <div className="flex-1">
            <Label>연도</Label>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1">
            <Label>월</Label>
            <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((month) => (
                  <SelectItem key={month} value={month.toString()}>
                    {month}월
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleGenerate} disabled={generateMutation.isPending || isPending}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {monthlyClose ? "월 집계 재생성" : "월 집계 생성"}
          </Button>
        </CardContent>
      </Card>

      {/* 로딩 상태 */}
      {isPending && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            데이터를 불러오는 중...
          </CardContent>
        </Card>
      )}

      {/* 월 마감 데이터 없음 */}
      {!isPending && !monthlyClose && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>월 집계 미생성</AlertTitle>
          <AlertDescription>
            {selectedYear}년 {selectedMonth}월 집계가 생성되지 않았습니다. 위에서 "월 집계 생성" 버튼을 클릭하세요.
          </AlertDescription>
        </Alert>
      )}

      {/* 월 마감 데이터 표시 */}
      {!isPending && monthlyClose && (
        <>
          {/* 상태 표시 */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>마감 상태</CardTitle>
                {isClosed ? (
                  <Badge variant="default" className="bg-green-600">
                    <Lock className="mr-1 h-3 w-3" />
                    확정됨
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <Unlock className="mr-1 h-3 w-3" />
                    Draft
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {isClosed && (monthlyClose as any).closedAt && (
                <p className="text-sm text-muted-foreground">
                  확정 일시: {new Date((monthlyClose as any).closedAt).toLocaleString("ko-KR")}
                </p>
              )}
            </CardContent>
          </Card>

          {/* 미마감 날짜 경고 */}
          {missingDates.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>미마감 날짜 존재</AlertTitle>
              <AlertDescription>
                아래 날짜의 일일 마감이 완료되지 않았습니다. 모든 날짜를 마감한 후 월 마감을 확정하세요.
                <div className="mt-2 flex flex-wrap gap-2">
                  {missingDates.map((date) => (
                    <Badge key={date} variant="outline">
                      {date}
                    </Badge>
                  ))}
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* KPI 요약 카드 */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">총 수입</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(summary.totalIncome || 0).toLocaleString()}원
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">총 지출</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(summary.totalExpense || 0).toLocaleString()}원
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">순현금흐름</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${(summary.netCashFlow || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {(summary.netCashFlow || 0).toLocaleString()}원
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">거래 건수</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(summary.totalTransactions || 0).toLocaleString()}건
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 액션 버튼 */}
          <Card>
            <CardHeader>
              <CardTitle>마감 관리</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-4">
              {!isClosed && (
                <Button
                  onClick={handleClose}
                  disabled={!canClose || closeMutation.isPending}
                  variant="default"
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  월 마감 확정
                </Button>
              )}

              {isClosed && (
                <Button
                  onClick={() => setReopenDialogOpen(true)}
                  disabled={reopenMutation.isPending}
                  variant="outline"
                >
                  <Unlock className="mr-2 h-4 w-4" />
                  월 마감 재오픈
                </Button>
              )}

              <Button
                onClick={handleExportPdf}
                disabled={exportPdfMutation.isPending}
                variant="outline"
              >
                <Download className="mr-2 h-4 w-4" />
                PDF 다운로드
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* 재오픈 다이얼로그 */}
      <Dialog open={reopenDialogOpen} onOpenChange={setReopenDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>월 마감 재오픈</DialogTitle>
            <DialogDescription>
              재오픈 사유를 입력하세요. 이 작업은 감사 로그에 기록됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reason">재오픈 사유 *</Label>
              <Textarea
                id="reason"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="예: 거래 누락 발견으로 인한 재작업"
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReopenDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleReopen} disabled={reopenMutation.isPending}>
              재오픈
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
