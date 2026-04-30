/**
 * 화장품 BMR 상세 페이지 (Phase 2-2)
 *
 * 라우트: /dashboard/cosmetic/bmr/:id
 *
 * 기능:
 *   1. 모든 필드 + 메타데이터 표시
 *   2. 상태 lifecycle 시각화 (timeline)
 *   3. 상태별 액션 버튼:
 *      draft         → [수정] [삭제] [QA 승인] [거절]
 *      approved      → [제조 시작] [거절]
 *      manufacturing → [제조 완료] [거절]
 *      completed     → (재오픈은 향후)
 *      rejected      → reject_reason 표시
 *   4. 거절 시 reason input (alert dialog)
 *   5. 제조 완료 시 actualQuantityKg input
 */

import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Sparkles,
  CheckCircle2,
  PlayCircle,
  Flag,
  XCircle,
  Pencil,
  Trash2,
} from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { toast } from "@/hooks/use-toast";
import { CosmeticBmrDialog } from "./CosmeticBmrDialog";

const STATUS_LABEL: Record<string, string> = {
  draft: "작성 중",
  approved: "QA 승인",
  manufacturing: "제조 중",
  completed: "제조 완료",
  rejected: "거절",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  draft: "secondary",
  approved: "default",
  manufacturing: "default",
  completed: "default",
  rejected: "destructive",
};

const LIFECYCLE = ["draft", "approved", "manufacturing", "completed"] as const;

function formatDateTime(value: any): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString("ko-KR");
  } catch {
    return String(value);
  }
}

