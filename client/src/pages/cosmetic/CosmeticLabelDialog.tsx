/**
 * 라벨 신규/편집 Dialog (Phase 2-5)
 *
 * 헤더 필드 (이름/용량) + 제조사 정보. INCI/사용방법/주의사항은 detail 페이지에서.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";

export interface LabelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  label?: {
    id: number;
    productId: number;
    productNameKo: string;
    productNameEn?: string | null;
    capacity?: string | null;
    manufacturerName?: string | null;
    manufacturerAddress?: string | null;
    responsibleParty?: string | null;
  } | null;
  onSuccess?: () => void;
}

export function CosmeticLabelDialog({
  open,
  onOpenChange,
  mode,
  label,
  onSuccess,
}: LabelDialogProps) {
  const [productId, setProductId] = useState<string>("");
  const [productNameKo, setProductNameKo] = useState("");
  const [productNameEn, setProductNameEn] = useState("");
  const [capacity, setCapacity] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [manufacturerAddress, setManufacturerAddress] = useState("");
  const [responsibleParty, setResponsibleParty] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: productsData } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (productsData as any)?.items ?? (productsData as any) ?? [];

  useEffect(() => {
    if (mode === "edit" && label) {
      setProductId(String(label.productId));
      setProductNameKo(label.productNameKo);
      setProductNameEn(label.productNameEn ?? "");
      setCapacity(label.capacity ?? "");
      setManufacturerName(label.manufacturerName ?? "");
      setManufacturerAddress(label.manufacturerAddress ?? "");
      setResponsibleParty(label.responsibleParty ?? "");
    } else if (mode === "create" && open) {
      setProductId("");
      setProductNameKo("");
      setProductNameEn("");
      setCapacity("");
      setManufacturerName("");
      setManufacturerAddress("");
      setResponsibleParty("");
    }
  }, [mode, label, open]);

  const createMutation = trpc.cosmetic.label.create.useMutation();
  const updateMutation = trpc.cosmetic.label.updateDraft.useMutation();

  const handleSubmit = async () => {
    if (!productId) {
      toast({ title: "제품 필수", variant: "destructive" });
      return;
    }
    if (!productNameKo.trim()) {
      toast({ title: "한글 제품명 필수", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createMutation.mutateAsync({
          productId: Number(productId),
          productNameKo: productNameKo.trim(),
          productNameEn: productNameEn.trim() || undefined,
          capacity: capacity.trim() || undefined,
          manufacturerName: manufacturerName.trim() || undefined,
          manufacturerAddress: manufacturerAddress.trim() || undefined,
          responsibleParty: responsibleParty.trim() || undefined,
        });
        toast({
          title: `라벨 ${result.labelCode} 등록`,
          description: "draft — 다음 단계에서 INCI 입력",
        });
      } else if (label) {
        const result = await updateMutation.mutateAsync({
          id: label.id,
          productId: Number(productId),
          productNameKo: productNameKo.trim(),
          productNameEn: productNameEn.trim() || null,
          capacity: capacity.trim() || null,
          manufacturerName: manufacturerName.trim() || null,
          manufacturerAddress: manufacturerAddress.trim() || null,
          responsibleParty: responsibleParty.trim() || null,
        });
        if (!result.updated) {
          toast({
            title: "수정 실패",
            description: result.reason ?? "draft 만 수정 가능",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "라벨 헤더 수정 완료" });
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
            {mode === "create" ? "신규 라벨 등록" : "라벨 헤더 수정 (draft 만)"}
          </DialogTitle>
          <DialogDescription>
            제품 / 이름 / 용량 / 제조사 정보 — INCI / 사용방법 / 주의사항은 detail 페이지에서.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="lblProduct">제품 *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="lblProduct">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lblNameKo">한글 제품명 *</Label>
              <Input
                id="lblNameKo"
                value={productNameKo}
                onChange={(e) => setProductNameKo(e.target.value)}
                placeholder="예: 수분 크림"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lblNameEn">영문 제품명</Label>
              <Input
                id="lblNameEn"
                value={productNameEn}
                onChange={(e) => setProductNameEn(e.target.value)}
                placeholder="예: Hydrating Cream"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lblCap">용량</Label>
            <Input
              id="lblCap"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="예: 50mL / 100g"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lblMfr">제조사</Label>
            <Input
              id="lblMfr"
              value={manufacturerName}
              onChange={(e) => setManufacturerName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lblMfrAddr">제조사 주소</Label>
            <Textarea
              id="lblMfrAddr"
              rows={2}
              value={manufacturerAddress}
              onChange={(e) => setManufacturerAddress(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lblResp">책임판매업자</Label>
            <Input
              id="lblResp"
              value={responsibleParty}
              onChange={(e) => setResponsibleParty(e.target.value)}
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
