/**
 * 오늘 생산 작업대 (2026-10-18, PR-B — CEO 설계 '오늘 생산 작업대: 현장 중심 설계 기준')
 *
 * 하루의 여러 제품·여러 배치를 한 입력표로 준비한다. 같은 제품 여러 배치, 줄마다 자동/수동.
 *   1) 입력표: 제품 / 배치당 kg / 배치 수 / 총 kg / 처리방식 / 오늘만 시작시각 / 배치당 SKU 예상수량. AI 입력도 같은 표를 채운다.
 *   2) 미리보기: 배치별 행으로 펼쳐 BOM 버전·회차·공정별 설비·예정시각·예정 투입량 확인. 서버 계산 = 실제 생성과 같은 함수, 저장 없음.
 *   3) 생성: 요청 키로 한 번만. 일부 실패하면 성공 줄은 빠지고 실패 줄만 남아 같은 키로 다시.
 *   4) 아래: 서버에 저장된 오늘 배치 — '지금 할 일' 한 가지.
 * 생성 뒤 다른 화면으로 강제 이동하지 않는다. 축하 효과 없음.
 * 오늘 제외 설비·오늘만 시작시각은 이 요청에만 쓰고 설비·공정 설정을 바꾸지 않는다.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import AIProductionParser from "@/components/production/AIProductionParser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { todayLocal } from "../../lib/dateUtils";
import { AlertTriangle, Check, ChevronsUpDown, Eye, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";

type Mode = "auto" | "manual";
interface Line {
  id: string;
  productId: number | null;
  batchKg: string;
  /** 줄의 배치마다 하나 — 요청 키와 함께 같은 배치는 한 번만 생성 */
  rowKeys: string[];
  mode: Mode;
  startOverride: string;
  sku: Record<number, string>;
}

const rid = () => Math.random().toString(36).slice(2, 10);
const newRequestKey = () => `wb-${Date.now().toString(36)}-${rid()}`;
let keySeq = 0;
const newRowKey = (lineId: string) => `${lineId}-${++keySeq}`;
const emptyLine = (mode: Mode): Line => {
  const id = rid();
  return { id, productId: null, batchKg: "", rowKeys: [newRowKey(id)], mode, startOverride: "", sku: {} };
};
const resize = (l: Line, n: number): Line => {
  const k = Math.max(1, Math.min(30, Math.floor(n) || 1));
  if (k === l.rowKeys.length) return l;
  return { ...l, rowKeys: k < l.rowKeys.length ? l.rowKeys.slice(0, k) : [...l.rowKeys, ...Array.from({ length: k - l.rowKeys.length }, () => newRowKey(l.id))] };
};

type PreviewRow = {
  rowKey: string; productId: number; productName: string | null; plannedKg: number;
  bom: { versionNo: string | null; approved: boolean; subBatchKg: number | null; massBasis: string };
  roundsCount: number; metal: boolean; warnings: string[]; blocking: string[];
  processes: Array<{ processGroupId: number; name: string; ccpType: string; warnings: string[];
    rounds: Array<{ seq: number; roundNo: number; equipmentId: number | null; equipmentName: string | null; plannedStart: string | null; plannedEnd: string | null; heatingMin: number | null; inputKg: number | null }> }>;
};
type Preview = { rows: PreviewRow[]; existing: Array<{ batchCode: string; productName: string | null; processName: string | null; equipmentId: number; equipmentName: string | null; start: string; end: string | null }> };
type RowResult = { status: string; batchId: number; batchCode?: string; error?: string };

