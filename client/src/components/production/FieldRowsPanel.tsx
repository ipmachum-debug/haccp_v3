/**
 * 현장 확인 행 — 생산 화면 안에서 그 자리에서 확인·고치기 (2026-10-20, 생산 화면 하나로)
 *
 * 원래 '현장 확인' 화면(FieldWork)의 행 부분을 그대로 옮겼다. 생산 화면의 생산 건 줄을 펼치면 그 생산 건의 행이,
 * '내 설비' 보기에서는 내 설비의 행이 이 부품으로 보인다. 동작은 같다 (2026-10-19 CEO 확정 정책):
 *   평상값이 맞으면 [확인]. 다르면 [고치기] → 그 자리에서 고친 값으로 확인. 확인한 시각 = CCP 확인 시각.
 *   금속검출: [통과 시작]·[통과 종료](종료 = 확인), 감도점검 [확인]·[감도점검 추가].
 *   원료는 예정 생산 건의 첫 확인에서 한 번 — 서버가 정한다 (별도 '생산 시작' 없음).
 *   저장에 실패하면 그 줄에 '저장 안 됨' — [다시 보내기]는 같은 요청 키라 두 번 기록되지 않는다.
 *   확인 뒤 고치면 그 확인은 무효 — 다시 확인해야 한다.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus } from "lucide-react";

export type FieldRow = any;
/**
 * 행 쓰기 상태 — saving(보내는 중) · failed(통신 실패: 저장됐는지 모름 → 같은 요청 키·같은 내용으로만 다시 보내기)
 *   · rejected(서버가 확실히 거부: 저장 안 됨 → 이유를 보이고 그 자리 편집기로 고쳐 새 요청으로) — 2026-10-20 #611 추가 검토
 */
export type Pending = { requestId: string; action: string; values?: Record<string, any>; expectedRowVersion: number; state: "saving" | "failed" | "rejected"; message?: string };

/**
 * 행 쓰기 상태를 화면 전체에서 하나로 (2026-10-20 생산 화면 하나로 — Codex 기존 로직 보존 점검 4).
 *   생산 건 줄을 접거나 '전체/내 설비' 보기를 바꿔 이 부품이 사라졌다 다시 나와도 '저장 안 됨(같은 요청 키로 다시 보내기)'·
 *   '확인 안 됨(그 자리에서 고치기)'·고치던 값이 남는다. 공급자가 없으면 부품 안에서만 기억한다.
 */
type Store = {
  pending: Record<number, Pending>; setPending: React.Dispatch<React.SetStateAction<Record<number, Pending>>>;
  editing: Record<number, Record<string, any>>; setEditing: React.Dispatch<React.SetStateAction<Record<number, Record<string, any>>>>;
};
const FieldWriteContext = createContext<Store | null>(null);
export function FieldWriteProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Record<number, Pending>>({});
  const [editing, setEditing] = useState<Record<number, Record<string, any>>>({});
  return <FieldWriteContext.Provider value={{ pending, setPending, editing, setEditing }}>{children}</FieldWriteContext.Provider>;
}
/** 화면 전체의 행 쓰기 상태 — 줄 머리에 '저장 안 됨' 을 보이는 데 쓴다 */
export const useFieldWriteState = () => useContext(FieldWriteContext);

