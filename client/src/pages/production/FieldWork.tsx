/**
 * 현장 확인 — 하루 생산 흐름 (2026-10-19, CEO 확정 정책). 태블릿 한 화면.
 *
 *   내 설비 고르기(개인 계정마다 기억) → 그 설비의 오늘 일만.
 *   평상값이 맞으면 [확인]. 다르면 [고치기] → 그 자리에서 고친 값으로 확인. 확인한 시각 = CCP 확인 시각.
 *   금속검출: [통과 시작]·[통과 종료](종료 = 확인), 감도점검 [확인]·[감도점검 추가]. 검출기는 기록지에 정한 실제 설비.
 *   원료는 예정 생산 건의 첫 확인(금속검출만 하는 제품은 통과 시작)에서 한 번 — 서버가 정한다.
 *   마감: 기록지마다 남은 일·막히는 이유 → 다 확인되면 [기록지 제출]. 서버가 제출·검토·승인을 같은 기준으로 막는다.
 *   저장에 실패하면 그 줄에 '저장 안 됨' — [다시 보내기]는 같은 요청 키라 두 번 기록되지 않는다. 오프라인 저장은 없다.
 *   확인 뒤 고치면 그 확인은 무효 — 다시 확인해야 한다. 모든 확인·수정은 사람·시각·전/후·기기와 함께 남는다.
 */
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { todayLocal } from "../../lib/dateUtils";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";

type Row = any;
/**
 * 행 쓰기 상태 — saving(보내는 중) · failed(통신 실패: 저장됐는지 모름 → 같은 요청 키·같은 내용으로만 다시 보내기)
 *   · rejected(서버가 확실히 거부: 저장 안 됨 → 이유를 보이고 그 자리 편집기로 고쳐 새 요청으로) — 2026-10-20 #611 추가 검토
 */
type Pending = { requestId: string; action: string; values?: Record<string, any>; state: "saving" | "failed" | "rejected"; message?: string };

