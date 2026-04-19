import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Loader2, Search, ChevronRight, Thermometer, Gauge, Zap, BookOpen, AlertCircle, CheckCircle2, Settings, Package, Beaker } from "lucide-react";
import { useState, useMemo } from "react";

const CCP_TYPE_COLORS: Record<string, string> = {
  "CCP-1B": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "CCP-2B": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "CCP-3B": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "CCP-4P": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

const CCP_TYPE_ICONS: Record<string, any> = {
  "CCP-1B": Thermometer,
  "CCP-2B": Zap,
  "CCP-3B": Thermometer,
  "CCP-4P": Gauge,
};

export default function ProductCcpMapping(props: { embedded?: boolean } & Record<string, any> = {}) {
  const { embedded = false } = props;
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [selectedProductName, setSelectedProductName] = useState("");

  // 제품-CCP 매핑 목록 (ccp_process_group_products 기반)
  const { data: mappingData, isLoading } = trpc.ccpMonitoring.getProductCcpMappings.useQuery({
    productId: undefined,
  });

  // 선택된 제품의 BOM 원재료 + CCP 공정 상세
  const { data: detailData, isLoading: isDetailLoading } = trpc.ccpMonitoring.getProductCcpDetail.useQuery(
    { productId: selectedProduct! },
    { enabled: !!selectedProduct }
  );

  // 제품 목록
  const products = useMemo(() => {
    if (!mappingData || !Array.isArray(mappingData)) return [];
    return mappingData as any[];
  }, [mappingData]);

  // CCP 타입 추출
  const getCcpTypesForProduct = (product: any): string[] => {
    if (product.mapped_ccp_types) {
      return String(product.mapped_ccp_types).split(",").filter(Boolean);
    }
    return [];
  };

  const handleProductSelect = (product: any) => {
    setSelectedProduct(product.id);
    setSelectedProductName(product.product_name);
  };

  // 필터링
  const filteredProducts = useMemo(() => {
    return products.filter((p: any) =>
      !searchTerm ||
      (p.product_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.product_code || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [products, searchTerm]);

  // 통계
  const stats = useMemo(() => {
    const total = products.length;
    const mapped = products.filter((p: any) => getCcpTypesForProduct(p).length > 0).length;
    const withRecipe = products.filter((p: any) => p.recipe_name).length;
    const unmapped = total - mapped;
    return { total, mapped, withRecipe, unmapped };
  }, [products]);

  const content = (
    <div className={embedded ? "space-y-4" : "space-y-4 p-6"}>
      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          제품-CCP 매핑 관리
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          제품별 CCP 공정 그룹 매핑 현황과 BOM 원재료별 CCP 적용 내역을 확인합니다.
          매핑 변경은 <strong>품목제조보고서</strong> 페이지에서 수행하세요.
        </p>
      </div>

      {/* 통계 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: "전체 제품", value: stats.total, color: "text-gray-600" },
          { label: "CCP 매핑됨", value: stats.mapped, color: "text-green-600" },
          { label: "레시피 보유", value: stats.withRecipe, color: "text-blue-600" },
          { label: "미매핑", value: stats.unmapped, color: "text-red-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="py-2 px-3 flex items-center gap-2">
              <div>
                <p className="text-[10px] text-muted-foreground">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* 왼쪽: 제품 목록 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 px-3 pt-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="제품명 또는 코드 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="max-h-[560px] overflow-y-auto p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-xs">
                {searchTerm ? "검색 결과가 없습니다" : "등록된 제품이 없습니다"}
              </div>
            ) : (
              filteredProducts.map((product: any) => {
                const ccpTypes = getCcpTypesForProduct(product);
                const isActive = selectedProduct === product.id;

                return (
                  <button
                    key={product.id}
                    onClick={() => handleProductSelect(product)}
                    className={`w-full text-left px-3 py-2 border-b last:border-b-0 transition-colors ${
                      isActive ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-xs truncate">{product.product_name}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span>{product.product_code}</span>
                          {product.recipe_name && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                              <BookOpen className="h-2.5 w-2.5 mr-0.5" />
                              {product.recipe_name.substring(0, 8)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {ccpTypes.length > 0 ? (
                          ccpTypes.map(t => (
                            <Badge key={t} className={`${CCP_TYPE_COLORS[t] || ""} text-[8px] px-1 py-0`}>
                              {t.replace("CCP-", "")}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-[8px] px-1 py-0 text-gray-400">미매핑</Badge>
                        )}
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* 오른쪽: CCP 상세 */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedProduct ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Settings className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <h3 className="text-sm font-medium text-muted-foreground">제품을 선택하세요</h3>
                <p className="text-xs text-muted-foreground/70 mt-1 text-center">
                  왼쪽 목록에서 제품을 선택하면<br />
                  BOM 원재료별 CCP 매핑과 한계기준을 확인할 수 있습니다.
                </p>
              </CardContent>
            </Card>
          ) : isDetailLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* CCP 공정 그룹 한계기준 (읽기전용) */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Gauge className="h-4 w-4 text-primary" />
                    CCP 공정 그룹 한계기준
                    <Badge variant="outline" className="text-[10px]">{selectedProductName}</Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    이 제품에 적용된 CCP 공정 그룹의 한계기준입니다. (읽기전용 - CCP 관리 메뉴에서 수정)
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {(!detailData?.processGroups || detailData.processGroups.length === 0) ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 text-xs">
                      <AlertCircle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" />
                      <span className="text-yellow-800 dark:text-yellow-200">
                        이 제품에 매핑된 CCP 공정 그룹이 없습니다. <strong>CCP 관리</strong> 메뉴에서 제품을 공정 그룹에 추가하세요.
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {detailData.processGroups.map((pg: any) => {
                        const IconComp = CCP_TYPE_ICONS[pg.ccp_type] || Gauge;
                        return (
                          <div key={pg.id} className="flex items-start gap-3 p-2.5 rounded-lg border bg-card">
                            <div className="flex items-center gap-2 min-w-[140px]">
                              <Badge className={`${CCP_TYPE_COLORS[pg.ccp_type] || ""} text-[10px] px-1.5 py-0`}>
                                {pg.ccp_type}
                              </Badge>
                              <span className="text-xs font-medium truncate">{pg.name}</span>
                            </div>
                            <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px]">
                              {(pg.temperature_min || pg.temperature_max) && (
                                <div>
                                  <span className="text-muted-foreground">온도: </span>
                                  <span className="font-medium">
                                    {pg.temperature_min || "-"}~{pg.temperature_max || "-"}°C
                                  </span>
                                </div>
                              )}
                              {pg.time_min && (
                                <div>
                                  <span className="text-muted-foreground">시간: </span>
                                  <span className="font-medium">
                                    {pg.time_min}{pg.time_max ? `~${pg.time_max}` : "+"}분
                                  </span>
                                </div>
                              )}
                              {(pg.pressure_min || pg.pressure_max) && (
                                <div>
                                  <span className="text-muted-foreground">압력: </span>
                                  <span className="font-medium">
                                    {pg.pressure_min || "-"}{pg.pressure_max ? `~${pg.pressure_max}` : "+"}bar
                                  </span>
                                </div>
                              )}
                              {pg.description && (
                                <div className="text-muted-foreground truncate col-span-2 md:col-span-1">
                                  {pg.description}
                                </div>
                              )}
                              {!pg.temperature_min && !pg.temperature_max && !pg.time_min && !pg.pressure_min && (
                                <div className="text-muted-foreground">한계기준 미설정</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* BOM 원재료별 CCP 매핑 */}
              <Card>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Beaker className="h-4 w-4 text-primary" />
                    BOM 원재료별 CCP 매핑
                    <Badge variant="outline" className="text-[10px]">{selectedProductName}</Badge>
                    {detailData?.ingredients && (
                      <Badge variant="secondary" className="text-[10px]">
                        {detailData.ingredients.length}개 원재료
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    품목제조보고서(BOM)의 원재료별 CCP 공정 그룹 매핑 현황입니다. 매핑 변경은 품목제조보고서 편집에서 수행하세요.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  {(!detailData?.ingredients || detailData.ingredients.length === 0) ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-xs">
                      <Package className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                      <span className="text-blue-800 dark:text-blue-200">
                        이 제품의 품목제조보고서(BOM) 데이터가 없습니다. 품목제조보고서를 먼저 등록하세요.
                      </span>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[30px] text-xs">#</TableHead>
                          <TableHead className="text-xs">원재료명</TableHead>
                          <TableHead className="text-xs w-[70px] text-right">배합비(%)</TableHead>
                          <TableHead className="text-xs w-[80px] text-right">수율조정(kg)</TableHead>
                          <TableHead className="text-xs">CCP 공정 그룹</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.ingredients.map((ing: any, idx: number) => (
                          <TableRow key={ing.id || idx}>
                            <TableCell className="text-xs text-muted-foreground py-1.5">{ing.line_no || idx + 1}</TableCell>
                            <TableCell className="text-xs font-medium py-1.5">
                              {ing.material_name || `원재료 #${ing.material_id}`}
                            </TableCell>
                            <TableCell className="text-xs text-right py-1.5">
                              {ing.quantity}
                            </TableCell>
                            <TableCell className="text-xs text-right py-1.5">
                              {ing.corrected_quantity || ing.quantity}
                            </TableCell>
                            <TableCell className="py-1.5">
                              {ing.process_group_name ? (
                                <div className="flex items-center gap-1">
                                  <Badge className={`${CCP_TYPE_COLORS[ing.ingredient_ccp_type] || "bg-gray-100 text-gray-800"} text-[9px] px-1 py-0`}>
                                    {ing.ingredient_ccp_type || "?"}
                                  </Badge>
                                  <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
                                    {ing.process_group_name}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">미지정</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* 합계 행 */}
                        <TableRow className="bg-muted/50 font-medium">
                          <TableCell className="py-1.5" />
                          <TableCell className="text-xs py-1.5">합계 (배합비 기준)</TableCell>
                          <TableCell className="text-xs text-right py-1.5 font-bold">
                            {detailData.ingredients.reduce((sum: number, ing: any) => sum + (parseFloat(ing.quantity) || 0), 0).toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-xs text-right py-1.5 font-bold">
                            {detailData.ingredients.reduce((sum: number, ing: any) => sum + (parseFloat(ing.corrected_quantity || ing.quantity) || 0), 0).toFixed(2)}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex gap-1">
                              {(() => {
                                const ccpTypes = new Set(
                                  detailData.ingredients
                                    .filter((i: any) => i.ingredient_ccp_type)
                                    .map((i: any) => i.ingredient_ccp_type)
                                );
                                return Array.from(ccpTypes).map((t: any) => (
                                  <Badge key={t} className={`${CCP_TYPE_COLORS[t] || ""} text-[9px] px-1 py-0`}>
                                    {t}
                                  </Badge>
                                ));
                              })()}
                            </div>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <DashboardLayout>
      {content}
    </DashboardLayout>
  );
}
