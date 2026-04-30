/**
 * QA 출고 상세 페이지 (Phase 2-6)
 *
 * 라우트: /dashboard/cosmetic/release/:id
 *
 * 기능:
 *   - 출고 정보 + QA 검증 결과 카드
 *   - lifecycle 액션: 승인 / 출고 / 회수 / 취소
 *   - 회수 dialog (사유 필수)
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Truck,
  ShieldCheck,
  ShieldX,
  CheckCircle2,
  PlayCircle,
  XCircle,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { toast } from "@/hooks/use-toast";

const STATUS_LABEL: Record<string, string> = {
  pending: "검토 대기",
  approved: "QA 승인",
  released: "출고 완료",
  recalled: "회수",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  pending: "secondary",
  approved: "default",
  released: "default",
  recalled: "destructive",
};

const LIFECYCLE = ["pending", "approved", "released"] as const;

function fmt(d: any) {
  if (!d) return "-";
  try {
    return new Date(d).toLocaleString("ko-KR");
  } catch {
    return String(d);
  }
}

export default function CosmeticReleaseDetail() {
  const [, params] = useRoute("/dashboard/cosmetic/release/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id ?? 0);

  const { data: release, refetch } = trpc.cosmetic.release.getById.useQuery(
    { id },
    { enabled: id > 0 },
  );

  const [recallOpen, setRecallOpen] = useState(false);
  const [recallReason, setRecallReason] = useState("");

  const approveMutation = trpc.cosmetic.release.approve.useMutation();
  const releaseMutation = trpc.cosmetic.release.release.useMutation();
  const recallMutation = trpc.cosmetic.release.recall.useMutation();
  const deletePendingMutation = trpc.cosmetic.release.deletePending.useMutation();

  const handleApprove = async () => {
    try {
      const result = await approveMutation.mutateAsync({ id });
      if (!result.ok) {
        toast({
          title: "승인 실패",
          description: result.reason ?? "QA 검증 미통과",
          variant: "destructive",
        });
        refetch();
        return;
      }
      toast({ title: "QA 승인 완료" });
      refetch();
    } catch (e: any) {
      toast({ title: "승인 실패", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const handleRelease = async () => {
    try {
      const result = await releaseMutation.mutateAsync({ id });
      if (!result.ok) {
        toast({ title: "출고 실패", description: result.reason ?? "전이 불가", variant: "destructive" });
        return;
      }
      toast({ title: "✅ 출고 완료" });
      refetch();
    } catch (e: any) {
      toast({ title: "출고 실패", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const handleRecall = async () => {
    if (!recallReason.trim()) {
      toast({ title: "회수 사유 필수", variant: "destructive" });
      return;
    }
    try {
      const result = await recallMutation.mutateAsync({ id, reason: recallReason.trim() });
      if (!result.ok) {
        toast({ title: "회수 실패", description: result.reason, variant: "destructive" });
        return;
      }
      toast({ title: "회수 처리 완료" });
      setRecallOpen(false);
      setRecallReason("");
      refetch();
    } catch (e: any) {
      toast({ title: "회수 실패", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!confirm("pending 출고 신청을 취소합니다. 계속?")) return;
    try {
      const result = await deletePendingMutation.mutateAsync({ id });
      if (!result.deleted) {
        toast({ title: "취소 실패", description: result.reason, variant: "destructive" });
        return;
      }
      toast({ title: "신청 취소" });
      navigate("/dashboard/cosmetic/release");
    } catch (e: any) {
      toast({ title: "취소 실패", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  if (!release) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            로딩 중...
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const isPending = release.status === "pending";
  const isApproved = release.status === "approved";
  const isReleased = release.status === "released";
  const isRecalled = release.status === "recalled";
  const lifeIdx = LIFECYCLE.indexOf(release.status as any);
  const qaPass = release.bmrCompletedCheck && release.ipcAllPassCheck;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-3"
              onClick={() => navigate("/dashboard/cosmetic/release")}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              목록
            </Button>
            <h1 className="text-2xl font-semibold flex items-center gap-2 font-mono">
              <Truck className="w-6 h-6 text-emerald-600" />
              {release.releaseCode}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              BMR #{release.bmrId} · 제품 #{release.productId} ·{" "}
              {release.releaseQuantity.toLocaleString("ko-KR")} {release.releaseUnit}
              {release.targetMarket && ` · ${release.targetMarket}`}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[release.status] ?? "default"} className="text-sm">
            {STATUS_LABEL[release.status] ?? release.status}
          </Badge>
        </div>

        {/* QA 검증 결과 */}
        <Card
          className={
            qaPass
              ? "border-emerald-200 bg-emerald-50/50"
              : "border-amber-200 bg-amber-50/50"
          }
        >
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {qaPass ? (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-600" /> QA 검증 통과
                </>
              ) : (
                <>
                  <ShieldX className="w-4 h-4 text-amber-600" /> QA 검증 일부 실패
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-baseline gap-3">
              <span className="text-muted-foreground">BMR 제조 완료</span>
              {release.bmrCompletedCheck ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              ) : (
                <ShieldX className="w-4 h-4 text-amber-600" />
              )}
              <span className="text-muted-foreground ml-3">IPC 모두 합격</span>
              {release.ipcAllPassCheck ? (
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
              ) : (
                <ShieldX className="w-4 h-4 text-amber-600" />
              )}
            </div>
            {release.qaCheckMessage && (
              <pre className="text-[11px] font-mono whitespace-pre-wrap bg-background/60 rounded p-2">
                {release.qaCheckMessage}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* 진행 단계 */}
        {!isRecalled && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">진행 단계</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {LIFECYCLE.map((s, idx) => {
                  const isPast = idx < lifeIdx;
                  const isNow = idx === lifeIdx;
                  return (
                    <div
                      key={s}
                      className={`p-3 rounded-lg border text-center ${
                        isNow
                          ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40"
                          : isPast
                          ? "bg-muted/40 border-muted"
                          : "border-dashed border-muted text-muted-foreground"
                      }`}
                    >
                      <div className="text-xs">{idx + 1}단계</div>
                      <div
                        className={`text-sm font-medium ${
                          isNow ? "text-emerald-700" : ""
                        }`}
                      >
                        {STATUS_LABEL[s]}
                      </div>
                      {isNow && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mt-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 액션 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">액션</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {isPending && (
              <>
                <Button onClick={handleApprove} variant="default">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> QA 승인
                </Button>
                <Button onClick={handleDelete} variant="ghost">
                  <Trash2 className="w-4 h-4 mr-1" /> 신청 취소
                </Button>
              </>
            )}
            {isApproved && (
              <>
                <Button onClick={handleRelease} variant="default">
                  <PlayCircle className="w-4 h-4 mr-1" /> 출고 완료 처리
                </Button>
                <Button onClick={() => setRecallOpen(true)} variant="destructive">
                  <XCircle className="w-4 h-4 mr-1" /> 회수
                </Button>
              </>
            )}
            {isReleased && (
              <Button onClick={() => setRecallOpen(true)} variant="destructive">
                <XCircle className="w-4 h-4 mr-1" /> 회수
              </Button>
            )}
            {isRecalled && (
              <p className="text-sm text-muted-foreground">회수된 출고 — 추가 액션 없음</p>
            )}
          </CardContent>
        </Card>

        {/* 회수 사유 */}
        {isRecalled && release.recallReason && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertTriangle className="w-4 h-4" /> 회수 사유
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {release.recallReason}
            </CardContent>
          </Card>
        )}

        {/* 추적 정보 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">진행 추적</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="신청" value={`#${release.createdBy} · ${fmt(release.createdAt)}`} />
            {release.approvedAt && (
              <Row
                label="QA 승인"
                value={`#${release.approvedBy ?? "?"} · ${fmt(release.approvedAt)}`}
              />
            )}
            {release.releasedAt && (
              <Row
                label="출고 완료"
                value={`#${release.releasedBy ?? "?"} · ${fmt(release.releasedAt)}`}
              />
            )}
            {release.recalledAt && (
              <Row
                label="회수"
                value={`#${release.recalledBy ?? "?"} · ${fmt(release.recalledAt)}`}
              />
            )}
            {release.expiryDate && (
              <Row
                label="사용기한"
                value={String(release.expiryDate).slice(0, 10)}
              />
            )}
            {release.productBatchNumber && (
              <Row label="제품 배치번호" value={release.productBatchNumber} />
            )}
          </CardContent>
        </Card>

        {release.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">메모</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{release.notes}</CardContent>
          </Card>
        )}
      </div>

      {/* 회수 dialog */}
      <Dialog open={recallOpen} onOpenChange={setRecallOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>회수 처리</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="recallReason">회수 사유 *</Label>
            <Textarea
              id="recallReason"
              rows={4}
              value={recallReason}
              onChange={(e) => setRecallReason(e.target.value)}
              placeholder="회수 사유를 명확히 기재 (감사 추적용 — 필수)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecallOpen(false)}>취소</Button>
            <Button variant="destructive" onClick={handleRecall}>
              회수 처리
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-muted/40 pb-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
