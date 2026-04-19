import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { ProductCombobox } from "@/components/inventory/ProductCombobox";

interface EditSaleDialogProps {
  sale: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditSaleDialog({
  sale,
  open,
  onOpenChange,
  onSuccess,
}: EditSaleDialogProps) {
  const [formData, setFormData] = useState({
    transactionDate: "",
    partnerId: "none",
    productId: null as number | null, // ★ 2026-04-14: h_products_v2 FK (Module 2)
    itemName: "",
    category: "",
    quantity: "",
    unit: "",
    unitPrice: "",
    totalAmount: "",
    taxAmount: "",
    status: "",
    notes: "",
    accountCategoryId: "none",
  });

  // 거래처 목록 조회
  const { data: partners = [] } = trpc.partners.list.useQuery();

  // 계정 과목 목록 조회 (accounting_accounts 테이블)
  const { data: accountsList } = trpc.accountingAccounts.list.useQuery();
  const accountCategories = (accountsList as any)?.items ?? (Array.isArray(accountsList) ? accountsList : []);

  // sale 데이터가 변경되면 폼 초기화
  useEffect(() => {
    if (sale) {
      setFormData({
        transactionDate: sale.transactionDate?.split("T")[0] || "",
        partnerId: sale.partnerId?.toString() || "none",
        productId: sale.productId ? Number(sale.productId) : null,
        itemName: sale.itemName || "",
        category: sale.category || "",
        quantity: sale.quantity?.toString() || "",
        unit: sale.unit || "",
        unitPrice: sale.unitPrice?.toString() || "",
        totalAmount: (sale.amount || sale.totalAmount || "").toString(),
        taxAmount: (sale.taxAmount || "").toString(),
        status: sale.status || "pending",
        notes: sale.notes || sale.notes || "",
        accountCategoryId: sale.accountCategoryId?.toString() || "none",
      });
    }
  }, [sale]);

  // 수정 mutation
  const updateMutation = trpc.haccpIntegration.updateSale.useMutation({
    onSuccess: () => {
      toast({
        title: "수정 완료",
        description: "매출 거래가 수정되었습니다.",
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error: { message: string }) => {
      toast({
        title: "수정 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 유효성 검사
    if (!formData.transactionDate) {
      toast({
        title: "입력 오류",
        description: "거래일자를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.itemName) {
      toast({
        title: "입력 오류",
        description: "제품을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      id: sale.id,
      transactionDate: formData.transactionDate,
      partnerId: formData.partnerId && formData.partnerId !== "none" ? parseInt(formData.partnerId) : undefined,
      productId: formData.productId || undefined, // ★ 제품 FK
      itemName: formData.itemName,
      category: formData.category || undefined,
      quantity: formData.quantity ? parseFloat(formData.quantity) : undefined,
      unit: formData.unit || undefined,
      unitPrice: formData.unitPrice ? parseFloat(formData.unitPrice) : undefined,
      totalAmount: formData.totalAmount ? parseFloat(formData.totalAmount) : undefined,
      taxAmount: formData.taxAmount ? parseFloat(formData.taxAmount) : undefined,
      status: formData.status || undefined,
      notes: formData.notes || undefined,
      accountCategoryId: formData.accountCategoryId && formData.accountCategoryId !== "none" ? parseInt(formData.accountCategoryId) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>매출 거래 수정</DialogTitle>
          <DialogDescription>
            매출 거래 정보를 수정합니다.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* 거래일자 */}
            <div className="space-y-2">
              <Label htmlFor="transactionDate">거래일자 *</Label>
              <Input
                id="transactionDate"
                type="date"
                value={formData.transactionDate}
                onChange={(e) =>
                  setFormData({ ...formData, transactionDate: e.target.value })
                }
                required
              />
            </div>

            {/* 거래처 */}
            <div className="space-y-2">
              <Label htmlFor="partnerId">거래처</Label>
              <Select
                value={formData.partnerId}
                onValueChange={(value) =>
                  setFormData({ ...formData, partnerId: value })
                }
              >
                <SelectTrigger id="partnerId">
                  <SelectValue placeholder="거래처 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안 함</SelectItem>
                  {partners.map((partner: any) => (
                    <SelectItem key={partner.id} value={partner.id.toString()}>
                      {partner.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 제품 (ProductCombobox - 검색/자동완성) */}
            <div className="space-y-2 col-span-2">
              <Label htmlFor="itemName">제품 *</Label>
              <ProductCombobox
                selectedId={formData.productId}
                selectedName={formData.itemName}
                onSelect={(p) =>
                  setFormData({
                    ...formData,
                    productId: p.id,
                    itemName: p.productName,
                    unit: p.unit || formData.unit,
                  })
                }
                onClear={() =>
                  setFormData({
                    ...formData,
                    productId: null,
                    itemName: "",
                  })
                }
                required
                placeholder="제품 검색... (이름/코드)"
              />
            </div>

            {/* 카테고리 */}
            <div className="space-y-2">
              <Label htmlFor="category">카테고리</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="finished_product">완제품</SelectItem>
                  <SelectItem value="semi_finished">반제품</SelectItem>
                  <SelectItem value="other">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 수량 */}
            <div className="space-y-2">
              <Label htmlFor="quantity">수량</Label>
              <Input
                id="quantity"
                type="number"
                step="0.01"
                value={formData.quantity}
                onChange={(e) =>
                  setFormData({ ...formData, quantity: e.target.value })
                }
              />
            </div>

            {/* 단위 */}
            <div className="space-y-2">
              <Label htmlFor="unit">단위</Label>
              <Input
                id="unit"
                value={formData.unit}
                onChange={(e) =>
                  setFormData({ ...formData, unit: e.target.value })
                }
                placeholder="예: kg, 개, 박스"
              />
            </div>

            {/* 단가 */}
            <div className="space-y-2">
              <Label htmlFor="unitPrice">단가</Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.01"
                value={formData.unitPrice}
                onChange={(e) =>
                  setFormData({ ...formData, unitPrice: e.target.value })
                }
              />
            </div>

            {/* 금액 */}
            <div className="space-y-2">
              <Label htmlFor="totalAmount">금액</Label>
              <Input
                id="totalAmount"
                type="number"
                step="0.01"
                value={formData.totalAmount}
                onChange={(e) =>
                  setFormData({ ...formData, totalAmount: e.target.value })
                }
              />
            </div>

            {/* 세금 */}
            <div className="space-y-2">
              <Label htmlFor="taxAmount">세금</Label>
              <Input
                id="taxAmount"
                type="number"
                step="0.01"
                value={formData.taxAmount}
                onChange={(e) =>
                  setFormData({ ...formData, taxAmount: e.target.value })
                }
              />
            </div>

            {/* 계정 과목 */}
            <div className="space-y-2">
              <Label htmlFor="accountCategoryId">계정 과목</Label>
              <Select
                value={formData.accountCategoryId}
                onValueChange={(value) =>
                  setFormData({ ...formData, accountCategoryId: value })
                }
              >
                <SelectTrigger id="accountCategoryId">
                  <SelectValue placeholder="계정 과목 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">선택 안 함</SelectItem>
                  {accountCategories.map((acc: any) => (
                    <SelectItem key={acc.id} value={acc.id.toString()}>
                      {acc.code} - {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 상태 */}
            <div className="space-y-2">
              <Label htmlFor="status">상태</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value })
                }
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="상태 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">대기 중</SelectItem>
                  <SelectItem value="approved">승인됨</SelectItem>
                  <SelectItem value="received">입금 완료</SelectItem>
                  <SelectItem value="cancelled">취소됨</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 비고 */}
            <div className="space-y-2 col-span-2">
              <Label htmlFor="notes">비고</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              취소
            </Button>
            <Button type="submit" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
