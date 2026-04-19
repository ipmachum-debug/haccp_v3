import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus } from "lucide-react";
import { toast } from "sonner";

interface CategorySelectProps {
  type: "material" | "product" | "purchase" | "sale";
  value: number | undefined; // categoryId
  onChange: (value: number | undefined) => void;
  placeholder?: string;
}

export default function CategorySelect({ type, value, onChange, placeholder = "카테고리를 선택하세요" }: CategorySelectProps) {
  const { data: categories = [], isLoading, refetch } = trpc.categories.listByType.useQuery({ type });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: "",
    code: "",
    color: "#3b82f6",
  });

  const createMutation = trpc.categories.create.useMutation({
    onSuccess: (data: any) => {
      toast.success("카테고리가 등록되었습니다.");
      setIsDialogOpen(false);
      setNewCategory({ name: "", code: "", color: "#3b82f6" });
      refetch();
      onChange(data.id); // 새로 생성된 카테고리 자동 선택 (ID)
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "카테고리 등록에 실패했습니다.");
    },
  });

  const handleCreate = () => {
    console.log('[DEBUG] handleCreate called', newCategory);
    if (!newCategory.name.trim()) {
      toast.error("카테고리 이름을 입력해주세요.");
      return;
    }
    if (!newCategory.code.trim()) {
      toast.error("카테고리 코드를 입력해주세요.");
      return;
    }

    console.log('[DEBUG] Calling createMutation.mutate', { type, name: newCategory.name, code: newCategory.code, color: newCategory.color });
    createMutation.mutate({
      type,
      name: newCategory.name,
      code: newCategory.code,
      color: newCategory.color,
    });
  };

  // 로딩 중일 때도 + 버튼은 표시

  return (
    <>
      <div className="flex gap-2">
        <Select value={value?.toString()} onValueChange={(val) => onChange(val ? Number(val) : undefined)} disabled={isLoading}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={isLoading ? "로딩 중..." : placeholder} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category: any) => (
              <SelectItem key={category.id} value={category.id.toString()}>
                <div className="flex items-center gap-2">
                  {category.color && (
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: category.color }}
                    />
                  )}
                  <span>{category.name}</span>
                  {category.code && (
                    <span className="text-xs text-muted-foreground">({category.code})</span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setIsDialogOpen(true)}
          title="카테고리 추가"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>카테고리 등록</DialogTitle>
            <DialogDescription>
              새로운 카테고리를 등록합니다
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="categoryName">카테고리 이름 *</Label>
              <Input
                id="categoryName"
                value={newCategory.name}
                onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })}
                placeholder="예: 냉동식품"
              />
            </div>

            <div>
              <Label htmlFor="categoryCode">카테고리 코드 *</Label>
              <Input
                id="categoryCode"
                value={newCategory.code}
                onChange={(e) => setNewCategory({ ...newCategory, code: e.target.value })}
                placeholder="예: FROZEN"
              />
            </div>

            <div>
              <Label htmlFor="categoryColor">색상</Label>
              <div className="flex gap-2 items-center">
                <Input
                  id="categoryColor"
                  type="color"
                  value={newCategory.color}
                  onChange={(e) => setNewCategory({ ...newCategory, color: e.target.value })}
                  className="w-20 h-10"
                />
                <span className="text-sm text-muted-foreground">{newCategory.color}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              등록
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
