import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2, Copy, History, Search } from "lucide-react";
import { toast } from "sonner";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
export default function RecipeManagement() {
  const L = useIndustryLabel();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState<any>(null);
  const [isVersionHistoryOpen, setIsVersionHistoryOpen] = useState(false);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);

  // 레시피 목록 조회
  const { data: recipes, refetch } = trpc.recipeManagement.list.useQuery({
    productId: selectedProductId,
  });

  // 제품 목록 조회
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);

  // 원재료 목록 조회
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);

  // 레시피 버전 이력 조회
  const { data: versions } = trpc.recipeManagement.getVersions.useQuery(
    { recipeId: selectedRecipeId! },
    { enabled: !!selectedRecipeId }
  );

  // 레시피 생성
  const createMutation = trpc.recipeManagement.create.useMutation({
    onSuccess: () => {
      toast.success("레시피가 생성되었습니다.");
      setIsCreateDialogOpen(false);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "레시피 생성 중 오류가 발생했습니다.");
    },
  });

  // 레시피 수정
  const updateMutation = trpc.recipeManagement.update.useMutation({
    onSuccess: () => {
      toast.success("레시피가 수정되었습니다.");
      setEditingRecipe(null);
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "레시피 수정 중 오류가 발생했습니다.");
    },
  });

  // 레시피 삭제
  const deleteMutation = trpc.recipeManagement.delete.useMutation({
    onSuccess: () => {
      toast.success("레시피가 삭제되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "레시피 삭제 중 오류가 발생했습니다.");
    },
  });

  // 레시피 복제
  const duplicateMutation = trpc.recipeManagement.duplicate.useMutation({
    onSuccess: () => {
      toast.success("레시피가 복제되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "레시피 복제 중 오류가 발생했습니다.");
    },
  });

  // 레시피 활성화/비활성화
  const toggleActiveMutation = trpc.recipeManagement.toggleActive.useMutation({
    onSuccess: () => {
      toast.success("레시피 상태가 변경되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "레시피 상태 변경 중 오류가 발생했습니다.");
    },
  });

  const handleDelete = (id: number) => {
    if (confirm("정말 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleDuplicate = (id: number) => {
    const newName = prompt("새 레시피 이름을 입력하세요:");
    if (newName) {
      duplicateMutation.mutate({ id, newRecipeName: newName });
    }
  };

  const handleToggleActive = (id: number, isActive: boolean) => {
    toggleActiveMutation.mutate({ id, isActive: !isActive });
  };

  const filteredRecipes = recipes?.filter((recipe: any) =>
    recipe.recipeName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">레시피 관리 (품목제조보고서)</CardTitle>
          <p className="text-sm text-muted-foreground mt-2">
            제품별 레시피를 등록하고 원재료 배합 비율을 관리합니다. 레시피는 배치 생성 시 자동으로 적용됩니다.
          </p>
        </CardHeader>
        <CardContent>
          {/* 검색 및 필터 */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="레시피 이름 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={selectedProductId?.toString() || "all"}
              onValueChange={(value) =>
                setSelectedProductId(value === "all" ? undefined : parseInt(value))
              }
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="제품 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 제품</SelectItem>
                {products?.map((product: any) => (
                  <SelectItem key={product.id} value={product.id.toString()}>
                    {product.productName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  새 레시피 생성
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>새 레시피 생성</DialogTitle>
                </DialogHeader>
                <RecipeForm
                  products={products}
                  materials={materials}
                  onSubmit={(data: any) => createMutation.mutate(data)}
                  onCancel={() => setIsCreateDialogOpen(false)}
                />
              </DialogContent>
            </Dialog>
          </div>

          {/* 레시피 목록 */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>레시피 이름</TableHead>
                <TableHead>제품</TableHead>
                <TableHead>버전</TableHead>
                <TableHead>배치 크기</TableHead>
                <TableHead>수율</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecipes?.map((recipe: any) => (
                <TableRow key={recipe.id}>
                  <TableCell className="font-medium">{recipe.recipeName}</TableCell>
                  <TableCell>{recipe.productName}</TableCell>
                  <TableCell>{recipe.version}</TableCell>
                  <TableCell>
                    {recipe.batchSize} {recipe.batchUnit}
                  </TableCell>
                  <TableCell>{recipe.yieldRate || "-"}%</TableCell>
                  <TableCell>
                    <Button
                      variant={recipe.isActive ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleToggleActive(recipe.id, recipe.isActive)}
                    >
                      {recipe.isActive ? "활성" : "비활성"}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingRecipe(recipe);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDuplicate(recipe.id)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRecipeId(recipe.id);
                          setIsVersionHistoryOpen(true);
                        }}
                      >
                        <History className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(recipe.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 레시피 수정 다이얼로그 */}
      {editingRecipe && (
        <Dialog open={!!editingRecipe} onOpenChange={() => setEditingRecipe(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>레시피 수정</DialogTitle>
            </DialogHeader>
            <RecipeForm
              products={products}
              materials={materials}
              initialData={editingRecipe}
                  onSubmit={(data: any) => updateMutation.mutate({ id: editingRecipe.id, ...data })}
              onCancel={() => setEditingRecipe(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* 버전 이력 다이얼로그 */}
      <Dialog open={isVersionHistoryOpen} onOpenChange={setIsVersionHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>레시피 버전 이력</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {versions?.map((version: any) => (
              <Card key={version.id}>
                <CardContent className="pt-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">버전 {version.version}</p>
                      <p className="text-sm text-muted-foreground">{version.changeDescription}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(version.createdAt).toLocaleString()} - {version.createdByName}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </DashboardLayout>
  );
}

// 레시피 폼 컴포넌트
function RecipeForm({
  products,
  materials,
  initialData,
  onSubmit,
  onCancel,
}: {
  products: any;
  materials: any;
  initialData?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    productId: initialData?.productId || "",
    recipeName: initialData?.recipeName || "",
    version: initialData?.version || "1.0",
    description: initialData?.description || "",
    batchSize: initialData?.batchSize || "",
    batchUnit: initialData?.batchUnit || "kg",
    yieldRate: initialData?.yieldRate || "",
    preparationTime: initialData?.preparationTime || "",
    cookingTime: initialData?.cookingTime || "",
    totalTime: initialData?.totalTime || "",
    lines: initialData?.lines || [],
  });

  const [newLine, setNewLine] = useState({
    materialId: "",
    quantity: "",
    unit: "kg",
    percentage: "",
    notes: "",
  });

  const handleAddLine = () => {
    if (!newLine.materialId || !newLine.quantity) {
      toast.error("원재료와 수량을 입력하세요.");
      return;
    }

    setFormData({
      ...formData,
      lines: [
        ...formData.lines,
        {
          ...newLine,
          materialId: parseInt(newLine.materialId),
          sortOrder: formData.lines.length,
        },
      ],
    });

    setNewLine({
      materialId: "",
      quantity: "",
      unit: "kg",
      percentage: "",
      notes: "",
    });
  };

  const handleRemoveLine = (index: number) => {
    setFormData({
      ...formData,
      lines: formData.lines.filter((_: any, i: number) => i !== index),
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="productId">제품 *</Label>
          <Select
            value={formData.productId.toString()}
            onValueChange={(value) => setFormData({ ...formData, productId: parseInt(value) })}
          >
            <SelectTrigger>
              <SelectValue placeholder="제품 선택" />
            </SelectTrigger>
            <SelectContent>
              {products?.map((product: any) => (
                <SelectItem key={product.id} value={product.id.toString()}>
                  {product.productName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="recipeName">레시피 이름 *</Label>
          <Input
            id="recipeName"
            value={formData.recipeName}
            onChange={(e) => setFormData({ ...formData, recipeName: e.target.value })}
            required
          />
        </div>

        <div>
          <Label htmlFor="version">버전</Label>
          <Input
            id="version"
            value={formData.version}
            onChange={(e) => setFormData({ ...formData, version: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="batchSize">배치 크기 *</Label>
          <div className="flex gap-2">
            <Input
              id="batchSize"
              value={formData.batchSize}
              onChange={(e) => setFormData({ ...formData, batchSize: e.target.value })}
              required
            />
            <Select
              value={formData.batchUnit}
              onValueChange={(value) => setFormData({ ...formData, batchUnit: value })}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="kg">kg</SelectItem>
                <SelectItem value="g">g</SelectItem>
                <SelectItem value="L">L</SelectItem>
                <SelectItem value="ml">ml</SelectItem>
                <SelectItem value="개">개</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label htmlFor="yieldRate">수율 (%)</Label>
          <Input
            id="yieldRate"
            type="number"
            value={formData.yieldRate}
            onChange={(e) => setFormData({ ...formData, yieldRate: e.target.value })}
          />
        </div>

        <div>
          <Label htmlFor="preparationTime">준비 시간 (분)</Label>
          <Input
            id="preparationTime"
            type="number"
            value={formData.preparationTime}
            onChange={(e) => setFormData({ ...formData, preparationTime: parseInt(e.target.value) })}
          />
        </div>

        <div>
          <Label htmlFor="cookingTime">조리 시간 (분)</Label>
          <Input
            id="cookingTime"
            type="number"
            value={formData.cookingTime}
            onChange={(e) => setFormData({ ...formData, cookingTime: parseInt(e.target.value) })}
          />
        </div>

        <div>
          <Label htmlFor="totalTime">총 소요 시간 (분)</Label>
          <Input
            id="totalTime"
            type="number"
            value={formData.totalTime}
            onChange={(e) => setFormData({ ...formData, totalTime: parseInt(e.target.value) })}
          />
        </div>
      </div>

      <div>
        <Label htmlFor="description">설명</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      {/* 원재료 배합 */}
      <div className="border-t pt-4">
        <h3 className="font-semibold mb-4">원재료 배합</h3>
        
        {/* 기존 라인 목록 */}
        {formData.lines.length > 0 && (
          <Table className="mb-4">
            <TableHeader>
              <TableRow>
                <TableHead>원재료</TableHead>
                <TableHead>수량</TableHead>
                <TableHead>단위</TableHead>
                <TableHead>비율 (%)</TableHead>
                <TableHead>비고</TableHead>
                <TableHead>작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {formData.lines.map((line: any, index: number) => (
                <TableRow key={index}>
                  <TableCell>
                    {materials?.find((m: any) => m.id === line.materialId)?.materialName || line.materialId}
                  </TableCell>
                  <TableCell>{line.quantity}</TableCell>
                  <TableCell>{line.unit}</TableCell>
                  <TableCell>{line.percentage || "-"}</TableCell>
                  <TableCell>{line.notes || "-"}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveLine(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* 새 라인 추가 */}
        <div className="grid grid-cols-6 gap-2">
          <Select
            value={newLine.materialId}
            onValueChange={(value) => setNewLine({ ...newLine, materialId: value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="원재료" />
            </SelectTrigger>
            <SelectContent>
              {materials?.map((material: any) => (
                <SelectItem key={material.id} value={material.id.toString()}>
                  {material.materialName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="수량"
            value={newLine.quantity}
            onChange={(e) => setNewLine({ ...newLine, quantity: e.target.value })}
          />

          <Select
            value={newLine.unit}
            onValueChange={(value) => setNewLine({ ...newLine, unit: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="kg">kg</SelectItem>
              <SelectItem value="g">g</SelectItem>
              <SelectItem value="L">L</SelectItem>
              <SelectItem value="ml">ml</SelectItem>
              <SelectItem value="개">개</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="비율 (%)"
            value={newLine.percentage}
            onChange={(e) => setNewLine({ ...newLine, percentage: e.target.value })}
          />

          <Input
            placeholder="비고"
            value={newLine.notes}
            onChange={(e) => setNewLine({ ...newLine, notes: e.target.value })}
          />

          <Button type="button" onClick={handleAddLine}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit">
          {initialData ? "수정" : "생성"}
        </Button>
      </div>
    </form>
  );
}
