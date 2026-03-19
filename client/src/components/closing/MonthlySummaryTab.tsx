import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  Lock,
  CheckCircle,
  AlertCircle,
  BarChart3,
} from "lucide-react";
import { Link } from "wouter";

export default function MonthlySummaryTab() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const { data: summaries, isLoading } = trpc.accountingMonthly.list.useQuery({
    limit: 12,
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW" }).format(num);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300 bg-amber-50"><AlertCircle className="h-3 w-3" />임시저장</Badge>;
      case "confirmed":
        return <Badge variant="outline" className="gap-1 text-blue-600 border-blue-300 bg-blue-50"><CheckCircle className="h-3 w-3" />확정</Badge>;
      case "locked":
        return <Badge variant="outline" className="gap-1 text-slate-600 border-slate-300 bg-slate-50"><Lock className="h-3 w-3" />잠금</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">월 마감 관리</h3>
            <p className="text-sm text-muted-foreground">일일 마감 데이터 기반 월간 집계 및 리포트 생성</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-6 w-24 bg-muted/50 rounded animate-pulse" />
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="h-4 w-full bg-muted/50 rounded animate-pulse" />
                <div className="h-4 w-2/3 bg-muted/50 rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-muted/50 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">월 마감 관리</h3>
          <p className="text-sm text-muted-foreground">일일 마감 데이터 기반 월간 집계 및 리포트 생성</p>
        </div>
        <Link href="/accounting/monthly-summary/new">
          <Button>
            <Calendar className="mr-2 h-4 w-4" />
            새 월 마감 생성
          </Button>
        </Link>
      </div>

      {/* 월 마감 목록 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {summaries && summaries.length > 0 ? (
          summaries.map((summary: any) => {
            const netFlow = parseFloat(summary.netCashFlow || "0");
            const closedRatio = summary.totalDays > 0
              ? Math.round((summary.closedDays / summary.totalDays) * 100)
              : 0;

            return (
              <Link key={summary.id} href={`/accounting/monthly-summary/${summary.year}/${summary.month}`}>
                <Card className="group hover:shadow-lg transition-all hover:border-primary/20 cursor-pointer h-full">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{summary.year}년 {summary.month}월</CardTitle>
                      {getStatusBadge(summary.status)}
                    </div>
                    <CardDescription className="flex items-center justify-between">
                      <span>마감일: {summary.closedDays}/{summary.totalDays}일</span>
                      {summary.missingDays && JSON.parse(summary.missingDays).length > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          누락 {JSON.parse(summary.missingDays).length}일
                        </Badge>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Progress bar */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">마감 진행률</span>
                        <span className="font-medium">{closedRatio}%</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            closedRatio === 100 ? "bg-green-500" : closedRatio > 50 ? "bg-blue-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${closedRatio}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                        총 입금
                      </span>
                      <span className="font-semibold text-green-600 tabular-nums">
                        {formatCurrency(summary.totalDeposit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                        총 출금
                      </span>
                      <span className="font-semibold text-red-600 tabular-nums">
                        {formatCurrency(summary.totalWithdrawal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                        <BarChart3 className="h-3.5 w-3.5" />
                        순현금흐름
                      </span>
                      <span className={`font-bold tabular-nums ${netFlow >= 0 ? "text-blue-600" : "text-red-600"}`}>
                        {netFlow >= 0 ? "+" : ""}{formatCurrency(summary.netCashFlow)}
                      </span>
                    </div>
                    {summary.highAmountCount !== null && summary.highAmountCount > 0 && (
                      <div className="flex items-center justify-between text-sm pt-2 border-t">
                        <span className="text-muted-foreground text-xs">고액 거래</span>
                        <Badge variant="outline" className="text-xs">{summary.highAmountCount}건</Badge>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })
        ) : (
          <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Calendar className="h-12 w-12 text-muted-foreground mb-4 opacity-30" />
              <p className="text-base font-medium text-muted-foreground">생성된 월 마감이 없습니다.</p>
              <p className="text-sm text-muted-foreground mt-1">"월간 마감" 탭에서 월 집계를 생성해주세요.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
