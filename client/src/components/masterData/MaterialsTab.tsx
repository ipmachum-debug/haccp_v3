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
import { Plus, Pencil, Trash2, Upload, FileSpreadsheet, Search, ArrowUpDown, ChevronLeft, ChevronRight, Download, Eye } from "lucide-react";
import MaterialBulkUploadModal from "@/components/MaterialBulkUploadModal";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function MaterialsTab() {
  const [materialDialogOpen, setMaterialDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [viewingMaterial, setViewingMaterial] = useState<any>(null);
  const [editMaterialCategory, setEditMaterialCategory] = useState<string>("");
  const [materialBulkUploadOpen, setMaterialBulkUploadOpen] = useState(false);
  const [autoMaterialCode, setAutoMaterialCode] = useState("");

  // 원재료 필터/정렬/페이지네이션 state
  const [matSearchQuery, setMatSearchQuery] = useState("");
  const [matSortBy, setMatSortBy] = useState<"materialCode" | "materialName" | "category">("materialCode");
  const [matSortOrder, setMatSortOrder] = useState<"asc" | "desc">("asc");
  const [matPage, setMatPage] = useState(1);
  const matPageSize = 30;

  // 카테고리 목록 조회
  const { data: materialCategories = [] } = trpc.categories.listByType.useQuery({ type: "material" });

  const utils = trpc.useUtils();

  // 다운로드 mutations
  const downloadTemplateMutation = trpc.itemMaster.downloadTemplate.useMutation();
  const downloadAllMutation = trpc.itemMaster.downloadAll.useMutation();

  // 원재료 다이얼로그가 열릴 때 자동 코드 생성
  useEffect(() => {
    if (materialDialogOpen) {
      (async () => {
        try {
          const result = await utils.inventory.generateCode.fetch();
          setAutoMaterialCode(result);
        } catch (error: any) {
          console.error("원재료 코드 자동 생성 실패:", error.message);
        }
      })();
    }
  }, [materialDialogOpen]);

  // 원재료 관리
  const { data: materialData, refetch: refetchMaterials } = trpc.material.list.useQuery({
    page: matPage,
    limit: matPageSize,
    sortBy: matSortBy,
    sortOrder: matSortOrder,
    search: matSearchQuery || undefined,
  });
  const materials = Array.isArray(materialData) ? materialData : (materialData?.items ?? []);
  const materialTotal = (materialData as any)?.total ?? 0;
  const materialTotalPages = Math.ceil(materialTotal / matPageSize) || 1;
  const createMaterialMutation = trpc.material.create.useMutation({
    onSuccess: () => {
      toast.success("원재료가 추가되었습니다");
      setMaterialDialogOpen(false);
      refetchMaterials();
    },
    onError: (error: any) => {
      toast.error(`원재료 추가 실패: ${error.message}`);
    },
  });

  const deleteMaterialMutation = trpc.material.delete.useMutation({
    onSuccess: () => {
      toast.success("원재료가 삭제되었습니다");
      refetchMaterials();
    },
    onError: (error: any) => {
      toast.error(`원재료 삭제 실패: ${error.message}`);
    },
  });

  const updateMaterialMutation = trpc.material.update.useMutation({
    onSuccess: () => {
      toast.success("원재료가 수정되었습니다");
      setEditingMaterial(null);
      refetchMaterials();
    },
    onError: (error: any) => {
      toast.error(`원재료 수정 실패: ${error.message}`);
    },
  });

  const handleCreateMaterial = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const kind = (formData.get("materialKind") as string) || "RAW";
    if (!kind || !["RAW", "PACKAGING", "SUBSIDIARY"].includes(kind)) {
      toast.error("원재료 종류를 선택해주세요");
      return;
    }
    createMaterialMutation.mutate({
      materialCode: autoMaterialCode,
      materialName: formData.get("materialName") as string,
      kind: kind as "RAW" | "PACKAGING" | "SUBSIDIARY",
      category: (formData.get("category") as string) || undefined,
      unit: (formData.get("unit") as string) || undefined,
      expiryWarningDays: formData.get("shelfLifeDays") ? parseInt(formData.get("shelfLifeDays") as string) : undefined,
      isActive: 1,
    });
  };

  const handleUpdateMaterial = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    updateMaterialMutation.mutate({
      id: editingMaterial.id,
      materialCode: formData.get("materialCode") as string,
      materialName: formData.get("materialName") as string,
      category: editMaterialCategory || undefined,
      unit: (formData.get("unit") as string) || undefined,
      expiryWarningDays: formData.get("shelfLifeDays") ? parseInt(formData.get("shelfLifeDays") as string) : undefined,
    });
  };

  // 원재료 정렬 토글
  const handleMatSort = (field: "materialCode" | "materialName" | "category") => {
    if (matSortBy === field) {
      setMatSortOrder(matSortOrder === "asc" ? "desc" : "asc");
    } else {
      setMatSortBy(field);
      setMatSortOrder("asc");
    }
    setMatPage(1);
  };

  // 템플릿 다운로드 핸들러 (서버 API 사용)
  const handleDownloadMaterialTemplate = async () => {
    try {
      const result = await downloadTemplateMutation.mutateAsync({ itemType: 'raw_material' });

      // Base64를 Blob으로 변환
      const byteCharacters = atob(result.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      });

      // 다운로드
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("템플릿이 다운로드되었습니다");
    } catch (e: any) {
      toast.error("템플릿 다운로드 실패: " + e.message);
    }
  };

  // 원재료 전체 다운로드 (현재 등록된 데이터를 엑셀로)
  const handleExportAllMaterials = async () => {
    try {
      const result = await downloadAllMutation.mutateAsync({ itemType: 'raw_material' });

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

      toast.success(`${result.count}개 원재료 데이터를 다운로드했습니다`);
    } catch (error: any) {
      toast.error(`다운로드 실패: ${error.message}`);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>원재료 관리</CardTitle>
              <CardDescription>
                원재료 목록 및 상세 정보 관리 | 총 <strong>{materialTotal}개</strong> 등록됨
              </CardDescription>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleExportAllMaterials}>
                <Download className="h-4 w-4 mr-2" />
                전체 다운로드
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadMaterialTemplate}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                템플릿
              </Button>
              <Button variant="outline" size="sm" onClick={() => setMaterialBulkUploadOpen(true)}>
                <Upload className="h-4 w-4 mr-2" />
                일괄 업로드
              </Button>
              <Dialog open={materialDialogOpen} onOpenChange={setMaterialDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    원재료 추가
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form onSubmit={handleCreateMaterial}>
                    <DialogHeader>
                      <DialogTitle>새 원재료 추가</DialogTitle>
                      <DialogDescription>새로운 원재료 정보를 입력하세요</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="materialCode">원재료 코드 *</Label>
                        <Input id="materialCode" name="materialCode" value={autoMaterialCode} readOnly className="bg-muted" placeholder="자동 생성됩니다" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="materialName">원재료명 *</Label>
                        <Input id="materialName" name="materialName" required />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="materialKind">원재료 종류 *</Label>
                        <Select onValueChange={(val) => {
                          const hidden = document.getElementById('newMaterialKind') as HTMLInputElement;
                          if (hidden) hidden.value = val;
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="종류 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="RAW">원재료</SelectItem>
                            <SelectItem value="PACKAGING">포장재</SelectItem>
                            <SelectItem value="SUBSIDIARY">부자재</SelectItem>
                          </SelectContent>
                        </Select>
                        <input type="hidden" id="newMaterialKind" name="materialKind" />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="category">카테고리</Label>
                        <Select onValueChange={(val) => {
                          const hidden = document.getElementById('newMaterialCategory') as HTMLInputElement;
                          if (hidden) hidden.value = val;
                        }}>
                          <SelectTrigger>
                            <SelectValue placeholder="카테고리 선택" />
                          </SelectTrigger>
                          <SelectContent>
                            {materialCategories.map((cat: any) => (
                              <SelectItem key={cat.id} value={cat.name}>
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <input type="hidden" id="newMaterialCategory" name="category" />
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
                      <Button type="submit" disabled={createMaterialMutation.isPending}>
                        {createMaterialMutation.isPending ? "추가 중..." : "추가"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          {/* 검색 바 */}
          <div className="flex items-center gap-3 mt-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="원재료명 또는 코드로 검색..."
                value={matSearchQuery}
                onChange={(e) => { setMatSearchQuery(e.target.value); setMatPage(1); }}
                className="pl-10"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {matSearchQuery ? `검색 결과: ${materialTotal}건` : `${matPage}/${materialTotalPages} 페이지`}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleMatSort("materialCode")}>
                  <div className="flex items-center gap-1">
                    원재료 코드
                    <ArrowUpDown className="h-3 w-3" />
                    {matSortBy === "materialCode" && <span className="text-xs">({matSortOrder === "asc" ? "▲" : "▼"})</span>}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleMatSort("materialName")}>
                  <div className="flex items-center gap-1">
                    원재료명
                    <ArrowUpDown className="h-3 w-3" />
                    {matSortBy === "materialName" && <span className="text-xs">({matSortOrder === "asc" ? "▲" : "▼"})</span>}
                  </div>
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleMatSort("category")}>
                  <div className="flex items-center gap-1">
                    카테고리
                    <ArrowUpDown className="h-3 w-3" />
                    {matSortBy === "category" && <span className="text-xs">({matSortOrder === "asc" ? "▲" : "▼"})</span>}
                  </div>
                </TableHead>
                <TableHead>단위</TableHead>
                <TableHead>소비기한 (일)</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {matSearchQuery
                      ? `"${matSearchQuery}"에 대한 검색 결과가 없습니다.`
                      : '등록된 원재료가 없습니다. "원재료 추가" 또는 "일괄 업로드" 버튼을 사용하세요.'}
                  </TableCell>
                </TableRow>
              ) : (
                materials.map((material: any) => (
                  <TableRow key={material.id}>
                    <TableCell className="font-mono text-sm">{material.materialCode}</TableCell>
                    <TableCell className="font-medium">{material.materialName}</TableCell>
                    <TableCell>
                      {material.category ? (
                        <Badge variant="outline">{material.category}</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell>{material.unit || "-"}</TableCell>
                    <TableCell>{material.expiryWarningDays || "-"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        material.isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
                      }`}>
                        {material.isActive ? "활성" : "비활성"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingMaterial(material)}
                          title="상세보기"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingMaterial(material);
                            setEditMaterialCategory(material.category || "");
                          }}
                          title="수정"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`"${material.materialName}" 원재료를 삭제하시겠습니까?`)) {
                              deleteMaterialMutation.mutate({ id: material.id });
                            }
                          }}
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

          {/* 페이지네이션 */}
          {materialTotalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                총 {materialTotal}개 중 {(matPage - 1) * matPageSize + 1}~{Math.min(matPage * matPageSize, materialTotal)}개 표시
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={matPage <= 1}
                  onClick={() => setMatPage(matPage - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  이전
                </Button>
                {Array.from({ length: Math.min(materialTotalPages, 7) }, (_, i) => {
                  let pageNum: number;
                  if (materialTotalPages <= 7) {
                    pageNum = i + 1;
                  } else if (matPage <= 4) {
                    pageNum = i + 1;
                  } else if (matPage >= materialTotalPages - 3) {
                    pageNum = materialTotalPages - 6 + i;
                  } else {
                    pageNum = matPage - 3 + i;
                  }
                  return (
                    <Button
                      key={pageNum}
                      variant={matPage === pageNum ? "default" : "outline"}
                      size="sm"
                      className="w-9"
                      onClick={() => setMatPage(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={matPage >= materialTotalPages}
                  onClick={() => setMatPage(matPage + 1)}
                >
                  다음
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 원재료 수정 Dialog */}
      <Dialog open={!!editingMaterial} onOpenChange={(open) => !open && setEditingMaterial(null)}>
        <DialogContent>
          <form onSubmit={handleUpdateMaterial}>
            <DialogHeader>
              <DialogTitle>원재료 수정</DialogTitle>
              <DialogDescription>원재료 정보를 수정하세요</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="edit-materialCode">원재료 코드</Label>
                <Input id="edit-materialCode" name="materialCode" defaultValue={editingMaterial?.materialCode} readOnly className="bg-muted" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-materialName">원재료명 *</Label>
                <Input id="edit-materialName" name="materialName" defaultValue={editingMaterial?.materialName} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-category">카테고리</Label>
                <Select value={editMaterialCategory} onValueChange={setEditMaterialCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="카테고리 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {materialCategories.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-unit">단위</Label>
                <Input id="edit-unit" name="unit" defaultValue={editingMaterial?.unit || ""} placeholder="예: kg, 개, L" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-shelfLifeDays">소비기한 (일)</Label>
                <Input id="edit-shelfLifeDays" name="shelfLifeDays" type="number" defaultValue={editingMaterial?.expiryWarningDays || ""} placeholder="30일 = 1개월로 자동 변환" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingMaterial(null)}>
                취소
              </Button>
              <Button type="submit" disabled={updateMaterialMutation.isPending}>
                {updateMaterialMutation.isPending ? "수정 중..." : "수정"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 원재료 상세보기 Dialog */}
      <Dialog open={!!viewingMaterial} onOpenChange={() => setViewingMaterial(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>원재료 상세 정보</DialogTitle>
            <DialogDescription>
              원재료의 상세 정보를 확인하세요
            </DialogDescription>
          </DialogHeader>
          {viewingMaterial && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">원재료 코드</Label>
                  <p className="font-medium">{viewingMaterial.materialCode}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">원재료명</Label>
                  <p className="font-medium">{viewingMaterial.materialName}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">카테고리</Label>
                  <p className="font-medium">{viewingMaterial.category || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">단위</Label>
                  <p className="font-medium">{viewingMaterial.unit || "-"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">소비기한 경고 (일)</Label>
                  <p className="font-medium">{viewingMaterial.expiryWarningDays || "-"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">상태</Label>
                  <p className="font-medium">{viewingMaterial.isActive ? "활성" : "비활성"}</p>
                </div>
              </div>
              {viewingMaterial.description && (
                <div>
                  <Label className="text-muted-foreground">설명</Label>
                  <p className="font-medium">{viewingMaterial.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingMaterial(null)}>
              닫기
            </Button>
            <Button onClick={() => {
              setEditingMaterial(viewingMaterial);
              setViewingMaterial(null);
            }}>
              수정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일괄 업로드 모달 */}
      <MaterialBulkUploadModal
        open={materialBulkUploadOpen}
        onClose={() => setMaterialBulkUploadOpen(false)}
        onSuccess={() => refetchMaterials()}
      />
    </>
  );
}
