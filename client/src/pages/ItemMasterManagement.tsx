import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Package, Pencil, Trash2, Search, Box, Layers, ShoppingCart, ChevronDown, ChevronUp, Download, FileText, Upload, Plus, Wrench } from "lucide-react";

type ItemType = "raw_material" | "own_product" | "external_product" | "subsidiary";

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  raw_material: "원재료",
  own_product: "자사제품",
  external_product: "외부제품",
  subsidiary: "부자재",
};

const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  raw_material: "bg-blue-100 text-blue-800",
  own_product: "bg-green-100 text-green-800",
  external_product: "bg-orange-100 text-orange-800",
  subsidiary: "bg-purple-100 text-purple-800",
};

export default function ItemMasterManagement() {
  return (
    <DashboardLayout>
      <ItemMasterContent />
    </DashboardLayout>
  );
}

function ItemMasterContent() {
  const { toast } = useToast();
  
  // 다운로드 mutations (useMutation 훅)
  const downloadTemplateMut = trpc.itemMaster.downloadTemplate.useMutation();
  const downloadAllMut = trpc.itemMaster.downloadAll.useMutation();
  
  const handleDownloadTemplate = async () => {
    try {
      const result = await downloadTemplateMut.mutateAsync({
        itemType: (activeTab === 'own_product' || activeTab === 'external_product') ? 'own_product' : 'raw_material',
      });
      
      if (result.success) {
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast({ title: '템플릿 다운로드 완료' });
      }
    } catch (error) {
      console.error('템플릿 다운로드 실패:', error);
      toast({ title: '템플릿 다운로드에 실패했습니다', variant: 'destructive' });
    }
  };
  
  const handleDownloadAll = async () => {
    try {
      const result = await downloadAllMut.mutateAsync({
        itemType: (activeTab === 'own_product' || activeTab === 'external_product') ? 'own_product' : 'raw_material',
      });
      
      if (result.success) {
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        toast({ title: '전체 다운로드 완료' });
      }
    } catch (error) {
      console.error('전체 다운로드 실패:', error);
      toast({ title: '전체 다운로드에 실패했습니다', variant: 'destructive' });
    }
  };

  const [activeTab, setActiveTab] = useState<string>("own_product");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSkuOpen, setIsSkuOpen] = useState(false);
  const [isSkuEditOpen, setIsSkuEditOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedSku, setSelectedSku] = useState<any>(null);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  // 품목 목록 조회
  const { data: itemsData, refetch: refetchItems } = trpc.itemMaster.list.useQuery({
    itemType: activeTab as ItemType,
    search: search || undefined,
    isActive: 1,
    limit: 200,
  });

  const items = itemsData?.items ?? [];

  // SKU 목록 조회 (확장된 아이템)
  const { data: skuList, refetch: refetchSkus } = trpc.productSku.listByItem.useQuery(
    { itemId: expandedItemId! },
    { enabled: !!expandedItemId }
  );

  // Mutations
  const createMutation = trpc.itemMaster.create.useMutation({
    onSuccess: () => {
      toast({ title: "품목이 등록되었습니다." });
      setIsCreateOpen(false);
      refetchItems();
    },
    onError: (err) => toast({ title: "등록 실패", description: err.message, variant: "destructive" }),
  });

  const updateMutation = trpc.itemMaster.update.useMutation({
    onSuccess: () => {
      toast({ title: "품목이 수정되었습니다." });
      setIsEditOpen(false);
      refetchItems();
    },
    onError: (err) => toast({ title: "수정 실패", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.itemMaster.delete.useMutation({
    onSuccess: () => {
      toast({ title: "품목이 비활성화되었습니다." });
      refetchItems();
    },
  });

  const createSkuMutation = trpc.productSku.create.useMutation({
    onSuccess: () => {
      toast({ title: "SKU가 등록되었습니다." });
      setIsSkuOpen(false);
      refetchSkus();
    },
    onError: (err) => toast({ title: "SKU 등록 실패", description: err.message, variant: "destructive" }),
  });

  const updateSkuMutation = trpc.productSku.update.useMutation({
    onSuccess: () => {
      toast({ title: "SKU가 수정되었습니다." });
      setIsSkuEditOpen(false);
      refetchSkus();
    },
    onError: (err) => toast({ title: "SKU 수정 실패", description: err.message, variant: "destructive" }),
  });

  const deleteSkuMutation = trpc.productSku.delete.useMutation({
    onSuccess: () => {
      toast({ title: "SKU가 삭제되었습니다." });
      refetchSkus();
    },
    onError: (err) => toast({ title: "SKU 삭제 실패", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-8 w-8" />
            품목 마스터
          </h1>
          <p className="text-muted-foreground">원재료, 자사제품, 부자재, 외부제품을 통합 관리합니다</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setExpandedItemId(null); }}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="own_product" className="flex items-center gap-1">
              <Box className="h-4 w-4" /> 자사제품
            </TabsTrigger>
            <TabsTrigger value="raw_material" className="flex items-center gap-1">
              <Layers className="h-4 w-4" /> 원재료
            </TabsTrigger>
            <TabsTrigger value="subsidiary" className="flex items-center gap-1">
              <Wrench className="h-4 w-4" /> 부자재
            </TabsTrigger>
            <TabsTrigger value="external_product" className="flex items-center gap-1">
              <ShoppingCart className="h-4 w-4" /> 외부제품
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleDownloadAll}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                전체 다운로드
              </Button>
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2"
              >
                <FileText className="h-4 w-4" />
                템플릿
              </Button>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {ITEM_TYPE_LABELS[activeTab as ItemType]} 등록
              </Button>
            </div>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-4 mt-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{items.length}</div>
              <p className="text-sm text-muted-foreground">등록 품목 수</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">
                {[...new Set(items.map((i: any) => i.category).filter(Boolean))].length}
              </div>
              <p className="text-sm text-muted-foreground">카테고리 수</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{items.filter((i: any) => i.isActive).length}</div>
              <p className="text-sm text-muted-foreground">활성 품목</p>
            </CardContent>
          </Card>
        </div>

        {/* 품목 테이블 */}
        <Card className="mt-4">
          <CardContent className="p-0">
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>품목코드</TableHead>
                    <TableHead>품목명</TableHead>
                    <TableHead>카테고리</TableHead>
                    <TableHead>기본단위</TableHead>
                    {(activeTab === "own_product" || activeTab === "external_product") && <TableHead>SKU</TableHead>}
                    {(activeTab === "raw_material" || activeTab === "subsidiary") && <TableHead>구매단위</TableHead>}
                    <TableHead className="text-right">기본단가</TableHead>
                    <TableHead className="w-[100px]">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        등록된 품목이 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item: any) => (
                      <>
                        <TableRow key={item.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell>
                            {(activeTab === "own_product" || activeTab === "external_product") && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => setExpandedItemId(expandedItemId === item.id ? null : item.id)}
                              >
                                {expandedItemId === item.id ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-sm">{item.itemCode}</TableCell>
                          <TableCell className="font-medium">{item.itemName}</TableCell>
                          <TableCell>
                            {item.category && (
                              <Badge variant="outline">{item.category}</Badge>
                            )}
                          </TableCell>
                          <TableCell>{item.baseUnit}</TableCell>
                          {(activeTab === "own_product" || activeTab === "external_product") && (
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">
                                SKU 보기
                              </Badge>
                            </TableCell>
                          )}
                          {(activeTab === "raw_material" || activeTab === "subsidiary") && (
                            <TableCell>{item.purchaseUnit || "-"}</TableCell>
                          )}
                          <TableCell className="text-right">
                            {Number(item.defaultUnitPrice || 0).toLocaleString()}원
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => { setSelectedItem(item); setIsEditOpen(true); }}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-destructive"
                                onClick={() => {
                                  if (confirm("이 품목을 비활성화하시겠습니까?")) {
                                    deleteMutation.mutate({ id: item.id });
                                  }
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {/* SKU 확장 행 */}
                        {expandedItemId === item.id && (
                          <TableRow key={`sku-${item.id}`}>
                            <TableCell colSpan={8} className="bg-muted/30 p-4">
                              <SkuSection
                                itemId={item.id}
                                itemCode={item.itemCode}
                                itemName={item.itemName}
                                skuList={skuList ?? []}
                                onAddSku={() => { setSelectedItem(item); setIsSkuOpen(true); }}
                                onEditSku={(sku: any) => { setSelectedSku(sku); setSelectedItem(item); setIsSkuEditOpen(true); }}
                                onDeleteSku={(skuId: number) => {
                                  if (confirm("이 SKU를 삭제하시겠습니까?")) {
                                    deleteSkuMutation.mutate({ id: skuId });
                                  }
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </Tabs>

      {/* 품목 생성 다이얼로그 */}
      <ItemFormDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        itemType={activeTab as ItemType}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {/* 품목 수정 다이얼로그 */}
      {selectedItem && (
        <ItemFormDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          itemType={activeTab as ItemType}
          initialData={selectedItem}
          isEdit
          onSubmit={(data) => updateMutation.mutate({ id: selectedItem.id, ...data })}
          isPending={updateMutation.isPending}
        />
      )}

      {/* SKU 생성 다이얼로그 */}
      {selectedItem && (
        <SkuFormDialog
          open={isSkuOpen}
          onOpenChange={setIsSkuOpen}
          itemId={selectedItem.id}
          itemCode={selectedItem.itemCode}
          itemName={selectedItem.itemName}
          onSubmit={(data) => createSkuMutation.mutate(data)}
          isPending={createSkuMutation.isPending}
        />
      )}

      {/* SKU 수정 다이얼로그 */}
      {selectedSku && selectedItem && (
        <SkuEditDialog
          open={isSkuEditOpen}
          onOpenChange={setIsSkuEditOpen}
          sku={selectedSku}
          itemName={selectedItem.itemName}
          onSubmit={(data) => updateSkuMutation.mutate(data)}
          isPending={updateSkuMutation.isPending}
        />
      )}
    </div>
  );
}

// ============================================================
// SKU 섹션 (수정/삭제 버튼 포함)
// ============================================================
function SkuSection({ itemId, itemCode, itemName, skuList, onAddSku, onEditSku, onDeleteSku }: {
  itemId: number;
  itemCode: string;
  itemName: string;
  skuList: any[];
  onAddSku: () => void;
  onEditSku: (sku: any) => void;
  onDeleteSku: (skuId: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm">SKU (포장 규격) 목록</h4>
        <Button size="sm" variant="outline" onClick={onAddSku}>
          <Plus className="h-3 w-3 mr-1" /> SKU 추가
        </Button>
      </div>
      {skuList.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 SKU가 없습니다.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>SKU 코드</TableHead>
              <TableHead>SKU 명칭</TableHead>
              <TableHead>판매단위</TableHead>
              <TableHead>개당 중량(g)</TableHead>
              <TableHead>팩당 개수</TableHead>
              <TableHead>박스당 팩수</TableHead>
              <TableHead className="text-right">판매단위당 kg</TableHead>
              <TableHead className="text-right">단가</TableHead>
              <TableHead>기본</TableHead>
              <TableHead className="w-[80px]">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {skuList.map((sku: any) => (
              <TableRow key={sku.id}>
                <TableCell className="font-mono text-xs">{sku.skuCode}</TableCell>
                <TableCell>{sku.skuName}</TableCell>
                <TableCell>{sku.salesUnit}</TableCell>
                <TableCell>{sku.netWeightG || "-"}</TableCell>
                <TableCell>{sku.piecesPerPack || 1}</TableCell>
                <TableCell>{sku.packsPerBox || 1}</TableCell>
                <TableCell className="text-right font-mono">
                  {Number(sku.kgPerSalesUnit).toFixed(4)}
                </TableCell>
                <TableCell className="text-right">
                  {Number(sku.unitPrice || 0).toLocaleString()}원
                </TableCell>
                <TableCell>
                  {sku.isDefault ? (
                    <Badge className="bg-green-500 text-white text-xs">기본</Badge>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={() => onEditSku(sku)}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => onDeleteSku(sku.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ============================================================
// 품목 폼 다이얼로그 (코드 자동 생성 연동)
// ============================================================
function ItemFormDialog({ open, onOpenChange, itemType, initialData, isEdit, onSubmit, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: ItemType;
  initialData?: any;
  isEdit?: boolean;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  // 카테고리 목록 조회
  const categoryType = itemType === 'subsidiary' ? 'product' : (itemType === 'own_product' || itemType === 'external_product' ? 'product' : 'material');
  const { data: categoriesData } = trpc.categories.listByType.useQuery({ type: categoryType });
  const categories = Array.isArray(categoriesData) ? categoriesData : (categoriesData?.categories || []);
  
  // 코드 자동 생성 (신규 등록 시)
  const { data: generatedCode } = trpc.itemMaster.generateCode.useQuery(
    { itemType },
    { enabled: !isEdit && open }
  );

  const [form, setForm] = useState({
    itemCode: initialData?.itemCode || "",
    itemName: initialData?.itemName || "",
    itemType: itemType,
    category: initialData?.category || "",
    baseUnit: initialData?.baseUnit || "kg",
    supplierId: initialData?.supplierId || undefined,
    purchaseUnit: initialData?.purchaseUnit || "",
    purchaseConversionRate: initialData?.purchaseConversionRate || 1,
    productReportNo: initialData?.productReportNo || "",
    shelfLifeDays: initialData?.shelfLifeDays || undefined,
    defaultUnitPrice: Number(initialData?.defaultUnitPrice || 0),
    description: initialData?.description || "",
  });

  // 자동 생성 코드 적용
  useEffect(() => {
    if (!isEdit && generatedCode?.code && open) {
      setForm(prev => ({ ...prev, itemCode: generatedCode.code }));
    }
  }, [generatedCode, isEdit, open]);

  // 다이얼로그 열릴 때 초기화
  useEffect(() => {
    if (open) {
      if (isEdit && initialData) {
        setForm({
          itemCode: initialData.itemCode || "",
          itemName: initialData.itemName || "",
          itemType: itemType,
          category: initialData.category || "",
          baseUnit: initialData.baseUnit || "kg",
          supplierId: initialData.supplierId || undefined,
          purchaseUnit: initialData.purchaseUnit || "",
          purchaseConversionRate: initialData.purchaseConversionRate || 1,
          productReportNo: initialData.productReportNo || "",
          shelfLifeDays: initialData.shelfLifeDays || undefined,
          defaultUnitPrice: Number(initialData.defaultUnitPrice || 0),
          description: initialData.description || "",
        });
      } else {
        setForm({
          itemCode: generatedCode?.code || "",
          itemName: "",
          itemType: itemType,
          category: "",
          baseUnit: "kg",
          supplierId: undefined,
          purchaseUnit: "",
          purchaseConversionRate: 1,
          productReportNo: "",
          shelfLifeDays: undefined,
          defaultUnitPrice: 0,
          description: "",
        });
      }
    }
  }, [open, isEdit, initialData, itemType]);

  const handleSubmit = () => {
    if (!form.itemName) return;
    const data: any = { ...form, itemType };
    if (isEdit) {
      delete data.itemCode;
      delete data.itemType;
    }
    // Clean up undefined/empty values (itemType은 항상 유지)
    Object.keys(data).forEach(key => {
      if (key === 'itemType' || key === 'itemName' || key === 'baseUnit') return; // 필수 필드 보존
      if (data[key] === "" || data[key] === undefined) delete data[key];
    });
    onSubmit(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? `${ITEM_TYPE_LABELS[itemType]} 수정` : `${ITEM_TYPE_LABELS[itemType]} 등록`}
          </DialogTitle>
          <DialogDescription>
            {isEdit ? "품목 정보를 수정합니다." : "새로운 품목을 등록합니다."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {!isEdit && (
              <div className="space-y-2">
                <Label>품목코드 * (자동생성)</Label>
                <Input
                  value={form.itemCode}
                  onChange={(e) => setForm({ ...form, itemCode: e.target.value })}
                  placeholder="자동 생성됨"
                  className="font-mono bg-muted/50"
                />
              </div>
            )}
            <div className={`space-y-2 ${isEdit ? "col-span-2" : ""}`}>
              <Label>품목명 *</Label>
              <Input
                value={form.itemName}
                onChange={(e) => setForm({ ...form, itemName: e.target.value })}
                placeholder="품목명 입력"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>기본단위</Label>
              <Select value={form.baseUnit} onValueChange={(v) => setForm({ ...form, baseUnit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                  <SelectItem value="mL">mL</SelectItem>
                  <SelectItem value="EA">EA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {(itemType === "raw_material" || itemType === "subsidiary") && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>구매단위</Label>
                <Input
                  value={form.purchaseUnit}
                  onChange={(e) => setForm({ ...form, purchaseUnit: e.target.value })}
                  placeholder="예: 포대, 박스"
                />
              </div>
              <div className="space-y-2">
                <Label>환산율 (구매→기본)</Label>
                <Input
                  type="number"
                  value={form.purchaseConversionRate}
                  onChange={(e) => setForm({ ...form, purchaseConversionRate: Number(e.target.value) })}
                  placeholder="1"
                />
              </div>
            </div>
          )}
          {(itemType === "own_product" || itemType === "external_product") && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>품목제조보고 번호</Label>
                <Input
                  value={form.productReportNo}
                  onChange={(e) => setForm({ ...form, productReportNo: e.target.value })}
                  placeholder="보고 번호"
                />
              </div>
              <div className="space-y-2">
                <Label>유통기한 (일)</Label>
                <Input
                  type="number"
                  value={form.shelfLifeDays || ""}
                  onChange={(e) => setForm({ ...form, shelfLifeDays: Number(e.target.value) || undefined })}
                  placeholder="예: 90"
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label>기본단가 (원)</Label>
            <Input
              type="number"
              value={form.defaultUnitPrice || ""}
              onChange={(e) => setForm({ ...form, defaultUnitPrice: Number(e.target.value) })}
              placeholder="0"
            />
          </div>
          <div className="space-y-2">
            <Label>설명</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="품목 설명"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "처리 중..." : isEdit ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SKU 생성 다이얼로그 (코드 자동 생성)
// ============================================================
function SkuFormDialog({ open, onOpenChange, itemId, itemCode, itemName, onSubmit, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemId: number;
  itemCode: string;
  itemName: string;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  // SKU 코드 자동 생성
  const { data: generatedSkuCode } = trpc.productSku.generateCode.useQuery(
    { parentItemCode: itemCode },
    { enabled: open }
  );

  const [form, setForm] = useState({
    skuCode: "",
    skuName: "",
    netWeightG: 0,
    piecesPerPack: 1,
    packsPerBox: 1,
    salesUnit: "box",
    kgPerSalesUnit: 0,
    unitPrice: 0,
    barcode: "",
    isDefault: 0,
  });

  // 자동 생성 코드 적용
  useEffect(() => {
    if (generatedSkuCode?.code && open) {
      setForm(prev => ({ ...prev, skuCode: generatedSkuCode.code }));
    }
  }, [generatedSkuCode, open]);

  // 다이얼로그 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setForm({
        skuCode: generatedSkuCode?.code || "",
        skuName: "",
        netWeightG: 0,
        piecesPerPack: 1,
        packsPerBox: 1,
        salesUnit: "box",
        kgPerSalesUnit: 0,
        unitPrice: 0,
        barcode: "",
        isDefault: 0,
      });
    }
  }, [open]);

  // 자동 계산: 개당 중량 × 팩당 개수 × 박스당 팩수 = 판매단위당 kg
  const autoCalcKg = () => {
    if (form.netWeightG > 0 && form.piecesPerPack > 0 && form.packsPerBox > 0) {
      const kg = (form.netWeightG * form.piecesPerPack * form.packsPerBox) / 1000;
      setForm(prev => ({ ...prev, kgPerSalesUnit: Number(kg.toFixed(4)) }));
    }
  };

  const handleSubmit = () => {
    if (!form.skuName || form.kgPerSalesUnit <= 0) return;
    onSubmit({
      itemId,
      ...form,
      skuCode: form.skuCode || undefined, // 비어있으면 서버에서 자동 생성
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>SKU 등록</DialogTitle>
          <DialogDescription>
            {itemName} ({itemCode})의 새로운 포장 규격을 등록합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SKU 코드 (자동생성)</Label>
              <Input
                value={form.skuCode}
                onChange={(e) => setForm({ ...form, skuCode: e.target.value })}
                placeholder="자동 생성됨"
                className="font-mono bg-muted/50"
              />
            </div>
            <div className="space-y-2">
              <Label>SKU 명칭 *</Label>
              <Input
                value={form.skuName}
                onChange={(e) => setForm({ ...form, skuName: e.target.value })}
                placeholder={`${itemName} 60g×30ea`}
              />
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg space-y-3">
            <h4 className="font-semibold text-sm">포장 규격</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">개당 중량 (g)</Label>
                <Input
                  type="number"
                  value={form.netWeightG || ""}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm(prev => ({ ...prev, netWeightG: v }));
                  }}
                  onBlur={autoCalcKg}
                  placeholder="60"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">팩당 개수</Label>
                <Input
                  type="number"
                  value={form.piecesPerPack}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm(prev => ({ ...prev, piecesPerPack: v }));
                  }}
                  onBlur={autoCalcKg}
                  placeholder="30"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">박스당 팩수</Label>
                <Input
                  type="number"
                  value={form.packsPerBox}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setForm(prev => ({ ...prev, packsPerBox: v }));
                  }}
                  onBlur={autoCalcKg}
                  placeholder="1"
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              자동 계산: {form.netWeightG}g × {form.piecesPerPack}ea × {form.packsPerBox}pack = {((form.netWeightG * form.piecesPerPack * form.packsPerBox) / 1000).toFixed(4)} kg/판매단위
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>판매단위</Label>
              <Select value={form.salesUnit} onValueChange={(v) => setForm({ ...form, salesUnit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="box">박스 (box)</SelectItem>
                  <SelectItem value="pack">팩 (pack)</SelectItem>
                  <SelectItem value="ea">개 (ea)</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="set">세트 (set)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>판매단위당 kg *</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.kgPerSalesUnit || ""}
                onChange={(e) => setForm({ ...form, kgPerSalesUnit: Number(e.target.value) })}
                placeholder="1.8"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>단가 (원)</Label>
              <Input
                type="number"
                value={form.unitPrice || ""}
                onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>바코드</Label>
              <Input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                placeholder="바코드 번호"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "등록 중..." : "SKU 등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SKU 수정 다이얼로그
// ============================================================
function SkuEditDialog({ open, onOpenChange, sku, itemName, onSubmit, isPending }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: any;
  itemName: string;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    skuName: sku?.skuName || "",
    netWeightG: Number(sku?.netWeightG || 0),
    piecesPerPack: sku?.piecesPerPack || 1,
    packsPerBox: sku?.packsPerBox || 1,
    salesUnit: sku?.salesUnit || "box",
    kgPerSalesUnit: Number(sku?.kgPerSalesUnit || 0),
    unitPrice: Number(sku?.unitPrice || 0),
    barcode: sku?.barcode || "",
    isDefault: sku?.isDefault || 0,
  });

  useEffect(() => {
    if (open && sku) {
      setForm({
        skuName: sku.skuName || "",
        netWeightG: Number(sku.netWeightG || 0),
        piecesPerPack: sku.piecesPerPack || 1,
        packsPerBox: sku.packsPerBox || 1,
        salesUnit: sku.salesUnit || "box",
        kgPerSalesUnit: Number(sku.kgPerSalesUnit || 0),
        unitPrice: Number(sku.unitPrice || 0),
        barcode: sku.barcode || "",
        isDefault: sku.isDefault || 0,
      });
    }
  }, [open, sku]);

  const autoCalcKg = () => {
    if (form.netWeightG > 0 && form.piecesPerPack > 0 && form.packsPerBox > 0) {
      const kg = (form.netWeightG * form.piecesPerPack * form.packsPerBox) / 1000;
      setForm(prev => ({ ...prev, kgPerSalesUnit: Number(kg.toFixed(4)) }));
    }
  };

  const handleSubmit = () => {
    if (!form.skuName || form.kgPerSalesUnit <= 0) return;
    onSubmit({
      id: sku.id,
      ...form,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>SKU 수정</DialogTitle>
          <DialogDescription>
            {itemName} - {sku?.skuCode} 수정
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>SKU 코드</Label>
              <Input
                value={sku?.skuCode || ""}
                disabled
                className="font-mono bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>SKU 명칭 *</Label>
              <Input
                value={form.skuName}
                onChange={(e) => setForm({ ...form, skuName: e.target.value })}
              />
            </div>
          </div>
          <div className="p-3 bg-muted/50 rounded-lg space-y-3">
            <h4 className="font-semibold text-sm">포장 규격</h4>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">개당 중량 (g)</Label>
                <Input
                  type="number"
                  value={form.netWeightG || ""}
                  onChange={(e) => setForm(prev => ({ ...prev, netWeightG: Number(e.target.value) }))}
                  onBlur={autoCalcKg}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">팩당 개수</Label>
                <Input
                  type="number"
                  value={form.piecesPerPack}
                  onChange={(e) => setForm(prev => ({ ...prev, piecesPerPack: Number(e.target.value) }))}
                  onBlur={autoCalcKg}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">박스당 팩수</Label>
                <Input
                  type="number"
                  value={form.packsPerBox}
                  onChange={(e) => setForm(prev => ({ ...prev, packsPerBox: Number(e.target.value) }))}
                  onBlur={autoCalcKg}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              자동 계산: {form.netWeightG}g × {form.piecesPerPack}ea × {form.packsPerBox}pack = {((form.netWeightG * form.piecesPerPack * form.packsPerBox) / 1000).toFixed(4)} kg/판매단위
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>판매단위</Label>
              <Select value={form.salesUnit} onValueChange={(v) => setForm({ ...form, salesUnit: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="box">박스 (box)</SelectItem>
                  <SelectItem value="pack">팩 (pack)</SelectItem>
                  <SelectItem value="ea">개 (ea)</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="set">세트 (set)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>판매단위당 kg *</Label>
              <Input
                type="number"
                step="0.0001"
                value={form.kgPerSalesUnit || ""}
                onChange={(e) => setForm({ ...form, kgPerSalesUnit: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>단가 (원)</Label>
              <Input
                type="number"
                value={form.unitPrice || ""}
                onChange={(e) => setForm({ ...form, unitPrice: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>바코드</Label>
              <Input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>기본 SKU</Label>
              <Select value={String(form.isDefault)} onValueChange={(v) => setForm({ ...form, isDefault: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">아니오</SelectItem>
                  <SelectItem value="1">예</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "수정 중..." : "SKU 수정"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
