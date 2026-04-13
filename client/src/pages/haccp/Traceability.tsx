import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Search, ArrowRight, ArrowLeft, Package, Warehouse, Factory, Calendar, Weight } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

export default function Traceability() {
  const [lotNumber, setLotNumber] = useState("");
  const [searchType, setSearchType] = useState<"material" | "product">("material");
  const [searchLotNumber, setSearchLotNumber] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<any>(null);

  const materialTraceQuery = trpc.traceability.byMaterialLot.useQuery(
    { lotNumber: searchLotNumber || "" },
    { enabled: !!searchLotNumber && searchType === "material" }
  );

  const productTraceQuery = trpc.traceability.byProductLot.useQuery(
    { lotNumber: searchLotNumber || "" },
    { enabled: !!searchLotNumber && searchType === "product" }
  );

  const handleSearch = () => {
    if (!lotNumber.trim()) {
      alert("LOT 번호를 입력하세요.");
      return;
    }
    setSearchLotNumber(lotNumber);
    setSearchResult(null); // 이전 결과 초기화
  };

  // 검색 결과 업데이트
  useEffect(() => {
    if (materialTraceQuery.data && searchType === "material") {
      setSearchResult({ type: "forward", data: materialTraceQuery.data });
    }
  }, [materialTraceQuery.data, searchType]);

  useEffect(() => {
    if (productTraceQuery.data && searchType === "product") {
      setSearchResult({ type: "backward", data: productTraceQuery.data });
    }
  }, [productTraceQuery.data, searchType]);

  const isLoading = materialTraceQuery.isLoading || productTraceQuery.isLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">LOT 추적성</h1>
        <p className="text-muted-foreground">
          원재료 LOT에서 완제품까지, 또는 완제품에서 원재료 LOT까지 추적합니다.
        </p>
      </div>

      {/* 검색 카드 */}
      <Card>
        <CardHeader>
          <CardTitle>LOT 번호 검색</CardTitle>
          <CardDescription>
            원재료 LOT 번호 또는 완제품 LOT 번호를 입력하여 추적하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={searchType} onValueChange={(v) => {
            setSearchType(v as "material" | "product");
            setSearchResult(null); // 탭 변경 시 결과 초기화
          }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="material">
                <Warehouse className="w-4 h-4 mr-2" />
                원재료 LOT (정방향 추적)
              </TabsTrigger>
              <TabsTrigger value="product">
                <Package className="w-4 h-4 mr-2" />
                완제품 LOT (역방향 추적)
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2">
            <Input
              placeholder="LOT 번호를 입력하세요"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button onClick={handleSearch} disabled={isLoading}>
              <Search className="w-4 h-4 mr-2" />
              {isLoading ? "검색 중..." : "검색"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 검색 결과 */}
      {searchResult && (
        <Card>
          <CardHeader>
            <CardTitle>
              {searchResult.type === "forward" ? "정방향 추적 결과" : "역방향 추적 결과"}
            </CardTitle>
            <CardDescription>
              {searchResult.type === "forward"
                ? "원재료 LOT → 배치 → 완제품"
                : "완제품 → 배치 → 원재료 LOT"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {searchResult.type === "forward" ? (
              <ForwardTraceResult data={searchResult.data} />
            ) : (
              <BackwardTraceResult data={searchResult.data} />
            )}
          </CardContent>
        </Card>
      )}
      </div>
    </DashboardLayout>
  );
}

/**
 * 정방향 추적 결과 (원재료 LOT → 배치 → 완제품) - 플로우차트 스타일
 */
function ForwardTraceResult({ data }: { data: any }) {
  if (!data.batches || data.batches.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {data.message || "이 LOT은 아직 배치에 투입되지 않았습니다."}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 원재료 LOT 정보 - 시작점 */}
      <div className="flex flex-col items-center">
        <div className="w-full max-w-2xl p-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-2 border-blue-300 dark:border-blue-700 rounded-xl shadow-md">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-500 text-white rounded-lg">
              <Warehouse className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold mb-1">원재료 LOT</div>
              <div className="text-2xl font-bold mb-3">{data.lot.lotNumber}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Weight className="w-4 h-4 text-muted-foreground" />
                  <span>수량: {data.lot.quantity} {data.lot.unit}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>유통기한: {data.lot.expiryDate ? new Date(data.lot.expiryDate).toLocaleDateString() : "N/A"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 화살표 */}
        <div className="flex flex-col items-center py-4">
          <div className="w-1 h-8 bg-gradient-to-b from-blue-300 to-green-300"></div>
          <ArrowRight className="w-8 h-8 text-green-500 rotate-90" />
        </div>
      </div>

      {/* 배치 및 완제품 정보 - 타임라인 스타일 */}
      <div className="space-y-6">
        {data.batches.map((batch: any, index: number) => (
          <div key={index} className="flex flex-col items-center">
            <div className="w-full max-w-2xl p-6 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-2 border-green-300 dark:border-green-700 rounded-xl shadow-md">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-green-500 text-white rounded-lg">
                  <Factory className="w-8 h-8" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-green-600 dark:text-green-400 font-semibold mb-1">배치 생산</div>
                  <div className="text-2xl font-bold mb-2">{batch.batchCode}</div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="bg-white dark:bg-gray-800">{batch.status}</Badge>
                      <span className="text-sm text-muted-foreground">제품: {batch.productName}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span>완제품 LOT: {batch.lotNumber}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Weight className="w-4 h-4 text-muted-foreground" />
                        <span>투입량: {batch.inputQuantity}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 다음 배치가 있으면 화살표 표시 */}
            {index < data.batches.length - 1 && (
              <div className="flex flex-col items-center py-4">
                <div className="w-1 h-8 bg-gradient-to-b from-green-300 to-green-300"></div>
                <ArrowRight className="w-8 h-8 text-green-500 rotate-90" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 역방향 추적 결과 (완제품 → 배치 → 원재료 LOT) - 플로우차트 스타일
 */
function BackwardTraceResult({ data }: { data: any }) {
  if (!data.materialInputs || data.materialInputs.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        이 배치에 투입된 원재료가 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* 완제품 배치 정보 - 시작점 */}
      <div className="flex flex-col items-center">
        <div className="w-full max-w-2xl p-6 bg-gradient-to-r from-green-50 to-green-100 dark:from-green-950 dark:to-green-900 border-2 border-green-300 dark:border-green-700 rounded-xl shadow-md">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-green-500 text-white rounded-lg">
              <Package className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <div className="text-sm text-green-600 dark:text-green-400 font-semibold mb-1">완제품 배치</div>
              <div className="text-2xl font-bold mb-2">{data.batch.batchCode}</div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-white dark:bg-gray-800">{data.batch.status}</Badge>
                  <span className="text-sm text-muted-foreground">제품: {data.batch.productName}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-muted-foreground" />
                    <span>LOT: {data.batch.lotNumber}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Weight className="w-4 h-4 text-muted-foreground" />
                    <span>수량: {data.batch.plannedQuantity}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 화살표 */}
        <div className="flex flex-col items-center py-4">
          <div className="w-1 h-8 bg-gradient-to-b from-green-300 to-blue-300"></div>
          <ArrowLeft className="w-8 h-8 text-blue-500 rotate-90" />
        </div>
      </div>

      {/* 원재료 LOT 정보 - 타임라인 스타일 */}
      <div className="space-y-6">
        {data.materialInputs.map((input: any, index: number) => (
          <div key={index} className="flex flex-col items-center">
            <div className="w-full max-w-2xl p-6 bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-2 border-blue-300 dark:border-blue-700 rounded-xl shadow-md">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500 text-white rounded-lg">
                  <Warehouse className="w-8 h-8" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-blue-600 dark:text-blue-400 font-semibold mb-1">원재료 LOT</div>
                  <div className="text-2xl font-bold mb-2">{input.lotNumber}</div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">{input.materialName}</div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2">
                        <Weight className="w-4 h-4 text-muted-foreground" />
                        <span>투입량: {input.quantity} {input.unit}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>유통기한: {input.expiryDate ? new Date(input.expiryDate).toLocaleDateString() : "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 다음 원재료가 있으면 화살표 표시 */}
            {index < data.materialInputs.length - 1 && (
              <div className="flex flex-col items-center py-4">
                <div className="w-1 h-8 bg-gradient-to-b from-blue-300 to-blue-300"></div>
                <ArrowLeft className="w-8 h-8 text-blue-500 rotate-90" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
