/**
 * Risk Assessment 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-6)
 *
 * Cross-cutting — 모든 industry 동일 페이지 재사용.
 * URL 패턴: /dashboard/{industry}/risk-assessment
 *
 * 표준 적용:
 *   - ICH Q9 (의약품 QRM)
 *   - ISO 14971 (의료기기 위험관리)
 *   - Codex Alimentarius HACCP (식품 위해 분석)
 *   - KGMP §3.5 (화장품 안전성 평가)
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
  "draft", "under_review", "mitigated", "accepted", "archived",
] as const;
type RiskStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<RiskStatus, string> = {
  draft: "초안",
  under_review: "검토 중",
  mitigated: "완화 적용",
  accepted: "잔여 위험 수용",
  archived: "종결",
};

const STATUS_VARIANTS: Record<RiskStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  under_review: "secondary",
  mitigated: "default",
  accepted: "secondary",
  archived: "secondary",
};

const CATEGORY_LABELS = {
  biological: "생물학적",
  chemical: "화학적",
  physical: "물리적",
  operational: "운영",
  regulatory: "규제",
  supplier: "공급망",
  other: "기타",
} as const;
type RiskCategory = keyof typeof CATEGORY_LABELS;

const ALLOWED_TRANSITIONS: Record<RiskStatus, readonly RiskStatus[]> = {
  draft: ["under_review"],
  under_review: ["mitigated", "accepted", "draft"],
  mitigated: ["under_review", "archived"],
  accepted: ["under_review", "archived"],
  archived: [],
};

/**
 * Risk score → 등급 (서버 classifyRiskLevel 과 동기).
 *
 * severity=5 → 항상 high
 * score >= 15 → high / >= 7 → medium / else low
 */
function classifyLevel(probability: number, severity: number): "low" | "medium" | "high" {
  if (severity === 5) return "high";
  const s = probability * severity;
  if (s >= 15) return "high";
  if (s >= 7) return "medium";
  return "low";
}

const LEVEL_COLOR: Record<"low" | "medium" | "high", string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-red-100 text-red-800",
};

interface Props {
  industry: IndustryKey;
}

