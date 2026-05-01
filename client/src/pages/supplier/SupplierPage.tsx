/**
 * Supplier (AVL) 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-5)
 *
 * Cross-cutting — 모든 industry 동일 페이지 재사용.
 * URL 패턴: /dashboard/{industry}/supplier
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
  "under_evaluation", "approved", "suspended", "disqualified", "archived",
] as const;
type SupplierStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<SupplierStatus, string> = {
  under_evaluation: "평가 중",
  approved: "승인",
  suspended: "일시 정지",
  disqualified: "자격 박탈",
  archived: "종결",
};

const STATUS_VARIANTS: Record<SupplierStatus, "default" | "secondary" | "destructive" | "outline"> = {
  under_evaluation: "outline",
  approved: "default",
  suspended: "secondary",
  disqualified: "destructive",
  archived: "secondary",
};

const CATEGORY_LABELS = {
  raw_material: "원료",
  packaging: "포장재",
  equipment: "설비",
  service: "서비스",
  other: "기타",
} as const;
type SupplierCategory = keyof typeof CATEGORY_LABELS;

const ALLOWED_TRANSITIONS: Record<SupplierStatus, readonly SupplierStatus[]> = {
  under_evaluation: ["approved", "disqualified"],
  approved: ["under_evaluation", "suspended", "archived"],
  suspended: ["under_evaluation", "disqualified", "archived"],
  disqualified: ["archived"],
  archived: [],
};

interface Props {
  industry: IndustryKey;
}

export default function SupplierPage({ industry }: Props) {
  const [statusFilter, setStatusFilter] = useState<SupplierStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<SupplierCategory | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [evalOpenFor, setEvalOpenFor] = useState<{ id: number; code: string } | null>(null);

  const listQuery = trpc.qualitySupplier.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    category: categoryFilter === "all" ? undefined : categoryFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.qualitySupplier.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "평가 단계 시작" });
      setCreateOpen(false);
      utils.qualitySupplier.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const evaluationMut = trpc.qualitySupplier.setEvaluation.useMutation({
    onSuccess: () => {
      toast({ title: "평가 점수 입력 완료" });
      setEvalOpenFor(null);
      utils.qualitySupplier.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "평가 입력 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.qualitySupplier.transition.useMutation({
    onSuccess: (res) => {
      toast({
        title: "상태 전이 성공",
        description: STATUS_LABELS[res.status as SupplierStatus],
      });
      utils.qualitySupplier.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "상태 전이 실패", description: err.message, variant: "destructive" });
    },
  });

  // 재평가 임박 (30일 이내) 카운트
  const today = new Date();
  const in30days = new Date(today.getTime() + 30 * 86400_000).toISOString().slice(0, 10);
  const dueSoonCount = listQuery.data?.filter((s) =>
    s.nextEvaluationDate &&
    s.nextEvaluationDate <= in30days &&
    s.status === "approved",
  ).length ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">공급업체 관리 (AVL)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — KGMP §11 / ISO 13485 §7.4 — 승인 공급자 평가 + 등록
            </p>
          </div>
          <div className="flex items-center gap-3">
            {dueSoonCount > 0 && (
              <Badge variant="destructive">⚠ 30일 내 재평가 {dueSoonCount}건</Badge>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>+ 신규 공급업체 등록</Button>
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
            <CardTitle>공급업체 목록</CardTitle>
            <div className="flex gap-2">
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as SupplierCategory | "all")}>
                <SelectTrigger className="w-40"><SelectValue placeholder="카테고리" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 카테고리</SelectItem>
                  {(Object.keys(CATEGORY_LABELS) as SupplierCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as SupplierStatus | "all")}>
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
              <div className="text-center py-8 text-muted-foreground">등록된 공급업체가 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>공급업체</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead>승인일</TableHead>
                    <TableHead>다음 재평가</TableHead>
                    <TableHead>점수</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((sup) => {
                    const isDueSoon =
                      sup.nextEvaluationDate &&
                      sup.nextEvaluationDate <= in30days &&
                      sup.status === "approved";
                    return (
                      <TableRow key={sup.id}>
                        <TableCell className="font-mono">{sup.code}</TableCell>
                        <TableCell>
                          <div className="font-medium">{sup.name}</div>
                          {sup.bizNumber && (
                            <div className="text-xs text-muted-foreground font-mono">{sup.bizNumber}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{CATEGORY_LABELS[sup.category as SupplierCategory]}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>{sup.contactPerson}</div>
                          <div className="text-xs text-muted-foreground">{sup.email}</div>
                        </TableCell>
                        <TableCell>
                          {sup.approvedDate ?? <span className="text-xs text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {sup.nextEvaluationDate ? (
                            <span className={isDueSoon ? "text-red-600 font-medium" : ""}>
                              {sup.nextEvaluationDate}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">미설정</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {sup.evaluationScore !== null ? (
                            <span className="font-mono">{sup.evaluationScore}점</span>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEvalOpenFor({ id: sup.id, code: sup.code })}
                            >
                              평가 입력
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[sup.status as SupplierStatus]}>
                            {STATUS_LABELS[sup.status as SupplierStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TransitionActions
                            currentStatus={sup.status as SupplierStatus}
                            onTransition={(toStatus) =>
                              transitionMut.mutate({ industry, id: sup.id, toStatus })
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

        {evalOpenFor && (
          <Dialog open onOpenChange={(open) => !open && setEvalOpenFor(null)}>
            <EvaluationDialog
              code={evalOpenFor.code}
              onSubmit={(data) =>
                evaluationMut.mutate({ industry, id: evalOpenFor.id, ...data })
              }
              loading={evaluationMut.isPending}
            />
          </Dialog>
        )}
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
    name: string;
    category: SupplierCategory;
    contactPerson: string;
    email: string;
    phone: string;
    bizNumber?: string | null;
    address?: string | null;
    reEvaluationIntervalMonths?: number;
  }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<SupplierCategory>("raw_material");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [bizNumber, setBizNumber] = useState("");
  const [address, setAddress] = useState("");
  const [intervalMonths, setIntervalMonths] = useState("12");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>신규 공급업체 등록 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">공급업체명 *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: ㈜원료공급" />
          </div>
          <div>
            <label className="text-sm font-medium">카테고리 *</label>
            <Select value={category} onValueChange={(v) => setCategory(v as SupplierCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as SupplierCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">담당자 *</label>
            <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">이메일 *</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">전화 *</label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">사업자등록번호</label>
            <Input value={bizNumber} onChange={(e) => setBizNumber(e.target.value)} placeholder="000-00-00000" />
          </div>
          <div>
            <label className="text-sm font-medium">재평가 주기 (개월) *</label>
            <Input
              type="number"
              min="1"
              max="120"
              value={intervalMonths}
              onChange={(e) => setIntervalMonths(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">주소</label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">
            승인일 + 재평가 주기 = 다음 재평가 마감일 자동 계산
          </p>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              name: name.trim(),
              category,
              contactPerson: contactPerson.trim(),
              email: email.trim(),
              phone: phone.trim(),
              bizNumber: bizNumber.trim() || null,
              address: address.trim() || null,
              reEvaluationIntervalMonths: Number(intervalMonths),
            })
          }
          disabled={
            !name.trim() || !contactPerson.trim() || !email.trim() ||
            !phone.trim() || Number(intervalMonths) < 1 || loading
          }
        >
          {loading ? "등록 중..." : "등록 (평가 중)"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ─────────── 평가 점수 입력 다이얼로그 ─────────── */
