import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import CategorySelect from "./CategorySelect";

interface ProductFormData {
  productName: string;
  productCode: string;
  category: string;
  unit: string;
  unitPrice: number;
  shelfLifeMonths: number;
  description: string;
  isActive?: number;
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialData?: ProductFormData;
  productId?: number;
  onSuccess?: () => void;
}

export default function ProductFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  productId,
  onSuccess,
}: ProductFormDialogProps) {
  const utils = trpc.useUtils();

  const [formData, setFormData] = useState<ProductFormData>({
    productName: "",
    productCode: "",
    category: "",
    unit: "EA",
    unitPrice: 0,
    shelfLifeMonths: 0,
    description: "",
    isActive: 1,
  });

  // initialData가 변경될 때 formData 업데이트
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        productName: "",
        productCode: "",
        category: "",
        unit: "EA",
        unitPrice: 0,
        shelfLifeMonths: 0,
        description: "",
        isActive: 1,
      });
    }
  }, [initialData, open]);

  const createMutation = trpc.product.create.useMutation({
    onSuccess: () => {
      toast.success("제품이 등록되었습니다.");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "제품 등록에 실패했습니다.");
    },
  });

  const updateMutation = trpc.product.update.useMutation({
    onSuccess: () => {
      toast.success("제품이 수정되었습니다.");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "제품 수정에 실패했습니다.");
    },
  });

  const handleSubmit = () => {
    if (!formData.productName.trim()) {
      toast.error("제품명을 입력해주세요.");
      return;
    }
    if (!formData.productCode.trim()) {
      toast.error("제품코드를 입력해주세요.");
      return;
    }

    if (mode === "create") {
      createMutation.mutate({
        productName: formData.productName.trim(),
        productCode: formData.productCode.trim(),
        category: formData.category.trim() || undefined,
        unit: formData.unit.trim(),
        unitPrice: formData.unitPrice.toString(),
        shelfLifeDays: formData.shelfLifeMonths * 30,
        description: formData.description.trim() || undefined,
        isActive: formData.isActive || 1,
      });
    } else if (mode === "edit" && productId) {
      updateMutation.mutate({
        id: productId,
        productName: formData.productName.trim(),
        productCode: formData.productCode.trim(),
        category: formData.category.trim() || undefined,
        unit: formData.unit.trim(),
        unitPrice: formData.unitPrice.toString(),
        shelfLifeDays: formData.shelfLifeMonths * 30,
        description: formData.description.trim() || undefined,
        isActive: formData.isActive || 1,
      });
    }
  };

  const handleGenerateCode = async () => {
    try {
      const result = await utils.product.generateCode.fetch();
      setFormData({ ...formData, productCode: result });
      toast.success(`코드 자동 생성: ${result}`);
    } catch (error: any) {
      toast.error("코드 생성 실패: " + error.message);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "제품 등록" : "제품 수정"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "새로운 제품을 등록합니다" : "제품 정보를 수정합니다"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="productName">제품명 *</Label>
            <Input
              id="productName"
              value={formData.productName}
              onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
              placeholder="예: 돈까스"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="productCode">제품코드 *</Label>
            <div className="flex gap-2">
              <Input
                id="productCode"
                value={formData.productCode}
                onChange={(e) => setFormData({ ...formData, productCode: e.target.value })}
                placeholder="예: PRD-001"
              />
              <Button type="button" variant="outline" onClick={handleGenerateCode}>
                자동생성
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">예: PRD-001</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">카테고리</Label>
            <CategorySelect
              type="product"
              value={formData.category as any}
              onChange={(value) => setFormData({ ...formData, category: value as any })}
              placeholder="카테고리를 선택하세요"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="unit">단위</Label>
            <Input
              id="unit"
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              placeholder="예: EA, KG, BOX"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="unitPrice">판매가 (원)</Label>
            <Input
              id="unitPrice"
              type="number"
              value={formData.unitPrice}
              onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="shelfLifeMonths">유통기한 (월)</Label>
            <Input
              id="shelfLifeMonths"
              type="number"
              value={formData.shelfLifeMonths}
              onChange={(e) => setFormData({ ...formData, shelfLifeMonths: parseInt(e.target.value) || 0 })}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              월 단위로 입력합니다. (예: 6개월)
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description">설명</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="제품 설명을 입력하세요"
              rows={3}
            />
          </div>

          {mode === "edit" && (
            <div className="grid gap-2">
              <Label htmlFor="isActive">상태</Label>
              <select
                id="isActive"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: parseInt(e.target.value) })}
              >
                <option value={1}>활성</option>
                <option value={0}>비활성</option>
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "처리 중..." : mode === "create" ? "등록" : "수정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