export default function RiskAssessmentPage({ industry }: Props) {
  const [statusFilter, setStatusFilter] = useState<RiskStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<RiskCategory | "all">("all");
  const [highRiskOnly, setHighRiskOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = trpc.riskAssessment.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    category: categoryFilter === "all" ? undefined : categoryFilter,
    minResidualScore: highRiskOnly ? 15 : undefined,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.riskAssessment.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "초안 단계 시작" });
      setCreateOpen(false);
      utils.riskAssessment.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.riskAssessment.transition.useMutation({
    onSuccess: (res) => {
      toast({
        title: "상태 전이 성공",
        description: STATUS_LABELS[res.status as RiskStatus],
      });
      utils.riskAssessment.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "상태 전이 실패", description: err.message, variant: "destructive" });
    },
  });

  const highRiskCount = listQuery.data?.filter((r) => {
    const level = classifyLevel(r.probability, r.severity);
    return level === "high" && r.status !== "archived";
  }).length ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">위험 평가 (Risk Assessment)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — ICH Q9 / ISO 14971 / Codex HACCP / KGMP §3.5 — 확률 × 심각도 (1~5 × 1~5)
            </p>
          </div>
          <div className="flex items-center gap-3">
            {highRiskCount > 0 && (
              <Badge variant="destructive">⚠ 고위험 (high) {highRiskCount}건</Badge>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>+ 신규 위험 평가</Button>
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
            <CardTitle>위험 목록</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={highRiskOnly ? "default" : "outline"}
                onClick={() => setHighRiskOnly((v) => !v)}
              >
                고위험만 (잔여 ≥ 15)
              </Button>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as RiskCategory | "all")}>
                <SelectTrigger className="w-36"><SelectValue placeholder="카테고리" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 카테고리</SelectItem>
                  {(Object.keys(CATEGORY_LABELS) as RiskCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RiskStatus | "all")}>
                <SelectTrigger className="w-36"><SelectValue placeholder="상태" /></SelectTrigger>
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
              <div className="text-center py-8 text-muted-foreground">등록된 위험 평가가 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead>범위</TableHead>
                    <TableHead className="text-center">P × S</TableHead>
                    <TableHead className="text-center">초기점수</TableHead>
                    <TableHead className="text-center">잔여점수</TableHead>
                    <TableHead className="text-center">등급</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((risk) => {
                    const initialScore = risk.probability * risk.severity;
                    const level = classifyLevel(risk.probability, risk.severity);
                    return (
                      <TableRow key={risk.id}>
                        <TableCell className="font-mono">{risk.code}</TableCell>
                        <TableCell>
                          <div className="font-medium">{risk.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{risk.description}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{CATEGORY_LABELS[risk.category as RiskCategory]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{risk.scope}</TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {risk.probability} × {risk.severity}
                        </TableCell>
                        <TableCell className="text-center font-mono">{initialScore}</TableCell>
                        <TableCell className="text-center font-mono">
                          {risk.residualScore !== null ? (
                            <span className={risk.residualScore >= 15 ? "text-red-600 font-bold" : ""}>
                              {risk.residualScore}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLOR[level]}`}>
                            {level === "high" ? "高" : level === "medium" ? "中" : "低"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANTS[risk.status as RiskStatus]}>
                            {STATUS_LABELS[risk.status as RiskStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TransitionActions
                            currentStatus={risk.status as RiskStatus}
                            onTransition={(toStatus) =>
                              transitionMut.mutate({ industry, id: risk.id, toStatus })
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
    title: string;
    description: string;
    category: RiskCategory;
    scope: string;
    probability: number;
    severity: number;
  }) => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<RiskCategory>("operational");
  const [scope, setScope] = useState("");
  const [probability, setProbability] = useState("3");
  const [severity, setSeverity] = useState("3");

  const numP = Number(probability);
  const numS = Number(severity);
  const score = numP * numS;
  const level = classifyLevel(numP, numS);

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>신규 위험 평가 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">제목 *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 충진 공정 미생물 오염 가능성" />
        </div>
        <div>
          <label className="text-sm font-medium">상세 설명 *</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="발생 시나리오 / 검출 가능성 / 영향 등"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">카테고리 *</label>
            <Select value={category} onValueChange={(v) => setCategory(v as RiskCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as RiskCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">영향 범위 *</label>
            <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="예: 충진 라인 #2 / 모든 제품" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">발생 확률 (1~5) *</label>
            <Select value={probability} onValueChange={setProbability}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — 매우 드뭄</SelectItem>
                <SelectItem value="2">2 — 드뭄</SelectItem>
                <SelectItem value="3">3 — 보통</SelectItem>
                <SelectItem value="4">4 — 자주</SelectItem>
                <SelectItem value="5">5 — 거의 항상</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">심각도 (1~5) *</label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — 미미</SelectItem>
                <SelectItem value="2">2 — 경미</SelectItem>
                <SelectItem value="3">3 — 중간</SelectItem>
                <SelectItem value="4">4 — 심각</SelectItem>
                <SelectItem value="5">5 — 치명적</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="bg-muted p-3 rounded text-sm flex items-center justify-between">
          <span className="font-medium">초기 위험 점수:</span>
          <span className="flex items-center gap-2">
            <span className="font-mono">{numP} × {numS} = {score}</span>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLOR[level]}`}>
              {level === "high" ? "高 (high)" : level === "medium" ? "中 (medium)" : "低 (low)"}
            </span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          ※ 등록 후 완화 조치 (mitigations) 를 추가하면 잔여 위험 점수가 자동 재계산됩니다.
        </p>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              title: title.trim(),
              description: description.trim(),
              category,
              scope: scope.trim(),
              probability: numP,
              severity: numS,
            })
          }
          disabled={!title.trim() || !description.trim() || !scope.trim() || loading}
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
  currentStatus: RiskStatus;
  onTransition: (toStatus: RiskStatus) => void;
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
