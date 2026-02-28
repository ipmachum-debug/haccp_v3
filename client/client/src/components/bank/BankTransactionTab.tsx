import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Download,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Search,
  Link2,
  Unlink,
  ShieldCheck,
  ShieldX,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";

export default function BankTransactionTab() {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [matchingStatusFilter, setMatchingStatusFilter] = useState<string>("all");
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<string>("all");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isMatchDialogOpen, setIsMatchDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [matchAccountingId, setMatchAccountingId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 20;

  const utils = trpc.useUtils();

  // 계좌 목록
  const { data: accountsData } = trpc.bankAccount.list.useQuery();
  const accounts = accountsData?.accounts || [];

  // 거래 목록 (필터 적용)
  const queryInput: any = {
    bankAccountId: selectedAccountId || undefined,
    page,
    limit,
  };
  if (matchingStatusFilter !== "all") queryInput.matchingStatus = matchingStatusFilter;
  if (approvalStatusFilter !== "all") queryInput.approvalStatus = approvalStatusFilter;
  if (transactionTypeFilter !== "all") queryInput.transactionType = transactionTypeFilter;
  if (searchQuery) queryInput.search = searchQuery;

  const { data: transactionsData, isLoading } = trpc.bankTransaction.list.useQuery(
    queryInput,
    { enabled: !!selectedAccountId }
  );

  // 계좌 통계
  const { data: accountStats } = trpc.bankAccount.getStats.useQuery(
    { accountId: selectedAccountId! },
    { enabled: !!selectedAccountId }
  );

  // 엑셀 업로드
  const uploadMutation = trpc.bankTransactionBulk.bulkUploadFromExcel.useMutation({
    onSuccess: (result: any) => {
      setUploadResult(result);
      toast.success(`업로드 완료: 성공 ${result.success}건, 실패 ${result.failed}건`);
      utils.bankTransaction.list.invalidate();
      utils.bankAccount.getStats.invalidate();
    },
    onError: (error: any) => {
      toast.error(`업로드 오류: ${error.message}`);
    },
  });

  // 자동 매칭
  const runAutoMatchMutation = trpc.bankTransactionBulk.runAutoMatch.useMutation({
    onSuccess: (result: any) => {
      toast.success(`AI 자동 매칭 완료: ${result.matched}건 매칭됨`);
      utils.bankTransaction.list.invalidate();
      utils.bankAccount.getStats.invalidate();
    },
    onError: (error: any) => {
      toast.error(`자동 매칭 오류: ${error.message}`);
    },
  });

  // 수동 매칭
  const matchMutation = trpc.bankTransaction.match.useMutation({
    onSuccess: () => {
      toast.success("매칭이 완료되었습니다");
      utils.bankTransaction.list.invalidate();
      utils.bankAccount.getStats.invalidate();
      setIsMatchDialogOpen(false);
      setSelectedTransaction(null);
      setMatchAccountingId("");
    },
    onError: (error: any) => {
      toast.error(`매칭 실패: ${error.message}`);
    },
  });

  // 매칭 해제
  const unmatchMutation = trpc.bankTransaction.unmatch.useMutation({
    onSuccess: () => {
      toast.success("매칭이 해제되었습니다");
      utils.bankTransaction.list.invalidate();
      utils.bankAccount.getStats.invalidate();
    },
    onError: (error: any) => {
      toast.error(`매칭 해제 실패: ${error.message}`);
    },
  });

  // 승인
  const approveMutation = trpc.bankTransaction.approve.useMutation({
    onSuccess: () => {
      toast.success("거래가 승인되었습니다");
      utils.bankTransaction.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`승인 실패: ${error.message}`);
    },
  });

  // 반려
  const rejectMutation = trpc.bankTransaction.reject.useMutation({
    onSuccess: () => {
      toast.success("거래가 반려되었습니다");
      utils.bankTransaction.list.invalidate();
    },
    onError: (error: any) => {
      toast.error(`반려 실패: ${error.message}`);
    },
  });

  // 파일 선택
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadResult(null);
    }
  };

  // 엑셀 업로드
  const handleUpload = async () => {
    if (!uploadFile || !selectedAccountId) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        uploadMutation.mutate({
          bankAccountId: selectedAccountId,
          transactions: jsonData as any[],
        });
      } catch (error) {
        toast.error("파일 읽기 오류가 발생했습니다");
      }
    };
    reader.readAsArrayBuffer(uploadFile);
  };

  // 엑셀 템플릿 다운로드
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        "거래일시": "2025-01-15",
        "거래구분": "입금",
        "거래금액": 1000000,
        "거래처": "네이버",
        "메모": "광고 수익",
        "잔액": 5000000,
      },
      {
        "거래일시": "2025-01-16",
        "거래구분": "출금",
        "거래금액": 500000,
        "거래처": "카카오",
        "메모": "서버 비용",
        "잔액": 4500000,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "거래내역");
    XLSX.writeFile(wb, "은행거래_업로드_템플릿.xlsx");
    toast.success("템플릿이 다운로드되었습니다");
  };

  // AI 자동 매칭
  const handleRunAutoMatch = () => {
    if (!selectedAccountId) return;
    runAutoMatchMutation.mutate({ bankAccountId: selectedAccountId });
  };

  // 수동 매칭 Dialog 열기
  const handleOpenMatchDialog = (tx: any) => {
    setSelectedTransaction(tx);
    setMatchAccountingId(tx.accountingAccountId?.toString() || "");
    setIsMatchDialogOpen(true);
  };

  // 수동 매칭 실행
  const handleManualMatch = () => {
    if (!selectedTransaction || !matchAccountingId) {
      toast.error("계정과목 ID를 입력해주세요");
      return;
    }
    matchMutation.mutate({
      id: selectedTransaction.id,
      accountingAccountId: parseInt(matchAccountingId),
    });
  };

  // 매칭 해제
  const handleUnmatch = (id: number) => {
    if (confirm("이 거래의 매칭을 해제하시겠습니까?")) {
      unmatchMutation.mutate({ id });
    }
  };

  // 승인
  const handleApprove = (tx: any) => {
    if (tx.isHighAmount === "Y") {
      const confirmed = prompt(`고액 거래입니다. 금액을 확인해주세요.\n거래 금액: ${parseFloat(tx.amount).toLocaleString()}원\n\n확인된 금액을 입력하세요:`);
      if (confirmed) {
        approveMutation.mutate({ id: tx.id, confirmedAmount: parseFloat(confirmed) });
      }
    } else {
      approveMutation.mutate({ id: tx.id });
    }
  };

  // 반려
  const handleReject = (id: number) => {
    const reason = prompt("반려 사유를 입력하세요:");
    if (reason) {
      rejectMutation.mutate({ id, reason });
    }
  };

  // 매칭 상태 뱃지
  const getMatchStatusBadge = (status: string) => {
    switch (status) {
      case "matched":
        return <Badge className="bg-green-600">매칭 완료</Badge>;
      case "partial":
        return <Badge variant="secondary">부분 매칭</Badge>;
      case "unmatched":
      default:
        return <Badge variant="destructive">미매칭</Badge>;
    }
  };

  // 승인 상태 뱃지
  const getApprovalBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-blue-600">승인</Badge>;
      case "rejected":
        return <Badge variant="destructive">반려</Badge>;
      case "pending":
      default:
        return <Badge variant="outline">대기</Badge>;
    }
  };

  const totalPages = transactionsData ? Math.ceil(transactionsData.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* 계좌 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>계좌 선택</CardTitle>
          <CardDescription>거래 내역을 조회할 계좌를 선택하세요. 엑셀 업로드와 자동 매칭도 이 화면에서 진행할 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedAccountId?.toString() || ""}
            onValueChange={(value) => {
              setSelectedAccountId(parseInt(value));
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="계좌를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((account: any) => (
                <SelectItem key={account.id} value={account.id.toString()}>
                  {account.bankName} - {account.accountNo} ({account.accountName || "예금주 미지정"})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedAccountId && (
        <>
          {/* 통계 카드 */}
          {accountStats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">전체 거래</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{Number(accountStats.totalTransactions || 0).toLocaleString()}건</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">총 입금</CardTitle>
                  <TrendingUp className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    {Number(accountStats.totalDeposit || 0).toLocaleString()}원
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">총 출금</CardTitle>
                  <TrendingDown className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">
                    {Number(accountStats.totalWithdrawal || 0).toLocaleString()}원
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">미매칭</CardTitle>
                  <AlertCircle className="h-4 w-4 text-orange-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {Number(accountStats.unmatchedCount || 0).toLocaleString()}건
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              템플릿 다운로드
            </Button>
            <Button onClick={() => { setIsUploadDialogOpen(true); setUploadResult(null); setUploadFile(null); }}>
              <Upload className="h-4 w-4 mr-2" />
              Excel 업로드
            </Button>
            <Button
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              onClick={handleRunAutoMatch}
              disabled={runAutoMatchMutation.isPending}
            >
              <Sparkles className={`h-4 w-4 mr-2 ${runAutoMatchMutation.isPending ? "animate-spin" : ""}`} />
              {runAutoMatchMutation.isPending ? "AI 매칭 중..." : "AI 자동 매칭"}
            </Button>
          </div>

          {/* 필터 */}
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={matchingStatusFilter} onValueChange={(v) => { setMatchingStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="매칭 상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 매칭</SelectItem>
                <SelectItem value="unmatched">미매칭</SelectItem>
                <SelectItem value="matched">매칭 완료</SelectItem>
              </SelectContent>
            </Select>
            <Select value={approvalStatusFilter} onValueChange={(v) => { setApprovalStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="승인 상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 승인</SelectItem>
                <SelectItem value="pending">대기</SelectItem>
                <SelectItem value="approved">승인</SelectItem>
                <SelectItem value="rejected">반려</SelectItem>
              </SelectContent>
            </Select>
            <Select value={transactionTypeFilter} onValueChange={(v) => { setTransactionTypeFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="거래 유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                <SelectItem value="deposit">입금</SelectItem>
                <SelectItem value="withdrawal">출금</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="거래처, 메모 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* 거래 내역 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle>거래 내역</CardTitle>
              <CardDescription>
                총 {transactionsData?.total || 0}건의 거래 (페이지 {page}/{totalPages || 1})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>거래일</TableHead>
                        <TableHead>내용</TableHead>
                        <TableHead className="text-right">입금</TableHead>
                        <TableHead className="text-right">출금</TableHead>
                        <TableHead className="text-right">잔액</TableHead>
                        <TableHead>매칭</TableHead>
                        <TableHead>승인</TableHead>
                        <TableHead>작업</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactionsData?.items?.map((tx: any) => (
                        <TableRow key={tx.id} className={tx.isHighAmount === "Y" ? "bg-orange-50" : ""}>
                          <TableCell className="text-sm">
                            {tx.txDate ? format(new Date(tx.txDate), "yyyy-MM-dd") : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[200px]">
                              <p className="text-sm font-medium truncate">{tx.description || "-"}</p>
                              {tx.notes && <p className="text-xs text-muted-foreground truncate">{tx.notes}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-green-600 font-mono">
                            {tx.transactionType === "deposit" ? parseFloat(tx.amount).toLocaleString() : "-"}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-mono">
                            {tx.transactionType === "withdrawal" ? parseFloat(tx.amount).toLocaleString() : "-"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {tx.balance ? parseFloat(tx.balance).toLocaleString() : "-"}
                          </TableCell>
                          <TableCell>{getMatchStatusBadge(tx.matchStatus)}</TableCell>
                          <TableCell>
                            {getApprovalBadge(tx.approvalStatus)}
                            {tx.isHighAmount === "Y" && (
                              <Badge variant="outline" className="ml-1 border-orange-500 text-orange-600 text-xs">고액</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {tx.matchStatus !== "matched" ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="수동 매칭"
                                  onClick={() => handleOpenMatchDialog(tx)}
                                >
                                  <Link2 className="h-4 w-4 text-blue-600" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="매칭 해제"
                                  onClick={() => handleUnmatch(tx.id)}
                                >
                                  <Unlink className="h-4 w-4 text-orange-600" />
                                </Button>
                              )}
                              {tx.approvalStatus === "pending" && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="승인"
                                    onClick={() => handleApprove(tx)}
                                  >
                                    <ShieldCheck className="h-4 w-4 text-green-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="반려"
                                    onClick={() => handleReject(tx.id)}
                                  >
                                    <ShieldX className="h-4 w-4 text-red-600" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!transactionsData?.items || transactionsData.items.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            거래 내역이 없습니다. Excel 파일을 업로드하여 거래를 등록하세요.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>

                  {/* 페이지네이션 */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page <= 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {page} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Excel 업로드 Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Excel 파일 업로드</DialogTitle>
            <DialogDescription>
              은행 거래 내역 Excel 파일을 업로드하세요. "템플릿 다운로드" 버튼으로 양식을 먼저 확인하시는 것을 권장합니다.
              업로드 후 자동으로 매칭 규칙이 적용됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="file">Excel 파일 선택 (.xlsx, .xls)</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls"
                ref={fileInputRef}
                onChange={handleFileSelect}
              />
              {uploadFile && (
                <p className="text-sm text-muted-foreground mt-2">
                  선택된 파일: {uploadFile.name}
                </p>
              )}
            </div>

            {uploadResult && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">업로드 결과</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>성공: {uploadResult.success}건</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-600" />
                    <span>실패: {uploadResult.failed}건</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <span>자동 매칭: {uploadResult.autoMatched || 0}건</span>
                  </div>
                  {uploadResult.errors && uploadResult.errors.length > 0 && (
                    <div className="mt-4">
                      <p className="text-sm font-medium mb-2">오류 목록:</p>
                      <div className="max-h-40 overflow-y-auto space-y-1">
                        {uploadResult.errors.map((error: any, idx: number) => (
                          <p key={idx} className="text-xs text-red-600">
                            행 {error.row}: {error.error}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
              닫기
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!uploadFile || uploadMutation.isPending}
            >
              {uploadMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              업로드
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수동 매칭 Dialog */}
      <Dialog open={isMatchDialogOpen} onOpenChange={setIsMatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>수동 매칭</DialogTitle>
            <DialogDescription>
              거래에 대한 계정과목을 지정하여 매칭합니다.
            </DialogDescription>
          </DialogHeader>
          {selectedTransaction && (
            <div className="space-y-4">
              {/* 거래 정보 */}
              <div className="p-4 bg-muted rounded-lg space-y-1">
                <p className="text-sm font-medium">거래 정보</p>
                <p className="text-sm text-muted-foreground">
                  내용: {selectedTransaction.description || "-"}
                </p>
                <p className="text-sm text-muted-foreground">
                  금액: {parseFloat(selectedTransaction.amount).toLocaleString()}원
                  ({selectedTransaction.transactionType === "deposit" ? "입금" : "출금"})
                </p>
                <p className="text-sm text-muted-foreground">
                  거래일: {selectedTransaction.txDate ? format(new Date(selectedTransaction.txDate), "yyyy-MM-dd") : "-"}
                </p>
              </div>

              {/* 계정과목 ID 입력 */}
              <div>
                <Label htmlFor="accountingId">계정과목 ID *</Label>
                <Input
                  id="accountingId"
                  type="number"
                  value={matchAccountingId}
                  onChange={(e) => setMatchAccountingId(e.target.value)}
                  placeholder="계정과목 ID를 입력하세요"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  회계 계정과목 ID를 입력하면 해당 거래가 매칭됩니다.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMatchDialogOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleManualMatch}
              disabled={!matchAccountingId || matchMutation.isPending}
            >
              {matchMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              매칭 확정
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
