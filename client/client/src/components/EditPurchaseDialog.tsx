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

interface EditPurchaseDialogProps {
  purchase: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditPurchaseDialog({
  purchase,
  open,
  onOpenChange,
  onSuccess,
}: EditPurchaseDialogProps) {
  const [formData, setFormData] = useState({
    transactionDate: "",
    partnerId: "none",
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

  // 계정 과목 목록 조회
  const { data: accountCategories = [] } = trpc.accountingAccountCategories.list.useQuery();

  // purchase 데이터가 변경되면 폼 초기화
  useEffect(() => {
    if (purchase) {
      setFormData({
        transactionDate: purchase.transactionDate?.split("T")[0] || "",
        partnerId: purchase.partnerId?.toString() || "none",
        itemName: purchase.itemName || "",
        category: purchase.category || "",
        quantity: purchase.quantity?.toString() || "",
        unit: purchase.unit || "",
        unitPrice: purchase.unitPrice?.toString() || "",
        totalAmount: (purchase.amount || purchase.totalAmount || "").toString(),
        taxAmount: (purchase.taxAmount || "").toString(),
        status: purchase.status || "pending",
        notes: purchase.notes || purchase.notes || "",
        accountCategoryId: purchase.accountCategoryId?.toString() || "none",
      });
    }
  }, [purchase]);

  // 수정 mutation
  const updateMutation = trpc.haccpIntegration.updatePurchase.useMutation({
    onSuccess: () => {
      toast({
        title: "수정 완료",
        description: "매입 거래가 수정되었습니다.",
      });
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
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
        description: "품목명을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    updateMutation.mutate({
      id: purchase.id,
      transactionDate: formData.transactionDate,
      partnerId: formData.partnerId && formData.partnerId !== "none" ? parseInt(formData.partnerId) : undefined,
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
          <DialogTitle>매입 거래 수정</DialogTitle>
          <DialogDescription>
            매입 거래 정보를 수정합니다.
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

            {/* 품목명 */}
            <div className="space-y-2">
              <Label htmlFor="itemName">품목명 *</Label>
              <Input
                id="itemName"
                value={formData.itemName}
                onChange={(e) =>
                  setFormData({ ...formData, itemName: e.target.value })
                }
                required
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
                  <SelectItem value="raw_material">원재료</SelectItem>
                  <SelectItem value="sub_material">부재료</SelectItem>
                  <SelectItem value="packaging">포장재</SelectItem>
                  <SelectItem value="consumable">소모품</SelectItem>
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
                  {accountCategories.map((category: any) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
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
                  <SelectItem value="paid">지급 완료</SelectItem>
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
