import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar, Package, AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ProductionSchedule() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  
  // 월별 배치 일정 조회
  const startDate = `${selectedMonth}-01`;
  const endDate = `${selectedMonth}-${new Date(parseInt(selectedMonth.split("-")[0]), parseInt(selectedMonth.split("-")[1]), 0).getDate()}`;
  
  const { data: batchSchedule, isLoading: isLoadingSchedule } = trpc.productionSchedule.getBatchSchedule.useQuery({
    startDate,
    endDate,
  });
  
  // 배치별 원재료 소요량 조회
  const { data: materialRequirements, isLoading: isLoadingMaterials } = trpc.productionSchedule.calculateMaterialRequirements.useQuery(
    { batchId: selectedBatchId! },
    { enabled: selectedBatchId !== null }
  );
  
  // 월 선택 옵션 생성 (최근 12개월)
  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
      options.push({ value, label });
    }
    return options;
  }, []);
  
  // 배치 상태 색상
  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      planned: { label: "계획", variant: "outline" },
      running: { label: "진행중", variant: "default" },
      completed: { label: "완료", variant: "secondary" },
      cancelled: { label: "취소", variant: "destructive" },
    };
    const config = statusMap[status] || { label: status, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">배치 일정 캘린더</h2>
          <p className="text-muted-foreground mt-1">
            {selectedMonth.replace("-", "년 ")}월 배치 일정 ({batchSchedule?.length || 0}건)
          </p>
        </div>
        
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoadingSchedule ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : !batchSchedule || batchSchedule.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              선택한 기간에 배치 일정이 없습니다.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>배치 코드</TableHead>
                  <TableHead>제품</TableHead>
                  <TableHead>계획 일자</TableHead>
                  <TableHead>계획 수량</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>원재료 소요량</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchSchedule.map((batch) => (
                  <TableRow key={batch.id}>
                    <TableCell className="font-medium">{batch.batchCode}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{batch.productName}</div>
                        <div className="text-sm text-muted-foreground">{batch.productCode}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(batch.plannedDate).toLocaleDateString("ko-KR")}
                    </TableCell>
                    <TableCell>{parseFloat(batch.plannedQuantity).toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(batch.status)}</TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedBatchId(batch.id)}
                      >
                        <Package className="h-4 w-4 mr-2" />
                        상세 보기
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* 원재료 소요량 다이얼로그 */}
      <Dialog open={selectedBatchId !== null} onOpenChange={(open) => !open && setSelectedBatchId(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>원재료 소요량 계산</DialogTitle>
            <DialogDescription>
              배치별 필요한 원재료 수량 및 재고 현황
            </DialogDescription>
          </DialogHeader>
          {isLoadingMaterials ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : !materialRequirements ? (
            <div className="text-center py-8 text-muted-foreground">
              데이터를 불러올 수 없습니다.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">계획 수량</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {parseFloat(materialRequirements.plannedQuantity).toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium">총 원재료 비용</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      ₩{materialRequirements.totalCost.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              </div>
              
              {materialRequirements.materials.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  레시피 정보가 없습니다.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>원재료</TableHead>
                      <TableHead>필요 수량</TableHead>
                      <TableHead>현재 재고</TableHead>
                      <TableHead>부족 수량</TableHead>
                      <TableHead>단가</TableHead>
                      <TableHead>총 비용</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {materialRequirements.materials.map((material) => (
                      <TableRow key={material.materialId}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{material.materialName}</div>
                            <div className="text-sm text-muted-foreground">{material.materialCode}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {material.requiredQuantity.toFixed(2)} {material.unit}
                        </TableCell>
                        <TableCell>
                          {material.currentStock.toFixed(2)} {material.unit}
                        </TableCell>
                        <TableCell>
                          {material.isShortage ? (
                            <div className="flex items-center gap-2 text-destructive">
                              <AlertCircle className="h-4 w-4" />
                              <span>{material.shortage.toFixed(2)} {material.unit}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>₩{material.unitPrice.toLocaleString()}</TableCell>
                        <TableCell className="font-medium">
                          ₩{material.totalCost.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
