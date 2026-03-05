import { useState } from "react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Receipt, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import ProductionEfficiency from "./ProductionEfficiency";
import InventoryTrend from "./InventoryTrend";
import PurchaseProposalHistory from "./PurchaseProposalHistory";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "../lib/trpc";

function formatKRW(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}백만`;
  }
  if (Math.abs(amount) >= 10_000) {
    return `${(amount / 10_000).toFixed(0)}만`;
  }
  return amount.toLocaleString();
}

function FinancialSummaryWidget() {
  const { data: summary, isLoading } = trpc.financialReports.dashboardSummary.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="pt-6">
              <div className="h-4 bg-muted rounded w-20 mb-2" />
              <div className="h-8 bg-muted rounded w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const netSign = summary.netIncome > 0 ? "positive" : summary.netIncome < 0 ? "negative" : "neutral";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <DollarSign className="h-5 w-5 text-green-600" />
          재무 요약
        </h2>
        <Badge variant="outline" className="text-xs">
          {summary.period}
        </Badge>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* 매출 */}
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">매출(수익)</p>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </div>
            <p className="text-2xl font-bold text-green-700 mt-1">
              {formatKRW(summary.totalRevenue)}
              <span className="text-sm font-normal text-muted-foreground ml-1">원</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.revenueItems}개 계정
            </p>
          </CardContent>
        </Card>

        {/* 비용 */}
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">비용(지출)</p>
              <Receipt className="h-4 w-4 text-red-600" />
            </div>
            <p className="text-2xl font-bold text-red-700 mt-1">
              {formatKRW(summary.totalExpenses)}
              <span className="text-sm font-normal text-muted-foreground ml-1">원</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.expenseItems}개 계정
            </p>
          </CardContent>
        </Card>

        {/* 순이익 */}
        <Card className={`${
          netSign === "positive" ? "border-blue-200 bg-blue-50/30" :
          netSign === "negative" ? "border-orange-200 bg-orange-50/30" :
          "border-gray-200 bg-gray-50/30"
        }`}>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">순이익</p>
              {netSign === "positive" ? (
                <ArrowUpRight className="h-4 w-4 text-blue-600" />
              ) : netSign === "negative" ? (
                <ArrowDownRight className="h-4 w-4 text-orange-600" />
              ) : (
                <Minus className="h-4 w-4 text-gray-500" />
              )}
            </div>
            <p className={`text-2xl font-bold mt-1 ${
              netSign === "positive" ? "text-blue-700" :
              netSign === "negative" ? "text-orange-700" :
              "text-gray-700"
            }`}>
              {summary.netIncome >= 0 ? "" : "-"}{formatKRW(Math.abs(summary.netIncome))}
              <span className="text-sm font-normal text-muted-foreground ml-1">원</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              수익 - 비용
            </p>
          </CardContent>
        </Card>

        {/* 이익률 */}
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">이익률</p>
              <TrendingDown className="h-4 w-4 text-purple-600" />
            </div>
            <p className="text-2xl font-bold text-purple-700 mt-1">
              {summary.totalRevenue > 0
                ? `${((summary.netIncome / summary.totalRevenue) * 100).toFixed(1)}%`
                : "0%"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              순이익 / 매출
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function IntegratedDashboard() {
  const [activeTab, setActiveTab] = useState("production");

  return (
    <DashboardLayout>
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">통합 대시보드</h1>
          <p className="text-muted-foreground mt-2">
            생산 효율성, 재고 추이, 발주 제안, 재무 현황을 한눈에 확인하세요
          </p>
        </div>
      </div>

      {/* P5-3: 재무 요약 위젯 */}
      <FinancialSummaryWidget />

      <Card>
        <CardHeader>
          <CardTitle>대시보드 메뉴</CardTitle>
          <CardDescription>원하는 대시보드를 선택하여 데이터를 확인합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="production">생산 효율성</TabsTrigger>
              <TabsTrigger value="inventory">재고 추이</TabsTrigger>
              <TabsTrigger value="purchase">발주 제안 이력</TabsTrigger>
            </TabsList>
            <TabsContent value="production" className="mt-6">
              <ProductionEfficiency />
            </TabsContent>
            <TabsContent value="inventory" className="mt-6">
              <InventoryTrend />
            </TabsContent>
            <TabsContent value="purchase" className="mt-6">
              <PurchaseProposalHistory />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
