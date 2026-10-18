/**
 * 일일일지 v2 현장 입력 — 회사 설정(기록의 정의 스냅샷)대로 영역·구역·대상·회차를 그린다 (2026-10-18, docs/architecture/17 D2)
 *
 * - 조회만으로 일지를 만들지 않는다: 일지가 없으면 '작성 시작' 을 누를 때 만든다.
 * - 조회 실패는 빈 일지가 아니라 오류로 보인다.
 * - 저장은 진행 보존, 제출은 이 버전 기록 전체를 확인한 행위. 다른 기기에서 먼저 고쳤으면 저장이 거부된다(버전).
 * - 평가는 기준으로 계산해 보여 주고, 서버도 다시 계산한다. 미입력은 평가 없음, 0 은 값.
 * - 기준 이탈·'아니오' 는 발생내용·대응을 같은 자리에서 적는다. 측정하지 않은 대상은 '대상외' + 사유.
 */
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Loader2, Save, Send, AlertTriangle, RefreshCw, ArrowLeft, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { SECTION_TITLES, MEASURE_LABELS, MEASURE_UNITS, criteriaText, type DailyLogSection, type MeasureKind } from "@shared/dailyLog/definition";
import { expectedRows, activeQuestions, evaluateRow, v2SubmitIssues, type DailyLogRecordV2, type DeviationV2 } from "@shared/dailyLog/recordV2";

const STATUS_LABEL: Record<string, string> = { draft: "작성 중", submitted: "검토 대기", approved: "승인 완료", rejected: "반려 — 고쳐서 다시 제출" };
const rid = () => `dv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const nowParts = () => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour === "24" ? "00" : p.hour}:${p.minute}` };
};
const numOrNull = (v: string): number | null => (v.trim() === "" ? null : Number(v));

function DeviationEditor({ rec, setRec, rowId, itemId, readOnly }: { rec: DailyLogRecordV2; setRec: (f: (r: DailyLogRecordV2) => DailyLogRecordV2) => void; rowId?: string; itemId?: string; readOnly: boolean }) {
  const d = rec.deviations.find((x) => (rowId ? x.rowId === rowId : x.itemId === itemId));
  const patch = (p: Partial<DeviationV2>) => setRec((r) => {
    const cur = r.deviations.find((x) => (rowId ? x.rowId === rowId : x.itemId === itemId));
    if (cur) return { ...r, deviations: r.deviations.map((x) => (x === cur ? { ...x, ...p } : x)) };
    return { ...r, deviations: [...r.deviations, { deviationId: rid(), rowId: rowId ?? null, itemId: itemId ?? null, description: "", action: "", result: "", completedAt: null, actionBy: "", confirmedBy: "", state: "open", ...p }] };
  });
  return (
    <div className="mt-2 grid gap-2 rounded-md border border-red-200 bg-red-50/60 p-2 sm:grid-cols-2">
      <div className="space-y-1"><Label className="text-xs">발생내용</Label><Textarea disabled={readOnly} className="min-h-14 text-sm" value={d?.description ?? ""} onChange={(e) => patch({ description: e.target.value })} /></div>
      <div className="space-y-1"><Label className="text-xs">실시한 대응</Label><Textarea disabled={readOnly} className="min-h-14 text-sm" value={d?.action ?? ""} onChange={(e) => patch({ action: e.target.value })} /></div>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <Input disabled={readOnly} className="h-11 w-36" placeholder="조치자" value={d?.actionBy ?? ""} onChange={(e) => patch({ actionBy: e.target.value })} />
        <Input disabled={readOnly} type="date" className="h-11 w-40" value={d?.completedAt ?? ""} onChange={(e) => patch({ completedAt: e.target.value || null })} />
        <Button type="button" disabled={readOnly} variant={d?.state === "resolved" ? "default" : "outline"} className="h-11"
          onClick={() => patch({ state: d?.state === "resolved" ? "open" : "resolved" })}>
          {d?.state === "resolved" ? "조치 완료" : "조치 중 (누르면 완료)"}
        </Button>
      </div>
    </div>
  );
}

