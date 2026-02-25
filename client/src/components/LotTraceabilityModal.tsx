import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, ArrowLeft, Package, Factory, Truck, Loader2, FileDown } from "lucide-react";

interface LotTraceabilityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function LotTraceabilityModal({ open, onOpenChange }: LotTraceabilityModalProps) {
  const [searchType, setSearchType] = useState<"material" | "product">("material");
  const [lotNumber, setLotNumber] = useState("");
  const [searchedLotNumber, setSearchedLotNumber] = useState("");
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);

  const generatePdfMutation = trpc.traceability.generateTracePdf.useMutation();

  // 원재료 LOT 번호로 정방향 추적
  const { data: forwardTrace, isLoading: forwardLoading } = trpc.traceability.byMaterialLot.useQuery(
    { lotNumber: searchedLotNumber },
    { enabled: searchType === "material" && !!searchedLotNumber }
  );

  // 완제품 LOT 번호로 역방향 추적
  const { data: backwardTrace, isLoading: backwardLoading } = trpc.traceability.byProductLot.useQuery(
    { lotNumber: searchedLotNumber },
    { enabled: searchType === "product" && !!searchedLotNumber }
  );

  const handleSearch = () => {
    if (lotNumber.trim()) {
      setSearchedLotNumber(lotNumber.trim());
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>LOT 추적성</DialogTitle>
          <DialogDescription>
            원재료 또는 완제품 LOT 번호를 입력하여 전체 생산 이력을 추적할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 검색 카드 */}
          <Card>
            <CardHeader>
              <CardTitle>LOT 번호 검색</CardTitle>
              <CardDescription>추적할 LOT 번호를 입력하세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={searchType} onValueChange={(v) => setSearchType(v as "material" | "product")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="material">
                    <Package className="h-4 w-4 mr-2" />
                    원재료 LOT
                  </TabsTrigger>
                  <TabsTrigger value="product">
                    <Factory className="h-4 w-4 mr-2" />
                    완제품 LOT
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex gap-2">
                <Input
                  placeholder="LOT 번호를 입력하세요"
                  value={lotNumber}
                  onChange={(e) => setLotNumber(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
                <Button onClick={handleSearch} disabled={!lotNumber.trim()}>
                  <Search className="h-4 w-4 mr-2" />
                  검색
                </Button>
                {searchedLotNumber && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      setIsPdfGenerating(true);
                      try {
                        const result = await generatePdfMutation.mutateAsync({
                          traceType: searchType === "material" ? "forward" : "backward",
                          searchLotNumber: searchedLotNumber,
                          resultData: searchType === "material" ? forwardTrace : backwardTrace,
                        });

                        // Base64 PDF를 블롭으로 변환하여 다운로드
                        const byteCharacters = atob(result.pdfBase64);
                        const byteNumbers = new Array(byteCharacters.length);
                        for (let i = 0; i < byteCharacters.length; i++) {
                          byteNumbers[i] = byteCharacters.charCodeAt(i);
                        }
                        const byteArray = new Uint8Array(byteNumbers);
                        const blob = new Blob([byteArray], { type: "application/pdf" });
                        const url = window.URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = `LOT_추적_${searchedLotNumber}_${new Date().getTime()}.pdf`;
                        link.click();
                        window.URL.revokeObjectURL(url);
                      } catch (error) {
                        console.error("PDF 생성 오류:", error);
                        alert("PDF 생성에 실패했습니다.");
                      } finally {
                        setIsPdfGenerating(false);
                      }
                    }}
                    disabled={isPdfGenerating}
                  >
                    {isPdfGenerating ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <FileDown className="h-4 w-4 mr-2" />
                    )}
                    PDF 출력
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 검색 결과 */}
          {searchedLotNumber && (
            <>
              {searchType === "material" && (
                <>
                  {forwardLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : forwardTrace ? (
                    <div className="space-y-4">
                      {/* 정방향 추적 결과 */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <ArrowRight className="h-5 w-5 text-primary" />
                            정방향 추적 결과
                          </CardTitle>
                          <CardDescription>원재료 → 생산 배치 → 완제품</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {/* 원재료 정보 */}
                          <div>
                            <h3 className="font-semibold mb-3 flex items-center gap-2">
                              <Package className="h-4 w-4" />
                              원재료 정보
                            </h3>
                            <div className="bg-muted p-4 rounded-lg space-y-2">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">LOT 번호:</span>
                                <span className="font-medium">{forwardTrace.lot?.lotNumber || searchedLotNumber}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">원재료 ID:</span>
                                <span className="font-medium">{forwardTrace.lot?.materialId || "N/A"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">입고일:</span>
                                <span className="font-medium">
                                  {forwardTrace.lot?.createdAt ? new Date(forwardTrace.lot.createdAt).toLocaleDateString("ko-KR") : "N/A"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 사용된 배치 목록 */}
                          <div>
                            <h3 className="font-semibold mb-3 flex items-center gap-2">
                              <Factory className="h-4 w-4" />
                              사용된 생산 배치 ({forwardTrace.batches?.length || 0}건)
                            </h3>
                            {forwardTrace.batches && forwardTrace.batches.length > 0 ? (
                              <div className="space-y-2">
                                {forwardTrace.batches.map((batch: any) => (
                                  <div key={batch.batchId || batch.id} className="bg-muted p-4 rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium">{batch.batchNumber || `Batch #${batch.id}`}</span>
                                      <Badge>{batch.productName || "Unknown"}</Badge>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      생산일: {batch.productionDate ? new Date(batch.productionDate).toLocaleDateString("ko-KR") : "N/A"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">사용된 배치가 없습니다.</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">해당 LOT 번호에 대한 추적 정보를 찾을 수 없습니다.</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {searchType === "product" && (
                <>
                  {backwardLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : backwardTrace ? (
                    <div className="space-y-4">
                      {/* 역방향 추적 결과 */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <ArrowLeft className="h-5 w-5 text-primary" />
                            역방향 추적 결과
                          </CardTitle>
                          <CardDescription>완제품 → 생산 배치 → 원재료</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                          {/* 완제품 정보 */}
                          <div>
                            <h3 className="font-semibold mb-3 flex items-center gap-2">
                              <Truck className="h-4 w-4" />
                              완제품 정보
                            </h3>
                            <div className="bg-muted p-4 rounded-lg space-y-2">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">LOT 번호:</span>
                                <span className="font-medium">{backwardTrace.batch?.lotNumber || searchedLotNumber}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">제품 ID:</span>
                                <span className="font-medium">{backwardTrace.batch?.productId || "N/A"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">생산일:</span>
                                <span className="font-medium">
                                  {backwardTrace.batch?.startTime ? new Date(backwardTrace.batch.startTime).toLocaleDateString("ko-KR") : "N/A"}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* 생산 배치 정보 */}
                          {backwardTrace.batch && (
                            <div>
                              <h3 className="font-semibold mb-3 flex items-center gap-2">
                                <Factory className="h-4 w-4" />
                                생산 배치 정보
                              </h3>
                              <div className="bg-muted p-4 rounded-lg space-y-2">
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">배치 번호:</span>
                                  <span className="font-medium">{backwardTrace.batch.batchCode}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">상태:</span>
                                  <span className="font-medium">{backwardTrace.batch.status}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">생산일:</span>
                                  <span className="font-medium">
                                    {backwardTrace.batch.startTime ? new Date(backwardTrace.batch.startTime).toLocaleDateString("ko-KR") : "N/A"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* 사용된 원재료 */}
                          {(backwardTrace as any).materials && (
                            <div>
                              <h3 className="font-semibold mb-3 flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                사용된 원재료 ({(backwardTrace as any).materials.length}건)
                              </h3>
                              <div className="space-y-2">
                                {(backwardTrace as any).materials.map((material: any, index: number) => (
                                  <div key={index} className="bg-muted p-4 rounded-lg">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="font-medium">{material.materialName || `원재료 #${index + 1}`}</span>
                                      <Badge variant="outline">{material.lotNumber || "Unknown"}</Badge>
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                      사용량: {material.usedQuantity || "N/A"} {material.unit || ""}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">해당 LOT 번호에 대한 추적 정보를 찾을 수 없습니다.</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
