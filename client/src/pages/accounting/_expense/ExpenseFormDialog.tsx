/**
 * ExpenseManagement 분해 — 비용전표 등록/수정 다이얼로그.
 * 가장 큰 sub-component (~470 lines) — 원본에서 그대로 추출.
 */
import { useState, useMemo, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { skipToken } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Building2, Paperclip, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AccountCombobox } from "@/components/accounting/AccountCombobox";
import {
  fmt,
  formatFileSize,
  getFileIcon,
  type ExpenseAccount,
  type ExpenseItem,
  type ExpensePartnerRow,
  type ExpenseAttachment,
} from "./helpers";

export interface ExpenseFormDialogProps {
  open: boolean;
  onClose: () => void;
  editingId: number | null;
  accounts: ExpenseAccount[];
}

export function ExpenseFormDialog({
  open,
  onClose,
  editingId,
  accounts: _accounts,
}: ExpenseFormDialogProps) {
  const { toast } = useToast();
  const utils = trpc.useUtils();

  // 수정 시 기존 데이터 로드
  const detailQuery = trpc.expense.getById.useQuery(
    { id: editingId! },
    { enabled: !!editingId },
  );

  const isEdit = !!editingId;
  const existing = detailQuery.data;

  const [expenseDate, setExpenseDate] = useState(existing?.expense_date || new Date().toISOString().slice(0, 10));
  const [partnerName, setPartnerName] = useState(existing?.partner_name || "");
  const [partnerId, setPartnerId] = useState<number | null>(existing?.partner_id || null);
  const [partnerSearch, setPartnerSearch] = useState("");
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(existing?.payment_method || "cash");
  const [proofType, setProofType] = useState(existing?.proof_type || "none");
  const [memo, setMemo] = useState(existing?.memo || "");
  const [items, setItems] = useState<any[]>(
    existing?.items?.map((it: ExpenseItem) => ({
      accountId: it.account_id,
      accountCode: it.account_code,
      accountName: it.account_name,
      supplyAmount: Number(it.supply_amount),
      vatAmount: Number(it.vat_amount),
      totalAmount: Number(it.total_amount),
      description: it.description || "",
    })) || [{ accountId: 0, accountCode: "", accountName: "", supplyAmount: 0, vatAmount: 0, totalAmount: 0, description: "" }],
  );

  // 첨부파일 관련 state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<ExpenseAttachment[]>(existing?.attachments || []);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // 수정 시 데이터 로드되면 state 갱신
  useMemo(() => {
    if (existing && isEdit) {
      setExpenseDate(existing.expense_date || "");
      setPartnerName(existing.partner_name || "");
      setPartnerId(existing.partner_id || null);
      setPaymentMethod(existing.payment_method || "cash");
      setProofType(existing.proof_type || "none");
      setMemo(existing.memo || "");
      if (existing.items?.length > 0) {
        setItems(existing.items.map((it: ExpenseItem) => ({
          accountId: Number(it.account_id),
          accountCode: it.account_code || "",
          accountName: it.account_name || "",
          supplyAmount: Number(it.supply_amount),
          vatAmount: Number(it.vat_amount),
          totalAmount: Number(it.total_amount),
          description: it.description || "",
        })));
      }
      setExistingAttachments(existing.attachments || []);
    }
  }, [existing]);

  // 거래처 검색 쿼리 (통합 partners 테이블) - skipToken 패턴 사용
  const partnerSearchEnabled = showPartnerDropdown && partnerSearch.length >= 1;
  const partnersQuery = trpc.expense.searchPartners.useQuery(
    partnerSearchEnabled ? { search: partnerSearch, limit: 15 } : skipToken,
  );
  const partnerResults = partnersQuery.data ?? [];

  // 파일 업로드 함수
  const uploadFiles = useCallback(async (voucherId: number) => {
    if (pendingFiles.length === 0) return;
    setUploadingFiles(true);
    try {
      const formData = new FormData();
      formData.append("voucherId", String(voucherId));
      pendingFiles.forEach((f) => formData.append("files", f));
      const resp = await fetch("/api/expense/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.error || "업로드 실패");
      }
      setPendingFiles([]);
    } catch (err) {
      const error = err as Error;
      toast({ title: "첨부파일 업로드 실패", description: error.message, variant: "destructive" });
    } finally {
      setUploadingFiles(false);
    }
  }, [pendingFiles, toast]);

  // 기존 첨부파일 삭제
  const deleteAttachment = async (attId: number) => {
    try {
      const resp = await fetch(`/api/expense/attachments/${attId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!resp.ok) throw new Error("삭제 실패");
      setExistingAttachments((prev) => prev.filter((a) => a.id !== attId));
      toast({ title: "첨부파일 삭제 완료" });
    } catch (err) {
      const error = err as Error;
      toast({ title: "삭제 실패", description: error.message, variant: "destructive" });
    }
  };

  const createMut = trpc.expense.create.useMutation({
    onSuccess: async (data: { id: number; voucherNo?: string }) => {
      if (pendingFiles.length > 0) {
        await uploadFiles(data.id);
      }
      toast({ title: "등록 완료", description: `전표 ${data.voucherNo}이(가) 등록되었습니다.` });
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
      onClose();
    },
    onError: (e: { message: string }) => toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
  });

  const updateMut = trpc.expense.update.useMutation({
    onSuccess: async () => {
      if (pendingFiles.length > 0 && editingId) {
        await uploadFiles(editingId);
      }
      toast({ title: "수정 완료" });
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
      onClose();
    },
    onError: (e: { message: string }) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const totals = useMemo(() => {
    const supply = items.reduce((s, i) => s + (i.supplyAmount || 0), 0);
    const vat = items.reduce((s, i) => s + (i.vatAmount || 0), 0);
    return { supply, vat, total: supply + vat };
  }, [items]);

  const updateItem = (idx: number, field: string, val: string | number | null) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      // 합계 자동 계산
      if (field === "supplyAmount" || field === "vatAmount") {
        next[idx].totalAmount = (Number(next[idx].supplyAmount) || 0) + (Number(next[idx].vatAmount) || 0);
      }
      return next;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { accountId: 0, accountCode: "", accountName: "", supplyAmount: 0, vatAmount: 0, totalAmount: 0, description: "" }]);
  };

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = () => {
    if (!expenseDate) return toast({ title: "비용일자를 입력하세요", variant: "destructive" });
    const validItems = items.filter((i) => i.accountId > 0 && i.totalAmount > 0);
    if (validItems.length === 0) return toast({ title: "비용 항목을 입력하세요", variant: "destructive" });

    const payload = {
      expenseDate,
      partnerId: partnerId || undefined,
      partnerName: partnerName || undefined,
      supplyAmount: totals.supply,
      vatAmount: totals.vat,
      totalAmount: totals.total,
      paymentMethod: paymentMethod as "cash" | "bank" | "card" | "unpaid",
      proofType: proofType as "tax_invoice" | "card" | "cash_receipt" | "simple" | "none",
      memo: memo || undefined,
      items: validItems,
    };

    if (isEdit) {
      updateMut.mutate({ id: editingId!, ...payload });
    } else {
      createMut.mutate(payload);
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "비용전표 수정" : "비용전표 등록"}</DialogTitle>
          <DialogDescription>비용(경비) 전표를 {isEdit ? "수정" : "등록"}합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 기본 정보 - 2행 구조 */}
          <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
            <Label className="font-semibold text-sm">기본 정보</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">비용일자 *</Label>
                <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} className="mt-1" />
              </div>
              <div className="relative">
                <Label className="text-xs text-muted-foreground">거래처</Label>
                <div className="relative mt-1">
                  <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="거래처 검색 (사업자번호, 회사명)"
                    value={partnerName}
                    onChange={(e) => {
                      setPartnerName(e.target.value);
                      setPartnerSearch(e.target.value);
                      setPartnerId(null);
                      setShowPartnerDropdown(true);
                    }}
                    onFocus={() => { if (partnerName.length >= 1) { setPartnerSearch(partnerName); setShowPartnerDropdown(true); } }}
                    onBlur={() => setTimeout(() => setShowPartnerDropdown(false), 200)}
                    className="pl-8"
                  />
                </div>
                {/* 거래처 검색 드롭다운 */}
                {showPartnerDropdown && partnerSearch.length >= 1 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-zinc-900 border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {partnersQuery.isFetching && (
                      <div className="px-3 py-2 text-sm text-muted-foreground text-center">검색 중...</div>
                    )}
                    {!partnersQuery.isFetching && partnerResults.length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground text-center">검색 결과 없음</div>
                    )}
                    {partnerResults.map((p: ExpensePartnerRow) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center gap-2 border-b last:border-0"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setPartnerId(p.id);
                          setPartnerName(p.company_name);
                          setShowPartnerDropdown(false);
                        }}
                      >
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{p.company_name}</span>
                          {p.biz_no && <span className="text-xs text-muted-foreground ml-2">{p.biz_no}</span>}
                        </div>
                        <Badge variant="outline" className="text-[10px] flex-shrink-0">
                          {p.partner_type === "supplier" ? "공급" : p.partner_type === "customer" ? "고객" : "외주"}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
                {partnerId && (
                  <p className="text-[10px] text-green-600 mt-0.5">✓ 등록된 거래처 선택됨 (ID: {partnerId})</p>
                )}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">결제수단 *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">현금</SelectItem>
                    <SelectItem value="bank">계좌이체</SelectItem>
                    <SelectItem value="card">카드</SelectItem>
                    <SelectItem value="unpaid">미지급(외상)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">증빙유형 *</Label>
                <Select value={proofType} onValueChange={setProofType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tax_invoice">세금계산서</SelectItem>
                    <SelectItem value="card">카드</SelectItem>
                    <SelectItem value="cash_receipt">현금영수증</SelectItem>
                    <SelectItem value="simple">간이영수증</SelectItem>
                    <SelectItem value="none">없음</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* 비용 항목 */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-semibold text-sm">비용 항목</Label>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" /> 항목 추가</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="border rounded p-3 bg-muted/20">
                  <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                    <div className="md:col-span-2">
                      <Label className="text-xs text-muted-foreground">계정과목 *</Label>
                      <div className="mt-1">
                        <AccountCombobox
                          selectedId={item.accountId || null}
                          selectedCode={item.accountCode}
                          selectedName={item.accountName}
                          onSelect={(acc) => {
                            updateItem(idx, "accountId", acc.id);
                            updateItem(idx, "accountCode", acc.code);
                            updateItem(idx, "accountName", acc.name);
                          }}
                          onClear={() => { updateItem(idx, "accountId", null); updateItem(idx, "accountCode", ""); updateItem(idx, "accountName", ""); }}
                          placeholder="계정 검색..."
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">공급가액</Label>
                      <Input
                        type="number" className="h-9 text-xs mt-1"
                        value={item.supplyAmount || ""}
                        onChange={(e) => updateItem(idx, "supplyAmount", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">부가세</Label>
                      <Input
                        type="number" className="h-9 text-xs mt-1"
                        value={item.vatAmount || ""}
                        onChange={(e) => updateItem(idx, "vatAmount", Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">합계</Label>
                      <Input type="number" className="h-9 text-xs bg-muted mt-1" readOnly value={item.totalAmount || 0} />
                    </div>
                    <div className="flex gap-1 items-end">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">적요</Label>
                        <Input
                          className="h-9 text-xs mt-1" placeholder="내용"
                          value={item.description || ""}
                          onChange={(e) => updateItem(idx, "description", e.target.value)}
                        />
                      </div>
                      {items.length > 1 && (
                        <Button variant="ghost" size="icon" className="h-9 w-9 text-red-500 flex-shrink-0" onClick={() => removeItem(idx)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* 합계 */}
            <div className="grid grid-cols-3 gap-3 bg-primary/5 p-3 rounded-lg font-semibold text-sm">
              <div>공급가액: <span className="text-blue-600">{fmt(totals.supply)}원</span></div>
              <div>부가세: <span className="text-orange-600">{fmt(totals.vat)}원</span></div>
              <div className="text-base">합계: <span className="text-primary">{fmt(totals.total)}원</span></div>
            </div>
          </div>

          {/* 메모 + 첨부파일 - 2열 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border rounded-lg p-4 space-y-2">
              <Label className="font-semibold text-sm">메모</Label>
              <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" rows={3} />
            </div>

            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="font-semibold text-sm flex items-center gap-1">
                  <Paperclip className="w-4 h-4" /> 첨부파일
                </Label>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3 h-3 mr-1" /> 파일 선택
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,.pdf,.xlsx,.xls,.doc,.docx,.txt,.csv"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length + pendingFiles.length + existingAttachments.length > 5) {
                      toast({ title: "최대 5개까지 첨부 가능합니다.", variant: "destructive" });
                      return;
                    }
                    const oversized = files.filter(f => f.size > 10 * 1024 * 1024);
                    if (oversized.length > 0) {
                      toast({ title: "10MB 이하 파일만 업로드 가능합니다.", variant: "destructive" });
                      return;
                    }
                    setPendingFiles((prev) => [...prev, ...files]);
                    e.target.value = "";
                  }}
                />
              </div>

              {/* 기존 첨부파일 (수정 시) */}
              {existingAttachments.length > 0 && (
                <div className="space-y-1">
                  {existingAttachments.map((att: ExpenseAttachment) => (
                    <div key={att.id} className="flex items-center gap-2 p-1.5 bg-muted/30 rounded text-xs">
                      {getFileIcon(att.mime_type)}
                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex-1 truncate">
                        {att.file_name}
                      </a>
                      <span className="text-muted-foreground">{formatFileSize(Number(att.file_size || 0))}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-red-500" onClick={() => deleteAttachment(att.id)}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* 새로 추가된 파일 */}
              {pendingFiles.length > 0 && (
                <div className="space-y-1">
                  {pendingFiles.map((f, idx) => (
                    <div key={idx} className="flex items-center gap-2 p-1.5 bg-blue-50 dark:bg-blue-950/30 rounded text-xs border border-blue-200 dark:border-blue-800">
                      {getFileIcon(f.type)}
                      <span className="flex-1 truncate">{f.name}</span>
                      <span className="text-muted-foreground">{formatFileSize(f.size)}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-red-500" onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {existingAttachments.length === 0 && pendingFiles.length === 0 && (
                <div className="text-xs text-muted-foreground p-2 text-center border border-dashed rounded">
                  이미지, PDF, Excel, Word, CSV (최대 10MB, 5개)
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending || uploadingFiles}>
            {isPending || uploadingFiles ? "처리중..." : isEdit ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
