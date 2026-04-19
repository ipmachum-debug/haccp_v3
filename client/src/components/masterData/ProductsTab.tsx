import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Plus, Pencil, Trash2, Upload, FileSpreadsheet, FileDown, Search, ArrowUpDown, ChevronLeft, ChevronRight, Download, Eye } from "lucide-react";
import ProductBulkUploadModal from "@/components/masterData/ProductBulkUploadModal";
import TemplateCustomizer from "@/components/checklist/TemplateCustomizer";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function ProductsTab() {
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [viewingProduct, setViewingProduct] = useState<any>(null);
  const [editProductCategory, setEditProductCategory] = useState<string>("");
  const [productBulkUploadOpen, setProductBulkUploadOpen] = useState(false);
  const [templateCustomizerOpen, setTemplateCustomizerOpen] = useState(false);
  const [autoProductCode, setAutoProductCode] = useState("");

  // 제품 필터/정렬/페이지네이션 state
  const [prodSearchQuery, setProdSearchQuery] = useState("");
  const [prodSortBy, setProdSortBy] = useState<"productCode" | "productName" | "category">("productCode");
  const [prodSortOrder, setProdSortOrder] = useState<"asc" | "desc">("asc");
  const [prodPage, setProdPage] = useState(1);
  const prodPageSize = 30;

  // 카테고리 목록 조회
  const { data: productCategories = [] } = trpc.categories.listByType.useQuery({ type: "product" });

  const utils = trpc.useUtils();

  // 다운로드 mutations
  const downloadTemplateMutation = trpc.itemMaster.downloadTemplate.useMutation();
  const downloadAllMutation = trpc.itemMaster.downloadAll.useMutation();

  // 제품 다이얼로그가 열릴 때 자동 코드 생성
  useEffect(() => {
    if (productDialogOpen) {
      (async () => {
        try {
          const result = await utils.product.generateCode.fetch();
          setAutoProductCode(result);
        } catch (error: any) {
          console.error("제품 코드 자동 생성 실패:", error.message);
        }
      })();
    }
  }, [productDialogOpen]);

  // 제품 관리
  const { data: productData, refetch: refetchProducts } = trpc.product.list.useQuery({
    page: prodPage,
    limit: prodPageSize,
    sortBy: prodSortBy,
    sortOrder: prodSortOrder,
    search: prodSearchQuery || undefined,
  });
  const products = (productData as any)?.items ?? (Array.isArray(productData) ? productData : []);
  const productTotal = (productData as any)?.total ?? 0;
  const productTotalPages = Math.ceil(productTotal / prodPageSize) || 1;
  const createProductMutation = trpc.product.create.useMutation({
    onSuccess: () => {
      toast.success("제품이 추가되었습니다");
      setProductDialogOpen(false);
      refetchProducts();
    },
    onError: (error: { message: string }) => {
      toast.error(`제품 추가 실패: ${error.message}`);
    },
  });

  const deleteProductMutation = trpc.product.delete.useMutation({
    onSuccess: () => {
      toast.success("제품이 삭제되었습니다");
      refetchProducts();
    },
    onError: (error: { message: string }) => {
      toast.error(`제품 삭제 실패: ${error.message}`);
    },
  });

  const updateProductMutation = trpc.product.update.useMutation({
    onSuccess: () => {
      toast.success("제품이 수정되었습니다");
      setEditingProduct(null);
      refetchProducts();
    },
    onError: (error: { message: string }) => {
      toast.error(`제품 수정 실패: ${error.message}`);
    },
  });

  const handleCreateProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createProductMutation.mutate({
      productCode: autoProductCode,
      productName: formData.get("productName") as string,
      category: (formData.get("category") as string) || undefined,
      unit: (formData.get("unit") as string) || undefined,
      shelfLifeMonths: formData.get("shelfLifeDays") ? Math.ceil(parseInt(formData.get("shelfLifeDays") as string) / 30) : undefined,
      description: (formData.get("description") as string) || undefined,
      isActive: 1,
    });
  };

  const handleUpdateProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const shelfLifeDays = formData.get("shelfLifeDays") ? parseInt(formData.get("shelfLifeDays") as string) : undefined;
    const shelfLifeMonths = shelfLifeDays ? Math.round(shelfLifeDays / 30) : undefined;

    const updateData = {
      id: editingProduct.id,
      productCode: formData.get("productCode") as string,
      productName: formData.get("productName") as string,
      category: editProductCategory || undefined,
      unit: (formData.get("unit") as string) || undefined,
      shelfLifeMonths: shelfLifeMonths,
      description: (formData.get("description") as string) || undefined,
    };

    console.log('🔵 제품 수정 데이터:', updateData);
    console.log('🔵 editProductCategory 상태:', editProductCategory);

    updateProductMutation.mutate(updateData);
  };

  // 제품 정렬 토글
  const handleProdSort = (field: "productCode" | "productName" | "category") => {
    if (prodSortBy === field) { setProdSortOrder(prodSortOrder === "asc" ? "desc" : "asc"); }
    else { setProdSortBy(field); setProdSortOrder("asc"); }
    setProdPage(1);
  };

  // 제품 전체 다운로드
  const handleExportAllProducts = async () => {
    try {
      const result = await downloadAllMutation.mutateAsync({ itemType: 'own_product' });

      // Base64 디코딩
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // 다운로드
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`${result.count}개 제품 데이터를 다운로드했습니다`);
    } catch (e: any) {
      toast.error("다운로드 실패: " + e.message);
    }
  };

  const handleDownloadProductTemplate = async () => {
    try {
      const result = await downloadTemplateMutation.mutateAsync({ itemType: 'own_product' });

      // Base64 디코딩
      const binaryString = atob(result.data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // 다운로드
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("템플릿이 다운로드되었습니다");
    } catch (e: any) {
      toast.error("템플릿 다운로드 실패: " + e.message);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>제품 관리</CardTitle>
              <CardDescription>
                제품 목록 및 상세 정보 관리 | 총 <strong>{productTotal}개</strong> 등록됨
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportAllProducts}>
                <Download className="h-4 w-4 mr-2" />
                전체 다운로드
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadProductTemplate}>
                <FileDown className="h-4 w-4 mr-2" />
                템플릿
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setTemplateCustomizerOpen(true);
                }}
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                커스텀 템플릿
              </Button>
              <Button
                variant="outline"
                onClick={() => setProductBulkUploadOpen(true)}
              >
                <Upload className="h-4 w-4 mr-2" />
                일괄 업로드
              </Button>
              <Dialog open={productDialogOpen} onOpenChange={setProductDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    제품 추가
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreateProduct}>
                    <DialogHeader>
                      <DialogTitle>새 제품 추가</DialogTitle>
                      <DialogDescription>새로운 제품 정보를 입력하세요</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="productCode">제품 코드 *</Label>
                        <Input id="productCode" name="productCode" value={autoProductCode} readOnly className="bg-muted" placeholder="자동 생성됩니다" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="productName">제품명 *</Label>
                        <Input id="productName" name="productName" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="category">카테고리</Label>
                        <Select onValueChange={(val) => {
                          const hidden = document.getElementById('newProductCategory') as HTMLInputElement;
                          if (hidden) hidden.value = val;
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="카테고리 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {productCategories.map((cat: any) => (
                              <SelectItem key={cat.id} value={cat.name}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <input type="hidden" id="newProductCategory" name="category" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="unit">단위</Label>
                        <Input id="unit" name="unit" placeholder="예: kg, 개, L" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="shelfLifeDays">소비기한 (일)</Label>
                        <Input id="shelfLifeDays" name="shelfLifeDays" type="number" placeholder="30일 = 1개월로 자동 변환" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="description">설명</Label>
                        <Input id="description" name="description" />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={createProductMutation.isPending}>
                        {createProductMutation.isPending ? "추가 중..." : "추가"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* 검색 바 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="제품명 또는 코드로 검색..." value={prodSearchQuery} onChange={(e) => { setProdSearchQuery(e.target.value); setProdPage(1); }} className="pl-10" />
            </div>
            <p className="text-sm text-muted-foreground">
              {prodSearchQuery ? `검색 결과: ${productTotal}건` : `${prodPage}/${productTotalPages} 페이지`}
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleProdSort("productCode")}>
                  <div className="flex items-center gap-1">제품 코드 <ArrowUpDown className="h-3 w-3" />{prodSortBy === "productCode" && <span className="text-xs">({prodSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleProdSort("productName")}>
                  <div className="flex items-center gap-1">제품명 <ArrowUpDown className="h-3 w-3" />{prodSortBy === "productName" && <span className="text-xs">({prodSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleProdSort("category")}>
                  <div className="flex items-center gap-1">카테고리 <ArrowUpDown className="h-3 w-3" />{prodSortBy === "category" && <span className="text-xs">({prodSortOrder === "asc" ? "▲" : "▼"})</span>}</div>
                </TableHead>
                <TableHead>단위</TableHead>
                <TableHead>소비기한 (개월)</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {prodSearchQuery ? `"${prodSearchQuery}"에 대한 검색 결과가 없습니다.` : '등록된 제품이 없습니다. "제품 추가" 또는 "일괄 업로드"를 사용하세요.'}
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product: any) => (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">{product.productCode}</TableCell>
                    <TableCell>{product.productName}</TableCell>
                    <TableCell>{product.category || "-"}</TableCell>
                    <TableCell>{product.unit || "-"}</TableCell>
                    <TableCell>{product.shelfLifeDays ? Math.round(product.shelfLifeDays / 30) : "-"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        product.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      }`}>
                        {product.isActive ? "활성" : "비활성"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingProduct(product)}
                          title="상세보기"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingProduct(product);
                            setEditProductCategory(product.category || "");
                          }}
                          title="수정"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm("정말 삭제하시겠습니까?")) {
                              deleteProductMutation.mutate({ id: product.id });
                            }
                          }}
                          title="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 페이지네이션 */}
      {productTotalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground">총 {productTotal}개 중 {(prodPage - 1) * prodPageSize + 1}~{Math.min(prodPage * prodPageSize, productTotal)}개 표시</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={prodPage <= 1} onClick={() => setProdPage(prodPage - 1)}><ChevronLeft className="h-4 w-4" /> 이전</Button>
            {Array.from({ length: Math.min(productTotalPages, 7) }, (_, i) => {
              let pn: number;
              if (productTotalPages <= 7) pn = i + 1;
              else if (prodPage <= 4) pn = i + 1;
              else if (prodPage >= productTotalPages - 3) pn = productTotalPages - 6 + i;
              else pn = prodPage - 3 + i;
              return <Button key={pn} variant={prodPage === pn ? "default" : "outline"} size="sm" className="w-9" onClick={() => setProdPage(pn)}>{pn}</Button>;
            })}
            <Button variant="outline" size="sm" disabled={prodPage >= productTotalPages} onClick={() => setProdPage(prodPage + 1)}>다음 <ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}

      {/* 제품 수정 Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent>
          <form onSubmit={handleUpdateProduct}>
            <DialogHeader>
              <DialogTitle>제품 수정</DialogTitle>
              <DialogDescription>제품 정보를 수정하세요</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-productCode">제품 코드</Label>
                <Input id="edit-productCode" name="productCode" defaultValue={editingProduct?.productCode} readOnly className="bg-muted" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-productName">제품명 *</Label>
                <Input id="edit-productName" name="productName" defaultValue={editingProduct?.productName} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-category">카테고리</Label>
                <Select value={editProductCategory} onValueChange={setEditProductCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="카테고리 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {productCategories.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-unit">단위</Label>
                <Input id="edit-unit" name="unit" defaultValue={editingProduct?.unit || ""} placeholder="예: kg, 개, L" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-shelfLifeDays">소비기한 (일)</Label>
                <Input id="edit-shelfLifeDays" name="shelfLifeDays" type="number" defaultValue={editingProduct?.shelfLifeDays || ""} placeholder="30일 = 1개월로 자동 변환" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-description">설명</Label>
                <Input id="edit-description" name="description" defaultValue={editingProduct?.description || ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingProduct(null)}>
                취소
              </Button>
              <Button type="submit" disabled={updateProductMutation.isPending}>
                {updateProductMutation.isPending ? "수정 중..." : "수정"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>

        {/* 제품 상세보기 Dialog */}
        <Dialog open={!!viewingProduct} onOpenChange={() => setViewingProduct(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>제품 상세 정보</DialogTitle>
              <DialogDescription>
                제품의 상세 정보를 확인하세요
              </DialogDescription>
            </DialogHeader>
            {viewingProduct && (
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">제품 코드</Label>
                    <p className="font-medium">{viewingProduct.productCode}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">제품명</Label>
                    <p className="font-medium">{viewingProduct.productName}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">카테고리</Label>
                    <p className="font-medium">{viewingProduct.category || "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">단위</Label>
                    <p className="font-medium">{viewingProduct.unit || "-"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">소비기한 (개월)</Label>
                    <p className="font-medium">{viewingProduct.shelfLifeDays ? Math.round(viewingProduct.shelfLifeDays / 30) + " 개월" : "-"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">상태</Label>
                    <p className="font-medium">{viewingProduct.isActive ? "활성" : "비활성"}</p>
                  </div>
                </div>
                {viewingProduct.description && (
                  <div>
                    <Label className="text-muted-foreground">설명</Label>
                    <p className="font-medium">{viewingProduct.description}</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setViewingProduct(null)}>
                닫기
              </Button>
              <Button onClick={() => {
                setEditingProduct(viewingProduct);
                setViewingProduct(null);
              }}>
                수정
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </Dialog>

      {/* 일괄 업로드 모달 */}
      <ProductBulkUploadModal
        open={productBulkUploadOpen}
        onClose={() => setProductBulkUploadOpen(false)}
        onSuccess={() => refetchProducts()}
      />
      <TemplateCustomizer
        open={templateCustomizerOpen}
        onClose={() => setTemplateCustomizerOpen(false)}
        templateType="product"
      />
    </>
  );
}
