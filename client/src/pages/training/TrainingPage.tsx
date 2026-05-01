/**
 * Training 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-3)
 *
 * Cross-cutting — 모든 industry 동일 페이지 재사용.
 * URL 패턴: /dashboard/{industry}/training
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
import { toast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import type { IndustryKey } from "@/lib/menuTypes";
import { INDUSTRY_LABELS } from "@/lib/menuTypes";

const STATUS_VALUES = [
  "planned", "scheduled", "in_progress", "completed", "archived", "cancelled",
] as const;
type TrainingStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<TrainingStatus, string> = {
  planned: "계획",
  scheduled: "일정 확정",
  in_progress: "진행 중",
  completed: "종료",
  archived: "아카이브",
  cancelled: "취소",
};

const STATUS_VARIANTS: Record<TrainingStatus, "default" | "secondary" | "destructive" | "outline"> = {
  planned: "outline",
  scheduled: "secondary",
  in_progress: "secondary",
  completed: "default",
  archived: "default",
  cancelled: "destructive",
};

const TYPE_LABELS = {
  internal: "내부 교육",
  external: "외부 위탁",
  on_the_job: "OJT",
  regulatory: "법규 강의",
} as const;
type TrainingType = keyof typeof TYPE_LABELS;

const ALLOWED_TRANSITIONS: Record<TrainingStatus, readonly TrainingStatus[]> = {
  planned: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["archived"],
  archived: [],
  cancelled: [],
};

interface Props {
  industry: IndustryKey;
}

export default function TrainingPage({ industry }: Props) {
  const [statusFilter, setStatusFilter] = useState<TrainingStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<TrainingType | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = trpc.coreMes.training.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    type: typeFilter === "all" ? undefined : typeFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.coreMes.training.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "계획 단계 시작" });
      setCreateOpen(false);
      utils.coreMes.training.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.coreMes.training.transition.useMutation({
    onSuccess: (res) => {
      toast({
        title: "상태 전이 성공",
        description: STATUS_LABELS[res.status as TrainingStatus],
      });
      utils.coreMes.training.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "상태 전이 실패", description: err.message, variant: "destructive" });
    },
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">교육 / 훈련 (Training)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — KGMP §6 / ISO 22716 §7 / ISO 13485 §6.2 인적 자원 교육 기록
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>+ 신규 교육 등록</Button>
            </DialogTrigger>
            <CreateDialog
              industry={industry}
              onSubmit={(data) => createMut.mutate({ industry, ...data })}
              loading={createMut.isPending}
            />
          </Dialog>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>교육 목록</CardTitle>
            <div className="flex gap-2">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TrainingType | "all")}>
                <SelectTrigger className="w-40"><SelectValue placeholder="유형" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 유형</SelectItem>
                  <SelectItem value="internal">{TYPE_LABELS.internal}</SelectItem>
                  <SelectItem value="external">{TYPE_LABELS.external}</SelectItem>
                  <SelectItem value="on_the_job">{TYPE_LABELS.on_the_job}</SelectItem>
                  <SelectItem value="regulatory">{TYPE_LABELS.regulatory}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TrainingStatus | "all")}>
                <SelectTrigger className="w-40"><SelectValue placeholder="상태" /></SelectTrigger>
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
              <div className="text-center py-8 text-red-500">오류: {listQuery.error.message}</div>
            ) : !listQuery.data || listQuery.data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">등록된 교육이 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>주제</TableHead>
                    <TableHead>강사</TableHead>
                    <TableHead>예정일</TableHead>
                    <TableHead className="text-center">이수자</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((tr) => {
                    const passed = tr.attendees.filter((a) => a.status === "passed").length;
                    return (
                      <TableRow key={tr.id}>
                        <TableCell className="font-mono">{tr.code}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {TYPE_LABELS[tr.type as TrainingType]}
                          </Badge>
                        </TableCell>
                        <TableCell>{tr.title}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{tr.subject}</TableCell>
                        <TableCell>
                          <div>{tr.trainerName}</div>
                          <div className="text-xs text-muted-foreground">
                            {tr.trainerType === "internal" ? "사내" : "외부"}
                          </div>
                        </TableCell>
                        <TableCell>{tr.scheduledDate}</TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-sm">
                            {passed}/{tr.attendees.length}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[tr.status as TrainingStatus]}>
                            {STATUS_LABELS[tr.status as TrainingStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TransitionActions
                            currentStatus={tr.status as TrainingStatus}
                            onTransition={(toStatus) =>
                              transitionMut.mutate({ industry, id: tr.id, toStatus })
                            }
                            disabled={transitionMut.isPending}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

/* ─────────── 신규 등록 다이얼로그 ─────────── */
function CreateDialog({
  industry,
  onSubmit,
  loading,
}: {
  industry: IndustryKey;
  onSubmit: (data: {
    type: TrainingType;
    title: string;
    subject: string;
    description: string;
    trainerName: string;
    trainerType: "internal" | "external";
    scheduledDate: string;
    durationMinutes?: number;
  }) => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const oneMonthLater = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const [type, setType] = useState<TrainingType>("internal");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [trainerName, setTrainerName] = useState("");
  const [trainerType, setTrainerType] = useState<"internal" | "external">("internal");
  const [scheduledDate, setScheduledDate] = useState(oneMonthLater);
  const [durationMinutes, setDurationMinutes] = useState("60");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>신규 교육 등록 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">유형 *</label>
            <Select value={type} onValueChange={(v) => setType(v as TrainingType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">{TYPE_LABELS.internal}</SelectItem>
                <SelectItem value="external">{TYPE_LABELS.external}</SelectItem>
                <SelectItem value="on_the_job">{TYPE_LABELS.on_the_job}</SelectItem>
                <SelectItem value="regulatory">{TYPE_LABELS.regulatory}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">예정일 *</label>
            <Input type="date" value={scheduledDate} min={today} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">제목 *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026년 1차 위생 교육" />
        </div>
        <div>
          <label className="text-sm font-medium">주제 / 영역 *</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="예: 개인위생, CCP 모니터링, GMP §6" />
        </div>
        <div>
          <label className="text-sm font-medium">상세 설명 *</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="교육 목적 / 대상 / 핵심 내용" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">강사 이름 *</label>
            <Input value={trainerName} onChange={(e) => setTrainerName(e.target.value)} placeholder="강사 이름" />
          </div>
          <div>
            <label className="text-sm font-medium">강사 유형 *</label>
            <Select value={trainerType} onValueChange={(v) => setTrainerType(v as "internal" | "external")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">사내</SelectItem>
                <SelectItem value="external">외부</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">시간 (분) *</label>
            <Input
              type="number"
              min="1"
              max="10080"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              type,
              title: title.trim(),
              subject: subject.trim(),
              description: description.trim(),
              trainerName: trainerName.trim(),
              trainerType,
              scheduledDate,
              durationMinutes: Number(durationMinutes),
            })
          }
          disabled={
            !title.trim() || !subject.trim() || !description.trim() ||
            !trainerName.trim() || !scheduledDate ||
            Number(durationMinutes) < 1 || loading
          }
        >
          {loading ? "등록 중..." : "등록 (계획)"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ─────────── 상태 전이 버튼 ─────────── */
function TransitionActions({
  currentStatus,
  onTransition,
  disabled,
}: {
  currentStatus: TrainingStatus;
  onTransition: (toStatus: TrainingStatus) => void;
  disabled: boolean;
}) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (allowed.length === 0) {
    return <span className="text-xs text-muted-foreground">종결</span>;
  }
  return (
    <div className="flex gap-1 flex-wrap">
      {allowed.map((s) => (
        <Button
          key={s}
          size="sm"
          variant={s === "cancelled" ? "destructive" : "outline"}
          onClick={() => onTransition(s)}
          disabled={disabled}
        >
          {STATUS_LABELS[s]}
        </Button>
      ))}
    </div>
  );
}
