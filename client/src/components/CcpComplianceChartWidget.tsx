import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp } from "lucide-react";

import { formatLocalDate } from "../lib/dateUtils";

export function CcpComplianceChartWidget() {
  const [period, setPeriod] = useState<"weekly" | "monthly">("monthly");
  
  // 최근 6개월 데이터 조회
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  
  const { data: complianceData, isLoading: loadingCompliance } = trpc.ccp.getComplianceStats.useQuery({
    period,
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  });
  
  const { data: deviationData, isLoading: loadingDeviation } = trpc.ccp.getDeviationTrend.useQuery({
    period,
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
  });
  
  if (loadingCompliance || loadingDeviation) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            CCP 점검 현황
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">로딩 중...</div>
        </CardContent>
      </Card>
    );
  }
  
  // 차트 데이터 병합
  const chartData = complianceData?.map((c: any, index: any) => ({
    period: c.period,
    complianceRate: parseFloat(c.complianceRate),
    deviationCount: deviationData?.[index]?.deviationCount || 0,
    totalChecks: c.totalChecks,
  })) || [];
  
  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-500" />
            CCP 점검 현황
          </CardTitle>
          <Select value={period} onValueChange={(v) => setPeriod(v as "weekly" | "monthly")}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">주별</SelectItem>
              <SelectItem value="monthly">월별</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* 준수율 차트 */}
          <div>
            <h4 className="text-sm font-medium mb-3">CCP 준수율 추이</h4>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="complianceRate" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  name="준수율 (%)" 
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          
          {/* 이탈 건수 차트 */}
          <div>
            <h4 className="text-sm font-medium mb-3">CCP 이탈 건수 추이</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="deviationCount" fill="#ef4444" name="이탈 건수" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          
          {/* 요약 통계 */}
          {chartData.length > 0 && (
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {(chartData.reduce((sum: any, d: any) => sum + d.complianceRate, 0) / chartData.length).toFixed(1)}%
                </div>
                <div className="text-xs text-muted-foreground">평균 준수율</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600">
                  {chartData.reduce((sum: any, d: any) => sum + d.deviationCount, 0)}
                </div>
                <div className="text-xs text-muted-foreground">총 이탈 건수</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {chartData.reduce((sum: any, d: any) => sum + d.totalChecks, 0)}
                </div>
                <div className="text-xs text-muted-foreground">총 점검 건수</div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
