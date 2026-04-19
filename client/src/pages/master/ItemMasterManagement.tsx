import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Package, Pencil, Trash2, Search, Box, Layers, ShoppingCart, ChevronDown, ChevronUp, Download, FileText, Plus, Wrench } from "lucide-react";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// 2026-04-20 분해: SKU 섹션 + 3개 Dialog는 _itemMaster/ 로 이동
import { SkuSection } from "./_itemMaster/SkuSection";
import { ItemFormDialog, SkuFormDialog, SkuEditDialog, type ItemType, ITEM_TYPE_LABELS } from "./_itemMaster/Dialogs";

const ITEM_TYPE_COLORS: Record<ItemType, string> = {
  raw_material: "bg-blue-100 text-blue-800",
  own_product: "bg-green-100 text-green-800",
  external_product: "bg-orange-100 text-orange-800",
  subsidiary: "bg-purple-100 text-purple-800",
};

export default function ItemMasterManagement() {
  const L = useIndustryLabel();
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
    onError: (err: { message: string }) => toast({ title: "등록 실패", description: err.message, variant: "destructive" }),
  });

  const updateMutation = trpc.itemMaster.update.useMutation({
    onSuccess: () => {
      console.log('[ItemMaster] update success');
      toast({ title: "품목이 수정되었습니다." });
      setIsEditOpen(false);
      refetchItems();
    },
    onError: (err: { message: string }) => {
      console.error('[ItemMaster] update error:', err);
      toast({ title: "수정 실패", description: err.message, variant: "destructive" });
    },
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
    onError: (err: { message: string }) => toast({ title: "SKU 등록 실패", description: err.message, variant: "destructive" }),
  });

  const updateSkuMutation = trpc.productSku.update.useMutation({
    onSuccess: () => {
      toast({ title: "SKU가 수정되었습니다." });
      setIsSkuEditOpen(false);
      refetchSkus();
    },
    onError: (err: { message: string }) => toast({ title: "SKU 수정 실패", description: err.message, variant: "destructive" }),
  });

  const deleteSkuMutation = trpc.productSku.delete.useMutation({
    onSuccess: () => {
      toast({ title: "SKU가 삭제되었습니다." });
      refetchSkus();
    },
    onError: (err: { message: string }) => toast({ title: "SKU 삭제 실패", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
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
                {Array.from(new Set(items.map((i: any) => i.category).filter(Boolean))).length}
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
          key={`edit-${selectedItem.id}`}
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          itemType={activeTab as ItemType}
          initialData={selectedItem}
          isEdit
          onSubmit={(data) => {
            const payload = { id: selectedItem.id, ...data };
            console.log('[ItemMaster] edit onSubmit payload:', JSON.stringify(payload));
            updateMutation.mutate(payload);
          }}
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

