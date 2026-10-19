/**
 * 생산 설계 > 우리 공장 (2026-10-19) — 공장 지도 + 그 자리에서 고치기
 *   공정마다 [운영 가열시간 · 몇 대씩 · 시작 간격 · 연결 설비], 설비마다 [한 번 도는 시간 · 평소 온도 · 작업 시작 시각].
 *   같은 설비를 여러 공정이 쓰면 '공유' 로 표시 (예: 설기·약식 증숙이 같은 증숙기 6대).
 *   기존 값이 채워진 채로 열리고, 바꾼 칸만 저장한다. 한계기준(법정 최소·최대)은 CCP 관리에서 — 판정·제출 검증용이라 운영값과 따로.
 */
import { useMemo, useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Pencil, RefreshCw } from "lucide-react";

const KIND: Record<string, string> = { "CCP-1B": "가열·증숙", "CCP-2B": "굽기", "CCP-4P": "금속검출" };
function modeText(g: any): string {
  if (g.ccpType === "CCP-4P") return "제품이 차례로 통과";
  if (g.mode === "concurrent") return "여러 대를 동시에";
  if (g.mode === "grouped" && g.batchSize > 1) return `${g.batchSize}대씩 같이 (남으면 적은 대수) · ${g.intervalMin ?? 10}분 간격`;
  return `한 대씩 차례로 · ${g.intervalMin ?? 10}분 간격`;
}
/** 지금 계획이 쓰는 가열시간 — 공정 시간 설정 1개면 그 값, 아니면 설비 기본값이 모두 같을 때 그 값 */
function effectiveHeat(g: any): number | null {
  if (g.profileTimeMin != null) return g.profileTimeMin;
  const vals = Array.from(new Set((g.equipments as any[]).map((e) => e.timeMin).filter((x) => x != null)));
  return vals.length === 1 ? Number(vals[0]) : null;
}
const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