export default function DailyLogV2Form({ logDate, setLogDate }: { logDate: string; setLogDate: (d: string) => void }) {
  const [, navigate] = useLocation();
  const q = trpc.dailyLog.getByDate.useQuery({ logDate }, { retry: 1 });
  const [rec, setRecState] = useState<DailyLogRecordV2 | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [status, setStatus] = useState<string>("draft");
  const [recordId, setRecordId] = useState<number | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const setRec = (f: (r: DailyLogRecordV2) => DailyLogRecordV2) => setRecState((r) => (r ? f(r) : r));

  useEffect(() => {
    const d: any = q.data;
    if (d && d.formData?.schemaVersion === 2) {
      setRecState(structuredClone(d.formData));
      setDataVersion(Number(d.dataVersion ?? 0));
      setStatus(String(d.status));
      setRecordId(Number(d.id));
    } else {
      setRecState(null);
      setRecordId(d?.id ?? null);
    }
    setIssues([]);
  }, [q.data]);

  const start = trpc.dailyLog.startV2.useMutation({ onSuccess: () => q.refetch(), onError: (e: { message: string }) => toast.error(e.message) });
  const save = trpc.dailyLog.saveFullForm.useMutation({
    onSuccess: (r: any) => {
      setDataVersion(Number(r.dataVersion ?? dataVersion));
      setStatus(r.status);
      toast.success(r.status === "submitted" ? "제출했습니다 — 검토를 기다립니다." : "저장했습니다.");
      q.refetch();
    },
    onError: (e: { message: string }) => toast.error(e.message, { duration: 8000 }),
  });

  const approvalRequestId: number | null = (q.data as any)?.approvalRequestId ?? null;
  const readOnly = status === "submitted" || status === "approved";
  const def = rec?.definitionSnapshot;
  const rows = useMemo(() => (def ? expectedRows(def) : []), [def]);
  const questions = useMemo(() => (def ? activeQuestions(def) : []), [def]);
  const pointById = useMemo(() => new Map((def?.points ?? []).map((p) => [p.pointId, p])), [def]);
  const zoneName = useMemo(() => new Map((def?.zones ?? []).map((z) => [z.zoneId, z.name])), [def]);

  const updateRow = (rowId: string, p: Record<string, unknown>) => setRec((r) => ({
    ...r,
    measurements: r.measurements.map((m) => {
      if (m.rowId !== rowId) return m;
      const next = { ...m, ...p } as any;
      const pt = pointById.get(m.pointId);
      next.evaluation = pt ? evaluateRow(pt, next) : null;
      return next;
    }),
  }));
  const updateAnswer = (itemId: string, p: Record<string, unknown>) => setRec((r) => ({ ...r, answers: r.answers.map((a) => (a.itemId === itemId ? { ...a, ...p } : a)) }));
  const notesOf = (s: DailyLogSection) => (rec?.notes?.[s] as any) ?? { specialNotes: "", improvementAction: "", actionBy: "", confirmedBy: "" };
  const setNotes = (s: DailyLogSection, p: Record<string, string>) => setRec((r) => ({ ...r, notes: { ...r.notes, [s]: { ...notesOf(s), ...p } } }));

  const missingCount = useMemo(() => (rec ? v2SubmitIssues(rec, nowParts()).length : 0), [rec]);
  const doSave = (submit: boolean) => {
    if (!rec) return;
    if (submit) {
      const list = v2SubmitIssues(rec, nowParts());
      setIssues(list);
      if (list.length) { toast.error(`제출할 수 없습니다 — ${list.length}건을 확인하세요.`); return; }
    }
    save.mutate({ logDate, formData: rec, status: submit ? "submitted" : "draft", expectedDataVersion: dataVersion } as any);
  };

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-start gap-2">
        <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="일지 목록" onClick={() => navigate("/dashboard/daily-logs")}><ArrowLeft className="h-5 w-5" /></Button>
        <div>
        <h1 className="text-2xl font-bold">일일일지</h1>
        <p className="text-sm text-muted-foreground">회사 일지 설정{rec?.settingsVersionId ? ` v${rec.settingsVersionId}` : ""} 기준 — 오늘 필요한 구역·대상·회차만 보입니다.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" className="h-11 w-44" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
        {rec && <Badge variant="outline">{STATUS_LABEL[status] ?? status}</Badge>}
        {/* 인쇄 미리보기 — 승인 요청(제출 때 생김)이 있을 때만. 미리보기만 열고 인쇄창은 그 화면의 '인쇄하기' */}
        {rec && approvalRequestId && (
          <Button variant="outline" className="h-11" onClick={() => window.open(`/print-preview?ids=${approvalRequestId}&print=0`, "_blank")}><Printer className="h-4 w-4 mr-1" />인쇄 미리보기</Button>
        )}
        {rec && !readOnly && <Badge variant={missingCount ? "destructive" : "secondary"}>{missingCount ? `남은 항목 ${missingCount}` : "제출 가능"}</Badge>}
        {rec && !readOnly && (
          <>
            <Button variant="outline" className="h-11" disabled={save.isPending} onClick={() => doSave(false)}><Save className="h-4 w-4 mr-1" />저장</Button>
            <Button className="h-11" disabled={save.isPending} onClick={() => doSave(true)}>{save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}제출</Button>
          </>
        )}
      </div>
    </div>
  );

  if (q.isLoading) return <div className="space-y-4">{header}<Card><CardContent className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</CardContent></Card></div>;
  if (q.isError) return (
    <div className="space-y-4">{header}
      <Card><CardContent className="py-8 text-center space-y-2">
        <p className="text-sm text-red-700">{q.error?.message ?? "일일일지를 불러오지 못했습니다."}</p>
        <Button variant="outline" onClick={() => q.refetch()}><RefreshCw className="h-4 w-4 mr-1" />다시 시도</Button>
      </CardContent></Card>
    </div>
  );
  if (!rec) return (
    <div className="space-y-4">{header}
      <Card><CardContent className="py-8 text-center space-y-3">
        {recordId
          ? <p className="text-sm text-amber-700">이 날짜에는 이전 방식으로 만든 일지가 있습니다 — 이전 일지 화면에서 확인하세요 (자동으로 바꾸지 않습니다).</p>
          : <><p className="text-sm text-muted-foreground">{logDate} 일지가 아직 없습니다.</p>
              <Button className="h-11" disabled={start.isPending} onClick={() => start.mutate({ logDate })}>{start.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}작성 시작</Button></>}
      </CardContent></Card>
    </div>
  );

  const sections = def!.enabledSections;
  return (
    <div className="space-y-4">
      {header}
      {issues.length > 0 && (
        <Card className="border-red-300">
          <CardContent className="py-3 space-y-1">
            <p className="text-sm font-medium text-red-700 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />제출 전에 확인할 항목 {issues.length}건</p>
            <ul className="text-sm list-disc pl-5 space-y-0.5">{issues.slice(0, 12).map((x, i) => <li key={i}>{x}</li>)}</ul>
            {issues.length > 12 && <p className="text-xs text-muted-foreground">외 {issues.length - 12}건</p>}
          </CardContent>
        </Card>
      )}
      <Tabs defaultValue={sections[0]}>
        <TabsList className="flex h-auto flex-wrap">
          {sections.map((s) => <TabsTrigger key={s} value={s} className="min-h-11">{def!.sectionInfo[s]?.title || SECTION_TITLES[s]}</TabsTrigger>)}
        </TabsList>
        {sections.map((s) => (
          <TabsContent key={s} value={s} className="space-y-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{def!.sectionInfo[s]?.title || SECTION_TITLES[s]}</CardTitle>
                {def!.sectionInfo[s]?.criteriaText && <CardDescription>관리기준: {def!.sectionInfo[s]!.criteriaText}</CardDescription>}
              </CardHeader>
              <CardContent className="space-y-2">
                {(s === "hygiene" || s === "foreign") && questions.filter((x) => x.section === s).map((qq) => {
                  const a = rec.answers.find((x) => x.itemId === qq.itemId);
                  if (!a) return null;
                  const temp = qq.responseType !== "check";
                  return (
                    <div key={qq.itemId} id={`q-${qq.itemId}`} className={cn("rounded-md border p-2", a.value === "no" && "border-red-300 bg-red-50/40")}>
                      <p className="text-sm"><span className="text-xs text-muted-foreground mr-1">{[qq.stage, qq.category].filter(Boolean).join(" · ")}</span>{qq.sortOrder}. {qq.text}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {qq.responseType !== "temperature" && (["yes", "no"] as const).map((v) => (
                          <Button key={v} type="button" disabled={readOnly} variant={a.value === v ? (v === "yes" ? "default" : "destructive") : "outline"} className="h-11 min-w-20"
                            onClick={() => updateAnswer(qq.itemId, { value: a.value === v ? null : v })}>{v === "yes" ? "예" : "아니오"}</Button>
                        ))}
                        {temp && (
                          <>
                            <Input type="number" inputMode="decimal" step="0.1" disabled={readOnly || a.notApplicable} className="h-11 w-28" placeholder="온도"
                              value={a.numericValue ?? ""} onChange={(e) => updateAnswer(qq.itemId, { numericValue: numOrNull(e.target.value) })} />
                            <span className="text-sm">℃</span>
                            <label className="flex items-center gap-1 text-sm"><input type="checkbox" className="h-5 w-5" disabled={readOnly} checked={a.notApplicable}
                              onChange={(e) => updateAnswer(qq.itemId, { notApplicable: e.target.checked, ...(e.target.checked ? { numericValue: null } : { notApplicableReason: "" }) })} />운송 없음</label>
                            {a.notApplicable && <Input disabled={readOnly} className="h-11 w-44" placeholder="사유" value={a.notApplicableReason} onChange={(e) => updateAnswer(qq.itemId, { notApplicableReason: e.target.value })} />}
                          </>
                        )}
                      </div>
                      {a.value === "no" && <DeviationEditor rec={rec} setRec={setRec} itemId={qq.itemId} readOnly={readOnly} />}
                    </div>
                  );
                })}
                {s !== "hygiene" && s !== "foreign" && rows.filter((r) => r.point.section === s).map((r) => {
                  const m = rec.measurements.find((x) => x.rowId === r.rowId);
                  if (!m) return null;
                  const kinds = (["temperature", "humidity"] as MeasureKind[]).filter((k) => r.point.measurements[k]);
                  const ev = m.notApplicable ? "대상외" : m.evaluation === "pass" ? "적합" : m.evaluation === "fail" ? "부적합" : "미기록";
                  return (
                    <div key={r.rowId} id={`row-${r.rowId}`} className={cn("rounded-md border p-2", m.evaluation === "fail" && "border-red-300 bg-red-50/40")}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{zoneName.get(r.point.zoneId) && zoneName.get(r.point.zoneId) !== r.point.name ? `${zoneName.get(r.point.zoneId)} · ` : ""}{r.point.name} · {r.slotLabel}</p>
                        <Badge variant={ev === "부적합" ? "destructive" : ev === "적합" ? "default" : "outline"}>{ev}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">기준 {kinds.map((k) => `${MEASURE_LABELS[k]} ${criteriaText(k, r.point.measurements[k])}`).join(", ")}</p>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <div className="space-y-1"><Label className="text-xs">측정시각</Label><Input type="time" disabled={readOnly || m.notApplicable} className="h-11 w-40" value={m.measuredAt ?? ""} onChange={(e) => updateRow(r.rowId, { measuredAt: e.target.value || null })} /></div>
                        {kinds.map((k) => (
                          <div key={k} className="space-y-1"><Label className="text-xs">{MEASURE_LABELS[k]} ({MEASURE_UNITS[k]})</Label>
                            <Input type="number" inputMode="decimal" step="0.1" disabled={readOnly || m.notApplicable} className="h-11 w-28" value={(m as any)[k] ?? ""}
                              onChange={(e) => updateRow(r.rowId, { [k]: numOrNull(e.target.value) })} /></div>
                        ))}
                        <label className="flex h-11 items-center gap-1 text-sm"><input type="checkbox" className="h-5 w-5" disabled={readOnly} checked={m.notApplicable}
                          onChange={(e) => updateRow(r.rowId, { notApplicable: e.target.checked, ...(e.target.checked ? {} : { notApplicableReason: "" }) })} />대상외</label>
                        {m.notApplicable && <Input disabled={readOnly} className="h-11 w-48" placeholder="사유 (예: 설비 정지)" value={m.notApplicableReason} onChange={(e) => updateRow(r.rowId, { notApplicableReason: e.target.value })} />}
                      </div>
                      {m.evaluation === "fail" && <DeviationEditor rec={rec} setRec={setRec} rowId={r.rowId} readOnly={readOnly} />}
                    </div>
                  );
                })}
                <div className="grid gap-2 pt-2 sm:grid-cols-2">
                  <div className="space-y-1"><Label className="text-xs">특이사항</Label><Textarea disabled={readOnly} value={notesOf(s).specialNotes} onChange={(e) => setNotes(s, { specialNotes: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">개선조치 및 결과</Label><Textarea disabled={readOnly} value={notesOf(s).improvementAction} onChange={(e) => setNotes(s, { improvementAction: e.target.value })} /></div>
                </div>
                {def!.sectionInfo[s]?.actions?.length ? (
                  <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-1">개선조치 절차 보기</summary>{def!.sectionInfo[s]!.actions.map((x, i) => <p key={i}>{x}</p>)}</details>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
