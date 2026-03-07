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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Package, Plus, Edit, Trash2, History, Search, Pencil, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import CategorySelect from "@/components/CategorySelect";
import { MaterialPriceChart } from "@/components/MaterialPriceChart";

export default function MaterialManagement() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | undefined>(undefined);
  
  // 카테고리 목록 조회
  const { data: categories } = trpc.categories.listAll.useQuery();
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>("");
  const [priceChangeReason, setPriceChangeReason] = useState<string>("");
  const [priceHistoryMaterialId, setPriceHistoryMaterialId] = useState<number | null>(null);
  const [isPriceHistoryDialogOpen, setIsPriceHistoryDialogOpen] = useState(false);
  const [isBatchUpdateDialogOpen, setIsBatchUpdateDialogOpen] = useState(false);
  const [isPriceChartOpen, setIsPriceChartOpen] = useState(false);
  const [priceChartMaterialId, setPriceChartMaterialId] = useState<number | null>(null);
  const [priceChartMaterialName, setPriceChartMaterialName] = useState<string>("");
  const [batchExpiryWarningDays, setBatchExpiryWarningDays] = useState<number>(7);

  const { data: _rawMaterials, refetch } = trpc.material.list.useQuery({ limit: 9999 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);
  
  // 필터링된 원재료 목록
  const filteredMaterials = materials?.filter((material: any) => {
    const matchesSearch = material.materialName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         material.materialCode?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategoryId === undefined || material.categoryId === selectedCategoryId;
    return matchesSearch && matchesCategory;
  });
  const utils = trpc.useUtils();
  const createMutation = trpc.material.create.useMutation();
  const updateMutation = trpc.material.update.useMutation();
  const updatePriceMutation = trpc.material.update.useMutation();
  const { data: priceHistory } = trpc.material.getPriceHistory.useQuery(
    { materialId: priceHistoryMaterialId! },
    { enabled: !!priceHistoryMaterialId }
  );
  const deleteMutation = trpc.material.delete.useMutation();
  const batchUpdateMutation = trpc.material.update.useMutation();

  const [formData, setFormData] = useState({
    materialName: "",
    materialCode: "",
    category: "",
    unit: "KG",
    safetyStock: 0,
    expiryWarningDays: 7,
  });

  const resetForm = () => {
    setFormData({
      materialName: "",
      materialCode: "",
      category: "",
      unit: "KG",
      safetyStock: 0,
      expiryWarningDays: 7,
    });
  };

  // 생성 다이얼로그가 열릴 때 자동으로 코드 생성
  useEffect(() => {
    if (isCreateDialogOpen) {
      (async () => {
        setIsGeneratingCode(true);
        try {
          const result = await utils.inventory.generateCode.fetch();
          setFormData(prev => ({ ...prev, materialCode: result }));
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
      toast.success("원재료가 성공적으로 생성되었습니다.");
      setIsCreateDialogOpen(false);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || "원재료 생성 중 오류가 발생했습니다.");
    }
  };

  const handleEdit = (material: any) => {
    setEditingMaterial(material);
    setFormData({
      materialName: material.materialName,
      materialCode: material.materialCode,
      category: material.category || "",
      unit: material.unit || "KG",
      safetyStock: parseFloat(material.safetyStockLevel || "0"),
      expiryWarningDays: material.expiryWarningDays || 7,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingMaterial) return;
    try {
      await updateMutation.mutateAsync({ id: editingMaterial.id, ...formData });
      toast.success("원재료가 성공적으로 수정되었습니다.");
      setIsEditDialogOpen(false);
      setEditingMaterial(null);
      resetForm();
      refetch();
    } catch (error: any) {
      toast.error(error.message || "원재료 수정 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("원재료가 성공적으로 삭제되었습니다.");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "원재료 삭제 중 오류가 발생했습니다.");
    }
  };

  const handleBatchUpdate = async () => {
    const confirmMessage = `기본값(7일)으로 설정된 모든 원재료의 유통기한 알림 기준일을 ${batchExpiryWarningDays}일로 변경하시겠습니까?`;
    if (!confirm(confirmMessage)) return;
    try {
      const result = await batchUpdateMutation.mutateAsync({ expiryWarningDays: batchExpiryWarningDays });
      const successMessage = `${(result as any).count || ''}개 원재료의 유통기한 알림 기준일이 업데이트되었습니다.`;
      toast.success(successMessage);
      setIsBatchUpdateDialogOpen(false);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "일괄 업데이트 중 오류가 발생했습니다.");
    }
  };

  // filteredMaterials는 상단에서 정의됨

  return (
    <DashboardLayout>

    <div className="space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">원재료 관리</h1>
        <p className="text-muted-foreground">
          원재료 정보를 등록하고 관리합니다.
        </p>
      </div>

      <div className="flex justify-between items-center mb-4">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="원재료명 또는 코드 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2 items-center">
          <Label className="whitespace-nowrap">카테고리 필터:</Label>
          <select
            value={selectedCategoryId || ""}
            onChange={(e) => setSelectedCategoryId(e.target.value ? parseInt(e.target.value) : undefined)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">전체</option>
            {categories?.filter((c: any) => c.type === "material").map((category: any) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {selectedCategoryId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedCategoryId(undefined)}
            >
              필터 초기화
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsBatchUpdateDialogOpen(true)}>
            유통기한 알림 일괄 설정
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                원재료 추가
              </Button>
            </DialogTrigger>
            <DialogContent>
            <DialogHeader>
              <DialogTitle>원재료 추가</DialogTitle>
              <DialogDescription>
                새로운 원재료 정보를 입력합니다.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="materialName">원재료명 *</Label>
                <Input
                  id="materialName"
                  value={formData.materialName}
                  onChange={(e) =>
                    setFormData({ ...formData, materialName: e.target.value })
                  }
                  placeholder="예: 밀가루"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="materialCode">원재료코드 *</Label>
                <Input
                  id="materialCode"
                  value={isGeneratingCode ? "코드 생성 중..." : formData.materialCode}
                  readOnly
                  className="bg-muted"
                  placeholder="자동 생성됩니다"
                />
                <p className="text-xs text-muted-foreground">코드는 자동으로 생성됩니다 (예: MAT-001)</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">카테고리</Label>
                <CategorySelect
                  type="material"
                  value={formData.category}
                  onChange={(value) => setFormData({ ...formData, category: value })}
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
                  placeholder="예: KG, L, EA"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="safetyStock">안전재고</Label>
                <Input
                  id="safetyStock"
                  type="number"
                  value={formData.safetyStock}
                  onChange={(e) =>
                    setFormData({ ...formData, safetyStock: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expiryWarningDays">유통기한 알림 기준일 (일)</Label>
                <Input
                  id="expiryWarningDays"
                  type="number"
                  value={formData.expiryWarningDays}
                  onChange={(e) =>
                    setFormData({ ...formData, expiryWarningDays: parseInt(e.target.value) || 7 })
                  }
                  placeholder="7"
                />
                <p className="text-sm text-muted-foreground">
                  유통기한이 이 기준일 이내로 남았을 때 알림을 받습니다. (예: 7일 입력 시 유통기한 7일 전 알림)
                </p>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>원재료 목록</CardTitle>
          <CardDescription>
            등록된 원재료 ({filteredMaterials?.length || 0}개)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>원재료코드</TableHead>
                <TableHead>원재료명</TableHead>
                <TableHead>카테고리</TableHead>
                <TableHead>단위</TableHead>
                <TableHead className="text-right">현재 재고</TableHead>
                <TableHead className="text-right">안전재고</TableHead>
                <TableHead className="text-right">평균 단가 (원)</TableHead>
                <TableHead className="text-right">단가 (원)</TableHead>
                <TableHead className="text-center">상태</TableHead>
                <TableHead className="text-center">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMaterials && filteredMaterials.length > 0 ? (
                filteredMaterials.map((material: any) => (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.materialCode}</TableCell>
                    <TableCell>{material.materialName}</TableCell>
                    <TableCell>{material.category || "-"}</TableCell>
                    <TableCell>{material.unit || "-"}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          material.availableQuantity < material.safetyStockLevel
                            ? "text-red-600 font-semibold"
                            : ""
                        }
                      >
                        {material.availableQuantity?.toFixed(2) || "0.00"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">{material.safetyStockLevel || "0"}</TableCell>
                    <TableCell className="text-right">
                      {material.averagePrice ? material.averagePrice.toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {editingPriceId === material.id ? (
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                value={editingPriceValue}
                                onChange={(e) => setEditingPriceValue(e.target.value)}
                                className="w-32"
                                placeholder="새 단가"
                                autoFocus
                              />
                              <Input
                                type="text"
                                value={priceChangeReason}
                                onChange={(e) => setPriceChangeReason(e.target.value)}
                                className="w-64"
                                placeholder="변경 사유 (선택적)"
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={async () => {
                                  try {
                                    await updatePriceMutation.mutateAsync({
                                      id: material.id,
                                      unitPrice: parseFloat(editingPriceValue),
                                      reason: priceChangeReason || undefined,
                                    });
                                    toast.success("단가가 업데이트되었습니다.");
                                    setEditingPriceId(null);
                                    setPriceChangeReason("");
                                    refetch();
                                  } catch (error) {
                                    toast.error("단가 업데이트에 실패했습니다.");
                                  }
                                }}
                              >
                                저장
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingPriceId(null);
                                  setPriceChangeReason("");
                                }}
                              >
                                취소
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <div
                            className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
                            onClick={() => {
                              setEditingPriceId(material.id);
                              setEditingPriceValue(material.unitPrice?.toString() || "0");
                            }}
                          >
                            {material.unitPrice ? material.unitPrice.toLocaleString() : "-"}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setPriceHistoryMaterialId(material.id);
                              setIsPriceHistoryDialogOpen(true);
                            }}
                          >
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {material.isActive ? (
                        <Badge variant="default">활성</Badge>
                      ) : (
                        <Badge variant="secondary">비활성</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setPriceChartMaterialId(material.id);
                            setPriceChartMaterialName(material.materialName);
                            setIsPriceChartOpen(true);
                          }}
                          title="가격 변동 추이"
                        >
                          <TrendingUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(material)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(material.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {searchTerm
                      ? "검색 결과가 없습니다."
                      : "등록된 원재료가 없습니다. 원재료를 추가하여 시작하세요."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 수정 다이얼로그 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>원재료 수정</DialogTitle>
            <DialogDescription>
              원재료 정보를 수정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-materialName">원재료명 *</Label>
              <Input
                id="edit-materialName"
                value={formData.materialName}
                onChange={(e) => setFormData({ ...formData, materialName: e.target.value })}
                placeholder="예: 밀가루"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-materialCode">원재료코드</Label>
              <Input
                id="edit-materialCode"
                value={formData.materialCode}
                readOnly
                className="bg-muted"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-category">카테고리</Label>
              <CategorySelect
                type="material"
                value={formData.category}
                onChange={(value) => setFormData({ ...formData, category: value })}
                placeholder="카테고리를 선택하세요"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-unit">단위</Label>
              <Input
                id="edit-unit"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                placeholder="예: KG"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-safetyStock">안전재고</Label>
              <Input
                id="edit-safetyStock"
                type="number"
                value={formData.safetyStock}
                onChange={(e) => setFormData({ ...formData, safetyStock: parseFloat(e.target.value) || 0 })}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-expiryWarningDays">유통기한 알림 기준일 (일)</Label>
              <Input
                id="edit-expiryWarningDays"
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
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleUpdate} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "수정 중..." : "수정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 단가 이력 다이얼로그 */}
      <Dialog open={isPriceHistoryDialogOpen} onOpenChange={setIsPriceHistoryDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>단가 변경 이력</DialogTitle>
            <DialogDescription>
              {materials?.find(m => m.id === priceHistoryMaterialId)?.materialName}의 단가 변경 이력을 확인하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {priceHistory && priceHistory.length > 0 ? (
              <>
                {/* 가격 변동 추이 차트 */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium mb-4">가격 변동 추이</h4>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart
                      data={priceHistory.map((h: any) => ({
                        date: new Date(h.changedAt).toLocaleDateString("ko-KR"),
                        price: parseFloat(h.newPrice),
                      })).reverse()}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip formatter={(value: number) => `${value.toLocaleString()}원`} />
                      <Legend />
                      <Line type="monotone" dataKey="price" stroke="#8884d8" name="단가" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                {/* 이력 타임라인 */}
                <div className="space-y-2">
                {priceHistory.map((history: any, index: number) => (
                  <div
                    key={history.id}
                    className="flex items-start gap-4 p-4 border rounded-lg"
                  >
                    <div className="flex-shrink-0 w-2 h-2 mt-2 rounded-full bg-primary" />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {history.oldPrice ? (
                            <>
                              {parseFloat(history.oldPrice).toLocaleString()}원 →{" "}
                              <span className="text-primary">
                                {parseFloat(history.newPrice).toLocaleString()}원
                              </span>
                            </>
                          ) : (
                            <>
                              초기 단가:{" "}
                              <span className="text-primary">
                                {parseFloat(history.newPrice).toLocaleString()}원
                              </span>
                            </>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(history.changedAt).toLocaleString("ko-KR")}
                        </div>
                      </div>
                      {history.reason && (
                        <div className="mt-1 text-sm text-muted-foreground">
                          사유: {history.reason}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                단가 변경 이력이 없습니다.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPriceHistoryDialogOpen(false)}>
              닫기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 유통기한 알림 일괄 업데이트 다이얼로그 */}
      <Dialog open={isBatchUpdateDialogOpen} onOpenChange={setIsBatchUpdateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>유통기한 알림 기준일 일괄 설정</DialogTitle>
            <DialogDescription>
              기본값(7일)으로 설정된 모든 원재료의 유통기한 알림 기준일을 일괄적으로 변경합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="batchExpiryWarningDays">새로운 유통기한 알림 기준일 (일) *</Label>
              <Input
                id="batchExpiryWarningDays"
                type="number"
                value={batchExpiryWarningDays}
                onChange={(e) => setBatchExpiryWarningDays(parseInt(e.target.value) || 7)}
                placeholder="7"
                min="1"
                max="365"
              />
              <p className="text-sm text-muted-foreground">
                기본값(7일)으로 설정된 원재료만 업데이트됩니다. 이미 사용자가 수정한 원재료는 변경되지 않습니다.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBatchUpdateDialogOpen(false)}>
              취소
            </Button>
            <Button onClick={handleBatchUpdate} disabled={batchUpdateMutation.isPending}>
              {batchUpdateMutation.isPending ? "업데이트 중..." : "일괄 업데이트"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 가격 변동 추이 그래프 */}
      {priceChartMaterialId && (
        <MaterialPriceChart
          materialId={priceChartMaterialId}
          materialName={priceChartMaterialName}
          open={isPriceChartOpen}
          onOpenChange={setIsPriceChartOpen}
        />
      )}
    </div>
  
    </DashboardLayout>
  );
}
