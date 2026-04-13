import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import CategorySelect from "@/components/masterData/CategorySelect";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ProductManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);

  const { data: rawProductsData, refetch } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (rawProductsData as any)?.items ?? (Array.isArray(rawProductsData) ? rawProductsData : []);
  const utils = trpc.useUtils();
  const createMutation = trpc.product.create.useMutation();
  const updateMutation = trpc.product.update.useMutation();
  const deleteMutation = trpc.product.delete.useMutation();

  const [formData, setFormData] = useState({
    productName: "",
    productCode: "",
    category: "",
    unit: "EA",
    unitPrice: 0,
    shelfLifeMonths: 0,
    description: "",
    isActive: 1,
  });

  const resetForm = () => {
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
  };

  // 생성 다이얼로그가 열릴 때 자동으로 코드 생성
  useEffect(() => {
    if (isCreateDialogOpen) {
      (async () => {
        setIsGeneratingCode(true);
        try {
          const result = await utils.product.generateCode.fetch();
          setFormData(prev => ({ ...prev, productCode: result }));
        } catch (error: any) {
          console.error("코드 자동 생성 실패:", error.message);
        } finally {
          setIsGeneratingCode(false);
        }
      })();
    } else {
      resetForm();
    }
  }, [isCreateDialogOpen]);

  const handleCreate = async () => {
    try {
      await createMutation.mutateAsync(formData);
      toast.success("제품이 성공적으로 생성되었습니다.");
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || "제품 생성 중 오류가 발생했습니다.");
    }
  };

  const handleEdit = (product: any) => {
    setSelectedProduct(product);
    setFormData({
      productName: product.productName,
      productCode: product.productCode,
      category: product.category || "",
      unit: product.unit || "EA",
      unitPrice: product.unitPrice ? parseFloat(product.unitPrice) : 0,
      shelfLifeMonths: product.shelfLifeDays ? Math.round(product.shelfLifeDays / 30) : 0,
      description: product.description || "",
      isActive: product.isActive || 1,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedProduct) return;
    try {
      await updateMutation.mutateAsync({
        id: selectedProduct.id,
        ...formData,
      });
      toast.success("제품이 성공적으로 수정되었습니다.");
      setIsEditDialogOpen(false);
      resetForm();
      setSelectedProduct(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "제품 수정 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;
    try {
      await deleteMutation.mutateAsync({ id: selectedProduct.id });
      toast.success("제품이 성공적으로 삭제되었습니다.");
      setIsDeleteDialogOpen(false);
      setSelectedProduct(null);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "제품 삭제 중 오류가 발생했습니다.");
    }
  };

  const filteredProducts = products?.filter((product: any) =>
    product.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.productCode.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <DashboardLayout>

    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">제품 관리</h1>
        <p className="text-muted-foreground">
          제품 정보를 등록하고 관리합니다. 제품명, 제품코드, 유통기한 등을 설정할 수 있습니다.
        </p>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="제품명 또는 제품코드 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              제품 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>제품 추가</DialogTitle>
              <DialogDescription>
                새로운 제품 정보를 입력합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="productName">제품명 *</Label>
                <Input
                  id="productName"
                  value={formData.productName}
                  onChange={(e) =>
                    setFormData({ ...formData, productName: e.target.value })
                  }
                  placeholder="예: 떡볶이"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="productCode">제품코드 *</Label>
                <Input
                  id="productCode"
                  value={isGeneratingCode ? "코드 생성 중..." : formData.productCode}
                  readOnly
                  className="bg-muted"
                  placeholder="자동 생성됩니다"
                />
                <p className="text-xs text-muted-foreground">코드는 자동으로 생성됩니다 (예: PRD-001)</p>
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
                  onChange={(e) =>
                    setFormData({ ...formData, unit: e.target.value })
                  }
                  placeholder="예: EA, KG, BOX"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unitPrice">판매가 (원)</Label>
                <Input
                  id="unitPrice"
                  type="number"
                  value={formData.unitPrice}
                  onChange={(e) =>
                    setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="shelfLifeMonths">유통기한 (월)</Label>
                <Input
                  id="shelfLifeMonths"
                  type="number"
                  value={formData.shelfLifeMonths}
                  onChange={(e) =>
                    setFormData({ ...formData, shelfLifeMonths: parseInt(e.target.value) || 0 })
                  }
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
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="제품에 대한 설명을 입력하세요."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "생성 중..." : "생성"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>제품 목록</CardTitle>
          <CardDescription>
            등록된 제품 ({filteredProducts?.length || 0}개)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제품코드</TableHead>
                <TableHead>제품명</TableHead>
                <TableHead>카테고리</TableHead>
                <TableHead>단위</TableHead>
                <TableHead>유통기한</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts && filteredProducts.length > 0 ? (
                filteredProducts.map((product: any) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.productCode}</TableCell>
                    <TableCell>{product.productName}</TableCell>
                    <TableCell>{product.category || "-"}</TableCell>
                    <TableCell>{product.unit || "-"}</TableCell>
                    <TableCell>
                      {product.shelfLifeDays
                        ? `${Math.round(product.shelfLifeDays / 30)}개월`
                        : "-"}
                    </TableCell>
                    <TableCell className="text-center">
                      {product.isActive ? (
                        <Badge variant="default">활성</Badge>
                      ) : (
                        <Badge variant="secondary">비활성</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedProduct(product);
                            setIsDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {searchTerm
                      ? "검색 결과가 없습니다."
                      : "등록된 제품이 없습니다. 제품을 추가하여 시작하세요."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>제품 수정</DialogTitle>
            <DialogDescription>
              제품 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-productName">제품명 *</Label>
              <Input
                id="edit-productName"
                value={formData.productName}
                onChange={(e) =>
                  setFormData({ ...formData, productName: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-productCode">제품코드</Label>
              <Input
                id="edit-productCode"
                value={formData.productCode}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-category">카테고리</Label>
              <CategorySelect
                type="product"
                value={formData.category as any}
                onChange={(value) => setFormData({ ...formData, category: value as any })}
                placeholder="카테고리를 선택하세요"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-unit">단위</Label>
              <Input
                id="edit-unit"
                value={formData.unit}
                onChange={(e) =>
                  setFormData({ ...formData, unit: e.target.value })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-unitPrice">판매가 (원)</Label>
              <Input
                id="edit-unitPrice"
                type="number"
                value={formData.unitPrice}
                onChange={(e) =>
                  setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-shelfLifeMonths">유통기한 (월)</Label>
              <Input
                id="edit-shelfLifeMonths"
                type="number"
                value={formData.shelfLifeMonths}
                onChange={(e) =>
                  setFormData({ ...formData, shelfLifeMonths: parseInt(e.target.value) || 0 })
                }
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-isActive">상태</Label>
              <select
                id="edit-isActive"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.isActive}
                onChange={(e) =>
                  setFormData({ ...formData, isActive: parseInt(e.target.value) })
                }
              >
                <option value={1}>활성</option>
                <option value={0}>비활성</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-description">설명</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>제품 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              정말로 이 제품을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  
    </DashboardLayout>
  );
}
