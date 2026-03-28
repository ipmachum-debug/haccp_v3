import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import {
  DollarSign, Loader2,
} from "lucide-react";
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

// ============================================================================
// ERP AI Tab 2: 현금흐름 예측
// ============================================================================
export function CashFlowTab() {
  const data = trpc.ai.forecastCashFlow.useQuery({ days: 30 });
  const forecast = data.data;

  return (
    <div className="space-y-2.5">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-green-600" /> 현금흐름 30일 예측
      </h2>

      {data.isLoading ? (
        <Card><CardContent className="flex items-center justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
      ) : !forecast ? (
        <Card><CardContent className="py-6 text-center text-muted-foreground">데이터 없음</CardContent></Card>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Card><CardContent className="py-2.5 px-3">
              <div className="text-xs text-muted-foreground">현재 잔고</div>
              <div className="text-xl font-bold">{forecast.currentBalance.toLocaleString()}원</div>
            </CardContent></Card>
            <Card><CardContent className="py-2.5 px-3">
              <div className="text-xs text-muted-foreground">30일 후 예상</div>
              <div className={`text-xl font-bold ${forecast.summary.endingBalance < 0 ? "text-red-600" : ""}`}>
                {forecast.summary.endingBalance.toLocaleString()}원
              </div>
            </CardContent></Card>
            <Card className={forecast.summary.dangerDays > 0 ? "border-red-300 bg-red-50" : ""}>
              <CardContent className="py-2.5 px-3">
                <div className="text-xs text-muted-foreground">위험일</div>
                <div className="text-xl font-bold text-red-600">{forecast.summary.dangerDays}일</div>
              </CardContent></Card>
            <Card><CardContent className="py-2.5 px-3">
              <div className="text-xs text-muted-foreground">최저 잔고일</div>
              <div className="text-sm font-medium">{forecast.summary.lowestDate}</div>
              <div className="text-xs">{forecast.summary.lowestBalance.toLocaleString()}원</div>
            </CardContent></Card>
          </div>

          {/* 차트 */}
          <Card>
            <CardContent className="py-2 px-3"><h4 className="text-xs font-semibold">일별 캐시 포지션</h4>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={forecast.dailyForecast}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
                  <Tooltip labelFormatter={(v: string) => v} formatter={(v: number) => `${v.toLocaleString()}원`} contentStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="closingBalance" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.2} name="잔고" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* AP/AR 흐름 */}
          <div className="grid grid-cols-3 gap-2">
            <Card><CardContent className="py-2.5 px-3 text-center">
              <div className="text-xs text-muted-foreground">AP 지출 예정</div>
              <div className="text-lg font-bold text-red-600">{forecast.summary.totalApOutflow.toLocaleString()}원</div>
            </CardContent></Card>
            <Card><CardContent className="py-2.5 px-3 text-center">
              <div className="text-xs text-muted-foreground">AR 회수 예상</div>
              <div className="text-lg font-bold text-green-600">{forecast.summary.totalArInflow.toLocaleString()}원</div>
            </CardContent></Card>
            <Card><CardContent className="py-2.5 px-3 text-center">
              <div className="text-xs text-muted-foreground">운영비 합계</div>
              <div className="text-lg font-bold">{forecast.summary.totalOperating.toLocaleString()}원</div>
            </CardContent></Card>
          </div>

          {/* 권고사항 */}
          {forecast.recommendations.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="py-2 px-3">
                <h4 className="text-xs font-semibold text-blue-700 mb-1">AI 권고사항</h4>
                <div className="text-xs">{forecast.recommendations.map((r: string, i: number) => <div key={i} className="mb-0.5">* {r}</div>)}</div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
