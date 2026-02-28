import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { Loader2, Calendar } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
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
        <p className="text-muted-foreground">통계 데이터를 불러올 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="container py-6 space-y-6">
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
          <CardDescription>각 알림 타입별 발생 건수</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={stats.typeDistribution}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="count"
              >
                {stats.typeDistribution.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
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
            <BarChart data={stats.avgResolutionTime}>
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
            <LineChart data={stats.unresolvedTrend}>
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
            <div className="text-2xl font-bold">{stats.totalNotifications}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">미해결 알림</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.unresolvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">해결된 알림</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.resolvedCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">평균 해결 시간</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.overallAvgResolutionHours.toFixed(1)}시간</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
