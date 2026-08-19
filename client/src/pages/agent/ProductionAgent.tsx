/**
 * 생산 자동화 에이전트 (시크릿 페이지)
 * /dashboard/agent — 메뉴에 표시되지 않음
 *
 * 자연어로 생산 데이터를 입력하면 배치, CCP, 체크리스트를 자동 생성
 *
 * 2026-08-18 (다음 세션 TODO #1) — 제품 수정 UI:
 *   - 잘못 매칭된 제품을 후보 칩 / 검색 콤보박스로 교체
 *   - 수량 직접 편집 (교체·수정 시 BOM/CCP 계획 재계산)
 *   - SKU 별 계획 수량 입력 (판매단위 → kg 환산 표시)
 */
import { useState, useEffect, useMemo, useRef } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bot, CheckCircle2, AlertCircle, Package, ClipboardCheck,
  ShieldCheck, Loader2, Play, Eye, RotateCcw, Sparkles,
  Search, Replace, Boxes, ChevronDown, ChevronUp, X,
} from "lucide-react";

// ─── 타입 ───

interface Candidate {
  productId: number;
  productName: string;
  productCode: string | null;
  score: number;
}

interface SkuOption {
  skuId: number;
  skuCode: string;
  skuName: string;
  kgPerSalesUnit: number | null;
  salesUnit: string | null;
  isDefault: boolean;
}

interface BomInfo { batchKg: number; batchCount: number; versionId?: number }

interface PlanItem {
  status: "ready" | "error";
  rawName?: string;
  productId?: number;
  productName: string;
  productCode?: string | null;
  matchScore?: number | null;
  quantity: number;
  unit?: string;
  bomInfo?: BomInfo | null;
  ccpCount?: number;
  ccpWarning?: string;
  checklistCount?: number;
  candidates?: Candidate[];
  skus?: SkuOption[];
  startTime?: string;
  error?: string;
}

/** 편집 상태가 붙은 계획 행 */
interface EditableRow extends PlanItem {
  key: string;
  /** SKU 별 계획 수량 (판매단위) */
  skuQty: Record<number, number>;
  /** SKU 패널 펼침 여부 */
  skuOpen: boolean;
  /** 상세 재계산 중 */
  recalculating?: boolean;
}

interface ExecuteResult {
  status: "success" | "error";
  productId: number;
  productName?: string;
  batchId?: number;
  batchCode?: string;
  ccpCount?: number;
  error?: string;
}

// ─── 제품 검색 콤보박스 (에이전트 전용, autoAgent.searchProducts 기반) ───

