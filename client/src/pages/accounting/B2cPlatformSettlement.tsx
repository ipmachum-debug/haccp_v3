/**
 * B2C 플랫폼 정산 페이지 (Phase 2, 2026-04-22)
 *
 * 기능:
 *   1. 플랫폼 목록 (거래처 중 customer_type='b2c_platform')
 *   2. 분기/월 선택
 *   3. 플랫폼별 카드:
 *      - 셀러 관리
 *      - 매출 입력 표 (결제수단 × 월)
 *      - 분기 소계
 *   4. 전체 합계 + 부가세 신고 자료 export
 */

import React, { useState, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  Store,
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  FileSpreadsheet,
  Calendar,
} from "lucide-react";

// 옥션 기준 5종 결제수단 (확장 가능)
const DEFAULT_PAYMENT_METHODS = [
  "신용카드",
  "현금결제",
  "휴대폰결제",
  "기타결제",
  "선불결제",
];

type PeriodMode = "quarter" | "month";

export default function B2cPlatformSettlement() {
  return (
    <DashboardLayout>
      <B2cPlatformContent />
    </DashboardLayout>
  );
}

function B2cPlatformContent() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const currentQuarter = Math.ceil(currentMonth / 3);

  const [periodMode, setPeriodMode] = useState<PeriodMode>("quarter");
  const [periodYear, setPeriodYear] = useState(currentYear);
  const [periodQuarter, setPeriodQuarter] = useState(currentQuarter);
  const [periodMonth, setPeriodMonth] = useState(currentMonth);

  const [selectedPlatformId, setSelectedPlatformId] = useState<number | null>(null);
  const [addSellerOpen, setAddSellerOpen] = useState(false);
  const [editEntryOpen, setEditEntryOpen] = useState(false);
  const [editEntryData, setEditEntryData] = useState<any>(null);

  // ─── 쿼리 ─────────────────────────────────────
  const platformsQuery = (trpc as any).b2cPlatform.listPlatforms.useQuery();
  const summaryQuery = (trpc as any).b2cPlatform.getQuarterSummary.useQuery(
    { periodYear, periodQuarter },
  );
  const matrixQuery = (trpc as any).b2cPlatform.getSalesMatrix.useQuery({
    periodYear,
    ...(periodMode === "quarter" ? { periodQuarter } : { periodMonth }),
  });

  // ─── 뮤테이션 ─────────────────────────────────
  const upsertMutation = (trpc as any).b2cPlatform.upsertSalesEntry.useMutation({
    onSuccess: () => {
      toast({ title: "매출 항목 저장됨" });
      matrixQuery.refetch();
      summaryQuery.refetch();
      setEditEntryOpen(false);
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  // 분기 확정 / 해제 (Phase 3, 2026-04-22)
  const confirmQuarterMutation = (trpc as any).b2cPlatform.confirmQuarter.useMutation({
    onSuccess: (data: any) => {
      toast({
        title: "분기 확정 완료",
        description: data.message || `분개 ${data.journalEntries?.length || 0}건 생성됨`,
      });
      matrixQuery.refetch();
      summaryQuery.refetch();
    },
    onError: (e: any) => toast({ title: "확정 실패", description: e.message, variant: "destructive" }),
  });

  const unconfirmQuarterMutation = (trpc as any).b2cPlatform.unconfirmQuarter.useMutation({
    onSuccess: (data: any) => {
      toast({ title: "확정 해제 완료", description: data.message });
      matrixQuery.refetch();
      summaryQuery.refetch();
    },
    onError: (e: any) => toast({ title: "해제 실패", description: e.message, variant: "destructive" }),
  });

  // 분기 시작/종료 월
  const quarterMonths = useMemo(() => {
    const start = (periodQuarter - 1) * 3 + 1;
    return [start, start + 1, start + 2];
  }, [periodQuarter]);

  const monthsToShow = periodMode === "quarter" ? quarterMonths : [periodMonth];

  // 매트릭스 데이터 그룹화: platform → seller → payment_method → month
  const grouped = useMemo(() => {
    const data = matrixQuery.data || [];
    const map = new Map<number, {
      platform_id: number;
      platform_name: string;
      sellers: Map<number, {
        seller_id: number;
        seller_code: string;
        seller_name: string | null;
        methods: Map<string, Map<number, any>>;
      }>;
    }>();

    for (const row of data as any[]) {
      if (!map.has(row.platform_partner_id)) {
        map.set(row.platform_partner_id, {
          platform_id: row.platform_partner_id,
          platform_name: row.platform_name,
          sellers: new Map(),
        });
      }
      const platform = map.get(row.platform_partner_id)!;

      if (!platform.sellers.has(row.seller_id)) {
        platform.sellers.set(row.seller_id, {
          seller_id: row.seller_id,
          seller_code: row.seller_code,
          seller_name: row.seller_name,
          methods: new Map(),
        });
      }
      const seller = platform.sellers.get(row.seller_id)!;

      if (!seller.methods.has(row.payment_method)) {
        seller.methods.set(row.payment_method, new Map());
      }
      seller.methods.get(row.payment_method)!.set(row.period_month, row);
    }

    return Array.from(map.values());
  }, [matrixQuery.data]);

  const totalGross = useMemo(() => {
    return (summaryQuery.data || []).reduce(
      (s: number, p: any) => s + Number(p.total_gross || 0),
      0,
    );
  }, [summaryQuery.data]);

  // 분기 확정 가능 여부 (Phase 3, 2026-04-22)
  const { hasDraftEntries, hasConfirmedEntries, confirmedPlatformCount } = useMemo(() => {
    const entries = (matrixQuery.data || []) as any[];
    let draft = 0;
    let confirmed = 0;
    const confirmedPlatforms = new Set<number>();
    for (const e of entries) {
      if (e.status === "confirmed") {
        confirmed++;
        confirmedPlatforms.add(e.platform_partner_id);
      } else if (e.status === "draft") {
        draft++;
      }
    }
    return {
      hasDraftEntries: draft > 0,
      hasConfirmedEntries: confirmed > 0,
      confirmedPlatformCount: confirmedPlatforms.size,
    };
  }, [matrixQuery.data]);

  return (
    <div className="space-y-6">
      {/* 페이지 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">B2C 플랫폼 정산</h1>
            <p className="text-sm text-muted-foreground">
              옥션·지마켓·스마트스토어 등 분기별 매출 집계 — 부가세 신고 자료
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {/* 분기 확정 — 분기 모드일 때만 노출 */}
          {periodMode === "quarter" && (
            <>
              {hasDraftEntries && (
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={confirmQuarterMutation.isPending}
                  onClick={() => {
                    if (!window.confirm(`${periodYear}년 ${periodQuarter}분기를 확정하고 회계 분개를 생성할까요?\n\n확정 후에는 매출 항목 수정이 제한됩니다.`)) return;
                    confirmQuarterMutation.mutate({ periodYear, periodQuarter });
                  }}
                >
                  {confirmQuarterMutation.isPending ? "확정 중..." : `분기 확정 (${periodYear}Q${periodQuarter})`}
                </Button>
              )}
              {hasConfirmedEntries && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-400 text-amber-700 hover:bg-amber-50"
                  disabled={unconfirmQuarterMutation.isPending}
                  onClick={() => {
                    if (!window.confirm(`${periodYear}년 ${periodQuarter}분기 확정을 해제하고 분개를 삭제할까요?\n\n매출 항목은 draft 상태로 복구됩니다.`)) return;
                    unconfirmQuarterMutation.mutate({ periodYear, periodQuarter });
                  }}
                >
                  {unconfirmQuarterMutation.isPending ? "해제 중..." : "확정 해제"}
                </Button>
              )}
            </>
          )}
          <Button variant="outline" size="sm">
            <FileSpreadsheet className="h-4 w-4 mr-1" /> 엑셀 내보내기
          </Button>
        </div>
      </div>

      {/* 기간 선택 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">기간</span>
            </div>

            <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quarter">분기</SelectItem>
                <SelectItem value="month">월별</SelectItem>
              </SelectContent>
            </Select>

            <Select value={String(periodYear)} onValueChange={(v) => setPeriodYear(Number(v))}>
              <SelectTrigger className="w-28 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {periodMode === "quarter" ? (
              <Select value={String(periodQuarter)} onValueChange={(v) => setPeriodQuarter(Number(v))}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map((q) => (
                    <SelectItem key={q} value={String(q)}>{q}분기</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select value={String(periodMonth)} onValueChange={(v) => setPeriodMonth(Number(v))}>
                <SelectTrigger className="w-28 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="ml-auto flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span className="text-muted-foreground">총매출:</span>
              <span className="font-bold text-emerald-700">
                ₩{totalGross.toLocaleString()}
              </span>
              {/* 확정 상태 표시 (Phase 3) */}
              {periodMode === "quarter" && (hasDraftEntries || hasConfirmedEntries) && (
                <>
                  {hasConfirmedEntries && hasDraftEntries ? (
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-[10px]">
                      🔸 일부 확정됨 ({confirmedPlatformCount}개 플랫폼)
                    </Badge>
                  ) : hasConfirmedEntries ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                      ✅ 확정됨 ({confirmedPlatformCount}개 플랫폼)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-300 text-[10px]">
                      📝 입력 중 (draft)
                    </Badge>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 플랫폼별 요약 카드 */}
      {summaryQuery.isLoading ? (
        <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
      ) : (summaryQuery.data || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Store className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">아직 등록된 B2C 플랫폼이 없습니다.</p>
            <p className="text-xs mt-1">
              거래처 관리에서 customer_type='b2c_platform' 로 등록해주세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(summaryQuery.data || []).map((p: any) => (
            <Card
              key={p.platform_id}
              className={`cursor-pointer transition-all hover:shadow ${selectedPlatformId === p.platform_id ? "border-violet-500 ring-2 ring-violet-200" : ""
                }`}
              onClick={() => setSelectedPlatformId(p.platform_id)}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold">{p.platform_name}</div>
                    <div className="text-xs text-muted-foreground">
                      셀러 {p.seller_count}명 · 항목 {p.entry_count}건
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[9px]">
                    {periodYear} Q{periodQuarter}
                  </Badge>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-lg font-bold">
                    ₩{Number(p.total_gross || 0).toLocaleString()}
                  </span>
                </div>
                {Number(p.total_commission || 0) > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    수수료 ₩{Number(p.total_commission || 0).toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 선택된 플랫폼 상세 — 매출 입력 표 */}
      {selectedPlatformId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">
              {grouped.find(g => g.platform_id === selectedPlatformId)?.platform_name ?? "플랫폼"}
              <span className="text-xs text-muted-foreground ml-2">
                매출 상세 입력
              </span>
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditEntryData({
                    platformPartnerId: selectedPlatformId,
                    sellerId: null,
                    paymentMethod: "",
                    periodMonth: periodMode === "month" ? periodMonth : quarterMonths[0],
                  });
                  setEditEntryOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> 매출 입력
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddSellerOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" /> 셀러 추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const platform = grouped.find(g => g.platform_id === selectedPlatformId);
              if (!platform || platform.sellers.size === 0) {
                return (
                  <div className="py-8 text-center text-muted-foreground text-sm">
                    등록된 셀러/매출이 없습니다. 상단 버튼으로 입력해주세요.
                  </div>
                );
              }

              return (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-32">셀러</TableHead>
                        <TableHead className="w-32">결제수단</TableHead>
                        {monthsToShow.map((m) => (
                          <TableHead key={m} className="text-right w-28">{m}월</TableHead>
                        ))}
                        <TableHead className="text-right w-32">계</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from(platform.sellers.values()).map((seller) => {
                        const rows: React.ReactElement[] = [];
                        const methodEntries = Array.from(seller.methods.entries());

                        methodEntries.forEach(([method, monthMap], midx) => {
                          const sum = monthsToShow.reduce(
                            (s, m) => s + Number(monthMap.get(m)?.gross_amount || 0),
                            0,
                          );
                          rows.push(
                            <TableRow key={`${seller.seller_id}-${method}`}>
                              {midx === 0 && (
                                <TableCell rowSpan={methodEntries.length + 1} className="font-medium align-top">
                                  <div>{seller.seller_code}</div>
                                  {seller.seller_name && (
                                    <div className="text-[10px] text-muted-foreground">{seller.seller_name}</div>
                                  )}
                                </TableCell>
                              )}
                              <TableCell>{method}</TableCell>
                              {monthsToShow.map((m) => (
                                <TableCell key={m} className="text-right tabular-nums">
                                  {monthMap.get(m) ? Number(monthMap.get(m).gross_amount).toLocaleString() : "-"}
                                </TableCell>
                              ))}
                              <TableCell className="text-right tabular-nums font-medium">
                                {sum.toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  onClick={() => {
                                    setEditEntryData({
                                      platformPartnerId: selectedPlatformId,
                                      sellerId: seller.seller_id,
                                      paymentMethod: method,
                                      periodMonth: monthsToShow[0],
                                      existing: monthMap.get(monthsToShow[0]),
                                    });
                                    setEditEntryOpen(true);
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            </TableRow>,
                          );
                        });

                        // 소계 행
                        const sellerTotal = methodEntries.reduce((s, [_, mMap]) => {
                          return s + monthsToShow.reduce((ss, m) => ss + Number(mMap.get(m)?.gross_amount || 0), 0);
                        }, 0);
                        rows.push(
                          <TableRow key={`${seller.seller_id}-sub`} className="bg-slate-50/60 text-xs font-semibold">
                            <TableCell colSpan={1}>소계</TableCell>
                            {monthsToShow.map((m) => {
                              const monthSum = methodEntries.reduce(
                                (s, [_, mMap]) => s + Number(mMap.get(m)?.gross_amount || 0),
                                0,
                              );
                              return (
                                <TableCell key={m} className="text-right tabular-nums">
                                  {monthSum > 0 ? monthSum.toLocaleString() : "-"}
                                </TableCell>
                              );
                            })}
                            <TableCell className="text-right tabular-nums">
                              {sellerTotal.toLocaleString()}
                            </TableCell>
                            <TableCell></TableCell>
                          </TableRow>,
                        );

                        return rows;
                      })}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* 셀러 추가 다이얼로그 */}
      <AddSellerDialog
        open={addSellerOpen}
        onOpenChange={setAddSellerOpen}
        platformPartnerId={selectedPlatformId}
        onAdded={() => {
          matrixQuery.refetch();
          platformsQuery.refetch();
          summaryQuery.refetch();
        }}
      />

      {/* 매출 항목 입력 다이얼로그 */}
      <EditEntryDialog
        open={editEntryOpen}
        onOpenChange={setEditEntryOpen}
        data={editEntryData}
        periodYear={periodYear}
        onSubmit={(payload) => {
          upsertMutation.mutate({ ...payload, periodYear });
        }}
      />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 셀러 추가 다이얼로그
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AddSellerDialog({
  open,
  onOpenChange,
  platformPartnerId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  platformPartnerId: number | null;
  onAdded: () => void;
}) {
  const [sellerCode, setSellerCode] = useState("");
  const [sellerName, setSellerName] = useState("");
  const createMutation = (trpc as any).b2cPlatform.createSeller.useMutation({
    onSuccess: () => {
      toast({ title: "셀러 추가됨" });
      onAdded();
      onOpenChange(false);
      setSellerCode("");
      setSellerName("");
    },
    onError: (e: any) => toast({ title: "추가 실패", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>셀러 추가</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">셀러 코드 *</Label>
            <Input
              value={sellerCode}
              onChange={(e) => setSellerCode(e.target.value)}
              placeholder="sokooryceo"
            />
          </div>
          <div>
            <Label className="text-xs">셀러 이름 (표시용)</Label>
            <Input
              value={sellerName}
              onChange={(e) => setSellerName(e.target.value)}
              placeholder="소구려"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            onClick={() => {
              if (!sellerCode || !platformPartnerId) return;
              createMutation.mutate({
                platformPartnerId,
                sellerCode,
                sellerName: sellerName || undefined,
              });
            }}
            disabled={!sellerCode || createMutation.isPending}
          >
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 매출 항목 입력/수정 다이얼로그
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function EditEntryDialog({
  open,
  onOpenChange,
  data,
  periodYear,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  data: any;
  periodYear: number;
  onSubmit: (payload: any) => void;
}) {
  const [sellerId, setSellerId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [periodMonth, setPeriodMonth] = useState(1);
  const [grossAmount, setGrossAmount] = useState("");
  const [commissionAmount, setCommissionAmount] = useState("");
  const [refundAmount, setRefundAmount] = useState("");

  const sellersQuery = (trpc as any).b2cPlatform.listSellers.useQuery(
    { platformPartnerId: data?.platformPartnerId ?? 0 },
    { enabled: !!data?.platformPartnerId },
  );

  // data 변경 시 초기값 세팅
  useMemo(() => {
    if (!data) return;
    setSellerId(data.sellerId ?? null);
    setPaymentMethod(data.paymentMethod ?? "");
    setPeriodMonth(data.periodMonth ?? 1);
    setGrossAmount(data.existing?.gross_amount ? String(Number(data.existing.gross_amount)) : "");
    setCommissionAmount(data.existing?.commission_amount ? String(Number(data.existing.commission_amount)) : "");
    setRefundAmount(data.existing?.refund_amount ? String(Number(data.existing.refund_amount)) : "");
  }, [data?.sellerId, data?.paymentMethod, data?.periodMonth, data?.existing]);

  if (!data) return null;

  const handleSubmit = () => {
    if (!sellerId || !paymentMethod || !grossAmount) {
      toast({ title: "필수 항목 누락", description: "셀러·결제수단·총매출 필수", variant: "destructive" });
      return;
    }
    onSubmit({
      platformPartnerId: data.platformPartnerId,
      sellerId,
      paymentMethod,
      periodMonth,
      grossAmount: Number(grossAmount.replace(/,/g, "")),
      commissionAmount: commissionAmount ? Number(commissionAmount.replace(/,/g, "")) : 0,
      refundAmount: refundAmount ? Number(refundAmount.replace(/,/g, "")) : 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>매출 입력 — {periodYear}년 {periodMonth}월</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label className="text-xs">셀러 *</Label>
            <Select value={sellerId ? String(sellerId) : ""} onValueChange={(v) => setSellerId(Number(v))}>
              <SelectTrigger><SelectValue placeholder="셀러 선택" /></SelectTrigger>
              <SelectContent>
                {(sellersQuery.data || []).map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.seller_code} {s.seller_name ? `(${s.seller_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">결제수단 *</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue placeholder="결제수단 선택" /></SelectTrigger>
              <SelectContent>
                {DEFAULT_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">월 *</Label>
            <Select value={String(periodMonth)} onValueChange={(v) => setPeriodMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">총매출 (부가세 포함) *</Label>
            <Input
              value={grossAmount}
              onChange={(e) => setGrossAmount(e.target.value)}
              placeholder="111,060"
              className="text-right tabular-nums"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              공급가액·부가세는 ÷1.1 로 자동 계산
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">수수료</Label>
              <Input
                value={commissionAmount}
                onChange={(e) => setCommissionAmount(e.target.value)}
                placeholder="0"
                className="text-right tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">환불/쿠폰</Label>
              <Input
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                placeholder="0"
                className="text-right tabular-nums"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit}>저장</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
