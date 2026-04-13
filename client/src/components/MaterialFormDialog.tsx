import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import CategorySelect from "./masterData/CategorySelect";

interface MaterialFormData {
  materialName: string;
  materialCode: string;
  category: string; // 레거시 필드 (문자열 카테고리)
  categoryId?: number; // 카테고리 ID
  unit: string;
  safetyStock: number;
  expiryWarningDays: number;
  defaultPackagingSize?: number; // 기본 포장 규격
}

interface MaterialFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initialData?: MaterialFormData;
  materialId?: number;
  onSuccess?: () => void;
}

export default function MaterialFormDialog({
  open,
  onOpenChange,
  mode,
  initialData,
  materialId,
  onSuccess,
}: MaterialFormDialogProps) {
  const utils = trpc.useUtils();
  const { data: categories } = trpc.categories.listAll.useQuery();

  const [formData, setFormData] = useState<MaterialFormData>({
    materialName: "",
    materialCode: "",
    category: "",
    categoryId: undefined,
    unit: "KG",
    safetyStock: 0,
    expiryWarningDays: 7,
    defaultPackagingSize: undefined,
  });

  // initialData가 변경될 때 formData 업데이트
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    } else {
      setFormData({
        materialName: "",
        materialCode: "",
        category: "",
        categoryId: undefined,
        unit: "KG",
        safetyStock: 0,
        expiryWarningDays: 7,
        defaultPackagingSize: undefined,
      });
    }
  }, [initialData, open]);

  const createMutation = trpc.material.create.useMutation({
    onSuccess: () => {
      toast.success("원재료가 등록되었습니다.");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error.message || "원재료 등록에 실패했습니다.");
    },
  });

  const updateMutation = trpc.material.update.useMutation({
    onSuccess: () => {
      toast.success("원재료가 수정되었습니다.");
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast.error(error.message || "원재료 수정에 실패했습니다.");
    },
  });

  const handleSubmit = () => {
    if (!formData.materialName.trim()) {
      toast.error("원재료명을 입력해주세요.");
      return;
    }
    if (!formData.materialCode.trim()) {
      toast.error("원재료코드를 입력해주세요.");
      return;
    }

    if (mode === "create") {
      createMutation.mutate({
        materialName: formData.materialName.trim(),
        materialCode: formData.materialCode.trim(),
        category: formData.category.trim() || undefined,
        categoryId: formData.categoryId,
        unit: formData.unit.trim(),
        safetyStockLevel: formData.safetyStock.toString(),
        expiryWarningDays: formData.expiryWarningDays,
        defaultPackagingSize: formData.defaultPackagingSize,
      });
    } else if (mode === "edit" && materialId) {
      updateMutation.mutate({
        id: materialId,
        materialName: formData.materialName.trim(),
        materialCode: formData.materialCode.trim(),
        category: formData.category.trim() || undefined,
        categoryId: formData.categoryId,
        unit: formData.unit.trim(),
        safetyStockLevel: formData.safetyStock.toString(),
        expiryWarningDays: formData.expiryWarningDays,
        defaultPackagingSize: formData.defaultPackagingSize,
      });
    }
  };

  const handleGenerateCode = async () => {
    try {
      const code = `MAT-${String(Date.now()).slice(-6)}`;
      setFormData({ ...formData, materialCode: code });
      toast.success(`코드 자동 생성: ${code}`);
    } catch (error: any) {
      toast.error("코드 생성 실패: " + error.message);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "원재료 등록" : "원재료 수정"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "새로운 원재료를 등록합니다" : "원재료 정보를 수정합니다"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="materialName">원재료명 *</Label>
            <Input
              id="materialName"
              value={formData.materialName}
              onChange={(e) => setFormData({ ...formData, materialName: e.target.value })}
              placeholder="예: 돼지고기"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="materialCode">원재료코드 *</Label>
            <div className="flex gap-2">
              <Input
                id="materialCode"
                value={formData.materialCode}
                onChange={(e) => setFormData({ ...formData, materialCode: e.target.value })}
                placeholder="예: MAT-001"
              />
              <Button type="button" variant="outline" onClick={handleGenerateCode}>
                자동생성
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">예: MAT-001</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="category">카테고리</Label>
            <CategorySelect
              type="material"
              value={formData.categoryId}
              onChange={(value) => setFormData({ ...formData, categoryId: value })}
              placeholder="카테고리를 선택하세요"
            />
            {formData.categoryId && categories && (() => {
              const selectedCategory = categories.find((c: any) => c.id === formData.categoryId);
              if (selectedCategory?.dateManagementType && selectedCategory.dateManagementType !== 'none') {
                const typeText = selectedCategory.dateManagementType === 'expiry' ? '소비기한'
                  : selectedCategory.dateManagementType === 'production' ? '생산일자'
                  : '소비기한 및 생산일자';
                return (
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    ℹ️ 이 카테고리는 <strong>{typeText}</strong> 관리가 필요합니다. 매입 입력 시 해당 날짜를 입력하세요.
                  </p>
                );
              }
              return null;
            })()}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="unit">단위</Label>
            <Input
              id="unit"
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              placeholder="예: KG, L, EA"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="defaultPackagingSize">기본 포장규격</Label>
            <Input
              id="defaultPackagingSize"
              type="number"
              value={formData.defaultPackagingSize || ""}
              onChange={(e) => setFormData({ ...formData, defaultPackagingSize: parseFloat(e.target.value) || undefined })}
              placeholder="예: 5 (5kg 포장)"
            />
            <p className="text-sm text-muted-foreground">
              매입 등록 시 기본값으로 사용됩니다. (예: 5kg 포장이면 5 입력)
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="safetyStock">안전재고</Label>
            <Input
              id="safetyStock"
              type="number"
              value={formData.safetyStock}
              onChange={(e) => setFormData({ ...formData, safetyStock: parseFloat(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="expiryWarningDays">유통기한 알림 기준일 (일)</Label>
            <Input
              id="expiryWarningDays"
              type="number"
              value={formData.expiryWarningDays}
              onChange={(e) => setFormData({ ...formData, expiryWarningDays: parseInt(e.target.value) || 7 })}
              placeholder="7"
            />
            <p className="text-sm text-muted-foreground">
              유통기한이 이 기준일 이내로 남았을 때 알림을 받습니다. (예: 7일 입력 시 유통기한 7일 전 알림)
            </p>
          </div>
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
