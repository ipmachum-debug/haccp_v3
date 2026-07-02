/**
 * Allergen Management (알레르겐 관리) 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-11)
 *
 * URL 패턴: /dashboard/{industry}/allergen
 *
 * 표준 적용:
 *   - 식약처 알레르기 유발물질 표시기준 (19품목)
 *   - FSSC 22000 / Codex CXC 80-2020 (Allergen Management)
 *   - 품목/원료별 의도적 함유 + 교차오염(may contain) + 통제수단 + 표시문구.
 */
import { useMemo, useState } from "react";
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
type AllergenStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<AllergenStatus, string> = {
  draft: "초안",
  under_review: "검토 중",
  approved: "승인",
  archived: "종결",
};
const STATUS_VARIANTS: Record<AllergenStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  under_review: "secondary",
  approved: "default",
  archived: "secondary",
};

const SUBJECT_LABELS = { product: "제품", material: "원료" } as const;
type SubjectType = keyof typeof SUBJECT_LABELS;

const ALLOWED_TRANSITIONS: Record<AllergenStatus, readonly AllergenStatus[]> = {
  draft: ["under_review"],
  under_review: ["approved", "draft"],
  approved: ["under_review", "archived"],
  archived: [],
};

interface Props {
  industry: IndustryKey;
  embedded?: boolean;
}

