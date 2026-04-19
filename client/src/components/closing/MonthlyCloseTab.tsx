import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CalendarRange,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  FileDown,
  RotateCcw,
  Lock,
  Unlock,
  BarChart3,
  ArrowRightLeft,
} from "lucide-react";

export default function MonthlyCloseTab() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [reopenReason, setReopenReason] = useState("");
  const [showReopenDialog, setShowReopenDialog] = useState(false);

  const { data: monthlyClose, refetch } = trpc.accountingMonthly.getDetail.useQuery({
    year: selectedYear,
    month: selectedMonth,
  });

  const generateMutation = trpc.accountingMonthly.generateSummary.useMutation({
    onSuccess: (data: any) => {
      toast({ title: "월 집계 생성 완료", description: `${selectedYear}년 ${selectedMonth}월 집계가 생성되었습니다.` });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "월 집계 생성 실패", description: error.message, variant: "destructive" });
    },
  });

  const closeMutation = trpc.accountingMonthly.confirmClose.useMutation({
    onSuccess: () => {
      toast({ title: "월 마감 확정 완료", description: `${selectedYear}년 ${selectedMonth}월 마감이 확정되었습니다.` });
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "월 마감 확정 실패", description: error.message, variant: "destructive" });
    },
  });

  const reopenMutation = trpc.accountingMonthly.reopen.useMutation({
    onSuccess: () => {
      toast({ title: "월 마감 재오픈 완료", description: `${selectedYear}년 ${selectedMonth}월 마감이 재오픈되었습니다.` });
      setShowReopenDialog(false);
      setReopenReason("");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "월 마감 재오픈 실패", description: error.message, variant: "destructive" });
    },
  });

  const exportPdfMutation = trpc.accountingMonthly.generatePDF.useMutation({
    onSuccess: (data: any) => {
      toast({ title: "PDF 생성 완료", description: "월간 리포트 PDF가 생성되었습니다." });
      if (data.pdfUrl) window.open(data.pdfUrl, "_blank");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast({ title: "PDF 생성 실패", description: error.message, variant: "destructive" });
    },
  });

  const handleGenerate = () => { generateMutation.mutate({ year: selectedYear, month: selectedMonth }); };
  const handleClose = () => { closeMutation.mutate({ year: selectedYear, month: selectedMonth }); };
  const handleReopen = () => {
    if (!reopenReason.trim()) { toast({ title: "재오픈 사유를 입력하세요", variant: "destructive" }); return; }
    reopenMutation.mutate({ year: selectedYear, month: selectedMonth, reason: reopenReason });
  };
  const handleExportPdf = () => { exportPdfMutation.mutate({ year: selectedYear, month: selectedMonth }); };

  const summary = monthlyClose
    ? (typeof (monthlyClose as any).summary === "string" ? JSON.parse((monthlyClose as any).summary) : monthlyClose)
    : null;

  const missingDates = monthlyClose?.missingDays
    ? typeof monthlyClose.missingDays === "string" ? JSON.parse(monthlyClose.missingDays) : monthlyClose.missingDays
    : [];

  return (
    <div className="space-y-6">
      {/* 연도/월 선택 */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4" />
            마감 기간 선택
          </CardTitle>
          <CardDescription>집계할 연도와 월을 선택하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">연도</Label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => currentYear - i).map((year) => (
                    <SelectItem key={year} value={year.toString()}>{year}년</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">월</Label>
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                    <SelectItem key={month} value={month.toString()}>{month}월</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
              <BarChart3 className="h-4 w-4 mr-2" />
              {generateMutation.isPending ? "생성 중..." : "월 집계 생성"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 월 마감 상태 */}
      {monthlyClose && (
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {monthlyClose.status === "closed" ? (
                    <Lock className="h-4 w-4 text-green-500" />
                  ) : (
                    <Unlock className="h-4 w-4 text-amber-500" />
                  )}
                  {selectedYear}년 {selectedMonth}월 마감 상태
                </CardTitle>
                <CardDescription>현재 마감 상태 및 통계</CardDescription>
              </div>
              <Badge
                variant={monthlyClose.status === "closed" ? "outline" : "outline"}
                className={monthlyClose.status === "closed"
                  ? "gap-1 text-green-600 border-green-300 bg-green-50"
                  : "gap-1 text-amber-600 border-amber-300 bg-amber-50"
                }
              >
                {monthlyClose.status === "closed" ? (
                  <><CheckCircle className="h-3 w-3" />확정</>
                ) : (
                  <><RotateCcw className="h-3 w-3" />임시</>
                )}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 통계 */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-400">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">총 거래 건수</p>
                    <p className="text-xl font-bold mt-0.5">{summary.totalTransactions}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-400">
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">완료율</p>
                    <p className="text-xl font-bold mt-0.5 text-green-600">{summary.completionRate?.toFixed(1) || 0}<span className="text-sm font-normal text-muted-foreground ml-1">%</span></p>
                    {/* Progress bar */}
                    <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${summary.completionRate || 0}%` }} />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-indigo-400">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                      <p className="text-xs text-muted-foreground">총 입금</p>
                    </div>
                    <p className="text-lg font-semibold text-indigo-600">{summary.totalDeposits?.toLocaleString() || 0}<span className="text-xs font-normal text-muted-foreground ml-0.5">원</span></p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-400">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                      <p className="text-xs text-muted-foreground">총 출금</p>
                    </div>
                    <p className="text-lg font-semibold text-red-600">{summary.totalWithdrawals?.toLocaleString() || 0}<span className="text-xs font-normal text-muted-foreground ml-0.5">원</span></p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* 미마감 날짜 */}
            {missingDates.length > 0 && (
              <Card className="border-l-4 border-l-amber-500 bg-amber-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <p className="font-semibold text-sm text-amber-800">
                      미마감 날짜: {missingDates.length}일
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {missingDates.map((date: string) => (
                      <Badge key={date} variant="outline" className="bg-white text-xs">{date}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 액션 버튼 */}
            <div className="flex gap-2">
              {monthlyClose.status === "draft" ? (
                <Button onClick={handleClose} disabled={closeMutation.isPending || missingDates.length > 0} size="lg">
                  <Lock className="h-4 w-4 mr-2" />
                  {closeMutation.isPending ? "확정 중..." : "월 마감 확정"}
                </Button>
              ) : (
                <Button onClick={() => setShowReopenDialog(true)} variant="destructive" size="lg">
                  <Unlock className="h-4 w-4 mr-2" />
                  월 마감 재오픈
                </Button>
              )}
              <Button onClick={handleExportPdf} disabled={exportPdfMutation.isPending} variant="outline" size="lg">
                <FileDown className="h-4 w-4 mr-2" />
                {exportPdfMutation.isPending ? "생성 중..." : "PDF 다운로드"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!monthlyClose && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ArrowRightLeft className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
            <p className="text-base font-medium text-muted-foreground">선택한 기간의 월 집계가 없습니다.</p>
            <p className="text-sm text-muted-foreground mt-1">"월 집계 생성" 버튼을 클릭하세요.</p>
          </CardContent>
        </Card>
      )}

      {/* 재오픈 사유 다이얼로그 */}
      <Dialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              월 마감 재오픈
            </DialogTitle>
            <DialogDescription>재오픈 사유를 입력하세요. 이 작업은 감사 로그에 기록됩니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Textarea
              placeholder="재오픈 사유를 입력하세요..."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReopenDialog(false)}>취소</Button>
            <Button onClick={handleReopen} disabled={reopenMutation.isPending || !reopenReason.trim()}>
              {reopenMutation.isPending ? "재오픈 중..." : "재오픈"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
