import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, TrendingDown, Minus, BarChart3, Package } from "lucide-react";

export default function InventoryAnalytics() {
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    return date.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  const { data: turnoverData, isLoading: turnoverLoading } = trpc.inventory.getTurnoverAnalysis.useQuery({
    startDate,
    endDate,
  });

  const { data: efficiencyMetrics, isLoading: metricsLoading } = trpc.inventory.getEfficiencyMetrics.useQuery({
    startDate,
    endDate,
  });

  const getEfficiencyIcon = (efficiency: string) => {
    switch (efficiency) {
      case "high":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "medium":
        return <Minus className="h-4 w-4 text-yellow-500" />;
      case "low":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getEfficiencyBadge = (efficiency: string) => {
    switch (efficiency) {
      case "high":
        return <Badge variant="default" className="bg-green-500">높음</Badge>;
      case "medium":
        return <Badge variant="secondary" className="bg-yellow-500">보통</Badge>;
      case "low":
        return <Badge variant="destructive">낮음</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">재고 회전율 분석</h1>
        <p className="text-muted-foreground mt-2">
          원재료별 재고 회전율, 평균 보유 기간, 재고 효율성 지표를 확인하세요.
        </p>
      </div>

      {/* 기간 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>분석 기간</CardTitle>
          <CardDescription>재고 회전율을 분석할 기간을 선택하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">시작 날짜</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">종료 날짜</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button className="w-full">
                <BarChart3 className="mr-2 h-4 w-4" />
                분석 실행
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 전체 효율성 지표 */}
      {efficiencyMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">평균 회전율</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{efficiencyMetrics.averageTurnoverRate.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground mt-1">회/년</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">평균 보유 기간</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{efficiencyMetrics.averageHoldingPeriod.toFixed(0)}</div>
              <p className="text-xs text-muted-foreground mt-1">일</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">고효율 원재료</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{efficiencyMetrics.highEfficiencyCount}</div>
              <p className="text-xs text-muted-foreground mt-1">개</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">저효율 원재료</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-500">{efficiencyMetrics.lowEfficiencyCount}</div>
              <p className="text-xs text-muted-foreground mt-1">개</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 원재료별 회전율 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>원재료별 재고 회전율</CardTitle>
          <CardDescription>각 원재료의 재고 회전율과 효율성을 확인하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          {turnoverLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">데이터를 불러오는 중...</div>
            </div>
          ) : !turnoverData || turnoverData.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Package className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">재고 회전율 데이터가 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>원재료</TableHead>
                    <TableHead className="text-right">사용량</TableHead>
                    <TableHead className="text-right">평균 재고</TableHead>
                    <TableHead className="text-right">회전율</TableHead>
                    <TableHead className="text-right">보유 기간</TableHead>
                    <TableHead>효율성</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {turnoverData.map((material) => (
                    <TableRow key={material.materialId}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{material.materialName}</div>
                          <div className="text-sm text-muted-foreground">{material.materialCode}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{material.usageQuantity.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{material.averageInventory.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {getEfficiencyIcon(material.efficiency)}
                          <span className="font-medium">{material.turnoverRate.toFixed(2)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{material.averageHoldingPeriod.toFixed(0)}일</TableCell>
                      <TableCell>{getEfficiencyBadge(material.efficiency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 효율성 개선 제안 */}
      {turnoverData && turnoverData.filter((m) => m.efficiency === "low").length > 0 && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-yellow-500" />
              효율성 개선 제안
            </CardTitle>
            <CardDescription>재고 회전율이 낮은 원재료에 대한 개선 제안입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {turnoverData
                .filter((m) => m.efficiency === "low")
                .slice(0, 5)
                .map((material) => (
                  <li key={material.materialId} className="flex items-start gap-2">
                    <span className="text-yellow-500">•</span>
                    <div>
                      <span className="font-medium">{material.materialName}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        - 회전율 {material.turnoverRate.toFixed(2)}, 보유 기간{" "}
                        {material.averageHoldingPeriod.toFixed(0)}일. 발주량 감소 또는 사용량 증가를 검토하세요.
                      </span>
                    </div>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
