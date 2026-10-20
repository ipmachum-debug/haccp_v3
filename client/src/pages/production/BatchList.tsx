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
import { useLocation, useSearch } from "wouter";
import { pickAllowed, pickPage, replaceQuery, withReturnTo } from "@/lib/urlState";
import { toast } from "sonner";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
import { AlertTriangle } from "lucide-react";
import { PROD_STATE_UI, batchState, batchStatusLabel, groupByProduct, isVoided, productState, sumKg, type ProdState } from "@/lib/productionState";

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

/** 달력 범례 — 3가지 상태 (2026-10-20 대표 기준). 경고·결재 대기는 색이 아니라 표시 */
const LEGEND: ProdState[] = ["plan", "work", "done"];

/** 생산 건 경고 (색이 아니라 표시) — 확인 남음 · 출고 보류 · 지난 날짜 마감 안 됨 */
function warningsOf(b: any, ds: string, todayStr: string): string[] {
  const st = batchState(b);
  const m = b.marks as { rowsLeft: number; heldLines: number; approvalPending: boolean } | null | undefined;
  const out: string[] = [];
  if (m?.heldLines) out.push(`출고 보류 ${m.heldLines}줄`);
  if (m?.rowsLeft && (st === "work" || ds < todayStr)) out.push(`확인 ${m.rowsLeft}건 남음`);
  if (ds < todayStr && st !== "done") out.push("마감 안 됨");
  return out;
}

