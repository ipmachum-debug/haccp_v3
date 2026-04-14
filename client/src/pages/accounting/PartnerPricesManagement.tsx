/**
 * 거래처별 단가표 관리 페이지 — Phase B (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 거래처/원재료·제품별 단가 CRUD + 유효기간 관리
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  DollarSign,
  Plus,
  Search,
  Trash2,
  Edit,
  ToggleLeft,
  ToggleRight,
  Package,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { MaterialCombobox } from "@/components/inventory/MaterialCombobox";
import { ProductCombobox } from "@/components/inventory/ProductCombobox";

const TARGET_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  material: { label: "원재료", color: "bg-blue-100 text-blue-700" },
  product: { label: "제품", color: "bg-purple-100 text-purple-700" },
};

export default function PartnerPricesManagement() {
  return (
    <DashboardLayout>
      <PartnerPricesContent />
    </DashboardLayout>
  );
}

function PartnerPricesContent() {
  const [partnerFilter, setPartnerFilter] = useState<string>("all");
  const [targetFilter, setTargetFilter] = useState<string>("all");
  const [activeOnly, setActiveOnly] = useState<boolean>(true);

  // 등록 Dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    partnerId: "",
    targetType: "material" as "material" | "product",
    materialId: null as number | null,
    productId: null as number | null,
    itemName: "",
    itemCode: "",
    unitPrice: 0,
    discountRate: 0,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    effectiveTo: "",
    notes: "",
  });

  const utils = trpc.useUtils();

  // 데이터 조회
  const { data: prices = [], isLoading } = trpc.partnerPrice.list.useQuery({
    partnerId: partnerFilter !== "all" ? parseInt(partnerFilter) : undefined,
    targetType: targetFilter !== "all" ? (targetFilter as any) : undefined,
    activeOnly,
  });

  const { data: partnersData = [] } = trpc.partners.list.useQuery();
  const partnersArr: any[] = Array.isArray(partnersData)
    ? partnersData
    : ((partnersData as any)?.items ?? []);

  // Mutations
  const createMutation = trpc.partnerPrice.create.useMutation({
    onSuccess: () => {
      toast({ title: "단가 등록 완료" });
      utils.partnerPrice.list.invalidate();
      closeDialog();
    },
    onError: (e: any) => toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
  });

  const updateMutation = trpc.partnerPrice.update.useMutation({
    onSuccess: () => {
      toast({ title: "단가 수정 완료" });
      utils.partnerPrice.list.invalidate();
      closeDialog();
    },
    onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = trpc.partnerPrice.delete.useMutation({
    onSuccess: () => {
      toast({ title: "단가 삭제 완료" });
      utils.partnerPrice.list.invalidate();
    },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  // 통계
  const stats = useMemo(() => {
    const total = prices.length;
    const materials = prices.filter((p: any) => p.targetType === "material").length;
    const products = prices.filter((p: any) => p.targetType === "product").length;
    const uniquePartners = new Set(prices.map((p: any) => p.partnerId)).size;
    return { total, materials, products, uniquePartners };
  }, [prices]);

  const openNewDialog = () => {
    setEditingId(null);
    setFormData({
      partnerId: partnerFilter !== "all" ? partnerFilter : "",
      targetType: "material",
      materialId: null,
      productId: null,
      itemName: "",
      itemCode: "",
      unitPrice: 0,
      discountRate: 0,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: "",
      notes: "",
    });
    setDialogOpen(true);
  };

  const openEditDialog = (row: any) => {
    setEditingId(row.id);
    setFormData({
      partnerId: String(row.partnerId),
      targetType: row.targetType,
      materialId: row.materialId,
      productId: row.productId,
      itemName: row.itemName,
      itemCode: row.itemCode || "",
      unitPrice: Number(row.unitPrice),
      discountRate: Number(row.discountRate || 0),
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo || "",
      notes: row.notes || "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };

  const handleSave = () => {
    if (!formData.partnerId) {
      toast({ title: "거래처를 선택하세요", variant: "destructive" });
      return;
    }
    if (formData.targetType === "material" && !formData.materialId) {
      toast({ title: "원재료를 선택하세요", variant: "destructive" });
      return;
    }
    if (formData.targetType === "product" && !formData.productId) {
      toast({ title: "제품을 선택하세요", variant: "destructive" });
      return;
    }
    if (formData.unitPrice <= 0) {
      toast({ title: "단가는 양수여야 합니다", variant: "destructive" });
      return;
    }

    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        unitPrice: formData.unitPrice,
        discountRate: formData.discountRate,
        effectiveFrom: formData.effectiveFrom,
        effectiveTo: formData.effectiveTo || null,
        notes: formData.notes || undefined,
      });
    } else {
      createMutation.mutate({
        partnerId: parseInt(formData.partnerId),
        targetType: formData.targetType,
        materialId: formData.materialId || undefined,
        productId: formData.productId || undefined,
        itemName: formData.itemName,
        itemCode: formData.itemCode || undefined,
        unitPrice: formData.unitPrice,
        discountRate: formData.discountRate || undefined,
        effectiveFrom: formData.effectiveFrom,
        effectiveTo: formData.effectiveTo || undefined,
        notes: formData.notes || undefined,
      });
    }
  };

  const handleDelete = (row: any) => {
    if (confirm(`${row.partnerName} · ${row.itemName} 단가를 삭제하시겠습니까?`)) {
      deleteMutation.mutate({ id: row.id });
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            거래처별 단가표
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            공급업체/고객별 원재료·제품 단가를 관리합니다. 발주/매입/매출 등록 시 자동 적용됩니다.
          </p>
        </div>
        <Button
          onClick={openNewDialog}
          className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
        >
          <Plus className="h-4 w-4 mr-1" /> 단가 등록
        </Button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">전체 단가</p>
            <p className="text-2xl font-bold">{stats.total}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">원재료</p>
            <p className="text-2xl font-bold text-blue-600">{stats.materials}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">제품</p>
            <p className="text-2xl font-bold text-purple-600">{stats.products}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground">등록된 거래처</p>
            <p className="text-2xl font-bold text-green-600">{stats.uniquePartners}개</p>
          </CardContent>
        </Card>
      </div>

      {/* 필터 */}
      <Card>
        <CardContent className="py-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">거래처</Label>
              <Select value={partnerFilter} onValueChange={setPartnerFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  <SelectItem value="all">전체 거래처</SelectItem>
                  {partnersArr.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.companyName}
                      {p.partnerType === "supplier" && " (공급)"}
                      {p.partnerType === "customer" && " (고객)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">대상</Label>
              <Select value={targetFilter} onValueChange={setTargetFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="material">원재료만</SelectItem>
                  <SelectItem value="product">제품만</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">활성 상태</Label>
              <Select value={activeOnly ? "active" : "all"} onValueChange={(v) => setActiveOnly(v === "active")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">활성만</SelectItem>
                  <SelectItem value="all">전체 (비활성 포함)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">단가 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>거래처</TableHead>
                <TableHead>대상</TableHead>
                <TableHead>품목</TableHead>
                <TableHead className="text-right">단가</TableHead>
                <TableHead className="text-right">할인</TableHead>
                <TableHead>유효 시작</TableHead>
                <TableHead>유효 종료</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-center">액션</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </TableCell>
                </TableRow>
              ) : prices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    등록된 단가가 없습니다. 우측 상단 "단가 등록" 으로 시작하세요.
                  </TableCell>
                </TableRow>
              ) : (
                prices.map((row: any) => {
                  const tt = TARGET_TYPE_LABELS[row.targetType] || { label: row.targetType, color: "" };
                  return (
                    <TableRow key={row.id} className="group">
                      <TableCell className="text-sm">{row.partnerName || `#${row.partnerId}`}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={tt.color}>
                          {tt.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{row.itemName}</div>
                        {row.itemCode && (
                          <div className="text-[10px] text-muted-foreground">{row.itemCode}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {Number(row.unitPrice).toLocaleString()}
                        <span className="text-[10px] text-muted-foreground ml-1">{row.currency}</span>
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {Number(row.discountRate) > 0 ? `${row.discountRate}%` : "-"}
                      </TableCell>
                      <TableCell className="text-xs">{row.effectiveFrom}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.effectiveTo || "무제한"}
                      </TableCell>
                      <TableCell>
                        {row.isActive === 1 ? (
                          <Badge className="bg-green-600 text-white border-transparent">활성</Badge>
                        ) : (
                          <Badge variant="outline">비활성</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(row)}
                            title="수정"
                            className="h-7 w-7 p-0"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(row)}
                            title="삭제"
                            className="h-7 w-7 p-0 text-red-500 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 등록/수정 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "단가 수정" : "단가 등록"}</DialogTitle>
            <DialogDescription>
              거래처와 품목을 선택하고 유효 기간과 함께 단가를 입력하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* 거래처 */}
            <div>
              <Label className="text-xs">거래처 *</Label>
              <Select
                value={formData.partnerId}
                onValueChange={(v) => setFormData({ ...formData, partnerId: v })}
                disabled={!!editingId}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="거래처 선택" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {partnersArr.map((p: any) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.companyName}
                      {p.partnerType === "supplier" && " (공급)"}
                      {p.partnerType === "customer" && " (고객)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 대상 타입 + 품목 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Label className="text-xs">대상 타입 *</Label>
                <Select
                  value={formData.targetType}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      targetType: v as any,
                      materialId: null,
                      productId: null,
                      itemName: "",
                      itemCode: "",
                    })
                  }
                  disabled={!!editingId}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="material">원재료</SelectItem>
                    <SelectItem value="product">제품</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">
                  {formData.targetType === "material" ? "원재료" : "제품"} *
                </Label>
                {editingId ? (
                  <div className="h-10 px-3 flex items-center border rounded-lg bg-muted/30 text-sm">
                    <Package className="h-4 w-4 mr-2 text-muted-foreground" />
                    {formData.itemName}
                  </div>
                ) : formData.targetType === "material" ? (
                  <MaterialCombobox
                    selectedId={formData.materialId}
                    selectedName={formData.itemName}
                    onSelect={(m) =>
                      setFormData({
                        ...formData,
                        materialId: m.id,
                        productId: null,
                        itemName: m.materialName,
                        itemCode: m.materialCode || "",
                      })
                    }
                    onClear={() =>
                      setFormData({
                        ...formData,
                        materialId: null,
                        itemName: "",
                        itemCode: "",
                      })
                    }
                  />
                ) : (
                  <ProductCombobox
                    selectedId={formData.productId}
                    selectedName={formData.itemName}
                    onSelect={(p) =>
                      setFormData({
                        ...formData,
                        productId: p.id,
                        materialId: null,
                        itemName: p.productName,
                        itemCode: p.productCode || "",
                      })
                    }
                    onClear={() =>
                      setFormData({
                        ...formData,
                        productId: null,
                        itemName: "",
                        itemCode: "",
                      })
                    }
                  />
                )}
              </div>
            </div>

            {/* 단가 + 할인율 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">단가 *</Label>
                <Input
                  type="number"
                  value={formData.unitPrice || ""}
                  onChange={(e) => setFormData({ ...formData, unitPrice: parseFloat(e.target.value) || 0 })}
                  className="h-9 text-right"
                />
              </div>
              <div>
                <Label className="text-xs">할인율 (%)</Label>
                <Input
                  type="number"
                  value={formData.discountRate || ""}
                  onChange={(e) => setFormData({ ...formData, discountRate: parseFloat(e.target.value) || 0 })}
                  min={0}
                  max={100}
                  step={0.01}
                  className="h-9 text-right"
                />
              </div>
            </div>

            {/* 유효 기간 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">유효 시작일 *</Label>
                <Input
                  type="date"
                  value={formData.effectiveFrom}
                  onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">유효 종료일 (선택)</Label>
                <Input
                  type="date"
                  value={formData.effectiveTo}
                  onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                  className="h-9"
                  placeholder="비워두면 무제한"
                />
              </div>
            </div>

            {/* 메모 */}
            <div>
              <Label className="text-xs">메모</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="예: 2026년 계약 단가"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              취소
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
            >
              {editingId ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
