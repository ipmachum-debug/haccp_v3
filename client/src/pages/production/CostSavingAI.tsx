import { useState } from "react";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, Sparkles, ShoppingCart, Users, DollarSign } from "lucide-react";
import { Streamdown } from "streamdown";

export default function CostSavingAI() {
  const [activeTab, setActiveTab] = useTabWithUrl('tab', 'overview');
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);

  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  const { data: proposal, isLoading: proposalLoading } = trpc.costSavingAI.generateProposal.useQuery(
    { materialId: selectedMaterialId! },
    { enabled: !!selectedMaterialId }
  );
  const { data: priceTrend } = trpc.costSavingAI.analyzePriceTrend.useQuery(
    {
      materialId: selectedMaterialId!,
      startDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
      endDate: new Date().toISOString(),
    },
    { enabled: !!selectedMaterialId }
  );
  const { data: purchaseTiming } = trpc.costSavingAI.recommendPurchaseTiming.useQuery(
    { materialId: selectedMaterialId! },
    { enabled: !!selectedMaterialId }
  );
  const { data: alternativeSuppliers } = trpc.costSavingAI.recommendAlternativeSuppliers.useQuery(
    { materialId: selectedMaterialId! },
    { enabled: !!selectedMaterialId }
  );

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case "increasing":
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case "decreasing":
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      case "stable":
        return <Minus className="h-4 w-4 text-gray-500" />;
      default:
        return null;
    }
  };

  const getTrendBadge = (trend: string) => {
    switch (trend) {
      case "increasing":
        return <Badge variant="destructive">상승</Badge>;
      case "decreasing":
        return <Badge variant="default" className="bg-green-500">하락</Badge>;
      case "stable":
        return <Badge variant="secondary">안정</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case "buy_now":
        return <Badge variant="destructive">즉시 구매</Badge>;
      case "wait":
        return <Badge variant="default" className="bg-green-500">대기</Badge>;
      case "monitor":
        return <Badge variant="secondary">모니터링</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge variant="destructive">높음</Badge>;
      case "medium":
        return <Badge variant="secondary">보통</Badge>;
      case "low":
        return <Badge variant="outline">낮음</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-purple-500" />
          AI 기반 원가 절감 제안
        </h1>
        <p className="text-muted-foreground mt-2">
          원재료 가격 변동 추이를 분석하고, 최적 구매 시점 및 대체 공급업체를 추천합니다.
        </p>
      </div>

      {/* 원재료 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>원재료 선택</CardTitle>
          <CardDescription>분석할 원재료를 선택하세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="material">원재료</Label>
            <Select
              value={selectedMaterialId?.toString() || ""}
              onValueChange={(value) => setSelectedMaterialId(Number(value))}
            >
              <SelectTrigger id="material">
                <SelectValue placeholder="원재료를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {materials?.map((material: any) => (
                  <SelectItem key={material.id} value={material.id.toString()}>
                    {material.materialName} ({material.materialCode})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 분석 결과 */}
      {selectedMaterialId && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">종합 제안</TabsTrigger>
            <TabsTrigger value="price-trend">가격 추이</TabsTrigger>
            <TabsTrigger value="purchase-timing">구매 시점</TabsTrigger>
            <TabsTrigger value="suppliers">대체 공급업체</TabsTrigger>
          </TabsList>

          {/* 종합 제안 */}
          <TabsContent value="overview" className="space-y-4">
            {proposalLoading ? (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-muted-foreground">AI 분석 중...</div>
                </CardContent>
              </Card>
            ) : proposal ? (
              <>
                {/* 요약 카드 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">현재 원가</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{proposal.currentCost.toLocaleString()}원</div>
                      <p className="text-xs text-muted-foreground mt-1">단가</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">예상 절감액</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-500">
                        {proposal.totalEstimatedSavings.toLocaleString()}원
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">100kg 기준</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">제안 액션</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{proposal.proposedActions.length}</div>
                      <p className="text-xs text-muted-foreground mt-1">개</p>
                    </CardContent>
                  </Card>
                </div>

                {/* 제안 액션 */}
                <Card>
                  <CardHeader>
                    <CardTitle>제안 액션</CardTitle>
                    <CardDescription>원가 절감을 위한 구체적인 제안입니다.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {proposal.proposedActions.map((action: any, index: any) => (
                        <div key={index} className="flex items-start gap-4 p-4 border rounded-lg">
                          <div className="flex-shrink-0">
                            {action.action === "immediate_purchase" && <ShoppingCart className="h-6 w-6 text-red-500" />}
                            {action.action === "delayed_purchase" && <ShoppingCart className="h-6 w-6 text-green-500" />}
                            {action.action === "alternative_supplier" && <Users className="h-6 w-6 text-blue-500" />}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{action.description}</h3>
                              {getPriorityBadge(action.priority)}
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              예상 절감액: <span className="font-medium text-green-600">{action.estimatedSavings.toLocaleString()}원</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* AI 인사이트 */}
                <Card className="border-purple-500">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5 text-purple-500" />
                      AI 인사이트
                    </CardTitle>
                    <CardDescription>AI가 분석한 원가 절감 제안입니다.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-sm max-w-none">
                      <Streamdown>{typeof proposal.aiInsights === 'string' ? proposal.aiInsights : ''}</Streamdown>
                    </div>
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-muted-foreground">제안 데이터를 불러올 수 없습니다.</div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 가격 추이 */}
          <TabsContent value="price-trend" className="space-y-4">
            {priceTrend ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">현재 가격</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{priceTrend.currentPrice.toLocaleString()}원</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">평균 가격</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{priceTrend.avgPrice.toLocaleString()}원</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">최저 가격</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-500">{priceTrend.minPrice.toLocaleString()}원</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">가격 추세</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        {getTrendIcon(priceTrend.trend)}
                        {getTrendBadge(priceTrend.trend)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle>가격 변동 이력</CardTitle>
                    <CardDescription>최근 90일간의 가격 변동 이력입니다.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {priceTrend.priceChanges.length > 0 ? (
                      <div className="space-y-2">
                        {priceTrend.priceChanges.map((change: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-2 border rounded">
                            <span className="text-sm text-muted-foreground">
                              {new Date(change.date).toLocaleDateString()}
                            </span>
                            <span className="font-medium">{change.price.toLocaleString()}원</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-4">가격 변동 이력이 없습니다.</div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-muted-foreground">가격 추이 데이터를 불러올 수 없습니다.</div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 구매 시점 */}
          <TabsContent value="purchase-timing" className="space-y-4">
            {purchaseTiming ? (
              <Card>
                <CardHeader>
                  <CardTitle>최적 구매 시점 추천</CardTitle>
                  <CardDescription>AI가 분석한 최적 구매 시점입니다.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-4 p-4 border rounded-lg">
                    <div className="flex-shrink-0">
                      <ShoppingCart className="h-8 w-8 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold">추천 액션</h3>
                        {getActionBadge(purchaseTiming.recommendedAction)}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">{purchaseTiming.reason}</p>
                      {purchaseTiming.estimatedSavings > 0 && (
                        <p className="text-sm">
                          예상 절감액:{" "}
                          <span className="font-medium text-green-600">
                            {purchaseTiming.estimatedSavings.toLocaleString()}원
                          </span>{" "}
                          (100kg 기준)
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-muted-foreground">구매 시점 데이터를 불러올 수 없습니다.</div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* 대체 공급업체 */}
          <TabsContent value="suppliers" className="space-y-4">
            {alternativeSuppliers ? (
              <Card>
                <CardHeader>
                  <CardTitle>대체 공급업체 추천</CardTitle>
                  <CardDescription>원가 절감을 위한 대체 공급업체 목록입니다.</CardDescription>
                </CardHeader>
                <CardContent>
                  {alternativeSuppliers.alternativeSuppliers.length > 0 ? (
                    <div className="space-y-4">
                      {alternativeSuppliers.alternativeSuppliers.map((supplier: any) => (
                        <div key={supplier.supplierId} className="flex items-start gap-4 p-4 border rounded-lg">
                          <div className="flex-shrink-0">
                            <Users className="h-6 w-6 text-blue-500" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold">{supplier.supplierName}</h3>
                              <Badge variant="outline">{supplier.supplierCode}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              담당자: {supplier.contactPerson} | 전화: {supplier.phone}
                            </p>
                            <div className="flex items-center gap-4 text-sm">
                              <span>
                                예상 단가:{" "}
                                <span className="font-medium">{supplier.estimatedPrice.toLocaleString()}원</span>
                              </span>
                              <span className="text-green-600">
                                절감액: {supplier.estimatedSavings.toLocaleString()}원 (100kg 기준)
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center text-muted-foreground py-4">대체 공급업체가 없습니다.</div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-8">
                  <div className="text-muted-foreground">공급업체 데이터를 불러올 수 없습니다.</div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
