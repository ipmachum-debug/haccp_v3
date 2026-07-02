/**
 * Environmental Monitoring (환경 모니터링 EMP) 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-12)
 *
 * URL 패턴: /dashboard/{industry}/environmental-monitoring
 *
 * 표준 적용:
 *   - FSSC 22000 (Environmental Monitoring) / Codex CXC 1-1969
 *   - Zone(1~4) 기반 채취 지점별 병원균/지표균/ATP 검사 + 부적합 시정조치.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { FriendlyErrorBox } from "@/components/ui/FriendlyErrorBox";
import { toast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import type { IndustryKey } from "@/lib/menuTypes";
import { INDUSTRY_LABELS } from "@/lib/menuTypes";

const STATUS_VALUES = ["draft", "under_review", "approved", "archived"] as const;
type EmStatus = (typeof STATUS_VALUES)[number];
const STATUS_LABELS: Record<EmStatus, string> = {
  draft: "초안", under_review: "검토 중", approved: "승인", archived: "종결",
};
const STATUS_VARIANTS: Record<EmStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline", under_review: "secondary", approved: "default", archived: "secondary",
};

const ZONE_LABELS = {
  zone1: "Zone 1 (식품접촉면)",
  zone2: "Zone 2 (인접 비접촉)",
  zone3: "Zone 3 (처리구역)",
  zone4: "Zone 4 (외부)",
} as const;
type Zone = keyof typeof ZONE_LABELS;
const ZONE_COLOR: Record<Zone, string> = {
  zone1: "bg-red-100 text-red-800",
  zone2: "bg-amber-100 text-amber-800",
  zone3: "bg-blue-100 text-blue-800",
  zone4: "bg-gray-100 text-gray-700",
};

const TARGET_LABELS = {
  listeria: "리스테리아", salmonella: "살모넬라", e_coli: "대장균",
  coliform: "대장균군", apc: "일반세균", yeast_mold: "효모·곰팡이",
  atp: "ATP", other: "기타",
} as const;
type Target = keyof typeof TARGET_LABELS;

const METHOD_LABELS = {
  swab: "면봉 도말", contact_plate: "접촉배지", air_settle: "낙하균", water: "용수", atp: "ATP",
} as const;
type Method = keyof typeof METHOD_LABELS;

const RESULT_LABELS = { pass: "적합", fail: "부적합", pending: "대기" } as const;
type Result = keyof typeof RESULT_LABELS;
const RESULT_VARIANTS: Record<Result, "default" | "secondary" | "destructive" | "outline"> = {
  pass: "default", fail: "destructive", pending: "outline",
};

const ALLOWED_TRANSITIONS: Record<EmStatus, readonly EmStatus[]> = {
  draft: ["under_review"],
  under_review: ["approved", "draft"],
  approved: ["under_review", "archived"],
  archived: [],
};

interface Props {
  industry: IndustryKey;
  embedded?: boolean;
}

export default function FoodEnvironmentalMonitoringPage({ industry, embedded }: Props) {
  const [statusFilter, setStatusFilter] = useState<EmStatus | "all">("all");
  const [zoneFilter, setZoneFilter] = useState<Zone | "all">("all");
  const [resultFilter, setResultFilter] = useState<Result | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [resultTarget, setResultTarget] = useState<{ id: number; code: string } | null>(null);

  const listQuery = trpc.environmentalMonitoring.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    zone: zoneFilter === "all" ? undefined : zoneFilter,
    result: resultFilter === "all" ? undefined : resultFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const invalidate = () => utils.environmentalMonitoring.list.invalidate();

  const createMut = trpc.environmentalMonitoring.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "초안 단계 시작" });
      setCreateOpen(false);
      invalidate();
    },
    onError: (err) => toast({ title: "등록 실패", description: err.message, variant: "destructive" }),
  });
  const setResultMut = trpc.environmentalMonitoring.setResult.useMutation({
    onSuccess: () => {
      toast({ title: "결과가 저장되었습니다" });
      setResultTarget(null);
      invalidate();
    },
    onError: (err) => toast({ title: "저장 실패", description: err.message, variant: "destructive" }),
  });
  const transitionMut = trpc.environmentalMonitoring.transition.useMutation({
    onSuccess: (res) => {
      toast({ title: "상태 전이 성공", description: STATUS_LABELS[res.status as EmStatus] });
      invalidate();
    },
    onError: (err) => toast({ title: "상태 전이 실패", description: err.message, variant: "destructive" }),
  });

  const failCount = listQuery.data?.filter((r) => r.result === "fail" && r.status !== "archived").length ?? 0;

  const content = (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">환경 모니터링 (Environmental Monitoring)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — FSSC 22000 / Codex — Zone(1~4) 채취 지점별 병원균·지표균·ATP 모니터링
            </p>
          </div>
          <div className="flex items-center gap-3">
            {failCount > 0 && <Badge variant="destructive">⚠ 부적합 {failCount}건</Badge>}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>+ 신규 채취 기록</Button>
              </DialogTrigger>
              <CreateDialog
                industry={industry}
                onSubmit={(data) => createMut.mutate({ industry, ...data })}
                loading={createMut.isPending}
              />
            </Dialog>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>채취 기록</CardTitle>
            <div className="flex gap-2">
              <Select value={zoneFilter} onValueChange={(v) => setZoneFilter(v as Zone | "all")}>
                <SelectTrigger className="w-40"><SelectValue placeholder="구역" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 구역</SelectItem>
                  {(Object.keys(ZONE_LABELS) as Zone[]).map((z) => (
                    <SelectItem key={z} value={z}>{ZONE_LABELS[z]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={resultFilter} onValueChange={(v) => setResultFilter(v as Result | "all")}>
                <SelectTrigger className="w-28"><SelectValue placeholder="판정" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 판정</SelectItem>
                  {(Object.keys(RESULT_LABELS) as Result[]).map((r) => (
                    <SelectItem key={r} value={r}>{RESULT_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as EmStatus | "all")}>
                <SelectTrigger className="w-28"><SelectValue placeholder="상태" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 상태</SelectItem>
                  {STATUS_VALUES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : listQuery.error ? (
              <FriendlyErrorBox message={listQuery.error.message} />
            ) : !listQuery.data || listQuery.data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">등록된 채취 기록이 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>채취일</TableHead>
                    <TableHead>구역</TableHead>
                    <TableHead>지점 / 대상</TableHead>
                    <TableHead>판정</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((r) => (
                    <TableRow key={r.id} className={r.result === "fail" ? "bg-red-50/40" : ""}>
                      <TableCell className="font-mono">{r.code}</TableCell>
                      <TableCell className="text-sm">{r.samplingDate}</TableCell>
                      <TableCell>
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ZONE_COLOR[r.zone as Zone]}`}>
                          {ZONE_LABELS[r.zone as Zone].split(" ")[0]} {ZONE_LABELS[r.zone as Zone].split(" ")[1]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.location}</div>
                        <div className="text-xs text-muted-foreground">
                          {TARGET_LABELS[r.target as Target]} · {METHOD_LABELS[r.method as Method]}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={RESULT_VARIANTS[r.result as Result]}>{RESULT_LABELS[r.result as Result]}</Badge>
                          {r.resultValue && <span className="text-xs text-muted-foreground">{r.resultValue}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[r.status as EmStatus]}>{STATUS_LABELS[r.status as EmStatus]}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {r.status !== "archived" && (
                            <Button size="sm" variant="outline" onClick={() => setResultTarget({ id: r.id, code: r.code })}>
                              결과입력
                            </Button>
                          )}
                          <TransitionActions
                            currentStatus={r.status as EmStatus}
                            onTransition={(toStatus) => transitionMut.mutate({ industry, id: r.id, toStatus })}
                            disabled={transitionMut.isPending}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {resultTarget && (
          <ResultDialog
            code={resultTarget.code}
            loading={setResultMut.isPending}
            onClose={() => setResultTarget(null)}
            onSubmit={(data) => setResultMut.mutate({ industry, id: resultTarget.id, ...data })}
          />
        )}
      </div>
  );
  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}

/* ─────────── 신규 등록 다이얼로그 ─────────── */
function CreateDialog({
  industry,
  onSubmit,
  loading,
}: {
  industry: IndustryKey;
  onSubmit: (data: {
    samplingDate: string;
    zone: Zone;
    location: string;
    target: Target;
    method: Method;
    limitCriteria: string | null;
    notes: string | null;
  }) => void;
  loading: boolean;
}) {
  const [samplingDate, setSamplingDate] = useState("");
  const [zone, setZone] = useState<Zone>("zone1");
  const [location, setLocation] = useState("");
  const [target, setTarget] = useState<Target>("listeria");
  const [method, setMethod] = useState<Method>("swab");
  const [limit, setLimit] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>신규 채취 기록 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">채취일 *</label>
            <Input type="date" value={samplingDate} onChange={(e) => setSamplingDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">위생 구역 *</label>
            <Select value={zone} onValueChange={(v) => setZone(v as Zone)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ZONE_LABELS) as Zone[]).map((z) => (
                  <SelectItem key={z} value={z}>{ZONE_LABELS[z]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">채취 지점 *</label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 충진기 노즐 / 바닥 배수구 / 컨베이어 벨트" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">검사 대상 *</label>
            <Select value={target} onValueChange={(v) => setTarget(v as Target)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TARGET_LABELS) as Target[]).map((t) => (
                  <SelectItem key={t} value={t}>{TARGET_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">방법 *</label>
            <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
                  <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">기준</label>
            <Input value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="예: 불검출 / < 100 CFU" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">비고</label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <p className="text-xs text-muted-foreground">※ 등록 시 판정은 '대기'로 시작하며, 배양 완료 후 '결과입력'으로 판정을 기록합니다.</p>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              samplingDate,
              zone,
              location: location.trim(),
              target,
              method,
              limitCriteria: limit.trim() || null,
              notes: notes.trim() || null,
            })
          }
          disabled={!samplingDate || !location.trim() || loading}
        >
          {loading ? "등록 중..." : "등록 (초안)"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ─────────── 결과 입력 다이얼로그 ─────────── */
function ResultDialog({
  code,
  loading,
  onClose,
  onSubmit,
}: {
  code: string;
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: { result: Result; resultValue: string | null; correctiveAction: string | null }) => void;
}) {
  const [result, setResult] = useState<Result>("pass");
  const [resultValue, setResultValue] = useState("");
  const [corrective, setCorrective] = useState("");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>결과 입력 — {code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">판정 *</label>
              <Select value={result} onValueChange={(v) => setResult(v as Result)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pass">적합</SelectItem>
                  <SelectItem value="fail">부적합</SelectItem>
                  <SelectItem value="pending">대기</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">측정값/상세</label>
              <Input value={resultValue} onChange={(e) => setResultValue(e.target.value)} placeholder="예: 불검출 / 120 CFU / 250 RLU" />
            </div>
          </div>
          {result === "fail" && (
            <div>
              <label className="text-sm font-medium text-red-700">시정조치 (부적합)</label>
              <Textarea value={corrective} onChange={(e) => setCorrective(e.target.value)} rows={3}
                placeholder="재세척·재소독, 재채취, 원인분석, CAPA 발행 등" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            onClick={() => onSubmit({ result, resultValue: resultValue.trim() || null, correctiveAction: corrective.trim() || null })}
            disabled={loading}
          >
            {loading ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────── 상태 전이 버튼 ─────────── */
function TransitionActions({
  currentStatus,
  onTransition,
  disabled,
}: {
  currentStatus: EmStatus;
  onTransition: (toStatus: EmStatus) => void;
  disabled: boolean;
}) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (allowed.length === 0) return <span className="text-xs text-muted-foreground">종결</span>;
  return (
    <>
      {allowed.map((s) => (
        <Button key={s} size="sm" variant="outline" onClick={() => onTransition(s)} disabled={disabled}>
          {STATUS_LABELS[s]}
        </Button>
      ))}
    </>
  );
}
