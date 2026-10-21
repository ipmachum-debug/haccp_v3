/**
 * 재고 실사 (제품 / 원재료) 탭 — InventoryManagementIntegrated.tsx 에서 사용
 *
 * 2026-10-12: 원재료 모드 추가 (이번 달 실사). 서버는 applyPhysicalCount → applyInventoryDelta 관문.
 *   활성 LOT 없는 품목에 실사 수량을 넣으면 실사 LOT 가 자동 생성된다 (더 이상 skip 아님).
 *
 * 2026-04-27 (PR #5): 사용자 결정에 따라 구현
 *   - 입력 방식: UI 직접 입력 + Excel 업로드 둘 다
 *   - 단위: 제품 단위 (LOT 자동 배분)
 *   - 차이 처리: 자동 — 선생산재고 자동 차감 (FEFO, 가장 오래된 LOT 부터)
 *   - 증가 시: 최신 LOT 에 가산 (활성 LOT 없으면 skip + warning)
 *
 * UX:
 *   1. 표 (제품코드/제품명/현재가용/실사수량/차이/비고)
 *   2. 상단: Excel 다운로드(템플릿) / Excel 업로드 / 비고 일괄
 *   3. 차이 표시: 동일=회색 / 감소=빨강 / 증가=초록
 *   4. 하단 "실사 적용" 버튼 → confirm → 일괄 적용
 *   5. 결과: 적용/skip/실패 카운트 + 각 행 상세 표시
 */