export default function FoodAllergenPage({ industry, embedded }: Props) {
  const [statusFilter, setStatusFilter] = useState<AllergenStatus | "all">("all");
  const [subjectFilter, setSubjectFilter] = useState<SubjectType | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const catalogQuery = trpc.allergen.catalog.useQuery();
  const catalog = catalogQuery.data ?? [];
  const labelMap = useMemo(
    () => Object.fromEntries(catalog.map((a) => [a.code, a.label])),
    [catalog],
  );

  const listQuery = trpc.allergen.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    subjectType: subjectFilter === "all" ? undefined : subjectFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.allergen.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "초안 단계 시작" });
      setCreateOpen(false);
      utils.allergen.list.invalidate();
    },
    onError: (err) => toast({ title: "등록 실패", description: err.message, variant: "destructive" }),
  });
  const transitionMut = trpc.allergen.transition.useMutation({
    onSuccess: (res) => {
      toast({ title: "상태 전이 성공", description: STATUS_LABELS[res.status as AllergenStatus] });
      utils.allergen.list.invalidate();
    },
    onError: (err) => toast({ title: "상태 전이 실패", description: err.message, variant: "destructive" }),
  });

  const content = (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">알레르겐 관리 (Allergen Management)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — 식약처 표시기준 / FSSC 22000 / Codex CXC 80 — 품목·원료별 함유 · 교차오염 · 표시문구
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>+ 신규 알레르겐 평가</Button>
            </DialogTrigger>
            <CreateDialog
              industry={industry}
              catalog={catalog}
              onSubmit={(data) => createMut.mutate({ industry, ...data })}
              loading={createMut.isPending}
            />
          </Dialog>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>알레르겐 평가 목록</CardTitle>
            <div className="flex gap-2">
              <Select value={subjectFilter} onValueChange={(v) => setSubjectFilter(v as SubjectType | "all")}>
                <SelectTrigger className="w-28"><SelectValue placeholder="대상" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 대상</SelectItem>
                  <SelectItem value="product">제품</SelectItem>
                  <SelectItem value="material">원료</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AllergenStatus | "all")}>
                <SelectTrigger className="w-32"><SelectValue placeholder="상태" /></SelectTrigger>
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
              <div className="text-center py-8 text-muted-foreground">등록된 알레르겐 평가가 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>대상</TableHead>
                    <TableHead>함유 알레르겐</TableHead>
                    <TableHead>교차오염 (may contain)</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono">{a.code}</TableCell>
                      <TableCell>
                        <div className="font-medium">{a.subjectName}</div>
                        <div className="text-xs text-muted-foreground">
                          {SUBJECT_LABELS[a.subjectType as SubjectType]} · {a.title}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {a.presentAllergens.length === 0 ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : (
                            a.presentAllergens.map((c) => (
                              <Badge key={c} variant="destructive" className="text-xs">{labelMap[c] ?? c}</Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {a.crossContactAllergens.length === 0 ? (
                            <span className="text-xs text-muted-foreground">-</span>
                          ) : (
                            a.crossContactAllergens.map((c) => (
                              <Badge key={c} variant="outline" className="text-xs">{labelMap[c] ?? c}</Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[a.status as AllergenStatus]}>
                          {STATUS_LABELS[a.status as AllergenStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <TransitionActions
                          currentStatus={a.status as AllergenStatus}
                          onTransition={(toStatus) => transitionMut.mutate({ industry, id: a.id, toStatus })}
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
  );
  if (embedded) return content;
  return <DashboardLayout>{content}</DashboardLayout>;
}

/* ─────────── 신규 등록 다이얼로그 ─────────── */
function CreateDialog({
  industry,
  catalog,
  onSubmit,
  loading,
}: {
  industry: IndustryKey;
  catalog: Array<{ code: string; label: string }>;
  onSubmit: (data: {
    title: string;
    subjectType: SubjectType;
    subjectName: string;
    presentAllergens: string[];
    crossContactAllergens: string[];
    labelingStatement: string | null;
  }) => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [subjectType, setSubjectType] = useState<SubjectType>("product");
  const [subjectName, setSubjectName] = useState("");
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [cross, setCross] = useState<Set<string>>(new Set());
  const [labeling, setLabeling] = useState("");
  const [labelingTouched, setLabelingTouched] = useState(false);

  // 표시문구 자동 미리보기 (수기 수정 전까지 자동 반영)
  const previewQuery = trpc.allergen.previewLabeling.useQuery(
    { presentAllergens: [...present], crossContactAllergens: [...cross] },
    { enabled: !labelingTouched },
  );
  const effectiveLabeling = labelingTouched ? labeling : previewQuery.data?.statement ?? "";

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, code: string) => {
    const next = new Set(set);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    setter(next);
  };

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>신규 알레르겐 평가 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">대상 유형 *</label>
            <Select value={subjectType} onValueChange={(v) => setSubjectType(v as SubjectType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="product">제품</SelectItem>
                <SelectItem value="material">원료</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium">대상명 (품목/원료) *</label>
            <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="예: 초코쿠키 / 밀가루" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">평가 제목 *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 초코쿠키 알레르겐 평가 (2026)" />
        </div>

        <div className="border rounded-lg p-3 bg-red-50/50 dark:bg-red-950/20">
          <div className="text-sm font-semibold mb-2 text-red-800 dark:text-red-300">의도적 함유 알레르겐</div>
          <div className="grid grid-cols-3 gap-1">
            {catalog.map((a) => (
              <label key={a.code} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={present.has(a.code)} onChange={() => toggle(present, setPresent, a.code)} />
                {a.label}
              </label>
            ))}
          </div>
        </div>

        <div className="border rounded-lg p-3 bg-muted/40">
          <div className="text-sm font-semibold mb-2">교차오염 가능 (may contain)</div>
          <div className="grid grid-cols-3 gap-1">
            {catalog.map((a) => (
              <label key={a.code} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={cross.has(a.code)}
                  disabled={present.has(a.code)}
                  onChange={() => toggle(cross, setCross, a.code)}
                />
                <span className={present.has(a.code) ? "text-muted-foreground line-through" : ""}>{a.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium">표시(라벨) 문구</label>
          <Textarea
            value={effectiveLabeling}
            onChange={(e) => { setLabelingTouched(true); setLabeling(e.target.value); }}
            placeholder="알레르겐 선택 시 자동 생성됩니다 (직접 수정 가능)"
            rows={2}
          />
          <p className="text-xs text-muted-foreground mt-1">선택한 알레르겐으로 자동 생성 · 직접 수정 시 자동 갱신 중단</p>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              title: title.trim(),
              subjectType,
              subjectName: subjectName.trim(),
              presentAllergens: [...present],
              crossContactAllergens: [...cross].filter((c) => !present.has(c)),
              labelingStatement: effectiveLabeling.trim() || null,
            })
          }
          disabled={!title.trim() || !subjectName.trim() || loading}
        >
          {loading ? "등록 중..." : "등록 (초안)"}
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
  currentStatus: AllergenStatus;
  onTransition: (toStatus: AllergenStatus) => void;
  disabled: boolean;
}) {
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (allowed.length === 0) {
    return <span className="text-xs text-muted-foreground">종결</span>;
  }
  return (
    <div className="flex gap-1 flex-wrap">
      {allowed.map((s) => (
        <Button key={s} size="sm" variant="outline" onClick={() => onTransition(s)} disabled={disabled}>
          {STATUS_LABELS[s]}
        </Button>
      ))}
    </div>
  );
}
