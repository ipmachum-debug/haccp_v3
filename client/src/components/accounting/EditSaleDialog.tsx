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
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ProductCombobox } from "@/components/inventory/ProductCombobox";

// ★ PR-T (2026-05-20): 수정 다이얼로그 빌드 마커 + 사용자가 즉시 productId
//   상태를 확인 가능하도록 가시 진단. "수정 다이얼로그에서 제품명이 매칭되어
//   있지 않다" 사용자 보고에 대한 가시 답변.
const EDIT_SALE_BUILD_TAG = "PR-T-2026-05-20";

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

  // ★ PR-T: itemName 으로 자동 매칭 — productId 가 누락된 경우 사용자가
  //   "이름으로 자동 매칭" 버튼을 누르면 product list 에서 정확 일치 or LIKE 매칭 시도.
  //   서버측 productSalePost 의 자동 매칭과 동일 로직을 클라이언트에서도 노출.
  const { data: matchCandidates } = trpc.product.list.useQuery(
    { limit: 50, search: formData.itemName },
    { enabled: !formData.productId && formData.itemName.length >= 2 },
  );
  const matchCandidatesArr: any[] = (matchCandidates as any)?.items ?? (Array.isArray(matchCandidates) ? matchCandidates : []);
  const bestMatch = matchCandidatesArr.find((p: any) => p.productName === formData.itemName) || matchCandidatesArr[0];

  const handleAutoMatch = () => {
    if (!bestMatch) {
      toast({
        title: "자동 매칭 실패",
        description: `'${formData.itemName}' 와 일치하는 제품이 없습니다. 직접 선택해주세요.`,
        variant: "destructive",
      });
      return;
    }
    setFormData({
      ...formData,
      productId: bestMatch.id,
      itemName: bestMatch.productName,
      unit: bestMatch.unit || formData.unit,
    });
    toast({
      title: "자동 매칭 완료",
      description: `제품 #${bestMatch.id} '${bestMatch.productName}' 로 매칭되었습니다.`,
    });
  };

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
          <DialogTitle className="flex items-center gap-2">
            매출 거래 수정
            {/* ★ PR-T (2026-05-20): 빌드 마커 — 사용자가 콘솔 없이도 새 빌드 수신 여부 확인 */}
            <Badge variant="outline" className="text-[10px] font-mono bg-zinc-50 text-zinc-600 border-zinc-300">
              build {EDIT_SALE_BUILD_TAG}
            </Badge>
            {sale?.id && (
              <Badge variant="outline" className="text-[10px] font-mono bg-blue-50 text-blue-700 border-blue-300">
                매출 #{sale.id}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            매출 거래 정보를 수정합니다.
            {/* ★ PR-T: productId 매칭 상태 가시화 */}
            <span className="block mt-1 text-xs">
              {formData.productId ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />
                  제품 매핑됨 (productId={formData.productId})
                </span>
              ) : formData.itemName ? (
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <AlertCircle className="h-3 w-3" />
                  제품 미매핑 — itemName='{formData.itemName}' 만 저장됨. 승인 시 서버가 이름으로 자동 매칭 시도.
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-rose-700">
                  <AlertCircle className="h-3 w-3" />
                  제품 정보 없음 — 저장 전 제품을 선택해주세요.
                </span>
              )}
            </span>
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
              <div className="flex items-center justify-between">
                <Label htmlFor="itemName">제품 *</Label>
                {/* ★ PR-T: productId 가 없고 itemName 만 있을 때 자동 매칭 단축 버튼 */}
                {!formData.productId && formData.itemName && bestMatch && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={handleAutoMatch}
                    title={`'${bestMatch.productName}' (#${bestMatch.id}) 로 자동 매칭`}
                  >
                    🔗 '{bestMatch.productName}' 로 자동 매칭
                  </Button>
                )}
              </div>
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
              {/* ★ PR-T: 매칭 상태 인라인 힌트 */}
              {!formData.productId && formData.itemName && (
                <p className="text-[11px] text-amber-600 flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    이 매출은 제품 FK 가 비어있습니다. itemName 으로 검색하거나 위
                    '자동 매칭' 버튼을 사용하면 한 번에 연결됩니다.
                    (FK 없이도 승인은 서버가 itemName 으로 자동 매칭하지만,
                    재고 차감/COGS 분개 정확도를 위해 명시 매핑 권장)
                  </span>
                </p>
              )}
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