function ProductPicker({
  onSelect,
  onClose,
}: {
  onSelect: (p: { productId: number; productName: string; productCode: string | null }) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const { data, isFetching } = trpc.autoAgent.searchProducts.useQuery(
    { q: debounced || undefined, limit: 30 },
    { staleTime: 30_000 },
  );

  return (
    <div ref={boxRef} className="mt-2 rounded-lg border bg-background shadow-sm">
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="제품명 또는 제품코드 검색"
          className="w-full bg-transparent text-xs outline-none py-0.5"
        />
        {isFetching && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="max-h-56 overflow-y-auto">
        {(data || []).length === 0 && !isFetching && (
          <p className="px-3 py-3 text-xs text-muted-foreground">검색 결과가 없습니다</p>
        )}
        {(data || []).map((p: any) => (
          <button
            key={p.productId}
            type="button"
            onClick={() => onSelect({ productId: p.productId, productName: p.productName, productCode: p.productCode })}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-muted"
          >
            <span className="truncate">{p.productName}</span>
            <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">{p.productCode || ""}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── 메인 페이지 ───

export default function ProductionAgent() {
  const [text, setText] = useState("");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [rows, setRows] = useState<EditableRow[] | null>(null);
  const [previewMeta, setPreviewMeta] = useState<{ workDate: string; startTime: string } | null>(null);
  const [executeResults, setExecuteResults] = useState<ExecuteResult[] | null>(null);
  const [pickerOpenKey, setPickerOpenKey] = useState<string | null>(null);

  const utils = trpc.useUtils();

  const toRows = (plans: PlanItem[]): EditableRow[] =>
    plans.map((p, i) => ({
      ...p,
      key: `${i}-${p.productId ?? "none"}`,
      skuQty: {},
      skuOpen: false,
    }));

  const previewMutation = trpc.autoAgent.preview.useMutation({
    onSuccess: (data: any) => {
      setPreviewMeta({ workDate: data.workDate, startTime: data.startTime });
      setRows(toRows(data.plans || []));
      setExecuteResults(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const { data: siteInfo } = trpc.autoAgent.getSiteId.useQuery();

  const bulkCreateMutation = trpc.batch.bulkCreateForDay.useMutation({
    onSuccess: (data: any) => {
      // ★ 응답 필드는 batches (created 아님) — 이전 구현의 매핑 버그 수정
      const results: ExecuteResult[] = (data.batches || []).map((b: any) => ({
        status: b.batchId > 0 ? ("success" as const) : ("error" as const),
        productId: b.productId,
        productName: b.productName,
        batchId: b.batchId,
        batchCode: b.batchCode,
        ccpCount: b.ccpCount,
        error: b.error,
      }));
      setExecuteResults(results);
      const ok = results.filter((r) => r.status === "success").length;
      const fail = results.length - ok;
      if (ok > 0) toast.success(`${ok}건 배치 생성 완료${fail > 0 ? ` (실패 ${fail}건)` : ""}`);
      else toast.error("배치 생성에 실패했습니다");
      if ((data.subFailures || []).length > 0) {
        toast.warning(`후속 단계 ${data.subFailures.length}건 실패 — 서버 로그를 확인하세요`);
      }
    },
    onError: (err: any) => toast.error(err.message),
  });

  const isExecuting = bulkCreateMutation.isPending;
  const isLoading = previewMutation.isPending || isExecuting;

  // ── 행 편집 ──

  const patchRow = (key: string, patch: Partial<EditableRow>) => {
    setRows((prev) => (prev ? prev.map((r) => (r.key === key ? { ...r, ...patch } : r)) : prev));
  };

  /** 제품 교체 / 수량 변경 시 BOM·CCP·SKU 재계산 */
  const recalc = async (key: string, productId: number, quantity: number) => {
    patchRow(key, { recalculating: true });
    try {
      const detail: any = await utils.autoAgent.planDetail.fetch({ productId, quantity });
      patchRow(key, {
        recalculating: false,
        productId: detail.productId,
        productName: detail.productName,
        productCode: detail.productCode,
        bomInfo: detail.bomInfo,
        ccpCount: detail.ccpCount,
        ccpWarning: detail.ccpWarning,
        checklistCount: detail.checklistCount,
        skus: detail.skus,
        status: detail.blocked ? "error" : "ready",
        error: detail.blocked ? detail.ccpWarning : undefined,
        matchScore: null,
      });
    } catch (err: any) {
      patchRow(key, { recalculating: false });
      toast.error(err?.message || "계획 재계산 실패");
    }
  };

  const handleSelectProduct = (row: EditableRow, p: { productId: number; productName: string; productCode: string | null }) => {
    setPickerOpenKey(null);
    patchRow(row.key, { productId: p.productId, productName: p.productName, productCode: p.productCode, skuQty: {} });
    void recalc(row.key, p.productId, row.quantity);
  };

  const handleQuantityChange = (row: EditableRow, raw: string) => {
    const qty = Number(raw.replace(/,/g, "")) || 0;
    patchRow(row.key, { quantity: qty });
  };

  const handleQuantityCommit = (row: EditableRow) => {
    if (row.productId) void recalc(row.key, row.productId, row.quantity);
  };

  const handleRemoveRow = (key: string) => {
    setRows((prev) => (prev ? prev.filter((r) => r.key !== key) : prev));
  };

  // ── 실행 ──

  const handlePreview = () => {
    if (!text.trim()) { toast.error("생산 내용을 입력해주세요"); return; }
    previewMutation.mutate({ text, workDate, startTime });
  };

  const handleExecute = () => {
    if (!rows) return;
    const items = rows
      .filter((r) => r.status === "ready" && r.productId && r.quantity > 0)
      .map((r) => {
        const skuOutputs = Object.entries(r.skuQty)
          .filter(([, qty]) => Number(qty) > 0)
          .map(([skuId, qty]) => ({ skuId: Number(skuId), plannedQty: Number(qty) }));
        return {
          productId: r.productId!,
          plannedQuantityKg: r.quantity,
          startTime: r.startTime,
          ...(skuOutputs.length > 0 ? { skuOutputs } : {}),
        };
      });
    if (!items.length) { toast.error("실행 가능한 항목이 없습니다"); return; }
    bulkCreateMutation.mutate({
      siteId: siteInfo?.siteId || 1,
      workDate: previewMeta?.workDate || workDate,
      dayStartTime: startTime,
      items,
    });
  };

  const handleReset = () => {
    setText("");
    setRows(null);
    setPreviewMeta(null);
    setExecuteResults(null);
    setPickerOpenKey(null);
  };

  const readyCount = rows?.filter((r) => r.status === "ready" && r.productId && r.quantity > 0).length || 0;
  const errorCount = rows?.filter((r) => r.status === "error" || !r.productId).length || 0;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">생산 자동화 에이전트</h1>
            <p className="text-sm text-muted-foreground">자연어로 입력하면 배치·CCP·체크리스트를 자동 생성합니다</p>
          </div>
        </div>

        {/* 입력 영역 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              생산 내용 입력
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={"예시:\n초코크림 케이크 3,200kg\n딸기 타르트 1,500kg\n바닐라 쿠키 2,000kg"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="resize-none text-sm"
              disabled={isLoading}
            />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">날짜</label>
                <Input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  className="h-8 text-xs w-36"
                  disabled={isLoading}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">시작</label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-8 text-xs w-28"
                  disabled={isLoading}
                />
              </div>
              <div className="ml-auto flex gap-2">
                {rows && (
                  <Button variant="outline" size="sm" onClick={handleReset} disabled={isLoading}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> 초기화
                  </Button>
                )}
                <Button size="sm" onClick={handlePreview} disabled={isLoading || !text.trim()}>
                  {previewMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 mr-1" />
                  )}
                  검증
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 검증 결과 (편집 가능한 미리보기) */}
        {rows && !executeResults && (
          <Card className="border-violet-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4 text-violet-500" />
                  실행 계획 미리보기 <span className="text-xs font-normal text-muted-foreground">(수정 가능)</span>
                </CardTitle>
                <div className="flex gap-1.5">
                  {readyCount > 0 && <Badge className="bg-emerald-100 text-emerald-700 text-xs">{readyCount}건 준비</Badge>}
                  {errorCount > 0 && <Badge variant="destructive" className="text-xs">{errorCount}건 확인 필요</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground mb-2">
                작업일: {previewMeta?.workDate} · 시작: {previewMeta?.startTime}
              </div>

              {rows.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">항목이 모두 삭제되었습니다. 다시 검증해 주세요.</p>
              )}

              {rows.map((row) => (
                <PlanRow
                  key={row.key}
                  row={row}
                  pickerOpen={pickerOpenKey === row.key}
                  onOpenPicker={() => setPickerOpenKey(row.key)}
                  onClosePicker={() => setPickerOpenKey(null)}
                  onSelectProduct={(p) => handleSelectProduct(row, p)}
                  onQuantityChange={(v) => handleQuantityChange(row, v)}
                  onQuantityCommit={() => handleQuantityCommit(row)}
                  onToggleSku={() => patchRow(row.key, { skuOpen: !row.skuOpen })}
                  onSkuQtyChange={(skuId, qty) =>
                    patchRow(row.key, { skuQty: { ...row.skuQty, [skuId]: qty } })
                  }
                  onRemove={() => handleRemoveRow(row.key)}
                  disabled={isExecuting}
                />
              ))}

              {readyCount > 0 && (
                <Button
                  className="w-full bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700"
                  onClick={handleExecute}
                  disabled={isExecuting}
                >
                  {isExecuting ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 생성 중...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> {readyCount}건 실행</>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* 실행 결과 */}
        {executeResults && (
          <Card className="border-emerald-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                실행 완료
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {executeResults.map((r, i) => (
                <div key={i} className={`rounded-lg border p-3 ${
                  r.status === "error" ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/30"
                }`}>
                  {r.status === "success" ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium">{r.batchCode}</span>
                        <span className="text-xs text-muted-foreground">{r.productName}</span>
                      </div>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span>CCP {r.ccpCount ?? 0}건</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-600">{r.productName || `제품 #${r.productId}`}: {r.error}</span>
                    </div>
                  )}
                </div>
              ))}

              <Button variant="outline" className="w-full mt-3" onClick={handleReset}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> 새로운 입력
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 사용 가이드 */}
        {!rows && !executeResults && (
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">입력 예시</p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p className="cursor-pointer hover:text-foreground" onClick={() => setText("초코크림 케이크 3,200kg")}>
                  "초코크림 케이크 3,200kg"
                </p>
                <p className="cursor-pointer hover:text-foreground" onClick={() => setText("딸기 타르트 1,500kg\n바닐라 쿠키 2,000kg\n초코크림 케이크 3,200kg")}>
                  "딸기 타르트 1,500kg, 바닐라 쿠키 2,000kg, 초코크림 케이크 3,200kg"
                </p>
                <p className="cursor-pointer hover:text-foreground" onClick={() => setText("오늘 생산: 앙버터 500kg, 크림빵 800kg, 시작 07:30")}>
                  "오늘 생산: 앙버터 500kg, 크림빵 800kg, 시작 07:30"
                </p>
              </div>
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-semibold text-muted-foreground mb-1">자동 생성 항목</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <span>- 배치 (레시피 기반 원료 투입)</span>
                  <span>- CCP 기록 (공정별 자동)</span>
                  <span>- 일일 체크리스트</span>
                  <span>- 생산일지 / 승인요청</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

// ─── 계획 행 컴포넌트 ───

function PlanRow({
  row,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onSelectProduct,
  onQuantityChange,
  onQuantityCommit,
  onToggleSku,
  onSkuQtyChange,
  onRemove,
  disabled,
}: {
  row: EditableRow;
  pickerOpen: boolean;
  onOpenPicker: () => void;
  onClosePicker: () => void;
  onSelectProduct: (p: { productId: number; productName: string; productCode: string | null }) => void;
  onQuantityChange: (v: string) => void;
  onQuantityCommit: () => void;
  onToggleSku: () => void;
  onSkuQtyChange: (skuId: number, qty: number) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const isError = row.status === "error" || !row.productId;
  const skus = row.skus || [];

  const skuTotalKg = useMemo(
    () =>
      skus.reduce((sum, s) => {
        const qty = row.skuQty[s.skuId] || 0;
        return sum + qty * (s.kgPerSalesUnit || 0);
      }, 0),
    [skus, row.skuQty],
  );
  const skuEntered = skus.some((s) => (row.skuQty[s.skuId] || 0) > 0);

  return (
    <div className={`rounded-lg border p-3 ${isError ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/30"}`}>
      {/* 1행: 제품 + 수량 */}
      <div className="flex items-center gap-2 mb-2">
        {isError ? (
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
        ) : (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate">{row.productName}</span>
            {row.productCode && (
              <span className="text-[11px] text-muted-foreground shrink-0">{row.productCode}</span>
            )}
            {row.recalculating && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          {row.rawName && row.rawName !== row.productName && (
            <p className="text-[11px] text-muted-foreground truncate">
              입력: "{row.rawName}"{typeof row.matchScore === "number" ? ` · 매칭 ${row.matchScore}점` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Input
            type="number"
            value={row.quantity || ""}
            onChange={(e) => onQuantityChange(e.target.value)}
            onBlur={onQuantityCommit}
            className="h-7 w-24 text-right text-xs"
            disabled={disabled}
            min={0}
          />
          <span className="text-xs text-muted-foreground">kg</span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onOpenPicker} disabled={disabled}>
            <Replace className="w-3.5 h-3.5 mr-1" />
            <span className="text-xs">변경</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-1.5 text-muted-foreground" onClick={onRemove} disabled={disabled}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* 오류 메시지 */}
      {isError && row.error && <p className="text-xs text-red-600 mb-2">{row.error}</p>}

      {/* 후보 칩 (정확도가 낮거나 매칭 실패 시) */}
      {(row.candidates?.length || 0) > 0 && (isError || (row.matchScore ?? 100) < 90) && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-[11px] text-muted-foreground">후보:</span>
          {row.candidates!.map((c) => (
            <button
              key={c.productId}
              type="button"
              disabled={disabled}
              onClick={() => onSelectProduct({ productId: c.productId, productName: c.productName, productCode: c.productCode })}
              className={`rounded-full border px-2 py-0.5 text-[11px] transition ${
                c.productId === row.productId
                  ? "border-violet-400 bg-violet-100 text-violet-700"
                  : "border-border bg-background hover:bg-muted"
              }`}
            >
              {c.productName} <span className="text-muted-foreground">{c.score}</span>
            </button>
          ))}
        </div>
      )}

      {/* 제품 검색 콤보박스 */}
      {pickerOpen && <ProductPicker onSelect={onSelectProduct} onClose={onClosePicker} />}

      {/* 계획 요약 */}
      {!isError && (
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="w-3 h-3" />
            {row.bomInfo ? `${row.bomInfo.batchCount}배치 (${row.bomInfo.batchKg}kg/배치)` : "BOM 없음"}
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ShieldCheck className="w-3 h-3" />
            CCP {row.ccpCount || 0}건
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ClipboardCheck className="w-3 h-3" />
            체크리스트 {row.checklistCount || 0}건
          </div>
        </div>
      )}

      {/* SKU 배분 */}
      {row.productId && skus.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <button
            type="button"
            onClick={onToggleSku}
            className="flex w-full items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Boxes className="w-3 h-3" />
            SKU 배분 ({skus.length}종)
            {skuEntered && (
              <span className="text-[11px] text-violet-600">
                입력 {skuTotalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}kg
              </span>
            )}
            {row.skuOpen ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>

          {row.skuOpen && (
            <div className="mt-2 space-y-1.5">
              {skus.map((s) => {
                const qty = row.skuQty[s.skuId] || 0;
                const kg = qty * (s.kgPerSalesUnit || 0);
                return (
                  <div key={s.skuId} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">
                      {s.skuName}
                      {s.isDefault && <span className="ml-1 text-[10px] text-violet-600">기본</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {s.kgPerSalesUnit != null ? `${s.kgPerSalesUnit}kg/${s.salesUnit || "단위"}` : "환산정보 없음"}
                    </span>
                    <Input
                      type="number"
                      value={qty || ""}
                      onChange={(e) => onSkuQtyChange(s.skuId, Number(e.target.value) || 0)}
                      className="h-7 w-20 text-right text-xs"
                      disabled={disabled}
                      min={0}
                    />
                    <span className="w-20 shrink-0 text-right text-[11px] text-muted-foreground">
                      {kg > 0 ? `${kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}kg` : "-"}
                    </span>
                  </div>
                );
              })}
              {skuEntered && Math.abs(skuTotalKg - row.quantity) > 0.5 && (
                <p className="text-[11px] text-amber-600">
                  SKU 합계 {skuTotalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}kg 가 계획 수량{" "}
                  {row.quantity.toLocaleString()}kg 와 다릅니다.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
