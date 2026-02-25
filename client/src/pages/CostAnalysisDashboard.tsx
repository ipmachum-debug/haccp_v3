import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { BarChart3, TrendingDown, TrendingUp, DollarSign, Package, Info, Loader2, LineChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function CostAnalysisDashboard() {
  const [selectedProduct, setSelectedProduct] = useState<string>("all");

  // 제품 목록 조회
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);

  // 원가 통계 조회 (실시간 API)
  const { data: costStats, isLoading } = trpc.costAnalysis.getProductCostStats.useQuery({
    productId: selectedProduct === "all" ? undefined : parseInt(selectedProduct),
  });

  // 원가 구성 비율 계산
  const calculateCostComposition = () => {
    if (!costStats || costStats.avgTotalCost === 0) {
      return {
        materialPercentage: 0,
        laborPercentage: 0,
        overheadPercentage: 0,
      };
    }

    return {
      materialPercentage: (costStats.avgMaterialCost / costStats.avgTotalCost) * 100,
      laborPercentage: (costStats.avgLaborCost / costStats.avgTotalCost) * 100,
      overheadPercentage: (costStats.avgOverheadCost / costStats.avgTotalCost) * 100,
    };
  };

  const composition = calculateCostComposition();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">원가 분석</h2>
          <p className="text-sm text-muted-foreground mt-1">
            레시피 기반 실시간 원가 계산 및 분석
          </p>
        </div>
        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="제품 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 제품</SelectItem>
            {products?.map((product: any) => (
              <SelectItem key={product.id} value={product.id.toString()}>
                {product.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 안내 메시지 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          원가는 레시피의 원재료 구성 정보와 마스터데이터의 원재료 단가를 기반으로 실시간 계산됩니다.
          인건비는 레시피 총 작업시간 기준, 간접비는 원재료비의 20%로 추정됩니다.
        </AlertDescription>
      </Alert>

      {/* 원가 통계 카드 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 원재료비</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₩{costStats?.avgMaterialCost.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              전체 원가의 {composition.materialPercentage.toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 인건비</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₩{costStats?.avgLaborCost.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              전체 원가의 {composition.laborPercentage.toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 간접비</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₩{costStats?.avgOverheadCost.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              전체 원가의 {composition.overheadPercentage.toFixed(1)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">평균 총 원가</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ₩{costStats?.avgTotalCost.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {costStats?.totalRecipes || 0}개 레시피 평균
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 원가 추이 차트 */}
      <Card>
        <CardHeader>
          <CardTitle>원가 추이 분석</CardTitle>
          <CardDescription>시간별 원가 변동 추이 (최근 6개월)</CardDescription>
        </CardHeader>
        <CardContent>
          {!costStats || costStats.costByRecipe.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              데이터가 충분하지 않아 차트를 표시할 수 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              {/* 간단한 선 차트 시각화 */}
              <div className="h-64 flex items-end justify-between gap-2 border-b border-l pl-8 pb-8">
                {costStats.costByRecipe.slice(0, 6).map((recipe: any, index: number) => {
                  const maxCost = Math.max(...costStats.costByRecipe.slice(0, 6).map((r: any) => r.totalCost));
                  const height = (recipe.totalCost / maxCost) * 100;
                  return (
                    <div key={recipe.recipeId} className="flex-1 flex flex-col items-center gap-2">
                      <div className="w-full bg-blue-500 rounded-t" style={{ height: `${height}%` }}></div>
                      <div className="text-xs text-center">
                        <p className="font-medium truncate max-w-[80px]">{recipe.recipeName}</p>
                        <p className="text-muted-foreground">₩{(recipe.totalCost / 1000).toFixed(0)}K</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">최고 원가</p>
                  <p className="text-lg font-bold text-red-600">
                    ₩{Math.max(...costStats.costByRecipe.map((r: any) => r.totalCost)).toLocaleString()}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">평균 원가</p>
                  <p className="text-lg font-bold">
                    ₩{costStats.avgTotalCost.toLocaleString()}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">최저 원가</p>
                  <p className="text-lg font-bold text-green-600">
                    ₩{Math.min(...costStats.costByRecipe.map((r: any) => r.totalCost)).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 레시피별 원가 비교 */}
      <Card>
        <CardHeader>
          <CardTitle>레시피별 원가 비교</CardTitle>
          <CardDescription>각 레시피의 원가 구성 상세 정보</CardDescription>
        </CardHeader>
        <CardContent>
          {!costStats || costStats.costByRecipe.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              원가 데이터가 없습니다. 레시피와 원재료 정보를 먼저 등록해주세요.
            </div>
          ) : (
            <div className="space-y-4">
              {costStats.costByRecipe.map((recipe: any) => (
                <div key={recipe.recipeId} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold">{recipe.recipeName}</h4>
                    <Badge variant="outline">
                      총 원가: ₩{recipe.totalCost.toLocaleString()}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">원재료비</p>
                      <p className="font-medium">₩{recipe.materialCost.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">인건비</p>
                      <p className="font-medium">₩{recipe.laborCost.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">간접비</p>
                      <p className="font-medium">₩{recipe.overheadCost.toLocaleString()}</p>
                    </div>
                  </div>
                  {/* 원가 구성 비율 바 */}
                  <div className="mt-3 h-2 bg-gray-200 rounded-full overflow-hidden flex">
                    <div
                      className="bg-blue-500"
                      style={{
                        width: `${(recipe.materialCost / recipe.totalCost) * 100}%`,
                      }}
                    />
                    <div
                      className="bg-green-500"
                      style={{
                        width: `${(recipe.laborCost / recipe.totalCost) * 100}%`,
                      }}
                    />
                    <div
                      className="bg-yellow-500"
                      style={{
                        width: `${(recipe.overheadCost / recipe.totalCost) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
