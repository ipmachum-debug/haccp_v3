/**
 * Audit 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-2-3)
 *
 * Cross-cutting 도메인 — 모든 industry 가 동일 페이지 재사용.
 * URL 패턴: /dashboard/{industry}/audit
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
  "planned", "scheduled", "in_progress", "reporting", "closed", "cancelled",
] as const;
type AuditStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<AuditStatus, string> = {
  planned: "계획",
  scheduled: "일정 확정",
  in_progress: "실시 중",
  reporting: "보고 작성",
  closed: "종결",
  cancelled: "취소",
};

const STATUS_VARIANTS: Record<AuditStatus, "default" | "secondary" | "destructive" | "outline"> = {
  planned: "outline",
  scheduled: "secondary",
  in_progress: "secondary",
  reporting: "secondary",
  closed: "default",
  cancelled: "destructive",
};

const TYPE_LABELS = {
  internal: "내부 감사",
  supplier: "공급업체 감사",
  external: "외부 감사",
} as const;

const OUTCOME_LABELS = {
  pass: "합격",
  conditional_pass: "조건부 합격",
  fail: "불합격",
  pending: "미평가",
} as const;

const OUTCOME_VARIANTS = {
  pass: "default",
  conditional_pass: "secondary",
  fail: "destructive",
  pending: "outline",
} as const;

const ALLOWED_TRANSITIONS: Record<AuditStatus, readonly AuditStatus[]> = {
  planned: ["scheduled", "cancelled"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["reporting", "cancelled"],
  reporting: ["closed", "cancelled"],
  closed: [],
  cancelled: [],
};

interface Props {
  industry: IndustryKey;
}

export default function AuditPage({ industry }: Props) {
  const [statusFilter, setStatusFilter] = useState<AuditStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<keyof typeof TYPE_LABELS | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = trpc.audit.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    type: typeFilter === "all" ? undefined : typeFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.audit.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "계획 단계 시작" });
      setCreateOpen(false);
      utils.audit.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.audit.transition.useMutation({
    onSuccess: (res) => {
      toast({
        title: "상태 전이 성공",
        description: STATUS_LABELS[res.status as AuditStatus],
      });
      utils.audit.list.invalidate();
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
            <h1 className="text-2xl font-bold">감사 (Audit)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — 내부 / 공급업체 / 외부 감사 통합 관리
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>+ 신규 감사 등록</Button>
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
            <CardTitle>감사 목록</CardTitle>
            <div className="flex gap-2">
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter(v as keyof typeof TYPE_LABELS | "all")}
              >
                <SelectTrigger className="w-40"><SelectValue placeholder="유형" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 유형</SelectItem>
                  <SelectItem value="internal">{TYPE_LABELS.internal}</SelectItem>
                  <SelectItem value="supplier">{TYPE_LABELS.supplier}</SelectItem>
                  <SelectItem value="external">{TYPE_LABELS.external}</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as AuditStatus | "all")}
              >
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
              <div className="text-center py-8 text-muted-foreground">등록된 감사가 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>피감사 대상</TableHead>
                    <TableHead>계획일</TableHead>
                    <TableHead>발견사항</TableHead>
                    <TableHead>평가</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((au) => (
                    <TableRow key={au.id}>
                      <TableCell className="font-mono">{au.code}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABELS[au.type as keyof typeof TYPE_LABELS]}</Badge>
                      </TableCell>
                      <TableCell>
                        <div>{au.title}</div>
                        <div className="text-xs text-muted-foreground">{au.criteria}</div>
                      </TableCell>
                      <TableCell>{au.auditee}</TableCell>
                      <TableCell>{au.plannedDate}</TableCell>
                      <TableCell className="text-center">{au.findings.length}</TableCell>
                      <TableCell>
                        <Badge variant={OUTCOME_VARIANTS[au.outcome as keyof typeof OUTCOME_VARIANTS]}>
                          {OUTCOME_LABELS[au.outcome as keyof typeof OUTCOME_LABELS]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[au.status as AuditStatus]}>
                          {STATUS_LABELS[au.status as AuditStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <TransitionActions
                          currentStatus={au.status as AuditStatus}
                          onTransition={(toStatus) =>
                            transitionMut.mutate({ industry, id: au.id, toStatus })
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
    type: "internal" | "supplier" | "external";
    title: string;
    scope: string;
    criteria: string;
    auditee: string;
    plannedDate: string;
    leadAuditor: number;
  }) => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const oneMonthLater = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const [type, setType] = useState<"internal" | "supplier" | "external">("internal");
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [criteria, setCriteria] = useState("");
  const [auditee, setAuditee] = useState("");
  const [plannedDate, setPlannedDate] = useState(oneMonthLater);
  const [leadAuditor, setLeadAuditor] = useState("");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>신규 감사 등록 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">유형 *</label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">{TYPE_LABELS.internal}</SelectItem>
                <SelectItem value="supplier">{TYPE_LABELS.supplier}</SelectItem>
                <SelectItem value="external">{TYPE_LABELS.external}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">계획일 *</label>
            <Input type="date" value={plannedDate} min={today} onChange={(e) => setPlannedDate(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">제목 *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026년 1차 내부 감사" />
        </div>
        <div>
          <label className="text-sm font-medium">감사 범위 / 목적 *</label>
          <Textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={2} placeholder="예: 생산 / 품질 / 문서 시스템 전반" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">감사 기준 *</label>
            <Input value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="예: ISO 13485:2016, KGMP" />
          </div>
          <div>
            <label className="text-sm font-medium">피감사 대상 *</label>
            <Input value={auditee} onChange={(e) => setAuditee(e.target.value)} placeholder="부서명 / 거래처명 / 인증기관" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">주관 감사원 user_id *</label>
          <Input type="number" value={leadAuditor} onChange={(e) => setLeadAuditor(e.target.value)} placeholder="user.id" />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              type,
              title: title.trim(),
              scope: scope.trim(),
              criteria: criteria.trim(),
              auditee: auditee.trim(),
              plannedDate,
              leadAuditor: Number(leadAuditor),
            })
          }
          disabled={
            !title.trim() || !scope.trim() || !criteria.trim() ||
            !auditee.trim() || !leadAuditor.trim() || !plannedDate || loading
          }
        >
          {loading ? "등록 중..." : "등록 (계획)"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function TransitionActions({
  currentStatus,
  onTransition,
  disabled,
}: {
  currentStatus: AuditStatus;
  onTransition: (toStatus: AuditStatus) => void;
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
