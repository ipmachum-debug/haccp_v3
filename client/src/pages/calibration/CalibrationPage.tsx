/**
 * Calibration 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-4)
 *
 * Cross-cutting — 모든 industry 동일 페이지 재사용.
 * URL 패턴: /dashboard/{industry}/calibration
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { FriendlyErrorBox } from "@/components/ui/FriendlyErrorBox";
import { toast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import type { IndustryKey } from "@/lib/menuTypes";
import { INDUSTRY_LABELS } from "@/lib/menuTypes";

const STATUS_VALUES = [
  "planned", "scheduled", "in_progress", "completed", "archived", "cancelled",
] as const;
type CalibrationStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<CalibrationStatus, string> = {
  planned: "계획",
  scheduled: "일정 확정",
  in_progress: "실시 중",
  completed: "종료",
  archived: "아카이브",
  cancelled: "취소",
};

const STATUS_VARIANTS: Record<CalibrationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  planned: "outline",
  scheduled: "secondary",
  in_progress: "secondary",
  completed: "default",
  archived: "default",
  cancelled: "destructive",
};

const TYPE_LABELS = {
  iq: "IQ (설치)",
  oq: "OQ (운영)",
  pq: "PQ (성능)",
  routine: "정기 검교정",
} as const;
type CalibrationType = keyof typeof TYPE_LABELS;

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

const ALLOWED_TRANSITIONS: Record<CalibrationStatus, readonly CalibrationStatus[]> = {
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

export default function CalibrationPage({ industry }: Props) {
  const [statusFilter, setStatusFilter] = useState<CalibrationStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<CalibrationType | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = trpc.calibration.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    type: typeFilter === "all" ? undefined : typeFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.calibration.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "계획 단계 시작" });
      setCreateOpen(false);
      utils.calibration.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.calibration.transition.useMutation({
    onSuccess: (res) => {
      toast({
        title: "상태 전이 성공",
        description: STATUS_LABELS[res.status as CalibrationStatus],
      });
      utils.calibration.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "상태 전이 실패", description: err.message, variant: "destructive" });
    },
  });

  // 마감일 임박 (30일 이내) 카운트
  const today = new Date();
  const in30days = new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  const dueSoonCount = listQuery.data?.filter((c) =>
    c.nextDueDate && c.nextDueDate <= in30days && c.status !== "archived" && c.status !== "cancelled",
  ).length ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">검교정 / 설비 자격 (Calibration)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — KGMP §7 / ISO 13485 §7.6 — IQ / OQ / PQ / 정기 검교정
            </p>
          </div>
          <div className="flex items-center gap-3">
            {dueSoonCount > 0 && (
              <Badge variant="destructive">⚠ 30일 내 마감 {dueSoonCount}건</Badge>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>+ 신규 검교정 등록</Button>
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
            <CardTitle>검교정 목록</CardTitle>
            <div className="flex gap-2">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as CalibrationType | "all")}>
                <SelectTrigger className="w-40"><SelectValue placeholder="유형" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 유형</SelectItem>
                  <SelectItem value="iq">{TYPE_LABELS.iq}</SelectItem>
                  <SelectItem value="oq">{TYPE_LABELS.oq}</SelectItem>
                  <SelectItem value="pq">{TYPE_LABELS.pq}</SelectItem>
                  <SelectItem value="routine">{TYPE_LABELS.routine}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CalibrationStatus | "all")}>
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
              <FriendlyErrorBox message={listQuery.error.message} />
            ) : !listQuery.data || listQuery.data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">등록된 검교정이 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>설비</TableHead>
                    <TableHead>검교정 기관</TableHead>
                    <TableHead>예정일</TableHead>
                    <TableHead>다음 마감</TableHead>
                    <TableHead>평가</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((cal) => {
                    const isDueSoon =
                      cal.nextDueDate &&
                      cal.nextDueDate <= in30days &&
                      cal.status !== "archived" &&
                      cal.status !== "cancelled";
                    return (
                      <TableRow key={cal.id}>
                        <TableCell className="font-mono">{cal.code}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{TYPE_LABELS[cal.type as CalibrationType]}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>{cal.equipmentName}</div>
                          <div className="text-xs text-muted-foreground font-mono">{cal.equipmentSerial}</div>
                        </TableCell>
                        <TableCell>
                          <div>{cal.vendor}</div>
                          <div className="text-xs text-muted-foreground">
                            {cal.vendorType === "internal" ? "사내" : "외부"}
                          </div>
                        </TableCell>
                        <TableCell>{cal.scheduledDate}</TableCell>
                        <TableCell>
                          {cal.nextDueDate ? (
                            <span className={isDueSoon ? "text-red-600 font-medium" : ""}>
                              {cal.nextDueDate}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">미설정</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={OUTCOME_VARIANTS[cal.outcome as keyof typeof OUTCOME_VARIANTS]}>
                            {OUTCOME_LABELS[cal.outcome as keyof typeof OUTCOME_LABELS]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[cal.status as CalibrationStatus]}>
                            {STATUS_LABELS[cal.status as CalibrationStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TransitionActions
                            currentStatus={cal.status as CalibrationStatus}
                            onTransition={(toStatus) =>
                              transitionMut.mutate({ industry, id: cal.id, toStatus })
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
    type: CalibrationType;
    equipmentName: string;
    equipmentSerial: string;
    vendor: string;
    vendorType: "internal" | "external";
    scheduledDate: string;
    intervalMonths?: number;
  }) => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const oneMonthLater = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

  const [type, setType] = useState<CalibrationType>("routine");
  const [equipmentName, setEquipmentName] = useState("");
  const [equipmentSerial, setEquipmentSerial] = useState("");
  const [vendor, setVendor] = useState("");
  const [vendorType, setVendorType] = useState<"internal" | "external">("external");
  const [scheduledDate, setScheduledDate] = useState(oneMonthLater);
  const [intervalMonths, setIntervalMonths] = useState("12");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>신규 검교정 등록 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">유형 *</label>
            <Select value={type} onValueChange={(v) => setType(v as CalibrationType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="iq">{TYPE_LABELS.iq}</SelectItem>
                <SelectItem value="oq">{TYPE_LABELS.oq}</SelectItem>
                <SelectItem value="pq">{TYPE_LABELS.pq}</SelectItem>
                <SelectItem value="routine">{TYPE_LABELS.routine}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">예정일 *</label>
            <Input type="date" value={scheduledDate} min={today} onChange={(e) => setScheduledDate(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">설비 이름 *</label>
            <Input value={equipmentName} onChange={(e) => setEquipmentName(e.target.value)} placeholder="예: 충진기 #3" />
          </div>
          <div>
            <label className="text-sm font-medium">시리얼 / 관리번호 *</label>
            <Input value={equipmentSerial} onChange={(e) => setEquipmentSerial(e.target.value)} placeholder="예: EQ-2024-003" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="text-sm font-medium">검교정 기관 *</label>
            <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="외부 기관명 / 사내 부서" />
          </div>
          <div>
            <label className="text-sm font-medium">기관 유형 *</label>
            <Select value={vendorType} onValueChange={(v) => setVendorType(v as "internal" | "external")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="external">외부</SelectItem>
                <SelectItem value="internal">사내</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">주기 (개월) *</label>
          <Input
            type="number"
            min="1"
            max="120"
            value={intervalMonths}
            onChange={(e) => setIntervalMonths(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">실시일 + 주기 = 다음 검교정 마감일 자동 계산</p>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              type,
              equipmentName: equipmentName.trim(),
              equipmentSerial: equipmentSerial.trim(),
              vendor: vendor.trim(),
              vendorType,
              scheduledDate,
              intervalMonths: Number(intervalMonths),
            })
          }
          disabled={
            !equipmentName.trim() || !equipmentSerial.trim() || !vendor.trim() ||
            !scheduledDate || Number(intervalMonths) < 1 || loading
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
  currentStatus: CalibrationStatus;
  onTransition: (toStatus: CalibrationStatus) => void;
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
