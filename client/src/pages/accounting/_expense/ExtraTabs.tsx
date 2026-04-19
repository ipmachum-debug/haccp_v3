/**
 * ExpenseManagement 분해 — 추가 탭 3개 + 반복전표 다이얼로그.
 *  - RecurringTab           반복전표 목록
 *  - RecurringFormDialog    반복전표 생성/수정
 *  - UnpaidTab              미지급 탭
 *  - VatSummaryTab          부가세 집계 탭
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Trash2, Edit, Receipt, CheckCircle, AlertTriangle, TrendingDown,
  Clock, Wallet, Play,
} from "lucide-react";
import { formatLocalDate, todayLocal } from "../../../lib/dateUtils";

import { fmt, PAYMENT_METHODS } from "../_expense/helpers";

export function RecurringTab() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<any>(null);
  const [genDate, setGenDate] = useState(todayLocal());
  const [genId, setGenId] = useState<number | null>(null);

  const listQuery = trpc.expense.recurringList.useQuery();
  const accountsQuery = trpc.expense.getExpenseAccounts.useQuery();

  const createMut = trpc.expense.recurringCreate.useMutation({
    onSuccess: () => { toast({ title: "템플릿 등록 완료" }); setIsFormOpen(false); utils.expense.recurringList.invalidate(); },
    onError: (e: { message: string }) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });
  const updateMut = trpc.expense.recurringUpdate.useMutation({
    onSuccess: () => { toast({ title: "수정 완료" }); setIsFormOpen(false); setEditingTpl(null); utils.expense.recurringList.invalidate(); },
    onError: (e: { message: string }) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });
  const deleteMut = trpc.expense.recurringDelete.useMutation({
    onSuccess: () => { toast({ title: "삭제 완료" }); utils.expense.recurringList.invalidate(); },
    onError: (e: { message: string }) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });
  const generateMut = trpc.expense.recurringGenerate.useMutation({
    onSuccess: (data: any) => {
      toast({ title: "전표 생성 완료", description: `${data.voucherNo} 생성됨` });
      setGenId(null);
      utils.expense.recurringList.invalidate();
      utils.expense.list.invalidate();
    },
    onError: (e: { message: string }) => toast({ title: "생성 실패", description: e.message, variant: "destructive" }),
  });

  const RECURRENCE_LABEL: Record<string, string> = { monthly: "매월", quarterly: "분기", yearly: "매년" };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">반복 발생하는 비용(임대료, 통신비 등)의 템플릿을 관리합니다.</p>
        <Button onClick={() => { setEditingTpl(null); setIsFormOpen(true); }}><Plus className="w-4 h-4 mr-1" /> 템플릿 추가</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>템플릿명</TableHead>
                <TableHead>계정과목</TableHead>
                <TableHead>거래처</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead>주기</TableHead>
                <TableHead>생성일</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>마지막생성</TableHead>
                <TableHead className="w-36">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(listQuery.data || []).length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">등록된 정기비용 템플릿이 없습니다.</TableCell></TableRow>
              ) : (listQuery.data || []).map((tpl: RecurringTemplate) => (
                <TableRow key={tpl.id} className={!tpl.is_active ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{tpl.template_name}</TableCell>
                  <TableCell className="text-xs">{tpl.account_name || tpl.account_code}</TableCell>
                  <TableCell className="text-xs">{tpl.partner_name || "-"}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(tpl.total_amount)}원</TableCell>
                  <TableCell><Badge variant="outline">{RECURRENCE_LABEL[tpl.recurrence_type]} {tpl.recurrence_day}일</Badge></TableCell>
                  <TableCell className="text-xs">{PAYMENT_METHODS[tpl.payment_method]}</TableCell>
                  <TableCell><Badge variant={tpl.is_active ? "default" : "secondary"}>{tpl.is_active ? "활성" : "비활성"}</Badge></TableCell>
                  <TableCell className="text-xs">{tpl.last_generated_date || "-"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" title="전표 생성"
                        onClick={() => setGenId(tpl.id)}>
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { setEditingTpl(tpl); setIsFormOpen(true); }}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500"
                        onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMut.mutate({ id: tpl.id }); }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 전표 생성 다이얼로그 */}
      <Dialog open={!!genId} onOpenChange={(o) => { if (!o) setGenId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>정기비용 전표 생성</DialogTitle><DialogDescription>템플릿을 기반으로 비용전표를 생성합니다.</DialogDescription></DialogHeader>
          <div><Label>비용 날짜</Label><Input type="date" value={genDate} onChange={(e) => setGenDate(e.target.value)} /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenId(null)}>취소</Button>
            <Button disabled={generateMut.isPending} onClick={() => genId && generateMut.mutate({ templateId: genId, expenseDate: genDate })}>
              {generateMut.isPending ? "생성중..." : "전표 생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 템플릿 등록/수정 다이얼로그 */}
      <RecurringFormDialog
        open={isFormOpen}
        onClose={() => { setIsFormOpen(false); setEditingTpl(null); }}
        editing={editingTpl}
        accounts={accountsQuery.data || []}
        onSubmit={(data: any) => {
          if (editingTpl) {
            updateMut.mutate({ ...data, id: editingTpl.id });
          } else {
            createMut.mutate(data);
          }
        }}
        isPending={createMut.isPending || updateMut.isPending}
      />
    </div>
  );
}

