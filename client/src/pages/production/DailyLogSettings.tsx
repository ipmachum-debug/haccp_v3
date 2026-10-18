/**
 * 일일일지 설정 — 회사의 구역·측정 대상·회차·기준·문구 (2026-10-18, docs/architecture/17 D1)
 *
 * 3단계: ① 사용할 기록 고르기(참고 템플릿 불러오기) → ② 구역·대상·기준 편집 → ③ 미리보기·발행.
 * - 초안 저장은 설정 버전(row_version)이 맞을 때만 — 다른 관리자가 먼저 바꿨으면 거부된다.
 * - 발행하면 다음에 새로 만드는 일지부터 적용된다. 이미 만든 일지는 그 기록의 설정 스냅샷 그대로.
 * - 이전 발행본의 구역·대상·질문·회차는 지울 수 없다 — '사용 안 함' 으로 남긴다 (서버도 검사).
 * - DAILY_LOG_V2 기능을 켠 회사만. 관리 권한은 서버가 확인한다.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Plus, Save, Upload, AlertTriangle } from "lucide-react";
import {
  DAILY_LOG_SECTIONS, MEASURE_SECTIONS, SECTION_TITLES, MEASURE_LABELS, MEASURE_UNITS, criteriaText, definitionProblems, parseDefinition,
  type DailyLogDefinition, type DailyLogSection, type MeasureKind, type MeasureSection, type MeasureSpec, type Point,
} from "@shared/dailyLog/definition";
import { newRecordV2, expectedRows, activeQuestions } from "@shared/dailyLog/recordV2";
import { renderDailyLogV2Pages } from "@/components/print/DailyLogV2Renderers";

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));
const emptyDefinition = (): DailyLogDefinition => ({ definitionVersion: 1, templateCode: null, enabledSections: [], sectionInfo: {}, questions: [], zones: [], points: [] });
const STEPS = ["사용할 기록", "구역·대상·기준", "미리보기·발행"] as const;

function SpecEditor({ kind, spec, onChange }: { kind: MeasureKind; spec: MeasureSpec | undefined; onChange: (s: MeasureSpec | undefined) => void }) {
  const on = !!spec;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex min-h-11 items-center gap-1">
        <input type="checkbox" className="h-5 w-5" checked={on}
          onChange={(e) => onChange(e.target.checked ? { lower: null, upper: null, lowerInclusive: true, upperInclusive: true, required: true } : undefined)} />
        {MEASURE_LABELS[kind]}
      </label>
      {spec && (
        <>
          <Input type="number" step="0.1" className="h-11 w-24" placeholder="하한" value={spec.lower ?? ""} onChange={(e) => onChange({ ...spec, lower: numOrNull(e.target.value) })} />
          <span>~</span>
          <Input type="number" step="0.1" className="h-11 w-24" placeholder="상한" value={spec.upper ?? ""} onChange={(e) => onChange({ ...spec, upper: numOrNull(e.target.value) })} />
          <span>{MEASURE_UNITS[kind]}</span>
          <span className="text-xs text-muted-foreground">({criteriaText(kind, spec)}, 경계값 포함)</span>
        </>
      )}
    </div>
  );
}

export default function DailyLogSettings() {
  const [, navigate] = useLocation();
  const settings = trpc.dailyLog.settingsGet.useQuery(undefined, { retry: 1 });
  const templates = trpc.dailyLog.settingsTemplates.useQuery(undefined, { staleTime: 600_000 });
  const [draft, setDraft] = useState<DailyLogDefinition | null>(null);
  const [rowVersion, setRowVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(0);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [preview, setPreview] = useState<{ problems: string[]; summary: any } | null>(null);

  // 불러오기 — 저장된 초안이 있으면 그것, 없으면 발행본을 복사해 편집 시작
  useEffect(() => {
    const s: any = settings.data;
    if (!s?.enabled) return;
    setRowVersion(Number(s.rowVersion ?? 0));
    setDraft(structuredClone(s.draft ?? s.active?.definition ?? emptyDefinition()));
    setDirty(false);
    setPreview(null);
  }, [settings.data]);

  const edit = (f: (d: DailyLogDefinition) => DailyLogDefinition) => { setDraft((d) => (d ? f(d) : d)); setDirty(true); setPreview(null); setConfirmPublish(false); };

  const saveDraft = trpc.dailyLog.settingsSaveDraft.useMutation({
    onSuccess: (r: any) => { setRowVersion(r.rowVersion); setDirty(false); toast.success(r.problems?.length ? `초안 저장 — 고칠 곳 ${r.problems.length}건` : "초안을 저장했습니다."); settings.refetch(); },
    onError: (e: { message: string }) => toast.error(e.message, { duration: 8000 }),
  });
  const previewM = trpc.dailyLog.settingsPreview.useMutation({
    onSuccess: (r: any) => setPreview({ problems: r.problems ?? [], summary: r.summary }),
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const publish = trpc.dailyLog.settingsPublish.useMutation({
    onSuccess: (r: any) => { toast.success(`설정 v${r.versionNo} 을 발행했습니다 — 다음에 새로 만드는 일지부터 적용됩니다.`); setConfirmPublish(false); settings.refetch(); },
    onError: (e: { message: string }) => toast.error(e.message, { duration: 10000 }),
  });

  const localProblems = useMemo(() => (draft ? definitionProblems(draft) : []), [draft]);
  const previewPages = useMemo(() => {
    if (!draft || localProblems.length) return [];
    try { return renderDailyLogV2Pages(newRecordV2(parseDefinition(draft), "미리보기", null)); } catch { return []; }
  }, [draft, localProblems]);
  const rows = useMemo(() => (draft && !localProblems.length ? expectedRows(parseDefinition(draft)) : []), [draft, localProblems]);
  const prevIds = useMemo(() => {
    const a: DailyLogDefinition | undefined = (settings.data as any)?.active?.definition;
    return {
      zones: new Set(a?.zones.map((z) => z.zoneId) ?? []),
      points: new Set(a?.points.map((p) => p.pointId) ?? []),
      slots: new Set(a?.points.flatMap((p) => p.slots.map((s) => `${p.pointId}|${s.slotId}`)) ?? []),
    };
  }, [settings.data]);

  const shell = (body: ReactNode) => (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard/daily-logs")}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <h1 className="text-2xl font-bold">일일일지 설정</h1>
            <p className="text-sm text-muted-foreground">우리 회사의 구역·측정 대상·점검 회차·기준을 정합니다. 발행하면 다음 새 일지부터 적용됩니다.</p>
          </div>
        </div>
        {body}
      </div>
    </DashboardLayout>
  );

  if (settings.isLoading) return shell(<Card><CardContent className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</CardContent></Card>);
  if (settings.isError) return shell(<Card><CardContent className="py-8 text-center space-y-2"><p className="text-sm text-red-700">{settings.error?.message}</p><Button variant="outline" onClick={() => settings.refetch()}>다시 시도</Button></CardContent></Card>);
  const s: any = settings.data;
  if (!s?.enabled) return shell(<Card><CardContent className="py-8 text-center text-sm text-muted-foreground">이 회사는 일지 설정 기능(DAILY_LOG_V2)이 꺼져 있습니다 — 운영 담당에게 요청하세요. 지금은 이전 일일일지 화면을 씁니다.</CardContent></Card>);
  if (!draft) return shell(null);

  const d = draft;
  const isMeasure = (x: DailyLogSection) => (MEASURE_SECTIONS as readonly string[]).includes(x);
  const setInfo = (sec: DailyLogSection, p: Record<string, unknown>) => edit((x) => ({
    ...x, sectionInfo: { ...x.sectionInfo, [sec]: { title: SECTION_TITLES[sec], criteriaText: "", method: "", cycle: "", actions: [], ...x.sectionInfo[sec], ...p } },
  }));
  const setPoint = (pointId: string, f: (p: Point) => Point) => edit((x) => ({ ...x, points: x.points.map((p) => (p.pointId === pointId ? f(p) : p)) }));
  const loadTemplate = (code: string) => {
    const t = (templates.data as any[] | undefined)?.find((x) => x.code === code);
    if (!t) return;
    if (s.active) { toast.error("이미 발행한 설정이 있습니다 — 템플릿으로 바꾸면 이전 구역·대상 ID 가 사라져 발행할 수 없습니다. 항목을 직접 고치세요."); return; }
    setDraft(structuredClone(t.definition)); setDirty(true); setPreview(null);
    toast.success("템플릿을 초안으로 불러왔습니다 — 저장해야 남습니다.");
  };

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {s.active ? <Badge variant="secondary">발행본 v{s.active.versionNo}{s.active.publishedAt ? ` · ${s.active.publishedAt}` : ""}</Badge> : <Badge variant="outline">발행본 없음 — 이전 일지 화면 사용 중</Badge>}
      {s.draft && <Badge variant="outline">저장된 초안 있음</Badge>}
      {dirty && <Badge variant="destructive">저장 안 한 변경</Badge>}
      <Button variant="outline" className="h-11" disabled={saveDraft.isPending || !dirty} onClick={() => saveDraft.mutate({ definition: d, expectedRowVersion: rowVersion })}>
        {saveDraft.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}초안 저장
      </Button>
    </div>
  );

  const stepper = (
    <div className="flex flex-wrap gap-2">
      {STEPS.map((t, i) => (
        <Button key={t} variant={step === i ? "default" : "outline"} className="h-11" onClick={() => setStep(i)}>{i + 1}. {t}</Button>
      ))}
    </div>
  );

  // ── ① 사용할 기록 ──
  const step1 = (
    <Card>
      <CardHeader><CardTitle className="text-base">사용할 기록</CardTitle><CardDescription>우리 회사가 매일 쓰는 기록만 고르세요. 처음이면 참고 템플릿을 불러온 뒤 고치는 것이 빠릅니다.</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          {DAILY_LOG_SECTIONS.map((sec) => (
            <label key={sec} className="flex min-h-11 items-center gap-2 rounded-md border p-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={d.enabledSections.includes(sec)}
                onChange={(e) => edit((x) => ({ ...x, enabledSections: e.target.checked ? DAILY_LOG_SECTIONS.filter((k) => k === sec || x.enabledSections.includes(k)) : x.enabledSections.filter((k) => k !== sec) }))} />
              {d.sectionInfo[sec]?.title || SECTION_TITLES[sec]}
            </label>
          ))}
        </div>
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <p className="text-sm font-medium">참고 템플릿</p>
          {(templates.data as any[] | undefined)?.map((t) => (
            <div key={t.code} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">{t.title}</span>
              <Button variant="outline" className="h-11" disabled={!!s.active} onClick={() => loadTemplate(t.code)}><Upload className="h-4 w-4 mr-1" />초안으로 불러오기</Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">불러와도 바로 적용되지 않습니다 — 저장·미리보기·발행을 거쳐야 합니다.</p>
        </div>
      </CardContent>
    </Card>
  );

  // ── ② 구역·대상·기준 ──
  const step2 = (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">구역</CardTitle><CardDescription>측정 대상이 있는 장소 (예: 원재료실, 냉동창고)</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {d.zones.map((z) => (
            <div key={z.zoneId} className="flex flex-wrap items-center gap-2">
              <Input className="h-11 w-56" value={z.name} onChange={(e) => edit((x) => ({ ...x, zones: x.zones.map((k) => (k.zoneId === z.zoneId ? { ...k, name: e.target.value } : k)) }))} />
              <label className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" className="h-5 w-5" checked={z.active}
                onChange={(e) => edit((x) => ({ ...x, zones: x.zones.map((k) => (k.zoneId === z.zoneId ? { ...k, active: e.target.checked } : k)) }))} />사용</label>
              {!prevIds.zones.has(z.zoneId) && <Button variant="ghost" className="h-11 text-red-600" onClick={() => edit((x) => ({ ...x, zones: x.zones.filter((k) => k.zoneId !== z.zoneId) }))}>빼기</Button>}
            </div>
          ))}
          <Button variant="outline" className="h-11" onClick={() => edit((x) => ({ ...x, zones: [...x.zones, { zoneId: newId("z"), name: "새 구역", sortOrder: (x.zones.length + 1) * 10, active: true }] }))}><Plus className="h-4 w-4 mr-1" />구역 추가</Button>
        </CardContent>
      </Card>

      {d.enabledSections.map((sec) => (
        <Card key={sec}>
          <CardHeader className="pb-2"><CardTitle className="text-base">{d.sectionInfo[sec]?.title || SECTION_TITLES[sec]}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">제목</Label><Input className="h-11" value={d.sectionInfo[sec]?.title ?? SECTION_TITLES[sec]} onChange={(e) => setInfo(sec, { title: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">관리기준 문구</Label><Input className="h-11" value={d.sectionInfo[sec]?.criteriaText ?? ""} onChange={(e) => setInfo(sec, { criteriaText: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">점검방법</Label><Input className="h-11" value={d.sectionInfo[sec]?.method ?? ""} onChange={(e) => setInfo(sec, { method: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">주기</Label><Input className="h-11" value={d.sectionInfo[sec]?.cycle ?? ""} onChange={(e) => setInfo(sec, { cycle: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">개선조치 절차 (한 줄에 하나)</Label>
              <Textarea className="min-h-20 text-sm" value={(d.sectionInfo[sec]?.actions ?? []).join("\n")} onChange={(e) => setInfo(sec, { actions: e.target.value.split("\n").slice(0, 10) })} /></div>

            {!isMeasure(sec) && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">점검 질문 — 문구는 원본 기준서와 맞춰 두었습니다. 여기서는 사용 여부만 바꿉니다.</p>
                {d.questions.filter((qq) => qq.section === sec).map((qq) => (
                  <label key={qq.itemId} className={cn("flex min-h-11 items-start gap-2 rounded border p-2 text-sm", !qq.active && "opacity-50")}>
                    <input type="checkbox" className="mt-0.5 h-5 w-5" checked={qq.active}
                      onChange={(e) => edit((x) => ({ ...x, questions: x.questions.map((k) => (k.itemId === qq.itemId ? { ...k, active: e.target.checked } : k)) }))} />
                    <span><span className="text-xs text-muted-foreground mr-1">{[qq.stage, qq.category].filter(Boolean).join(" · ")}</span>{qq.sortOrder}. {qq.text}</span>
                  </label>
                ))}
                {!d.questions.some((qq) => qq.section === sec) && <p className="text-sm text-amber-700">질문이 없습니다 — ①에서 참고 템플릿을 불러오세요.</p>}
              </div>
            )}

            {isMeasure(sec) && (
              <div className="space-y-2">
                {d.points.filter((p) => p.section === sec).map((p) => (
                  <div key={p.pointId} className={cn("space-y-2 rounded-md border p-2", !p.active && "opacity-60")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input className="h-11 w-48" value={p.name} placeholder="대상 이름 (예: 냉동고1호)" onChange={(e) => setPoint(p.pointId, (k) => ({ ...k, name: e.target.value }))} />
                      <select className="h-11 rounded-md border bg-background px-2 text-sm" value={p.zoneId} onChange={(e) => setPoint(p.pointId, (k) => ({ ...k, zoneId: e.target.value }))}>
                        {!d.zones.some((z) => z.zoneId === p.zoneId) && <option value={p.zoneId}>구역 고르기</option>}
                        {d.zones.map((z) => <option key={z.zoneId} value={z.zoneId}>{z.name}{z.active ? "" : " (사용 안 함)"}</option>)}
                      </select>
                      <label className="flex min-h-11 items-center gap-1 text-sm"><input type="checkbox" className="h-5 w-5" checked={p.active} onChange={(e) => setPoint(p.pointId, (k) => ({ ...k, active: e.target.checked }))} />사용</label>
                      {!prevIds.points.has(p.pointId) && <Button variant="ghost" className="h-11 text-red-600" onClick={() => edit((x) => ({ ...x, points: x.points.filter((k) => k.pointId !== p.pointId) }))}>빼기</Button>}
                    </div>
                    {(["temperature", "humidity"] as MeasureKind[]).map((k) => (
                      <SpecEditor key={k} kind={k} spec={p.measurements[k]} onChange={(spec) => setPoint(p.pointId, (x) => ({ ...x, measurements: { ...x.measurements, [k]: spec } }))} />
                    ))}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-muted-foreground">회차</span>
                      {p.slots.map((sl) => (
                        <div key={sl.slotId} className="flex items-center gap-1 rounded border px-1">
                          <Input className="h-11 w-20" value={sl.label} onChange={(e) => setPoint(p.pointId, (x) => ({ ...x, slots: x.slots.map((z) => (z.slotId === sl.slotId ? { ...z, label: e.target.value } : z)) }))} />
                          <Input type="time" className="h-11 w-28" value={sl.plannedTime ?? ""} onChange={(e) => setPoint(p.pointId, (x) => ({ ...x, slots: x.slots.map((z) => (z.slotId === sl.slotId ? { ...z, plannedTime: e.target.value || null } : z)) }))} />
                          {!prevIds.slots.has(`${p.pointId}|${sl.slotId}`) && p.slots.length > 1 && (
                            <Button variant="ghost" className="h-11 px-2 text-red-600" onClick={() => setPoint(p.pointId, (x) => ({ ...x, slots: x.slots.filter((z) => z.slotId !== sl.slotId) }))}>×</Button>
                          )}
                        </div>
                      ))}
                      <Button variant="outline" className="h-11" onClick={() => setPoint(p.pointId, (x) => ({ ...x, slots: [...x.slots, { slotId: `${x.pointId}.${newId("s")}`, label: "회차", plannedTime: null, sortOrder: (x.slots.length + 1) * 10 }] }))}><Plus className="h-4 w-4 mr-1" />회차</Button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" className="h-11" disabled={!d.zones.length} onClick={() => edit((x) => {
                  const pointId = newId("p");
                  return { ...x, points: [...x.points, { pointId, zoneId: x.zones[0].zoneId, name: "새 측정 대상", section: sec as MeasureSection, sortOrder: (x.points.length + 1) * 10, active: true,
                    measurements: { temperature: { lower: null, upper: null, lowerInclusive: true, upperInclusive: true, required: true } },
                    slots: [{ slotId: `${pointId}.am`, label: "오전", plannedTime: null, sortOrder: 10 }, { slotId: `${pointId}.pm`, label: "오후", plannedTime: null, sortOrder: 20 }] }] };
                })}><Plus className="h-4 w-4 mr-1" />측정 대상 추가</Button>
                {!d.zones.length && <p className="text-xs text-amber-700">먼저 구역을 추가하세요.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );

  // ── ③ 미리보기·발행 ──
  const canPublish = !dirty && !!s.draft && !localProblems.length && preview && !preview.problems.length;
  const step3 = (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">검사</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {localProblems.length > 0 ? (
            <div className="space-y-1 text-red-700"><p className="flex items-center gap-1 font-medium"><AlertTriangle className="h-4 w-4" />고칠 곳 {localProblems.length}건</p><ul className="list-disc pl-5">{localProblems.slice(0, 15).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          ) : (
            <p>하루 측정 {rows.length}회 · 측정 대상 {new Set(rows.map((r) => r.point.pointId)).size}곳 · 점검 질문 {activeQuestions(d).length}개 · 기록 {d.enabledSections.length}종</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-11" disabled={previewM.isPending || localProblems.length > 0} onClick={() => previewM.mutate({ definition: d })}>
              {previewM.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}서버 검사
            </Button>
            {preview && (preview.problems.length
              ? <span className="text-red-700">발행 불가 — {preview.problems.slice(0, 3).join(" / ")}</span>
              : <span className="text-green-700">서버 검사 통과</span>)}
          </div>
          {dirty && <p className="text-amber-700">저장 안 한 변경이 있습니다 — 초안 저장 후 발행할 수 있습니다.</p>}
          {!dirty && !s.draft && <p className="text-muted-foreground">발행할 초안이 없습니다 (발행본과 같음).</p>}
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={confirmPublish} disabled={!canPublish} onChange={(e) => setConfirmPublish(e.target.checked)} />
            다음에 새로 만드는 일지부터 적용되고, 이미 만든 일지는 바뀌지 않는다는 것을 확인했습니다.</label>
          <Button className="h-11" disabled={!canPublish || !confirmPublish || publish.isPending} onClick={() => publish.mutate({ expectedRowVersion: rowVersion })}>
            {publish.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}발행
          </Button>
        </CardContent>
      </Card>
      {previewPages.map((pg, i) => (
        <Card key={i}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">인쇄 미리보기 {i + 1}/{previewPages.length} — {pg.title}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto bg-white text-black">{pg.content}</CardContent></Card>
      ))}
    </div>
  );

  return shell(
    <>
      {toolbar}
      {stepper}
      {step === 0 ? step1 : step === 1 ? step2 : step3}
      <div className="flex justify-between">
        <Button variant="outline" className="h-11" disabled={step === 0} onClick={() => setStep(step - 1)}>이전</Button>
        {step < 2 && <Button className="h-11" onClick={() => setStep(step + 1)}>다음</Button>}
      </div>
    </>,
  );
}