function ProductPicker({ products, value, onChange }: { products: Array<{ id: number; productName: string; productCode?: string }>; value: number | null; onChange: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full h-11 justify-between font-normal">
          <span className="truncate">{selected ? selected.productName : "제품 선택"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="제품 이름·코드 검색" />
          <CommandList>
            <CommandEmpty>제품이 없습니다.</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem key={p.id} value={`${p.productName} ${p.productCode ?? ""} ${p.id}`} onSelect={() => { onChange(p.id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  {p.productName}
                  {p.productCode && <span className="ml-auto text-xs text-muted-foreground">{p.productCode}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** 배치당 SKU 예상수량 — 제품 id 로 연결된 SKU (이름으로 맞추지 않는다) */
function SkuInputs({ productId, value, onChange }: { productId: number; value: Record<number, string>; onChange: (v: Record<number, string>) => void }) {
  const { data: skus = [] } = trpc.productSku.listByProduct.useQuery({ productId });
  if (!(skus as any[]).length) return <p className="text-xs text-muted-foreground">이 제품에 연결된 SKU가 없습니다.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {(skus as any[]).map((s) => (
        <label key={s.id} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
          <span className="max-w-[140px] truncate" title={s.skuName}>{s.skuName}</span>
          <Input type="number" inputMode="numeric" min={0} className="h-9 w-20" value={value[s.id] ?? ""}
            onChange={(e) => onChange({ ...value, [s.id]: e.target.value })} />
          <span className="text-muted-foreground">{s.salesUnit ?? ""}</span>
        </label>
      ))}
    </div>
  );
}

const TONE: Record<string, string> = {
  todo: "bg-blue-50 text-blue-700 border-blue-200",
  wait: "bg-amber-50 text-amber-800 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  stop: "bg-red-50 text-red-700 border-red-200",
};

export default function TodayProductionWorkbench({ embedded = false }: { embedded?: boolean; [key: string]: any }) {
  const { user } = useAuth();
  const [workDate, setWorkDate] = useState(todayLocal());
  const [dayStartTime, setDayStartTime] = useState("09:00");
  const [defaultMode, setDefaultMode] = useState<Mode>("auto");
  const [excluded, setExcluded] = useState<number[]>([]);
  const [lines, setLines] = useState<Line[]>([emptyLine("auto")]);
  const [showAI, setShowAI] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewKey, setPreviewKey] = useState<string>("");
  const [requestKey, setRequestKey] = useState(newRequestKey());
  const [results, setResults] = useState<Record<string, RowResult>>({});
  const [summary, setSummary] = useState<string>("");

  const { data: rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = useMemo(() => {
    const arr = (rawProducts as any)?.items ?? (Array.isArray(rawProducts) ? rawProducts : []);
    return (arr as any[]).map((p) => ({ id: Number(p.id), productName: String(p.productName), productCode: p.productCode }));
  }, [rawProducts]);
  const nameOf = (id: number | null) => products.find((p) => p.id === id)?.productName ?? "";
  const { data: equipments = [] } = trpc.batch.planEquipments.useQuery();
  const board = trpc.batch.todayBoard.useQuery({ workDate });

  // 배치별 행으로 펼침 — 같은 제품 여러 배치도 한 줄씩
  const expanded = useMemo(() => lines.flatMap((l) => l.rowKeys.map((rowKey, i) => ({ rowKey, line: l, n: i + 1 }))), [lines]);
  const filled = expanded.filter((e) => e.line.productId && parseFloat(e.line.batchKg) > 0);
  const inputKey = JSON.stringify({ workDate, dayStartTime, excluded, rows: filled.map((e) => [e.rowKey, e.line.productId, e.line.batchKg, e.line.startOverride]) });
  const previewStale = !!preview && previewKey !== inputKey;

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  useEffect(() => { setResults({}); setSummary(""); }, [workDate]);

  const previewMut = trpc.batch.previewDay.useMutation({
    onSuccess: (data: any) => { setPreview(data as Preview); setPreviewKey(inputKey); },
    onError: (e: { message: string }) => toast.error(`미리보기 실패: ${e.message}`),
  });
  const createMut = trpc.batch.bulkCreateForDay.useMutation({
    onSuccess: (data: any) => {
      const map: Record<string, RowResult> = {};
      for (const b of data.batches ?? []) if (b.rowKey) map[b.rowKey] = { status: b.status, batchId: b.batchId, batchCode: b.batchCode, error: b.error };
      setResults(map);
      const ok = Object.entries(map).filter(([, r]) => r.status === "created" || r.status === "reused").map(([k]) => k);
      const failed = Object.values(map).filter((r) => r.status === "failed" || r.status === "in_progress").length;
      setSummary(`생성 ${data.createdCount ?? 0}건${data.reusedCount ? ` · 이미 생성 ${data.reusedCount}건` : ""}${failed ? ` · 실패 ${failed}건` : ""}`);
      // 만든 배치는 입력표에서 빼고, 실패한 배치만 남긴다 (같은 요청 키로 다시 보내면 실패 줄만 처리)
      setLines((ls) => {
        const left = ls.map((l) => ({ ...l, rowKeys: l.rowKeys.filter((k) => !ok.includes(k)) })).filter((l) => l.rowKeys.length > 0 && l.productId);
        return left.length ? left : [emptyLine(defaultMode)];
      });
      if (!failed) { setRequestKey(newRequestKey()); setPreview(null); }
      board.refetch();
    },
    onError: (e: { message: string }) => {
      // 응답을 못 받았으면 서버 저장 여부를 모른다 — 같은 요청 키로 다시 보내면 이미 만든 줄은 다시 만들지 않는다
      toast.error(`생성 요청 실패: ${e.message}`, { description: "같은 내용으로 다시 보내면 이미 만든 배치는 다시 만들지 않습니다." });
    },
  });

  const runPreview = () => {
    if (!filled.length) { toast.error("제품과 배치당 kg 을 입력하세요."); return; }
    previewMut.mutate({
      workDate, dayStartTime, excludedEquipmentIds: excluded,
      items: filled.map((e) => ({ rowKey: e.rowKey, productId: e.line.productId!, plannedQuantityKg: parseFloat(e.line.batchKg), startTimeOverride: e.line.startOverride || undefined })),
    });
  };
  const runCreate = () => {
    if (!filled.length) return;
    createMut.mutate({
      requestKey, siteId: (user as any)?.siteId || 1, workDate, dayStartTime, defaultMode, excludedEquipmentIds: excluded,
      items: filled.map((e) => {
        const skuOutputs = Object.entries(e.line.sku).filter(([, q]) => parseInt(q) > 0).map(([skuId, q]) => ({ skuId: Number(skuId), plannedQty: parseInt(q) }));
        return {
          rowKey: e.rowKey, productId: e.line.productId!, plannedQuantityKg: parseFloat(e.line.batchKg), mode: e.line.mode,
          startTimeOverride: e.line.startOverride || undefined, ...(skuOutputs.length ? { skuOutputs } : {}),
        };
      }),
    } as any);
  };

  // AI 입력 — 같은 입력표에 줄로 추가 (같은 제품도 합치지 않는다)
  const onAI = (items: Array<{ productId: number; quantityKg: number; skuOutputs?: Record<number, string> }>) => {
    setLines((ls) => [...ls.filter((l) => l.productId), ...items.map((it) => ({ ...emptyLine(defaultMode), productId: it.productId, batchKg: String(it.quantityKg), sku: it.skuOutputs ?? {} }))]);
    setShowAI(false);
  };

  // 설비별 시간표 (미리보기 + 이미 저장된 오늘 배치)
  const timeline = useMemo(() => {
    if (!preview) return [];
    const m = new Map<string, Array<{ start: string; end: string | null; label: string; saved: boolean }>>();
    for (const x of preview.existing) {
      const k = x.equipmentName ?? `설비 #${x.equipmentId}`;
      m.set(k, [...(m.get(k) ?? []), { start: x.start, end: x.end, label: `${x.productName ?? x.batchCode}`, saved: true }]);
    }
    for (const r of preview.rows) for (const p of r.processes) for (const rd of p.rounds) {
      if (!rd.equipmentName || !rd.plannedStart) continue;
      m.set(rd.equipmentName, [...(m.get(rd.equipmentName) ?? []), { start: rd.plannedStart, end: rd.plannedEnd, label: `${r.productName ?? ""} ${rd.roundNo}회`, saved: false }]);
    }
    return Array.from(m.entries()).map(([eq, slots]) => ({ eq, slots: slots.sort((a, b) => a.start.localeCompare(b.start)) }));
  }, [preview]);

  const totalKg = filled.reduce((s, e) => s + (parseFloat(e.line.batchKg) || 0), 0);
  const blockedCount = preview?.rows.filter((r) => r.blocking.length).length ?? 0;

  const content = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">오늘 생산</h1>
          <p className="text-sm text-muted-foreground">여러 제품·여러 배치를 한 번에 준비하고, 미리보기로 설비·시각을 확인한 뒤 생성합니다.</p>
        </div>
        <Button variant={showAI ? "default" : "outline"} onClick={() => setShowAI((v) => !v)}>
          <Sparkles className="h-4 w-4 mr-1.5" />AI로 입력표 채우기
        </Button>
      </div>

      {showAI && <AIProductionParser onConfirm={onAI as any} onClose={() => setShowAI(false)} />}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">작업일 · 기본값 · 오늘만 바꿀 것</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1"><Label>작업일</Label><Input type="date" className="h-11" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>기본 시작시각</Label><Input type="time" className="h-11" value={dayStartTime} onChange={(e) => setDayStartTime(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>기본 처리방식</Label>
              <Select value={defaultMode} onValueChange={(v) => setDefaultMode(v as Mode)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="auto">자동처리</SelectItem><SelectItem value="manual">수동처리</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          {(equipments as any[]).length > 0 && (
            <div className="space-y-1">
              <Label>오늘 쓰지 않는 설비 <span className="text-xs text-muted-foreground font-normal">(이번 생산에만 적용 — 설비 설정은 바뀌지 않습니다)</span></Label>
              <div className="flex flex-wrap gap-2">
                {(equipments as Array<{ id: number; name: string; processes: string }>).map((e) => {
                  const on = excluded.includes(e.id);
                  return (
                    <button key={e.id} type="button" title={e.processes}
                      onClick={() => setExcluded((x) => (on ? x.filter((i) => i !== e.id) : [...x, e.id]))}
                      className={cn("min-h-11 px-3 rounded-md border text-sm", on ? "bg-red-50 border-red-300 text-red-700 line-through" : "bg-background hover:bg-accent")}>
                      {e.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">입력표</CardTitle>
          <CardDescription>같은 제품을 여러 배치로 만들 때는 '배치 수'를 늘리거나 줄을 더 추가하세요. 줄마다 자동/수동을 고를 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {lines.map((l, idx) => {
            const failed = l.rowKeys.map((k) => results[k]).filter((r) => r && r.status !== "created" && r.status !== "reused");
            return (
              <div key={l.id} className={cn("rounded-lg border p-3 space-y-2", failed.length ? "border-red-300 bg-red-50/40" : "")}>
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-end">
                  <div className="col-span-2 md:col-span-4 space-y-1">
                    <Label className="text-xs">{idx + 1}. 제품</Label>
                    <ProductPicker products={products} value={l.productId} onChange={(id) => update(l.id, { productId: id, sku: {} })} />
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs">배치당 kg</Label>
                    <Input type="number" inputMode="decimal" min={0} step="0.1" className="h-11" value={l.batchKg} onChange={(e) => update(l.id, { batchKg: e.target.value })} />
                  </div>
                  <div className="md:col-span-1 space-y-1">
                    <Label className="text-xs">배치 수</Label>
                    <Input type="number" inputMode="numeric" min={1} max={30} className="h-11" value={l.rowKeys.length}
                      onChange={(e) => setLines((ls) => ls.map((x) => (x.id === l.id ? resize(x, Number(e.target.value)) : x)))} />
                  </div>
                  <div className="md:col-span-1 space-y-1">
                    <Label className="text-xs">총 kg</Label>
                    <div className="h-11 flex items-center text-sm font-medium">{((parseFloat(l.batchKg) || 0) * l.rowKeys.length).toLocaleString()}</div>
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <Label className="text-xs">처리방식</Label>
                    <Select value={l.mode} onValueChange={(v) => update(l.id, { mode: v as Mode })}>
                      <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="auto">자동</SelectItem><SelectItem value="manual">수동</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-1 space-y-1">
                    <Label className="text-xs" title="오늘만 — 설비 작업 시작시각보다 우선">오늘 시작</Label>
                    <Input type="time" className="h-11 px-1" value={l.startOverride} onChange={(e) => update(l.id, { startOverride: e.target.value })} />
                  </div>
                  <div className="md:col-span-1 flex justify-end">
                    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="줄 삭제"
                      onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : [emptyLine(defaultMode)]))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {l.productId && (
                  <details>
                    <summary className="text-xs text-muted-foreground cursor-pointer select-none py-1">배치당 SKU 예상수량</summary>
                    <div className="pt-2"><SkuInputs productId={l.productId} value={l.sku} onChange={(v) => update(l.id, { sku: v })} /></div>
                  </details>
                )}
                {failed.map((r, i) => <p key={i} className="text-xs text-red-700">실패: {r!.error}</p>)}
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-11" onClick={() => setLines((ls) => [...ls, emptyLine(defaultMode)])}><Plus className="h-4 w-4 mr-1" />줄 추가</Button>
            <span className="text-sm text-muted-foreground ml-auto">배치 {filled.length}개 · 총 {totalKg.toLocaleString()} kg</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0 gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">미리보기</CardTitle>
            <CardDescription>실제 생성과 같은 계산입니다. 미리보기만으로는 아무것도 저장되지 않습니다.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={runPreview} disabled={previewMut.isPending || !filled.length}>
              {previewMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}미리보기
            </Button>
            <Button className="h-11" onClick={runCreate} disabled={createMut.isPending || !preview || previewStale || !filled.length}>
              {createMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {Object.keys(results).length && Object.values(results).some((r) => r.status === "failed") ? "실패한 배치 다시 생성" : `배치 ${filled.length}개 생성`}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {summary && <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{summary}</div>}
          {!preview && <p className="text-sm text-muted-foreground">입력표를 채운 뒤 '미리보기'를 누르면 배치별 설비·시각·투입량을 보여 줍니다. 생성은 미리보기 뒤에 할 수 있습니다.</p>}
          {previewStale && <p className="text-sm text-amber-700 flex items-center gap-1"><RefreshCw className="h-4 w-4" />입력이 바뀌었습니다 — 미리보기를 다시 하세요.</p>}
          {preview && !previewStale && blockedCount > 0 && (
            <p className="text-sm text-red-700 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{blockedCount}개 배치는 이대로 생성되지 않습니다 (아래 사유). 나머지는 생성됩니다.</p>
          )}
          {preview && (
            <div className="space-y-2">
              {preview.rows.map((r, i) => (
                <div key={r.rowKey} className={cn("rounded-md border p-2 text-sm", r.blocking.length ? "border-red-300 bg-red-50/40" : "")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{i + 1}. {r.productName ?? nameOf(r.productId)}</span>
                    <span>{r.plannedKg} kg</span>
                    <Badge variant="outline">BOM {r.bom.versionNo ? `v${r.bom.versionNo}` : "없음"}{r.bom.approved ? "" : " (미승인)"}</Badge>
                    <Badge variant="outline">회차 {r.roundsCount}{r.bom.subBatchKg ? ` (1회 ${r.bom.subBatchKg}kg)` : ""}</Badge>
                    {r.bom.massBasis === "basis" && <Badge variant="outline">원물 기준</Badge>}
                    {r.metal && <Badge variant="outline">금속검출 포함</Badge>}
                  </div>
                  {r.blocking.map((b, k) => <p key={k} className="text-xs text-red-700 mt-1">생성 안 됨: {b}</p>)}
                  {r.processes.map((p) => (
                    <div key={p.processGroupId} className="mt-1 text-xs">
                      <span className="font-medium">{p.name}</span>{" "}
                      <span className="text-muted-foreground">
                        {p.rounds.map((rd) => `${rd.equipmentName ?? "설비 없음"} ${rd.plannedStart ?? "--:--"}${rd.inputKg != null ? ` ${rd.inputKg}kg` : ""}`).join(" · ")}
                      </span>
                      {p.warnings.map((w, k) => <p key={k} className="text-amber-700">{w}</p>)}
                    </div>
                  ))}
                  {r.warnings.map((w, k) => <p key={k} className="text-xs text-amber-700 mt-1">{w}</p>)}
                </div>
              ))}
              {timeline.length > 0 && (
                <details open>
                  <summary className="text-sm font-medium cursor-pointer select-none py-1">설비별 시간표</summary>
                  <div className="space-y-1 pt-1">
                    {timeline.map((t) => (
                      <div key={t.eq} className="flex gap-2 text-xs items-start">
                        <span className="w-28 shrink-0 font-medium truncate" title={t.eq}>{t.eq}</span>
                        <div className="flex flex-wrap gap-1">
                          {t.slots.map((s, k) => (
                            <span key={k} className={cn("rounded px-1.5 py-0.5 border", s.saved ? "bg-muted text-muted-foreground" : "bg-blue-50 border-blue-200")}>
                              {s.start}{s.end ? `–${s.end}` : ""} {s.label}{s.saved ? " (저장됨)" : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">{workDate} 배치</CardTitle>
            <CardDescription>서버에 저장된 배치만 보입니다.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="새로고침" onClick={() => board.refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          {!(board.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">이 날짜에 저장된 배치가 없습니다.</p>
          ) : (
            <div className="divide-y">
              {(board.data as any[]).map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <span className="text-muted-foreground w-6 text-right">{b.batchOrder ?? ""}</span>
                  <Link href={`/dashboard/batch/${b.id}`} className="font-medium hover:underline">{b.productName ?? "-"}</Link>
                  <span className="text-xs text-muted-foreground">{b.batchCode}</span>
                  <span className="text-xs">{b.plannedKg ?? "-"} kg{b.actualKg != null ? ` → 실적 ${b.actualKg} kg` : ""}</span>
                  {b.mode && <Badge variant="outline" className="text-xs">{b.mode === "auto" ? "자동" : "수동"}</Badge>}
                  <span className={cn("ml-auto text-xs border rounded px-2 py-1", TONE[b.next.tone])}>{b.next.label}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
