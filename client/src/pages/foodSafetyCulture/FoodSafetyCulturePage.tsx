/**
 * Food Safety Culture (식품안전문화) 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-9)
 *
 * URL 패턴: /dashboard/{industry}/food-safety-culture
 *
 * 표준 적용:
 *   - FSSC 22000 v6 §2.5.1 Food Safety and Quality Culture
 *   - GFSI Food Safety Culture — 문화 성숙도 진단(6개 차원) + 개선활동 추적.
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
type CultureStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<CultureStatus, string> = {
  draft: "초안",
  under_review: "검토 중",
  approved: "승인",
  archived: "종결",
};

const STATUS_VARIANTS: Record<CultureStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  under_review: "secondary",
  approved: "default",
  archived: "secondary",
};

const METHOD_LABELS = {
  survey: "설문",
  interview: "인터뷰",
  observation: "관찰",
  mixed: "혼합",
} as const;
type AssessmentMethod = keyof typeof METHOD_LABELS;

const DIMENSIONS = [
  { key: "leadership", label: "리더십·경영진 의지" },
  { key: "communication", label: "소통·정보공유" },
  { key: "awareness", label: "인식·교육" },
  { key: "accountability", label: "책임·실행" },
  { key: "resources", label: "자원·시스템" },
  { key: "continuousImprovement", label: "지속적 개선" },
] as const;
type DimensionKey = (typeof DIMENSIONS)[number]["key"];

const ALLOWED_TRANSITIONS: Record<CultureStatus, readonly CultureStatus[]> = {
  draft: ["under_review"],
  under_review: ["approved", "draft"],
  approved: ["under_review", "archived"],
  archived: [],
};

/** 종합 점수 → 성숙도 등급 (서버 classifyMaturity 와 동기). */
function classifyMaturity(score: number): "initial" | "developing" | "mature" | "excellent" {
  if (score < 2.5) return "initial";
  if (score < 3.5) return "developing";
  if (score < 4.5) return "mature";
  return "excellent";
}
const MATURITY_LABELS: Record<"initial" | "developing" | "mature" | "excellent", string> = {
  initial: "초기",
  developing: "발전",
  mature: "성숙",
  excellent: "우수",
};
const MATURITY_COLOR: Record<"initial" | "developing" | "mature" | "excellent", string> = {
  initial: "bg-red-100 text-red-800",
  developing: "bg-amber-100 text-amber-800",
  mature: "bg-blue-100 text-blue-800",
  excellent: "bg-green-100 text-green-800",
};

interface Props {
  industry: IndustryKey;
  embedded?: boolean;
}

