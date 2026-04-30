/**
 * F-3 Deviation 트렌드 분석 페이지 (CP-3-k)
 *
 * 영업 데모 / 감사 보고서 / QA 회의용 차트 모음.
 * 4개 차트:
 *   1. CCP type 별 빈도 (top 10) — bar
 *   2. 일자별 추이 (line)
 *   3. severity (priority) 분포 — pie
 *   4. 시간대 분포 (0~23시) — bar
 *
 * 데이터 소스: trpc.f3Trends.* (서버에서 집계)
 * 기간: 7 / 14 / 30 / 90 일 선택
 *
 * 라우트: /dashboard/haccp/f3-trends
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { TrendingUp, BarChart3 as BarIcon, PieChart as PieIcon, Clock } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

const PERIODS = [
  { value: 7, label: "7일" },
  { value: 14, label: "14일" },
  { value: 30, label: "30일" },
  { value: 90, label: "90일" },
] as const;

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#dc2626", // red-600
  high: "#ea580c", // orange-600
  medium: "#ca8a04", // yellow-600
  low: "#65a30d", // lime-600
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "긴급 (critical)",
  high: "높음 (major)",
  medium: "보통 (minor)",
  low: "낮음",
};

export default function DeviationTrends() {
  const [days, setDays] = useState<number>(30);

  const byCcpQuery = trpc.f3Trends.byCcpType.useQuery({ days });
  const dailyQuery = trpc.f3Trends.daily.useQuery({ days });
  const bySevQuery = trpc.f3Trends.bySeverity.useQuery({ days });
  const byHourQuery = trpc.f3Trends.byHour.useQuery({ days });

  const totalDeviations = (dailyQuery.data ?? []).reduce(
    (sum, d) => sum + d.count,
    0,
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-blue-600" />
              CCP Deviation 트렌드 분석
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              지난 {days}일 — 총 {totalDeviations}건. 영업 데모 / 감사 보고서 / QA 회의용.
            </p>
          </div>
          <div className="flex gap-2">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                variant={days === p.value ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* 1. CCP type 별 빈도 + severity 분포 (2단 grid) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarIcon className="w-4 h-4" />
                CCP type 별 빈도 (Top 10)
              </CardTitle>
              <CardDescription>가장 자주 이탈하는 공정 — 우선 개선 대상</CardDescription>
            </CardHeader>
            <CardContent>
              {byCcpQuery.data && byCcpQuery.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={byCcpQuery.data} layout="vertical" margin={{ left: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="ccpType" width={80} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3b82f6" name="이탈 건수" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label={`최근 ${days}일 이탈 0건`} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <PieIcon className="w-4 h-4" />
                심각도 분포
              </CardTitle>
              <CardDescription>urgent/high/medium/low — 위험도 평가</CardDescription>
            </CardHeader>
            <CardContent>
              {bySevQuery.data && bySevQuery.data.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={bySevQuery.data}
                      dataKey="count"
                      nameKey="priority"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={(entry: any) =>
                        `${PRIORITY_LABELS[entry.priority] ?? entry.priority}: ${entry.count}`
                      }
                    >
                      {bySevQuery.data.map((entry, idx) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={PRIORITY_COLORS[entry.priority] ?? "#9ca3af"}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart label={`최근 ${days}일 이탈 0건`} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* 2. 일자별 추이 (full width) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              일자별 추이
            </CardTitle>
            <CardDescription>
              감소세 / 증가세 / 특정 일 spike 식별. 0건 일자는 자동 생략.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dailyQuery.data && dailyQuery.data.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyQuery.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name="이탈 건수"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label={`최근 ${days}일 이탈 0건`} />
            )}
          </CardContent>
        </Card>

        {/* 3. 시간대 분포 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4" />
              시간대 분포 (0~23시)
            </CardTitle>
            <CardDescription>야간 vs 주간 / 교대 시간대 패턴 분석</CardDescription>
          </CardHeader>
          <CardContent>
            {byHourQuery.data && byHourQuery.data.some((h) => h.count > 0) ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byHourQuery.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(h) => `${h}시`}
                  />
                  <YAxis />
                  <Tooltip labelFormatter={(h) => `${h}시`} />
                  <Bar dataKey="count" fill="#8b5cf6" name="이탈 건수" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart label={`최근 ${days}일 이탈 0건`} />
            )}
          </CardContent>
        </Card>

        {/* 활용 안내 */}
        <Card className="bg-muted/30 border-dashed">
          <CardHeader>
            <CardTitle className="text-sm">활용 시나리오</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-1">
            <p>• <strong>영업 데모</strong>: "지난 30일 자동 감지 + 처리량 시각화"</p>
            <p>• <strong>QA 회의</strong>: 가장 자주 이탈하는 공정 → 개선 우선순위</p>
            <p>• <strong>감사 보고서</strong>: 시간대/심각도 분포 → 시스템 작동 증거</p>
            <p>• <strong>운영 모니터링</strong>: 일자별 추이 spike → 근본원인 추적</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[260px] text-sm text-muted-foreground">
      {label}
    </div>
  );
}
