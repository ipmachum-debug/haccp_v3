import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Loader2, Calendar } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { formatLocalDate } from "../../lib/dateUtils";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82ca9d"];

export default function NotificationStatistics() {
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  const { data: stats, isLoading } = trpc.notification.getStatistics.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const setPreset = (days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    setStartDate(formatLocalDate(start));
    setEndDate(formatLocalDate(end));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">통계 데이터를 불러올 수 없습니다. 기간을 선택해주세요.</p>
      </div>
    );
  }

  // Safely access data with defaults to prevent crashes
  const safeTypeDistribution = stats.typeDistribution || [];
  const safeAvgResolutionTime = stats.avgResolutionTime || [];
  const safeUnresolvedTrend = stats.unresolvedTrend || [];
  const safeTotalNotifications = stats.totalNotifications ?? 0;
  const safeUnresolvedCount = stats.unresolvedCount ?? 0;
  const safeResolvedCount = stats.resolvedCount ?? 0;
  const safeOverallAvg = stats.overallAvgResolutionHours ?? 0;

  // 작은 비율 항목을 "기타"로 합침 (5% 미만)
  const totalCount = safeTypeDistribution.reduce((sum: number, d: any) => sum + d.count, 0);
  const THRESHOLD = 0.05; // 5%
  const majorTypes: any[] = [];
  let otherCount = 0;
  for (const item of safeTypeDistribution) {
    if (totalCount > 0 && item.count / totalCount < THRESHOLD) {
      otherCount += item.count;
    } else {
      majorTypes.push(item);
    }
  }
  if (otherCount > 0) {
    majorTypes.push({ name: "기타", count: otherCount });
  }

  // 알림 타입 한글 매핑
  const TYPE_LABELS: Record<string, string> = {
    low_stock_critical: "재고 위험",
    low_stock: "재고 부족",
    expiry_urgent: "유통기한 초과",
    expiry_warning_7d: "유통기한 임박(7일)",
    expiry_warning_3d: "유통기한 임박(3일)",
    ai_alert: "AI 알림",
    batch_incomplete_warning: "배치 미완료",
    daily_closing_report: "일일 마감",
    approval_summary: "승인 요약",
    inventory_expiry: "재고 만료",
    "기타": "기타",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">알림 통계</h1>
        <p className="text-muted-foreground mt-2">
          알림 발생 빈도, 해결 시간, 추이를 확인하세요
        </p>
      </div>

      {/* 기간 필터 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            기간 선택
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="startDate">시작일</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="endDate">종료일</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={() => setPreset(0)}>
                오늘
              </Button>
              <Button variant="outline" onClick={() => setPreset(7)}>
                최근 7일
              </Button>
              <Button variant="outline" onClick={() => setPreset(30)}>
                최근 30일
              </Button>
              <Button variant="outline" onClick={() => setPreset(90)}>
                최근 90일
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
              >
                초기화
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 알림 타입별 발생 빈도 */}
      <Card>
        <CardHeader>
          <CardTitle>알림 타입별 발생 빈도</CardTitle>
          <CardDescription>각 알림 타입별 발생 건수 (5% 미만은 "기타"로 합산)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <PieChart>
              <Pie
                data={majorTypes}
                cx="50%"
                cy="45%"
                outerRadius={110}
                fill="#8884d8"
                dataKey="count"
                label={({ name, percent }) => percent > 0.05 ? `${TYPE_LABELS[name] || name} ${(percent * 100).toFixed(0)}%` : ""}
                labelLine={false}
              >
                {majorTypes.map((_entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: any, name: any) => [value + "건", TYPE_LABELS[name] || name]} />
              <Legend
                formatter={(value: string) => TYPE_LABELS[value] || value}
                wrapperStyle={{ fontSize: "13px", paddingTop: "12px" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 평균 해결 시간 */}
      <Card>
        <CardHeader>
          <CardTitle>평균 해결 시간</CardTitle>
          <CardDescription>알림 타입별 평균 해결 시간 (시간 단위)</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={safeAvgResolutionTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgHours" fill="#8884d8" name="평균 시간" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 미해결 알림 추이 */}
      <Card>
        <CardHeader>
          <CardTitle>미해결 알림 추이</CardTitle>
          <CardDescription>최근 30일간 미해결 알림 추이</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={safeUnresolvedTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="count" stroke="#8884d8" name="미해결 알림" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 통계 요약 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">총 알림 수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeTotalNotifications}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">미해결 알림</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{safeUnresolvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">해결된 알림</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{safeResolvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">평균 해결 시간</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{safeOverallAvg.toFixed(1)}시간</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
