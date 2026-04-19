import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from "lucide-react";
import { Link } from "wouter";

export function AccountingSummaryWidget() {
  const { data, isLoading, error } = trpc.dashboard.getAccountingSummary.useQuery();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            회계 요약
          </CardTitle>
          <CardDescription>이번 달 매입/매출 현황</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">데이터 로딩 중...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            회계 요약
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            데이터 로딩 실패
          </div>
        </CardContent>
      </Card>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
    }).format(amount);
  };

  const isPositiveCashFlow = data.netCashFlow >= 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          회계 요약
        </CardTitle>
        <CardDescription>
          {data.currentYear}년 {data.currentMonth}월 매입/매출 현황
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 매입 합계 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium">매입 합계</span>
          </div>
          <Link href="/purchases-list">
            <a className="text-sm font-bold text-red-600 hover:underline">
              {formatCurrency(data.totalPurchases)}
            </a>
          </Link>
        </div>

        {/* 매출 합계 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">매출 합계</span>
          </div>
          <Link href="/sales-list">
            <a className="text-sm font-bold text-green-600 hover:underline">
              {formatCurrency(data.totalSales)}
            </a>
          </Link>
        </div>

        {/* 순현금흐름 */}
        <div className="flex items-center justify-between border-t pt-3">
          <span className="text-sm font-medium">순현금흐름</span>
          <span
            className={`text-sm font-bold ${
              isPositiveCashFlow ? "text-green-600" : "text-red-600"
            }`}
          >
            {formatCurrency(data.netCashFlow)}
          </span>
        </div>

        {/* 미결제 거래 */}
        {data.pendingTotalCount > 0 && (
          <div className="flex items-center justify-between border-t pt-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm font-medium">미결제 거래</span>
            </div>
            <span className="text-sm font-bold text-yellow-600">
              {data.pendingTotalCount}건
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
