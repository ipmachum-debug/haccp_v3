/**
 * Nonconforming 페이지 — Layer 2 core-mes/quality 클라이언트 (Phase Y-2-1-c)
 *
 * ============================================================================
 * Cross-cutting 도메인 — 모든 industry 가 동일 페이지 재사용.
 * URL 패턴: /dashboard/{industry}/nonconforming
 *
 * Y-2-0-c (ChangeControlPage) 패턴 그대로 재사용.
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
import { FriendlyErrorBox } from "@/components/ui/FriendlyErrorBox";
import { toast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import type { IndustryKey } from "@/lib/menuTypes";
import { INDUSTRY_LABELS } from "@/lib/menuTypes";

const STATUS_VALUES = [
  "detected",
  "under_investigation",
  "pending_disposal",
  "disposed",
  "closed",
  "cancelled",
] as const;
type NonconformingStatus = (typeof STATUS_VALUES)[number];

const STATUS_LABELS: Record<NonconformingStatus, string> = {
  detected: "발견",
  under_investigation: "조사 중",
  pending_disposal: "처리 대기",
  disposed: "처리 완료",
  closed: "종결",
  cancelled: "취소",
};

const STATUS_VARIANTS: Record<NonconformingStatus, "default" | "secondary" | "destructive" | "outline"> = {
  detected: "destructive",
  under_investigation: "secondary",
  pending_disposal: "secondary",
  disposed: "default",
  closed: "default",
  cancelled: "outline",
};

const DETECTION_SOURCES = [
  "incoming_inspection",
  "in_process_inspection",
  "final_inspection",
  "customer_complaint",
  "internal_audit",
  "ccp_monitoring",
  "stability_test",
  "other",
] as const;
type DetectionSource = (typeof DETECTION_SOURCES)[number];

const DETECTION_SOURCE_LABELS: Record<DetectionSource, string> = {
  incoming_inspection: "입고 검사",
  in_process_inspection: "공정 검사 (IPC)",
  final_inspection: "출하 검사",
  customer_complaint: "고객 불만",
  internal_audit: "내부 감사",
  ccp_monitoring: "CCP 모니터링",
  stability_test: "안정성시험",
  other: "기타",
};

const NONCONFORMITY_TYPES = [
  "physical",
  "chemical",
  "biological",
  "sensory",
  "packaging",
  "labeling",
  "specification",
  "other",
] as const;
type NonconformityType = (typeof NONCONFORMITY_TYPES)[number];

const NONCONFORMITY_TYPE_LABELS: Record<NonconformityType, string> = {
  physical: "물리적",
  chemical: "화학적",
  biological: "생물학적",
  sensory: "관능적",
  packaging: "포장 불량",
  labeling: "표시 불량",
  specification: "규격 미달",
  other: "기타",
};

// 원인 분류 · 처리 방법 — drizzle/schema/coreMes/quality/nonconforming.ts 와 동기
const CAUSE_CATEGORIES = ["material", "process", "equipment", "human_error", "environment", "method", "other"] as const;
type CauseCategory = (typeof CAUSE_CATEGORIES)[number];
const CAUSE_CATEGORY_LABELS: Record<CauseCategory, string> = {
  material: "원재료", process: "공정", equipment: "설비", human_error: "작업자", environment: "환경", method: "방법", other: "기타",
};
const DISPOSAL_METHODS = ["rework", "downgrade", "alternative_use", "disposal", "return_to_supplier", "customer_return"] as const;
type DisposalMethod = (typeof DISPOSAL_METHODS)[number];
const DISPOSAL_METHOD_LABELS: Record<DisposalMethod, string> = {
  rework: "재작업", downgrade: "등급 하향", alternative_use: "용도 전환", disposal: "폐기",
  return_to_supplier: "공급업체 반품", customer_return: "고객 반품",
};

const ALLOWED_TRANSITIONS: Record<NonconformingStatus, readonly NonconformingStatus[]> = {
  detected: ["under_investigation", "cancelled"],
  under_investigation: ["pending_disposal", "cancelled"],
  pending_disposal: ["disposed", "cancelled"],
  disposed: ["closed"],
  closed: [],
  cancelled: [],
};

interface Props {
  industry: IndustryKey;
}

export default function NonconformingPage({ industry }: Props) {
  const [statusFilter, setStatusFilter] = useState<NonconformingStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const listQuery = trpc.nonconforming.list.useQuery({
    industry,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  const utils = trpc.useUtils();
  const createMut = trpc.nonconforming.create.useMutation({
    onSuccess: (res) => {
      toast({ title: `${res.code} 등록 완료`, description: "발견 상태로 저장됨" });
      setCreateOpen(false);
      utils.nonconforming.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "등록 실패", description: err.message, variant: "destructive" });
    },
  });

  const transitionMut = trpc.nonconforming.transition.useMutation({
    onSuccess: (res) => {
      toast({
        title: "상태 전이 성공",
        description: STATUS_LABELS[res.status as NonconformingStatus],
      });
      utils.nonconforming.list.invalidate();
    },
    onError: (err) => {
      toast({ title: "상태 전이 실패", description: err.message, variant: "destructive" });
    },
  });

  // 원인 분석 · 처리 기록 (2026-10-14 — 식품 구형 부적합 화면에 있던 입력. 서버 setRootCause/setDisposal 은 있었으나 화면이 없었다)
  const [recordTarget, setRecordTarget] = useState<any | null>(null);
  const rootCauseMut = trpc.nonconforming.setRootCause.useMutation();
  const disposalMut = trpc.nonconforming.setDisposal.useMutation();
  const saveRecord = async (v: RecordValues) => {
    if (!recordTarget) return;
    try {
      if (v.rootCause.trim()) {
        await rootCauseMut.mutateAsync({ industry, id: recordTarget.id, rootCause: v.rootCause.trim(), causeCategory: v.causeCategory });
      }
      if (v.disposalMethod) {
        await disposalMut.mutateAsync({
          industry, id: recordTarget.id, disposalMethod: v.disposalMethod,
          disposalDate: v.disposalDate || undefined, disposalDetails: v.disposalDetails || undefined,
          disposalCost: v.disposalCost ? Number(v.disposalCost) : undefined, preventiveActions: v.preventiveActions || undefined,
        });
      }
      toast({ title: `${recordTarget.code} 원인·처리 저장` });
      setRecordTarget(null);
      utils.nonconforming.list.invalidate();
    } catch (err: any) {
      toast({ title: "저장 실패", description: err?.message ?? String(err), variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">부적합 관리 (Nonconforming)</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {INDUSTRY_LABELS[industry]} — 발견 / 조사 / 처리 / 종결 워크플로
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>+ 신규 부적합 등록</Button>
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
            <CardTitle>부적합 목록</CardTitle>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as NonconformingStatus | "all")}
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
              <FriendlyErrorBox message={listQuery.error.message} />
            ) : !listQuery.data || listQuery.data.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                등록된 부적합 사례가 없습니다.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>코드</TableHead>
                    <TableHead>발견일</TableHead>
                    <TableHead>발견 경로</TableHead>
                    <TableHead>유형</TableHead>
                    <TableHead>제품/원료</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>액션</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data.map((nc) => (
                    <TableRow key={nc.id}>
                      <TableCell className="font-mono">{nc.code}</TableCell>
                      <TableCell>{nc.detectionDate}</TableCell>
                      <TableCell>
                        {DETECTION_SOURCE_LABELS[nc.detectionSource as DetectionSource]}
                      </TableCell>
                      <TableCell>
                        {NONCONFORMITY_TYPE_LABELS[nc.nonconformityType as NonconformityType]}
                      </TableCell>
                      <TableCell>
                        <div>{nc.itemName}</div>
                        {nc.lotNumber && (
                          <div className="text-xs text-muted-foreground">LOT: {nc.lotNumber}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {nc.quantity.toLocaleString()} {nc.unit}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[nc.status as NonconformingStatus]}>
                          {STATUS_LABELS[nc.status as NonconformingStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {nc.status !== "closed" && nc.status !== "cancelled" && (
                            <Button size="sm" variant="outline" onClick={() => setRecordTarget(nc)}>원인·처리</Button>
                          )}
                          <TransitionActions
                            currentStatus={nc.status as NonconformingStatus}
                            onTransition={(toStatus) =>
                              transitionMut.mutate({ industry, id: nc.id, toStatus })
                            }
                            disabled={transitionMut.isPending}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <Dialog open={!!recordTarget} onOpenChange={(v) => !v && setRecordTarget(null)}>
          {recordTarget && (
            <RecordDialog key={recordTarget.id} target={recordTarget} loading={rootCauseMut.isPending || disposalMut.isPending} onSubmit={saveRecord} />
          )}
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

type RecordValues = {
  rootCause: string; causeCategory: CauseCategory;
  disposalMethod: DisposalMethod | ""; disposalDate: string; disposalDetails: string; disposalCost: string; preventiveActions: string;
};

/* ─────────────────────────────────────────────────────────────
 * 원인 분석 · 처리 기록 다이얼로그
 * ───────────────────────────────────────────────────────────── */
