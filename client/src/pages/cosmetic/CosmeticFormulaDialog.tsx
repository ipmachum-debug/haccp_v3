/**
 * 배합표 신규/편집 Dialog (Phase 2-4a)
 *
 * 헤더 필드만 (배합 항목은 detail 페이지에서 편집).
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

export interface FormulaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  formula?: {
    id: number;
    productId: number;
    name: string;
    version: string;
    description?: string | null;
  } | null;
  onSuccess?: () => void;
}

export function CosmeticFormulaDialog({
  open,
  onOpenChange,
  mode,
  formula,
  onSuccess,
}: FormulaDialogProps) {
  const [productId, setProductId] = useState<string>("");
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: productsData } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (productsData as any)?.items ?? (productsData as any) ?? [];

  useEffect(() => {
    if (mode === "edit" && formula) {
      setProductId(String(formula.productId));
      setName(formula.name);
      setVersion(formula.version);
      setDescription(formula.description ?? "");
    } else if (mode === "create" && open) {
      setProductId("");
      setName("");
      setVersion("1.0");
      setDescription("");
    }
  }, [mode, formula, open]);

  const createMutation = trpc.cosmetic.formula.create.useMutation();
  const updateMutation = trpc.cosmetic.formula.updateDraft.useMutation();

  const handleSubmit = async () => {
    if (!productId) {
      toast({ title: "제품 필수", variant: "destructive" });
      return;
    }
    if (!name.trim()) {
      toast({ title: "배합표 이름 필수", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createMutation.mutateAsync({
          productId: Number(productId),
          name: name.trim(),
          version: version.trim() || undefined,
          description: description.trim() || undefined,
        });
        toast({
          title: `배합표 ${result.formulaCode} 등록`,
          description: "Draft — 다음 단계에서 배합 항목 추가",
        });
      } else if (formula) {
        const result = await updateMutation.mutateAsync({
          id: formula.id,
          productId: Number(productId),
          name: name.trim(),
          version: version.trim(),
          description: description.trim() || null,
        });
        if (!result.updated) {
          toast({
            title: "수정 실패",
            description: result.reason ?? "draft 만 수정 가능",
            variant: "destructive",
          });
          return;
        }
        toast({ title: "배합표 수정 완료" });
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
            {mode === "create" ? "신규 배합표 등록" : "배합표 수정 (draft 만)"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "헤더만 먼저 등록 — 배합 항목 (원료 + 배합비) 은 다음 단계에서 추가."
              : "draft 상태에서만 헤더 수정 가능."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="formProduct">제품 *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="formProduct">
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

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="formName">배합표 이름 *</Label>
              <Input
                id="formName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 수분크림 표준 배합표"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="formVersion">버전</Label>
              <Input
                id="formVersion"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="formDesc">설명</Label>
            <Textarea
              id="formDesc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="배합 의도 / 변경 사유 / 참고 사항"
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