function EvaluationDialog({
  code,
  onSubmit,
  loading,
}: {
  code: string;
  onSubmit: (data: { evaluationScore: number; notes?: string }) => void;
  loading: boolean;
}) {
  const [score, setScore] = useState("80");
  const [notes, setNotes] = useState("");

  const numScore = Number(score);
  const recommendation =
    numScore >= 75 ? "승인 권장" :
    numScore >= 50 ? "조건부 승인 (비고 필수)" :
    "자격 박탈 권장";

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>평가 점수 입력 — {code}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">평가 점수 (0~100) *</label>
          <Input
            type="number"
            min="0"
            max="100"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
          <p className="text-xs mt-1">
            <span className="font-medium">자동 추천: </span>
            <span className={
              numScore >= 75 ? "text-green-600" :
              numScore >= 50 ? "text-amber-600" :
              "text-red-600"
            }>
              {recommendation}
            </span>
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">비고 (조건부 승인 사유 등)</label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="평가 의견 / 조건" />
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              evaluationScore: numScore,
              notes: notes.trim() || undefined,
            })
          }
          disabled={numScore < 0 || numScore > 100 || loading}
        >
          {loading ? "저장 중..." : "저장"}
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
  currentStatus: SupplierStatus;
  onTransition: (toStatus: SupplierStatus) => void;
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
          variant={s === "disqualified" ? "destructive" : "outline"}
          onClick={() => onTransition(s)}
          disabled={disabled}
        >
          {STATUS_LABELS[s]}
        </Button>
      ))}
    </div>
  );
}
