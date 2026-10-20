/**
 * 오늘 생산 작업대 (2026-10-18, PR-B — CEO 설계 '오늘 생산 작업대: 현장 중심 설계 기준')
 *
 * 하루의 여러 제품을 한 입력표로 준비한다. 줄마다 자동/수동.
 *   1) 입력표: 제품 / **하루 총생산량(kg)** / 처리방식 / 오늘만 시작시각 / SKU 예상수량. AI 입력도 같은 표(같은 총량 의미)를 채운다.
 *      한 줄 = 한 생산 건. 증숙·교반·굽기 회차는 BOM 1회 기준량으로 그 생산 건 안에서 자동 계산 — 회차 수만큼 줄·생산 건을 늘리지 않는다.
 *      (2026-10-19 Codex 단지 회귀 F-PROD-01: '배치당 kg × 배치 수' 입력표에서 총량 475kg 이 5건 × 475kg 으로 생성·원료 차감됐다)
 *      PR #593 이전 일괄 생성 화면(DailyBatchCreate)과 같은 흐름: 같은 제품은 다시 고를 수 없고, AI 입력의 같은 제품은 수량을 더한다.
 *      서버도 같은 제품 중복·같은 업무일 재입력을 막는다 (작업자 실수를 프로그램이 막는다).
 *   2) 미리보기: 생산 건별 BOM 버전·회차·공정별 설비·예정시각·예정 투입량 확인. 서버 계산 = 실제 생성과 같은 함수, 저장 없음.
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
import { addDays, planDates, planCreateRequests } from "@/lib/planDays";
import { AlertTriangle, Check, ChevronsUpDown, Eye, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";

type Mode = "auto" | "manual";
interface Line {
  id: string;
  productId: number | null;
  /** 이 제품의 하루 총생산량 (kg) — 회차 수로 곱하지 않는다. unit = batch 면 배치 수 */
  totalKg: string;
  /** kg = 하루 총생산량, batch = 배치 수 (서버가 BOM 1회 기준량으로 kg 계산 — 하루 생산 흐름 2026-10-19) */
  unit: "kg" | "batch";
  /** 요청 키와 함께 이 생산 건은 한 번만 생성 */
  rowKey: string;
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
  return { id, productId: null, totalKg: "", unit: "kg", rowKey: newRowKey(id), mode, startOverride: "", sku: {} };
};

type PreviewRow = {
  rowKey: string; productId: number; productName: string | null; plannedKg: number; batchCount?: number | null;
  bom: { versionNo: string | null; approved: boolean; subBatchKg: number | null; massBasis: string };
  roundsCount: number; metal: boolean; warnings: string[]; blocking: string[];
  processes: Array<{ processGroupId: number; name: string; ccpType: string; warnings: string[];
    rounds: Array<{ seq: number; roundNo: number; equipmentId: number | null; equipmentName: string | null; plannedStart: string | null; plannedEnd: string | null; heatingMin: number | null; inputKg: number | null; tempC?: number | null; pressureBar?: number | null }> }>;
};
type Preview = { rows: PreviewRow[]; existing: Array<{ batchCode: string; productName: string | null; processName: string | null; equipmentId: number; equipmentName: string | null; start: string; end: string | null }> };
type RowResult = { status: string; batchId: number; batchCode?: string; error?: string };