export default function FoodSafetyCulturePage({ industry, embedded }: Props) {
  const [statusFilter, setStatusFilter] = useState<CultureStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = trpc.foodSafetyCulture.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.foodSafetyCulture.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: `종합 ${res.overallScore.toFixed(1)}점` });
      setCreateOpen(false);
      utils.foodSafetyCulture.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.foodSafetyCulture.transition.useMutation({
    onSuccess: (res) => {
      toast({ title: "상태 전이 성공", description: STATUS_LABELS[res.status as CultureStatus] });
      utils.foodSafetyCulture.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "상태 전이 실패", description: err.message, variant: "destructive" });
    },
  });

  const content = (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">식품안전문화 (Food Safety Culture)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — FSSC 22000 v6 §2.5.1 / GFSI — 6개 차원 문화 성숙도 진단 (각 1~5)
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>+ 신규 문화 진단</Button>
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
            <CardTitle>진단 목록</CardTitle>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as CultureStatus | "all")}>
              <SelectTrigger className="w-36"><SelectValue placeholder="상태" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
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
              <FriendlyErrorBox message={listQuery.error.message} />
            ) : !listQuery.data || listQuery.data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">등록된 문화 진단이 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>기간</TableHead>
                    <TableHead>방법</TableHead>
                    <TableHead className="text-center">참여</TableHead>
                    <TableHead className="text-center">종합점수</TableHead>
                    <TableHead className="text-center">성숙도</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((c) => {
                    const maturity = classifyMaturity(c.overallScore);
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono">{c.code}</TableCell>
                        <TableCell className="font-medium">{c.title}</TableCell>
                        <TableCell className="text-sm">{c.assessmentPeriod}</TableCell>
                        <TableCell className="text-sm">{METHOD_LABELS[c.method as AssessmentMethod]}</TableCell>
                        <TableCell className="text-center text-sm">{c.participantCount}명</TableCell>
                        <TableCell className="text-center font-mono font-bold">{c.overallScore.toFixed(1)}</TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${MATURITY_COLOR[maturity]}`}>
                            {MATURITY_LABELS[maturity]}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[c.status as CultureStatus]}>
                            {STATUS_LABELS[c.status as CultureStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TransitionActions
                            currentStatus={c.status as CultureStatus}
                            onTransition={(toStatus) =>
                              transitionMut.mutate({ industry, id: c.id, toStatus })
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
    title: string;
    assessmentPeriod: string;
    method: AssessmentMethod;
    participantCount: number;
    dimensionScores: Record<DimensionKey, number>;
    summary: string | null;
  }) => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");
  const [method, setMethod] = useState<AssessmentMethod>("survey");
  const [participantCount, setParticipantCount] = useState("0");
  const [summary, setSummary] = useState("");
  const [scores, setScores] = useState<Record<DimensionKey, number>>({
    leadership: 3,
    communication: 3,
    awareness: 3,
    accountability: 3,
    resources: 3,
    continuousImprovement: 3,
  });

  const overall =
    Math.round(
      (DIMENSIONS.reduce((acc, d) => acc + scores[d.key], 0) / DIMENSIONS.length) * 10,
    ) / 10;
  const maturity = classifyMaturity(overall);

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>신규 문화 진단 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">진단 제목 *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 2026 상반기 식품안전문화 진단" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium">대상 기간 *</label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="예: 2026 상반기" />
          </div>
          <div>
            <label className="text-sm font-medium">진단 방법 *</label>
            <Select value={method} onValueChange={(v) => setMethod(v as AssessmentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_LABELS) as AssessmentMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">참여 인원</label>
            <Input
              type="number"
              min="0"
              value={participantCount}
              onChange={(e) => setParticipantCount(e.target.value)}
            />
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
          <div className="text-sm font-semibold">차원별 점수 (각 1~5)</div>
          {DIMENSIONS.map((d) => (
            <div key={d.key} className="flex items-center justify-between gap-3">
              <span className="text-sm">{d.label}</span>
              <Select
                value={String(scores[d.key])}
                onValueChange={(v) => setScores((prev) => ({ ...prev, [d.key]: Number(v) }))}
              >
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        <div className="bg-muted p-3 rounded text-sm flex items-center justify-between">
          <span className="font-medium">종합 점수 (평균):</span>
          <span className="flex items-center gap-2">
            <span className="font-mono font-bold">{overall.toFixed(1)}</span>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${MATURITY_COLOR[maturity]}`}>
              {MATURITY_LABELS[maturity]}
            </span>
          </span>
        </div>

        <div>
          <label className="text-sm font-medium">요약 / 소견</label>
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="주요 강점 / 약점 / 후속 계획" rows={2} />
        </div>
        <p className="text-xs text-muted-foreground">
          ※ 등록 후 차원별 개선활동(improvement actions)을 추가하여 후속 관리할 수 있습니다.
        </p>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              title: title.trim(),
              assessmentPeriod: period.trim(),
              method,
              participantCount: Number(participantCount) || 0,
              dimensionScores: scores,
              summary: summary.trim() || null,
            })
          }
          disabled={!title.trim() || !period.trim() || loading}
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
  currentStatus: CultureStatus;
  onTransition: (toStatus: CultureStatus) => void;
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
          variant="outline"
          onClick={() => onTransition(s)}
          disabled={disabled}
        >
          {STATUS_LABELS[s]}
        </Button>
      ))}
    </div>
  );
}
