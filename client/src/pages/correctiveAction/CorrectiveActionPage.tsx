/**
 * CAPA 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-2-2)
 *
 * Cross-cutting 도메인 — 모든 industry 가 동일 페이지 재사용.
 * URL 패턴: /dashboard/{industry}/corrective-action
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
import DashboardLayout from "@/pages/DashboardLayout";
import type { IndustryKey } from "@/lib/menuTypes";
import { INDUSTRY_LABELS } from "@/lib/menuTypes";

const STATUS_VALUES = [
  "planned", "in_progress", "effectiveness_check", "closed", "cancelled",
] as const;
type CapaStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<CapaStatus, string> = {
  planned: "계획",
  in_progress: "실행 중",
  effectiveness_check: "효과성 검증",
  closed: "종결",
  cancelled: "취소",
};

const STATUS_VARIANTS: Record<CapaStatus, "default" | "secondary" | "destructive" | "outline"> = {
  planned: "outline",
  in_progress: "secondary",
  effectiveness_check: "secondary",
  closed: "default",
  cancelled: "destructive",
};

const TYPE_LABELS = { corrective: "시정조치", preventive: "예방조치" } as const;
const PRIORITY_LABELS = {
  critical: "중대", high: "높음", medium: "보통", low: "낮음",
} as const;
const PRIORITY_VARIANTS = {
  critical: "destructive",
  high: "default",
  medium: "secondary",
  low: "outline",
} as const;

const ALLOWED_TRANSITIONS: Record<CapaStatus, readonly CapaStatus[]> = {
  planned: ["in_progress", "cancelled"],
  in_progress: ["effectiveness_check", "cancelled"],
  effectiveness_check: ["closed", "in_progress"],
  closed: [],
  cancelled: [],
};

interface Props {
  industry: IndustryKey;
}

export default function CorrectiveActionPage({ industry }: Props) {
  const [statusFilter, setStatusFilter] = useState<CapaStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = trpc.correctiveAction.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.correctiveAction.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "계획 단계 시작" });
      setCreateOpen(false);
      utils.correctiveAction.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.correctiveAction.transition.useMutation({
    onSuccess: (res) => {
      toast({
        title: "상태 전이 성공",
        description: STATUS_LABELS[res.status as CapaStatus],
      });
      utils.correctiveAction.list.invalidate();
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
            <h1 className="text-2xl font-bold">CAPA (시정·예방조치)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — 계획 → 실행 → 효과성 검증 → 종결
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>+ 신규 CAPA 등록</Button>
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
            <CardTitle>CAPA 목록</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as CapaStatus | "all")}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="상태 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : listQuery.error ? (
              <div className="text-center py-8 text-red-500">
                오류: {listQuery.error.message}
              </div>
            ) : !listQuery.data || listQuery.data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                등록된 CAPA 가 없습니다.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>우선순위</TableHead>
                    <TableHead>마감일</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((ca) => (
                    <TableRow key={ca.id}>
                      <TableCell className="font-mono">{ca.code}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABELS[ca.type as keyof typeof TYPE_LABELS]}</Badge>
                      </TableCell>
                      <TableCell>{ca.title}</TableCell>
                      <TableCell>
                        <Badge variant={PRIORITY_VARIANTS[ca.priority as keyof typeof PRIORITY_VARIANTS]}>
                          {PRIORITY_LABELS[ca.priority as keyof typeof PRIORITY_LABELS]}
                        </Badge>
                      </TableCell>
                      <TableCell>{ca.dueDate}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[ca.status as CapaStatus]}>
                          {STATUS_LABELS[ca.status as CapaStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <TransitionActions
                          currentStatus={ca.status as CapaStatus}
                          onTransition={(toStatus) =>
                            transitionMut.mutate({ industry, id: ca.id, toStatus })
                          }
                          disabled={transitionMut.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
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
    type: "corrective" | "preventive";
    priority?: "critical" | "high" | "medium" | "low";
    title: string;
    description: string;
    nonconformingId?: number | null;
    assignedTo: number;
    dueDate: string;
    actionPlan: string;
    effectivenessCriteria?: string;
  }) => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const oneMonthLater = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const [type, setType] = useState<"corrective" | "preventive">("corrective");
  const [priority, setPriority] = useState<"critical" | "high" | "medium" | "low">("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [nonconformingId, setNonconformingId] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState(oneMonthLater);
  const [actionPlan, setActionPlan] = useState("");
  const [effectivenessCriteria, setEffectivenessCriteria] = useState("");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>신규 CAPA 등록 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">유형 *</label>
            <Select value={type} onValueChange={(v) => setType(v as "corrective" | "preventive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="corrective">시정조치 (Corrective)</SelectItem>
                <SelectItem value="preventive">예방조치 (Preventive)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">우선순위 *</label>
            <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">중대 (Critical)</SelectItem>
                <SelectItem value="high">높음 (High)</SelectItem>
                <SelectItem value="medium">보통 (Medium)</SelectItem>
                <SelectItem value="low">낮음 (Low)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">제목 *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: CCP-2B 한계기준 미달 재발 방지"
          />
        </div>
        <div>
          <label className="text-sm font-medium">상세 설명 *</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="배경 / 근거 / 영향 분석"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">연계 부적합 ID</label>
            <Input
              type="number"
              value={nonconformingId}
              onChange={(e) => setNonconformingId(e.target.value)}
              placeholder="선택 (corrective 시)"
            />
          </div>
          <div>
            <label className="text-sm font-medium">담당자 user_id *</label>
            <Input
              type="number"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="user.id"
            />
          </div>
          <div>
            <label className="text-sm font-medium">마감일 *</label>
            <Input
              type="date"
              value={dueDate}
              min={today}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">조치 계획 *</label>
          <Textarea
            value={actionPlan}
            onChange={(e) => setActionPlan(e.target.value)}
            placeholder="구체적 실행 계획"
            rows={3}
          />
        </div>
        <div>
          <label className="text-sm font-medium">효과성 검증 기준</label>
          <Textarea
            value={effectivenessCriteria}
            onChange={(e) => setEffectivenessCriteria(e.target.value)}
            placeholder="효과 입증 방법 (예: 30일 무재발, 측정값 한계 내)"
            rows={2}
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              type,
              priority,
              title: title.trim(),
              description: description.trim(),
              nonconformingId: nonconformingId.trim() ? Number(nonconformingId) : null,
              assignedTo: Number(assignedTo),
              dueDate,
              actionPlan: actionPlan.trim(),
              effectivenessCriteria: effectivenessCriteria.trim() || undefined,
            })
          }
          disabled={
            !title.trim() ||
            !description.trim() ||
            !actionPlan.trim() ||
            !assignedTo.trim() ||
            !dueDate ||
            loading
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
  currentStatus: CapaStatus;
  onTransition: (toStatus: CapaStatus) => void;
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
