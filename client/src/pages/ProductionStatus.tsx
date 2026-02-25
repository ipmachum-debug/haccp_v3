import { useState, useMemo } from "react";
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

export default function ProductionStatus() {
  const [chartPeriod, setChartPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  // 생산 배치 목록 조회
  const { data: batchData, isLoading: batchesLoading } = trpc.batch.list.useQuery({
    status: undefined,
    limit: 50,
  });

  // 제품 목록 조회 (매칭용)
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);

  const batches = batchData?.items || [];

  // 제품 정보 매칭
  const batchesWithProduct = useMemo(() => {
    if (!products) return batches.map((batch) => ({
      ...batch,
      productName: "알 수 없음" as string,
      productCode: "-" as string,
      unit: "EA" as string,
    }));
    
    return batches.map((batch) => {
      const product = products.find((p) => p.id === batch.productId);
      return {
        ...batch,
        productName: product?.productName || "알 수 없음",
        productCode: product?.productCode || "-",
        unit: product?.unit || "EA",
      };
    });
  }, [batches, products]);

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

  // 오늘 날짜 기준 필터링
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayBatches = batchesWithProduct.filter((batch) => {
    const batchDate = new Date(batch.plannedDate);
    batchDate.setHours(0, 0, 0, 0);
    return batchDate.getTime() === today.getTime();
  });

  const inProgressBatches = batchesWithProduct.filter((batch) => batch.status === "in_progress");
  
  const completedTodayBatches = batchesWithProduct.filter((batch) => {
    if (batch.status !== "completed" || !batch.completedAt) return false;
    const completedDate = new Date(batch.completedAt);
    completedDate.setHours(0, 0, 0, 0);
    return completedDate.getTime() === today.getTime();
  });

  // 차트 데이터 생성
  const chartData = useMemo(() => {
    const completedBatches = batchesWithProduct.filter((batch) => batch.status === "completed" && batch.completedAt);
    
    if (chartPeriod === "daily") {
      // 일별 데이터 (최근 30일)
      const dailyData: Record<string, { date: string; quantity: number; count: number }> = {};
      const last30Days = new Date();
      last30Days.setDate(last30Days.getDate() - 30);
      
      completedBatches.forEach((batch) => {
        const date = new Date(batch.completedAt!);
        if (date >= last30Days) {
          const dateKey = date.toISOString().split("T")[0];
          if (!dailyData[dateKey]) {
            dailyData[dateKey] = { date: dateKey, quantity: 0, count: 0 };
          }
          dailyData[dateKey].quantity += Number(batch.actualQuantity) || 0;
          dailyData[dateKey].count += 1;
        }
      });
      
      return Object.values(dailyData).sort((a, b) => a.date.localeCompare(b.date));
    } else if (chartPeriod === "weekly") {
      // 주별 데이터 (최근 12주)
      const weeklyData: Record<string, { week: string; quantity: number; count: number }> = {};
      const last12Weeks = new Date();
      last12Weeks.setDate(last12Weeks.getDate() - 84);
      
      completedBatches.forEach((batch) => {
        const date = new Date(batch.completedAt!);
        if (date >= last12Weeks) {
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          const weekKey = weekStart.toISOString().split("T")[0];
          
          if (!weeklyData[weekKey]) {
            weeklyData[weekKey] = { week: weekKey, quantity: 0, count: 0 };
          }
          weeklyData[weekKey].quantity += Number(batch.actualQuantity) || 0;
          weeklyData[weekKey].count += 1;
        }
      });
      
      return Object.values(weeklyData).sort((a, b) => a.week.localeCompare(b.week));
    } else {
      // 월별 데이터 (최근 12개월)
      const monthlyData: Record<string, { month: string; quantity: number; count: number }> = {};
      const last12Months = new Date();
      last12Months.setMonth(last12Months.getMonth() - 12);
      
      completedBatches.forEach((batch) => {
        const date = new Date(batch.completedAt!);
        if (date >= last12Months) {
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          
          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { month: monthKey, quantity: 0, count: 0 };
          }
          monthlyData[monthKey].quantity += Number(batch.actualQuantity) || 0;
          monthlyData[monthKey].count += 1;
        }
      });
      
      return Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
    }
  }, [batchesWithProduct, chartPeriod]);

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
            <div className="text-2xl font-bold">{todayBatches.length}</div>
            <p className="text-xs text-muted-foreground">배치</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">진행중</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressBatches.length}</div>
            <p className="text-xs text-muted-foreground">배치</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">오늘 완료</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTodayBatches.length}</div>
            <p className="text-xs text-muted-foreground">배치</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">전체 배치</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batchData?.total || 0}</div>
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
      <Tabs defaultValue="today" className="space-y-4">
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
              {batchesLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : todayBatches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  오늘 계획된 배치가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>배치 코드</TableHead>
                      <TableHead>제품</TableHead>
                      <TableHead>계획 수량</TableHead>
                      <TableHead>실제 수량</TableHead>
                      <TableHead>계획일</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {todayBatches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{batch.batchCode}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{batch.productName}</div>
                            <div className="text-sm text-muted-foreground">
                              {batch.productCode}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{batch.plannedQuantity} {batch.unit}</TableCell>
                        <TableCell>
                          {batch.actualQuantity ? `${batch.actualQuantity} ${batch.unit}` : "-"}
                        </TableCell>
                        <TableCell>
                          {new Date(batch.plannedDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>{getStatusBadge(batch.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="in-progress" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>진행중인 배치</CardTitle>
            </CardHeader>
            <CardContent>
              {batchesLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : inProgressBatches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  진행중인 배치가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>배치 코드</TableHead>
                      <TableHead>제품</TableHead>
                      <TableHead>계획 수량</TableHead>
                      <TableHead>실제 수량</TableHead>
                      <TableHead>시작일</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inProgressBatches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{batch.batchCode}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{batch.productName}</div>
                            <div className="text-sm text-muted-foreground">
                              {batch.productCode}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{batch.plannedQuantity} {batch.unit}</TableCell>
                        <TableCell>
                          {batch.actualQuantity ? `${batch.actualQuantity} ${batch.unit}` : "-"}
                        </TableCell>
                        <TableCell>
                          {new Date(batch.plannedDate).toLocaleString("ko-KR")}
                        </TableCell>
                        <TableCell>{getStatusBadge(batch.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>오늘 완료된 배치</CardTitle>
            </CardHeader>
            <CardContent>
              {batchesLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : completedTodayBatches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  오늘 완료된 배치가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>배치 코드</TableHead>
                      <TableHead>제품</TableHead>
                      <TableHead>계획 수량</TableHead>
                      <TableHead>실제 수량</TableHead>
                      <TableHead>완료일</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {completedTodayBatches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{batch.batchCode}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{batch.productName}</div>
                            <div className="text-sm text-muted-foreground">
                              {batch.productCode}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{batch.plannedQuantity} {batch.unit}</TableCell>
                        <TableCell>
                          {batch.actualQuantity ? `${batch.actualQuantity} ${batch.unit}` : "-"}
                        </TableCell>
                        <TableCell>
                          {batch.completedAt
                            ? new Date(batch.completedAt).toLocaleString("ko-KR")
                            : "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(batch.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>전체 배치 목록</CardTitle>
            </CardHeader>
            <CardContent>
              {batchesLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  로딩 중...
                </div>
              ) : batchesWithProduct.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  배치가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>배치 코드</TableHead>
                      <TableHead>제품</TableHead>
                      <TableHead>계획 수량</TableHead>
                      <TableHead>실제 수량</TableHead>
                      <TableHead>계획일</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchesWithProduct.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-medium">{batch.batchCode}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{batch.productName}</div>
                            <div className="text-sm text-muted-foreground">
                              {batch.productCode}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{batch.plannedQuantity} {batch.unit}</TableCell>
                        <TableCell>
                          {batch.actualQuantity ? `${batch.actualQuantity} ${batch.unit}` : "-"}
                        </TableCell>
                        <TableCell>
                          {new Date(batch.plannedDate).toLocaleDateString("ko-KR")}
                        </TableCell>
                        <TableCell>{getStatusBadge(batch.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
