/**
 * QA 출고 신청 Dialog (Phase 2-6)
 *
 * 핵심 UX:
 *   - BMR 선택 시 자동 QA 검증 결과 카드 표시 (preReleaseCheck)
 *   - 검증 fail 이어도 신청은 가능 (pending 상태로 저장)
 *   - QA 가 후속 검증 후 approve/reject 결정
 */

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, ShieldX, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export interface ReleaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CosmeticReleaseDialog({
  open,
  onOpenChange,
  onSuccess,
}: ReleaseDialogProps) {
  const [bmrId, setBmrId] = useState<string>("");
  const [releaseQuantity, setReleaseQuantity] = useState("");
  const [releaseUnit, setReleaseUnit] = useState("kg");
  const [targetMarket, setTargetMarket] = useState("국내");
  const [productBatchNumber, setProductBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: bmrs } = trpc.cosmetic.bmr.list.useQuery({ status: "completed" });

  const bmrIdNum = Number(bmrId || 0);
  const qaCheck = trpc.cosmetic.release.preReleaseCheck.useQuery(
    { bmrId: bmrIdNum },
    { enabled: bmrIdNum > 0 },
  );

  useEffect(() => {
    if (open) {
      setBmrId("");
      setReleaseQuantity("");
      setReleaseUnit("kg");
      setTargetMarket("국내");
      setProductBatchNumber("");
      setExpiryDate("");
      setNotes("");
    }
  }, [open]);

  const createMutation = trpc.cosmetic.release.create.useMutation();

  const selectedBmr = (bmrs?.items ?? []).find((b: any) => Number(b.id) === bmrIdNum);

  const handleSubmit = async () => {
    if (!bmrId) {
      toast({ title: "BMR 선택 필수", variant: "destructive" });
      return;
    }
    const qty = Number(releaseQuantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: "출고량은 양수", variant: "destructive" });
      return;
    }
    if (!selectedBmr) {
      toast({ title: "선택한 BMR 정보를 찾을 수 없음", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const result = await createMutation.mutateAsync({
        bmrId: bmrIdNum,
        productId: selectedBmr.productId,
        releaseQuantity: qty,
        releaseUnit,
        targetMarket: targetMarket.trim() || undefined,
        productBatchNumber: productBatchNumber.trim() || undefined,
        expiryDate: expiryDate || undefined,
        notes: notes.trim() || undefined,
      });

      const passed = result.qaCheck.ok;
      toast({
        title: `출고 신청 ${result.releaseCode} 등록`,
        description: passed
          ? "✅ QA 자동 검증 통과 — 승인 대기"
          : `⚠️ QA 검증 일부 실패 (pending) — ${result.qaCheck.reason ?? ""}`,
        variant: passed ? "default" : "destructive",
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "신청 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>신규 출고 신청</DialogTitle>
          <DialogDescription>
            완료된 BMR 을 선택하면 자동 QA 검증 후 검토 대기 상태로 등록됩니다 (검증 실패 시에도 등록 가능, QA 후속 검토).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="relBmr">BMR 선택 (completed 상태) *</Label>
            <Select value={bmrId} onValueChange={setBmrId}>
              <SelectTrigger id="relBmr">
                <SelectValue placeholder="제조 완료된 BMR 선택" />
              </SelectTrigger>
              <SelectContent>
                {(bmrs?.items ?? []).map((b: any) => (
                  <SelectItem key={String(b.id)} value={String(b.id)}>
                    {b.bmrCode} · 제품 #{b.productId} · {Number(b.actualQuantityKg ?? b.plannedQuantityKg).toLocaleString("ko-KR")}kg
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(bmrs?.items ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">
                completed 상태 BMR 없음 — BMR 제조 완료 후 시도
              </p>
            )}
          </div>

          {/* QA 검증 결과 카드 */}
          {bmrIdNum > 0 && qaCheck.data && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                qaCheck.data.ok
                  ? "bg-emerald-50 border-emerald-200"
                  : "bg-amber-50 border-amber-200"
              }`}
            >
              <div className="flex items-center gap-2 font-medium mb-1">
                {qaCheck.data.ok ? (
                  <>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-900">QA 자동 검증 통과</span>
                  </>
                ) : (
                  <>
                    <ShieldX className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-900">QA 검증 일부 실패</span>
                  </>
                )}
              </div>
              <pre className="whitespace-pre-wrap text-[11px] font-mono">
                {qaCheck.data.message}
              </pre>
              {!qaCheck.data.ok && (
                <div className="mt-2 flex items-start gap-1.5 text-amber-800 text-[11px]">
                  <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>
                    검증 실패 항목이 있어도 pending 상태로 신청 가능 — QA 가 보완 후 재검증 (approve)
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="relQty">출고량 *</Label>
              <Input
                id="relQty"
                type="number"
                step="0.0001"
                min="0"
                value={releaseQuantity}
                onChange={(e) => setReleaseQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="relUnit">단위</Label>
              <Input
                id="relUnit"
                value={releaseUnit}
                onChange={(e) => setReleaseUnit(e.target.value)}
                placeholder="kg / EA"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="relMarket">대상 시장</Label>
              <Input
                id="relMarket"
                value={targetMarket}
                onChange={(e) => setTargetMarket(e.target.value)}
                placeholder="국내 / 수출"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="relBatch">제품 배치번호 (라벨 인쇄용)</Label>
              <Input
                id="relBatch"
                value={productBatchNumber}
                onChange={(e) => setProductBatchNumber(e.target.value)}
                placeholder="예: 2026-04-30-001"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="relExpiry">사용기한</Label>
              <Input
                id="relExpiry"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="relNotes">메모</Label>
            <Textarea
              id="relNotes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="출고 사유 / 특이사항"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "처리 중..." : "출고 신청"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
