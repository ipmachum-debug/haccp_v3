/**
 * 화장품 BMR 신규/편집 Dialog (Phase 2-2)
 *
 * 사용:
 *   <CosmeticBmrDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     mode="create"            // 또는 "edit"
 *     bmr={existingBmr}        // edit 시
 *     onSuccess={() => refetch()}
 *   />
 *
 * 모드:
 *   - create: trpc.cosmetic.bmr.create
 *   - edit:   trpc.cosmetic.bmr.updateDraft (draft 상태만)
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
import { toast } from "@/hooks/use-toast";

export interface BmrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  bmr?: {
    id: number;
    productId: number;
    batchNumber?: string | null;
    plannedQuantityKg: number;
    manufacturingDate?: string | Date | null;
    notes?: string | null;
  } | null;
  onSuccess?: () => void;
}

export function CosmeticBmrDialog({
  open,
  onOpenChange,
  mode,
  bmr,
  onSuccess,
}: BmrDialogProps) {
  const [productId, setProductId] = useState<string>("");
  const [batchNumber, setBatchNumber] = useState("");
  const [plannedQuantityKg, setPlannedQuantityKg] = useState<string>("");
  const [manufacturingDate, setManufacturingDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 제품 목록 (선택 필드용)
  const { data: productsData } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (productsData as any)?.items ?? (productsData as any) ?? [];

  // edit 모드 진입 시 기존 값 채우기
  useEffect(() => {
    if (mode === "edit" && bmr) {
      setProductId(String(bmr.productId));
      setBatchNumber(bmr.batchNumber ?? "");
      setPlannedQuantityKg(String(bmr.plannedQuantityKg ?? ""));
      const md = bmr.manufacturingDate
        ? typeof bmr.manufacturingDate === "string"
          ? bmr.manufacturingDate.slice(0, 10)
          : new Date(bmr.manufacturingDate).toISOString().slice(0, 10)
        : "";
      setManufacturingDate(md);
      setNotes(bmr.notes ?? "");
    } else if (mode === "create" && open) {
      // create 진입 시 reset
      setProductId("");
      setBatchNumber("");
      setPlannedQuantityKg("");
      setManufacturingDate("");
      setNotes("");
    }
  }, [mode, bmr, open]);

  const createMutation = trpc.cosmetic.bmr.create.useMutation();
  const updateMutation = trpc.cosmetic.bmr.updateDraft.useMutation();

  const handleSubmit = async () => {
    if (!productId) {
      toast({ title: "제품 필수", variant: "destructive" });
      return;
    }
    const qty = Number(plannedQuantityKg);
    if (!Number.isFinite(qty) || qty <= 0) {
      toast({ title: "계획량 (kg) 양수 입력", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createMutation.mutateAsync({
          productId: Number(productId),
          plannedQuantityKg: qty,
          batchNumber: batchNumber || undefined,
          manufacturingDate: manufacturingDate || undefined,
          notes: notes || undefined,
        });
        toast({
          title: `BMR ${result.bmrCode} 신규 등록`,
          description: "Draft 상태로 생성됨 — QA 승인 대기",
        });
      } else {
        if (!bmr) return;
        const result = await updateMutation.mutateAsync({
          id: bmr.id,
          productId: Number(productId),
          plannedQuantityKg: qty,
          batchNumber: batchNumber || null,
          manufacturingDate: manufacturingDate || null,
          notes: notes || null,
        });
        if (!result.updated) {
          toast({
            title: "수정 실패",
            description: result.reason ?? "draft 상태에서만 수정 가능",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "BMR 수정 완료" });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "처리 실패",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "신규 BMR 등록" : "BMR 수정 (draft 만)"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "신규 BMR 은 draft 상태로 생성됩니다. QA 승인 후 제조 시작 가능."
              : "draft 상태에서만 수정 가능. 승인 이후엔 거절/재오픈 후 신규 생성 권장."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="productId">제품 *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="productId">
                <SelectValue placeholder="제품 선택" />
              </SelectTrigger>
              <SelectContent>
                {(products as any[]).map((p: any) => (
                  <SelectItem key={String(p.id)} value={String(p.id)}>
                    {p.productCode ? `[${p.productCode}] ` : ""}
                    {p.productName ?? p.name ?? `#${p.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="plannedQuantityKg">계획량 (kg) *</Label>
              <Input
                id="plannedQuantityKg"
                type="number"
                step="0.001"
                min="0"
                value={plannedQuantityKg}
                onChange={(e) => setPlannedQuantityKg(e.target.value)}
                placeholder="예: 100"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manufacturingDate">제조일</Label>
              <Input
                id="manufacturingDate"
                type="date"
                value={manufacturingDate}
                onChange={(e) => setManufacturingDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="batchNumber">배치 번호 (선택)</Label>
            <Input
              id="batchNumber"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="예: 2026-04-29-001"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">메모</Label>
            <Textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="원료/처방 / 특이사항 등"
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
            {submitting ? "처리 중..." : mode === "create" ? "등록" : "수정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