function ProcessEditor({ g, allEquipments, onDone }: { g: any; allEquipments: any[]; onDone: () => void }) {
  const utils = trpc.useUtils();
  const initHeat = effectiveHeat(g);
  const [heat, setHeat] = useState(initHeat != null ? String(initHeat) : "");
  // "몇 대씩 같이" — 1 = 한 대씩 차례로, 2 이상 = 그만큼 같이, 0 = 모두 동시에 (기존 운전 방식 그대로 채움)
  const [together, setTogether] = useState(String(g.mode === "grouped" ? g.batchSize : g.mode === "concurrent" ? 0 : 1));
  const [interval, setIntervalMin] = useState(String(g.intervalMin ?? 10));
  const [eqIds, setEqIds] = useState<number[]>((g.equipments as any[]).map((e) => e.id));
  const save = trpc.productionDesign.saveProcess.useMutation({
    onSuccess: (r: any) => { toast.success(r.changed ? `${g.name} 저장 — ${r.changed}건 바뀜` : "바뀐 것이 없습니다."); utils.productionDesign.invalidate(); onDone(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const n = Number(together);
  const candidates = allEquipments.filter((e) => !e.ccpType || e.ccpType === g.ccpType || eqIds.includes(e.id));
  const submit = () => {
    const input: any = { groupId: g.id };
    const h = numOrNull(heat);
    if (h !== initHeat) input.heatMin = h; // 바꿨을 때만 — 안 바꾸면 기존 동작(설비 기본값 등) 그대로
    if (n === 0) input.mode = "concurrent";
    else if (n === 1) { input.mode = "sequential"; input.batchSize = 1; }
    else { input.mode = "grouped"; input.batchSize = n; }
    if (n !== 0) input.intervalMin = Math.max(0, Number(interval) || 0);
    if (eqIds.join(",") !== (g.equipments as any[]).map((e) => e.id).join(",")) input.equipmentIds = eqIds;
    save.mutate(input);
  };
  return (
    <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm" data-testid="process-editor">
      {g.ccpType !== "CCP-4P" && (
        <label className="block">운영 가열시간 (분)
          <Input className="h-11 w-32" inputMode="numeric" value={heat} onChange={(e) => setHeat(e.target.value)} placeholder="설비 기본값" />
          <span className="block text-xs text-muted-foreground">생산 계획·기록에 쓰는 실제 가열시간입니다. 한계기준(법정 최소)과는 따로입니다.{initHeat == null ? " 지금은 설비마다 기본값을 씁니다." : ""}</span>
        </label>
      )}
      {g.ccpType !== "CCP-4P" && (
        <label className="block">몇 대씩 같이 돌리나요?
          <select className="h-11 rounded-md border bg-background px-2 ml-2" value={together} onChange={(e) => setTogether(e.target.value)}>
            <option value="1">한 대씩 차례로</option>
            {[2, 3, 4, 5, 6].map((k) => <option key={k} value={k}>{k}대씩 같이</option>)}
            <option value="0">모두 동시에</option>
          </select>
        </label>
      )}
      {g.ccpType !== "CCP-4P" && n !== 0 && (
        <label className="block">다음 시작까지 간격 (분)
          <Input className="h-11 w-32" inputMode="numeric" value={interval} onChange={(e) => setIntervalMin(e.target.value)} />
        </label>
      )}
      <div>
        <div className="mb-1">이 공정에 쓰는 설비</div>
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((e) => (
            <button key={e.id} type="button" onClick={() => setEqIds((x) => (x.includes(e.id) ? x.filter((i) => i !== e.id) : [...x, e.id]))}
              className={cn("min-h-11 rounded-md border px-3", eqIds.includes(e.id) ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent")}>{e.name}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="h-11" disabled={save.isPending} onClick={submit}>{save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}저장</Button>
        <Button className="h-11" variant="outline" onClick={onDone}>취소</Button>
      </div>
    </div>
  );
}

function EquipmentEditor({ e, isMetal, onDone }: { e: any; isMetal: boolean; onDone: () => void }) {
  const utils = trpc.useUtils();
  const [cycle, setCycle] = useState(e.cycleMin != null ? String(e.cycleMin) : "");
  const [temp, setTemp] = useState(e.tempC != null ? String(e.tempC) : "");
  const [start, setStart] = useState(e.workStartTime ?? "");
  const save = trpc.productionDesign.saveEquipment.useMutation({
    onSuccess: (r: any) => { toast.success(r.changed ? `${e.name} 저장 — ${r.changed}건 바뀜` : "바뀐 것이 없습니다."); utils.productionDesign.invalidate(); onDone(); },
    onError: (err: { message: string }) => toast.error(err.message),
  });
  return (
    <div className="mt-1 space-y-2 rounded-md border bg-background p-2 text-sm" data-testid="equipment-editor">
      {!isMetal && (
        <>
          <label className="block">한 번 도는 시간 (분, 기본 가열 {e.timeMin ?? "?"}분 포함)
            <Input className="h-11 w-28" inputMode="numeric" value={cycle} onChange={(x) => setCycle(x.target.value)} />
          </label>
          <label className="block">평소 온도 (℃)
            <Input className="h-11 w-28" inputMode="decimal" value={temp} onChange={(x) => setTemp(x.target.value)} />
          </label>
        </>
      )}
      <label className="block">작업 시작 시각
        <Input className="h-11 w-32" type="time" value={start} onChange={(x) => setStart(x.target.value)} />
      </label>
      <div className="flex gap-2">
        <Button className="h-11" disabled={save.isPending} onClick={() => save.mutate({
          equipmentId: e.id,
          ...(isMetal ? {} : { cycleMin: numOrNull(cycle), tempC: numOrNull(temp) }),
          workStartTime: /^\d{2}:\d{2}$/.test(start) ? start : null,
        })}>{save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}저장</Button>
        <Button className="h-11" variant="outline" onClick={onDone}>취소</Button>
      </div>
    </div>
  );
}

export default function DesignFactory() {
  const q = trpc.productionDesign.factory.useQuery(undefined, { retry: 1 });
  const groups: any[] = (q.data as any)?.groups ?? [];
  const allEquipments: any[] = (q.data as any)?.equipments ?? [];
  const [editGroup, setEditGroup] = useState<number | null>(null);
  const [editEquip, setEditEquip] = useState<string | null>(null);
  // 설비 → 그 설비를 쓰는 공정 (공유 표시)
  const shared = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const g of groups) for (const e of g.equipments) m.set(e.id, [...(m.get(e.id) ?? []), g.name]);
    return m;
  }, [groups]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <PageHeader title="우리 공장" description="공정마다 어떤 설비를 어떻게 돌리는지 — 여기서 고치면 생산 계획과 CCP 기록에 바로 쓰입니다. 설비 이름을 누르면 그 설비를 고칩니다."
          secondary={{ label: "새로고침", icon: RefreshCw, onClick: () => q.refetch() }} />
        {q.isLoading && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 mr-1 animate-spin" />불러오는 중…</CardContent></Card>}
        {q.isError && <Card><CardContent className="py-8 text-center text-sm text-red-700">{q.error?.message}</CardContent></Card>}
        {!q.isLoading && !groups.length && !q.isError && <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">등록된 공정이 없습니다. 공정과 설비를 먼저 등록하세요 (CCP 관리).</CardContent></Card>}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="factory-map">
          {groups.map((g) => (
            <Card key={g.id} className={g.issues?.some((i: any) => i.level === "red") ? "border-red-300" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{g.name}</CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge variant="outline">{KIND[g.ccpType] ?? g.ccpType}</Badge>
                    {editGroup !== g.id && <Button variant="ghost" className="h-9 px-2" onClick={() => setEditGroup(g.id)}><Pencil className="h-4 w-4 mr-1" />고치기</Button>}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {modeText(g)}
                  {g.ccpType !== "CCP-4P" && (effectiveHeat(g) != null ? ` · 가열 ${effectiveHeat(g)}분` : " · 가열시간 설비마다 다름")}
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {editGroup === g.id && <ProcessEditor g={g} allEquipments={allEquipments} onDone={() => setEditGroup(null)} />}
                <div className="flex flex-wrap gap-2">
                  {!g.equipments.length && <span className="text-sm text-red-700">연결된 설비 없음</span>}
                  {g.equipments.map((e: any) => {
                    const users = shared.get(e.id) ?? [];
                    const key = `${g.id}:${e.id}`;
                    return (
                      <div key={e.id} className="rounded-md border bg-muted/30 px-2 py-1.5 text-xs">
                        <button type="button" className="font-medium text-sm hover:underline" onClick={() => setEditEquip(editEquip === key ? null : key)}>
                          {e.name}{users.length > 1 && <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] text-blue-800" title={users.join(", ")}>공유</span>}
                        </button>
                        {g.ccpType !== "CCP-4P" && (
                          <>
                            {/* 이 공정에서 계획이 쓰는 값 — 설비 점유 = 설비 사이클 + (적용 가열 − 설비 기본 가열) */}
                            <div>{[e.tempC != null ? `${e.tempC}℃` : null, `이 공정 가열 ${e.appliedHeatMin ?? "?"}분`, `설비 점유 ${e.occupancyMin ?? "?"}분`].filter(Boolean).join(" · ")}</div>
                            <div className="text-muted-foreground">설비 기본값: 가열 {e.timeMin ?? "?"}분 · 한 번 {e.cycleMin ?? "?"}분{e.workStartTime ? ` · ${e.workStartTime} 시작` : ""}</div>
                          </>
                        )}
                        {editEquip === key && <EquipmentEditor e={e} isMetal={g.ccpType === "CCP-4P"} onDone={() => setEditEquip(null)} />}
                      </div>
                    );
                  })}
                </div>
                {(g.issues ?? []).map((i: any, k: number) => <p key={k} className={i.level === "red" ? "text-sm text-red-700" : "text-sm text-amber-800"}>• {i.text}</p>)}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
