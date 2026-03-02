import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  Building2,
  Edit3,
  Save,
  X,
  Trash2,
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
  const [matchDescription, setMatchDescription] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [editingTxId, setEditingTxId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const limit = 20;

  const utils = trpc.useUtils();

  // 계좌 목록
  const { data: accountsData } = trpc.bankAccount.list.useQuery();
  const accounts = accountsData?.accounts || [];

  // 첫 활성 계좌 자동 선택
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      const activeAccount = accounts.find((a: any) => a.isActive === "Y") || accounts[0];
      setSelectedAccountId(activeAccount.id);
    }
  }, [accounts, selectedAccountId]);

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

  const { data: transactionsData, isLoading, error: listError } = trpc.bankTransaction.list.useQuery(
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
      setMatchDescription("");
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

  // 거래 수정 (적요/메모)
  const updateMutation = trpc.bankTransaction.update.useMutation({
    onSuccess: () => {
      toast.success("거래 정보가 수정되었습니다");
      utils.bankTransaction.list.invalidate();
      setEditingTxId(null);
    },
    onError: (error: any) => {
      toast.error(`수정 실패: ${error.message}`);
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

  // 선택 삭제
  const bulkDeleteMutation = trpc.bankTransaction.bulkDelete.useMutation({
    onSuccess: (result: any) => {
      toast.success(result.message);
      setSelectedIds(new Set());
      utils.bankTransaction.list.invalidate();
      utils.bankAccount.getStats.invalidate();
    },
    onError: (error: any) => {
      toast.error(`삭제 실패: ${error.message}`);
    },
  });

  // 전체 삭제
  const deleteAllMutation = trpc.bankTransaction.deleteAll.useMutation({
    onSuccess: (result: any) => {
      toast.success(result.message);
      setSelectedIds(new Set());
      utils.bankTransaction.list.invalidate();
      utils.bankAccount.getStats.invalidate();
    },
    onError: (error: any) => {
      toast.error(`전체 삭제 실패: ${error.message}`);
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

        if (!jsonData || jsonData.length === 0) {
          toast.error("엑셀 파일에 데이터가 없습니다. 헤더행 아래에 데이터를 입력해주세요.");
          return;
        }

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
        "거래일시": "2025-01-15 10:30",
        "적요": "광고 수익",
        "의뢰인/수취인": "네이버",
        "입금": 1000000,
        "출금": "",
        "거래후잔액": 5000000,
        "메모": "월 광고비",
      },
      {
        "거래일시": "2025-01-16 14:00",
        "적요": "서버 비용",
        "의뢰인/수취인": "카카오",
        "입금": "",
        "출금": 500000,
        "거래후잔액": 4500000,
        "메모": "AWS 호스팅",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws["!cols"] = [
      { wch: 18 }, { wch: 20 }, { wch: 18 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
    ];
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
    setMatchDescription(tx.description || "");
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

  // 인라인 수정 시작
  const handleStartEdit = (tx: any) => {
    setEditingTxId(tx.id);
    setEditDescription(tx.description || "");
    setEditMemo(tx.memo || tx.notes || "");
  };

  // 인라인 수정 저장
  const handleSaveEdit = (txId: number) => {
    updateMutation.mutate({
      id: txId,
      description: editDescription,
      memo: editMemo,
    });
  };

  // 인라인 수정 취소
  const handleCancelEdit = () => {
    setEditingTxId(null);
    setEditDescription("");
    setEditMemo("");
  };

  // 승인
  const handleApprove = (tx: any) => {
    if (tx.isHighAmount === "Y" || tx.isLargeAmount === "Y") {
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

  // 선택 삭제
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) {
      toast.error("삭제할 거래를 선택해주세요");
      return;
    }
    if (confirm(`선택한 ${selectedIds.size}건의 거래를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      bulkDeleteMutation.mutate({ ids: Array.from(selectedIds) });
    }
  };

  // 전체 삭제
  const handleDeleteAll = () => {
    if (!selectedAccountId) return;
    const total = transactionsData?.total || 0;
    if (confirm(`이 계좌의 모든 거래 내역(${total}건)을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) {
      const confirmText = prompt("확인을 위해 '전체삭제'를 입력하세요:");
      if (confirmText === "전체삭제") {
        deleteAllMutation.mutate({ bankAccountId: selectedAccountId });
      } else if (confirmText !== null) {
        toast.error("입력이 일치하지 않습니다. 전체 삭제가 취소되었습니다.");
      }
    }
  };

  // 체크박스: 전체 선택/해제
  const handleSelectAll = (checked: boolean) => {
    if (checked && transactionsData?.items) {
      setSelectedIds(new Set(transactionsData.items.map((tx: any) => tx.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  // 체크박스: 개별 선택/해제
  const handleSelectOne = (id: number, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  // 전체 선택 여부
  const isAllSelected =
    transactionsData?.items &&
    transactionsData.items.length > 0 &&
    transactionsData.items.every((tx: any) => selectedIds.has(tx.id));

  // 매칭 상태 뱃지
  const getMatchStatusBadge = (status: string) => {
    switch (status) {
      case "matched":
        return <Badge className="bg-green-600">매칭</Badge>;
      case "partial":
        return <Badge variant="secondary">부분</Badge>;
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

  const selectedAccount = accounts.find((a: any) => a.id === selectedAccountId);
  const totalPages = transactionsData ? Math.ceil(transactionsData.total / limit) : 0;

  return (
    <div className="space-y-6">
      {/* 등록된 계좌 카드 */}
      {accounts.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center space-y-2">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-lg font-medium">등록된 계좌가 없습니다</p>
              <p className="text-sm text-muted-foreground">"은행 계좌 관리" 탭에서 계좌를 먼저 등록해주세요.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.filter((a: any) => a.isActive === "Y").map((account: any) => (
            <Card
              key={account.id}
              className={`cursor-pointer transition-all hover:shadow-md ${
                selectedAccountId === account.id
                  ? "ring-2 ring-primary bg-primary/5"
                  : "hover:bg-muted/50"
              }`}
              onClick={() => { setSelectedAccountId(account.id); setPage(1); setSelectedIds(new Set()); }}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    selectedAccountId === account.id ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{account.bankName}</p>
                    <p className="text-xs text-muted-foreground truncate">{account.accountNo}</p>
                    {account.accountName && (
                      <p className="text-xs text-muted-foreground truncate">{account.accountName}</p>
                    )}
                  </div>
                  {selectedAccountId === account.id && (
                    <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedAccountId && (
        <>
          {/* 통계 카드 */}
          {accountStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">전체 거래</p>
                      <p className="text-xl font-bold">{Number(accountStats.totalTransactions || 0).toLocaleString()}건</p>
                    </div>
                    <DollarSign className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">총 입금</p>
                      <p className="text-xl font-bold text-green-600">
                        {Number(accountStats.totalDeposit || 0).toLocaleString()}
                      </p>
                    </div>
                    <TrendingUp className="h-5 w-5 text-green-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">총 출금</p>
                      <p className="text-xl font-bold text-red-600">
                        {Number(accountStats.totalWithdrawal || 0).toLocaleString()}
                      </p>
                    </div>
                    <TrendingDown className="h-5 w-5 text-red-600" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">미매칭</p>
                      <p className="text-xl font-bold text-orange-600">
                        {Number(accountStats.unmatchedCount || 0).toLocaleString()}건
                      </p>
                    </div>
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex flex-wrap gap-2 items-center">
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="h-4 w-4 mr-1" />
              템플릿 다운로드
            </Button>
            <Button size="sm" onClick={() => { setIsUploadDialogOpen(true); setUploadResult(null); setUploadFile(null); }}>
              <Upload className="h-4 w-4 mr-1" />
              Excel 업로드
            </Button>
            <Button
              size="sm"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              onClick={handleRunAutoMatch}
              disabled={runAutoMatchMutation.isPending}
            >
              <Sparkles className={`h-4 w-4 mr-1 ${runAutoMatchMutation.isPending ? "animate-spin" : ""}`} />
              {runAutoMatchMutation.isPending ? "매칭 중..." : "AI 자동 매칭"}
            </Button>

            <div className="flex-1" />

            {/* 삭제 버튼들 */}
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" />
                )}
                선택 삭제 ({selectedIds.size}건)
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-300 hover:bg-red-50"
              onClick={handleDeleteAll}
              disabled={deleteAllMutation.isPending || !transactionsData?.total}
            >
              {deleteAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              전체 삭제
            </Button>
          </div>

          {/* 필터 */}
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={matchingStatusFilter} onValueChange={(v) => { setMatchingStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="매칭 상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 매칭</SelectItem>
                <SelectItem value="unmatched">미매칭</SelectItem>
                <SelectItem value="matched">매칭 완료</SelectItem>
              </SelectContent>
            </Select>
            <Select value={approvalStatusFilter} onValueChange={(v) => { setApprovalStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[120px] h-9">
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
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue placeholder="거래 유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="deposit">입금</SelectItem>
                <SelectItem value="withdrawal">출금</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="적요, 메모 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </div>

          {/* 에러 표시 */}
          {listError && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                  <span className="text-sm">거래 내역 조회 오류: {listError.message}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 거래 내역 테이블 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    거래 내역 {selectedAccount && `- ${selectedAccount.bankName} ${selectedAccount.accountNo}`}
                  </CardTitle>
                  <CardDescription>
                    총 {transactionsData?.total || 0}건 (페이지 {page}/{totalPages || 1})
                    {selectedIds.size > 0 && (
                      <span className="ml-2 text-blue-600 font-medium">
                        {selectedIds.size}건 선택됨
                      </span>
                    )}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40px]">
                            <Checkbox
                              checked={!!isAllSelected}
                              onCheckedChange={(checked) => handleSelectAll(!!checked)}
                            />
                          </TableHead>
                          <TableHead className="w-[100px]">거래일</TableHead>
                          <TableHead>적요 / 메모</TableHead>
                          <TableHead className="text-right w-[110px]">입금</TableHead>
                          <TableHead className="text-right w-[110px]">출금</TableHead>
                          <TableHead className="text-right w-[110px]">잔액</TableHead>
                          <TableHead className="w-[70px]">매칭</TableHead>
                          <TableHead className="w-[70px]">승인</TableHead>
                          <TableHead className="w-[120px]">작업</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transactionsData?.items?.map((tx: any) => (
                          <TableRow
                            key={tx.id}
                            className={`${
                              selectedIds.has(tx.id) ? "bg-blue-50" :
                              (tx.isHighAmount === "Y" || tx.isLargeAmount === "Y") ? "bg-orange-50" :
                              tx.matchingStatus === "unmatched" ? "bg-yellow-50/50" : ""
                            }`}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedIds.has(tx.id)}
                                onCheckedChange={(checked) => handleSelectOne(tx.id, !!checked)}
                              />
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {tx.transactionDate
                                ? format(new Date(tx.transactionDate), "yyyy-MM-dd")
                                : tx.txDate
                                ? format(new Date(tx.txDate), "yyyy-MM-dd")
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {editingTxId === tx.id ? (
                                <div className="space-y-1">
                                  <Input
                                    value={editDescription}
                                    onChange={(e) => setEditDescription(e.target.value)}
                                    placeholder="적요"
                                    className="h-7 text-xs"
                                  />
                                  <Input
                                    value={editMemo}
                                    onChange={(e) => setEditMemo(e.target.value)}
                                    placeholder="메모"
                                    className="h-7 text-xs"
                                  />
                                </div>
                              ) : (
                                <div className="max-w-[250px]">
                                  <p className="text-sm font-medium truncate">{tx.description || "-"}</p>
                                  {(tx.notes || tx.memo) && (
                                    <p className="text-xs text-muted-foreground truncate">{tx.notes || tx.memo}</p>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-mono text-sm">
                              {tx.transactionType === "deposit" ? parseFloat(tx.amount).toLocaleString() : ""}
                            </TableCell>
                            <TableCell className="text-right text-red-600 font-mono text-sm">
                              {tx.transactionType === "withdrawal" ? parseFloat(tx.amount).toLocaleString() : ""}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {tx.balance ? parseFloat(tx.balance).toLocaleString() : "-"}
                            </TableCell>
                            <TableCell>{getMatchStatusBadge(tx.matchingStatus || tx.matchStatus)}</TableCell>
                            <TableCell>
                              {getApprovalBadge(tx.approvalStatus)}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-0.5">
                                {editingTxId === tx.id ? (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      title="저장"
                                      onClick={() => handleSaveEdit(tx.id)}
                                      disabled={updateMutation.isPending}
                                    >
                                      <Save className="h-3.5 w-3.5 text-green-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      title="취소"
                                      onClick={handleCancelEdit}
                                    >
                                      <X className="h-3.5 w-3.5 text-gray-500" />
                                    </Button>
                                  </>
                                ) : (
                                  <>
                                    {/* 수정 버튼 */}
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      title="수정"
                                      onClick={() => handleStartEdit(tx)}
                                    >
                                      <Edit3 className="h-3.5 w-3.5 text-gray-500" />
                                    </Button>
                                    {/* 매칭/해제 */}
                                    {(tx.matchingStatus || tx.matchStatus) !== "matched" ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        title="수동 매칭"
                                        onClick={() => handleOpenMatchDialog(tx)}
                                      >
                                        <Link2 className="h-3.5 w-3.5 text-blue-600" />
                                      </Button>
                                    ) : (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        title="매칭 해제"
                                        onClick={() => handleUnmatch(tx.id)}
                                      >
                                        <Unlink className="h-3.5 w-3.5 text-orange-600" />
                                      </Button>
                                    )}
                                    {/* 승인/반려 */}
                                    {tx.approvalStatus === "pending" && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          title="승인"
                                          onClick={() => handleApprove(tx)}
                                        >
                                          <ShieldCheck className="h-3.5 w-3.5 text-green-600" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 w-7 p-0"
                                          title="반려"
                                          onClick={() => handleReject(tx.id)}
                                        >
                                          <ShieldX className="h-3.5 w-3.5 text-red-600" />
                                        </Button>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {(!transactionsData?.items || transactionsData.items.length === 0) && !isLoading && (
                          <TableRow>
                            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                              {listError
                                ? "거래 내역 조회 중 오류가 발생했습니다."
                                : "거래 내역이 없습니다. Excel 파일을 업로드하여 거래를 등록하세요."}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>

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
              은행 거래 내역 Excel 파일을 업로드하세요. "템플릿 다운로드" 버튼으로 양식을 먼저 확인하시는
              것을 권장합니다. 업로드 후 자동으로 매칭 규칙이 적용됩니다.
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
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">업로드 결과</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">성공: {uploadResult.success}건</span>
                  </div>
                  {uploadResult.duplicate > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-yellow-600" />
                      <span className="text-sm">중복: {uploadResult.duplicate}건</span>
                    </div>
                  )}
                  {uploadResult.failed > 0 && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm">실패: {uploadResult.failed}건</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600" />
                    <span className="text-sm">자동 매칭: {uploadResult.autoMatched || 0}건</span>
                  </div>
                  {uploadResult.errors && uploadResult.errors.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-1">오류 목록:</p>
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
              거래에 대한 계정과목을 지정하여 매칭합니다. 매칭 정보는 자동 매칭 규칙에 학습됩니다.
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
                  거래일: {selectedTransaction.transactionDate
                    ? format(new Date(selectedTransaction.transactionDate), "yyyy-MM-dd")
                    : selectedTransaction.txDate
                    ? format(new Date(selectedTransaction.txDate), "yyyy-MM-dd")
                    : "-"}
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