function RecordDialog({ target, loading, onSubmit }: { target: any; loading: boolean; onSubmit: (v: RecordValues) => void }) {
  const [v, setV] = useState<RecordValues>({
    rootCause: target.rootCause ?? "",
    causeCategory: (target.causeCategory as CauseCategory) ?? "process",
    disposalMethod: (target.disposalMethod && target.disposalMethod !== "pending" ? target.disposalMethod : "") as DisposalMethod | "",
    disposalDate: target.disposalDate ?? "",
    disposalDetails: target.disposalDetails ?? "",
    disposalCost: target.disposalCost != null ? String(target.disposalCost) : "",
    preventiveActions: target.preventiveActions ?? "",
  });
  const set = <K extends keyof RecordValues>(k: K, val: RecordValues[K]) => setV((p) => ({ ...p, [k]: val }));
  return (
    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>원인 분석 · 처리 — {target.code} {target.itemName}</DialogTitle>
      </DialogHeader>
      <div className="space-y-5">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">원인 분석</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">원인 분류</label>
              <Select value={v.causeCategory} onValueChange={(x) => set("causeCategory", x as CauseCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CAUSE_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{CAUSE_CATEGORY_LABELS[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">근본 원인</label>
              <Textarea rows={2} value={v.rootCause} onChange={(e) => set("rootCause", e.target.value)} placeholder="왜 발생했는지" />
            </div>
          </div>
        </section>
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">처리</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">처리 방법</label>
              <Select value={v.disposalMethod || undefined} onValueChange={(x) => set("disposalMethod", x as DisposalMethod)}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>{DISPOSAL_METHODS.map((d) => <SelectItem key={d} value={d}>{DISPOSAL_METHOD_LABELS[d]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">처리일</label>
              <Input type="date" value={v.disposalDate} onChange={(e) => set("disposalDate", e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">처리 비용 (원)</label>
              <Input type="number" min={0} value={v.disposalCost} onChange={(e) => set("disposalCost", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">처리 내용</label>
            <Textarea rows={2} value={v.disposalDetails} onChange={(e) => set("disposalDetails", e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">예방 조치</label>
            <Textarea rows={2} value={v.preventiveActions} onChange={(e) => set("preventiveActions", e.target.value)} />
          </div>
        </section>
        <p className="text-xs text-muted-foreground">처리 완료(승인)·종결은 목록의 상태 버튼으로 진행합니다 — 관리자 권한.</p>
      </div>
      <DialogFooter>
        <Button onClick={() => onSubmit(v)} disabled={loading || (!v.rootCause.trim() && !v.disposalMethod)}>
          {loading ? "저장 중…" : "저장"}
        </Button>
      </DialogFooter>
    </DialogContent>
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
    detectionDate: string;
    detectionSource: DetectionSource;
    nonconformityType: NonconformityType;
    description: string;
    itemName: string;
    lotNumber?: string;
    quantity: number;
    unit: string;
  }) => void;
  loading: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [detectionDate, setDetectionDate] = useState(today);
  const [detectionSource, setDetectionSource] = useState<DetectionSource>("in_process_inspection");
  const [nonconformityType, setNonconformityType] = useState<NonconformityType>("specification");
  const [description, setDescription] = useState("");
  const [itemName, setItemName] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [unit, setUnit] = useState("kg");

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>신규 부적합 등록 — {INDUSTRY_LABELS[industry]}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">발견일 *</label>
            <Input
              type="date"
              value={detectionDate}
              onChange={(e) => setDetectionDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">발견 경로 *</label>
            <Select
              value={detectionSource}
              onValueChange={(v) => setDetectionSource(v as DetectionSource)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DETECTION_SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{DETECTION_SOURCE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">부적합 유형 *</label>
          <Select
            value={nonconformityType}
            onValueChange={(v) => setNonconformityType(v as NonconformityType)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {NONCONFORMITY_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{NONCONFORMITY_TYPE_LABELS[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-medium">부적합 상세 설명 *</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="발견된 부적합의 구체적 내용 (위반 항목 / 측정값 / 검출 한도 등)"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">제품/원료 명 *</label>
            <Input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="예: 토너 100ml"
            />
          </div>
          <div>
            <label className="text-sm font-medium">LOT 번호</label>
            <Input
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="선택 입력"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">부적합 수량 *</label>
            <Input
              type="number"
              min="0"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium">단위 *</label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="예: kg / EA / L"
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button
          onClick={() =>
            onSubmit({
              detectionDate,
              detectionSource,
              nonconformityType,
              description: description.trim(),
              itemName: itemName.trim(),
              lotNumber: lotNumber.trim() || undefined,
              quantity: Number(quantity),
              unit: unit.trim(),
            })
          }
          disabled={
            !detectionDate ||
            !description.trim() ||
            !itemName.trim() ||
            !unit.trim() ||
            Number(quantity) < 0 ||
            loading
          }
        >
          {loading ? "등록 중..." : "등록 (발견)"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ─────────────────────────────────────────────────────────────
 * 상태 전이 버튼 (canTransition 가능 상태만)
 * ───────────────────────────────────────────────────────────── */
function TransitionActions({
  currentStatus,
  onTransition,
  disabled,
}: {
  currentStatus: NonconformingStatus;
  onTransition: (toStatus: NonconformingStatus) => void;
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