const rid = () => `fw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const HEAT_FIELDS: Array<{ key: string; label: string; unit: string }> = [
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
const editKeys = (r: Row) => (r.kind === "heat" ? HEAT_FIELDS.map((f) => f.key) : r.kind === "passage" ? ["passQty", "detectedQty"] : SENS_FIELDS.map((f) => f.key));
/** 편집기 처음 값 — 지금 값, 거부된 요청이 보낸 값이 있으면 그 값 위에 (방금 입력을 잃지 않게) */
function editInit(r: Row, sent?: Record<string, any>): Record<string, any> {
  const init: Record<string, any> = { result: r.values?.result ?? "적합", deviationNote: r.values?.deviationNote ?? "", correctiveAction: r.values?.correctiveAction ?? "" };
  for (const k of editKeys(r)) init[k] = r.values?.[k] ?? null;
  return { ...init, ...(sent ?? {}) };
}

export default function FieldWork() {
  const [workDate, setWorkDate] = useState(todayLocal());
  const utils = trpc.useUtils();
  const eq = trpc.field.equipments.useQuery();
  const work = trpc.field.work.useQuery({ workDate }, { refetchInterval: 60_000 });
  const setMine = trpc.field.setMyEquipments.useMutation({
    onSuccess: () => { utils.field.equipments.invalidate(); utils.field.work.invalidate(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const write = trpc.field.write.useMutation();
  const addSens = trpc.field.addSensitivity.useMutation();
  const submit = trpc.ccpForm.submit.useMutation();
  const [pending, setPending] = useState<Record<number, Pending>>({});
  const [editing, setEditing] = useState<Record<number, Record<string, any>>>({});

  const mine: number[] = (eq.data as any)?.mine ?? [];
  const toggleMine = (id: number) => setMine.mutate({ equipmentIds: mine.includes(id) ? mine.filter((x) => x !== id) : [...mine, id] });

  /** 한 행 쓰기 — 실패하면 같은 요청 키로 다시 보낼 수 있게 남긴다 */
  const send = async (row: Row, action: string, values?: Record<string, any>, retry?: Pending) => {
    const requestId = retry?.requestId ?? rid();
    setPending((p) => ({ ...p, [row.rowId]: { requestId, action, values, state: "saving" } }));
    try {
      await write.mutateAsync({ rowId: row.rowId, action: action as any, expectedRowVersion: row.rowVersion, values, requestId });
      setPending((p) => { const n = { ...p }; delete n[row.rowId]; return n; });
      setEditing((e) => { const n = { ...e }; delete n[row.rowId]; return n; });
      await utils.field.work.invalidate();
    } catch (e: any) {
      const code = e?.data?.code;
      if (code === "CONFLICT") {
        // 다른 사람이 먼저 바꿈 — 새 값을 보여 주고 다시 누르게
        setPending((p) => { const n = { ...p }; delete n[row.rowId]; return n; });
        toast.error(e.message);
        await utils.field.work.invalidate();
        return;
      }
      if (code === "PRECONDITION_FAILED" || code === "BAD_REQUEST") {
        // 서버가 확실히 거부 (필수값·한계기준·원료 출고 실패 등) — 저장 안 됨. 이유를 보이고, 값 문제면 그 자리에서 고치게 편집기를 연다
        setPending((p) => ({ ...p, [row.rowId]: { requestId: rid(), action, values, state: "rejected", message: e.message } }));
        if (action !== "pass_start") setEditing((x) => (x[row.rowId] ? x : { ...x, [row.rowId]: editInit(row, values) }));
        return;
      }
      // 통신 실패 — 서버 저장 여부를 모른다. 같은 요청 키로 다시 보내면 두 번 기록되지 않는다
      setPending((p) => ({ ...p, [row.rowId]: { requestId, action, values, state: "failed", message: "통신 실패" } }));
    }
  };

  const heat: Row[] = (work.data as any)?.heat ?? [];
  const metal = (work.data as any)?.metal ?? null;
  const sheets: any[] = (work.data as any)?.sheets ?? [];
  const metalByProduct = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of metal?.rows ?? []) m.set(r.productName ?? "-", [...(m.get(r.productName ?? "-") ?? []), r]);
    return Array.from(m.entries());
  }, [metal]);
  const todo = heat.filter((r) => !r.confirmed).length + (metal?.rows ?? []).filter((r: Row) => !r.confirmed).length;

  /** 보내는 중이거나 저장 여부를 모르는 행 — 다른 동작을 막는다 (거부된 행은 막지 않음: 고쳐서 다시) */
  const busy = (r: Row) => pending[r.rowId]?.state === "saving" || pending[r.rowId]?.state === "failed";
  const rowStatus = (r: Row) => {
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

  const editor = (r: Row, fields: Array<{ key: string; label: string; unit?: string }>, mode: "number" | "ox") => {
    const e = editing[r.rowId];
    if (!e) return null;
    const set = (k: string, v: any) => setEditing((x) => ({ ...x, [r.rowId]: { ...x[r.rowId], [k]: v } }));
    return (
      <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2" data-testid="row-editor">
        <div className="flex flex-wrap gap-2">
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
  const startEdit = (r: Row) => {
    if (r.confirmed && !window.confirm("이미 확인한 행입니다. 고치면 그 확인은 무효가 되고 다시 확인해야 합니다. 고칠까요?")) return;
    setEditing((x) => ({ ...x, [r.rowId]: editInit(r) }));
  };

  const content = (
    <div className="space-y-4" data-testid="field-work">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">현장 확인</h1>
          <p className="text-sm text-muted-foreground">내 설비의 오늘 일 — 평상값이 맞으면 [확인], 다르면 [고치기]. 확인한 시각이 기록 시각입니다.</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1"><Label className="text-xs">작업일</Label><Input type="date" className="h-11" value={workDate} onChange={(e) => setWorkDate(e.target.value)} /></div>
          <Button variant="outline" size="icon" className="h-11 w-11" aria-label="새로고침" onClick={() => work.refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">내 설비</CardTitle><CardDescription>고른 설비의 일만 보입니다 (내 계정에 기억). 안 고르면 전부.</CardDescription></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {((eq.data as any)?.all ?? []).map((e: any) => (
            <button key={e.id} type="button" onClick={() => toggleMine(e.id)} data-testid="my-equipment"
              className={cn("min-h-11 px-3 rounded-md border text-sm", mine.includes(e.id) ? "bg-blue-600 text-white border-blue-600" : "bg-background")}>
              {e.name}{e.metal ? " (금속검출)" : ""}
            </button>
          ))}
        </CardContent>
      </Card>

      {work.isError && <p className="text-sm text-red-700">불러오지 못했습니다 — 새로고침을 누르세요.</p>}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">가열·증숙·굽기 {heat.length ? `(${heat.filter((r) => r.confirmed).length}/${heat.length})` : ""}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!heat.length && <p className="text-sm text-muted-foreground">오늘 내 설비의 가열 공정 일이 없습니다.</p>}
          {heat.map((r) => (
            <div key={r.rowId} className={cn("rounded-lg border p-3", r.confirmed ? "bg-emerald-50/40" : "")} data-testid="heat-row">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.productName}</span>
                <span className="text-sm text-muted-foreground">{r.process} {r.batchSeq}회 · {r.equipmentName ?? "-"} · 예정 {r.plannedTime ?? "--:--"}</span>
                <span className="ml-auto">{rowStatus(r)}</span>
              </div>
              <p className="text-sm mt-1">
                {HEAT_FIELDS.filter((f) => r.values?.[f.key] != null).map((f) => `${f.label} ${r.values[f.key]}${f.unit}`).join(" · ") || "평상값 없음"}
                {r.values?.result && r.values.result !== "적합" ? ` · ${r.values.result}` : ""}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {!r.confirmed && !editing[r.rowId] && !busy(r) && <Button className="h-12 px-6" onClick={() => send(r, "confirm")} data-testid="confirm">확인</Button>}
                {!editing[r.rowId] && !busy(r) && <Button variant="outline" className="h-12" onClick={() => startEdit(r)}><Pencil className="h-4 w-4 mr-1" />고치기</Button>}
              </div>
              {editor(r, HEAT_FIELDS, "number")}
            </div>
          ))}
        </CardContent>
      </Card>

      {metal && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">금속검출 {`(${metal.rows.filter((r: Row) => r.confirmed).length}/${metal.rows.length})`}</CardTitle>
            <CardDescription>통과는 [통과 시작]·[통과 종료], 감도점검은 [확인]. 시각은 누른 시각입니다.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {metalByProduct.map(([prod, rows]) => (
              <div key={prod} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{prod}</span>
                  <Button size="sm" variant="ghost" className="ml-auto h-10" onClick={async () => {
                    try { await addSens.mutateAsync({ formRecordId: metal.formRecordId, productName: prod, label: "2시간점검", requestId: rid() }); await utils.field.work.invalidate(); }
                    catch (e: any) { toast.error(`저장 안 됨 — ${e.message}`); }
                  }}><Plus className="h-4 w-4 mr-1" />감도점검 추가</Button>
                </div>
                {rows.map((r) => (
                  <div key={r.rowId} className={cn("rounded-md border p-2", r.confirmed ? "bg-emerald-50/40" : "")} data-testid={r.kind === "passage" ? "pass-row" : "sens-row"}>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      {r.kind === "passage"
                        ? <span>통과 {r.values?.passQty ?? "-"}{r.passUnit ?? ""} · 시작 {r.values?.passTimeStart ?? "--:--"} · 종료 {r.values?.passTimeEnd ?? "--:--"}</span>
                        : <span>감도점검 {r.note ?? ""} · {SENS_FIELDS.map((f) => `${f.label} ${r.values?.[f.key] ?? "-"}`).join(" · ")}</span>}
                      <span className="ml-auto">{rowStatus(r)}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {!busy(r) && r.kind === "passage" && !r.values?.passTimeStart && <Button className="h-12 px-6" onClick={() => send(r, "pass_start")} data-testid="pass-start">통과 시작</Button>}
                      {!busy(r) && r.kind === "passage" && r.values?.passTimeStart && !r.confirmed && !editing[r.rowId] && <Button className="h-12 px-6" onClick={() => send(r, "pass_end")} data-testid="pass-end">통과 종료</Button>}
                      {!busy(r) && r.kind === "sensitivity" && !r.confirmed && !editing[r.rowId] && <Button className="h-12 px-6" onClick={() => send(r, "confirm")} data-testid="confirm">확인</Button>}
                      {!editing[r.rowId] && !busy(r) && <Button variant="outline" className="h-12" onClick={() => startEdit(r)}><Pencil className="h-4 w-4 mr-1" />고치기</Button>}
                    </div>
                    {r.kind === "passage" ? editor(r, [{ key: "passQty", label: "통과량" }, { key: "detectedQty", label: "검출" }], "number") : editor(r, SENS_FIELDS, "ox")}
                  </div>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">마감 {todo ? `— 남은 확인 ${todo}건` : "— 확인 다 됨"}</CardTitle>
          <CardDescription>기록지마다 남은 일입니다. 다 확인되면 [기록지 제출] → 검토·승인. 덜 끝난 기록지는 서버가 제출·검토·승인을 막습니다.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {sheets.map((s) => (
            <div key={s.formRecordId} className="rounded-md border p-2 text-sm" data-testid="sheet">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{s.title}</span>
                <span className="text-muted-foreground">{s.confirmedRows}/{s.rows} 확인</span>
                {s.submittedConfirmed ? <span className="text-emerald-700 text-xs">제출됨</span> : (
                  <Button size="sm" className="ml-auto h-10" disabled={s.problems.length > 0 || submit.isPending}
                    onClick={async () => {
                      try { await submit.mutateAsync({ formRecordId: s.formRecordId, batchNumber: String(s.batchId ?? "금속검출"), ccpType: s.ccpType }); toast.success("제출했습니다."); await utils.field.work.invalidate(); }
                      catch (e: any) { toast.error(`저장 안 됨 — ${e.message}`); }
                    }}>기록지 제출</Button>
                )}
              </div>
              {s.problems.slice(0, 3).map((p: string, i: number) => <p key={i} className="text-xs text-amber-800">{p}</p>)}
              {s.problems.length > 3 && <p className="text-xs text-muted-foreground">외 {s.problems.length - 3}건</p>}
            </div>
          ))}
          {!sheets.length && <p className="text-sm text-muted-foreground">이 날의 현장 확인 기록지가 없습니다.</p>}
        </CardContent>
      </Card>
    </div>
  );
  return <DashboardLayout>{content}</DashboardLayout>;
}