export default function BatchList() {
  const L = useIndustryLabel();
  const [, setLocation] = useLocation();
  // 보기(달력·목록)·달력 월·고른 날짜·목록 페이지는 URL — 생산 상세에 갔다 와도·새로고침해도 같은 자리 (2026-10-21 작업 위치 보존)
  //   ?view=table · ?month=YYYY-MM · ?day=YYYY-MM-DD · ?page=N (기본값이면 쿼리에서 뺀다, 잘못된 값은 기본으로)
  const sp = new URLSearchParams(useSearch());
  const page = pickPage(sp.get("page"));
  const setPage = (next: number | ((p: number) => number)) => {
    const n = typeof next === "function" ? next(page) : next;
    replaceQuery({ page: n > 1 ? n : null });
  };
  const [limit] = useState(200);
  const viewMode = pickAllowed(sp.get("view"), "calendar", ["calendar", "table"]) as ViewMode;
  const setViewMode = (v: ViewMode) => replaceQuery({ view: v === "calendar" ? null : v });
  const calMonth = useMemo(() => {
    const m = /^(\d{4})-(\d{2})$/.exec(sp.get("month") ?? "");
    const mm = m ? Number(m[2]) - 1 : -1;
    if (m && mm >= 0 && mm <= 11) return { year: Number(m[1]), month: mm };
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [sp.get("month")]); // eslint-disable-line react-hooks/exhaustive-deps
  const setCalMonth = (v: { year: number; month: number }) => {
    const now = new Date();
    const isNow = v.year === now.getFullYear() && v.month === now.getMonth();
    replaceQuery({ month: isNow ? null : `${v.year}-${String(v.month + 1).padStart(2, "0")}` });
  };

  // 캘린더 뷰일 때는 표시 중인 월의 planned_date 범위로 조회 (페이지네이션 우회)
  // - 표시 셀에는 이전/다음 달의 일부도 포함되므로 앞뒤 7일 여유를 둔다
  // - limit=2000 으로 사실상 페이지 제한 무력화
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  const calendarRange = useMemo(() => {
    const from = new Date(calMonth.year, calMonth.month, 1);
    from.setDate(from.getDate() - 7);
    const to = new Date(calMonth.year, calMonth.month + 1, 0);
    to.setDate(to.getDate() + 7);
    return { fromDate: fmt(from), toDate: fmt(to) };
  }, [calMonth]);

  const queryInput =
    viewMode === "calendar"
      ? { page: 1, limit: 2000, fromDate: calendarRange.fromDate, toDate: calendarRange.toDate, withMarks: true }
      : { page, limit };
  const { data: batchData, isLoading, isError, error, refetch } = trpc.batch.list.useQuery(queryInput);
  const batches = batchData?.items || [];
  const totalPages = batchData?.totalPages || 1;

  const { isWorker, user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const exportBatches = trpc.excel.exportBatches.useMutation();
  const [showCost, setShowCost] = useState(false);
  const [batchCosts, setBatchCosts] = useState<Record<number, number>>({});
  const [batchCostRatios, setBatchCostRatios] = useState<Record<number, number | null>>({});

  // 달력 날짜 상세 다이얼로그
  const dayParam = sp.get("day");
  const dayDetailDate = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : null;
  const setDayDetailDate = (v: string | null) => replaceQuery({ day: v });

  // 삭제 확인 다이얼로그
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; batchCode: string } | null>(null);

  const deleteMutation = trpc.batch.delete.useMutation({
    onSuccess: () => {
      toast.success(`${L("batch")}가 삭제되었습니다.`);
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

  // 상태 배지 — 3가지 상태 색 + DB 상태 글자 그대로 (모르는 상태를 '계획' 으로 바꾸지 않음)
  const getStatusBadge = (batch: any) => (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${PROD_STATE_UI[batchState(batch)].soft}`} data-testid="batch-status">
      {batchStatusLabel(batch)}
    </span>
  );

  // 캘린더용: 날짜별 — 정상 생산 건과 무효·취소(이력)를 나눈다 (무효는 정상 달력·합계에서 뺌)
  const { batchesByDate, voidByDate } = useMemo(() => {
    const live: Record<string, any[]> = {};
    const voided: Record<string, any[]> = {};
    (batches || []).forEach((b: any) => {
      const dateKey = b.plannedDateYmd || toDateStr(b.plannedDate || b.createdAt);
      const map = isVoided(b) ? voided : live;
      (map[dateKey] ??= []).push(b);
    });
    return { batchesByDate: live, voidByDate: voided };
  }, [batches]);
  const codeOf = useMemo(() => new Map<number, string>((batches || []).map((b: any) => [Number(b.id), String(b.batchCode)])), [batches]);
  const [openProduct, setOpenProduct] = useState<Record<string, boolean>>({});

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
              // 단건·일괄 생성은 '오늘 생산' 작업대 하나 (PR-B) — 여러 제품·여러 배치를 한 입력표로
              <Link href="/dashboard/production/today?add=1&view=all">
                <Button size="sm" className="h-9"><Plus className="mr-1 h-4 w-4" />오늘 생산</Button>
              </Link>
            )}
          </div>
        </div>

        {/* 배치 목록 */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">로딩 중...</div>
        ) : isError ? (
          <div className="text-center py-12 text-red-500">
            {`${L("batch")} 목록 로딩 실패:`} {error?.message || "서버 에러"}
            <Button variant="outline" size="sm" className="ml-3" onClick={() => refetch()}>재시도</Button>
          </div>
        ) : viewMode === "calendar" ? (
              /* ── 달력 뷰 (배치 0건이어도 그리드+월 네비 항상 표시 → 빈 달에서 다른 달 탐색 가능) ── */
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
                      const dayGroups = groupByProduct(dayBatches);
                      const dayCount = dayBatches.length + (voidByDate[ds]?.length ?? 0);

                      return (
                        <div
                          key={i}
                          className={`border-r border-b min-h-[80px] p-1 text-xs ${
                            !isCurrentMonth ? "bg-gray-50 text-gray-300" : ""
                          } ${isToday ? "bg-blue-50" : ""}`}
                        >
                          <button type="button" disabled={dayCount === 0} onClick={() => setDayDetailDate(ds)}
                            className={`block w-full text-right mb-0.5 ${dayCount ? "cursor-pointer hover:underline" : "cursor-default"} ${isToday ? "font-bold text-blue-600" : ""} ${
                            day.getDay() === 0 ? "text-red-400" : day.getDay() === 6 ? "text-blue-400" : ""
                          }`}>
                            {day.getDate()}
                          </button>
                          {/* 날짜 → 품목 (품목 색: 모두 완료 녹색 · 하나라도 시작 파랑 · 모두 시작 전 주황). 경고·결재 대기는 표시만 */}
                          <div className="space-y-0.5">
                            {dayGroups.slice(0, 3).map((g) => {
                              const st = productState(g.items.map((b: any) => batchState(b)));
                              const warn = g.items.some((b: any) => warningsOf(b, ds, todayStr).length > 0);
                              const appr = g.items.some((b: any) => b.marks?.approvalPending);
                              return (
                                <button key={g.key} type="button" onClick={() => { setDayDetailDate(ds); setOpenProduct({ [g.key]: true }); }} data-testid="cal-product"
                                  className={`w-full flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] text-left cursor-pointer hover:opacity-80 ${PROD_STATE_UI[st].chip}`}>
                                  <span className="truncate flex-1">{g.name}{g.items.length > 1 ? ` ×${g.items.length}` : ""}</span>
                                  {warn && <span className="shrink-0 font-bold" title="확인 필요" data-testid="cal-warn">!</span>}
                                  {appr && <span className="shrink-0 rounded bg-white/90 text-gray-800 px-0.5" title="결재 대기" data-testid="cal-approval">결</span>}
                                </button>
                              );
                            })}
                            {dayGroups.length > 3 && (
                              <button
                                onClick={() => setDayDetailDate(ds)}
                                className="text-[10px] text-blue-500 hover:text-blue-700 font-medium text-center w-full cursor-pointer hover:underline"
                              >
                                +{dayGroups.length - 3}품목
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 범례 */}
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-muted-foreground" data-testid="cal-legend">
                    {LEGEND.map((k) => (
                      <div key={k} className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${PROD_STATE_UI[k].dot}`} />
                        {PROD_STATE_UI[k].label}
                      </div>
                    ))}
                    <span><b>!</b> 확인 필요</span>
                    <span><span className="rounded border px-0.5">결</span> 결재 대기</span>
                    <span>무효·취소는 날짜를 누르면 이력으로</span>
                  </div>
                </CardContent>
              </Card>
        ) : batches && batches.length > 0 ? (
              /* ── 테이블 뷰 ── */
              <>
                {/* 데스크톱: 테이블 뷰 */}
                <div className="hidden md:block border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{`${L("batch")} 코드`}</TableHead>
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
                        <TableRow key={batch.id} className={isVoided(batch) ? "opacity-60" : undefined}>
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
                          <TableCell>
                            {getStatusBadge(batch)}
                            {batch.voidedAt && batch.supersededByBatchId && (
                              <Link href={withReturnTo(`/dashboard/batch/${batch.supersededByBatchId}`)} className="block text-[10px] text-muted-foreground hover:underline mt-0.5">
                                → 대체 {codeOf.get(batch.supersededByBatchId) ?? `#${batch.supersededByBatchId}`}
                              </Link>
                            )}
                          </TableCell>
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
                              <Link href={withReturnTo(`/dashboard/batch/${batch.id}`)}>
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
                          <Link href={withReturnTo(`/dashboard/batch/${batch.id}`)} className="flex-1">
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
                                {getStatusBadge(batch)}
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
        ) : (
          <EmptyState
            icon={Package}
            title={`아직 생성된 ${L("batch")}가 없습니다`}
            description={`첫 번째 ${L("batch")}를 생성하여 생산 관리를 시작하세요.`}
            actionLabel={`첫 ${L("batch")} 생성하기`}
            onAction={() => setLocation("/dashboard/production/today?add=1&view=all")}
          />
        )}
      </div>

      {/* 날짜 상세 다이얼로그 */}
      <Dialog open={!!dayDetailDate} onOpenChange={(open) => { if (!open) setDayDetailDate(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dayDetailDate ? new Date(dayDetailDate + "T00:00:00").toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }) : ""} {L("batch")} 목록
            </DialogTitle>
          </DialogHeader>
          {/* 날짜 → 품목(하루 합계) → 생산 건. 무효·취소는 맨 아래 접힌 이력 */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto" data-testid="day-detail">
            {dayDetailDate && (
              <Link href={`/dashboard/production/today?date=${dayDetailDate}&view=all`} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                이 날 생산 화면 열기 (공정 회차·현장 확인·마감) <ChevronRight className="h-3 w-3" />
              </Link>
            )}
            {dayDetailDate && groupByProduct(batchesByDate[dayDetailDate] || []).map((g) => {
              const st = productState(g.items.map((b: any) => batchState(b)));
              const total = sumKg(g.items.map((b: any) => b.plannedQuantity));
              const isOpen = !!openProduct[g.key];
              const warn = g.items.flatMap((b: any) => warningsOf(b, dayDetailDate, todayStr));
              const appr = g.items.some((b: any) => b.marks?.approvalPending);
              return (
                <div key={g.key} className="rounded-lg border" data-testid="day-product">
                  <button type="button" className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent/50" onClick={() => setOpenProduct((o) => ({ ...o, [g.key]: !o[g.key] }))}>
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${PROD_STATE_UI[st].dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{g.name}</div>
                      <div className="text-xs text-muted-foreground">{g.items.length}건{total != null ? ` · 합계 ${total.toLocaleString("ko-KR")} kg` : ""}</div>
                    </div>
                    {warn.length > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-label="확인 필요" />}
                    {appr && <span className="text-[10px] rounded border px-1 shrink-0">결재 대기</span>}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${PROD_STATE_UI[st].soft}`}>{PROD_STATE_UI[st].label}</span>
                    <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="border-t divide-y">
                      {g.items.map((b: any) => {
                        const w = warningsOf(b, dayDetailDate, todayStr);
                        return (
                          <Link key={b.id} href={withReturnTo(`/dashboard/batch/${b.id}`)}>
                            <div className="flex items-center gap-2 px-3 py-2 hover:bg-accent/50 cursor-pointer" data-testid="day-batch">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium">{b.batchCode}{b.dayBatchGroup ? <span className="text-muted-foreground font-normal"> · {b.dayBatchGroup} #{b.batchOrder ?? ""}</span> : null}</div>
                                <div className="text-[11px] text-muted-foreground">
                                  {b.plannedQuantity ? `${parseFloat(b.plannedQuantity).toLocaleString("ko-KR")} kg` : "-"}
                                  {w.length > 0 && <span className="text-amber-700 dark:text-amber-300"> · {w.join(" · ")}</span>}
                                  {b.marks?.approvalPending && <span> · 결재 대기</span>}
                                </div>
                              </div>
                              {getStatusBadge(b)}
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {dayDetailDate && (voidByDate[dayDetailDate]?.length ?? 0) > 0 && (
              <details className="text-xs text-muted-foreground" data-testid="day-void-history">
                <summary className="cursor-pointer select-none">무효·취소 이력 {voidByDate[dayDetailDate].length}건 (정상 건수·합계에서 제외, 원본 보존)</summary>
                <div className="mt-1 space-y-1">
                  {voidByDate[dayDetailDate].map((b: any) => (
                    <div key={b.id} className="flex flex-wrap items-center gap-1">
                      <Link href={withReturnTo(`/dashboard/batch/${b.id}`)} className="hover:underline">{b.productName || "-"} · {b.batchCode}</Link>
                      <span>— {batchStatusLabel(b)}</span>
                      {b.supersededByBatchId && (
                        <Link href={withReturnTo(`/dashboard/batch/${b.supersededByBatchId}`)} className="text-blue-600 hover:underline">
                          → 대체 {codeOf.get(b.supersededByBatchId) ?? `#${b.supersededByBatchId}`}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 배치 삭제 확인 다이얼로그 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`${L("batch")} 삭제 확인`}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.batchCode}</strong> {L("batch")}를 삭제하시겠습니까?<br />
              관련 CCP 기록지, 승인 요청, 문서 인스턴스, {`${L("material")} 투입 기록이 모두 함께 삭제됩니다.`}<br />
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
