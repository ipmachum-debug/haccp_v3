import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Loader2, Sparkles, Package, ChevronRight,
  Factory, FlaskConical, CheckCircle2, Info, Edit3,
  Zap, ClipboardCheck, ArrowRight, Clock
} from "lucide-react";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
import confetti from "canvas-confetti";

import { todayLocal } from "../../lib/dateUtils";

/** SKU별 실제 생산수량 상태 */
interface SkuActualInput {
  skuId: number;
  actualQty: string;       // 실제 생산수량 (개)
  defectiveQty: string;    // 불량수량 (개)
}

/** CCP 처리 모드 */
type ProcessingMode = "auto" | "manual";

export default function BatchCreate({ embedded = false, ..._ }: { embedded?: boolean; [key: string]: any }) {
  const L = useIndustryLabel();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // ── 처리 모드 (자동 / 수동) ──
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("auto");

  // ── 입력 상태 ──
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [plannedQuantityKg, setPlannedQuantityKg] = useState<string>("");
  const [productionDate, setProductionDate] = useState(todayLocal());
  const [batchCode, setBatchCode] = useState("");
  const [batchStartTime, setBatchStartTime] = useState("09:00");

  // ── SKU 실제 생산수량 입력 ──
  const [skuActualInputs, setSkuActualInputs] = useState<Record<number, SkuActualInput>>({});

  // ── 제품 검색 Autocomplete 상태 ──
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearchText, setProductSearchText] = useState("");
  const productInputRef = useRef<HTMLInputElement>(null);
  const productDropdownRef = useRef<HTMLDivElement>(null);

  // ── 제품 목록 ──
  const { data: rawProductsData, isLoading: productsLoading } = trpc.product.list.useQuery(
    { limit: 9999 },
    { staleTime: 5 * 60 * 1000, gcTime: 10 * 60 * 1000 }
  );
  const products = (rawProductsData as any)?.items ?? (Array.isArray(rawProductsData) ? rawProductsData : []);
  const selectedProduct = products.find((p: any) => p.id === parseInt(selectedProductId));

  // ── 제품 필터링 (autocomplete) ──
  const filteredProducts = useMemo(() => {
    if (!products || products.length === 0) return [];
    if (!productSearchText.trim()) return products;
    const q = productSearchText.toLowerCase();
    return products.filter((p: any) =>
      (p.productName || "").toLowerCase().includes(q) ||
      (p.productCode || "").toLowerCase().includes(q)
    );
  }, [products, productSearchText]);

  // ── 외부 클릭 감지 ──
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        productDropdownRef.current &&
        !productDropdownRef.current.contains(e.target as Node) &&
        productInputRef.current &&
        !productInputRef.current.contains(e.target as Node)
      ) {
        setProductSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── SKU 목록 (전체 조회 후 제품으로 필터) ──
  const { data: allSkus, isLoading: skusLoading } = trpc.productSku.listAll.useQuery(
    { itemType: "own_product" },
    { enabled: true }
  );

  // 선택된 제품에 해당하는 SKU 필터링
  const filteredSkus = useMemo(() => {
    if (!allSkus || !selectedProductId) return [];
    const product = products.find((p: any) => p.id === parseInt(selectedProductId));
    if (!product) return [];
    return (allSkus as any[]).filter(
      (sku: any) => sku.itemName === product.productName
    );
  }, [allSkus, selectedProductId, products]);

  // SKU 목록이 변경되면 실제 생산수량 초기화
  useEffect(() => {
    const init: Record<number, SkuActualInput> = {};
    filteredSkus.forEach((sku: any) => {
      init[sku.id] = {
        skuId: sku.id,
        actualQty: "",
        defectiveQty: "",
      };
    });
    setSkuActualInputs(init);
  }, [filteredSkus.map((s: any) => s.id).join(",")]);

  // ── 배치 번호 자동 생성 ──
  const { refetch: refetchBatchCode, isFetching: batchCodeLoading } =
    trpc.batch.generateBatchCode.useQuery(
      { productId: parseInt(selectedProductId) },
      { enabled: false }
    );

  const handleGenerateBatchCode = async () => {
    if (!selectedProductId) return;
    try {
      const result = await refetchBatchCode();
      if (result.data?.batchCode) {
        setBatchCode(result.data.batchCode);
      } else if (result.error) {
        console.error("[BatchCreate] 배치번호 생성 실패:", result.error);
        // 폴백: 기본 배치번호 생성 (productId-날짜-001)
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        setBatchCode(`${selectedProductId}-${dateStr}-001`);
        toast.error(`${L("batch")}번호 자동생성 실패 - 임시번호가 생성되었습니다. 확인 후 수정해주세요.`);
      }
    } catch (err: any) {
      console.error("[BatchCreate] 배치번호 생성 에러:", err);
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      setBatchCode(`${selectedProductId}-${dateStr}-001`);
      toast.error(`${L("batch")}번호 자동생성 실패 - 임시번호가 생성되었습니다.`);
    }
  };

  // 제품 선택 시 배치 번호 자동 생성
  useEffect(() => {
    if (selectedProductId) {
      handleGenerateBatchCode();
    }
  }, [selectedProductId]);

  // ── SKU별 예상 생산수량 계산 ──
  const skuCalculations = useMemo(() => {
    const qty = parseFloat(plannedQuantityKg);
    if (!qty || isNaN(qty) || filteredSkus.length === 0) return [];
    return filteredSkus.map((sku: any) => {
      const kgPerUnit = parseFloat(sku.kgPerSalesUnit) || 1;
      const estimatedQty = Math.floor(qty / kgPerUnit);
      return {
        ...sku,
        estimatedQty,
        totalKg: (estimatedQty * kgPerUnit).toFixed(2),
      };
    });
  }, [filteredSkus, plannedQuantityKg]);

  // ── SKU 실제 입력 핸들러 ──
  const handleActualQtyChange = useCallback((skuId: number, field: "actualQty" | "defectiveQty", value: string) => {
    setSkuActualInputs(prev => ({
      ...prev,
      [skuId]: {
        ...prev[skuId],
        skuId,
        [field]: value,
      }
    }));
  }, []);

  // 실제 생산수량 합계 (kg)
  const totalActualKg = useMemo(() => {
    return skuCalculations.reduce((sum, sku: any) => {
      const actual = parseInt(skuActualInputs[sku.id]?.actualQty || "0") || 0;
      const kgPerUnit = parseFloat(sku.kgPerSalesUnit) || 1;
      return sum + actual * kgPerUnit;
    }, 0);
  }, [skuCalculations, skuActualInputs]);

  // skuOutputs 배열 (배치 생성 시 전달)
  const skuOutputsPayload = useMemo(() => {
    return skuCalculations
      .map((sku: any) => {
        const input = skuActualInputs[sku.id];
        const actualQty = parseInt(input?.actualQty || "0") || 0;
        const defectiveQty = parseInt(input?.defectiveQty || "0") || 0;
        if (actualQty <= 0) return null;
        return {
          skuId: sku.id,
          plannedQty: sku.estimatedQty,
          actualQty,
          defectiveQty,
          notes: "",
        };
      })
      .filter(Boolean);
  }, [skuCalculations, skuActualInputs]);

  // ── 배치 생성 ──
  const createBatchMutation = trpc.batch.create.useMutation({
    onSuccess: (data: any) => {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"],
      });

      const ccpMsg = data.ccpCreated
        ? `CCP ${data.ccpCount}건 자동 생성 완료`
        : "CCP 생성 대기 중 (BOM → 공정그룹 매핑 확인 필요)";

      if (data.autoNavigateToApproval) {
        // 자동 모드: 승인관리 자동 이동 (서버에서 승인 요청도 자동 등록됨)
        toast.success(`${L("batch")} 생성 완료! 승인관리로 이동합니다.`, {
          description: `${ccpMsg} · 설비기준·공정기준 자동 삽입 완료`,
          duration: 4000,
        });
        setTimeout(() => setLocation("/dashboard/approval"), 1500);
      } else if (processingMode === "auto" && !data.ccpCreated) {
        // 자동 모드지만 CCP 생성 실패 → 배치 상세로
        toast.warning(`${L("batch")} 생성됨. CCP 생성 실패 - BOM 매핑 확인 필요`, {
          description: data.message,
          duration: 6000,
        });
        setLocation(`/dashboard/batch/${data.batchId}`);
      } else {
        // 수동 모드: 배치 상세로 이동하여 CCP 기록지 직접 확인
        toast.success(`${L("batch")} 생성 완료!`, {
          description: `${ccpMsg} · 설비기준·공정기준 삽입 완료 → CCP 기록지 확인 후 수동 승인`,
          duration: 5000,
        });
        setLocation(`/dashboard/batch/${data.batchId}`);
      }
    },
    onError: (error: { message: string }) => {
      toast.error(`${L("batch")} 생성 실패: ${error.message}`);
    },
  });

  // ── 폼 제출 ──
  const handleSubmit = () => {
    if (!selectedProductId || !plannedQuantityKg || !batchCode) {
      toast.error(`${L("product")}, 생산량, ${L("batch")}번호를 모두 입력해주세요`);
      return;
    }
    const qty = parseFloat(plannedQuantityKg);
    if (isNaN(qty) || qty <= 0) {
      toast.error("올바른 생산량을 입력해주세요");
      return;
    }

    const payload: any = {
      siteId: user?.siteId || 1,
      productId: parseInt(selectedProductId),
      batchNumber: batchCode,
      plannedStartDate: new Date(productionDate),
      plannedEndDate: new Date(productionDate),
      plannedQuantity: qty,
      mode: processingMode === "auto" ? "auto" : "manual",
      batchStartTime: batchStartTime || undefined,
    };

    // 실제 생산수량이 입력된 경우 함께 전달
    if (skuOutputsPayload.length > 0) {
      payload.skuOutputs = skuOutputsPayload;
    }

    createBatchMutation.mutate(payload);
  };

  const isReady = selectedProductId && plannedQuantityKg && parseFloat(plannedQuantityKg) > 0 && batchCode;

  // 실제 수량 입력 여부
  const hasActualInputs = skuOutputsPayload.length > 0;

  const content = (
      <div className="space-y-4">

        {/* 헤더 – 임베디드 모드에서는 BatchManagement가 자체 헤더를 가지므로 표시 */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Factory className="h-6 w-6 text-primary" />
            새 배치 생성
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {`${L("product")}과 생산량을 입력하면`} CCP · 체크리스트 · 기록지가 자동 생성됩니다
          </p>
        </div>

        {/* ── CCP 처리 모드 선택 ── */}
        <Card className={processingMode === "auto"
          ? "border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20"
          : "border-orange-300 dark:border-orange-700 bg-orange-50/40 dark:bg-orange-950/20"
        }>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {processingMode === "auto"
                ? <Zap className="h-5 w-5 text-blue-600" />
                : <ClipboardCheck className="h-5 w-5 text-orange-600" />
              }
              CCP 처리 방식 선택
            </CardTitle>
            <CardDescription>
              자동처리: CCP 기록지 자동 작성 후 승인관리로 이동 &nbsp;|&nbsp; 수동처리: 기초데이터 삽입 후 직접 확인·승인
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {/* 자동처리 버튼 */}
              <button
                type="button"
                onClick={() => setProcessingMode("auto")}
                className={`relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                  processingMode === "auto"
                    ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40 shadow-md"
                    : "border-muted bg-muted/30 hover:border-blue-300"
                }`}
              >
                {processingMode === "auto" && (
                  <span className="absolute top-2 right-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold text-sm text-blue-700 dark:text-blue-300">자동처리</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block flex-shrink-0" />
                    CCP 기록지 자동 생성
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block flex-shrink-0" />
                    설비기준·공정기준 자동 삽입
                  </div>
                  <div className="flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400">
                    <ArrowRight className="h-3 w-3 flex-shrink-0" />
                    생성 후 승인관리로 자동 이동
                  </div>
                </div>
              </button>

              {/* 수동처리 버튼 */}
              <button
                type="button"
                onClick={() => setProcessingMode("manual")}
                className={`relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all text-left ${
                  processingMode === "manual"
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950/40 shadow-md"
                    : "border-muted bg-muted/30 hover:border-orange-300"
                }`}
              >
                {processingMode === "manual" && (
                  <span className="absolute top-2 right-2">
                    <CheckCircle2 className="h-4 w-4 text-orange-600" />
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-orange-600" />
                  <span className="font-semibold text-sm text-orange-700 dark:text-orange-300">수동처리</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block flex-shrink-0" />
                    설비기준·공정기준 기초데이터 삽입
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block flex-shrink-0" />
                    {`${L("batch")} 상세에서 직접 기록지 확인`}
                  </div>
                  <div className="flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
                    <ArrowRight className="h-3 w-3 flex-shrink-0" />
                    확인 후 수동으로 승인 버튼 처리
                  </div>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* STEP 1: 제품 + 생산량 - 횡방향 2열 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">1</span>
              {`${L("product")} 및 생산량 설정`}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-visible">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 overflow-visible">
            {/* 제품 선택 - Autocomplete Input */}
            <div className="space-y-2">
              <Label htmlFor="product">{L("product")} *</Label>
              {productsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground h-10">
                  <Loader2 className="h-4 w-4 animate-spin" /> {`${L("product")} 목록 로딩 중...`}
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      ref={productInputRef}
                      id="product"
                      type="text"
                      placeholder={`${L("product")}명 또는 코드 검색...`}
                      value={productSearchOpen ? productSearchText : (selectedProduct ? (selectedProduct.productName || `제품 #${selectedProduct.id}`) : productSearchText)}
                      onChange={(e) => {
                        setProductSearchText(e.target.value);
                        setProductSearchOpen(true);
                        if (!e.target.value && selectedProductId) {
                          setSelectedProductId("");
                        }
                      }}
                      onFocus={() => {
                        setProductSearchOpen(true);
                        if (selectedProduct) {
                          setProductSearchText("");
                        }
                      }}
                      className="pl-9 h-10"
                      autoComplete="off"
                    />
                    {selectedProductId && !productSearchOpen && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 text-lg leading-none"
                        onClick={() => {
                          setSelectedProductId("");
                          setProductSearchText("");
                          setProductSearchOpen(true);
                          productInputRef.current?.focus();
                        }}
                        title="선택 해제"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {productSearchOpen && (
                    <div
                      ref={productDropdownRef}
                      className="absolute z-50 top-full left-0 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-[240px] overflow-y-auto"
                    >
                      {filteredProducts.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                          {products.length === 0 ? "등록된 제품이 없습니다" : "일치하는 제품이 없습니다"}
                        </div>
                      ) : (
                        filteredProducts.map((product: any) => (
                          <button
                            key={product.id}
                            type="button"
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                              selectedProductId === product.id.toString() && "bg-accent"
                            )}
                            onClick={() => {
                              setSelectedProductId(product.id.toString());
                              setProductSearchText("");
                              setProductSearchOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                selectedProductId === product.id.toString() ? "opacity-100 text-emerald-600" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-medium truncate">{product.productName || `제품 #${product.id}`}</span>
                              {product.productCode && (
                                <span className="text-[11px] text-muted-foreground truncate">{product.productCode}</span>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
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

            {/* 배치 시작시간 */}
            <div className="space-y-2">
              <Label htmlFor="batchStartTime">{L("batch")} 시작시간</Label>
              <Input
                id="batchStartTime"
                type="time"
                value={batchStartTime}
                onChange={(e) => setBatchStartTime(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">작업 시작 기준시간</p>
            </div>

            {/* 생산량 */}
            <div className="space-y-2">
              <Label htmlFor="qty">목표 생산량 (kg) *</Label>
              <Input
                id="qty"
                type="number"
                step="1"
                min="1"
                value={plannedQuantityKg}
                onChange={(e) => setPlannedQuantityKg(e.target.value)}
                placeholder="예: 300"
              />
            </div>

            {/* 배치 번호 */}
            <div className="space-y-2">
              <Label htmlFor="batchCode">{L("batch")} 번호 *</Label>
              <div className="flex gap-2">
                <Input
                  id="batchCode"
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                  placeholder="예: 30001-20260226-001"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleGenerateBatchCode}
                  disabled={!selectedProductId || batchCodeLoading}
                  title="배치 번호 자동 생성"
                >
                  {batchCodeLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
            </div>{/* end grid */}
          </CardContent>
        </Card>

        {/* STEP 2: SKU 예상/실제 수량 */}
        {selectedProductId && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <span className="bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">2</span>
                SKU 생산 수량
                {skusLoading && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
              </CardTitle>
              <CardDescription>
                {filteredSkus.length > 0
                  ? `${selectedProduct?.productName} · SKU ${filteredSkus.length}종 · 예상수량 및 실제 생산수량 입력`
                  : "등록된 SKU가 없습니다 (생산 후 SKU 관리에서 등록 가능)"}
              </CardDescription>
            </CardHeader>
            {filteredSkus.length > 0 && (
              <CardContent className="space-y-3">
                {/* 컬럼 헤더 */}
                <div className="grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-3">
                  <div className="col-span-4">SKU</div>
                  <div className="col-span-3 text-right">예상수량</div>
                  <div className="col-span-2 text-center">실제 생산</div>
                  <div className="col-span-3 text-center">불량수량</div>
                </div>

                {/* SKU 행 */}
                {(skuCalculations.length > 0 ? skuCalculations : filteredSkus.map((s: any) => ({
                  ...s, estimatedQty: null, totalKg: null
                }))).map((sku: any) => {
                  const input = skuActualInputs[sku.id] || { actualQty: "", defectiveQty: "" };
                  const actualVal = parseInt(input.actualQty || "0") || 0;
                  const kgPerUnit = parseFloat(sku.kgPerSalesUnit) || 1;
                  const actualKg = actualVal > 0 ? (actualVal * kgPerUnit).toFixed(2) : null;

                  return (
                    <div
                      key={sku.id}
                      className="grid grid-cols-12 gap-2 items-center p-3 rounded-lg border bg-muted/30"
                    >
                      {/* SKU 정보 */}
                      <div className="col-span-4">
                        <div className="font-medium text-sm truncate">{sku.skuName}</div>
                        <div className="text-xs text-muted-foreground">
                          {sku.skuCode} · {sku.kgPerSalesUnit}kg
                        </div>
                      </div>

                      {/* 예상수량 */}
                      <div className="col-span-3 text-right">
                        {sku.estimatedQty !== null ? (
                          <>
                            <div className="font-semibold text-primary text-sm">
                              {sku.estimatedQty.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {sku.salesUnit} · {sku.totalKg}kg
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </div>

                      {/* 실제 생산수량 입력 */}
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder={sku.estimatedQty !== null ? sku.estimatedQty.toString() : "0"}
                          value={input.actualQty}
                          onChange={(e) => handleActualQtyChange(sku.id, "actualQty", e.target.value)}
                          className="h-8 text-sm text-center"
                        />
                        {actualKg && (
                          <div className="text-xs text-center text-muted-foreground mt-0.5">
                            {actualKg}kg
                          </div>
                        )}
                      </div>

                      {/* 불량수량 입력 */}
                      <div className="col-span-3">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          value={input.defectiveQty}
                          onChange={(e) => handleActualQtyChange(sku.id, "defectiveQty", e.target.value)}
                          className="h-8 text-sm text-center"
                        />
                      </div>
                    </div>
                  );
                })}

                {/* 실제 생산량 합계 */}
                {hasActualInputs && (
                  <div className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
                    <span className="font-medium text-blue-700 dark:text-blue-300">실제 생산 합계</span>
                    <span className="font-bold text-blue-700 dark:text-blue-300">
                      {totalActualKg.toFixed(2)} kg
                    </span>
                  </div>
                )}

                {/* 안내 메시지 */}
                <div className="p-2 bg-gray-50 dark:bg-gray-950/30 rounded text-xs text-gray-600 dark:text-gray-400 flex items-start gap-1">
                  <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
                  <span>
                    실제 생산수량을 입력하면 배치 생성 시 즉시 반영됩니다.
                    미입력 시 예상수량으로만 등록되며, 배치 완료 단계에서도 입력할 수 있습니다.
                  </span>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* STEP 3: 처리 모드별 안내 */}
        {isReady && (
          <Card className={processingMode === "auto"
            ? "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20"
            : "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"
          }>
            <CardHeader className="pb-3">
              <CardTitle className={`text-base flex items-center gap-2 ${
                processingMode === "auto"
                  ? "text-blue-700 dark:text-blue-400"
                  : "text-orange-700 dark:text-orange-400"
              }`}>
                {processingMode === "auto"
                  ? <><Zap className="h-5 w-5" /> 자동처리 — 배치 생성 후 처리 순서</>
                  : <><ClipboardCheck className="h-5 w-5" /> 수동처리 — 배치 생성 후 처리 순서</>
                }
              </CardTitle>
            </CardHeader>
            <CardContent>
              {processingMode === "auto" ? (
                <div className="space-y-2 text-sm">
                  {[
                    { step: "①", text: "원재료 투입 계획 자동 계산 (BOM 배합비 × 생산량, kg 단위)" },
                    { step: "②", text: "CCP 기록지 자동 생성 (공정그룹별 설비기준·공정기준값 자동 삽입)" },
                    { step: "③", text: "일일 체크리스트 자동 등록" },
                    { step: "④", text: "승인 요청 자동 생성 (pending_review 상태)" },
                    { step: "⑤", text: "→ 승인관리 페이지로 자동 이동 (확인 후 승인 처리)" },
                    ...(hasActualInputs ? [{ step: "●", text: `SKU 실제 생산수량 즉시 기록 (${skuOutputsPayload.length}종)` }] : []),
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`text-xs font-bold flex-shrink-0 mt-0.5 ${i === 4 ? "text-blue-600" : "text-blue-400"}`}>
                        {item.step}
                      </span>
                      <span className={i === 4 ? "text-blue-700 dark:text-blue-300 font-semibold" : "text-muted-foreground"}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  {[
                    { step: "①", text: "원재료 투입 계획 자동 계산 (BOM 배합비 × 생산량, kg 단위)" },
                    { step: "②", text: "CCP 기록지 생성 + 설비기준·공정기준 기초데이터 삽입" },
                    { step: "③", text: "일일 체크리스트 자동 등록" },
                    { step: "④", text: "→ 배치 상세 페이지 이동: 기록지 내용 직접 확인" },
                    { step: "⑤", text: "실측값 입력 및 CCP 기록지 검토 후 승인 버튼으로 수동 승인" },
                    ...(hasActualInputs ? [{ step: "●", text: `SKU 실제 생산수량 즉시 기록 (${skuOutputsPayload.length}종)` }] : []),
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`text-xs font-bold flex-shrink-0 mt-0.5 ${(i === 3 || i === 4) ? "text-orange-600" : "text-orange-400"}`}>
                        {item.step}
                      </span>
                      <span className={(i === 3 || i === 4) ? "text-orange-700 dark:text-orange-300 font-semibold" : "text-muted-foreground"}>
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 버튼 */}
        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={!isReady || createBatchMutation.isPending}
            className={`flex-1 ${processingMode === "auto"
              ? "bg-blue-600 hover:bg-blue-700"
              : "bg-orange-600 hover:bg-orange-700"
            }`}
            size="lg"
          >
            {createBatchMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                배치 생성 중...
              </>
            ) : (
              <>
                {processingMode === "auto"
                  ? <Zap className="mr-2 h-5 w-5" />
                  : <FlaskConical className="mr-2 h-5 w-5" />
                }
                배치 생성
                <Badge variant="secondary" className="ml-2 text-xs">
                  {processingMode === "auto" ? "자동처리" : "수동처리"}
                </Badge>
                {hasActualInputs && (
                  <Badge variant="outline" className="ml-1 text-xs border-white/40 text-white">
                    실제수량 포함
                  </Badge>
                )}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setLocation("/dashboard/batch")}
            disabled={createBatchMutation.isPending}
          >
            취소
          </Button>
        </div>
      </div>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
