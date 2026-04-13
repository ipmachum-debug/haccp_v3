import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { TrendingUp, TrendingDown, Award, AlertTriangle } from "lucide-react";

export default function SupplierPerformance() {
  const { data: _rawSuppliers } = trpc.supplier.getAll.useQuery({ limit: 9999 });
  const suppliers = (_rawSuppliers as any)?.items ?? (Array.isArray(_rawSuppliers) ? _rawSuppliers : []);
  const { data: evaluations } = trpc.supplierEvaluation.list.useQuery({ supplierId: 0 });

  // 거래처별 최신 평가 점수 계산
  const supplierScores = suppliers?.map((supplier: any) => {
    const supplierEvals = evaluations?.filter((e: any) => e.supplierId === supplier.id) || [];
    const latestEval = supplierEvals[0];
    
    return {
      id: supplier.id,
      name: supplier.supplierName,
      rating: supplier.rating || "C",
      overallScore: latestEval?.overallScore || 0,
      evaluationCount: supplierEvals.length,
      lastEvaluationDate: latestEval?.evaluationDate,
    };
  }).sort((a: any, b: any) => Number(b.overallScore) - Number(a.overallScore)) || [];

  // 등급별 분포 계산
  const ratingDistribution = suppliers?.reduce((acc: any, supplier: any) => {
    const rating = supplier.rating || "C";
    acc[rating] = (acc[rating] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  // 평균 점수 계산
  const averageScore = supplierScores.length > 0
    ? supplierScores.reduce((sum: any, s: any) => sum + Number(s.overallScore), 0) / supplierScores.length
    : 0;

  // 상위 5개 거래처
  const topSuppliers = supplierScores.slice(0, 5);

  // 하위 5개 거래처 (개선 필요)
  const bottomSuppliers = supplierScores.slice(-5).reverse();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">거래처 성과 대시보드</h1>
          <p className="text-muted-foreground mt-2">
            모든 거래처의 평가 통계를 한눈에 확인하고 성과를 관리합니다.
          </p>
        </div>

        {/* 주요 지표 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 거래처</CardTitle>
              <Award className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{suppliers?.length || 0}</div>
              <p className="text-xs text-muted-foreground">등록된 거래처 수</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">평균 점수</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{averageScore.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">전체 거래처 평균</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">A등급 거래처</CardTitle>
              <Award className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{ratingDistribution["A"] || 0}</div>
              <p className="text-xs text-muted-foreground">우수 거래처</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">개선 필요</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(ratingDistribution["D"] || 0) + (ratingDistribution["F"] || 0)}
              </div>
              <p className="text-xs text-muted-foreground">D/F 등급 거래처</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* 상위 거래처 */}
          <Card>
            <CardHeader>
              <CardTitle>상위 5개 거래처</CardTitle>
              <CardDescription>평균 점수 기준 우수 거래처</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topSuppliers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    평가 데이터가 없습니다
                  </div>
                ) : (
                  topSuppliers.map((supplier: any, index: any) => (
                    <div key={supplier.id} className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-700 font-bold">
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{supplier.name}</div>
                        <div className="text-sm text-muted-foreground">
                          평가 {supplier.evaluationCount}회
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded text-sm font-medium ${
                            supplier.rating === "A"
                              ? "bg-green-100 text-green-700"
                              : supplier.rating === "B"
                                ? "bg-blue-100 text-blue-700"
                                : supplier.rating === "C"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : supplier.rating === "D"
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-red-100 text-red-700"
                          }`}
                        >
                          {supplier.rating}
                        </span>
                        <span className="text-lg font-bold">{Number(supplier.overallScore).toFixed(2)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* 개선 필요 거래처 */}
          <Card>
            <CardHeader>
              <CardTitle>개선 필요 거래처</CardTitle>
              <CardDescription>평균 점수 기준 하위 거래처</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {bottomSuppliers.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    평가 데이터가 없습니다
                  </div>
                ) : (
                  bottomSuppliers.map((supplier: any, index: any) => (
                    <div key={supplier.id} className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-orange-100 text-orange-700 font-bold">
                        {supplierScores.length - bottomSuppliers.length + index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{supplier.name}</div>
                        <div className="text-sm text-muted-foreground">
                          평가 {supplier.evaluationCount}회
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 rounded text-sm font-medium ${
                            supplier.rating === "A"
                              ? "bg-green-100 text-green-700"
                              : supplier.rating === "B"
                                ? "bg-blue-100 text-blue-700"
                                : supplier.rating === "C"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : supplier.rating === "D"
                                    ? "bg-orange-100 text-orange-700"
                                    : "bg-red-100 text-red-700"
                          }`}
                        >
                          {supplier.rating}
                        </span>
                        <span className="text-lg font-bold">{Number(supplier.overallScore).toFixed(2)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 등급 분포 */}
        <Card>
          <CardHeader>
            <CardTitle>등급 분포</CardTitle>
            <CardDescription>거래처 등급별 분포 현황</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-4">
              {["A", "B", "C", "D", "F"].map((rating) => (
                <div key={rating} className="text-center">
                  <div
                    className={`text-4xl font-bold mb-2 ${
                      rating === "A"
                        ? "text-green-600"
                        : rating === "B"
                          ? "text-blue-600"
                          : rating === "C"
                            ? "text-yellow-600"
                            : rating === "D"
                              ? "text-orange-600"
                              : "text-red-600"
                    }`}
                  >
                    {ratingDistribution[rating] || 0}
                  </div>
                  <div className="text-sm text-muted-foreground">{rating} 등급</div>
                  <div className="text-xs text-muted-foreground">
                    {suppliers && suppliers.length > 0
                      ? ((ratingDistribution[rating] || 0) / suppliers.length * 100).toFixed(1)
                      : 0}%
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
