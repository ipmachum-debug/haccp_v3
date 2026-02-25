import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { Package, Plus, Download, DollarSign, Eye, EyeOff, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useLocation } from "wouter";

export default function BatchList() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const { data: batchData, isLoading } = trpc.batch.list.useQuery({ page, limit });
  const batches = batchData?.items || [];
  const totalPages = batchData?.totalPages || 1;
  
  const { isWorker } = useAuth();
  const exportBatches = trpc.excel.exportBatches.useMutation();
  const [showCost, setShowCost] = useState(false);
  const [batchCosts, setBatchCosts] = useState<Record<number, number>>({});
  const [batchCostRatios, setBatchCostRatios] = useState<Record<number, number | null>>({});
  const utils = trpc.useUtils();
  
  // 배치 비용 조회
  const { data: costSummary } = trpc.batch.getCostSummary.useQuery(
    { batchIds: batches?.map(b => b.id) || [] },
    { enabled: showCost && !!batches && batches.length > 0 }
  );
  
  // 제품 목록 조회 (판매가 확인용)
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);
  
  useEffect(() => {
    if (costSummary) {
      const costs: Record<number, number> = {};
      costSummary.forEach(item => {
        costs[item.batchId] = item.totalCost;
      });
      setBatchCosts(costs);
    }
  }, [costSummary]);

  // 배치 원가율 계산 (costSummary와 제품 판매가 기반)
  useEffect(() => {
    if (showCost && batches && batches.length > 0 && batchCosts) {
      const ratios: Record<number, number | null> = {};
      batches.forEach((batch) => {
        const cost = batchCosts[batch.id];
        const product = products?.find(p => p.id === batch.productId);
        const unitPrice = product?.unitPrice ? parseFloat(product.unitPrice) : 0;
        
        if (cost && unitPrice && unitPrice > 0) {
          // 원가율 = (원재료 비용 / 판매가) * 100
          ratios[batch.id] = (cost / unitPrice) * 100;
        } else {
          ratios[batch.id] = null;
        }
      });
      setBatchCostRatios(ratios);
    }
  }, [showCost, batches, batchCosts]);

  // 상태 배지 스타일
  const getStatusBadge = (status: string) => {
    const styles = {
      completed: "bg-green-100 text-green-700",
      in_progress: "bg-blue-100 text-blue-700",
      shipped: "bg-purple-100 text-purple-700",
      planned: "bg-orange-100 text-orange-700",
    };
    const labels = {
      completed: "완료",
      in_progress: "진행 중",
      shipped: "출하됨",
      planned: "계획",
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || styles.planned}`}>
        {labels[status as keyof typeof labels] || "계획"}
      </span>
    );
  };

  return (
    
      <div className="flex flex-col gap-6 p-4 md:p-8">
        {/* 헤더 */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">배치 관리</h1>
            <p className="text-muted-foreground mt-1">
              생산 배치를 생성하고 관리하세요
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCost(!showCost)}
              className="min-h-[44px] min-w-[44px]"
            >
              {showCost ? (
                <><EyeOff className="mr-2 h-4 w-4" />비용 숨기기</>
              ) : (
                <><Eye className="mr-2 h-4 w-4" />비용 보기</>
              )}
            </Button>
            <Button 
              variant="outline" 
              onClick={async () => {
                const result = await exportBatches.mutateAsync({});
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename;
                link.click();
              }} 
              disabled={exportBatches.isPending}
              className="min-h-[44px] min-w-[44px]"
            >
              <Download className="mr-2 h-4 w-4" />
              Excel 다운로드
            </Button>
            {isWorker && (
              <Link href="/dashboard/batch/new">
                <Button className="min-h-[44px] min-w-[44px]">
                  <Plus className="mr-2 h-4 w-4" />
                  새 배치 생성
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* 배치 목록 */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">로딩 중...</div>
        ) : batches && batches.length > 0 ? (
          <>
            {/* 데스크톱: 테이블 뷰 */}
            <div className="hidden md:block border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>배치 코드</TableHead>
                    <TableHead>상태</TableHead>
                    {showCost && <TableHead className="text-right">총 비용</TableHead>}
                    {showCost && <TableHead className="text-right">원가율</TableHead>}
                    <TableHead>생성일</TableHead>
                    <TableHead>작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Package className="h-4 w-4 text-muted-foreground" />
                          {batch.batchCode}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(batch.status)}
                      </TableCell>
                      {showCost && (
                        <TableCell className="text-right font-medium">
                          {batchCosts[batch.id] !== undefined ? (
                            <div className="flex items-center justify-end gap-1">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              {batchCosts[batch.id].toLocaleString('ko-KR')}원
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                      )}
                      {showCost && (
                        <TableCell className="text-right font-medium">
                          {batchCostRatios[batch.id] !== undefined ? (
                            batchCostRatios[batch.id] !== null ? (
                              <span
                                className={
                                  batchCostRatios[batch.id]! >= 70
                                    ? "text-red-600 font-bold"
                                    : batchCostRatios[batch.id]! >= 50
                                    ? "text-orange-600 font-semibold"
                                    : "text-green-600"
                                }
                              >
                                {batchCostRatios[batch.id]!.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">판매가 미설정</span>
                            )
                          ) : (
                            <span className="text-muted-foreground text-sm">계산 중</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell>
                        {new Date(batch.createdAt).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/batch/${batch.id}`}>
                          <Button variant="outline" size="sm">
                            상세 보기
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* 모바일: 카드 뷰 */}
            <div className="md:hidden space-y-4">
              {batches.map((batch) => (
                <Link key={batch.id} href={`/dashboard/batch/${batch.id}`}>
                  <Card className="hover:bg-accent transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          {/* 배치 코드 */}
                          <div className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                            <span className="font-semibold text-base">{batch.batchCode}</span>
                          </div>
                          
                          {/* 상태 */}
                          <div>
                            {getStatusBadge(batch.status)}
                          </div>
                          
                          {/* 비용 (표시 시) */}
                          {showCost && batchCosts[batch.id] !== undefined && (
                            <div className="flex items-center gap-1 text-sm">
                              <DollarSign className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{batchCosts[batch.id].toLocaleString('ko-KR')}원</span>
                            </div>
                          )}
                          
                          {/* 생성일 */}
                          <div className="text-sm text-muted-foreground">
                            {new Date(batch.createdAt).toLocaleDateString("ko-KR")}
                          </div>
                        </div>
                        
                        {/* 화살표 아이콘 */}
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="min-h-[44px] min-w-[44px]"
                >
                  이전
                </Button>
                <span className="text-sm text-muted-foreground px-4">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="min-h-[44px] min-w-[44px]"
                >
                  다음
                </Button>
              </div>
            )}
          </>
        ) : (
          <EmptyState
            icon={Package}
            title="아직 생성된 배치가 없습니다"
            description="첫 번째 배치를 생성하여 생산 관리를 시작하세요. 배치를 통해 원재료 소비, 생산 진행, CCP 관리를 효율적으로 처리할 수 있습니다."
            actionLabel="첫 배치 생성하기"
            onAction={() => setLocation("/dashboard/batch/new")}
          />
        )}
      </div>
    
  );
}
