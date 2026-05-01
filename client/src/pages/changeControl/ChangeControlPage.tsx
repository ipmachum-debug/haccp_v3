/**
 * Change Control 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-2-0-c)
 *
 * ============================================================================
 * Cross-cutting 도메인 — 모든 industry 가 동일 페이지 재사용.
 * URL 패턴: /dashboard/{industry}/change-control
 *   - /dashboard/cosmetic/change-control → industry='cosmetic' 고정
 *   - /dashboard/food/change-control     → industry='food' 고정 (향후 식품 메뉴 추가)
 *
 * industry 는 URL prop 으로 받음 (App.tsx 라우트가 분기).
 * 활성 industry 컨텍스트 자동 격리 → KGMP / GMP / HACCP 컴플라이언스 안전.
 *
 * 기능:
 *   - 목록 조회 (status 필터)
 *   - 신규 등록 (CC-YYYY-NNNN 자동채번)
 *   - 영향평가 (impact 변경)
 *   - 상태 전이 (canTransition 검증 강제 — 서버 측)
 * ============================================================================
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

// 서버 ENUM 과 동기 — 향후 server/core-mes/quality/changeControl.ts 의 type 직접 import 가능
const STATUS_VALUES = [
  "draft",
  "submitted",
  "evaluating",
  "approved",
  "implementing",
  "verifying",
  "closed",
  "rejected",
  "cancelled",
] as const;
type ChangeStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<ChangeStatus, string> = {
  draft: "초안",
  submitted: "신청 완료",
  evaluating: "영향 평가",
  approved: "승인",
  implementing: "실행 중",
  verifying: "검증 중",
  closed: "완료",
  rejected: "반려",
  cancelled: "취소",
};

const STATUS_VARIANTS: Record<ChangeStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  submitted: "secondary",
  evaluating: "secondary",
  approved: "default",
  implementing: "default",
  verifying: "default",
  closed: "default",
  rejected: "destructive",
  cancelled: "destructive",
};

const CHANGE_TYPES = [
  "process",
  "specification",
  "formulation",
  "equipment",
  "supplier",
  "label",
  "document",
  "system",
  "other",
] as const;
type ChangeType = (typeof CHANGE_TYPES)[number];

const CHANGE_TYPE_LABELS: Record<ChangeType, string> = {
  process: "제조 공정",
  specification: "규격 / 한계기준",
  formulation: "처방 / 배합",
  equipment: "설비",
  supplier: "공급자",
  label: "라벨 / 표기",
  document: "SOP / 문서",
  system: "IT / 시스템",
  other: "기타",
};

const IMPACT_LABELS: Record<"critical" | "major" | "minor", string> = {
  critical: "중대",
  major: "주요",
  minor: "경미",
};

const IMPACT_VARIANTS: Record<"critical" | "major" | "minor", "destructive" | "default" | "secondary"> = {
  critical: "destructive",
  major: "default",
  minor: "secondary",
};

interface Props {
  /** 라우트가 결정 — /dashboard/{industry}/change-control */
  industry: IndustryKey;
}

export default function ChangeControlPage({ industry }: Props) {
  const [statusFilter, setStatusFilter] = useState<ChangeStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = trpc.coreMes.changeControl.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.coreMes.changeControl.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "초안 상태로 저장됨" });
      setCreateOpen(false);
      utils.coreMes.changeControl.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.coreMes.changeControl.transition.useMutation({
    onSuccess: (res) => {
      toast({ title: "상태 전이 성공", description: STATUS_LABELS[res.status as ChangeStatus] });
      utils.coreMes.changeControl.list.invalidate();
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
            <h1 className="text-2xl font-bold">변경관리 (Change Control)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — 변경 신청 / 영향평가 / 승인 / 실행 / 검증
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>+ 신규 변경 신청</Button>
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
            <CardTitle>변경 목록</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as ChangeStatus | "all")}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="상태 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {STATUS_VALUES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
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
                등록된 변경 신청이 없습니다.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>영향도</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>신청일</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((cc) => (
                    <TableRow key={cc.id}>
                      <TableCell className="font-mono">{cc.code}</TableCell>
                      <TableCell>{cc.title}</TableCell>
                      <TableCell>{CHANGE_TYPE_LABELS[cc.changeType as ChangeType]}</TableCell>
                      <TableCell>
                        <Badge variant={IMPACT_VARIANTS[cc.impact as "critical" | "major" | "minor"]}>
                          {IMPACT_LABELS[cc.impact as "critical" | "major" | "minor"]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[cc.status as ChangeStatus]}>
                          {STATUS_LABELS[cc.status as ChangeStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(cc.requestedAt).toLocaleDateString("ko-KR")}
                      </TableCell>
                      <TableCell>
                        <TransitionActions
                          currentStatus={cc.status as ChangeStatus}
                          onTransition={(toStatus) =>
                            transitionMut.mutate({ industry, id: cc.id, toStatus })
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

/* ─────────────────────────────────────────────────────────────
 * 신규 등록 다이얼로그
 * ───────────────────────────────────────────────────────────── */
function CreateDialog({
  industry,
  onSubmit,
  loading,
}: {
  industry: IndustryKey;
  onSubmit: (data: {
    title: string;
    description: string;
    changeType: ChangeType;
    impact?: "critical" | "major" | "minor";
  }) => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [changeType, setChangeType] = useState<ChangeType>("process");
  const [impact, setImpact] = useState<"critical" | "major" | "minor">("minor");

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>신규 변경 신청 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">제목 *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: CCP-2B 한계기준 (75°C → 80°C) 변경"
          />
        </div>
        <div>
          <label className="text-sm font-medium">변경 사유 / 배경 *</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="변경 필요성, 배경, 근거 자료 등"
            rows={4}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">변경 유형 *</label>
            <Select value={changeType} onValueChange={(v) => setChangeType(v as ChangeType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHANGE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {CHANGE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">영향도 (초기)</label>
            <Select value={impact} onValueChange={(v) => setImpact(v as "critical" | "major" | "minor")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minor">경미 (Minor)</SelectItem>
                <SelectItem value="major">주요 (Major)</SelectItem>
                <SelectItem value="critical">중대 (Critical)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              영향평가 후 갱신 가능
            </p>
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              title: title.trim(),
              description: description.trim(),
              changeType,
              impact,
            })
          }
          disabled={!title.trim() || !description.trim() || loading}
        >
          {loading ? "등록 중..." : "신청 (초안)"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 상태 전이 버튼 (canTransition 가능 상태만 노출)
 * ───────────────────────────────────────────────────────────── */
const ALLOWED_TRANSITIONS: Record<ChangeStatus, readonly ChangeStatus[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["evaluating", "rejected", "cancelled"],
  evaluating: ["approved", "rejected"],
  approved: ["implementing", "cancelled"],
  implementing: ["verifying", "cancelled"],
  verifying: ["closed"],
  closed: [],
  rejected: [],
  cancelled: [],
};

function TransitionActions({
  currentStatus,
  onTransition,
  disabled,
}: {
  currentStatus: ChangeStatus;
  onTransition: (toStatus: ChangeStatus) => void;
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
          variant={s === "rejected" || s === "cancelled" ? "destructive" : "outline"}
          onClick={() => onTransition(s)}
          disabled={disabled}
        >
          {STATUS_LABELS[s]}
        </Button>
      ))}
    </div>
  );
}
