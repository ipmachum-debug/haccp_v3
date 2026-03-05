import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { TrendingUp, TrendingDown, DollarSign, Package } from "lucide-react";

export default function BatchProfitabilityDashboard() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return date.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const { data: profitabilityData, isLoading } = trpc.batch.getProfitabilityByProduct.useQuery({
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  });
  
  const { data: monthlyTrend } = trpc.batch.getProfitabilityTrendByMonth.useQuery({
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  });
  
  const { data: quarterlyTrend } = trpc.batch.getProfitabilityTrendByQuarter.useQuery({
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  });
  
  const { data: forecastData } = trpc.batch.getProfitabilityForecast.useQuery();
  const { data: forecastHistory } = trpc.batch.getForecastHistory.useQuery();

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF6B6B'];

  const topProducts = profitabilityData?.slice(0, 10) || [];
  const bottomProducts = profitabilityData?.slice(-10).reverse() || [];

  const totalRevenue = profitabilityData?.reduce((sum, p) => sum + p.totalRevenue, 0) || 0;
  const totalCost = profitabilityData?.reduce((sum, p) => sum + (p.avgCost * p.batchCount), 0) || 0;
  const totalProfit = totalRevenue - totalCost;
  const avgMargin = profitabilityData && profitabilityData.length > 0
    ? profitabilityData.reduce((sum, p) => sum + p.profitMargin, 0) / profitabilityData.length
    : 0;

  return (
    

    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">배치 수익성 분석 대시보드</h1>
          <p className="text-muted-foreground">제품별 수익률 및 원가 분석</p>
        </div>
      </div>

      {/* 기간 필터 */}
      <Card>
        <CardHeader>
          <CardTitle>기간 설정</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="startDate">시작 날짜</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="endDate">종료 날짜</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 매출액</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRevenue.toLocaleString()}원</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 원가</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCost.toLocaleString()}원</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 이익</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProfit.toLocaleString()}원</div>
            <p className="text-xs text-muted-foreground mt-1">
              이익률: {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 이익률</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgMargin.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">데이터를 불러오는 중...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 수익성 상위 제품 */}
          <Card>
            <CardHeader>
              <CardTitle>수익성 상위 10개 제품</CardTitle>
              <CardDescription>이익률 기준 상위 제품</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topProducts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="productName" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="profitMargin" fill="#10b981" name="이익률 (%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 수익성 하위 제품 */}
          <Card>
            <CardHeader>
              <CardTitle>수익성 하위 10개 제품</CardTitle>
              <CardDescription>이익률 기준 하위 제품 (개선 필요)</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={bottomProducts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="productName" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="profitMargin" fill="#ef4444" name="이익률 (%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 제품별 매출 비중 */}
          <Card>
            <CardHeader>
              <CardTitle>제품별 매출 비중</CardTitle>
              <CardDescription>상위 8개 제품의 매출 비중</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={topProducts.slice(0, 8)}
                    dataKey="totalRevenue"
                    nameKey="productName"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={(entry) => `${entry.productName}: ${((entry.totalRevenue / totalRevenue) * 100).toFixed(1)}%`}
                  >
                    {topProducts.slice(0, 8).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 월별 수익률 추이 */}
          <Card>
            <CardHeader>
              <CardTitle>월별 수익률 추이</CardTitle>
              <CardDescription>월별 매출, 원가, 이익률 추이</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={monthlyTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="totalRevenue" stroke="#0088FE" name="총 매출액" />
                  <Line yAxisId="left" type="monotone" dataKey="totalCost" stroke="#FF8042" name="총 원가" />
                  <Line yAxisId="right" type="monotone" dataKey="profitMargin" stroke="#00C49F" name="이익률 (%)" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          {/* 예측 정확도 비교 차트 */}
          <Card>
            <CardHeader>
              <CardTitle>예측 정확도 분석</CardTitle>
              <CardDescription>실제값 vs 예측값 비교 (최근 12개월)</CardDescription>
            </CardHeader>
            <CardContent>
              {forecastHistory && forecastHistory.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={forecastHistory.filter(f => f.actualRevenue !== null)}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="targetMonth" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="predictedRevenue" stroke="#0088FE" strokeDasharray="5 5" name="예측 매출액" />
                      <Line yAxisId="left" type="monotone" dataKey="actualRevenue" stroke="#0088FE" strokeWidth={2} name="실제 매출액" />
                      <Line yAxisId="right" type="monotone" dataKey="predictedProfitMargin" stroke="#00C49F" strokeDasharray="5 5" name="예측 수익률 (%)" />
                      <Line yAxisId="right" type="monotone" dataKey="actualProfitMargin" stroke="#00C49F" strokeWidth={2} name="실제 수익률 (%)" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      예측 정확도: 실선은 실제값, 점선은 예측값을 나타냅니다. 두 선이 가까울수록 예측 정확도가 높습니다.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8">예측 기록이 없습니다. 예측을 수행하고 월 마감 후 실제값을 입력하면 정확도를 확인할 수 있습니다.</p>
              )}
            </CardContent>
          </Card>
          
          {/* 수익률 예측 차트 */}
          <Card>
            <CardHeader>
              <CardTitle>수익률 예측 (다음 분기)</CardTitle>
              <CardDescription>지수 평활법 + 트렌드 기반 예측</CardDescription>
            </CardHeader>
            <CardContent>
              {forecastData && forecastData.forecast ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-muted-foreground">예상 매출액</p>
                      <p className="text-2xl font-bold text-blue-600">{forecastData.forecast.predictedRevenue.toLocaleString()}원</p>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg">
                      <p className="text-sm text-muted-foreground">예상 원가</p>
                      <p className="text-2xl font-bold text-orange-600">{forecastData.forecast.predictedCost.toLocaleString()}원</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-muted-foreground">예상 이익률</p>
                      <p className="text-2xl font-bold text-green-600">{forecastData.forecast.predictedProfitMargin.toFixed(1)}%</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={400}>
                    <LineChart data={[...forecastData.historicalData, { 
                      month: forecastData.forecast.month, 
                      totalRevenue: forecastData.forecast.predictedRevenue,
                      totalCost: forecastData.forecast.predictedCost,
                      profitMargin: forecastData.forecast.predictedProfitMargin,
                      batchCount: 0,
                      isForecast: true
                    }]}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="totalRevenue" stroke="#0088FE" name="매출액" strokeWidth={2} />
                      <Line yAxisId="left" type="monotone" dataKey="totalCost" stroke="#FF8042" name="원가" strokeWidth={2} />
                      <Line yAxisId="right" type="monotone" dataKey="profitMargin" stroke="#00C49F" name="이익률 (%)" strokeWidth={2} strokeDasharray="5 5" />
                    </LineChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <p className="text-center text-muted-foreground py-8">예측 데이터가 충분하지 않습니다. 최소 3개월 이상의 배치 데이터가 필요합니다.</p>
              )}
            </CardContent>
          </Card>
          
          {/* 분기별 수익률 추이 */}
          <Card>
            <CardHeader>
              <CardTitle>분기별 수익률 추이</CardTitle>
              <CardDescription>분기별 매출, 원가, 이익률 추이</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={quarterlyTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="quarter" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Legend />
                  <Bar yAxisId="left" dataKey="totalRevenue" fill="#0088FE" name="총 매출액" />
                  <Bar yAxisId="left" dataKey="totalCost" fill="#FF8042" name="총 원가" />
                  <Bar yAxisId="right" dataKey="profitMargin" fill="#00C49F" name="이익률 (%)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          
          {/* 제품별 원가 vs 매출 비교 */}
          <Card>
            <CardHeader>
              <CardTitle>제품별 원가 vs 매출 비교</CardTitle>
              <CardDescription>상위 10개 제품의 원가와 매출 비교</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={topProducts}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="productName" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="avgCost" fill="#f59e0b" name="평균 원가 (원)" />
                  <Bar dataKey="totalRevenue" fill="#3b82f6" name="총 매출 (원)" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 상세 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle>제품별 수익성 상세</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">제품명</th>
                      <th className="text-right p-2">배치 수</th>
                      <th className="text-right p-2">평균 원가</th>
                      <th className="text-right p-2">총 매출</th>
                      <th className="text-right p-2">총 이익</th>
                      <th className="text-right p-2">이익률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profitabilityData?.map((product) => (
                      <tr key={product.productId} className="border-b hover:bg-muted/50">
                        <td className="p-2">{product.productName}</td>
                        <td className="text-right p-2">{product.batchCount}</td>
                        <td className="text-right p-2">{product.avgCost.toLocaleString()}원</td>
                        <td className="text-right p-2">{product.totalRevenue.toLocaleString()}원</td>
                        <td className="text-right p-2">{product.totalProfit.toLocaleString()}원</td>
                        <td className="text-right p-2">
                          <span className={product.profitMargin >= 20 ? "text-green-600 font-semibold" : product.profitMargin < 10 ? "text-red-600 font-semibold" : ""}>
                            {product.profitMargin.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  
    
  );
}