const rid = () => `fw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const HEAT_FIELDS: Array<{ key: string; label: string; unit: string }> = [
  { key: "heatTimeMin", label: "가열", unit: "분" },
  { key: "heatTempC", label: "온도", unit: "℃" },
  { key: "pressureMpa", label: "압력", unit: "MPa" },
  { key: "tempCenterC", label: "중심 품온", unit: "℃" },
  { key: "tempEdgeC", label: "모서리 품온", unit: "℃" },
  { key: "inputQtyKg", label: "투입", unit: "kg" },
];
const SENS_FIELDS: Array<{ key: string; label: string }> = [
  { key: "metalFeMid", label: "Fe 단독" }, { key: "metalSusMid", label: "SUS 단독" }, { key: "metalProductOnly", label: "제품 단독" },
  { key: "metalFeProduct", label: "Fe+제품" }, { key: "metalSusProduct", label: "SUS+제품" },
];

/** 행 종류별 고칠 칸 */
const editKeys = (r: FieldRow) => (r.kind === "heat" ? HEAT_FIELDS.map((f) => f.key) : r.kind === "passage" ? ["passQty", "detectedQty"] : SENS_FIELDS.map((f) => f.key));
/** 편집기 처음 값 — 지금 값, 거부된 요청이 보낸 값이 있으면 그 값 위에 (방금 입력을 잃지 않게) */
function editInit(r: FieldRow, sent?: Record<string, any>): Record<string, any> {
  const init: Record<string, any> = { result: r.values?.result ?? "적합", deviationNote: r.values?.deviationNote ?? "", correctiveAction: r.values?.correctiveAction ?? "" };
  for (const k of editKeys(r)) init[k] = r.values?.[k] ?? null;
  return { ...init, ...(sent ?? {}) };
}

export interface FieldRowsPanelProps {
  heat: FieldRow[];
  metal?: { formRecordId: number; rows: FieldRow[] } | null;
  sheets?: any[];
  /** 가열 행 위 제목을 숨김 (생산 건 줄 안에서) */
  bare?: boolean;
  /** 저장 뒤 다시 읽을 것 (생산 화면 목록 등) */
  onChanged?: () => void;
  /**
   * 지난 날짜 기록 (2026-10-20) — [확인] 이 누른 시각을 쓰지 않고, 실제 시각(종이 기록 등)을 넣는 칸을 그 자리에서 연다.
   *   예정 시각을 미리 채우지 않는다 (계획값을 실측으로 인정하지 않음). 서버도 같은 규칙으로 막는다.
   */
  pastDate?: boolean;
}

/** 지난 날짜 기록에서 사람이 넣는 실제 시각 칸 */
const timeFieldsOf = (r: FieldRow): Array<{ key: string; label: string }> =>
  r.kind === "heat" ? [{ key: "measurementTime", label: "측정 시각" }]
    : r.kind === "passage" ? [{ key: "passTimeStart", label: "통과 시작" }, { key: "passTimeEnd", label: "통과 종료" }]
    : [{ key: "metalPassTime", label: "점검 시각" }];

export default function FieldRowsPanel({ heat, metal = null, sheets = [], bare = false, onChanged, pastDate = false }: FieldRowsPanelProps) {
  const utils = trpc.useUtils();
  const write = trpc.field.write.useMutation();
  const addSens = trpc.field.addSensitivity.useMutation();
  const submit = trpc.ccpForm.submit.useMutation();
  const shared = useContext(FieldWriteContext);
  const [localPending, setLocalPending] = useState<Record<number, Pending>>({});
  const [localEditing, setLocalEditing] = useState<Record<number, Record<string, any>>>({});
  const pending = shared?.pending ?? localPending;
  const setPending = shared?.setPending ?? setLocalPending;
  const editing = shared?.editing ?? localEditing;
  const setEditing = shared?.setEditing ?? setLocalEditing;
  const refresh = async () => { await utils.field.work.invalidate(); onChanged?.(); };

  /**
   * 한 행 쓰기 — 실패하면 같은 요청 키로 다시 보낼 수 있게 남긴다.
   *   다시 보낼 때는 처음 요청 그대로 (요청 키·동작·값·행 버전) — 그 사이 화면이 새 버전을 받아도 버전을 올려 붙이지 않는다.
   *   다른 사람이 먼저 바꿨으면 서버가 충돌로 막고 새 값을 보여 준다 (예전 값으로 덮어쓰지 않음, #612 추가 검토 1).
   */
  const send = async (row: FieldRow, action: string, values?: Record<string, any>, retry?: Pending) => {
    const requestId = retry?.requestId ?? rid();
    const expectedRowVersion = retry ? retry.expectedRowVersion : row.rowVersion;
    setPending((p) => ({ ...p, [row.rowId]: { requestId, action, values, expectedRowVersion, state: "saving" } }));
    try {
      await write.mutateAsync({ rowId: row.rowId, action: action as any, expectedRowVersion, values, requestId });
      setPending((p) => { const n = { ...p }; delete n[row.rowId]; return n; });
      setEditing((e) => { const n = { ...e }; delete n[row.rowId]; return n; });
      await refresh();
    } catch (e: any) {
      const code = e?.data?.code;
      if (code === "CONFLICT") {
        // 다른 사람이 먼저 바꿈 — 새 값을 보여 주고 다시 누르게
        setPending((p) => { const n = { ...p }; delete n[row.rowId]; return n; });
        toast.error(e.message);
        await refresh();
        return;
      }
      if (code === "PRECONDITION_FAILED" || code === "BAD_REQUEST") {
        // 서버가 확실히 거부 (필수값·한계기준·원료 출고 실패 등) — 저장 안 됨. 이유를 보이고, 값 문제면 그 자리에서 고치게 편집기를 연다
        setPending((p) => ({ ...p, [row.rowId]: { requestId: rid(), action, values, expectedRowVersion, state: "rejected", message: e.message } }));
        if (action !== "pass_start") setEditing((x) => (x[row.rowId] ? x : { ...x, [row.rowId]: editInit(row, values) }));
        return;
      }
      // 통신 실패 — 서버 저장 여부를 모른다. 같은 요청 키로 다시 보내면 두 번 기록되지 않는다
      setPending((p) => ({ ...p, [row.rowId]: { requestId, action, values, expectedRowVersion, state: "failed", message: "통신 실패" } }));
    }
  };

  const metalByProduct = useMemo(() => {
    const m = new Map<string, FieldRow[]>();
    for (const r of metal?.rows ?? []) m.set(r.productName ?? "-", [...(m.get(r.productName ?? "-") ?? []), r]);
    return Array.from(m.entries());
  }, [metal]);

  /** 보내는 중이거나 저장 여부를 모르는 행 — 다른 동작을 막는다 (거부된 행은 막지 않음: 고쳐서 다시) */
  const busy = (r: FieldRow) => pending[r.rowId]?.state === "saving" || pending[r.rowId]?.state === "failed";
  const rowStatus = (r: FieldRow) => {
    const p = pending[r.rowId];
    if (p?.state === "rejected") return (
      <span className="text-xs text-red-700 flex flex-wrap items-center gap-1" data-testid="rejected">
        <AlertTriangle className="h-3 w-3" />확인 안 됨 — {p.message}{p.action !== "pass_start" ? " · 아래에서 값을 고쳐 다시 확인하세요" : ""}
      </span>
    );
    if (p?.state === "saving") return <span className="text-xs text-blue-700 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />저장 중</span>;
    if (p?.state === "failed") return (
      <span className="text-xs text-red-700 flex flex-wrap items-center gap-1" data-testid="not-saved">
        <AlertTriangle className="h-3 w-3" />저장 안 됨 — {p.message}
        <Button size="sm" variant="outline" className="h-8" onClick={() => send(r, p.action, p.values, p)}>다시 보내기</Button>
      </span>
    );
    if (r.confirmed) return <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />확인 {r.confirmedByName ?? ""} {r.measurementTime ?? r.values?.metalPassTime ?? r.values?.passTimeEnd ?? ""}</span>;
    return <span className="text-xs text-amber-700">확인 전</span>;
  };

  const editor = (r: FieldRow, fields: Array<{ key: string; label: string; unit?: string }>, mode: "number" | "ox") => {
    const e = editing[r.rowId];
    if (!e) return null;
    const set = (k: string, v: any) => setEditing((x) => ({ ...x, [r.rowId]: { ...x[r.rowId], [k]: v } }));
    return (
      <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2" data-testid="row-editor">
        <div className="flex flex-wrap gap-2">
          {pastDate && timeFieldsOf(r).map((f) => (
            <label key={f.key} className="text-xs space-y-0.5">
              <span className="block text-muted-foreground">실제 {f.label} *</span>
              <Input type="time" className="h-11 w-32" value={e[f.key] ?? ""} onChange={(ev) => set(f.key, ev.target.value || null)} data-testid="actual-time" />
            </label>
          ))}
          {fields.map((f) => (
            <label key={f.key} className="text-xs space-y-0.5">
              <span className="block text-muted-foreground">{f.label}{f.unit ? ` (${f.unit})` : ""}</span>
              {mode === "number" ? (
                <Input type="number" inputMode="decimal" className="h-11 w-24" value={e[f.key] ?? ""} onChange={(ev) => set(f.key, ev.target.value === "" ? null : Number(ev.target.value))} />
              ) : (
                <select className="h-11 w-20 rounded-md border bg-background px-2" value={e[f.key] ?? ""} onChange={(ev) => set(f.key, ev.target.value)}>
                  <option value="O">O</option><option value="X">X</option>
                </select>
              )}
            </label>
          ))}
          <label className="text-xs space-y-0.5">
            <span className="block text-muted-foreground">판정</span>
            <select className="h-11 rounded-md border bg-background px-2" value={e.result ?? "적합"} onChange={(ev) => set("result", ev.target.value)}>
              <option value="적합">적합</option><option value="부적합">부적합</option>
            </select>
          </label>
        </div>
        {e.result === "부적합" && (
          <div className="grid gap-2 md:grid-cols-2">
            <Input className="h-11" placeholder="이탈 내용" value={e.deviationNote ?? ""} onChange={(ev) => set("deviationNote", ev.target.value)} />
            <Input className="h-11" placeholder="개선 조치" value={e.correctiveAction ?? ""} onChange={(ev) => set("correctiveAction", ev.target.value)} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button className="h-11" onClick={() => send(r, r.kind === "passage" ? "pass_end" : "confirm", e)} disabled={busy(r)}>고친 값으로 확인</Button>
          <Button variant="outline" className="h-11" onClick={() => send(r, "edit", e)} disabled={busy(r)}>고치기만 저장</Button>
          <Button variant="ghost" className="h-11" onClick={() => { setEditing((x) => { const n = { ...x }; delete n[r.rowId]; return n; }); setPending((p) => { if (p[r.rowId]?.state !== "rejected") return p; const n = { ...p }; delete n[r.rowId]; return n; }); }}>취소</Button>
        </div>
      </div>
    );
  };
  const startEdit = (r: FieldRow) => {
    if (r.confirmed && !window.confirm("이미 확인한 행입니다. 고치면 그 확인은 무효가 되고 다시 확인해야 합니다. 고칠까요?")) return;
    setEditing((x) => ({ ...x, [r.rowId]: editInit(r) }));
  };
  // 지난 날짜: [확인] = 실제 시각 넣는 칸 열기 (누른 시각·예정 시각으로 저장하지 않음). 이미 확인한 행의 시각만 그대로 보여 준다
  const openPast = (r: FieldRow) => setEditing((x) => ({
    ...x,
    [r.rowId]: { ...editInit(r), ...Object.fromEntries(timeFieldsOf(r).map((f) => [f.key, r.confirmed ? (r.values?.[f.key] ?? r.measurementTime ?? null) : null])) },
  }));
  const confirmBtn = (r: FieldRow) => pastDate
    ? <Button className="h-12 px-6" onClick={() => openPast(r)} data-testid="confirm">실제 시각 넣고 확인</Button>
    : <Button className="h-12 px-6" onClick={() => send(r, "confirm")} data-testid="confirm">확인</Button>;

  return (
    <div className="space-y-2">
      {pastDate && (heat.some((r) => !r.confirmed) || (metal?.rows ?? []).some((r: FieldRow) => !r.confirmed)) && (
        <p className="text-xs text-amber-800 dark:text-amber-300" data-testid="past-date-note">지난 날짜 기록입니다 — 실제 시각을 종이 기록 등에서 옮겨 적어 확인합니다 (지금 시각·예정 시각으로 저장하지 않습니다).</p>
      )}
      {!bare && heat.length > 0 && <div className="text-sm font-semibold">가열·증숙·굽기 ({heat.filter((r) => r.confirmed).length}/{heat.length})</div>}
      {heat.map((r) => (r.confirmed && !editing[r.rowId] && !pending[r.rowId]) ? (
        // 확인한 행은 한 줄 — 남은 일만 크게 보이게 (2026-10-20 생산 화면 하나로)
        <div key={r.rowId} className="rounded-md border px-3 py-1.5 bg-emerald-50/40 dark:bg-emerald-500/5 flex flex-wrap items-center gap-2 text-sm" data-testid="heat-row">
          {!bare && <span className="font-medium">{r.productName}</span>}
          <span className="text-muted-foreground">{r.process} {r.batchSeq}회 · {r.equipmentName ?? "-"}</span>
          <span className="truncate">{HEAT_FIELDS.filter((f) => r.values?.[f.key] != null).map((f) => `${f.label} ${r.values[f.key]}${f.unit}`).join(" · ")}{r.values?.result && r.values.result !== "적합" ? ` · ${r.values.result}` : ""}</span>
          <span className="ml-auto">{rowStatus(r)}</span>
          <Button variant="ghost" size="sm" className="h-9" onClick={() => startEdit(r)}><Pencil className="h-3.5 w-3.5 mr-1" />고치기</Button>
        </div>
      ) : (
        <div key={r.rowId} className={cn("rounded-lg border p-3", r.confirmed ? "bg-emerald-50/40 dark:bg-emerald-500/5" : "bg-background")} data-testid="heat-row">
          <div className="flex flex-wrap items-center gap-2">
            {!bare && <span className="font-medium">{r.productName}</span>}
            <span className="text-sm text-muted-foreground">{r.process} {r.batchSeq}회 · {r.equipmentName ?? "-"} · 예정 {r.plannedTime ?? "--:--"}</span>
            <span className="ml-auto">{rowStatus(r)}</span>
          </div>
          <p className="text-sm mt-1">
            {HEAT_FIELDS.filter((f) => r.values?.[f.key] != null).map((f) => `${f.label} ${r.values[f.key]}${f.unit}`).join(" · ") || "평상값 없음"}
            {r.values?.result && r.values.result !== "적합" ? ` · ${r.values.result}` : ""}
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {!r.confirmed && !editing[r.rowId] && !busy(r) && confirmBtn(r)}
            {!editing[r.rowId] && !busy(r) && <Button variant="outline" className="h-12" onClick={() => startEdit(r)}><Pencil className="h-4 w-4 mr-1" />고치기</Button>}
          </div>
          {editor(r, HEAT_FIELDS, "number")}
        </div>
      ))}

      {metal && metalByProduct.map(([prod, rows]) => (
        <div key={prod} className="rounded-lg border p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{bare ? "금속검출" : prod}</span>
            <Button size="sm" variant="ghost" className="ml-auto h-10" onClick={async () => {
              try { await addSens.mutateAsync({ formRecordId: metal.formRecordId, productName: prod, label: "2시간점검", requestId: rid() }); await refresh(); }
              catch (e: any) { toast.error(`저장 안 됨 — ${e.message}`); }
            }}><Plus className="h-4 w-4 mr-1" />감도점검 추가</Button>
          </div>
          {rows.map((r) => (
            <div key={r.rowId} className={cn("rounded-md border p-2", r.confirmed ? "bg-emerald-50/40 dark:bg-emerald-500/5" : "")} data-testid={r.kind === "passage" ? "pass-row" : "sens-row"}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {r.kind === "passage"
                  ? <span>통과 {r.values?.passQty ?? "-"}{r.passUnit ?? ""} · 시작 {r.values?.passTimeStart ?? "--:--"} · 종료 {r.values?.passTimeEnd ?? "--:--"}</span>
                  : <span>감도점검 {r.note ?? ""} · {SENS_FIELDS.map((f) => `${f.label} ${r.values?.[f.key] ?? "-"}`).join(" · ")}</span>}
                <span className="ml-auto">{rowStatus(r)}</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {!busy(r) && r.kind === "passage" && pastDate && !r.confirmed && !editing[r.rowId] && <Button className="h-12 px-6" onClick={() => openPast(r)} data-testid="pass-end">실제 통과 시각 넣고 확인</Button>}
                {!busy(r) && r.kind === "passage" && !pastDate && !r.values?.passTimeStart && <Button className="h-12 px-6" onClick={() => send(r, "pass_start")} data-testid="pass-start">통과 시작</Button>}
                {!busy(r) && r.kind === "passage" && !pastDate && r.values?.passTimeStart && !r.confirmed && !editing[r.rowId] && <Button className="h-12 px-6" onClick={() => send(r, "pass_end")} data-testid="pass-end">통과 종료</Button>}
                {!busy(r) && r.kind === "sensitivity" && !r.confirmed && !editing[r.rowId] && confirmBtn(r)}
                {!editing[r.rowId] && !busy(r) && <Button variant="outline" className="h-12" onClick={() => startEdit(r)}><Pencil className="h-4 w-4 mr-1" />고치기</Button>}
              </div>
              {r.kind === "passage" ? editor(r, [{ key: "passQty", label: "통과량" }, { key: "detectedQty", label: "검출" }], "number") : editor(r, SENS_FIELDS, "ox")}
            </div>
          ))}
        </div>
      ))}

      {sheets.map((s) => (
        <div key={s.formRecordId} className="rounded-md border p-2 text-sm" data-testid="sheet">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{s.title}</span>
            <span className="text-muted-foreground">{s.confirmedRows}/{s.rows} 확인</span>
            {s.submittedConfirmed ? <span className="text-emerald-700 text-xs">제출됨</span> : (
              <Button size="sm" className="ml-auto h-10" disabled={s.problems.length > 0 || submit.isPending}
                onClick={async () => {
                  try { await submit.mutateAsync({ formRecordId: s.formRecordId, batchNumber: String(s.batchId ?? "금속검출"), ccpType: s.ccpType }); toast.success("제출했습니다."); await refresh(); }
                  catch (e: any) { toast.error(`저장 안 됨 — ${e.message}`); }
                }}>기록지 제출</Button>
            )}
          </div>
          {s.problems.slice(0, 3).map((p: string, i: number) => <p key={i} className="text-xs text-amber-800 dark:text-amber-300">{p}</p>)}
          {s.problems.length > 3 && <p className="text-xs text-muted-foreground">외 {s.problems.length - 3}건</p>}
        </div>
      ))}
    </div>
  );
}