export function RecurringFormDialog({
  open, onClose, editing, accounts, onSubmit, isPending,
}: {
  open: boolean;
  onClose: () => void;
  editing: RecurringTemplate | null;
  accounts: ExpenseAccount[];
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(editing?.template_name || "");
  const [accountId, setAccountId] = useState(editing?.account_id?.toString() || "");
  const [partnerName, setPartnerName] = useState(editing?.partner_name || "");
  const [supply, setSupply] = useState(editing ? Number(editing.supply_amount) : 0);
  const [vat, setVat] = useState(editing ? Number(editing.vat_amount) : 0);
  const [payMethod, setPayMethod] = useState(editing?.payment_method || "bank");
  const [proofType, setProofType] = useState(editing?.proof_type || "none");
  const [recType, setRecType] = useState(editing?.recurrence_type || "monthly");
  const [recDay, setRecDay] = useState(editing?.recurrence_day || 1);
  const [memo, setMemo] = useState(editing?.memo || "");
  const [isActive, setIsActive] = useState(editing ? !!editing.is_active : true);

  const total = supply + vat;
  const selectedAcc = accounts.find((a: ExpenseAccount) => a.id?.toString() === accountId);

  const handleSubmit = () => {
    if (!name.trim() || !accountId) return;
    onSubmit({
      templateName: name, partnerId: undefined, partnerName: partnerName || undefined,
      accountId: Number(accountId), accountCode: selectedAcc?.code, accountName: selectedAcc?.name,
      supplyAmount: supply, vatAmount: vat, totalAmount: total,
      paymentMethod: payMethod, proofType: proofType,
      recurrenceType: recType, recurrenceDay: recDay, memo: memo || undefined,
      isActive,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "템플릿 수정" : "정기비용 템플릿 등록"}</DialogTitle><DialogDescription>반복 발생 비용의 기본 정보를 설정합니다.</DialogDescription></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div><Label>템플릿명 *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 월 사무실 임대료" /></div>
          <div><Label>비용계정 *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>{accounts.map((a: ExpenseAccount) => <SelectItem key={a.id} value={a.id.toString()}>{a.code} {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>거래처</Label><Input value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="(선택)" /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>공급가액</Label><Input type="number" value={supply} onChange={(e) => setSupply(Number(e.target.value))} /></div>
            <div><Label>부가세</Label><Input type="number" value={vat} onChange={(e) => setVat(Number(e.target.value))} /></div>
            <div><Label>합계</Label><Input value={fmt(total)} readOnly className="bg-muted" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>결제수단</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">현금</SelectItem><SelectItem value="bank">계좌이체</SelectItem>
                  <SelectItem value="card">카드</SelectItem><SelectItem value="unpaid">미지급</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>증빙유형</Label>
              <Select value={proofType} onValueChange={setProofType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tax_invoice">세금계산서</SelectItem><SelectItem value="card">카드</SelectItem>
                  <SelectItem value="cash_receipt">현금영수증</SelectItem><SelectItem value="simple">간이영수증</SelectItem>
                  <SelectItem value="none">없음</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>반복 주기</Label>
              <Select value={recType} onValueChange={setRecType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">매월</SelectItem><SelectItem value="quarterly">분기</SelectItem><SelectItem value="yearly">매년</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>생성일 (매월 N일)</Label><Input type="number" min={1} max={28} value={recDay} onChange={(e) => setRecDay(Number(e.target.value))} /></div>
          </div>
          <div><Label>메모</Label><Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} /></div>
          {editing && (
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} id="tpl-active" />
              <Label htmlFor="tpl-active">활성 상태</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending || !name.trim() || !accountId}>
            {isPending ? "처리중..." : editing ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ════════════════════════════════════════════
// TAB 3: 미지급금 관리
// ════════════════════════════════════════════
export function UnpaidTab() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const [payDialogVoucher, setPayDialogVoucher] = useState<any>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payDate, setPayDate] = useState(todayLocal());
  const [payMethod, setPayMethod] = useState<"cash" | "bank" | "card">("bank");
  const [payMemo, setPayMemo] = useState("");
  const [historyVoucherId, setHistoryVoucherId] = useState<number | null>(null);

  const unpaidQuery = trpc.expense.unpaidList.useQuery({ onlyUnpaid: true });
  const historyQuery = trpc.expense.unpaidPaymentHistory.useQuery(
    { voucherId: historyVoucherId! },
    { enabled: !!historyVoucherId },
  );

  const payMut = trpc.expense.unpaidPay.useMutation({
    onSuccess: (data: any) => {
      toast({ title: "지급 완료", description: data.isFullyPaid ? "완납 처리되었습니다." : `잔액: ${fmt(data.newBalance)}원` });
      setPayDialogVoucher(null);
      utils.expense.unpaidList.invalidate();
      if (historyVoucherId) utils.expense.unpaidPaymentHistory.invalidate();
    },
    onError: (e: { message: string }) => toast({ title: "지급 실패", description: e.message, variant: "destructive" }),
  });

  // 미지급 합계
  const totalUnpaid = (unpaidQuery.data?.items || []).reduce((s: number, v: UnpaidRow) => s + Number((v as { unpaid_balance?: number | string }).unpaid_balance ?? v.total_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2"><Wallet className="w-4 h-4 text-orange-500" />
            <div><p className="text-xs text-muted-foreground">미지급 건수</p><p className="text-lg font-bold">{unpaidQuery.data?.total || 0}건</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />
            <div><p className="text-xs text-muted-foreground">미지급 합계</p><p className="text-lg font-bold text-red-600">{fmt(totalUnpaid)}원</p></div>
          </div>
        </CardContent></Card>
      </div>

      <Card><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>전표번호</TableHead><TableHead>비용일자</TableHead><TableHead>거래처</TableHead>
            <TableHead className="text-right">전표금액</TableHead><TableHead className="text-right">미지급잔액</TableHead>
            <TableHead className="w-28">작업</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(unpaidQuery.data?.items || []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">미지급 전표가 없습니다.</TableCell></TableRow>
            ) : (unpaidQuery.data?.items || []).map((v: UnpaidRow) => (
              <TableRow key={v.id}>
                <TableCell className="font-mono text-xs">{v.voucher_no}</TableCell>
                <TableCell className="text-xs">{v.expense_date}</TableCell>
                <TableCell className="text-sm">{v.partner_name || "-"}</TableCell>
                <TableCell className="text-right">{fmt(v.total_amount)}원</TableCell>
                <TableCell className="text-right font-bold text-red-600">{fmt(v.unpaid_balance || v.total_amount)}원</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      setPayDialogVoucher(v);
                      setPayAmount(Number(v.unpaid_balance || v.total_amount));
                    }}>
                      <Banknote className="w-3 h-3 mr-1" />지급
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHistoryVoucherId(v.id)}>
                      <Clock className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      {/* 지급 다이얼로그 */}
      <Dialog open={!!payDialogVoucher} onOpenChange={(o) => { if (!o) setPayDialogVoucher(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>미지급금 지급처리</DialogTitle>
            <DialogDescription>{payDialogVoucher?.voucher_no} - 잔액: {fmt(payDialogVoucher?.unpaid_balance || payDialogVoucher?.total_amount)}원</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>지급 날짜</Label><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></div>
            <div><Label>지급 금액</Label><Input type="number" value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} /></div>
            <div><Label>지급 수단</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as typeof payMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">현금</SelectItem><SelectItem value="bank">계좌이체</SelectItem><SelectItem value="card">카드</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>메모</Label><Input value={payMemo} onChange={(e) => setPayMemo(e.target.value)} placeholder="(선택)" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogVoucher(null)}>취소</Button>
            <Button disabled={payMut.isPending || payAmount <= 0} onClick={() => {
              if (payDialogVoucher) payMut.mutate({
                voucherId: payDialogVoucher.id, paymentDate: payDate, paymentAmount: payAmount,
                paymentMethod: payMethod, memo: payMemo || undefined,
              });
            }}>{payMut.isPending ? "처리중..." : "지급 확인"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 지급 이력 다이얼로그 */}
      <Dialog open={!!historyVoucherId} onOpenChange={(o) => { if (!o) setHistoryVoucherId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>지급 이력</DialogTitle><DialogDescription>미지급금 지급 처리 내역입니다.</DialogDescription></DialogHeader>
          <Table>
            <TableHeader><TableRow>
              <TableHead>지급일</TableHead><TableHead className="text-right">지급액</TableHead><TableHead>수단</TableHead><TableHead>처리자</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(historyQuery.data || []).length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground">지급 이력이 없습니다.</TableCell></TableRow>
              ) : (historyQuery.data || []).map((h: { id: number; payment_date?: string; payment_amount?: number | string; payment_method?: string; paid_by_name?: string }) => (
                <TableRow key={h.id}>
                  <TableCell className="text-xs">{h.payment_date ?? ""}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(h.payment_amount)}원</TableCell>
                  <TableCell className="text-xs">{(h.payment_method && PAYMENT_METHODS[h.payment_method]) || h.payment_method || ""}</TableCell>
                  <TableCell className="text-xs">{h.paid_by_name || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 4: 부가세(매입세액) 기간별 집계
// ════════════════════════════════════════════
export function VatSummaryTab() {
  const now = new Date();
  // 기본: 현재 분기
  const quarter = Math.floor(now.getMonth() / 3);
  const qStart = new Date(now.getFullYear(), quarter * 3, 1);
  const qEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0);

  const [startDate, setStartDate] = useState(formatLocalDate(qStart));
  const [endDate, setEndDate] = useState(formatLocalDate(qEnd));

  const vatQuery = trpc.expense.vatSummary.useQuery({ startDate, endDate });
  const data = vatQuery.data;

  const PROOF_LABEL: Record<string, string> = {
    tax_invoice: "세금계산서", card: "카드", cash_receipt: "현금영수증", simple: "간이영수증", none: "없음",
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">시작일</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40 h-8" /></div>
          <div><Label className="text-xs">종료일</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40 h-8" /></div>
          <div className="text-xs text-muted-foreground">* 세금계산서/카드 증빙 = 매입세액 공제 대상</div>
        </div>
      </CardContent></Card>

      {data && (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">확정 전표 수</p>
              <p className="text-xl font-bold">{fmt(data.total?.voucher_count)}건</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">총 공급가액</p>
              <p className="text-xl font-bold">{fmt(data.total?.total_supply)}원</p>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">총 부가세</p>
              <p className="text-xl font-bold text-orange-600">{fmt(data.total?.total_vat)}원</p>
            </CardContent></Card>
            <Card className="border-green-200"><CardContent className="p-3">
              <p className="text-xs text-muted-foreground">공제 가능 매입세액</p>
              <p className="text-xl font-bold text-green-600">{fmt(data.deductibleVat)}원</p>
            </CardContent></Card>
          </div>

          {/* 증빙유형별 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">증빙유형별 부가세 집계</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>증빙유형</TableHead><TableHead className="text-right">건수</TableHead>
                  <TableHead className="text-right">공급가액</TableHead><TableHead className="text-right">부가세</TableHead>
                  <TableHead className="text-right">합계</TableHead><TableHead>공제</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(data.byProofType || []).map((r: { proof_type?: string; cnt?: number; supply_sum?: number | string; vat_sum?: number | string; total_sum?: number | string }) => (
                    <TableRow key={r.proof_type}>
                      <TableCell>{(r.proof_type && PROOF_LABEL[r.proof_type]) || r.proof_type || "-"}</TableCell>
                      <TableCell className="text-right">{fmt(r.cnt)}건</TableCell>
                      <TableCell className="text-right">{fmt(r.supply_sum)}원</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(r.vat_sum)}원</TableCell>
                      <TableCell className="text-right">{fmt(r.total_sum)}원</TableCell>
                      <TableCell>
                        {(r.proof_type === "tax_invoice" || r.proof_type === "card")
                          ? <Badge className="bg-green-500 text-white border-transparent">공제가능</Badge>
                          : <Badge variant="secondary">불공제</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 월별 추이 */}
          {(data.monthly || []).length > 1 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">월별 부가세 추이</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>월</TableHead><TableHead className="text-right">건수</TableHead>
                    <TableHead className="text-right">공급가액</TableHead><TableHead className="text-right">부가세</TableHead>
                    <TableHead className="text-right">합계</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {(data.monthly || []).map((m: { month?: string; cnt?: number; supply_sum?: number | string; vat_sum?: number | string; total_sum?: number | string }) => (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium">{m.month}</TableCell>
                        <TableCell className="text-right">{fmt(m.cnt)}건</TableCell>
                        <TableCell className="text-right">{fmt(m.supply_sum)}원</TableCell>
                        <TableCell className="text-right font-semibold text-orange-600">{fmt(m.vat_sum)}원</TableCell>
                        <TableCell className="text-right">{fmt(m.total_sum)}원</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