export default function CosmeticBmrDetail() {
  const [, params] = useRoute("/dashboard/cosmetic/bmr/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id ?? 0);

  const { data: bmr, isLoading, refetch } = trpc.cosmetic.bmr.getById.useQuery(
    { id },
    { enabled: id > 0 },
  );

  const [editOpen, setEditOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [actualQty, setActualQty] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const approveMutation = trpc.cosmetic.bmr.approve.useMutation();
  const startMutation = trpc.cosmetic.bmr.startManufacturing.useMutation();
  const completeMutation = trpc.cosmetic.bmr.markCompleted.useMutation();
  const rejectMutation = trpc.cosmetic.bmr.reject.useMutation();
  const deleteMutation = trpc.cosmetic.bmr.deleteDraft.useMutation();

  const handleTransition = async (action: () => Promise<any>, label: string) => {
    try {
      const result = await action();
      if (result?.ok === false) {
        toast({
          title: `${label} 실패`,
          description: result.reason ?? "허용되지 않은 전이",
          variant: "destructive",
        });
        return;
      }
      toast({ title: `${label} 완료` });
      refetch();
    } catch (e: any) {
      toast({
        title: `${label} 실패`,
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  const handleApprove = () =>
    handleTransition(() => approveMutation.mutateAsync({ id }), "QA 승인");

  const handleStart = () =>
    handleTransition(() => startMutation.mutateAsync({ id }), "제조 시작");

  const handleComplete = async () => {
    const qty = actualQty ? Number(actualQty) : undefined;
    if (qty !== undefined && (!Number.isFinite(qty) || qty <= 0)) {
      toast({ title: "실제량은 양수여야 합니다", variant: "destructive" });
      return;
    }
    await handleTransition(
      () => completeMutation.mutateAsync({ id, actualQuantityKg: qty }),
      "제조 완료",
    );
    setCompleteDialogOpen(false);
    setActualQty("");
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast({ title: "거절 사유 필수", variant: "destructive" });
      return;
    }
    await handleTransition(
      () => rejectMutation.mutateAsync({ id, reason: rejectReason.trim() }),
      "거절 처리",
    );
    setRejectDialogOpen(false);
    setRejectReason("");
  };

  const handleDelete = async () => {
    if (!confirm("draft BMR 을 삭제하시겠습니까? 복구 불가능합니다.")) return;
    try {
      const result = await deleteMutation.mutateAsync({ id });
      if (!result.deleted) {
        toast({
          title: "삭제 실패",
          description: result.reason ?? "draft 만 삭제 가능",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "BMR 삭제 완료" });
      navigate("/dashboard/cosmetic/bmr");
    } catch (e: any) {
      toast({
        title: "삭제 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="text-sm text-muted-foreground py-8 text-center">로딩 중...</div>
      </DashboardLayout>
    );
  }

  if (!bmr) {
    return (
      <DashboardLayout>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">BMR을 찾을 수 없습니다.</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate("/dashboard/cosmetic/bmr")}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              목록으로
            </Button>
          </CardContent>
        </Card>
      </DashboardLayout>
    );
  }

  const status = bmr.status;
  const isDraft = status === "draft";
  const isApproved = status === "approved";
  const isManufacturing = status === "manufacturing";
  const isCompleted = status === "completed";
  const isRejected = status === "rejected";

  // lifecycle index
  const lifecycleIdx = LIFECYCLE.indexOf(status as any);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="mb-2 -ml-3"
              onClick={() => navigate("/dashboard/cosmetic/bmr")}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              목록
            </Button>
            <h1 className="text-2xl font-semibold flex items-center gap-2 font-mono">
              <Sparkles className="w-6 h-6 text-pink-600" />
              {bmr.bmrCode}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              제품 #{bmr.productId} · 계획 {Number(bmr.plannedQuantityKg).toLocaleString("ko-KR")}kg
              {bmr.batchNumber ? ` · 배치 ${bmr.batchNumber}` : ""}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[status] ?? "default"} className="text-sm">
            {STATUS_LABEL[status] ?? status}
          </Badge>
        </div>

        {/* lifecycle timeline */}
        {!isRejected && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">진행 단계</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                {LIFECYCLE.map((s, idx) => {
                  const isPast = idx < lifecycleIdx;
                  const isNow = idx === lifecycleIdx;
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
                      <div className={`text-sm font-medium ${isNow ? "text-emerald-700" : ""}`}>
                        {STATUS_LABEL[s]}
                      </div>
                      {isNow && <CheckCircle2 className="w-4 h-4 text-emerald-600 mx-auto mt-1" />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* 거절된 경우 reason 표시 */}
        {isRejected && bmr.rejectReason && (
          <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 text-red-700 dark:text-red-300">
                <XCircle className="w-4 h-4" />
                거절 사유
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {bmr.rejectReason}
            </CardContent>
          </Card>
        )}

        {/* 액션 버튼 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">액션</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {isDraft && (
              <>
                <Button onClick={() => setEditOpen(true)} variant="outline">
                  <Pencil className="w-4 h-4 mr-1" /> 수정
                </Button>
                <Button onClick={handleApprove} variant="default">
                  <CheckCircle2 className="w-4 h-4 mr-1" /> QA 승인
                </Button>
                <Button onClick={() => setRejectDialogOpen(true)} variant="destructive">
                  <XCircle className="w-4 h-4 mr-1" /> 거절
                </Button>
                <Button onClick={handleDelete} variant="ghost">
                  <Trash2 className="w-4 h-4 mr-1" /> 삭제
                </Button>
              </>
            )}
            {isApproved && (
              <>
                <Button onClick={handleStart} variant="default">
                  <PlayCircle className="w-4 h-4 mr-1" /> 제조 시작
                </Button>
                <Button onClick={() => setRejectDialogOpen(true)} variant="destructive">
                  <XCircle className="w-4 h-4 mr-1" /> 거절
                </Button>
              </>
            )}
            {isManufacturing && (
              <>
                <Button onClick={() => setCompleteDialogOpen(true)} variant="default">
                  <Flag className="w-4 h-4 mr-1" /> 제조 완료
                </Button>
                <Button onClick={() => setRejectDialogOpen(true)} variant="destructive">
                  <XCircle className="w-4 h-4 mr-1" /> 거절
                </Button>
              </>
            )}
            {(isCompleted || isRejected) && (
              <p className="text-sm text-muted-foreground">
                현재 상태에서는 추가 액션이 없습니다 (재오픈은 향후 PR 에서 추가 예정).
              </p>
            )}
          </CardContent>
        </Card>

        {/* 정보 카드 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">제조 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="제품 ID" value={`#${bmr.productId}`} />
              <Row label="배치 번호" value={bmr.batchNumber ?? "-"} />
              <Row label="제조일" value={bmr.manufacturingDate ? String(bmr.manufacturingDate).slice(0, 10) : "-"} />
              <Row
                label="계획량"
                value={`${Number(bmr.plannedQuantityKg).toLocaleString("ko-KR")} kg`}
              />
              <Row
                label="실제량"
                value={
                  bmr.actualQuantityKg !== null && bmr.actualQuantityKg !== undefined
                    ? `${Number(bmr.actualQuantityKg).toLocaleString("ko-KR")} kg`
                    : "-"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">진행 추적</CardTitle>
              <CardDescription>각 상태별 사용자 / 시각</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row
                label="생성"
                value={`#${bmr.createdBy} · ${formatDateTime(bmr.createdAt)}`}
              />
              {bmr.approvedAt && (
                <Row
                  label="QA 승인"
                  value={`#${bmr.approvedBy ?? "?"} · ${formatDateTime(bmr.approvedAt)}`}
                />
              )}
              {bmr.manufacturingStartedAt && (
                <Row label="제조 시작" value={formatDateTime(bmr.manufacturingStartedAt)} />
              )}
              {bmr.completedAt && (
                <Row
                  label="제조 완료"
                  value={`#${bmr.completedBy ?? "?"} · ${formatDateTime(bmr.completedAt)}`}
                />
              )}
              {bmr.rejectedAt && (
                <Row
                  label="거절"
                  value={`#${bmr.rejectedBy ?? "?"} · ${formatDateTime(bmr.rejectedAt)}`}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* 메모 */}
        {bmr.notes && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">메모</CardTitle>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">{bmr.notes}</CardContent>
          </Card>
        )}
      </div>

      {/* edit dialog */}
      <CosmeticBmrDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        bmr={
          bmr
            ? {
                id: bmr.id,
                productId: bmr.productId,
                batchNumber: bmr.batchNumber,
                plannedQuantityKg: Number(bmr.plannedQuantityKg),
                manufacturingDate: bmr.manufacturingDate as any,
                notes: bmr.notes,
              }
            : null
        }
        onSuccess={refetch}
      />

      {/* 거절 dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>BMR 거절</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rejectReason">거절 사유 *</Label>
            <Textarea
              id="rejectReason"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="거절 사유를 명확히 기재하세요. 감사 추적용 (필수)."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              취소
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              거절 처리
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 제조 완료 dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>제조 완료 처리</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="actualQty">실제 제조량 (kg) — 선택</Label>
            <Input
              id="actualQty"
              type="number"
              step="0.001"
              min="0"
              value={actualQty}
              onChange={(e) => setActualQty(e.target.value)}
              placeholder={`예: ${Number(bmr.plannedQuantityKg).toLocaleString("ko-KR")} (계획량)`}
            />
            <p className="text-xs text-muted-foreground">
              미입력 시 nullable — 향후 IPC / 출고 단계에서 보정 가능
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleComplete}>완료 처리</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline gap-2 border-b border-muted/40 pb-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
