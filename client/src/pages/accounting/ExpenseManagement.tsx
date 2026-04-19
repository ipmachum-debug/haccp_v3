import { useState, useMemo, useRef, useCallback } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";

// 비용전표 도메인 타입 — trpc proxy 가 깊은 타입을 완전히 전파하지 못해 명시 추출
type ExpenseListRow = RouterOutput["expense"]["list"]["items"][number];
type ExpenseDetail = NonNullable<RouterOutput["expense"]["getById"]>;
type ExpenseItem = ExpenseDetail["items"][number];
type ExpenseJournalLine = ExpenseDetail["journalLines"][number];
type ExpenseAttachment = ExpenseDetail["attachments"][number];
type ExpenseAccount = RouterOutput["expense"]["getExpenseAccounts"][number];
type ExpensePartnerRow = RouterOutput["expense"]["searchPartners"][number];
type RecurringTemplate = RouterOutput["expense"]["recurringList"][number];
type UnpaidRow = RouterOutput["expense"]["list"]["items"][number];
import { skipToken } from "@tanstack/react-query";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus, Search, Download, CheckCircle, XCircle, Trash2, Eye, Edit, FileText,
  Receipt, CreditCard, Building2, Banknote, AlertTriangle, TrendingDown,
  RefreshCw, Clock, Wallet, BarChart3, Play,
  Paperclip, Upload, X, File, Image, FileSpreadsheet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AccountCombobox } from "@/components/accounting/AccountCombobox";
import * as XLSX from "xlsx";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";

// 2026-04-19: helpers / constants / 도메인 타입 _expense/helpers 로 이동
import { fmt, formatFileSize, getFileIcon, PAYMENT_METHODS, PROOF_TYPES, STATUS_MAP } from "./_expense/helpers";
import { ExpenseFormDialog } from "./_expense/ExpenseFormDialog";

// ─── 메인 ─────────────────────────────────
export default function ExpenseManagement() {
  return <DashboardLayout><ExpenseManagementContent /></DashboardLayout>;
}

