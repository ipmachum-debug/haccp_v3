import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Plus, Edit, Trash2, FolderTree } from "lucide-react";

type MajorCategory = "매입비" | "인건비" | "운영비" | "판매비" | "관리비" | "금융·기타";

const MAJOR_CATEGORIES: MajorCategory[] = [
  "매입비",
  "인건비",
  "운영비",
  "판매비",
  "관리비",
  "금융·기타",
];

const MAJOR_CATEGORY_COLORS: Record<MajorCategory, string> = {
  매입비: "bg-blue-100 text-blue-800",
  인건비: "bg-green-100 text-green-800",
  운영비: "bg-yellow-100 text-yellow-800",
  판매비: "bg-purple-100 text-purple-800",
  관리비: "bg-pink-100 text-pink-800",
  "금융·기타": "bg-gray-100 text-gray-800",
};

export default function AccountCategoryManagement() {
  return (
    <DashboardLayout>
      <AccountCategoryManagementContent />
    </DashboardLayout>
  );
}

function AccountCategoryManagementContent() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<any>(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    majorCategory: "매입비" as MajorCategory,
    minorCategory: "",
    description: "",
  });

  // 계정 과목 목록 조회
  const { data: categories, isLoading, refetch } = trpc.accountCategories.getAll.useQuery();

  // 계정 과목 등록 mutation
  const createMutation = trpc.accountCategories.create.useMutation({
    onSuccess: () => {
      toast({
        title: "등록 완료",
        description: "계정 과목이 등록되었습니다.",
      });
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "등록 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 계정 과목 수정 mutation
  const updateMutation = trpc.accountCategories.update.useMutation({
    onSuccess: () => {
      toast({
        title: "수정 완료",
        description: "계정 과목이 수정되었습니다.",
      });
      setIsEditDialogOpen(false);
      setEditingCategory(null);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "수정 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 계정 과목 삭제 mutation
  const deleteMutation = trpc.accountCategories.delete.useMutation({
    onSuccess: () => {
      toast({
        title: "삭제 완료",
        description: "계정 과목이 삭제되었습니다.",
      });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      majorCategory: "매입비",
      minorCategory: "",
      description: "",
    });
  };

  // 클라이언트 코드 자동 생성 (ACC-001 형식)
  const generateNextCode = useCallback(() => {
    const prefix = "ACC";
    const existingCodes = (categories || []).filter((c: any) => c.code?.startsWith(prefix + "-")).map((c: any) => {
      const parts = (c.code || "").split("-");
      return parseInt(parts[1] || "0", 10);
    }).filter((n: number) => !isNaN(n));
    const maxNum = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
    return `${prefix}-${(maxNum + 1).toString().padStart(3, "0")}`;
  }, [categories]);

  // 추가 다이얼로그가 열릴 때 자동 코드 생성
  useEffect(() => {
    if (isCreateDialogOpen) {
      const nextCode = generateNextCode();
      setFormData(prev => ({ ...prev, code: nextCode }));
    } else {
      resetForm();
    }
  }, [isCreateDialogOpen]);

  const handleCreate = () => {
    if (!formData.code || !formData.name) {
      toast({
        title: "입력 오류",
        description: "계정 코드와 계정명은 필수입니다.",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      code: formData.code,
      name: formData.name,
      majorCategory: formData.majorCategory,
      minorCategory: formData.minorCategory || undefined,
      description: formData.description || undefined,
    });
  };

  const handleEdit = () => {
    if (!formData.code || !formData.name) {
      toast({
        title: "입력 오류",
        description: "계정 코드와 계정명은 필수입니다.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      id: editingCategory.id,
      code: formData.code,
      name: formData.name,
      majorCategory: formData.majorCategory,
      minorCategory: formData.minorCategory || undefined,
      description: formData.description || undefined,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const openEditDialog = (category: any) => {
    setEditingCategory(category);
    setFormData({
      code: category.code,
      name: category.name,
      majorCategory: category.majorCategory,
      minorCategory: category.minorCategory || "",
      description: category.description || "",
    });
    setIsEditDialogOpen(true);
  };

  // 대분류별로 그룹화
  const groupedCategories = categories?.reduce((acc: any, category: any) => {
    const major = category.majorCategory as MajorCategory;
    if (!acc[major]) {
      acc[major] = [];
    }
    acc[major].push(category);
    return acc;
  }, {} as Record<MajorCategory, any[]>);

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center py-8 text-muted-foreground">
          데이터를 불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">계정 과목 관리</h1>
          <p className="text-muted-foreground mt-2">
            매입/매출 거래를 회계 항목으로 분류하기 위한 계정 과목을 관리합니다.
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          계정 과목 등록
        </Button>
      </div>

      {/* 대분류별 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {MAJOR_CATEGORIES.map((major) => {
          const items = groupedCategories?.[major] || [];
          return (
            <Card key={major}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderTree className="h-5 w-5" />
                  {major}
                </CardTitle>
                <CardDescription>{items.length}개 항목</CardDescription>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">등록된 계정 과목이 없습니다.</p>
                ) : (
                  <div className="space-y-2">
                    {items.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 rounded-md hover:bg-accent"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">{item.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {item.code}
                            {item.minorCategory && ` • ${item.minorCategory}`}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditDialog(item)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 전체 목록 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>전체 계정 과목 목록</CardTitle>
          <CardDescription>
            총 {categories?.length || 0}개의 계정 과목이 등록되어 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!categories || categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              등록된 계정 과목이 없습니다. 계정 과목을 등록해주세요.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>계정 코드</TableHead>
                  <TableHead>계정명</TableHead>
                  <TableHead>대분류</TableHead>
                  <TableHead>중분류</TableHead>
                  <TableHead>설명</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category: any) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-mono">{category.code}</TableCell>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          MAJOR_CATEGORY_COLORS[category.majorCategory as MajorCategory]
                        }
                      >
                        {category.majorCategory}
                      </Badge>
                    </TableCell>
                    <TableCell>{category.minorCategory || "-"}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {category.description || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(category)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(category.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 계정 과목 등록 다이얼로그 */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>계정 과목 등록</DialogTitle>
            <DialogDescription>
              새로운 계정 과목 정보를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">계정 코드 *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  readOnly
                  className="bg-muted"
                  placeholder="자동 생성됩니다"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="majorCategory">대분류 *</Label>
                <Select
                  value={formData.majorCategory}
                  onValueChange={(value) =>
                    setFormData({ ...formData, majorCategory: value as MajorCategory })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAJOR_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">계정명 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 원재료 매입"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="minorCategory">중분류</Label>
              <Input
                id="minorCategory"
                value={formData.minorCategory}
                onChange={(e) => setFormData({ ...formData, minorCategory: e.target.value })}
                placeholder="예: 원재료"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">설명</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="계정 과목에 대한 설명을 입력하세요"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateDialogOpen(false);
                resetForm();
              }}
            >
              취소
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "등록 중..." : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 계정 과목 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>계정 과목 수정</DialogTitle>
            <DialogDescription>
              계정 과목 정보를 수정하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-code">계정 코드</Label>
                <Input
                  id="edit-code"
                  value={formData.code}
                  readOnly
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-majorCategory">대분류 *</Label>
                <Select
                  value={formData.majorCategory}
                  onValueChange={(value) =>
                    setFormData({ ...formData, majorCategory: value as MajorCategory })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MAJOR_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-name">계정명 *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="예: 원재료 매입"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-minorCategory">중분류</Label>
              <Input
                id="edit-minorCategory"
                value={formData.minorCategory}
                onChange={(e) => setFormData({ ...formData, minorCategory: e.target.value })}
                placeholder="예: 원재료"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">설명</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="계정 과목에 대한 설명을 입력하세요"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingCategory(null);
              }}
            >
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
