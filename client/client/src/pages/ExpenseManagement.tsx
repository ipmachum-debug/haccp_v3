import { useState, useMemo, useRef, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
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
import {
  Plus, Search, Download, CheckCircle, XCircle, Trash2, Eye, Edit, FileText,
  Receipt, CreditCard, Building2, Banknote, AlertTriangle, TrendingDown,
  Paperclip, Upload, X, File, Image, FileSpreadsheet,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

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
    onError: (e) => toast({ title: "확정 실패", description: e.message, variant: "destructive" }),
  });

  const cancelMut = trpc.expense.cancel.useMutation({
    onSuccess: () => {
      toast({ title: "취소 완료", description: "비용전표가 취소되었습니다." });
      setCancelId(null);
      setCancelReason("");
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
    },
    onError: (e) => toast({ title: "취소 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMut = trpc.expense.delete.useMutation({
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
    },
    onError: (e) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
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
    <div className="space-y-4 p-4">
      {/* ── 헤더 ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">비용관리</h1>
          <p className="text-sm text-muted-foreground">경비/비용전표 등록 및 관리</p>
        </div>
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
    onSuccess: async (data) => {
      // 전표 생성 후 파일 업로드
      if (pendingFiles.length > 0) {
        await uploadFiles(data.id);
      }
      toast({ title: "등록 완료", description: `전표 ${data.voucherNo}이(가) 등록되었습니다.` });
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
      onClose();
    },
    onError: (e) => toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
  });

  const updateMut = trpc.expense.update.useMutation({
    onSuccess: async () => {
      // 수정 후 새 파일 업로드
      if (pendingFiles.length > 0 && editingId) {
        await uploadFiles(editingId);
      }
      toast({ title: "수정 완료" });
      utils.expense.list.invalidate();
      utils.expense.getSummary.invalidate();
      onClose();
    },
    onError: (e) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
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
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "비용전표 수정" : "비용전표 등록"}</DialogTitle>
          <DialogDescription>비용(경비) 전표를 {isEdit ? "수정" : "등록"}합니다.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 기본 정보 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>비용일자 *</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
            </div>
            <div>
              <Label>거래처</Label>
              <Input placeholder="거래처명" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
            </div>
            <div>
              <Label>결제수단 *</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">현금</SelectItem>
                  <SelectItem value="bank">계좌이체</SelectItem>
                  <SelectItem value="card">카드</SelectItem>
                  <SelectItem value="unpaid">미지급(외상)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>증빙유형 *</Label>
              <Select value={proofType} onValueChange={setProofType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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

          {/* 비용 항목 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-semibold">비용 항목</Label>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-3 h-3 mr-1" /> 항목 추가</Button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end border rounded p-2 bg-muted/30">
                  <div className="col-span-3">
                    <Label className="text-xs">계정과목 *</Label>
                    <Select
                      value={String(item.accountId || "")}
                      onValueChange={(v) => {
                        const acc = accounts.find((a) => String(a.id) === v);
                        updateItem(idx, "accountId", Number(v));
                        if (acc) {
                          updateItem(idx, "accountCode", acc.code);
                          updateItem(idx, "accountName", acc.name);
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((acc: any) => (
                          <SelectItem key={acc.id} value={String(acc.id)}>
                            [{acc.code}] {acc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">공급가액</Label>
                    <Input
                      type="number" className="h-8 text-xs"
                      value={item.supplyAmount || ""}
                      onChange={(e) => updateItem(idx, "supplyAmount", Number(e.target.value))}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">부가세</Label>
                    <Input
                      type="number" className="h-8 text-xs"
                      value={item.vatAmount || ""}
                      onChange={(e) => updateItem(idx, "vatAmount", Number(e.target.value))}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">합계</Label>
                    <Input type="number" className="h-8 text-xs bg-muted" readOnly value={item.totalAmount || 0} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">적요</Label>
                    <Input
                      className="h-8 text-xs" placeholder="내용"
                      value={item.description || ""}
                      onChange={(e) => updateItem(idx, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {items.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => removeItem(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 합계 */}
          <div className="grid grid-cols-3 gap-3 bg-muted/50 p-3 rounded font-semibold">
            <div>공급가액: {fmt(totals.supply)}원</div>
            <div>부가세: {fmt(totals.vat)}원</div>
            <div className="text-lg">합계: {fmt(totals.total)}원</div>
          </div>

          {/* 메모 */}
          <div>
            <Label>메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모 (선택)" rows={2} />
          </div>

          {/* 첨부파일 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-semibold flex items-center gap-1">
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
              <div className="space-y-1 mb-2">
                <p className="text-xs text-muted-foreground">기존 파일</p>
                {existingAttachments.map((att: any) => (
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-red-500"
                      onClick={() => deleteAttachment(att.id)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* 새로 추가된 파일 */}
            {pendingFiles.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">새 파일 ({pendingFiles.length}개)</p>
                {pendingFiles.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded text-xs border border-blue-200 dark:border-blue-800">
                    {getFileIcon(f.type)}
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="text-muted-foreground">{formatFileSize(f.size)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-red-500"
                      onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {existingAttachments.length === 0 && pendingFiles.length === 0 && (
              <div className="text-xs text-muted-foreground p-3 text-center border border-dashed rounded">
                첨부파일 없음 (이미지, PDF, Excel, Word, CSV 지원 / 최대 10MB, 5개)
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} disabled={isPending || uploadingFiles}>
            {isPending || uploadingFiles ? "처리중..." : isEdit ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
