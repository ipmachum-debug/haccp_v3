import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
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
import { Package, Pencil, Trash2, Search, Box, Layers, ShoppingCart, ChevronDown, ChevronUp, Download, FileText, Upload, Plus, Wrench, RefreshCw, Boxes, Star, X } from "lucide-react";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

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
  const L = useIndustryLabel();
  return (
    <DashboardLayout>
      <ItemMasterContent />
    </DashboardLayout>
  );
}

function ItemMasterContent() {
  const L = useIndustryLabel();
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
  // ★ 2026-05-08 (PR #271): 활성 기본 — 비활성/전체 옵션 유지
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "INACTIVE" | "ALL">("ACTIVE");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSkuOpen, setIsSkuOpen] = useState(false);
  const [isSkuEditOpen, setIsSkuEditOpen] = useState(false);
  // PR #281 — 번들 구성 다이얼로그
  const [isBundleOpen, setIsBundleOpen] = useState(false);
  // ★ PR-C/D (2026-05-11): SKU 별칭 (alias) 관리 다이얼로그
  //   Excel 일괄 매출에서 "단지 혼합10종설기" 같은 자유로운 표기 → SKU 자동 매칭용.
  //   alias 등록은 여기서 1회, 매칭은 SalesBulkUpload 에서 bulkMatchPreview 가 자동 처리.
  const [isAliasOpen, setIsAliasOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [selectedSku, setSelectedSku] = useState<any>(null);
  const [expandedItemId, setExpandedItemId] = useState<number | null>(null);

  // 품목 목록 조회
  const { data: itemsData, refetch: refetchItems } = trpc.itemMaster.list.useQuery({
    itemType: activeTab as ItemType,
    search: search || undefined,
    isActive: statusFilter === "ALL" ? undefined : statusFilter === "ACTIVE" ? 1 : 0,
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

  const backfillMutation = trpc.product.backfillItemMaster.useMutation({
    onSuccess: (data: { total: number; inserted: number; linked: number; updated: number; errors: number }) => {
      const { total, inserted, linked, updated, errors } = data;
      const summary = `총 ${total}건 · 신규 ${inserted} · 연결 ${linked} · 갱신 ${updated}${errors ? ` · 실패 ${errors}` : ""}`;
      toast({
        title: "제품 마스터 동기화 완료",
        description: summary,
        variant: errors > 0 ? "destructive" : "default",
      });
      refetchItems();
    },
    onError: (err: { message: string }) =>
      toast({ title: "동기화 실패", description: err.message, variant: "destructive" }),
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
          <p className="text-muted-foreground">{`${L("material")}, 자사제품, 부자재, 외부제품을 통합 관리합니다`}</p>
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
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "ACTIVE" | "INACTIVE" | "ALL")}
              className="border rounded px-3 py-2 text-sm"
              title="상태 필터"
            >
              <option value="ACTIVE">활성</option>
              <option value="INACTIVE">비활성</option>
              <option value="ALL">전체</option>
            </select>
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
              {activeTab === "own_product" && (
                <Button
                  variant="outline"
                  onClick={() => backfillMutation.mutate()}
                  disabled={backfillMutation.isPending}
                  className="flex items-center gap-2"
                  title="제품 마스터(h_products_v2)에 있지만 품목 마스터에 누락된 자사제품을 복구합니다"
                >
                  <RefreshCw className={`h-4 w-4 ${backfillMutation.isPending ? "animate-spin" : ""}`} />
                  {backfillMutation.isPending ? "동기화 중..." : "제품에서 동기화"}
                </Button>
              )}
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
                                onOpenBundle={(sku: any) => { setSelectedSku(sku); setSelectedItem(item); setIsBundleOpen(true); }}
                                onOpenAlias={(sku: any) => { setSelectedSku(sku); setSelectedItem(item); setIsAliasOpen(true); }}
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

      {/* PR #281 — 번들 구성 다이얼로그 (혼합 제품) */}
      {selectedSku && (
        <BundleCompositionDialog
          open={isBundleOpen}
          onOpenChange={setIsBundleOpen}
          parentSku={selectedSku}
        />
      )}

      {/* ★ PR-C/D (2026-05-11) — SKU 별칭 (alias) 관리 다이얼로그 */}
      {selectedSku && (
        <AliasManagementDialog
          open={isAliasOpen}
          onOpenChange={setIsAliasOpen}
          sku={selectedSku}
        />
      )}
    </div>
  );
}

// ============================================================
// SKU 섹션 (수정/삭제 버튼 포함)
// ============================================================
function SkuSection({ itemId, itemCode, itemName, skuList, onAddSku, onEditSku, onDeleteSku, onOpenBundle, onOpenAlias }: {
  itemId: number;
  itemCode: string;
  itemName: string;
  skuList: any[];
  onAddSku: () => void;
  onEditSku: (sku: any) => void;
  onDeleteSku: (skuId: number) => void;
  onOpenBundle: (sku: any) => void;
  onOpenAlias: (sku: any) => void;
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
                      title="SKU 수정"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    {/* ★ 2026-05-09 (PR #281): 번들 구성 버튼 — 혼합 제품 SKU 의 child 등록 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-blue-600"
                      onClick={() => onOpenBundle(sku)}
                      title="번들 구성 (혼합 제품)"
                    >
                      <Boxes className="h-3 w-3" />
                    </Button>
                    {/* ★ 2026-05-11 (PR-C/D): SKU 별칭 관리 — Excel 매출 일괄 매칭용 */}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-amber-600"
                      onClick={() => onOpenAlias(sku)}
                      title="별칭 관리 (Excel 매출 매칭)"
                    >
                      <Search className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-destructive"
                      onClick={() => onDeleteSku(sku.id)}
                      title="SKU 삭제"
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
  const rawCatData = categoriesData as any;
  const categories = Array.isArray(rawCatData) ? rawCatData : (rawCatData?.categories ?? []);
  
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
    purchaseConversionRate: Number(initialData?.purchaseConversionRate) || 1,
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
          purchaseConversionRate: Number(initialData.purchaseConversionRate) || 1,
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
    console.log('[ItemMaster] handleSubmit CALLED, isEdit:', isEdit, 'itemName:', form.itemName);
    if (!form.itemName) {
      console.error('[ItemMaster] handleSubmit: itemName is empty, aborting');
      return;
    }
    // ★ 2026-05-10 (PR #298 L3): 원재료/부재료의 기본단가=0 저장 시 경고
    //   기본단가=0 인 마스터는 배치 INSERT 시 4-tier 폴백의 마지막 라인이 0이 되어
    //   원가 계산 0/'-' 표시 사고로 이어짐 → 저장 전 사용자 확인
    const itemTypeNow = isEdit ? (initialData?.itemType ?? itemType) : itemType;
    const isMaterialType = itemTypeNow === 'raw_material' || itemTypeNow === 'subsidiary';
    const priceNum = Number(form.defaultUnitPrice ?? 0);
    if (isMaterialType && (!priceNum || priceNum <= 0)) {
      const proceed = window.confirm(
        `[경고] 기본단가가 0원입니다.\n\n` +
        `원재료/부재료의 기본단가가 0인 경우, 배치 생성 시 원가 계산이 0으로 처리되어 ` +
        `'생산원가 분석' 화면에 '-' 로 표시될 수 있습니다.\n\n` +
        `그래도 저장하시겠습니까?\n` +
        `(나중에 입고 등록 시 자동으로 단가가 갱신됩니다.)`
      );
      if (!proceed) {
        console.warn('[ItemMaster] handleSubmit aborted: defaultUnitPrice=0 confirmation declined');
        return;
      }
    }
    const data: any = { ...form };
    if (!isEdit) {
      data.itemType = itemType;
    }
    if (isEdit) {
      delete data.itemCode;
      delete data.itemType;
    }
    // Ensure numeric fields are proper numbers (decimal columns return strings from DB)
    if (data.purchaseConversionRate !== undefined) data.purchaseConversionRate = Number(data.purchaseConversionRate);
    if (data.defaultUnitPrice !== undefined) data.defaultUnitPrice = Number(data.defaultUnitPrice);
    if (data.shelfLifeDays !== undefined && data.shelfLifeDays !== null) data.shelfLifeDays = Number(data.shelfLifeDays);
    if (data.supplierId !== undefined && data.supplierId !== null) data.supplierId = Number(data.supplierId);
    // Clean up undefined/empty values
    Object.keys(data).forEach(key => {
      if (key === 'itemName' || key === 'baseUnit') return;
      if (data[key] === '' || data[key] === undefined) delete data[key];
    });
    // Remove NaN values from numeric conversion
    Object.keys(data).forEach(key => {
      if (typeof data[key] === 'number' && isNaN(data[key])) delete data[key];
    });
    console.log('[ItemMaster] handleSubmit final data:', JSON.stringify(data));
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
                  {/* 현재 카테고리가 목록에 없을 경우 기존 값 표시 */}
                  {form.category && !categories.some((cat: any) => cat.name === form.category) && (
                    <SelectItem key="current" value={form.category}>
                      {form.category} (미등록)
                    </SelectItem>
                  )}
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
            {/* ★ 2026-05-10 (PR #298 L3): 원재료/부재료의 기본단가=0 인라인 경고 */}
            {(itemType === "raw_material" || itemType === "subsidiary") &&
              (!form.defaultUnitPrice || Number(form.defaultUnitPrice) <= 0) && (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  ⚠ 기본단가가 0원이면 배치 원가 계산이 '-'로 표시될 수 있습니다.
                  입고 등록 시 자동 갱신되지만, 가능하면 초기값을 입력해주세요.
                </p>
              )}
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
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
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

// ============================================================
// PR #281 — 번들 구성 다이얼로그 (혼합 제품: parent SKU 의 child + 비율)
// ============================================================
function BundleCompositionDialog({
  open,
  onOpenChange,
  parentSku,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentSku: any;
}) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // 현재 번들 구성 조회
  const { data: bundleData, refetch: refetchBundle } = trpc.skuBundle.listByParent.useQuery(
    { parentSkuId: parentSku?.id },
    { enabled: !!parentSku?.id && open },
  );

  // 후보 child SKU 조회 (자기 SKU 제외)
  const { data: itemsData } = trpc.itemMaster.list.useQuery(
    { itemType: "own_product", isActive: 1, limit: 200 },
    { enabled: open },
  );
  const candidateItems = (itemsData as any)?.items ?? [];

  // 모든 후보 SKU 조회 (각 item 의 SKU 평탄화)
  const [allSkus, setAllSkus] = useState<any[]>([]);
  useEffect(() => {
    if (!open || candidateItems.length === 0) return;
    (async () => {
      const skus: any[] = [];
      for (const item of candidateItems) {
        try {
          const list = await utils.productSku.listByItem.fetch({ itemId: item.id });
          for (const sku of list as any[]) {
            if (sku.id !== parentSku.id && sku.isActive === 1) {
              skus.push({ ...sku, itemName: item.itemName });
            }
          }
        } catch {}
      }
      setAllSkus(skus);
    })();
  }, [open, candidateItems.length, parentSku?.id]);

  // ★ PR #298: 편집 상태 — pieces + pieceWeightG 추가
  const [children, setChildren] = useState<Array<{
    childSkuId: number;
    defaultRatio: number;
    childPieces: number | null;
    childPieceWeightG: number | null;
  }>>([]);
  useEffect(() => {
    if (bundleData?.items) {
      setChildren(
        bundleData.items.map((b: any) => ({
          childSkuId: b.childSkuId,
          defaultRatio: Number(b.defaultRatio),
          childPieces: b.childPieces ?? null,
          childPieceWeightG: b.childPieceWeightG != null ? Number(b.childPieceWeightG) : null,
        })),
      );
    } else {
      setChildren([]);
    }
  }, [bundleData?.items]);

  // ★ PR #298: pieces × pieceG 입력 시 ratio 자동 계산
  // parent SKU 의 1 단위 kg 기준 (예: parent 400g = 5×80g → 각 child 20%)
  const totalGramFromPieces = children.reduce(
    (s, c) =>
      s +
      (c.childPieces && c.childPieceWeightG ? c.childPieces * c.childPieceWeightG : 0),
    0,
  );
  const allHavePieces = children.length > 0 && children.every((c) => c.childPieces && c.childPieceWeightG);
  // pieces 모드: 자동 ratio = (pieces × pieceG) / total × 100
  const childrenWithComputedRatio = allHavePieces && totalGramFromPieces > 0
    ? children.map((c) => ({
        ...c,
        defaultRatio:
          c.childPieces && c.childPieceWeightG
            ? Math.round(((c.childPieces * c.childPieceWeightG) / totalGramFromPieces) * 100 * 100) / 100
            : 0,
      }))
    : children;

  const totalRatio = childrenWithComputedRatio.reduce((s, c) => s + (Number(c.defaultRatio) || 0), 0);
  const isValid = Math.abs(totalRatio - 100) < 0.01 && children.length >= 2;

  const setMutation = trpc.skuBundle.setBundleComposition.useMutation({
    onSuccess: (res) => {
      toast({ title: "번들 구성 저장 완료", description: `${res.savedCount}개 child SKU 등록 (합계 ${res.totalRatio}%)` });
      refetchBundle();
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "저장 실패", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = trpc.skuBundle.removeBundle.useMutation({
    onSuccess: () => {
      toast({ title: "번들 구성 삭제 — 단일 SKU 로 전환됨" });
      refetchBundle();
      onOpenChange(false);
    },
  });

  const handleAdd = () => {
    setChildren([
      ...children,
      { childSkuId: 0, defaultRatio: 0, childPieces: null, childPieceWeightG: null },
    ]);
  };

  const handleRemove = (idx: number) => {
    setChildren(children.filter((_, i) => i !== idx));
  };

  const handleAutoBalance = () => {
    if (children.length === 0) return;
    const equal = Math.floor((100 / children.length) * 100) / 100;
    const updated = children.map((c) => ({ ...c, defaultRatio: equal }));
    // 마지막 행에 잔여 보정
    const sum = updated.reduce((s, c) => s + c.defaultRatio, 0);
    if (Math.abs(sum - 100) > 0.001) {
      updated[updated.length - 1].defaultRatio += Math.round((100 - sum) * 100) / 100;
    }
    setChildren(updated);
  };

  const handleSubmit = () => {
    if (!parentSku?.id) return;
    if (!isValid) {
      toast({
        title: "비율 합계가 100% 가 아닙니다",
        description: `현재: ${totalRatio.toFixed(2)}% (최소 2개 child 필요)`,
        variant: "destructive",
      });
      return;
    }
    if (children.some((c) => !c.childSkuId)) {
      toast({ title: "child SKU 를 모두 선택하세요", variant: "destructive" });
      return;
    }
    setMutation.mutate({
      parentSkuId: parentSku.id,
      // ★ PR #298: pieces 입력 시 자동 계산된 ratio 우선 사용
      children: childrenWithComputedRatio.map((c, idx) => ({
        childSkuId: c.childSkuId,
        defaultRatio: c.defaultRatio,
        childPieces: c.childPieces ?? undefined,
        childPieceWeightG: c.childPieceWeightG ?? undefined,
        sortOrder: idx,
      })),
    });
  };

  if (!parentSku) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* ★ PR-G (2026-05-11): max-w-2xl → max-w-4xl + max-h 스크롤
          이전: SKU 명 + 개수/g/% 입력 6열이 좁아서 비율 컬럼이 잘려나가는 오버플로우 사고. */}
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>번들 구성 — {parentSku.skuName}</DialogTitle>
          <DialogDescription>
            혼합 제품: 여러 child SKU 를 비율대로 묶어 1개 출고 SKU 로 관리.
            합계 100%, 비율 고정 (HACCP 라벨 일관성).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* 현재 구성 안내 */}
          {bundleData?.items && bundleData.items.length > 0 && (
            <div className="rounded-md bg-blue-50 p-2 text-xs text-blue-900">
              현재 {bundleData.items.length}개 child 등록됨 (합계: {bundleData.totalRatio}%)
            </div>
          )}

          {/* child SKU 행 — PR #298: pieces × pieceG 입력 시 ratio 자동 계산 */}
          <div className="space-y-2">
            {/* 헤더 (한번만) */}
            {children.length > 0 && (
              <div className="grid grid-cols-[24px_minmax(220px,1fr)_72px_84px_92px_28px] items-center gap-2 px-2 text-[10px] font-medium text-muted-foreground">
                <span>#</span>
                <span>child SKU</span>
                <span className="text-center">개수</span>
                <span className="text-center">1개당(g)</span>
                <span className="text-right">비율(%)</span>
                <span></span>
              </div>
            )}
            {children.map((child, idx) => {
              const computedRatio = childrenWithComputedRatio[idx]?.defaultRatio ?? 0;
              const usingPieces = !!(child.childPieces && child.childPieceWeightG);
              return (
                <div key={idx} className="grid grid-cols-[24px_minmax(220px,1fr)_72px_84px_92px_28px] items-center gap-2 rounded border p-2">
                  <span className="text-xs text-muted-foreground">{idx + 1}</span>
                  <select
                    value={child.childSkuId || ""}
                    onChange={(e) => {
                      const next = [...children];
                      next[idx].childSkuId = parseInt(e.target.value) || 0;
                      setChildren(next);
                    }}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    <option value="">child SKU 선택...</option>
                    {allSkus.map((sku) => (
                      <option key={sku.id} value={sku.id}>
                        {sku.skuCode} — {sku.itemName} ({sku.skuName})
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="1"
                    value={child.childPieces || ""}
                    onChange={(e) => {
                      const next = [...children];
                      next[idx].childPieces = parseInt(e.target.value) || null;
                      setChildren(next);
                    }}
                    className="text-right text-xs"
                    placeholder="개"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    value={child.childPieceWeightG || ""}
                    onChange={(e) => {
                      const next = [...children];
                      next[idx].childPieceWeightG = parseFloat(e.target.value) || null;
                      setChildren(next);
                    }}
                    className="text-right text-xs"
                    placeholder="g"
                  />
                  {usingPieces ? (
                    <span className="text-right text-xs font-medium text-blue-600">
                      {computedRatio.toFixed(2)}%
                    </span>
                  ) : (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={child.defaultRatio || ""}
                      onChange={(e) => {
                        const next = [...children];
                        next[idx].defaultRatio = parseFloat(e.target.value) || 0;
                        setChildren(next);
                      }}
                      className="text-right text-xs"
                      placeholder="%"
                    />
                  )}
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRemove(idx)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              );
            })}
            {allHavePieces && totalGramFromPieces > 0 && (
              <div className="rounded bg-blue-50 px-2 py-1 text-[10px] text-blue-900">
                💡 개수 × 1개당(g) = 총 {totalGramFromPieces.toLocaleString()}g — 비율 자동 계산
              </div>
            )}
          </div>

          {/* 컨트롤 */}
          <div className="flex items-center justify-between gap-2">
            <Button variant="outline" size="sm" onClick={handleAdd}>
              <Plus className="mr-1 h-3 w-3" /> child SKU 추가
            </Button>
            {children.length > 0 && (
              <Button variant="ghost" size="sm" onClick={handleAutoBalance}>
                <RefreshCw className="mr-1 h-3 w-3" /> 균등 분배
              </Button>
            )}
          </div>

          {/* 합계 게이지 */}
          <div className="rounded-md border p-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span>합계</span>
              <span className={isValid ? "font-semibold text-green-600" : "font-semibold text-red-600"}>
                {totalRatio.toFixed(2)}% {isValid ? "✓" : "✗"}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-muted">
              <div
                className={isValid ? "h-full bg-green-500" : "h-full bg-red-500"}
                style={{ width: `${Math.min(100, totalRatio)}%` }}
              />
            </div>
            {!isValid && children.length > 0 && (
              <div className="mt-1 text-xs text-red-600">
                {children.length < 2 ? "최소 2개 child 필요" : "100.00% 가 아닙니다"}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          {bundleData?.items && bundleData.items.length > 0 && (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => {
                if (confirm("번들 구성을 삭제하고 단일 SKU 로 전환하시겠습니까?")) {
                  removeMutation.mutate({ parentSkuId: parentSku.id });
                }
              }}
              disabled={removeMutation.isPending}
            >
              번들 해제
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || setMutation.isPending}>
            {setMutation.isPending ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// SKU 별칭 (alias) 관리 다이얼로그 — PR-C/D (2026-05-11)
// ============================================================
//
// 목적: Excel 일괄 매출 등록 시 "단지 혼합10종설기" 같은 자유로운 표기를
//       SKU 와 매칭하기 위한 alias 1:N 관리.
// 동작: SalesBulkUpload 가 매칭 단계에서 bulkMatchPreview 를 호출 →
//       alias 정확 매칭 우선 → sku_name → sku_code → item_name fallback.
// 권한: addAlias / removeAlias 는 adminProcedure.
function AliasManagementDialog({
  open,
  onOpenChange,
  sku,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sku: { id: number; skuCode: string; skuName: string };
}) {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [newAlias, setNewAlias] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [note, setNote] = useState("");

  const { data: aliases, refetch } = trpc.skuAlias.listBySku.useQuery(
    { skuId: sku.id },
    { enabled: open && !!sku.id },
  );

  const addMutation = trpc.skuAlias.addAlias.useMutation({
    onSuccess: () => {
      toast({ title: "별칭이 추가되었습니다." });
      setNewAlias("");
      setIsPrimary(false);
      setNote("");
      void refetch();
      void utils.skuAlias.listBySku.invalidate({ skuId: sku.id });
    },
    onError: (e) => {
      toast({ title: "추가 실패", description: e.message, variant: "destructive" });
    },
  });

  const removeMutation = trpc.skuAlias.removeAlias.useMutation({
    onSuccess: () => {
      toast({ title: "별칭이 삭제되었습니다." });
      void refetch();
      void utils.skuAlias.listBySku.invalidate({ skuId: sku.id });
    },
    onError: (e) => {
      toast({ title: "삭제 실패", description: e.message, variant: "destructive" });
    },
  });

  const handleAdd = () => {
    const trimmed = newAlias.trim();
    if (!trimmed) {
      toast({ title: "별칭을 입력해주세요.", variant: "destructive" });
      return;
    }
    addMutation.mutate({
      skuId: sku.id,
      alias: trimmed,
      isPrimary,
      note: note.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4 text-amber-600" />
            SKU 별칭 관리 — {sku.skuName}
          </DialogTitle>
          <DialogDescription>
            <span className="block text-xs text-muted-foreground font-mono">{sku.skuCode}</span>
            <span className="block mt-2">
              Excel 매출 일괄 등록 시 이 별칭들과 정확 매칭되면 자동으로 이 SKU 로 인식됩니다.
              <br />
              예: "단지 혼합10종설기", "혼합10종설기", "단지 혼합 설기 10종" 등 N개 등록 가능.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
            <Label className="text-sm font-semibold">새 별칭 추가</Label>
            <div className="flex gap-2">
              <Input
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                placeholder="예: 단지 혼합10종설기"
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              />
              <Button onClick={handleAdd} disabled={addMutation.isPending}>
                {addMutation.isPending ? "추가 중..." : "추가"}
              </Button>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="h-3 w-3"
                />
                <Star className="h-3 w-3 text-amber-500" />
                <span>대표 별칭으로 설정 (기존 대표는 자동 강등)</span>
              </label>
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="비고 (선택) — 등록 출처, 이력 등"
              className="text-xs h-8"
            />
          </div>

          <div>
            <Label className="text-sm font-semibold">
              등록된 별칭 ({aliases?.length ?? 0}개)
            </Label>
            {aliases && aliases.length > 0 ? (
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">대표</TableHead>
                    <TableHead>별칭</TableHead>
                    <TableHead className="text-xs">비고</TableHead>
                    <TableHead className="w-[60px] text-right">삭제</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aliases.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell>
                        {a.isPrimary ? (
                          <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium">{a.alias}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.note || "-"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={() => {
                            if (confirm(`별칭 "${a.alias}" 을 삭제하시겠습니까?`)) {
                              removeMutation.mutate({ id: a.id });
                            }
                          }}
                          disabled={removeMutation.isPending}
                          title="삭제"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">
                등록된 별칭이 없습니다. 위에서 첫 별칭을 추가해보세요.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
