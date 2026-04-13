import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AlertTriangle } from "lucide-react";

export default function InventoryForecastDashboard() {
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [forecastDays, setForecastDays] = useState(90);

  // 고도화된 재고 예측 데이터 조회
  const { data: forecasts, isLoading } = trpc.inventory.getAdvancedForecast.useQuery({ days: forecastDays });

  // 선택된 원재료 필터링
  const selectedForecast = forecasts?.find((f: any) => f && f.materialId === selectedMaterialId) || null;

  // 전체 원재료 목록 (선택 드롭다운용)
  const materialOptions = forecasts?.filter((f: any) => f !== null) || [];

  // 자동 선택: 첫 번째 원재료 또는 critical 상태 원재료
  if (!selectedMaterialId && materialOptions.length > 0) {
    const criticalMaterial = materialOptions.find((f: any) => f?.status === "critical");
    setSelectedMaterialId(criticalMaterial?.materialId || materialOptions[0]?.materialId || null);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">재고 예측 대시보드</h1>
          <p className="text-muted-foreground">고도화된 예측 알고리즘 (계절성, 요일별 패턴, LLM 분석)</p>
        </div>
        <div className="flex gap-4">
          <Select value={forecastDays.toString()} onValueChange={(v) => setForecastDays(Number(v))}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">최근 30일 기준</SelectItem>
              <SelectItem value="60">최근 60일 기준</SelectItem>
              <SelectItem value="90">최근 90일 기준</SelectItem>
              <SelectItem value="180">최근 180일 기준</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading && <div>데이터 로딩 중...</div>}

      {!isLoading && forecasts && (
        <>
          {/* 전체 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">전체 원재료</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{materialOptions.length}개</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-600">긴급 (7일 이내)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {materialOptions.filter((f: any) => f?.status === "critical").length}개
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-yellow-600">경고 (14일 이내)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {materialOptions.filter((f: any) => f?.status === "warning").length}개
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-600">정상</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {materialOptions.filter((f: any) => f?.status === "normal").length}개
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 원재료 선택 */}
          <Card>
            <CardHeader>
              <CardTitle>원재료 선택</CardTitle>
              <CardDescription>상세 예측 정보를 확인할 원재료를 선택하세요</CardDescription>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedMaterialId?.toString() || ""}
                onValueChange={(v) => setSelectedMaterialId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="원재료를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {materialOptions.map((forecast: any) => (
                    <SelectItem key={forecast?.materialId} value={forecast?.materialId?.toString() || ""}>
                      {forecast?.materialName} - {forecast?.status === "critical" ? "🔴" : forecast?.status === "warning" ? "🟡" : "🟢"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* 선택된 원재료 상세 정보 */}
          {selectedForecast && (
            <>
              {/* 예측 요약 */}
              <Card>
                <CardHeader>
                  <CardTitle>{selectedForecast.materialName} - 예측 요약</CardTitle>
                  <CardDescription>
                    <Badge
                      variant={
                        selectedForecast.status === "critical"
                          ? "destructive"
                          : selectedForecast.status === "warning"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {selectedForecast.status === "critical"
                        ? "긴급"
                        : selectedForecast.status === "warning"
                        ? "경고"
                        : "정상"}
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">현재 재고</p>
                      <p className="text-2xl font-bold">
                        {selectedForecast.currentStock.toFixed(2)} {selectedForecast.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">일평균 사용량</p>
                      <p className="text-2xl font-bold">
                        {selectedForecast.avgDailyUsage.toFixed(2)} {selectedForecast.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">소진 예상 일수</p>
                      <p className="text-2xl font-bold">{selectedForecast.daysUntilDepletion}일</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">예측 신뢰도</p>
                      <p className="text-2xl font-bold">{selectedForecast.confidence}%</p>
                    </div>
                  </div>

                  {selectedForecast.depletionDate && (
                    <Alert variant={selectedForecast.status === "critical" ? "destructive" : "default"}>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        예상 소진 날짜: {new Date(selectedForecast.depletionDate).toLocaleDateString("ko-KR")}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* LLM 분석 결과 */}
                  <div className="p-4 bg-muted rounded-lg">
                    <h4 className="font-semibold mb-2">AI 분석 결과</h4>
                    <p className="text-sm">{selectedForecast.llmReasoning}</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      LLM 보정 계수: {selectedForecast.llmAdjustment}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* 패턴 분석 차트 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 계절성 패턴 */}
                <Card>
                  <CardHeader>
                    <CardTitle>계절성 패턴</CardTitle>
                    <CardDescription>월별 소비 패턴 분석</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { month: "현재 월", factor: selectedForecast.seasonalityFactor },
                            { month: "평균", factor: 1.0 },
                          ]}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="factor" fill="#8884d8" name="계절성 계수" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">
                      현재 월의 계절성 계수: <strong>{selectedForecast.seasonalityFactor}</strong>
                      {selectedForecast.seasonalityFactor > 1.0 ? (
                        <span className="text-red-600"> (평균 대비 높음)</span>
                      ) : selectedForecast.seasonalityFactor < 1.0 ? (
                        <span className="text-green-600"> (평균 대비 낮음)</span>
                      ) : (
                        <span> (평균 수준)</span>
                      )}
                    </p>
                  </CardContent>
                </Card>

                {/* 요일별 패턴 */}
                <Card>
                  <CardHeader>
                    <CardTitle>요일별 패턴</CardTitle>
                    <CardDescription>요일별 소비 패턴 분석</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={[
                            { day: "현재 요일", factor: selectedForecast.dayOfWeekFactor },
                            { day: "평균", factor: 1.0 },
                          ]}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="factor" fill="#82ca9d" name="요일 계수" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-sm text-muted-foreground mt-4">
                      현재 요일의 소비 계수: <strong>{selectedForecast.dayOfWeekFactor}</strong>
                      {selectedForecast.dayOfWeekFactor > 1.0 ? (
                        <span className="text-red-600"> (평균 대비 높음)</span>
                      ) : selectedForecast.dayOfWeekFactor < 1.0 ? (
                        <span className="text-green-600"> (평균 대비 낮음)</span>
                      ) : (
                        <span> (평균 수준)</span>
                      )}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* 공휴일 영향 분석 */}
              <Card>
                <CardHeader>
                  <CardTitle>공휴일 영향 분석</CardTitle>
                  <CardDescription>공휴일과 평일의 소비 패턴 비교</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { type: "공휴일", factor: selectedForecast.holidayFactor },
                          { type: "평일", factor: 1.0 },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="type" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="factor" fill="#ffc658" name="소비 계수" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    공휴일 소비 계수: <strong>{selectedForecast.holidayFactor}</strong>
                    {selectedForecast.holidayFactor > 1.0 ? (
                      <span className="text-red-600"> (평일 대비 높음)</span>
                    ) : selectedForecast.holidayFactor < 1.0 ? (
                      <span className="text-green-600"> (평일 대비 낮음)</span>
                    ) : (
                      <span> (평일과 동일)</span>
                    )}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}
