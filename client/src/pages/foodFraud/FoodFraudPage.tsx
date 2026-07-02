/**
 * Food Fraud (VACCP) 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-8)
 *
 * URL 패턴: /dashboard/{industry}/food-fraud
 *
 * 표준 적용:
 *   - FSSC 22000 v6 §2.5.4 Food Fraud Mitigation
 *   - GFSI VACCP (Vulnerability Assessment Critical Control Points)
 *   - 경제적 동기에 의한 부정(EMA). 원료·공급자별 취약성 · likelihood × impact (1~5 × 1~5).
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

const STATUS_VALUES = [
  "draft", "under_review", "mitigated", "accepted", "archived",
] as const;
type FoodFraudStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<FoodFraudStatus, string> = {
  draft: "초안",
  under_review: "검토 중",
  mitigated: "통제 적용",
  accepted: "잔여 취약성 수용",
  archived: "종결",
};

const STATUS_VARIANTS: Record<FoodFraudStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  under_review: "secondary",
  mitigated: "default",
  accepted: "secondary",
  archived: "secondary",
};

const CATEGORY_LABELS = {
  dilution: "희석",
  substitution: "대체",
  concealment: "은폐",
  mislabeling: "표시 위반",
  counterfeiting: "위조",
  unapproved_enhancement: "미승인 증량",
  gray_market: "회색시장",
  other: "기타",
} as const;
type FraudCategory = keyof typeof CATEGORY_LABELS;

const ALLOWED_TRANSITIONS: Record<FoodFraudStatus, readonly FoodFraudStatus[]> = {
  draft: ["under_review"],
  under_review: ["mitigated", "accepted", "draft"],
  mitigated: ["under_review", "archived"],
  accepted: ["under_review", "archived"],
  archived: [],
};

/**
 * Vulnerability score → 등급 (서버 classifyFraudLevel 과 동기).
 *
 * impact=5 → 항상 high
 * score >= 15 → high / >= 7 → medium / else low
 */
