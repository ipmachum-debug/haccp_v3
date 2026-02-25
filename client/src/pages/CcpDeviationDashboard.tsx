import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, TrendingDown, TrendingUp, Calendar } from "lucide-react";
import { useState } from "react";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function CcpDeviationDashboard() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  
  const { data: stats, isLoading, refetch } = trpc.ccp.getDeviationStats.useQuery({
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
  });
  
  // 차트 색상
  const COLORS = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#10b981',
  };
  
  // 월별 데이터 변환
  const monthlyData = stats?.byMonth.map(item => ({
    month: item.month,
    고위험: item.highSeverityCount,
    중위험: item.mediumSeverityCount,
    저위험: item.lowSeverityCount,
    총계: item.totalCount,
  })) || [];
  
  // 제품별 데이터 변환
  const productData = stats?.byProduct.map(item => ({
    name: item.productName || `제품 ${item.productId}`,
    고위험: item.highSeverityCount,
    중위험: item.mediumSeverityCount,
    저위험: item.lowSeverityCount,
    총계: item.totalCount,
  })) || [];
  
  // CCP 유형별 데이터 변환
  const ccpTypeData = stats?.byCcpType.map(item => ({
    name: item.ccpType,
    value: item.totalCount,
  })) || [];
  
  // 총 이탈 건수 계산
  const totalDeviations = stats?.byMonth.reduce((sum, item) => sum + item.totalCount, 0) || 0;
  const highSeverityTotal = stats?.byMonth.reduce((sum, item) => sum + item.highSeverityCount, 0) || 0;
  const mediumSeverityTotal = stats?.byMonth.reduce((sum, item) => sum + item.mediumSeverityCount, 0) || 0;
  const lowSeverityTotal = stats?.byMonth.reduce((sum, item) => sum + item.lowSeverityCount, 0) || 0;
  
  return (
    

    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">CCP 이탈 추이 대시보드</h1>
          <p className="text-muted-foreground mt-1">
            월별/제품별 CCP 이탈 통계를 분석하여 품질 관리 개선점을 파악합니다
          </p>
        </div>
      </div>
      
      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            기간 필터
          </CardTitle>
          <CardDescription>분석할 기간을 선택하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">시작일</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">종료일</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={() => refetch()} className="w-full">
                조회
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">총 이탈 건수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{totalDeviations}</span>
              <AlertTriangle className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">고위험 이탈</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-red-600">{highSeverityTotal}</span>
              <TrendingUp className="h-8 w-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">중위험 이탈</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-orange-600">{mediumSeverityTotal}</span>
              <TrendingDown className="h-8 w-8 text-orange-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">저위험 이탈</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-green-600">{lowSeverityTotal}</span>
              <TrendingDown className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* 월별 추이 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>월별 CCP 이탈 추이</CardTitle>
          <CardDescription>시간에 따른 CCP 이탈 건수 변화를 확인합니다</CardDescription>
        </CardHeader>
        <CardContent>
          {monthlyData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              선택한 기간에 데이터가 없습니다
            </div>
          ) : (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="고위험" stroke={COLORS.high} strokeWidth={2} />
                  <Line type="monotone" dataKey="중위험" stroke={COLORS.medium} strokeWidth={2} />
                  <Line type="monotone" dataKey="저위험" stroke={COLORS.low} strokeWidth={2} />
                  <Line type="monotone" dataKey="총계" stroke="#6366f1" strokeWidth={3} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* 제품별 이탈 현황 */}
      <Card>
        <CardHeader>
          <CardTitle>제품별 CCP 이탈 현황</CardTitle>
          <CardDescription>제품별 이탈 건수를 비교합니다</CardDescription>
        </CardHeader>
        <CardContent>
          {productData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              선택한 기간에 데이터가 없습니다
            </div>
          ) : (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="고위험" fill={COLORS.high} />
                  <Bar dataKey="중위험" fill={COLORS.medium} />
                  <Bar dataKey="저위험" fill={COLORS.low} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* CCP 유형별 분포 */}
      <Card>
        <CardHeader>
          <CardTitle>CCP 유형별 이탈 분포</CardTitle>
          <CardDescription>CCP 유형별 이탈 건수 비율을 확인합니다</CardDescription>
        </CardHeader>
        <CardContent>
          {ccpTypeData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              선택한 기간에 데이터가 없습니다
            </div>
          ) : (
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={ccpTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}건`}
                    outerRadius={120}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {ccpTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][index % 5]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  
    
  );
}