function ExpenseManagementContent() {
  const [activeTab, setActiveTab] = useState("list");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">비용관리</h1>
          <p className="text-sm text-muted-foreground">경비/비용전표 등록 및 관리</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="list" className="text-xs sm:text-sm"><FileText className="w-3.5 h-3.5 mr-1" />비용전표</TabsTrigger>
          <TabsTrigger value="recurring" className="text-xs sm:text-sm"><RefreshCw className="w-3.5 h-3.5 mr-1" />정기비용</TabsTrigger>
          <TabsTrigger value="unpaid" className="text-xs sm:text-sm"><Wallet className="w-3.5 h-3.5 mr-1" />미지급관리</TabsTrigger>
          <TabsTrigger value="vat" className="text-xs sm:text-sm"><BarChart3 className="w-3.5 h-3.5 mr-1" />부가세집계</TabsTrigger>
        </TabsList>

        <TabsContent value="list"><ExpenseListTab /></TabsContent>
        <TabsContent value="recurring"><RecurringTab /></TabsContent>
        <TabsContent value="unpaid"><UnpaidTab /></TabsContent>
        <TabsContent value="vat"><VatSummaryTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ════════════════════════════════════════════
// TAB 1: 비용전표 목록 (기존 코드)
// ════════════════════════════════════════════
function ExpenseListTab() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const utils = trpc.useUtils();

  // ─── 목록 조회 ──────────────────────
  const listQuery = trpc.expense.list.useQuery({
    page,
    limit: 30,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    status: statusFilter !== "all" ? statusFilter as "draft" | "posted" | "canceled" : undefined,
    paymentMethod: paymentFilter !== "all" ? paymentFilter as "cash" | "bank" | "card" | "unpaid" : undefined,
    search: searchText || undefined,
  });

  // 요약 통계
  const summaryQuery = trpc.expense.getSummary.useQuery({
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  // 비용 계정과목 목록
  const accountsQuery = trpc.expense.getExpenseAccounts.useQuery();

  // 상세 조회
  const detailQuery = trpc.expense.getById.useQuery(
    { id: viewId! },
    { enabled: !!viewId },
  );

  // ─── 뮤테이션 ──────────────────────
  const postMut = trpc.expense.post.useMutation({
    onSuccess: () => {
      toast({ title: "확정 완료", description: "비용전표가 확정되었습니다." });
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
    },
    onError: (e: { message: string }) => toast({ title: "확정 실패", description: e.message, variant: "destructive" }),
  });

  const cancelMut = trpc.expense.cancel.useMutation({
    onSuccess: () => {
      toast({ title: "취소 완료", description: "비용전표가 취소되었습니다." });
      setCancelId(null);
      setCancelReason("");
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
    },
    onError: (e: { message: string }) => toast({ title: "취소 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMut = trpc.expense.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
    },
    onError: (e: { message: string }) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  // ─── 엑셀 다운로드 ──────────────────
  const handleExcelDownload = () => {
    const items = listQuery.data?.items || [];
    if (items.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(
      items.map((v: ExpenseListRow) => ({
        전표번호: v.voucher_no,
        비용일자: v.expense_date,
        거래처: v.partner_name || "",
        공급가액: Number(v.supply_amount),
        부가세: Number(v.vat_amount),
        합계: Number(v.total_amount),
        결제수단: PAYMENT_METHODS[v.payment_method] || v.payment_method,
        증빙유형: PROOF_TYPES[v.proof_type] || v.proof_type,
        상태: STATUS_MAP[v.status]?.label || v.status,
        메모: v.memo || "",
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "비용관리");
    XLSX.writeFile(wb, `비용관리_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const summary = summaryQuery.data;
  const list = listQuery.data;

  return (
    <div className="space-y-4">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-end">
        <Button onClick={() => { setEditingId(null); setIsFormOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> 비용 등록
        </Button>
      </div>

      {/* ── 요약 카드 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">전체 건수</p>
                <p className="text-lg font-bold">{fmt(summary?.total_count)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">총 비용</p>
                <p className="text-lg font-bold">{fmt(summary?.total_amount)}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">확정 금액</p>
                <p className="text-lg font-bold">{fmt(summary?.posted_amount)}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">부가세(매입)</p>
                <p className="text-lg font-bold">{fmt(summary?.total_vat)}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 필터 ── */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-36 h-8" />
            </div>
            <div>
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-36 h-8" />
            </div>
            <div>
              <Label className="text-xs">상태</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="draft">임시저장</SelectItem>
                  <SelectItem value="posted">확정</SelectItem>
                  <SelectItem value="canceled">취소</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">결제수단</Label>
              <Select value={paymentFilter} onValueChange={setPaymentFilter}>
                <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  <SelectItem value="cash">현금</SelectItem>
                  <SelectItem value="bank">계좌이체</SelectItem>
                  <SelectItem value="card">카드</SelectItem>
                  <SelectItem value="unpaid">미지급</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <Label className="text-xs">검색</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="전표번호, 거래처, 메모"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-7 h-8"
                />
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExcelDownload}>
              <Download className="w-3.5 h-3.5 mr-1" /> 엑셀
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 테이블 ── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">전표번호</TableHead>
                  <TableHead className="w-24">비용일자</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead className="text-right">공급가액</TableHead>
                  <TableHead className="text-right">부가세</TableHead>
                  <TableHead className="text-right">합계</TableHead>
                  <TableHead className="w-20">결제수단</TableHead>
                  <TableHead className="w-24">증빙</TableHead>
                  <TableHead className="w-20">상태</TableHead>
                  <TableHead className="w-28">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {listQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">로딩 중...</TableCell>
                  </TableRow>
                ) : (list?.items || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      등록된 비용전표가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  (list?.items || []).map((v: ExpenseListRow) => (
                    <TableRow key={v.id} className={v.status === "canceled" ? "opacity-50" : ""}>
                      <TableCell className="font-mono text-xs">{v.voucher_no}</TableCell>
                      <TableCell className="text-xs">{v.expense_date}</TableCell>
                      <TableCell className="text-sm">{v.partner_name || "-"}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(v.supply_amount)}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(v.vat_amount)}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(v.total_amount)}</TableCell>
                      <TableCell className="text-xs">{PAYMENT_METHODS[v.payment_method]}</TableCell>
                      <TableCell className="text-xs">{PROOF_TYPES[v.proof_type]}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_MAP[v.status]?.variant || "secondary"}>
                          {STATUS_MAP[v.status]?.label || v.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewId(v.id)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {v.status === "draft" && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(v.id); setIsFormOpen(true); }}>
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600" onClick={() => postMut.mutate({ id: v.id })}>
                                <CheckCircle className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMut.mutate({ id: v.id }); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          {v.status === "posted" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500" onClick={() => setCancelId(v.id)}>
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {/* 페이지네이션 */}
          {list && list.total > list.limit && (
            <div className="flex items-center justify-center gap-2 p-3 border-t">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</Button>
              <span className="text-sm">{page} / {Math.ceil(list.total / list.limit)}</span>
              <Button variant="outline" size="sm" disabled={page >= Math.ceil(list.total / list.limit)} onClick={() => setPage(page + 1)}>다음</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 등록/수정 다이얼로그 ── */}
      {isFormOpen && (
        <ExpenseFormDialog
          open={isFormOpen}
          onClose={() => { setIsFormOpen(false); setEditingId(null); }}
          editingId={editingId}
          accounts={accountsQuery.data || []}
        />
      )}

      {/* ── 상세 보기 다이얼로그 ── */}
      <Dialog open={!!viewId} onOpenChange={(o) => { if (!o) setViewId(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>비용전표 상세</DialogTitle>
            <DialogDescription>전표 상세 정보를 확인합니다.</DialogDescription>
          </DialogHeader>
          {detailQuery.data ? (
            <ExpenseDetailView data={detailQuery.data} />
          ) : (
            <p className="text-center py-4">로딩 중...</p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 취소 다이얼로그 ── */}
      <Dialog open={!!cancelId} onOpenChange={(o) => { if (!o) { setCancelId(null); setCancelReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비용전표 취소</DialogTitle>
            <DialogDescription>확정된 전표를 취소합니다. 분개가 삭제됩니다.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>취소 사유</Label>
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="취소 사유를 입력해주세요" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCancelId(null); setCancelReason(""); }}>닫기</Button>
            <Button variant="destructive" disabled={!cancelReason.trim() || cancelMut.isPending}
              onClick={() => cancelId && cancelMut.mutate({ id: cancelId, reason: cancelReason })}>
              {cancelMut.isPending ? "처리중..." : "취소 확정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════
// 상세 보기 컴포넌트
// ════════════════════════════════════
function ExpenseDetailView({ data }: { data: ExpenseDetail }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div><span className="text-muted-foreground">전표번호:</span> <strong>{data.voucher_no}</strong></div>
        <div><span className="text-muted-foreground">비용일자:</span> <strong>{data.expense_date}</strong></div>
        <div><span className="text-muted-foreground">거래처:</span> {data.partner_name || "-"}</div>
        <div><span className="text-muted-foreground">상태:</span> <Badge variant={STATUS_MAP[data.status]?.variant}>{STATUS_MAP[data.status]?.label}</Badge></div>
        <div><span className="text-muted-foreground">결제수단:</span> {PAYMENT_METHODS[data.payment_method]}</div>
        <div><span className="text-muted-foreground">증빙유형:</span> {PROOF_TYPES[data.proof_type]}</div>
      </div>
      <div className="grid grid-cols-3 gap-3 bg-muted/50 p-3 rounded">
        <div><span className="text-muted-foreground">공급가액</span><p className="font-bold">{fmt(data.supply_amount)}원</p></div>
        <div><span className="text-muted-foreground">부가세</span><p className="font-bold">{fmt(data.vat_amount)}원</p></div>
        <div><span className="text-muted-foreground">합계</span><p className="font-bold text-lg">{fmt(data.total_amount)}원</p></div>
      </div>
      {data.memo && <div><span className="text-muted-foreground">메모:</span> {data.memo}</div>}

      {/* 항목 */}
      {data.items?.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1">비용 항목</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>계정과목</TableHead>
                <TableHead className="text-right">공급가액</TableHead>
                <TableHead className="text-right">부가세</TableHead>
                <TableHead className="text-right">합계</TableHead>
                <TableHead>적요</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((item: ExpenseItem, i: number) => (
                <TableRow key={i}>
                  <TableCell>{item.account_name || item.account_code}</TableCell>
                  <TableCell className="text-right">{fmt(item.supply_amount)}</TableCell>
                  <TableCell className="text-right">{fmt(item.vat_amount)}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(item.total_amount)}</TableCell>
                  <TableCell className="text-xs">{item.description || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 분개 */}
      {data.journalLines?.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1">분개 내역</h4>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>계정과목</TableHead>
                <TableHead className="text-right">차변</TableHead>
                <TableHead className="text-right">대변</TableHead>
                <TableHead>적요</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.journalLines.map((line: ExpenseJournalLine, i: number) => (
                <TableRow key={i}>
                  <TableCell>{line.account_name || line.account_code}</TableCell>
                  <TableCell className="text-right text-blue-600">{Number(line.debit_amount) > 0 ? fmt(line.debit_amount) : ""}</TableCell>
                  <TableCell className="text-right text-red-600">{Number(line.credit_amount) > 0 ? fmt(line.credit_amount) : ""}</TableCell>
                  <TableCell className="text-xs">{line.description || ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 첨부파일 */}
      {data.attachments?.length > 0 && (
        <div>
          <h4 className="font-semibold mb-1 flex items-center gap-1">
            <Paperclip className="w-4 h-4" /> 첨부파일 ({data.attachments.length})
          </h4>
          <div className="space-y-1">
            {data.attachments.map((att: ExpenseAttachment) => (
              <div key={att.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded text-xs">
                {getFileIcon(att.mime_type)}
                <a
                  href={att.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex-1 truncate"
                >
                  {att.file_name}
                </a>
                <span className="text-muted-foreground">{formatFileSize(Number(att.file_size || 0))}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.created_by_name && <div className="text-xs text-muted-foreground">작성자: {data.created_by_name}</div>}
      {data.posted_by_name && <div className="text-xs text-muted-foreground">확정자: {data.posted_by_name}</div>}
      {data.cancel_reason && <div className="text-xs text-red-500">취소사유: {data.cancel_reason}</div>}
    </div>
  );
}


// ════════════════════════════════════════════
// TAB 2: 정기비용 템플릿
// ════════════════════════════════════════════
function RecurringTab() {
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

function RecurringFormDialog({
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
function UnpaidTab() {
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
function VatSummaryTab() {
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
