import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Loader2, Sparkles, Zap, Hand } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import confetti from "canvas-confetti";

export default function BatchCreate() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [batchNumber, setBatchNumber] = useState("");
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split("T")[0]);
  const [targetQuantity, setTargetQuantity] = useState("");
  const [recipeId, setRecipeId] = useState<number | null>(null);
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [manualStartTime, setManualStartTime] = useState("");
  const [manualEndTime, setManualEndTime] = useState("");

  const { data: rawProductsData, isLoading: productsLoading } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (rawProductsData as any)?.items ?? (Array.isArray(rawProductsData) ? rawProductsData : []);
  
  // 제품 선택 시 레시피 조회
  const { data: recipe } = trpc.recipe.getByProductId.useQuery(
    { productId: parseInt(selectedProductId) },
    { enabled: !!selectedProductId }
  );
  
  // 레시피 기반 원재료 목록 조회
  const { data: requiredMaterials } = trpc.recipe.getMaterialsByRecipeId.useQuery(
    { recipeId: recipeId! },
    { enabled: !!recipeId }
  );
  
  // 레시피 ID 업데이트
  useEffect(() => {
    if (recipe) {
      setRecipeId(recipe.id);
    } else {
      setRecipeId(null);
    }
  }, [recipe]);
  const createBatchMutation = trpc.batch.create.useMutation({
    onSuccess: (data) => {
      // 축하 애니메이션
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6']
      });
      
      // CCP 자동 생성 여부에 따른 메시지 표시
      if (data.ccpCreated) {
        toast.success(
          "배치가 생성되었고, CCP가 자동으로 생성되었습니다!",
          {
            description: `${data.ccpCount}개의 CCP 인스턴스가 생성되었습니다.`,
            duration: 5000,
          }
        );
      } else {
        toast.success("배치가 생성되었습니다!");
      }
      setLocation(`/dashboard/batch/${data.batchId}`);
    },
    onError: (error) => {
      toast.error(`배치 생성 실패: ${error.message}`);
    },
  });
  
  const generateBatchCodeMutation = trpc.batch.generateBatchCode.useQuery(
    { productId: parseInt(selectedProductId) },
    { enabled: false }
  );
  
  const handleGenerateBatchCode = async () => {
    if (!selectedProductId) {
      toast.error("제품을 먼저 선택해주세요");
      return;
    }
    
    try {
      const result = await generateBatchCodeMutation.refetch();
      if (result.data?.batchCode) {
        setBatchNumber(result.data.batchCode);
        toast.success("배치 번호가 자동 생성되었습니다");
      }
    } catch (error: any) {
      toast.error(`배치 번호 생성 실패: ${error.message}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedProductId) {
      toast.error("제품을 선택해주세요");
      return;
    }

    if (!batchNumber.trim()) {
      toast.error("배치 번호를 입력해주세요");
      return;
    }

    if (!targetQuantity || parseFloat(targetQuantity) <= 0) {
      toast.error("목표 수량을 입력해주세요");
      return;
    }

    createBatchMutation.mutate({
      siteId: 1, // TODO: 사용자의 사업장 ID로 변경
      productId: parseInt(selectedProductId),
      batchNumber: batchNumber.trim(),
      plannedStartDate: new Date(productionDate),
      plannedEndDate: new Date(productionDate),
      plannedQuantity: parseFloat(targetQuantity),
      mode,
      manualStartTime: mode === "manual" ? manualStartTime : undefined,
      manualEndTime: mode === "manual" ? manualEndTime : undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="container max-w-2xl py-8">
        <Card>
          <CardHeader>
            <CardTitle>새 배치 생성</CardTitle>
            <CardDescription>새로운 생산 배치를 생성합니다</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* 배치 모드 선택 - admin만 자동배치 선택 가능 */}
              {user?.role === "admin" && (
              <div className="space-y-3">
                <Label>배치 모드 *</Label>
                <RadioGroup value={mode} onValueChange={(v) => setMode(v as "auto" | "manual")}>
                  <div className="flex items-center space-x-2 border rounded-lg p-4 hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="auto" id="auto" />
                    <Label htmlFor="auto" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Zap className="h-5 w-5 text-primary" />
                      <div>
                        <div className="font-semibold">자동배치</div>
                        <div className="text-sm text-muted-foreground">
                          CCP가 자동으로 생성되고, 한계치 기본값이 설정됩니다.
                        </div>
                      </div>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2 border rounded-lg p-4 hover:bg-accent cursor-pointer">
                    <RadioGroupItem value="manual" id="manual" />
                    <Label htmlFor="manual" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Hand className="h-5 w-5 text-orange-500" />
                      <div>
                        <div className="font-semibold">수동배치</div>
                        <div className="text-sm text-muted-foreground">
                          배치 시간을 수동으로 기입하고, CCP는 나중에 생성합니다.
                        </div>
                      </div>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              )}

              {/* 수동배치 시간 입력 */}
              {mode === "manual" && (
                <div className="space-y-4 border rounded-lg p-4 bg-muted/50">
                  <div className="space-y-2">
                    <Label htmlFor="manualStartTime">시작 시간</Label>
                    <Input
                      id="manualStartTime"
                      type="time"
                      value={manualStartTime}
                      onChange={(e) => setManualStartTime(e.target.value)}
                      placeholder="09:00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manualEndTime">종료 시간</Label>
                    <Input
                      id="manualEndTime"
                      type="time"
                      value={manualEndTime}
                      onChange={(e) => setManualEndTime(e.target.value)}
                      placeholder="17:00"
                    />
                  </div>
                </div>
              )}

              {/* 제품 선택 */}
              <div className="space-y-2">
                <Label htmlFor="product">제품 *</Label>
                {productsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    제품 목록 로딩 중...
                  </div>
                ) : (
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger id="product">
                      <SelectValue placeholder="제품을 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.map((product) => (
                        <SelectItem key={product.id} value={product.id.toString()}>
                          {product.productName || `제품 #${product.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 배치 번호 */}
              <div className="space-y-2">
                <Label htmlFor="batchNumber">배치 번호 *</Label>
                <div className="flex gap-2">
                  <Input
                    id="batchNumber"
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="예: BATCH-2025-001"
                    required
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateBatchCode}
                    disabled={!selectedProductId || generateBatchCodeMutation.isFetching}
                  >
                    {generateBatchCodeMutation.isFetching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* 생산 날짜 */}
              <div className="space-y-2">
                <Label htmlFor="productionDate">생산 날짜 *</Label>
                <Input
                  id="productionDate"
                  type="date"
                  value={productionDate}
                  onChange={(e) => setProductionDate(e.target.value)}
                  required
                />
              </div>

              {/* 목표 수량 */}
              <div className="space-y-2">
                <Label htmlFor="targetQuantity">목표 수량 (kg) *</Label>
                <Input
                  id="targetQuantity"
                  type="number"
                  step="0.01"
                  value={targetQuantity}
                  onChange={(e) => setTargetQuantity(e.target.value)}
                  placeholder="예: 1000"
                  required
                />
              </div>

              {/* 필요한 원재료 목록 */}
              {requiredMaterials && requiredMaterials.length > 0 && (
                <div className="space-y-2">
                  <Label>필요한 원재료</Label>
                  <div className="border rounded-lg p-4 space-y-2">
                    {requiredMaterials.map((material: any) => (
                      <div key={material.id} className="flex justify-between items-center text-sm">
                        <span className="font-medium">{material.materialName}</span>
                        <span className="text-muted-foreground">
                          {material.requiredQuantity} {material.requiredUnit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={createBatchMutation.isPending}
                  className="flex-1"
                >
                  {createBatchMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  배치 생성
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocation("/dashboard/batch")}
                  disabled={createBatchMutation.isPending}
                >
                  취소
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
