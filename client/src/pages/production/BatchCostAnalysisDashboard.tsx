import { useState, useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from "recharts";
import { Eye, AlertTriangle, Droplets, TrendingUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

/** 정제수(purified water) 판별 */
function isWaterMaterial(name: string | null | undefined): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return n.includes("정제수") || n.includes("purified water");
}

export default function BatchCostAnalysisDashboard() {
  const L = useIndustryLabel();
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return formatLocalDate(date);
  });
  const [endDate, setEndDate] = useState(() => todayLocal());
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);

  // 배치 목록 조회
  const { data: batchesRaw, isLoading } = trpc.batch.list.useQuery({ limit: 200 });
  const batches = (batchesRaw?.items || []) as any[];

  // 기간 필터링
  const filteredBatches = batches.filter((b: any) => {
    const bDate = b.plannedDate || b.startTime || b.createdAt;
    if (!bDate) return false;
    const d = formatLocalDate(new Date(bDate));
    return d >= startDate && d <= endDate;
  });

  // 배치 비용 조회
  const batchIds = filteredBatches.map((b: any) => b.id);
  const { data: costSummary } = trpc.batch.getCostSummary.useQuery(
    { batchIds },
    { enabled: batchIds.length > 0 }
  );

  // 선택된 배치의 원재료별 비용 상세
  const { data: materialBreakdown } = trpc.batchCost.getMaterialCostBreakdownByBatch.useQuery(
    { batchId: selectedBatchId! },
    { enabled: !!selectedBatchId }
  );

  // 비용 맵 생성
  const costMap: Record<number, number> = {};
  costSummary?.forEach((c: any) => { costMap[c.batchId] = c.totalCost; });

  // 배치 데이터 + 비용 합산
  const batchesWithCost = filteredBatches.map((b: any) => {
    const cost = costMap[b.id] || 0;
    const qty = parseFloat(b.actualQuantity || b.plannedQuantity || "0");
    const costPerKg = qty > 0 ? cost / qty : 0;
    return { ...b, materialCost: cost, quantity: qty, costPerKg };
  });

  // 요약 통계
  const totalBatches = batchesWithCost.length;
  const totalMaterialCost = batchesWithCost.reduce((sum, b) => sum + b.materialCost, 0);
  const totalQuantity = batchesWithCost.reduce((sum, b) => sum + b.quantity, 0);
  const avgCostPerKg = totalQuantity > 0 ? totalMaterialCost / totalQuantity : 0;

  // 단가 커버리지 (단가가 등록된 원재료 비율 - materialBreakdown 기반)
  // 전체 배치의 커버리지는 개별 배치 상세에서만 확인 가능하므로 배치별로 표시

  // 차트 데이터 (최근 10개)
  const chartData = batchesWithCost
    .filter(b => b.materialCost > 0)
    .slice(-10)
    .map((b) => ({
      batchCode: b.batchCode || `B-${b.id}`,
      costPerKg: Math.round(b.costPerKg),
      materialCost: Math.round(b.materialCost),
    }));

  // 선택된 배치 정보
  const selectedBatch = selectedBatchId ? batchesWithCost.find(b => b.id === selectedBatchId) : null;

  // 다이얼로그 원재료 상세 계산
  const dialogTotalCost = materialBreakdown
    ? materialBreakdown.reduce((sum: number, m: any) => sum + (m.isWater ? 0 : (m.plannedCost || 0)), 0)
    : 0;
  const dialogQty = selectedBatch?.quantity || 0;
  const dialogCostPerKg = dialogQty > 0 ? dialogTotalCost / dialogQty : 0;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold">배치별 재료원가 분석</h1>
        <p className="text-muted-foreground text-sm">{L("batch")} 투입량 × 입고단가 기반 실질 재료원가</p>
      </div>

      {/* 기간 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>분석 기간 선택</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label>시작 날짜</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <Label>종료 날짜</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading && <div className="text-center py-8 text-muted-foreground">데이터 로딩 중...</div>}

      {!isLoading && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">전체 배치 수</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{totalBatches}개</div>
                <p className="text-xs text-muted-foreground">총 {totalQuantity.toLocaleString("ko-KR")} kg</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">총 재료원가</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-700">₩{totalMaterialCost.toLocaleString("ko-KR")}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">평균 kg당 원가</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-teal-600">₩{Math.round(avgCostPerKg).toLocaleString("ko-KR")}/kg</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">비용 등록 배치</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">
                  {batchesWithCost.filter(b => b.materialCost > 0).length}개
                </div>
                <p className="text-xs text-muted-foreground">
                  비용 등록된 배치 수
                </p>
              </CardContent>
            </Card>
          </div>

          {/* kg당 재료원가 바 차트 */}
          {chartData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>배치별 kg당 재료원가 (최근 10개)</CardTitle>
                <CardDescription>배치별 재료원가를 kg 기준으로 비교</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="batchCode" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: any) => [`₩${Number(value).toLocaleString("ko-KR")}`, "kg당 원가"]}
                      />
                      <Bar dataKey="costPerKg" name="kg당 원가" radius={[4, 4, 0, 0]}>
                        {chartData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ★ 2026-05-09 (PR #295): 제품당 원가 변화 그래프 */}
          <ProductCostTrendCard startDate={startDate} endDate={endDate} batches={filteredBatches} />

          {/* 배치별 상세 원가 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle>배치별 상세 원가</CardTitle>
              <CardDescription>각 배치의 재료원가 상세 (클릭하여 원재료 내역 확인)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{`${L("batch")} 코드`}</TableHead>
                    <TableHead>제품명</TableHead>
                    <TableHead>생산일</TableHead>
                    <TableHead className="text-right">생산량</TableHead>
                    <TableHead className="text-right">재료원가</TableHead>
                    <TableHead className="text-right">kg당 원가</TableHead>
                    <TableHead className="text-center">상세</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchesWithCost.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        해당 기간에 배치 데이터가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    batchesWithCost.map((batch) => (
                      <TableRow key={batch.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedBatchId(batch.id)}>
                        <TableCell className="font-medium">{batch.batchCode || `B-${batch.id}`}</TableCell>
                        <TableCell>{batch.productName || "-"}</TableCell>
                        <TableCell>
                          {(batch.plannedDate || batch.startTime)
                            ? new Date(batch.plannedDate || batch.startTime).toLocaleDateString("ko-KR")
                            : "-"}
                        </TableCell>
                        <TableCell className="text-right">{batch.quantity > 0 ? `${batch.quantity.toLocaleString("ko-KR")} kg` : "-"}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {batch.materialCost > 0 ? `₩${batch.materialCost.toLocaleString("ko-KR")}` : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {batch.costPerKg > 0 ? `₩${Math.round(batch.costPerKg).toLocaleString("ko-KR")}/kg` : "-"}
                        </TableCell>
                        <TableCell className="text-center">
                          <button
                            className="p-1 rounded hover:bg-muted"
                            onClick={(e) => { e.stopPropagation(); setSelectedBatchId(batch.id); }}
                          >
                            <Eye className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {/* 원재료 상세 내역 다이얼로그 */}
      <Dialog open={!!selectedBatchId} onOpenChange={(open) => { if (!open) setSelectedBatchId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedBatch?.batchCode || `B-${selectedBatchId}`} - 원재료 상세 내역
            </DialogTitle>
          </DialogHeader>

          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">생산량</p>
              <p className="text-lg font-bold">{dialogQty.toLocaleString("ko-KR")} kg</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">재료원가</p>
              <p className="text-lg font-bold">₩{dialogTotalCost.toLocaleString("ko-KR")}</p>
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <p className="text-xs text-muted-foreground">kg당 원가</p>
              <p className="text-lg font-bold">₩{Math.round(dialogCostPerKg).toLocaleString("ko-KR")}</p>
            </div>
          </div>

          {/* 원재료 목록 */}
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{L("material")}</TableHead>
                  <TableHead className="text-right">투입량</TableHead>
                  <TableHead className="text-right">단가</TableHead>
                  <TableHead className="text-right">비용</TableHead>
                  <TableHead className="text-right">비중</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {materialBreakdown?.map((m: any) => {
                  const water = m.isWater || isWaterMaterial(m.materialName);
                  const cost = water ? 0 : (m.plannedCost || 0);
                  const ratio = dialogTotalCost > 0 ? (cost / dialogTotalCost * 100) : 0;

                  return (
                    <TableRow key={m.materialId} className={water ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}>
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {m.materialName}
                          {water && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800 font-semibold">
                              <Droplets className="h-2.5 w-2.5 mr-0.5" />
                              원가제외
                            </Badge>
                          )}
                          {!water && m.unitPrice === 0 && (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{m.plannedQuantity?.toLocaleString("ko-KR")} kg</TableCell>
                      <TableCell className="text-right">
                        {water ? "-" : (m.unitPrice > 0 ? `₩${m.unitPrice.toLocaleString("ko-KR")}` : "-")}
                      </TableCell>
                      <TableCell className="text-right">
                        {water ? (
                          <span className="text-blue-500">₩0</span>
                        ) : (
                          cost > 0 ? `₩${cost.toLocaleString("ko-KR")}` : "₩0"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {water ? (
                          <span className="text-blue-400 text-xs">-</span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${Math.min(ratio, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs w-10 text-right">{ratio.toFixed(1)}%</span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// PR #295 — 제품당 원가 변화 그래프
// ============================================================
function ProductCostTrendCard({
  startDate,
  endDate,
  batches,
}: {
  startDate: string;
  endDate: string;
  batches: any[];
}) {
  // ★ 2026-05-10 (PR #302): 드롭다운 안정화
  //   - 렌더 본문 setState 제거 → useEffect 로 자동선택
  //   - useMemo 로 productOptions 안정화
  //   - selectedProductId 가 productOptions 에 없을 때 fallback
  // ★ 2026-05-10 (PR #303): UX 개선
  //   - 자동선택 기준: id ASC → "배치 건수 가장 많은 제품" (count DESC)
  //     → 사용자가 드롭다운을 만지지 않아도 가장 의미있는 그래프가 즉시 표시됨
  //     (이전: 첫 번째 옵션이 product_id=5 같은 우연한 최소 ID 제품 → 데이터 부족 → "데이터 없음" 메시지)
  //   - 옵션 라벨에 배치 건수 표시: "꿀설기 (22건)" 형식
  //   - 옵션 정렬도 건수 내림차순 → 자주 보는 제품이 위로
  // 후보 제품 (현재 화면 batches 에서 distinct + 빈 productId 제외)
  const productOptions = useMemo(() => {
    const map = new Map<number, { name: string; count: number }>();
    for (const b of batches) {
      if (!b.productId) continue;
      const cur = map.get(b.productId);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(b.productId, {
          name: b.productName || `제품#${b.productId}`,
          count: 1,
        });
      }
    }
    // 배치 건수 DESC → 동률 시 id ASC (안정적 순서)
    return Array.from(map.entries())
      .map(([id, v]) => ({ id, name: v.name, count: v.count }))
      .sort((a, b) => (b.count - a.count) || (a.id - b.id));
  }, [batches]);

  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);

  // 자동 선택: 배치 건수 가장 많은 제품 + selectedProductId 가 옵션에 없으면 fallback
  useEffect(() => {
    if (productOptions.length === 0) return;
    const exists = selectedProductId !== null && productOptions.some((p) => p.id === selectedProductId);
    if (!exists) {
      setSelectedProductId(productOptions[0].id);
    }
  }, [productOptions, selectedProductId]);

  const { data: trend, isLoading } = trpc.batchCost.getProductCostTrend.useQuery(
    {
      productId: selectedProductId!,
      startDate,
      endDate,
      limit: 100,
    },
    { enabled: !!selectedProductId && productOptions.length > 0 },
  );

  const points: any[] = trend?.points ?? [];
  const summary = trend?.summary;

  // 차트 데이터 — 평균선 같이 표시
  const chartData = points.map((p: any) => ({
    date: p.plannedDate,
    배치코드: p.batchCode,
    "kg당 원가": p.costPerKg,
    평균: summary?.avgCostPerKg ?? 0,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> 제품당 원가 변화 추이
            </CardTitle>
            <CardDescription>
              제품 선택 시 모든 배치를 시간순 + kg당 원가 변동 그래프
            </CardDescription>
          </div>
          <div className="w-64">
            <Select
              value={selectedProductId?.toString() || ""}
              onValueChange={(v) => setSelectedProductId(parseInt(v) || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="제품 선택..." />
              </SelectTrigger>
              <SelectContent>
                {productOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name} ({p.count}건)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!selectedProductId ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            제품을 선택하세요
          </div>
        ) : isLoading ? (
          <div className="py-8 text-center text-muted-foreground text-sm">로딩 중...</div>
        ) : points.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            선택한 기간 동안 이 제품의 배치 데이터가 없습니다
          </div>
        ) : (
          <>
            {/* 요약 */}
            {summary && (
              <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">총 배치</div>
                  <div className="font-semibold">{summary.totalBatches}건</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">총 생산량</div>
                  <div className="font-semibold">{summary.totalProductionKg.toLocaleString()} kg</div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">평균 kg당</div>
                  <div className="font-semibold text-blue-600">
                    ₩{summary.avgCostPerKg.toLocaleString()}
                  </div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">최저 kg당</div>
                  <div className="font-semibold text-green-600">
                    ₩{summary.minCostPerKg.toLocaleString()}
                  </div>
                </div>
                <div className="rounded border p-2">
                  <div className="text-[10px] text-muted-foreground">최고 kg당</div>
                  <div className="font-semibold text-red-600">
                    ₩{summary.maxCostPerKg.toLocaleString()}
                  </div>
                </div>
              </div>
            )}

            {/* 그래프 */}
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `₩${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(value: any, name: string) =>
                    name === "kg당 원가" || name === "평균"
                      ? [`₩${Number(value).toLocaleString()}`, name]
                      : [value, name]
                  }
                  labelFormatter={(label, items) => {
                    const code = (items as any)?.[0]?.payload?.배치코드;
                    return code ? `${label} (${code})` : label;
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="kg당 원가"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="평균"
                  stroke="#9ca3af"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>

            {/* 배치 리스트 테이블 (간략) */}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                배치별 상세 ({points.length}건)
              </summary>
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">배치코드</TableHead>
                    <TableHead className="text-xs">생산일</TableHead>
                    <TableHead className="text-xs text-right">생산량(kg)</TableHead>
                    <TableHead className="text-xs text-right">총 재료원가</TableHead>
                    <TableHead className="text-xs text-right">kg당</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {points.map((p) => (
                    <TableRow key={p.batchId}>
                      <TableCell className="text-xs font-mono">{p.batchCode}</TableCell>
                      <TableCell className="text-xs">{p.plannedDate}</TableCell>
                      <TableCell className="text-xs text-right">
                        {p.actualQuantityKg.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-right">
                        ₩{p.totalMaterialCost.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-right font-semibold">
                        ₩{p.costPerKg.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