function classifyLevel(likelihood: number, impact: number): "low" | "medium" | "high" {
  if (impact === 5) return "high";
  const s = likelihood * impact;
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

export default function FoodFraudPage({ industry }: Props) {
  const [statusFilter, setStatusFilter] = useState<FoodFraudStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<FraudCategory | "all">("all");
  const [highVulnOnly, setHighVulnOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = trpc.foodFraud.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    category: categoryFilter === "all" ? undefined : categoryFilter,
    minResidualScore: highVulnOnly ? 15 : undefined,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.foodFraud.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "초안 단계 시작" });
      setCreateOpen(false);
      utils.foodFraud.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.foodFraud.transition.useMutation({
    onSuccess: (res) => {
      toast({
        title: "상태 전이 성공",
        description: STATUS_LABELS[res.status as FoodFraudStatus],
      });
      utils.foodFraud.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "상태 전이 실패", description: err.message, variant: "destructive" });
    },
  });

  const highVulnCount = listQuery.data?.filter((v) => {
    const level = classifyLevel(v.likelihood, v.impact);
    return level === "high" && v.status !== "archived";
  }).length ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">식품 사기 완화 (Food Fraud / VACCP)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — FSSC 22000 v6 §2.5.4 / GFSI VACCP — 원료·공급자 취약성 · 발생가능성 × 영향 (1~5 × 1~5)
            </p>
          </div>
          <div className="flex items-center gap-3">
            {highVulnCount > 0 && (
              <Badge variant="destructive">⚠ 고취약 (high) {highVulnCount}건</Badge>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>+ 신규 취약성 평가</Button>
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
            <CardTitle>취약성 목록</CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={highVulnOnly ? "default" : "outline"}
                onClick={() => setHighVulnOnly((v) => !v)}
              >
                고취약만 (잔여 ≥ 15)
              </Button>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as FraudCategory | "all")}>
                <SelectTrigger className="w-36"><SelectValue placeholder="사기유형" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 유형</SelectItem>
                  {(Object.keys(CATEGORY_LABELS) as FraudCategory[]).map((c) => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as FoodFraudStatus | "all")}>
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
              <FriendlyErrorBox message={listQuery.error.message} />
            ) : !listQuery.data || listQuery.data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">등록된 취약성 평가가 없습니다.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>취약성</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>원료 / 공급자</TableHead>
                    <TableHead className="text-center">L × I</TableHead>
                    <TableHead className="text-center">초기점수</TableHead>
                    <TableHead className="text-center">잔여점수</TableHead>
                    <TableHead className="text-center">등급</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((fraud) => {
                    const initialScore = fraud.likelihood * fraud.impact;
                    const level = classifyLevel(fraud.likelihood, fraud.impact);
                    return (
                      <TableRow key={fraud.id}>
                        <TableCell className="font-mono">{fraud.code}</TableCell>
                        <TableCell>
                          <div className="font-medium">{fraud.title}</div>
                          <div className="text-xs text-muted-foreground line-clamp-1">{fraud.description}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{CATEGORY_LABELS[fraud.category as FraudCategory]}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{fraud.material}</div>
                          {fraud.supplier && <div className="text-xs text-muted-foreground">{fraud.supplier}</div>}
                        </TableCell>
                        <TableCell className="text-center font-mono text-xs">
                          {fraud.likelihood} × {fraud.impact}
                        </TableCell>
                        <TableCell className="text-center font-mono">{initialScore}</TableCell>
                        <TableCell className="text-center font-mono">
                          {fraud.residualScore !== null ? (
                            <span className={fraud.residualScore >= 15 ? "text-red-600 font-bold" : ""}>
                              {fraud.residualScore}
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
                          <Badge variant={STATUS_VARIANTS[fraud.status as FoodFraudStatus]}>
                            {STATUS_LABELS[fraud.status as FoodFraudStatus]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <TransitionActions
                            currentStatus={fraud.status as FoodFraudStatus}
                            onTransition={(toStatus) =>
                              transitionMut.mutate({ industry, id: fraud.id, toStatus })
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
    category: FraudCategory;
    material: string;
    supplier: string | null;
    likelihood: number;
    impact: number;
  }) => void;
  loading: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<FraudCategory>("substitution");
  const [material, setMaterial] = useState("");
  const [supplier, setSupplier] = useState("");
  const [likelihood, setLikelihood] = useState("3");
  const [impact, setImpact] = useState("3");

  const numL = Number(likelihood);
  const numI = Number(impact);
  const score = numL * numI;
  const level = classifyLevel(numL, numI);

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>신규 취약성 평가 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">취약성 제목 *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 올리브유 저가유 혼입(희석) 취약성" />
        </div>
        <div>
          <label className="text-sm font-medium">상세 설명 *</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="사기 시나리오 / 기회 / 경제적 동기 / 검출 난이도 / 영향 등"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">사기 유형 *</label>
            <Select value={category} onValueChange={(v) => setCategory(v as FraudCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(CATEGORY_LABELS) as FraudCategory[]).map((c) => (
                  <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">대상 원료/식품 *</label>
            <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="예: 올리브유 / 벌꿀 / 고춧가루" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">공급자 (선택)</label>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="예: (주)○○상사" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">발생 가능성 (1~5) *</label>
            <Select value={likelihood} onValueChange={setLikelihood}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — 매우 낮음</SelectItem>
                <SelectItem value="2">2 — 낮음</SelectItem>
                <SelectItem value="3">3 — 보통</SelectItem>
                <SelectItem value="4">4 — 높음</SelectItem>
                <SelectItem value="5">5 — 매우 높음</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium">영향 (1~5) *</label>
            <Select value={impact} onValueChange={setImpact}>
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
          <span className="font-medium">초기 취약성 점수:</span>
          <span className="flex items-center gap-2">
            <span className="font-mono">{numL} × {numI} = {score}</span>
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${LEVEL_COLOR[level]}`}>
              {level === "high" ? "高 (high)" : level === "medium" ? "中 (medium)" : "低 (low)"}
            </span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          ※ 등록 후 통제수단 (control measures) 을 추가하면 잔여 취약성 점수가 자동 재계산됩니다.
        </p>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              title: title.trim(),
              description: description.trim(),
              category,
              material: material.trim(),
              supplier: supplier.trim() || null,
              likelihood: numL,
              impact: numI,
            })
          }
          disabled={!title.trim() || !description.trim() || !material.trim() || loading}
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
  currentStatus: FoodFraudStatus;
  onTransition: (toStatus: FoodFraudStatus) => void;
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
