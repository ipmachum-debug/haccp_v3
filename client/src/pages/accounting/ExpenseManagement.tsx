import { useState, useMemo, useRef, useCallback } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
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
import * as XLSX from "xlsx";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";

// ─── 상수 ─────────────────────────────────
const PAYMENT_METHODS: Record<string, string> = {
  cash: "현금", bank: "계좌이체", card: "카드", unpaid: "미지급(외상)",
};
const PROOF_TYPES: Record<string, string> = {
  tax_invoice: "세금계산서", card: "카드", cash_receipt: "현금영수증",
  simple: "간이영수증", none: "없음",
};
const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "임시저장", variant: "secondary" },
  posted: { label: "확정", variant: "default" },
  canceled: { label: "취소", variant: "destructive" },
};

function fmt(n: any) {
  return Number(n || 0).toLocaleString("ko-KR");
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(mimeType: string) {
  if (mimeType?.startsWith("image/")) return <Image className="w-4 h-4 text-green-500" />;
  if (mimeType?.includes("pdf")) return <FileText className="w-4 h-4 text-red-500" />;
  if (mimeType?.includes("excel") || mimeType?.includes("spreadsheet") || mimeType?.includes("csv")) return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  return <File className="w-4 h-4 text-blue-500" />;
}

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
    status: statusFilter !== "all" ? statusFilter as any : undefined,
    paymentMethod: paymentFilter !== "all" ? paymentFilter as any : undefined,
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
    onError: (e: any) => toast({ title: "확정 실패", description: e.message, variant: "destructive" }),
  });

  const cancelMut = trpc.expense.cancel.useMutation({
    onSuccess: () => {
      toast({ title: "취소 완료", description: "비용전표가 취소되었습니다." });
      setCancelId(null);
      setCancelReason("");
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
    },
    onError: (e: any) => toast({ title: "취소 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMut = trpc.expense.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
    },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  // ─── 엑셀 다운로드 ──────────────────
  const handleExcelDownload = () => {
    const items = listQuery.data?.items || [];
    if (items.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(
      items.map((v: any) => ({
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
                  (list?.items || []).map((v: any) => (
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
function ExpenseDetailView({ data }: { data: any }) {
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
              {data.items.map((item: any, i: number) => (
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
              {data.journalLines.map((line: any, i: number) => (
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
            {data.attachments.map((att: any) => (
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

// ════════════════════════════════════
// 등록/수정 다이얼로그
// ════════════════════════════════════
function ExpenseFormDialog({
  open, onClose, editingId, accounts,
}: {
  open: boolean;
  onClose: () => void;
  editingId: number | null;
  accounts: any[];
}) {
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
    existing?.items?.map((it: any) => ({
      accountId: it.account_id,
      accountCode: it.account_code,
      accountName: it.account_name,
      supplyAmount: Number(it.supply_amount),
      vatAmount: Number(it.vat_amount),
      totalAmount: Number(it.total_amount),
      description: it.description || "",
    })) || [{ accountId: 0, accountCode: "", accountName: "", supplyAmount: 0, vatAmount: 0, totalAmount: 0, description: "" }],
  );

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
        setItems(existing.items.map((it: any) => ({
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

  // 첨부파일 관련 state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<any[]>(existing?.attachments || []);
  const [uploadingFiles, setUploadingFiles] = useState(false);

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
    } catch (err: any) {
      toast({ title: "첨부파일 업로드 실패", description: err.message, variant: "destructive" });
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
    } catch (err: any) {
      toast({ title: "삭제 실패", description: err.message, variant: "destructive" });
    }
  };

  const createMut = trpc.expense.create.useMutation({
    onSuccess: async (data: any) => {
      if (pendingFiles.length > 0) {
        await uploadFiles(data.id);
      }
      toast({ title: "등록 완료", description: `전표 ${data.voucherNo}이(가) 등록되었습니다.` });
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
      onClose();
    },
    onError: (e: any) => toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
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
    onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const totals = useMemo(() => {
    const supply = items.reduce((s, i) => s + (i.supplyAmount || 0), 0);
    const vat = items.reduce((s, i) => s + (i.vatAmount || 0), 0);
    return { supply, vat, total: supply + vat };
  }, [items]);

  const updateItem = (idx: number, field: string, val: any) => {
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
    // 검증
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
      paymentMethod: paymentMethod as any,
      proofType: proofType as any,
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
                    {partnerResults.map((p: any) => (
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
                      <Select
                        value={String(item.accountId || "")}
                        onValueChange={(v) => {
                          const acc = accounts.find((a: any) => String(a.id) === v);
                          updateItem(idx, "accountId", Number(v));
                          if (acc) {
                            updateItem(idx, "accountCode", acc.code);
                            updateItem(idx, "accountName", acc.name);
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 text-xs mt-1"><SelectValue placeholder="계정과목 선택" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map((acc: any) => (
                            <SelectItem key={acc.id} value={String(acc.id)}>
                              [{acc.code}] {acc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  {existingAttachments.map((att: any) => (
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
    onError: (e: any) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });
  const updateMut = trpc.expense.recurringUpdate.useMutation({
    onSuccess: () => { toast({ title: "수정 완료" }); setIsFormOpen(false); setEditingTpl(null); utils.expense.recurringList.invalidate(); },
    onError: (e: any) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });
  const deleteMut = trpc.expense.recurringDelete.useMutation({
    onSuccess: () => { toast({ title: "삭제 완료" }); utils.expense.recurringList.invalidate(); },
    onError: (e: any) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });
  const generateMut = trpc.expense.recurringGenerate.useMutation({
    onSuccess: (data: any) => {
      toast({ title: "전표 생성 완료", description: `${data.voucherNo} 생성됨` });
      setGenId(null);
      utils.expense.recurringList.invalidate();
      utils.expense.list.invalidate();
    },
    onError: (e: any) => toast({ title: "생성 실패", description: e.message, variant: "destructive" }),
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
              ) : (listQuery.data || []).map((tpl: any) => (
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

function RecurringFormDialog({ open, onClose, editing, accounts, onSubmit, isPending }: any) {
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
  const selectedAcc = accounts.find((a: any) => a.id?.toString() === accountId);

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
              <SelectContent>{accounts.map((a: any) => <SelectItem key={a.id} value={a.id.toString()}>{a.code} {a.name}</SelectItem>)}</SelectContent>
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
    onError: (e: any) => toast({ title: "지급 실패", description: e.message, variant: "destructive" }),
  });

  // 미지급 합계
  const totalUnpaid = (unpaidQuery.data?.items || []).reduce((s: number, v: any) => s + Number(v.unpaid_balance || v.total_amount), 0);

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
            ) : (unpaidQuery.data?.items || []).map((v: any) => (
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
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as any)}>
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
              ) : (historyQuery.data || []).map((h: any) => (
                <TableRow key={h.id}>
                  <TableCell className="text-xs">{h.payment_date}</TableCell>
                  <TableCell className="text-right font-semibold">{fmt(h.payment_amount)}원</TableCell>
                  <TableCell className="text-xs">{PAYMENT_METHODS[h.payment_method]}</TableCell>
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
                  {(data.byProofType || []).map((r: any) => (
                    <TableRow key={r.proof_type}>
                      <TableCell>{PROOF_LABEL[r.proof_type] || r.proof_type}</TableCell>
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
                    {(data.monthly || []).map((m: any) => (
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
