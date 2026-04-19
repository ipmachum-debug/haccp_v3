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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Package, Plus, Download, DollarSign, Eye, EyeOff, ChevronRight, Trash2, CalendarDays, List, ChevronLeft } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import { useLocation } from "wouter";
import { toast } from "sonner";

type ViewMode = "table" | "calendar";

// 날짜를 YYYY-MM-DD 형식으로 변환
/** 날짜를 로컬(KST) 기준 YYYY-MM-DD 문자열로 변환 (toISOString은 UTC이므로 사용 금지) */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateStr(d: any): string {
  if (!d) return "날짜없음";
  // planned_date가 "2026-03-09" 같은 날짜 문자열이면 그대로 사용
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  // "2026-03-09T..." 형태면 날짜 부분만 추출
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}T/.test(d)) return d.split("T")[0];
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "날짜없음";
  return toLocalDateStr(dt);
}

function getMonthDays(year: number, month: number): Date[] {
  const days: Date[] = [];
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // 이전 달 빈 칸
  const startDow = firstDay.getDay(); // 0=Sun
  for (let i = startDow - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }
  // 현재 달
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // 다음 달 빈 칸 (7의 배수까지)
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, days.length - lastDay.getDate() - startDow + 1));
  }
  return days;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500",
  in_progress: "bg-blue-500",
  shipped: "bg-purple-500",
  approved: "bg-emerald-600",
  planned: "bg-orange-400",
};
const STATUS_LABELS: Record<string, string> = {
  completed: "완료",
  in_progress: "진행중",
  shipped: "출하",
  approved: "승인",
  planned: "계획",
};

