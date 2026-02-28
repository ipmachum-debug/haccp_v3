import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { Package, TrendingDown, AlertTriangle, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import DashboardLayout from "@/components/DashboardLayout";

export default function InventoryPredictionDashboard() {
  const [selectedMaterialId, setSelectedMaterialId] = useState<number | null>(null);
  const [safetyStockLevel, setSafetyStockLevel] = useState<number>(0);

  const { data: _rawMaterials, refetch } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  // ERP 모듈 구현 후 재추가
  const consumptionHistory = null;
  const updateSafetyStock = trpc.material.updateSafetyStock.useMutation({
    onSuccess: () => {
      toast.success("안전 재고 수준이 업데이트되었습니다");
      refetch();
    },
    onError: (error) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  const selectedMaterial = materials?.find((m) => m.id === selectedMaterialId);

  // ERP 모듈 구현 후 재추가
  // const predictionData = calculatePrediction();
  // const accuracy = calculateAccuracy();

  const handleUpdateSafetyStock = () => {
    if (!selectedMaterialId) {
      toast.error("원재료를 선택해주세요");
      return;
    }
    updateSafetyStock.mutate({
      materialId: selectedMaterialId,
      safetyStockLevel: safetyStockLevel,
    });
  };

  return (
    <DashboardLayout>

    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">재고 예측 대시보드</h1>
          <p className="text-muted-foreground">
            원재료별 재고 소진 예측 및 안전 재고 수준 관리
          </p>
        </div>
      </div>

      {/* 원재료 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>원재료 선택</CardTitle>
          <CardDescription>예측을 확인할 원재료를 선택하세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {materials?.map((material) => (
              <Button
                key={material.id}
                variant={selectedMaterialId === material.id ? "default" : "outline"}
                onClick={() => {
                  setSelectedMaterialId(material.id);
                  setSafetyStockLevel(Number(material.safetyStockLevel) || 0);
                }}
                className="h-auto py-4 flex flex-col items-start"
              >
                <Package className="h-5 w-5 mb-2" />
                <span className="font-semibold">{material.materialName}</span>
                <span className="text-xs text-muted-foreground">
                  코드: {material.materialCode}
                </span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 안전 재고 수준 설정 */}
      {selectedMaterial && (
        <Card>
          <CardHeader>
            <CardTitle>안전 재고 수준 설정</CardTitle>
            <CardDescription>
              {selectedMaterial.materialName} ({selectedMaterial.materialCode})
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="safetyStock">안전 재고 수준 ({selectedMaterial.unit || "단위"})</Label>
              <div className="flex gap-2">
                <Input
                  id="safetyStock"
                  type="number"
                  value={safetyStockLevel}
                  onChange={(e) => setSafetyStockLevel(Number(e.target.value))}
                  placeholder="안전 재고 수준 입력"
                />
                <Button onClick={handleUpdateSafetyStock} disabled={updateSafetyStock.isPending}>
                  {updateSafetyStock.isPending ? "저장 중..." : "저장"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                재고가 이 수준 이하로 떨어지면 자동으로 발주 알림이 생성됩니다.
              </p>
            </div>

            {/* 예측 정보 카드 */}
            <div className="grid md:grid-cols-3 gap-4 mt-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-orange-500" />
                    현재 안전 재고
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {selectedMaterial.safetyStockLevel || 0} {selectedMaterial.unit || "단위"}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    예상 소진 기간
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">예측 중...</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    과거 30일 데이터 기반
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    발주 권장 시점
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">계산 중...</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    리드타임 고려
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="bg-muted p-4 rounded-lg mt-4">
              <p className="text-sm text-muted-foreground">
                💡 <strong>재고 예측 시스템</strong>은 매일 오전 10시에 자동으로 실행되어 
                안전 재고 수준 이하의 원재료에 대한 발주 알림을 생성합니다.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedMaterial && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>원재료를 선택하여 재고 예측 정보를 확인하세요</p>
          </CardContent>
        </Card>
      )}
    </div>
  
    </DashboardLayout>
  );
}
