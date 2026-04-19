import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, TrendingUp, Package, Calendar, AlertTriangle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

export default function InventoryForecast() {
  const L = useIndustryLabel();
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);

  // 모든 원재료 구매 추천 조회
  const { data: recommendations, isLoading, refetch } = trpc.inventory.getAllPurchaseRecommendations.useQuery();

  // 선택된 원재료의 사용량 패턴 조회
  const { data: usagePattern } = trpc.inventory.getUsagePattern.useQuery(
    { materialId: selectedMaterialId!, days: 30 },
    { enabled: selectedMaterialId !== null }
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">재고 예측</h1>
          <p className="text-muted-foreground mt-2">
            과거 사용 패턴을 분석하여 재고 부족을 예측하고 구매를 추천합니다
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">재고 예측</h1>
          <p className="text-muted-foreground mt-2">
            과거 사용 패턴을 분석하여 재고 부족을 예측하고 구매를 추천합니다
          </p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            재고 예측 데이터가 없습니다. 재고 거래 내역이 충분히 쌓인 후 다시 확인해주세요.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // 우선순위별 통계
  const highPriorityCount = recommendations.filter((r: any) => r.priority === "high").length;
  const mediumPriorityCount = recommendations.filter((r: any) => r.priority === "medium").length;
  const lowPriorityCount = recommendations.filter((r: any) => r.priority === "low").length;

  // 총 추천 구매 금액 계산 (단가 정보가 있다면)
  const totalRecommendedValue = recommendations.reduce((sum: any, r: any) => {
    return sum + r.recommendedQuantity;
  }, 0);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* 헤더 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">재고 예측</h1>
          <p className="text-muted-foreground mt-2">
            과거 사용 패턴을 분석하여 재고 부족을 예측하고 구매를 추천합니다
          </p>
        </div>
        <Button onClick={() => refetch()} variant="outline">
          새로고침
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">긴급 구매 필요</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500">{highPriorityCount}</div>
            <p className="text-xs text-muted-foreground">7일 이내 재고 소진 예상</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">주의 필요</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{mediumPriorityCount}</div>
            <p className="text-xs text-muted-foreground">14일 이내 재고 소진 예상</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">안정</CardTitle>
            <Package className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{lowPriorityCount}</div>
            <p className="text-xs text-muted-foreground">재고 충분</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">총 추천 수량</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalRecommendedValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">단위 합계</p>
          </CardContent>
        </Card>
      </div>

      {/* 구매 추천 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>구매 추천 목록</CardTitle>
          <CardDescription>
            과거 30일 사용 패턴을 기반으로 한 구매 추천입니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>우선순위</TableHead>
                <TableHead>원재료명</TableHead>
                <TableHead className="text-right">현재 재고</TableHead>
                <TableHead className="text-right">안전 재고</TableHead>
                <TableHead className="text-right">추천 구매량</TableHead>
                <TableHead className="text-right">재고 소진 예상</TableHead>
                <TableHead className="text-right">일평균 사용량</TableHead>
                <TableHead>추천 구매 시점</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recommendations.map((rec: any) => (
                <TableRow
                  key={rec.materialId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedMaterialId(rec.materialId)}
                >
                  <TableCell>
                    <Badge
                      variant={
                        rec.priority === "high"
                          ? "destructive"
                          : rec.priority === "medium"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {rec.priority === "high"
                        ? "긴급"
                        : rec.priority === "medium"
                        ? "주의"
                        : "안정"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{rec.materialName}</TableCell>
                  <TableCell className="text-right">
                    {typeof rec.currentStock === 'string' 
                      ? parseFloat(rec.currentStock).toFixed(2) 
                      : rec.currentStock.toFixed(2)} {rec.unit}
                  </TableCell>
                  <TableCell className="text-right">
                    {rec.safetyStock.toFixed(2)} {rec.unit}
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {rec.recommendedQuantity.toFixed(2)} {rec.unit}
                  </TableCell>
                  <TableCell className="text-right">
                    {rec.daysUntilStockout !== null ? (
                      <span
                        className={
                          rec.daysUntilStockout <= 7
                            ? "text-red-500 font-bold"
                            : rec.daysUntilStockout <= 14
                            ? "text-yellow-500"
                            : "text-green-500"
                        }
                      >
                        {rec.daysUntilStockout}일 후
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {rec.usagePattern.dailyAverage.toFixed(2)} {rec.unit}
                  </TableCell>
                  <TableCell>
                    {rec.recommendedPurchaseDate ? (
                      <div className="flex items-center gap-1 text-sm">
                        <Calendar className="h-3 w-3" />
                        {new Date(rec.recommendedPurchaseDate).toLocaleDateString("ko-KR")}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 선택된 원재료의 사용량 패턴 상세 */}
      {selectedMaterialId && usagePattern && (
        <Card>
          <CardHeader>
            <CardTitle>사용량 패턴 상세</CardTitle>
            <CardDescription>
              {recommendations.find((r: any) => r.materialId === selectedMaterialId)?.materialName} - 최근 30일 사용 패턴
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">일평균 사용량</p>
                <p className="text-2xl font-bold">{usagePattern.dailyAverage}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">주평균 사용량</p>
                <p className="text-2xl font-bold">{usagePattern.weeklyAverage}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">월평균 사용량</p>
                <p className="text-2xl font-bold">{usagePattern.monthlyAverage}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">총 사용량 (30일)</p>
                <p className="text-2xl font-bold">{usagePattern.totalUsage}</p>
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">거래 횟수: {usagePattern.transactionCount}회</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