function ProductPicker({ products, value, onChange, used = [] }: { products: Array<{ id: number; productName: string; productCode?: string }>; value: number | null; onChange: (id: number) => void; used?: number[] }) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" data-testid="product-picker" className="w-full h-11 justify-between font-normal">
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
              {products.map((p) => {
                // 다른 줄에서 이미 고른 제품 — 하루 총생산량은 한 줄에 (원래 일괄 생성 화면과 같은 규칙)
                const isUsed = used.includes(p.id) && p.id !== value;
                return (
                <CommandItem key={p.id} value={`${p.productName} ${p.productCode ?? ""} ${p.id}`} disabled={isUsed} onSelect={() => { if (isUsed) return; onChange(p.id); setOpen(false); }}>
                  <Check className={cn("mr-2 h-4 w-4", value === p.id ? "opacity-100" : "opacity-0")} />
                  {p.productName}{isUsed && <span className="ml-1 text-xs text-muted-foreground">(이미 선택됨)</span>}
                  {p.productCode && <span className="ml-auto text-xs text-muted-foreground">{p.productCode}</span>}
                </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * SKU 예상수량 (이 생산 건 전체) — 제품 id 로 연결된 SKU (이름으로 맞추지 않는다)
 * 환산 (이전 일괄 생성 화면 기능 복원, Codex #605 P2): SKU 1단위 kg 으로 '예상 N개' (= 하루 총생산량 ÷ 단위 kg, 버림),
 *   입력한 개수의 kg 합계와 하루 총생산량과의 차이. 계산·저장 방식(skuOutputs)은 그대로.
 */
function SkuInputs({ productId, plannedKg, value, onChange }: { productId: number; plannedKg: number; value: Record<number, string>; onChange: (v: Record<number, string>) => void }) {
  const { data: skus = [] } = trpc.productSku.listByProduct.useQuery({ productId });
  if (!(skus as any[]).length) return <p className="text-xs text-muted-foreground">이 제품에 연결된 SKU가 없습니다.</p>;
  const calcs = (skus as any[]).map((s) => {
    const kgPerUnit = Number(s.kgPerSalesUnit) || 0;
    const qty = parseInt(value[s.id] ?? "") || 0;
    return { ...s, kgPerUnit, qty, estimated: kgPerUnit > 0 && plannedKg > 0 ? Math.floor(plannedKg / kgPerUnit) : null, inputKg: qty * kgPerUnit };
  });
  const totalQty = calcs.reduce((t, c) => t + c.qty, 0);
  const totalKg = calcs.reduce((t, c) => t + c.inputKg, 0);
  const diff = totalKg - plannedKg;
  // 표시 규칙은 이전 일괄 생성 화면 그대로 — 예상 개수 버림(floor), kg 소수 1자리, 차이는 0.01kg 이상일 때
  return (
    <div className="space-y-1" data-testid="sku-inputs">
      <div className="flex flex-wrap gap-2">
        {calcs.map((s) => (
          <label key={s.id} className="flex items-center gap-1 text-xs border rounded px-2 py-1">
            <span className="max-w-[140px] truncate" title={s.skuName}>{s.skuName}</span>
            {s.kgPerUnit > 0 && <span className="text-muted-foreground">({s.kgPerUnit}kg/{s.salesUnit ?? "개"})</span>}
            {s.estimated != null && s.estimated > 0 && <span className="text-blue-700">예상 {s.estimated}{s.salesUnit ?? ""}</span>}
            <Input type="number" inputMode="numeric" min={0} className="h-9 w-20" value={value[s.id] ?? ""}
              placeholder={s.estimated != null && s.estimated > 0 ? String(s.estimated) : "0"}
              onChange={(e) => onChange({ ...value, [s.id]: e.target.value })} />
            <span className="text-muted-foreground">{s.salesUnit ?? ""}</span>
            {s.qty > 0 && s.kgPerUnit > 0 && <span className="text-emerald-700">= {s.inputKg.toFixed(1)}kg</span>}
          </label>
        ))}
      </div>
      {totalQty > 0 && (
        <p className="text-xs" data-testid="sku-total">
          SKU 합계 <b>{totalQty.toLocaleString()}</b>개 · <b className="text-emerald-700">{totalKg.toFixed(1)}kg</b>
          {plannedKg > 0 && Math.abs(diff) >= 0.01 && <span className="ml-1 text-amber-700">(하루 총생산량 {plannedKg}kg 과 차이 {diff > 0 ? "+" : ""}{diff.toFixed(1)}kg)</span>}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">예상 개수는 하루 총생산량을 각 규격으로 바꿨을 때의 참고값입니다 (규격마다 따로 — 합치는 값이 아님).</p>
    </div>
  );
}

const TONE: Record<string, string> = {
  todo: "bg-blue-50 text-blue-700 border-blue-200",
  wait: "bg-amber-50 text-amber-800 border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  stop: "bg-red-50 text-red-700 border-red-200",
};

/**
 * 생산 화면 안에 넣을 때 (2026-10-20, 생산 화면 하나로): 작업일은 생산 화면의 날짜(workDate), 아래 '배치 목록'은 생산 화면 목록이 대신(hideBoard),
 *   만들면 onCreated 로 목록을 다시 읽는다. 미리보기는 입력이 바뀌면 자동 — [생성] 한 번으로 끝난다 (미리보기 버튼을 따로 누르지 않음).
 */
export default function TodayProductionWorkbench({ embedded = false, workDate: workDateProp, onCreated, hideBoard = false }: { embedded?: boolean; workDate?: string; onCreated?: () => void; hideBoard?: boolean; [key: string]: any }) {
  const { user } = useAuth();
  const [workDateState, setWorkDate] = useState(workDateProp ?? todayLocal());
  const workDate = workDateProp ?? workDateState;
  // 여러 날 (같은 입력표를 날마다) — 1·7·14일, 뺄 날은 날짜를 눌러 끈다
  const [days, setDays] = useState<1 | 7 | 14>(1);
  const [offDates, setOffDates] = useState<string[]>([]);
  const [dayResults, setDayResults] = useState<Record<string, string>>({});
  const [otherDays, setOtherDays] = useState<Record<string, { blocked: number; reasons: string[] }>>({});
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

  // 한 줄 = 한 생산 건 (회차는 그 안에서)
  const filled = useMemo(() => lines.filter((l) => l.productId && parseFloat(l.totalKg) > 0).map((l) => ({ rowKey: l.rowKey, line: l })), [lines]);
  // 같은 제품이 다른 줄에도 있는 줄 — 생성 전에 고치게 한다 (제품 선택에서 막지만 AI·이전 상태 대비, 서버도 막음)
  const dupLineIds = useMemo(() => {
    const seen = new Set<number>();
    const out = new Set<string>();
    for (const l of lines) {
      if (!l.productId) continue;
      if (seen.has(l.productId)) out.add(l.id);
      seen.add(l.productId);
    }
    return out;
  }, [lines]);
  const allDates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(workDate, i)), [workDate, days]);
  // 생성·미리보기는 선택한 날짜로만 — 하나여도 그 날짜(기준일 아님), 0개면 만들지 않는다 (#611 추가 검토 P1)
  const dates = planDates(workDate, days, offDates);
  const firstDate = dates[0] ?? null;
  const inputKey = JSON.stringify({ workDate, dates, dayStartTime, excluded, rows: filled.map((e) => [e.rowKey, e.line.productId, e.line.totalKg, e.line.unit, e.line.startOverride]) });
  const previewStale = !!preview && previewKey !== inputKey;

  const update = (id: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  useEffect(() => { setResults({}); setSummary(""); setDayResults({}); }, [workDate, days]);
  const utils = trpc.useUtils();

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
      // 만든 생산 건은 입력표에서 빼고, 실패한 줄만 남긴다 (같은 요청 키로 다시 보내면 실패 줄만 처리)
      setLines((ls) => {
        const left = ls.filter((l) => !ok.includes(l.rowKey) && l.productId);
        return left.length ? left : [emptyLine(defaultMode)];
      });
      if (!failed) { setRequestKey(newRequestKey()); setPreview(null); }
      board.refetch();
      onCreated?.();
    },
    onError: (e: { message: string }) => {
      // 응답을 못 받았으면 서버 저장 여부를 모른다 — 같은 요청 키로 다시 보내면 이미 만든 줄은 다시 만들지 않는다
      toast.error(`생성 요청 실패: ${e.message}`, { description: "같은 내용으로 다시 보내면 이미 만든 배치는 다시 만들지 않습니다." });
    },
  });

  const runPreview = () => {
    if (!filled.length) { toast.error("제품과 하루 총생산량(kg)을 입력하세요."); return; }
    if (!firstDate) { toast.error("만들 날짜가 없습니다 — 날짜를 하나 이상 남기세요."); return; }
    previewMut.mutate({
      workDate: firstDate, dayStartTime, excludedEquipmentIds: excluded,
      items: previewItems(),
    });
    // 다른 날 — 막히는 줄만 모아 보여 준다 (같은 서버 계산)
    setOtherDays({});
    for (const d of dates.slice(1)) {
      utils.client.batch.previewDay.mutate({ workDate: d, dayStartTime, excludedEquipmentIds: excluded, items: previewItems() })
        .then((r: any) => setOtherDays((o) => ({ ...o, [d]: { blocked: r.rows.filter((x: any) => x.blocking.length).length, reasons: r.rows.flatMap((x: any) => x.blocking.map((b: string) => `${x.productName ?? ""}: ${b}`)).slice(0, 3) } })))
        .catch((e: any) => setOtherDays((o) => ({ ...o, [d]: { blocked: -1, reasons: [e?.message ?? "미리보기 실패"] } })));
    }
  };
  // kg 또는 배치 수 — 배치 수는 서버가 BOM 1회 기준량으로 kg 계산
  const qtyOf = (l: Line) => (l.unit === "batch" ? { batchCount: Math.floor(parseFloat(l.totalKg)) } : { plannedQuantityKg: parseFloat(l.totalKg) });
  const previewItems = () => filled.map((e) => ({ rowKey: e.rowKey, productId: e.line.productId!, ...qtyOf(e.line), startTimeOverride: e.line.startOverride || undefined }));
  const createItems = () => filled.map((e) => {
    const skuOutputs = Object.entries(e.line.sku).filter(([, q]) => parseInt(q) > 0).map(([skuId, q]) => ({ skuId: Number(skuId), plannedQty: parseInt(q) }));
    return {
      rowKey: e.rowKey, productId: e.line.productId!, ...qtyOf(e.line), mode: e.line.mode,
      startTimeOverride: e.line.startOverride || undefined, ...(skuOutputs.length ? { skuOutputs } : {}),
    };
  });
  const [multiBusy, setMultiBusy] = useState(false);
  const runCreate = async () => {
    if (!filled.length) return;
    if (dupLineIds.size) { toast.error("같은 제품이 여러 줄입니다 — 하루 총생산량을 한 줄에 입력하세요."); return; }
    const reqs = planCreateRequests(requestKey, dates);
    if (!reqs.length) { toast.error("만들 날짜가 없습니다 — 날짜를 하나 이상 남기세요."); return; }
    if (reqs.length === 1) {
      // 날짜 하나 — 그 날짜로 (기준일이 아니라 선택한 날). 요청 키는 여러 날과 같은 규칙(날짜별)
      createMut.mutate({ requestKey: reqs[0].requestKey, siteId: (user as any)?.siteId || 1, workDate: reqs[0].workDate, dayStartTime, defaultMode, excludedEquipmentIds: excluded, items: createItems() } as any);
      return;
    }
    // 여러 날 — 날마다 따로 (날짜별 요청 키: 다시 보내도 이미 만든 날·줄은 다시 만들지 않는다)
    setMultiBusy(true);
    const out: Record<string, string> = {};
    let allOk = true;
    for (const { workDate: d, requestKey: dayKey } of reqs) {
      try {
        const r: any = await utils.client.batch.bulkCreateForDay.mutate({ requestKey: dayKey, siteId: (user as any)?.siteId || 1, workDate: d, dayStartTime, defaultMode, excludedEquipmentIds: excluded, items: createItems() } as any);
        const failed = (r.batches ?? []).filter((b: any) => b.status === "failed" || b.status === "in_progress");
        if (failed.length) allOk = false;
        out[d] = `생성 ${r.createdCount ?? 0}${r.reusedCount ? ` · 이미 ${r.reusedCount}` : ""}${failed.length ? ` · 실패 ${failed.length} (${failed[0].error ?? ""})` : ""}`;
      } catch (e: any) {
        allOk = false;
        out[d] = `저장 안 됨 — ${e?.message ?? "통신 오류"} (다시 누르면 이 날만 이어서)`;
      }
      setDayResults({ ...out });
    }
    setMultiBusy(false);
    board.refetch();
    onCreated?.();
    if (allOk) { toast.success(`${dates.length}일 생성을 마쳤습니다.`); setRequestKey(newRequestKey()); setPreview(null); setLines([emptyLine(defaultMode)]); }
    else toast.error("일부 날짜가 저장되지 않았습니다 — 같은 내용으로 다시 누르면 남은 것만 만듭니다.");
  };

  // 입력이 바뀌면 잠시 뒤 자동 미리보기 (읽기만) — [미리보기] 를 따로 누르지 않아도 [생성] 이 바로 열린다
  useEffect(() => {
    if (!filled.length || !dates.length || dupLineIds.size) return;
    const t = setTimeout(() => { if (!previewMut.isPending) runPreview(); }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  // AI 입력 — 같은 의미(하루 총생산량). 같은 제품은 수량을 더해 한 줄로 (원래 일괄 생성 화면과 같게)
  const onAI = (items: Array<{ productId: number; quantityKg: number; skuOutputs?: Record<number, string> }>) => {
    setLines((ls) => {
      const merged = ls.filter((l) => l.productId).map((l) => ({ ...l }));
      for (const it of items) {
        const ex = merged.find((m) => m.productId === it.productId);
        if (ex) ex.totalKg = String((parseFloat(ex.totalKg) || 0) + (Number(it.quantityKg) || 0));
        else merged.push({ ...emptyLine(defaultMode), productId: it.productId, totalKg: String(it.quantityKg), sku: it.skuOutputs ?? {} });
      }
      return merged.length ? merged : [emptyLine(defaultMode)];
    });
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

  const totalKg = filled.filter((e) => e.line.unit === "kg").reduce((s, e) => s + (parseFloat(e.line.totalKg) || 0), 0);
  const batchLines = filled.filter((e) => e.line.unit === "batch").length;
  const blockedCount = preview?.rows.filter((r) => r.blocking.length).length ?? 0;

  // 줄마다 계산 결과 한 줄 — 회차·설비·시각 (자세한 회차·시간표는 '예외·자세히' 안에)
  const summaryOf = (r: PreviewRow) => {
    const rounds = r.processes.flatMap((p) => p.rounds);
    const eqs = Array.from(new Set(rounds.map((x) => x.equipmentName).filter(Boolean)));
    const starts = rounds.map((x) => x.plannedStart).filter(Boolean).sort() as string[];
    const ends = rounds.map((x) => x.plannedEnd).filter(Boolean).sort() as string[];
    return [`${r.plannedKg}kg${r.batchCount ? ` (${r.batchCount}배치)` : ""}`, `${r.roundsCount}회`, eqs.length ? eqs.join("·") : r.metal ? "금속검출만" : null,
      starts.length ? `${starts[0]}${ends.length ? `~${ends[ends.length - 1]}` : ""}` : null].filter(Boolean).join(" · ");
  };
  const previewOf = (l: Line) => (preview && !previewStale ? preview.rows.find((r) => r.rowKey === l.rowKey) ?? null : null);
  const exceptionCount = (days > 1 ? 1 : 0) + (excluded.length ? 1 : 0) + (defaultMode !== "auto" ? 1 : 0) + (dayStartTime !== "09:00" ? 1 : 0)
    + lines.filter((l) => l.mode !== defaultMode || l.startOverride || Object.values(l.sku).some((q) => parseInt(q) > 0)).length;

  /*
   * 계획 입력 = 제품과 수량(kg 또는 배치 수)만 (2026-10-20, 대표: 정상 생산에서 사용자가 해야 하는 일을 먼저 없앤다).
   *   설비·운전 방식·시각은 저장된 공장 설정으로 자동 — 예외일 때만 '예외' 를 열어 이번 생산만 바꾼다.
   *   입력하면 자동 계산(미리보기와 같은 서버 계산)이 줄 아래 한 줄로 — 확인하고 [생성]. 막히는 줄은 그 자리에 이유.
   */
  const content = (
    <div className="space-y-3">
      {!embedded && <h1 className="text-2xl font-bold">생산 계획</h1>}
      <div className="space-y-2">
        {lines.map((l, idx) => {
          const res = results[l.rowKey];
          const failed = res && res.status !== "created" && res.status !== "reused" ? res : null;
          const done = res && (res.status === "created" || res.status === "reused") ? res : null;
          const dup = dupLineIds.has(l.id);
          const pv = previewOf(l);
          return (
            <div key={l.id} className={cn("rounded-lg border p-2 space-y-1", failed || dup || pv?.blocking.length ? "border-red-300 bg-red-50/40 dark:bg-red-500/5" : "")} data-testid="plan-line">
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[200px] flex-1">
                  <ProductPicker products={products} value={l.productId} used={lines.map((x) => x.productId).filter((x): x is number => !!x)} onChange={(id) => update(l.id, { productId: id, sku: {} })} />
                </div>
                <Input type="number" inputMode="decimal" min={0} step={l.unit === "batch" ? "1" : "0.1"} className="h-11 w-28" data-testid="total-kg"
                  placeholder={l.unit === "batch" ? "배치 수" : "kg"} aria-label={l.unit === "batch" ? "배치 수 (BOM 1회 기준량)" : "하루 총생산량 (kg)"}
                  value={l.totalKg} onChange={(e) => update(l.id, { totalKg: e.target.value })} />
                <Select value={l.unit} onValueChange={(v) => update(l.id, { unit: v as "kg" | "batch" })}>
                  <SelectTrigger className="h-11 w-20 shrink-0" data-testid="qty-unit"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="kg">kg</SelectItem><SelectItem value="batch">배치</SelectItem></SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="줄 삭제"
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((x) => x.id !== l.id) : [emptyLine(defaultMode)]))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              {/* 자동 계산 결과 / 막힌 이유 / 생성 결과 — 같은 줄 아래 */}
              {pv && !pv.blocking.length && !done && <p className="text-xs text-muted-foreground" data-testid="plan-summary">{summaryOf(pv)}{pv.warnings.length || pv.processes.some((p) => p.warnings.length) ? " · 확인할 점 있음 (예외·자세히)" : ""}</p>}
              {pv?.blocking.map((b, k) => <p key={k} className="text-xs text-red-700">만들 수 없음: {b}</p>)}
              {dup && <p className="text-xs text-red-700">같은 제품이 다른 줄에도 있습니다 — 하루 총생산량은 한 줄에 입력하세요.</p>}
              {failed && <p className="text-xs text-red-700">저장 안 됨: {failed.error} — 고친 뒤 [생성]을 다시 누르면 이 줄만 이어서 만듭니다.</p>}
              {done && <p className="text-xs text-emerald-700">만들었습니다{done.batchCode ? ` (${done.batchCode})` : ""}.</p>}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="h-11" onClick={() => setLines((ls) => [...ls, emptyLine(defaultMode)])}><Plus className="h-4 w-4 mr-1" />제품 추가</Button>
          {previewMut.isPending && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />계산 중</span>}
          <Button className="h-11 ml-auto" onClick={runCreate} data-testid="plan-create"
            disabled={createMut.isPending || multiBusy || !preview || previewStale || !filled.length || !dates.length || dupLineIds.size > 0 || (!!preview && blockedCount >= preview.rows.length)}>
            {createMut.isPending || multiBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
            {Object.values(results).some((r) => r.status === "failed") ? "남은 줄 다시 생성" : dates.length > 1 ? `${dates.length}일 × ${filled.length}건 생성` : `${filled.length || ""}건 생성`}
          </Button>
        </div>
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        {Object.keys(dayResults).length > 0 && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-0.5" data-testid="day-results">
            {Object.entries(dayResults).map(([d, t]) => <p key={d} className={t.startsWith("저장 안 됨") ? "text-red-700" : ""}>{d}: {t}</p>)}
          </div>
        )}
      </div>

      {/* 예외일 때만 — 이번 생산만 바꾸는 것 (공장 설정은 그대로). 자세한 회차·설비 시간표도 여기 */}
      <details className="rounded-md border" data-testid="plan-exceptions" open={exceptionCount > 0 || undefined}>
        <summary className="px-3 py-2 text-sm cursor-pointer select-none">예외·자세히 <span className="text-muted-foreground">— 여러 날 · 시작시각 · 처리방식 · 오늘 못 쓰는 설비 · SKU · AI 입력 · 회차별 시간표{exceptionCount ? ` (바꾼 것 ${exceptionCount})` : ""}</span></summary>
        <div className="border-t p-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1"><Label>작업일</Label>{workDateProp
              ? <div className="h-11 flex items-center px-3 rounded-md border bg-muted/40 text-sm" data-testid="work-date-fixed">{workDate}</div>
              : <Input type="date" className="h-11" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />}
              {/* 미래 날짜 = 예정 (현장 1) — 서버가 같은 기준(오늘 KST)으로 판단한다 */}
              {workDate >= todayLocal() && <p className="text-xs text-blue-800" data-testid="plan-only-note">예정으로 만듭니다 — 원료는 현장에서 처음 확인할 때 (금속검출만 하는 제품은 통과 시작 때) 한 번 출고</p>}
            </div>
            <div className="space-y-1">
              <Label>며칠</Label>
              <Select value={String(days)} onValueChange={(v) => { setDays(Number(v) as 1 | 7 | 14); setOffDates([]); }}>
                <SelectTrigger className="h-11" data-testid="days"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="1">하루</SelectItem><SelectItem value="7">7일</SelectItem><SelectItem value="14">14일</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>설비 시작이 없을 때 시작시각</Label><Input type="time" className="h-11" value={dayStartTime} onChange={(e) => setDayStartTime(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>기본 처리방식</Label>
              <Select value={defaultMode} onValueChange={(v) => setDefaultMode(v as Mode)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="auto">자동처리</SelectItem><SelectItem value="manual">수동처리</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          {days > 1 && (
            <div className="flex flex-wrap gap-1.5" data-testid="date-chips">
              {allDates.map((d) => {
                const off = offDates.includes(d);
                return (
                  <button key={d} type="button" onClick={() => setOffDates((x) => (off ? x.filter((y) => y !== d) : [...x, d]))}
                    className={cn("min-h-10 px-2.5 rounded-md border text-xs", off ? "bg-muted text-muted-foreground line-through" : "bg-blue-50 border-blue-200")}>
                    {d.slice(5)}({"일월화수목금토"[new Date(`${d}T00:00:00`).getDay()]})
                  </button>
                );
              })}
              <span className="text-xs text-muted-foreground self-center">누르면 그날은 빼기 · {dates.length}일 만듦</span>
            </div>
          )}
          {(equipments as any[]).length > 0 && (
            // 설비는 공장 설정대로 자동 배정 — 고장·정비로 오늘 못 쓰는 설비만 뺀다 (설비 설정은 바뀌지 않음)
            <div className="space-y-1">
              <p className="text-sm">오늘 못 쓰는 설비{excluded.length ? ` — ${excluded.length}대 제외 중` : ""}</p>
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
          {/* 줄마다 이번만 바꿀 것 — 처리방식 · 시작시각 · SKU 예상수량 */}
          {lines.filter((l) => l.productId).map((l) => (
            <div key={l.id} className="rounded-md border p-2 space-y-2 text-sm">
              <div className="flex flex-wrap items-end gap-2">
                <span className="font-medium mr-2">{nameOf(l.productId)}</span>
                <label className="text-xs space-y-0.5"><span className="block text-muted-foreground">처리방식</span>
                  <Select value={l.mode} onValueChange={(v) => update(l.id, { mode: v as Mode })}>
                    <SelectTrigger className="h-10 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="auto">자동</SelectItem><SelectItem value="manual">수동</SelectItem></SelectContent>
                  </Select>
                </label>
                <label className="text-xs space-y-0.5" title="오늘만 — 설비 작업 시작시각보다 우선"><span className="block text-muted-foreground">오늘만 시작시각</span>
                  <Input type="time" className="h-10 w-32" value={l.startOverride} onChange={(e) => update(l.id, { startOverride: e.target.value })} />
                </label>
              </div>
              <details>
                <summary className="text-xs text-muted-foreground cursor-pointer select-none py-1">SKU 예상수량 (이 생산 건 전체)</summary>
                <div className="pt-2">{l.productId && <SkuInputs productId={l.productId} plannedKg={l.unit === "batch" ? (preview?.rows.find((r) => r.rowKey === l.rowKey)?.plannedKg ?? 0) : (Number(l.totalKg) || 0)} value={l.sku} onChange={(v) => update(l.id, { sku: v })} />}</div>
              </details>
            </div>
          ))}
          <div>
            <Button variant={showAI ? "default" : "outline"} size="sm" onClick={() => setShowAI((v) => !v)}><Sparkles className="h-4 w-4 mr-1.5" />AI로 입력표 채우기</Button>
            {showAI && <div className="mt-2"><AIProductionParser onConfirm={onAI as any} onClose={() => setShowAI(false)} /></div>}
          </div>
          {preview && !previewStale && dates.length > 1 && (
            <div className="text-xs space-y-0.5" data-testid="other-days">
              <p className="text-muted-foreground">아래 자세한 계산은 {firstDate}. 다른 날:</p>
              {dates.slice(1).map((d) => {
                const o = otherDays[d];
                return <p key={d} className={o && o.blocked !== 0 ? "text-red-700" : ""}>{d}: {!o ? "확인 중…" : o.blocked === 0 ? "모두 생성됨" : o.blocked < 0 ? o.reasons[0] : `${o.blocked}개 막힘 — ${o.reasons.join(" / ")}`}</p>;
              })}
            </div>
          )}
          {preview && !previewStale && preview.rows.map((r, i) => (
            <div key={r.rowKey} className="text-xs">
              <span className="font-medium">{i + 1}. {r.productName ?? nameOf(r.productId)}</span>{" "}
              <span className="text-muted-foreground">BOM {r.bom.versionNo ? `v${r.bom.versionNo}` : "없음"}{r.bom.approved ? "" : " (미승인)"} · 1회 {r.bom.subBatchKg ?? "-"}kg{r.bom.massBasis === "basis" ? " · 원물 기준" : ""}</span>
              {r.processes.map((p) => (
                <div key={p.processGroupId} className="ml-3">
                  <span>{p.name}</span>{" "}
                  <span className="text-muted-foreground">{p.rounds.map((rd) => `${rd.equipmentName ?? "설비 없음"} ${rd.plannedStart ?? "--:--"}${rd.inputKg != null ? ` ${rd.inputKg}kg` : ""}`).join(" · ")}</span>
                  {/* 운영 기본값 — 설비·공정 설정에서 계산된 값 (현장은 다를 때만 고친다) */}
                  {(() => {
                    const r0 = p.rounds.find((rd) => rd.tempC != null || rd.pressureBar != null || rd.heatingMin != null);
                    if (!r0) return null;
                    return <p className="text-muted-foreground">기본값: {[r0.tempC != null ? `${r0.tempC}℃` : null, r0.pressureBar != null ? `${r0.pressureBar} bar` : null, r0.heatingMin != null ? `가열 ${r0.heatingMin}분` : null].filter(Boolean).join(" · ")}</p>;
                  })()}
                  {p.warnings.map((w, k) => <p key={k} className="text-amber-700">{w}</p>)}
                </div>
              ))}
              {r.warnings.map((w, k) => <p key={k} className="text-amber-700 ml-3">{w}</p>)}
            </div>
          ))}
          {timeline.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">설비별 시간표</p>
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
          )}
        </div>
      </details>

      {!hideBoard && (
        <div className="rounded-md border p-3">
          <p className="text-sm font-medium mb-1">{workDate} 배치</p>
          {!(board.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">이 날짜에 저장된 배치가 없습니다.</p>
          ) : (
            <div className="divide-y">
              {(board.data as any[]).map((b) => (
                <div key={b.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <Link href={`/dashboard/batch/${b.id}`} className="font-medium hover:underline">{b.productName ?? "-"}</Link>
                  <span className="text-xs text-muted-foreground">{b.batchCode}</span>
                  <span className="text-xs">{b.plannedKg ?? "-"} kg{b.actualKg != null ? ` → 실적 ${b.actualKg} kg` : ""}</span>
                  <span className={cn("ml-auto text-xs border rounded px-2 py-1", TONE[b.next.tone])}>{b.next.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}
