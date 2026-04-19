import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, TrendingUp, TrendingDown, FileText, Lock, CheckCircle, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function AccountingMonthlySummary() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const { data: summaries, isLoading, refetch } = trpc.accountingMonthly.list.useQuery({
    limit: 12,
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" />임시저장</Badge>;
      case "confirmed":
        return <Badge variant="default" className="gap-1 bg-blue-500"><CheckCircle className="h-3 w-3" />확정</Badge>;
      case "locked":
        return <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />잠금</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">월 마감 관리</h1>
            <p className="text-muted-foreground mt-1">
              일일 마감 데이터 기반 월간 집계 및 리포트 생성
            </p>
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
            summaries.map((summary: any) => (
              <Link key={summary.id} href={`/accounting/monthly-summary/${summary.year}/${summary.month}`}>
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">
                        {summary.year}년 {summary.month}월
                      </CardTitle>
                      {getStatusBadge(summary.status)}
                    </div>
                    <CardDescription>
                      마감일: {summary.closedDays}/{summary.totalDays}일
                      {summary.missingDays && JSON.parse(summary.missingDays).length > 0 && (
                        <span className="text-red-500 ml-2">
                          (누락 {JSON.parse(summary.missingDays).length}일)
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        총 입금
                      </span>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(summary.totalDeposit)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <TrendingDown className="h-4 w-4 text-red-500" />
                        총 출금
                      </span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(summary.totalWithdrawal)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm pt-2 border-t">
                      <span className="text-muted-foreground font-medium">순현금흐름</span>
                      <span className={`font-bold ${parseFloat(summary.netCashFlow) >= 0 ? "text-blue-600" : "text-red-600"}`}>
                        {formatCurrency(summary.netCashFlow)}
                      </span>
                    </div>
                    {summary.highAmountCount !== null && summary.highAmountCount > 0 && (
                      <div className="flex items-center justify-between text-sm pt-2 border-t">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <FileText className="h-4 w-4" />
                          고액 거래
                        </span>
                        <span className="font-semibold">{summary.highAmountCount}건</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))
          ) : (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  생성된 월 마감이 없습니다.
                  <br />
                  새 월 마감을 생성해주세요.
                </p>
                <Link href="/accounting/monthly-summary/new">
                  <Button className="mt-4">
                    <Calendar className="mr-2 h-4 w-4" />
                    새 월 마감 생성
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