import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ClipboardCheck, Download, Upload, AlertCircle, CheckCircle, X, FileSpreadsheet } from "lucide-react";
import { SectionTitle } from "@/components/inventory/InventoryHelpers";
import { toast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

type CountMode = "product" | "material";

/** 화면용 공통 행 — 제품/원재료 스냅샷을 같은 모양으로 */
type InventoryRow = {
  id: number;            // productId 또는 materialId
  code: string;
  name: string;
  unit: string;
  currentAvailable: number;
  lotCount: number;
  unitPrice: number;     // 평가단가(추정) — 0 이면 단가 없음
  priceSource: string;   // lot | master | last_receipt | batch_cost | none
};

const PRICE_SOURCE_LABEL: Record<string, string> = { lot: "LOT 가중평균", master: "마스터 단가", last_receipt: "최근 입고가", batch_cost: "최근 배치 원가", none: "단가 없음" };
const fmtWon = (n: number) => n.toLocaleString("ko-KR");

type CountInput = {
  actualQty: string; // text input, parsed on submit
  reason: string;
};

type ApplyResult = {
  productId?: number;
  materialId?: number;
  productCode?: string;
  productName?: string;
  before: number;
  after: number;
  diff: number;
  status: "applied" | "skipped" | "needs_review" | "failed";
  countedQty?: number;
  postCountNet?: number;
  expectedNow?: number;
  message?: string;
  affectedLots?: Array<{ lotNumber: string; changeQty: number; newAvailable: number }>;
};

export function InventoryCountTab() {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<CountMode>("product");
  const productQ = (trpc as any).inventory.getProductInventorySnapshot.useQuery(undefined, { enabled: mode === "product" });
  const materialQ = (trpc as any).inventory.getMaterialInventorySnapshot.useQuery(undefined, { enabled: mode === "material" });
  const isLoading = mode === "product" ? productQ.isLoading : materialQ.isLoading;
  const rows: InventoryRow[] = useMemo(() => {
    if (mode === "product") {
      return ((productQ.data as any[] | undefined) ?? []).map((r) => ({
        id: Number(r.productId), code: r.productCode ?? "", name: r.productName ?? "", unit: r.unit || "kg",
        currentAvailable: Number(r.currentAvailable ?? 0), lotCount: Number(r.lotCount ?? 0),
        unitPrice: Number(r.unitPrice ?? 0), priceSource: r.priceSource ?? "none",
      }));
    }
    return ((materialQ.data as any[] | undefined) ?? []).map((r) => ({
      id: Number(r.materialId), code: r.materialCode ?? "", name: r.materialName ?? "", unit: r.unit || "kg",
      currentAvailable: Number(r.currentAvailable ?? 0), lotCount: Number(r.lotCount ?? 0),
      unitPrice: Number(r.unitPrice ?? 0), priceSource: r.priceSource ?? "none",
    }));
  }, [mode, productQ.data, materialQ.data]);
  const label = mode === "product" ? "제품" : "원재료";

  // 입력 상태: productId → { actualQty, reason }
  const [inputs, setInputs] = useState<Record<number, CountInput>>({});
  const [defaultReason, setDefaultReason] = useState("정기 재고 실사");
  const [countDate, setCountDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [clearUnusableLots, setClearUnusableLots] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ApplyResult[] | null>(null);

  const updateInput = useCallback((id: number, field: keyof CountInput, value: string) => {
    setInputs((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { actualQty: "", reason: "" }), [field]: value },
    }));
  }, []);

  const switchMode = (m: CountMode) => {
    if (m === mode) return;
    if (Object.keys(inputs).length > 0 && !confirm("입력 중인 실사 수량이 지워집니다. 전환할까요?")) return;
    setMode(m); setInputs({}); setResults(null); setSearch("");
  };

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q),
    );
  }, [rows, search]);

  // 평가액 합계 — 현재(장부) vs 실사(입력값 있으면 입력값, 없으면 현재). 기초잔액 전표 입력용.
  const valuation = useMemo(() => {
    let current = 0, counted = 0, priced = 0, unpriced = 0;
    for (const r of rows) {
      if (r.unitPrice > 0) priced++; else { unpriced++; continue; }
      current += r.currentAvailable * r.unitPrice;
      const v = inputs[r.id]?.actualQty;
      const num = v !== undefined && v !== "" ? parseFloat(v) : NaN;
      counted += (!isNaN(num) && num >= 0 ? num : r.currentAvailable) * r.unitPrice;
    }
    return { current: Math.round(current), counted: Math.round(counted), priced, unpriced };
  }, [rows, inputs]);

  // 변경 예정 항목 수
  const pendingCount = useMemo(() => {
    let n = 0;
    for (const r of rows) {
      const v = inputs[r.id]?.actualQty;
      if (v === undefined || v === "") continue;
      const num = parseFloat(v);
      if (isNaN(num) || num < 0) continue;
      if (Math.abs(num - r.currentAvailable) > 0.001) n++;
    }
    return n;
  }, [rows, inputs]);

  const mutation = (trpc as any).inventory.bulkApplyInventoryCount.useMutation({
    onSuccess: (data: { results: ApplyResult[]; summary: { total: number; applied: number; skipped: number; needsReview?: number; failed: number } }) => {
      setResults(data.results);
      utils.inventory.list.invalidate();
      utils.inventory.getDashboard.invalidate();
      utils.inventory.getProductInventorySnapshot.invalidate();
      (utils as any).inventory.getMaterialInventorySnapshot?.invalidate?.();
      toast({
        title: "실사 적용 완료",
        description: `적용 ${data.summary.applied} · skip ${data.summary.skipped}${data.summary.needsReview ? ` · 확인 필요 ${data.summary.needsReview}` : ""} · 실패 ${data.summary.failed}`,
        variant: data.summary.failed > 0 ? "destructive" : "default",
      });
      setInputs({});
    },
    onError: (e: { message: string }) =>
      toast({ title: "실사 적용 실패", description: e.message, variant: "destructive" }),
  });

  const handleApply = () => {
    const items: Array<{ productId?: number; materialId?: number; actualQty: number; reason?: string }> = [];
    for (const r of rows) {
      const ip = inputs[r.id];
      if (!ip || ip.actualQty === "") continue;
      const num = parseFloat(ip.actualQty);
      if (isNaN(num) || num < 0) continue;
      items.push({
        ...(mode === "product" ? { productId: r.id } : { materialId: r.id }),
        actualQty: num,
        reason: ip.reason?.trim() || undefined,
      });
    }
    if (items.length === 0) {
      toast({ title: "입력된 항목 없음", description: "실사 수량을 1건 이상 입력해주세요." });
      return;
    }
    if (!confirm(
      `${label} ${items.length}건 실사 적용\n` +
      `실사일: ${countDate} · 사유: ${defaultReason}\n\n` +
      `감소: 입고일이 가장 이른 LOT 부터 자동 차감\n` +
      `증가: 최신 LOT 에 가산 (활성 LOT 없으면 실사 LOT 신규 생성)\n` +
      `실사일이 지난 날이면: 그날 센 수량 + 그 뒤 입출고 = 지금 있어야 할 양으로 비교 (실사일 당일 거래·단위 다름 등은 '확인 필요' 로 남김)\n` +
      (clearUnusableLots
        ? `쓸 수 없는 LOT(사용완료·만료·폐기)에 남은 잔량: 실사일 날짜로 함께 0 으로 정리 (센 수량 = 쓸 수 있는 재고)\n\n`
        : `쓸 수 없는 LOT(사용완료·만료·폐기)에 잔량이 남은 품목: '확인 필요' 로 남김\n\n`) +
      `진행하시겠습니까?`,
    )) {
      return;
    }
    mutation.mutate({ items, defaultReason, countDate, clearUnusableLots });
  };

  // ─── Excel 다운로드 (템플릿) ─────────────────────
  const handleDownloadTemplate = () => {
    const exportRows = rows.map((r) => ({
      "코드": r.code,
      "품명": r.name,
      "단위": r.unit,
      "현재가용": r.currentAvailable,
      "평가단가": r.unitPrice || "",
      "실사수량 (입력)": "",
      "비고": "",
    }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws["!cols"] = [
      { wch: 12 }, { wch: 30 }, { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 24 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${label}실사`);
    XLSX.writeFile(wb, `${label}재고실사_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "엑셀 템플릿 다운로드 완료" });
  };

  // ─── Excel 업로드 ─────────────────────
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws) as any[];

        const codeMap = new Map<string, InventoryRow>();
        for (const r of rows) codeMap.set(r.code, r);

        const newInputs: Record<number, CountInput> = { ...inputs };
        let matched = 0, unmatched = 0;
        for (const row of json) {
          const code = String(row["코드"] ?? row["제품코드"] ?? row["원재료코드"] ?? "").trim();
          if (!code) continue;
          const product = codeMap.get(code);
          if (!product) {
            unmatched++;
            continue;
          }
          const qtyRaw = row["실사수량 (입력)"] ?? row["실사수량"] ?? "";
          const qtyStr = String(qtyRaw).trim();
          if (qtyStr === "") continue;
          const reason = String(row["비고"] ?? "").trim();
          newInputs[product.id] = { actualQty: qtyStr, reason };
          matched++;
        }
        setInputs(newInputs);
        toast({
          title: "엑셀 업로드 완료",
          description: `매칭 ${matched}건${unmatched > 0 ? ` · 매칭실패 ${unmatched}건` : ""}`,
        });
      } catch (err: any) {
        toast({ title: "엑셀 파싱 실패", description: err.message, variant: "destructive" });
      } finally {
        // 같은 파일 재업로드 가능하도록
        if (e.target) e.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <SectionTitle
            icon={ClipboardCheck}
            title={`${label} 재고 실사`}
            desc="품목 단위 실사 입력 후 일괄 적용 — 감소는 오래된 LOT 부터 자동 차감 (FEFO), LOT 없으면 실사 LOT 생성"
          />
          <div className="inline-flex rounded-md border overflow-hidden text-xs">
            <button type="button" onClick={() => switchMode("product")} className={`px-3 h-8 ${mode === "product" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>제품</button>
            <button type="button" onClick={() => switchMode("material")} className={`px-3 h-8 border-l ${mode === "material" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent"}`}>원재료</button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        {/* 컨트롤 바 */}
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="flex items-center gap-2">
            <Input
              placeholder={`${label} 검색...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs w-56"
            />
            <span className="text-[11px] text-muted-foreground">
              총 {rows.length}개 / 변경 예정 {pendingCount}건
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="h-8 text-xs">
              <Download className="h-3.5 w-3.5 mr-1" /> 엑셀 템플릿
            </Button>
            <label className="cursor-pointer">
              <input type="file" accept=".xlsx,.xls" onChange={handleUpload} className="hidden" />
              <span className="inline-flex items-center h-8 text-xs px-3 rounded-md border bg-background hover:bg-accent">
                <Upload className="h-3.5 w-3.5 mr-1" /> 엑셀 업로드
              </span>
            </label>
          </div>
        </div>

        {/* 일괄 사유 */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-muted-foreground whitespace-nowrap">실사일:</label>
          <Input type="date" value={countDate} onChange={(e) => setCountDate(e.target.value)} className="h-8 text-xs w-40" />
          <label className="text-xs text-muted-foreground whitespace-nowrap">기본 사유:</label>
          <Input
            value={defaultReason}
            onChange={(e) => setDefaultReason(e.target.value)}
            placeholder="정기 재고 실사"
            className="h-8 text-xs flex-1 max-w-md"
          />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer" title="사용완료·만료·폐기 상태인데 잔량이 남은 LOT 을 실사일 날짜로 0 으로 정리합니다. 센 수량은 쓸 수 있는 재고만입니다.">
            <input type="checkbox" checked={clearUnusableLots} onChange={(e) => setClearUnusableLots(e.target.checked)} className="h-3.5 w-3.5" />
            쓸 수 없는 LOT 잔량 함께 정리
          </label>
        </div>

        {/* 그리드 */}
        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">로딩 중...</div>
        ) : filteredRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? `활성 ${label}이(가) 없습니다.` : "검색 결과 없음"}
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="text-left py-2 px-2 font-medium">코드</th>
                  <th className="text-left py-2 px-2 font-medium">{label}명</th>
                  <th className="text-right py-2 px-2 font-medium">현재가용</th>
                  <th className="text-right py-2 px-2 font-medium">LOT</th>
                  <th className="text-right py-2 px-2 font-medium w-24">평가단가</th>
                  <th className="text-right py-2 px-2 font-medium w-32">실사 수량 *</th>
                  <th className="text-right py-2 px-2 font-medium w-20">차이</th>
                  <th className="text-right py-2 px-2 font-medium w-28">실사 평가액</th>
                  <th className="text-left py-2 px-2 font-medium w-40">비고</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const ip = inputs[r.id];
                  const actualNum = ip?.actualQty ? parseFloat(ip.actualQty) : NaN;
                  const diff = !isNaN(actualNum) ? actualNum - r.currentAvailable : null;
                  const diffClass =
                    diff === null
                      ? ""
                      : Math.abs(diff) < 0.001
                      ? "text-muted-foreground"
                      : diff < 0
                      ? "text-red-600 font-bold"
                      : "text-emerald-600 font-bold";
                  return (
                    <tr key={r.id} className="border-b hover:bg-muted/20">
                      <td className="py-1.5 px-2 font-mono">{r.code}</td>
                      <td className="py-1.5 px-2">{r.name}</td>
                      <td className="text-right py-1.5 px-2 tabular-nums">
                        {r.currentAvailable.toFixed(1)} {r.unit}
                      </td>
                      <td className="text-right py-1.5 px-2 tabular-nums">
                        <span className="text-muted-foreground">{r.lotCount}</span>
                      </td>
                      <td className="text-right py-1.5 px-2 tabular-nums" title={PRICE_SOURCE_LABEL[r.priceSource] ?? r.priceSource}>
                        {r.unitPrice > 0 ? <span>{fmtWon(r.unitPrice)}<span className="ml-0.5 text-[9px] text-muted-foreground">{r.priceSource === "lot" ? "L" : r.priceSource === "master" ? "M" : r.priceSource === "last_receipt" ? "R" : "B"}</span></span> : <span className="text-amber-600">-</span>}
                      </td>
                      <td className="py-1 px-1">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={ip?.actualQty ?? ""}
                          onChange={(e) => updateInput(r.id, "actualQty", e.target.value)}
                          className="h-7 text-xs text-right tabular-nums"
                          placeholder={r.currentAvailable.toFixed(0)}
                        />
                      </td>
                      <td className={`text-right py-1.5 px-2 tabular-nums ${diffClass}`}>
                        {diff === null
                          ? "-"
                          : diff > 0
                          ? `+${diff.toFixed(1)}`
                          : diff.toFixed(1)}
                      </td>
                      <td className="text-right py-1.5 px-2 tabular-nums text-muted-foreground">
                        {r.unitPrice > 0 ? fmtWon(Math.round((!isNaN(actualNum) ? actualNum : r.currentAvailable) * r.unitPrice)) : "-"}
                      </td>
                      <td className="py-1 px-1">
                        <Input
                          value={ip?.reason ?? ""}
                          onChange={(e) => updateInput(r.id, "reason", e.target.value)}
                          className="h-7 text-xs"
                          placeholder="(선택)"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 평가액 요약 — 기초잔액(전기이월) 전표 입력용 */}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-md border bg-muted/20 px-3 py-2 text-xs">
            <span>장부 평가액 <b className="tabular-nums">{fmtWon(valuation.current)}원</b></span>
            <span>실사 평가액 <b className="tabular-nums">{fmtWon(valuation.counted)}원</b>
              <span className={`ml-1 tabular-nums ${valuation.counted - valuation.current < 0 ? "text-red-600" : valuation.counted - valuation.current > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                ({valuation.counted - valuation.current >= 0 ? "+" : ""}{fmtWon(valuation.counted - valuation.current)})
              </span>
            </span>
            <span className="text-muted-foreground">단가 있는 품목 {valuation.priced} · 단가 없음 {valuation.unpriced} (평가액 제외)</span>
            <span className="text-muted-foreground">단가 출처: L=LOT 가중평균 · M=마스터 · R=최근 입고가 · B=최근 배치 원가</span>
          </div>
        )}

        {/* 적용 버튼 */}
        <div className="flex items-center justify-end gap-2">
          {pendingCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {pendingCount}건 변경 적용 준비됨
            </span>
          )}
          <Button
            onClick={handleApply}
            disabled={mutation.isPending || pendingCount === 0}
            size="sm"
            className="h-8 text-xs px-5"
          >
            {mutation.isPending ? "적용 중..." : `실사 적용 ${pendingCount > 0 ? `(${pendingCount})` : ""}`}
          </Button>
        </div>

        {/* 결과 */}
        {results && results.length > 0 && (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/30 px-3 py-2 border-b flex items-center justify-between">
              <h4 className="text-xs font-semibold">적용 결과 · {results.length}건</h4>
              <button
                onClick={() => setResults(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="divide-y max-h-80 overflow-y-auto">
              {results.map((r, idx) => {
                const icon =
                  r.status === "applied" ? (
                    <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                  ) : r.status === "failed" ? (
                    <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                  ) : r.status === "needs_review" ? (
                    <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-muted-foreground" />
                  );
                return (
                  <div key={idx} className="px-3 py-2 text-xs flex items-start gap-2">
                    {icon}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {r.productCode} · {r.productName}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        {r.before.toFixed(1)} → {r.after.toFixed(1)} (
                        <span className={r.diff > 0 ? "text-emerald-600" : r.diff < 0 ? "text-red-600" : ""}>
                          {r.diff > 0 ? "+" : ""}
                          {r.diff.toFixed(1)}
                        </span>
                        )
                        {r.message && <span className="ml-2">— {r.message}</span>}
                        {r.postCountNet != null && r.postCountNet !== 0 && (
                          <span className="ml-2" data-testid="count-carry">· 실사 {r.countedQty} + 실사일 뒤 {r.postCountNet > 0 ? "+" : ""}{r.postCountNet} = 기대 {r.expectedNow}</span>
                        )}
                      </div>
                      {r.affectedLots && r.affectedLots.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] text-muted-foreground">
                            영향 LOT {r.affectedLots.length}건
                          </summary>
                          <ul className="mt-1 space-y-0.5 pl-3 text-[10px] font-mono">
                            {r.affectedLots.map((a, i) => (
                              <li key={i}>
                                {a.lotNumber}: {a.changeQty > 0 ? "+" : ""}
                                {a.changeQty.toFixed(1)} → {a.newAvailable.toFixed(1)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <Badge
                      variant={r.status === "applied" ? "default" : r.status === "failed" ? "destructive" : r.status === "needs_review" ? "outline" : "secondary"}
                      className="text-[9px]"
                    >
                      {r.status === "applied" ? "적용" : r.status === "failed" ? "실패" : r.status === "needs_review" ? "확인 필요" : "skip"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
