import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Edit, Trash2, GripVertical, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type CategoryType = "material" | "product" | "purchase" | "sale";

interface Category {
  id: number;
  type: CategoryType;
  name: string;
  code?: string | null;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  sortOrder: number;
  isActive: number;
  isDefault: number;
  dateManagementType?: "none" | "expiry" | "production" | "both";
  alertDays?: number;
}

const categoryTypeLabels: Record<CategoryType, string> = {
  material: "원재료",
  product: "제품",
  purchase: "매입",
  sale: "매출",
};

export default function CategoryManagement() {
  const [activeTab, setActiveTab] = useState<CategoryType>("material");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    color: "#3B82F6",
    dateManagementType: "none" as "none" | "expiry" | "production" | "both",
    alertDays: 0,
  });

  const utils = trpc.useUtils();

  // 카테고리 목록 조회
  const { data: categories = [], isLoading } = trpc.categories.listByType.useQuery({ type: activeTab });

  // 카테고리 생성
  const createMutation = trpc.categories.create.useMutation({
    onSuccess: () => {
      toast.success("카테고리가 추가되었습니다.");
      utils.categories.listByType.invalidate();
      setIsAddDialogOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "카테고리 추가에 실패했습니다.");
    },
  });

  // 카테고리 수정
  const updateMutation = trpc.categories.update.useMutation({
    onSuccess: () => {
      toast.success("카테고리가 수정되었습니다.");
      utils.categories.listByType.invalidate();
      setIsEditDialogOpen(false);
      setEditingCategory(null);
      resetForm();
    },
    onError: (error) => {
      toast.error(error.message || "카테고리 수정에 실패했습니다.");
    },
  });

  // 카테고리 삭제
  const deleteMutation = trpc.categories.delete.useMutation({
    onSuccess: () => {
      toast.success("카테고리가 삭제되었습니다.");
      utils.categories.listByType.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "카테고리 삭제에 실패했습니다.");
    },
  });

  // 기본 카테고리 시드
  const seedMutation = trpc.categories.seedDefaults.useMutation({
    onSuccess: () => {
      toast.success("기본 카테고리가 생성되었습니다.");
      utils.categories.listByType.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "기본 카테고리 생성에 실패했습니다.");
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      description: "",
      color: "#3B82F6",
      dateManagementType: "none" as "none" | "expiry" | "production" | "both",
      alertDays: 0,
    });
  };

  // 타입별 코드 접두사
  const codePrefix: Record<CategoryType, string> = {
    material: "MCAT",
    product: "PCAT",
    purchase: "PUCAT",
    sale: "SCAT",
  };

  // 클라이언트 코드 자동 생성
  const generateNextCode = useCallback(() => {
    const prefix = codePrefix[activeTab];
    const existingCodes = (categories || []).filter((c: Category) => c.code?.startsWith(prefix + "-")).map((c: Category) => {
      const parts = (c.code || "").split("-");
      return parseInt(parts[1] || "0", 10);
    }).filter((n: number) => !isNaN(n));
    const maxNum = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    return `${prefix}-${(maxNum + 1).toString().padStart(3, "0")}`;
  }, [categories, activeTab]);

  // 추가 다이얼로그가 열릴 때 자동 코드 생성
  useEffect(() => {
    if (isAddDialogOpen) {
      const nextCode = generateNextCode();
      setFormData(prev => ({ ...prev, code: nextCode }));
    } else {
      resetForm();
    }
  }, [isAddDialogOpen]);

  const handleAdd = () => {
    if (!formData.name.trim()) {
      toast.error("카테고리 이름을 입력해주세요.");
      return;
    }

    createMutation.mutate({
      type: activeTab,
      name: formData.name.trim(),
      code: formData.code.trim() || undefined,
      description: formData.description.trim() || undefined,
      color: formData.color || undefined,
      dateManagementType: formData.dateManagementType,
      alertDays: formData.alertDays,
    });
  };

  const handleEdit = () => {
    if (!editingCategory) return;
    if (!formData.name.trim()) {
      toast.error("카테고리 이름을 입력해주세요.");
      return;
    }

    updateMutation.mutate({
      id: editingCategory.id,
      name: formData.name.trim(),
      code: formData.code.trim() || undefined,
      description: formData.description.trim() || undefined,
      color: formData.color || undefined,
      dateManagementType: formData.dateManagementType,
      alertDays: formData.alertDays,
    });
  };

  const handleDelete = (category: Category) => {
    if (category.isDefault === 1) {
      toast.error("기본 카테고리는 삭제할 수 없습니다.");
      return;
    }

    if (confirm(`"${category.name}" 카테고리를 삭제하시겠습니까?`)) {
      deleteMutation.mutate({ id: category.id });
    }
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name,
      code: category.code || "",
      description: category.description || "",
      color: category.color || "#3B82F6",
      dateManagementType: category.dateManagementType || "none",
      alertDays: category.alertDays || 0,
    });
    setIsEditDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">카테고리 관리</h1>
          <p className="text-muted-foreground mt-1">
            원재료, 제품, 매입, 매출 카테고리를 관리합니다
          </p>
        </div>
        <Button
          onClick={() => seedMutation.mutate()}
          variant="outline"
          disabled={seedMutation.isPending}
        >
          기본 카테고리 생성
        </Button>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          회사마다 다른 카테고리를 사용할 수 있도록 자유롭게 추가/수정/삭제할 수 있습니다.
          기본 카테고리는 삭제할 수 없습니다.
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as CategoryType)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="material">원재료</TabsTrigger>
          <TabsTrigger value="product">제품</TabsTrigger>
          <TabsTrigger value="purchase">매입</TabsTrigger>
          <TabsTrigger value="sale">매출</TabsTrigger>
        </TabsList>

        {(["material", "product", "purchase", "sale"] as CategoryType[]).map((type) => (
          <TabsContent key={type} value={type} className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{categoryTypeLabels[type]} 카테고리</CardTitle>
                    <CardDescription>
                      {categoryTypeLabels[type]} 관리에 사용되는 카테고리 목록
                    </CardDescription>
                  </div>
                  <Button onClick={() => setIsAddDialogOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    카테고리 추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </div>
                ) : categories.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    등록된 카테고리가 없습니다.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                      >
                        <GripVertical className="w-5 h-5 text-muted-foreground cursor-move" />
                        
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0"
                          style={{ backgroundColor: category.color || "#3B82F6" }}
                        />
                        
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{category.name}</span>
                            {category.code && (
                              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                {category.code}
                              </span>
                            )}
                            {category.isDefault === 1 && (
                              <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                                기본
                              </span>
                            )}
                          </div>
                          {category.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {category.description}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(category)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(category)}
                            disabled={category.isDefault === 1}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* 추가 다이얼로그 */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>카테고리 추가</DialogTitle>
            <DialogDescription>
              새로운 {categoryTypeLabels[activeTab]} 카테고리를 추가합니다
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">카테고리 이름 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 육류, 완제품 등"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">코드</Label>
              <Input
                id="code"
                value={formData.code}
                readOnly
                className="bg-muted"
                placeholder="자동 생성됩니다"
              />
              <p className="text-xs text-muted-foreground">코드는 자동으로 생성됩니다</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">설명 (선택)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="카테고리 설명을 입력하세요"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="color">색상</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-20 h-10"
                />
                <span className="text-sm text-muted-foreground">{formData.color}</span>
              </div>
            </div>

            {/* 날짜 관리 유형 (원재료/제품 카테고리에만 표시) */}
            {(activeTab === "material" || activeTab === "product") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dateManagementType">날짜 관리 유형</Label>
                  <select
                    id="dateManagementType"
                    value={formData.dateManagementType}
                    onChange={(e) => setFormData({ ...formData, dateManagementType: e.target.value as "none" | "expiry" | "production" | "both" })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="none">날짜 관리 안 함</option>
                    <option value="expiry">소비기한만 관리</option>
                    <option value="production">생산일자만 관리</option>
                    <option value="both">소비기한 + 생산일자 모두 관리</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    매입 입력 시 날짜 필드가 동적으로 표시됩니다.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="alertDays">알람일수 (선택)</Label>
                  <Input
                    id="alertDays"
                    type="number"
                    min="0"
                    value={formData.alertDays}
                    onChange={(e) => setFormData({ ...formData, alertDays: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    0이면 알람 없이 날짜만 기록. N일 전/후 알람 설정 가능.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? "추가 중..." : "추가"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>카테고리 수정</DialogTitle>
            <DialogDescription>
              {categoryTypeLabels[activeTab]} 카테고리 정보를 수정합니다
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">카테고리 이름 *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 육류, 완제품 등"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-code">코드</Label>
              <Input
                id="edit-code"
                value={formData.code}
                readOnly
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-description">설명 (선택)</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="카테고리 설명을 입력하세요"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-color">색상</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-20 h-10"
                />
                <span className="text-sm text-muted-foreground">{formData.color}</span>
              </div>
            </div>

            {/* 날짜 관리 유형 (원재료/제품 카테고리에만 표시) */}
            {(activeTab === "material" || activeTab === "product") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="edit-dateManagementType">날짜 관리 유형</Label>
                  <select
                    id="edit-dateManagementType"
                    value={formData.dateManagementType}
                    onChange={(e) => setFormData({ ...formData, dateManagementType: e.target.value as "none" | "expiry" | "production" | "both" })}
                    className="w-full px-3 py-2 border border-input rounded-md bg-background"
                  >
                    <option value="none">날짜 관리 안 함</option>
                    <option value="expiry">소비기한만 관리</option>
                    <option value="production">생산일자만 관리</option>
                    <option value="both">소비기한 + 생산일자 모두 관리</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    매입 입력 시 날짜 필드가 동적으로 표시됩니다.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-alertDays">알람일수 (선택)</Label>
                  <Input
                    id="edit-alertDays"
                    type="number"
                    min="0"
                    value={formData.alertDays}
                    onChange={(e) => setFormData({ ...formData, alertDays: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                  />
                  <p className="text-xs text-muted-foreground">
                    0이면 알람 없이 날짜만 기록. N일 전/후 알람 설정 가능.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleEdit} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
