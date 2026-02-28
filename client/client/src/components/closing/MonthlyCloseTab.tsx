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

export default function MonthlyCloseTab() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [reopenReason, setReopenReason] = useState("");
  const [showReopenDialog, setShowReopenDialog] = useState(false);

  // 월 마감 조회
  const { data: monthlyClose, refetch } = trpc.accountingMonthly.get.useQuery({
    year: selectedYear,
    month: selectedMonth,
  });

  // 월 집계 생성
  const generateMutation = trpc.accountingMonthly.generate.useMutation({
    onSuccess: (data: any) => {
      toast({
        title: "월 집계 생성 완료",
        description: `${selectedYear}년 ${selectedMonth}월 집계가 생성되었습니다.`,
      });
      refetch();
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
  const closeMutation = trpc.accountingMonthly.close.useMutation({
    onSuccess: () => {
      toast({
        title: "월 마감 확정 완료",
        description: `${selectedYear}년 ${selectedMonth}월 마감이 확정되었습니다.`,
      });
      refetch();
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
  const reopenMutation = trpc.accountingMonthly.reopen.useMutation({
    onSuccess: () => {
      toast({
        title: "월 마감 재오픈 완료",
        description: `${selectedYear}년 ${selectedMonth}월 마감이 재오픈되었습니다.`,
      });
      setShowReopenDialog(false);
      setReopenReason("");
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "월 마감 재오픈 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // PDF 생성
  const exportPdfMutation = trpc.accountingMonthly.exportPdf.useMutation({
    onSuccess: (data: any) => {
      toast({
        title: "PDF 생성 완료",
        description: "월간 리포트 PDF가 생성되었습니다.",
      });
      if (data.pdfUrl) {
        window.open(data.pdfUrl, "_blank");
      }
      refetch();
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
    generateMutation.mutate({
      year: selectedYear,
      month: selectedMonth,
    });
  };

  const handleClose = () => {
    closeMutation.mutate({
      year: selectedYear,
      month: selectedMonth,
    });
  };

  const handleReopen = () => {
    if (!reopenReason.trim()) {
      toast({
        title: "재오픈 사유를 입력하세요",
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
    exportPdfMutation.mutate({
      year: selectedYear,
      month: selectedMonth,
    });
  };

  const summary = monthlyClose?.summary
    ? typeof monthlyClose.summary === "string"
      ? JSON.parse(monthlyClose.summary)
      : monthlyClose.summary
    : null;

  const missingDates = monthlyClose?.missingCloseDates
    ? typeof monthlyClose.missingCloseDates === "string"
      ? JSON.parse(monthlyClose.missingCloseDates)
      : monthlyClose.missingCloseDates
    : [];

  return (
    <div className="space-y-6">
      {/* 연도/월 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>마감 기간 선택</CardTitle>
          <CardDescription>집계할 연도와 월을 선택하세요</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4 items-end">
          <div className="flex-1">
            <Label>연도</Label>
            <Select
              value={selectedYear.toString()}
              onValueChange={(value) => setSelectedYear(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => currentYear - i).map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}년
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label>월</Label>
            <Select
              value={selectedMonth.toString()}
              onValueChange={(value) => setSelectedMonth(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                  <SelectItem key={month} value={month.toString()}>
                    {month}월
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerate} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? "생성 중..." : "월 집계 생성"}
          </Button>
        </CardContent>
      </Card>

      {/* 월 마감 상태 */}
      {monthlyClose && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {selectedYear}년 {selectedMonth}월 마감 상태
                </CardTitle>
                <CardDescription>현재 마감 상태 및 통계</CardDescription>
              </div>
              <Badge
                variant={monthlyClose.status === "closed" ? "default" : "secondary"}
              >
                {monthlyClose.status === "closed" ? "확정" : "임시"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 통계 */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">총 거래 건수</p>
                  <p className="text-2xl font-bold">{summary.totalTransactions}건</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">완료율</p>
                  <p className="text-2xl font-bold text-green-600">
                    {summary.completionRate?.toFixed(1) || 0}%
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">총 입금</p>
                  <p className="text-xl font-semibold text-blue-600">
                    {summary.totalDeposits?.toLocaleString() || 0}원
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">총 출금</p>
                  <p className="text-xl font-semibold text-red-600">
                    {summary.totalWithdrawals?.toLocaleString() || 0}원
                  </p>
                </div>
              </div>
            )}

            {/* 미마감 날짜 */}
            {missingDates.length > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="font-semibold text-yellow-800 mb-2">
                  ⚠️ 미마감 날짜: {missingDates.length}일
                </p>
                <div className="flex flex-wrap gap-2">
                  {missingDates.map((date: string) => (
                    <Badge key={date} variant="outline" className="bg-white">
                      {date}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 액션 버튼 */}
            <div className="flex gap-2">
              {monthlyClose.status === "draft" ? (
                <Button
                  onClick={handleClose}
                  disabled={closeMutation.isPending || missingDates.length > 0}
                  size="lg"
                >
                  {closeMutation.isPending ? "확정 중..." : "월 마감 확정"}
                </Button>
              ) : (
                <Button
                  onClick={() => setShowReopenDialog(true)}
                  variant="destructive"
                  size="lg"
                >
                  월 마감 재오픈
                </Button>
              )}
              <Button
                onClick={handleExportPdf}
                disabled={exportPdfMutation.isPending}
                variant="outline"
                size="lg"
              >
                {exportPdfMutation.isPending ? "생성 중..." : "PDF 다운로드"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {!monthlyClose && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              선택한 기간의 월 집계가 없습니다. "월 집계 생성" 버튼을 클릭하세요.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 재오픈 사유 입력 다이얼로그 */}
      <Dialog open={showReopenDialog} onOpenChange={setShowReopenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>월 마감 재오픈</DialogTitle>
            <DialogDescription>
              재오픈 사유를 입력하세요. 이 작업은 감사 로그에 기록됩니다.
            </DialogDescription>
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
            <Button variant="outline" onClick={() => setShowReopenDialog(false)}>
              취소
            </Button>
            <Button
              onClick={handleReopen}
              disabled={reopenMutation.isPending || !reopenReason.trim()}
            >
              {reopenMutation.isPending ? "재오픈 중..." : "재오픈"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