export default function BatchList() {
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [limit] = useState(200);
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const { data: batchData, isLoading, isError, error, refetch } = trpc.batch.list.useQuery({ page, limit });
  const batches = batchData?.items || [];
  const totalPages = batchData?.totalPages || 1;

  const { isWorker, user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const exportBatches = trpc.excel.exportBatches.useMutation();
  const [showCost, setShowCost] = useState(false);
  const [batchCosts, setBatchCosts] = useState<Record<number, number>>({});
  const [batchCostRatios, setBatchCostRatios] = useState<Record<number, number | null>>({});

  // 달력 날짜 상세 다이얼로그
  const [dayDetailDate, setDayDetailDate] = useState<string | null>(null);

  // 삭제 확인 다이얼로그
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; batchCode: string } | null>(null);

  const deleteMutation = trpc.batch.delete.useMutation({
    onSuccess: () => {
      toast.success("배치가 삭제되었습니다.");
      setDeleteTarget(null);
      refetch();
    },
    onError: (err: { message: string }) => {
      toast.error(`삭제 실패: ${err.message}`);
      setDeleteTarget(null);
    },
  });

  // 배치 비용 조회
  const { data: costSummary } = trpc.batch.getCostSummary.useQuery(
    { batchIds: batches?.map((b: any) => b.id) || [] },
    { enabled: showCost && !!batches && batches.length > 0 }
  );

  // 제품 목록 조회 (판매가 확인용 - 비용 보기 활성화 시에만)
  const { data: _rawProducts } = trpc.product.list.useQuery(
    { limit: 500 },
    { enabled: showCost }
  );
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);

  useEffect(() => {
    if (costSummary) {
      const costs: Record<number, number> = {};
      costSummary.forEach((item: any) => {
        costs[item.batchId] = item.totalCost;
      });
      setBatchCosts(costs);
    }
  }, [costSummary]);

  useEffect(() => {
    if (showCost && batches && batches.length > 0 && batchCosts) {
      const ratios: Record<number, number | null> = {};
      batches.forEach((batch: any) => {
        const cost = batchCosts[batch.id];
        const product = products?.find((p: any) => p.id === batch.productId);
        const unitPrice = product?.unitPrice ? parseFloat(product.unitPrice) : 0;
        if (cost && unitPrice && unitPrice > 0) {
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
      completed: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
      in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
      shipped: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
      approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
      planned: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
    };
    const labels = {
      completed: "완료",
      in_progress: "진행 중",
      shipped: "출하됨",
      approved: "승인",
      planned: "계획",
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status as keyof typeof styles] || styles.planned}`}>
        {labels[status as keyof typeof labels] || "계획"}
      </span>
    );
  };

  // 캘린더용: 날짜별 배치 그룹핑
  const batchesByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    (batches || []).forEach((b: any) => {
      const dateKey = toDateStr(b.plannedDate || b.createdAt);
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(b);
    });
    return map;
  }, [batches]);

  const calDays = useMemo(() => getMonthDays(calMonth.year, calMonth.month), [calMonth]);
  const todayStr = toLocalDateStr(new Date());
  const monthLabel = `${calMonth.year}년 ${calMonth.month + 1}월`;

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* 액션 버튼 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => { setViewMode("calendar"); setPage(1); }}
              className="h-9"
            >
              <CalendarDays className="h-4 w-4 mr-1" />
              달력
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-9"
            >
              <List className="h-4 w-4 mr-1" />
              목록
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCost(!showCost)}
              className="h-9"
            >
              {showCost ? <><EyeOff className="mr-1 h-4 w-4" />비용 숨기기</> : <><Eye className="mr-1 h-4 w-4" />비용 보기</>}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const result = await exportBatches.mutateAsync({});
                const link = document.createElement('a');
                link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${result.data}`;
                link.download = result.filename;
                link.click();
              }}
              disabled={exportBatches.isPending}
              className="h-9"
            >
              <Download className="mr-1 h-4 w-4" />Excel
            </Button>
            {isWorker && (
              <Link href="/dashboard/batch/new">
                <Button size="sm" className="h-9"><Plus className="mr-1 h-4 w-4" />새 배치</Button>
              </Link>
            )}
            {isWorker && (
              <Link href="/dashboard/batch/bulk">
                <Button size="sm" className="h-9 bg-orange-500 hover:bg-orange-600 text-white">
                  <Plus className="mr-1 h-4 w-4" />일괄생성
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* 배치 목록 */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">로딩 중...</div>
        ) : isError ? (
          <div className="text-center py-12 text-red-500">
            배치 목록 로딩 실패: {error?.message || "서버 에러"}
            <Button variant="outline" size="sm" className="ml-3" onClick={() => refetch()}>재시도</Button>
          </div>
        ) : batches && batches.length > 0 ? (
          <>
            {viewMode === "calendar" ? (
              /* ── 달력 뷰 ── */
              <Card>
                <CardContent className="p-3">
                  {/* 월 네비게이션 */}
                  <div className="flex items-center justify-between mb-3">
                    <Button variant="ghost" size="sm" onClick={() => {
                      const prev = calMonth.month === 0
                        ? { year: calMonth.year - 1, month: 11 }
                        : { year: calMonth.year, month: calMonth.month - 1 };
                      setCalMonth(prev);
                    }}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <h3 className="text-sm font-semibold">{monthLabel}</h3>
                    <Button variant="ghost" size="sm" onClick={() => {
                      const next = calMonth.month === 11
                        ? { year: calMonth.year + 1, month: 0 }
                        : { year: calMonth.year, month: calMonth.month + 1 };
                      setCalMonth(next);
                    }}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* 요일 헤더 */}
                  <div className="grid grid-cols-7 text-center text-xs text-muted-foreground font-medium mb-1">
                    {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                      <div key={d} className={`py-1 ${d === "일" ? "text-red-400" : d === "토" ? "text-blue-400" : ""}`}>{d}</div>
                    ))}
                  </div>

                  {/* 날짜 그리드 */}
                  <div className="grid grid-cols-7 border-t border-l">
                    {calDays.map((day, i) => {
                      const ds = toLocalDateStr(day);
                      const isCurrentMonth = day.getMonth() === calMonth.month;
                      const isToday = ds === todayStr;
                      const dayBatches = batchesByDate[ds] || [];

                      return (
                        <div
                          key={i}
                          className={`border-r border-b min-h-[80px] p-1 text-xs ${
                            !isCurrentMonth ? "bg-gray-50 text-gray-300" : ""
                          } ${isToday ? "bg-blue-50" : ""}`}
                        >
                          <div className={`text-right mb-0.5 ${isToday ? "font-bold text-blue-600" : ""} ${
                            day.getDay() === 0 ? "text-red-400" : day.getDay() === 6 ? "text-blue-400" : ""
                          }`}>
                            {day.getDate()}
                          </div>
                          <div className="space-y-0.5">
                            {dayBatches.slice(0, 3).map((b: any) => (
                              <Link key={b.id} href={`/dashboard/batch/${b.id}`}>
                                <div className={`px-1 py-0.5 rounded text-[10px] truncate cursor-pointer hover:opacity-80 text-white ${STATUS_COLORS[b.status] || "bg-gray-400"}`}>
                                  {b.productName || b.batchCode}
                                </div>
                              </Link>
                            ))}
                            {dayBatches.length > 3 && (
                              <button
                                onClick={() => setDayDetailDate(ds)}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-medium text-center w-full cursor-pointer hover:underline"
                              >
                                +{dayBatches.length - 3}건
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 범례 */}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[key]}`} />
                        {label}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              /* ── 테이블 뷰 ── */
              <>
                {/* 데스크톱: 테이블 뷰 */}
                <div className="hidden md:block border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>배치 코드</TableHead>
                        <TableHead>상태</TableHead>
                        <TableHead className="text-right">계획 수량</TableHead>
                        <TableHead>작업일</TableHead>
                        {showCost && <TableHead className="text-right">총 비용</TableHead>}
                        {showCost && <TableHead className="text-right">원가율</TableHead>}
                        <TableHead>생성일</TableHead>
                        <TableHead>작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches.map((batch: any) => (
                        <TableRow key={batch.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-muted-foreground" />
                              <div>
                                {batch.batchCode}
                                {batch.productName && (
                                  <div className="text-[10px] text-muted-foreground">{batch.productName}</div>
                                )}
                                {(batch as any).dayBatchGroup && (
                                  <div className="text-[10px] text-blue-500 font-normal">{(batch as any).dayBatchGroup} #{(batch as any).batchOrder || ""}</div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getStatusBadge(batch.status)}</TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {batch.plannedQuantity ? `${parseFloat(batch.plannedQuantity).toLocaleString("ko-KR")} kg` : "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {batch.plannedDate ? new Date(batch.plannedDate).toLocaleDateString("ko-KR") : "-"}
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
                                  <span className={
                                    batchCostRatios[batch.id]! >= 70 ? "text-red-600 font-bold"
                                    : batchCostRatios[batch.id]! >= 50 ? "text-orange-600 font-semibold"
                                    : "text-green-600"
                                  }>
                                    {batchCostRatios[batch.id]!.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground text-sm">판매가 미설정</span>
                                )
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            {new Date(batch.createdAt).toLocaleDateString("ko-KR")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Link href={`/dashboard/batch/${batch.id}`}>
                                <Button variant="outline" size="sm">상세 보기</Button>
                              </Link>
                              {(isWorker || isAdmin) && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                                  onClick={() => setDeleteTarget({ id: batch.id, batchCode: batch.batchCode })}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* 모바일: 카드 뷰 */}
                <div className="md:hidden space-y-4">
                  {batches.map((batch: any) => (
                    <Card key={batch.id} className="hover:bg-accent/50 transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <Link href={`/dashboard/batch/${batch.id}`} className="flex-1">
                            <div className="space-y-3">
                              <div className="flex items-center gap-2">
                                <Package className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                                <div>
                                  <span className="font-semibold text-base">{batch.batchCode}</span>
                                  {batch.productName && (
                                    <div className="text-xs text-muted-foreground">{batch.productName}</div>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {getStatusBadge(batch.status)}
                                {batch.plannedQuantity && (
                                  <span className="text-xs text-muted-foreground font-medium">{parseFloat(batch.plannedQuantity).toLocaleString("ko-KR")} kg</span>
                                )}
                              </div>
                              {showCost && batchCosts[batch.id] !== undefined && (
                                <div className="flex items-center gap-1 text-sm">
                                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                                  <span className="font-medium">{batchCosts[batch.id].toLocaleString('ko-KR')}원</span>
                                </div>
                              )}
                              <div className="text-sm text-muted-foreground">
                                {new Date(batch.createdAt).toLocaleDateString("ko-KR")}
                              </div>
                            </div>
                          </Link>
                          <div className="flex flex-col items-end gap-2">
                            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                            {(isWorker || isAdmin) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 mt-1"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDeleteTarget({ id: batch.id, batchCode: batch.batchCode });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* 페이지네이션 */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-6">
                    <Button variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>이전</Button>
                    <span className="text-sm text-muted-foreground px-4">{page} / {totalPages}</span>
                    <Button variant="outline" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>다음</Button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <EmptyState
            icon={Package}
            title="아직 생성된 배치가 없습니다"
            description="첫 번째 배치를 생성하여 생산 관리를 시작하세요."
            actionLabel="첫 배치 생성하기"
            onAction={() => setLocation("/dashboard/batch/new")}
          />
        )}
      </div>

      {/* 날짜 상세 다이얼로그 */}
      <Dialog open={!!dayDetailDate} onOpenChange={(open) => { if (!open) setDayDetailDate(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dayDetailDate ? new Date(dayDetailDate + "T00:00:00").toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : ""} 배치 목록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {dayDetailDate && (batchesByDate[dayDetailDate] || []).map((b: any) => (
              <Link key={b.id} href={`/dashboard/batch/${b.id}`}>
                <div className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer transition-colors">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLORS[b.status] || "bg-gray-400"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{b.productName || b.batchCode}</div>
                    <div className="text-xs text-muted-foreground">{b.batchCode}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                    b.status === "completed" ? "bg-green-100 text-green-700" :
                    b.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                    b.status === "shipped" ? "bg-purple-100 text-purple-700" :
                    "bg-orange-100 text-orange-700"
                  }`}>
                    {STATUS_LABELS[b.status] || "계획"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* 배치 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>배치 삭제 확인</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.batchCode}</strong> 배치를 삭제하시겠습니까?<br />
              관련 CCP 기록지, 승인 요청, 문서 인스턴스, 원재료 투입 기록이 모두 함께 삭제됩니다.<br />
              이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate({ id: deleteTarget.id });
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
