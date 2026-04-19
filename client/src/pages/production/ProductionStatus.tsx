import { useState } from "react";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Activity, Package, Calendar, CheckCircle, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function ProductionStatus() {
  const L = useIndustryLabel();
  const [activeTab, setActiveTab] = useTabWithUrl('tab', 'today');
  const [chartPeriod, setChartPeriod] = useState<"daily" | "weekly" | "monthly">("daily");

  // 서버사이드 통계 (전체 배치 기반 정확한 집계)
  const { data: stats, isLoading: statsLoading } = trpc.batch.productionStats.useQuery({});
  const { data: chartData = [] } = trpc.batch.productionChartData.useQuery({ period: chartPeriod });

  const todayBatches = stats?.todayBatches || [];
  const inProgressBatches = stats?.inProgressBatches || [];
  const completedTodayBatches = stats?.completedTodayBatches || [];

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      planned: "secondary",
      in_progress: "default",
      completed: "default",
      cancelled: "destructive",
    };
    const labels: Record<string, string> = {
      planned: "계획",
      in_progress: "진행중",
      completed: "완료",
      cancelled: "취소",
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const renderBatchTable = (batches: any[], dateField: "plannedDate" | "endTime" | "createdAt" = "plannedDate") => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{`${L("batch")} 코드`}</TableHead>
          <TableHead>{L("product")}</TableHead>
          <TableHead>계획 수량</TableHead>
          <TableHead>실제 수량</TableHead>
          <TableHead>{dateField === "endTime" ? "완료일" : "계획일"}</TableHead>
          <TableHead>상태</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((batch: any) => (
          <TableRow key={batch.id}>
            <TableCell className="font-medium">{batch.batchCode}</TableCell>
            <TableCell>
              <div>
                <div className="font-medium">{batch.productName || "알 수 없음"}</div>
                {batch.productCode && (
                  <div className="text-sm text-muted-foreground">{batch.productCode}</div>
                )}
              </div>
            </TableCell>
            <TableCell>{batch.plannedQuantity}</TableCell>
            <TableCell>{batch.actualQuantity || "-"}</TableCell>
            <TableCell>
              {batch[dateField]
                ? new Date(batch[dateField]).toLocaleDateString("ko-KR")
                : batch.plannedDate
                  ? new Date(batch.plannedDate).toLocaleDateString("ko-KR")
                  : "-"}
            </TableCell>
            <TableCell>{getStatusBadge(batch.status)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">오늘 계획</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.todayPlanned || 0}</div>
            <p className="text-xs text-muted-foreground">{L("batch")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">진행중</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.inProgress || 0}</div>
            <p className="text-xs text-muted-foreground">{L("batch")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">오늘 완료</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.completedToday || 0}</div>
            <p className="text-xs text-muted-foreground">{L("batch")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 배치</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">누적</p>
          </CardContent>
        </Card>
      </div>

      {/* 생산량 추이 차트 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle>생산량 추이</CardTitle>
          </div>
          <Select value={chartPeriod} onValueChange={(value: "daily" | "weekly" | "monthly") => setChartPeriod(value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="기간 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">일별 (최근 30일)</SelectItem>
              <SelectItem value="weekly">주별 (최근 12주)</SelectItem>
              <SelectItem value="monthly">월별 (최근 12개월)</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              완료된 생산 데이터가 없습니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey={chartPeriod === "daily" ? "date" : chartPeriod === "weekly" ? "week" : "month"}
                  tick={{ fontSize: 12 }}
                />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="quantity"
                  stroke="#8884d8"
                  name="생산량"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="count"
                  stroke="#82ca9d"
                  name="배치 수"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 생산 현황 탭 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="today">오늘</TabsTrigger>
          <TabsTrigger value="in-progress">진행중</TabsTrigger>
          <TabsTrigger value="completed">완료</TabsTrigger>
          <TabsTrigger value="all">전체</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>오늘 생산 계획</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
              ) : todayBatches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  오늘 계획된 배치가 없습니다.
                </div>
              ) : renderBatchTable(todayBatches)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="in-progress" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>진행중인 배치</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
              ) : inProgressBatches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  진행중인 배치가 없습니다.
                </div>
              ) : renderBatchTable(inProgressBatches)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>오늘 완료된 배치</CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
              ) : completedTodayBatches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  오늘 완료된 배치가 없습니다.
                </div>
              ) : renderBatchTable(completedTodayBatches, "endTime")}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>전체 배치 ({stats?.total || 0}건)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                전체 배치는 생산관리 &gt; 배치 탭에서 확인하세요.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
