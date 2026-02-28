import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Upload, RefreshCw, Download, Search, TrendingUp, TrendingDown, DollarSign, Sparkles, Award } from "lucide-react";
import { parseBankTransactionExcel, mapTransactionType, parseTransactionDate } from "@/lib/excelParser";
import { generateBankTransactionTemplate, downloadTemplate } from "@/lib/excelTemplates";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/**
 * 은행 거래 매칭 페이지
 * 
 * 기능:
 * - 엑셀 파일 업로드
 * - 고급 자동 매칭 실행 (matching_rules 기반)
 * - 매칭 결과 조회
 * - TOP3 추천 시스템
 * - 수동 재매칭 UI
 * - 통계 대시보드
 */

export default function BankTransactionMatching() {
  return (
    <DashboardLayout>
      <BankTransactionMatchingContent />
    </DashboardLayout>
  );
}

function BankTransactionMatchingContent() {
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [rematchDialogOpen, setRematchDialogOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<any>(null);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>("");

  // 은행 계좌 목록 조회
  const { data: accounts = [] } = trpc.bankAccounts.list.useQuery();

  // 은행 거래 목록 조회
  const { data: transactions = [], refetch: refetchTransactions } = trpc.bankTransactions.list.useQuery(
    { bankAccountId: selectedAccountId ? parseInt(selectedAccountId) : undefined },
    { enabled: !!selectedAccountId }
  );

  // TOP3 매칭 후보 조회
  const { data: matchCandidates = [], refetch: refetchCandidates } = trpc.bankTransactions.getMatchCandidates.useQuery(
    { transactionId: selectedTransaction?.id || 0 },
    { enabled: !!selectedTransaction?.id }
  );

  // 매칭 통계 계산
  const stats = transactions.length > 0 ? {
    totalCount: transactions.length,
    matchedCount: transactions.filter(tx => tx.matchedLedgerType).length,
    unmatchedCount: transactions.filter(tx => !tx.matchedLedgerType).length,
  } : null;

  // 업로드 mutation
  const uploadMutation = trpc.bankTransactions.upload.useMutation({
    onError: (error) => {
      toast({
        title: "업로드 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 고급 자동 매칭 실행
  const autoMatchAdvancedMutation = trpc.bankTransactions.autoMatchAdvanced.useMutation({
    onSuccess: (result) => {
      toast({
        title: "고급 자동 매칭 완료",
        description: `${result.matched}건 매칭 성공 (전체 ${result.total}건)`,
      });
      refetchTransactions();
    },
    onError: (error) => {
      toast({
        title: "자동 매칭 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 수동 매칭 mutation
  const manualMatchMutation = trpc.bankTransactions.manualMatch.useMutation({
    onSuccess: () => {
      toast({
        title: "수동 매칭 완료",
        description: "거래가 성공적으로 매칭되었습니다.",
      });
      refetchTransactions();
      setRematchDialogOpen(false);
      setSelectedTransaction(null);
      setSelectedPartnerId("");
    },
    onError: (error) => {
      toast({
        title: "수동 매칭 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // 파일 업로드 핸들러
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // 엑셀 업로드 핸들러
  const handleUpload = async () => {
    if (!selectedFile || !selectedAccountId) {
      toast({
        title: "업로드 실패",
        description: "계좌와 파일을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      // 엑셀 파일 파싱
      const parseResult = await parseBankTransactionExcel(selectedFile);
      
      if (!parseResult.success || parseResult.errors.length > 0) {
        const errorMessages = parseResult.errors.map(err => `${err.row}행 ${err.field}: ${err.message}`).join('\n');
        toast({
          title: "파싱 실패",
          description: errorMessages,
          variant: "destructive",
        });
        setIsUploading(false);
        return;
      }

      // 파싱된 데이터를 API 형식으로 변환
      const transactions = parseResult.data.map(row => ({
        occurredAt: parseTransactionDate(row.거래일시).toISOString(),
        direction: mapTransactionType(row.거래구분) === 'deposit' ? 'in' as const : 'out' as const,
        amount: row.거래금액.toString(),
        counterparty: row.거래처,
        memo: row.메모 || undefined,
        balance: row.잔액.toString(),
      }));

      // 배치 업로드 API 호출
      await uploadMutation.mutateAsync({
        bankAccountId: parseInt(selectedAccountId),
        transactions,
      });
      
      toast({
        title: "업로드 성공",
        description: `${transactions.length}건의 거래를 업로드했습니다.`,
      });
      
      // 거래 목록 새로고침
      refetchTransactions();
      setSelectedFile(null);
      setIsUploading(false);
    } catch (error) {
      toast({
        title: "업로드 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  // 고급 자동 매칭 실행 핸들러
  const handleAutoMatchAdvanced = () => {
    if (!selectedAccountId) {
      toast({
        title: "매칭 실패",
        description: "계좌를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    autoMatchAdvancedMutation.mutate({
      bankAccountId: parseInt(selectedAccountId),
    });
  };

  // 재매칭 Dialog 열기
  const handleOpenRematchDialog = (tx: any) => {
    setSelectedTransaction(tx);
    setSelectedPartnerId("");
    setRematchDialogOpen(true);
    // TOP3 후보 조회는 자동으로 실행됨 (useQuery의 enabled 조건)
  };

  // 수동 매칭 실행
  const handleManualMatch = () => {
    if (!selectedTransaction || !selectedPartnerId) {
      toast({
        title: "매칭 실패",
        description: "거래처를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    manualMatchMutation.mutate({
      transactionId: selectedTransaction.id,
      ledgerType: selectedTransaction.direction === 'in' ? 'ar' : 'ap',
    });
  };

  // 매칭 상태 뱃지
  const getMatchStatusBadge = (status: string) => {
    switch (status) {
      case "matched":
        return <Badge variant="default" className="bg-green-600">매칭 완료</Badge>;
      case "unmatched":
        return <Badge variant="secondary">미매칭</Badge>;
      case "pending":
        return <Badge variant="outline">대기</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">은행 거래 매칭</h1>
          <p className="text-muted-foreground">은행 거래 내역을 업로드하고 자동으로 매입/매출 원장과 매칭합니다.</p>
        </div>
      </div>

      {/* 통계 대시보드 */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 거래</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCount}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">매칭 완료</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.matchedCount}건</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalCount > 0 ? ((stats.matchedCount / stats.totalCount) * 100).toFixed(1) : 0}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">미매칭</CardTitle>
              <TrendingDown className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.unmatchedCount}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">매칭률</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.totalCount > 0 ? ((stats.matchedCount / stats.totalCount) * 100).toFixed(1) : 0}%
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 업로드 및 매칭 컨트롤 */}
      <Card>
        <CardHeader>
          <CardTitle>거래 내역 업로드 및 매칭</CardTitle>
          <CardDescription>엑셀 파일을 업로드하고 자동 매칭을 실행하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account">은행 계좌 선택</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger id="account">
                  <SelectValue placeholder="계좌 선택" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.bankName} - {account.accountNumber} ({account.ownerName || '소유자 미지정'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="file">엑셀 파일</Label>
              <Input
                id="file"
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
              />
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              onClick={async () => {
                const blob = await generateBankTransactionTemplate();
                downloadTemplate(blob, "은행거래_업로드_템플릿.xlsx");
                toast({ title: "템플릿 다운로드 완료", description: "엑셀 파일을 작성하여 업로드하세요." });
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              템플릿 다운로드
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !selectedAccountId || isUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploading ? "업로드 중..." : "엑셀 업로드"}
            </Button>
            <Button
              variant="default"
              className="bg-gradient-to-r from-purple-600 to-blue-600"
              onClick={handleAutoMatchAdvanced}
              disabled={!selectedAccountId || autoMatchAdvancedMutation.isPending}
            >
              <Sparkles className={`mr-2 h-4 w-4 ${autoMatchAdvancedMutation.isPending ? "animate-spin" : ""}`} />
              {autoMatchAdvancedMutation.isPending ? "AI 매칭 중..." : "AI 자동 매칭"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 거래 내역 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>거래 내역</CardTitle>
          <CardDescription>
            {selectedAccountId ? "선택한 계좌의 거래 내역입니다." : "계좌를 선택하면 거래 내역이 표시됩니다."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedAccountId ? "거래 내역이 없습니다." : "계좌를 선택해주세요."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>거래일</TableHead>
                  <TableHead>거래 내용</TableHead>
                  <TableHead className="text-right">입금</TableHead>
                  <TableHead className="text-right">출금</TableHead>
                  <TableHead className="text-right">잔액</TableHead>
                  <TableHead>매칭 상태</TableHead>
                  <TableHead>작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{new Date(tx.occurredAt).toLocaleDateString()}</TableCell>
                    <TableCell>{tx.counterpartyText || tx.memo || '-'}</TableCell>
                    <TableCell className="text-right">
                      {tx.direction === 'in' ? parseFloat(tx.amount).toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {tx.direction === 'out' ? parseFloat(tx.amount).toLocaleString() : "-"}
                    </TableCell>
                    <TableCell className="text-right">{tx.balance ? parseFloat(tx.balance).toLocaleString() : '-'}</TableCell>
                    <TableCell>{getMatchStatusBadge(tx.matchedLedgerType || 'unmatched')}</TableCell>
                    <TableCell>
                      {!tx.matchedLedgerType && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleOpenRematchDialog(tx)}
                        >
                          <Search className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 재매칭 Dialog */}
      <Dialog open={rematchDialogOpen} onOpenChange={setRematchDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>수동 매칭 (AI 추천)</DialogTitle>
            <DialogDescription>
              AI가 분석한 TOP3 추천 거래처를 확인하고 선택하세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 거래 정보 */}
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">거래 정보</p>
              <p className="text-sm text-muted-foreground">{selectedTransaction?.counterpartyText || selectedTransaction?.memo || '-'}</p>
              <p className="text-sm text-muted-foreground">
                금액: {selectedTransaction?.amount ? parseFloat(selectedTransaction.amount).toLocaleString() : 0}원 ({selectedTransaction?.direction === 'in' ? '입금' : '출금'})
              </p>
              <p className="text-sm text-muted-foreground">
                거래일: {selectedTransaction?.occurredAt ? new Date(selectedTransaction.occurredAt).toLocaleDateString() : '-'}
              </p>
            </div>

            {/* TOP3 추천 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Award className="h-4 w-4 text-yellow-600" />
                AI 추천 거래처 (TOP3)
              </Label>
              {matchCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">추천 거래처가 없습니다. 매칭 규칙을 추가해주세요.</p>
              ) : (
                <RadioGroup value={selectedPartnerId} onValueChange={setSelectedPartnerId}>
                  {matchCandidates.map((candidate, index) => (
                    <div key={candidate.partnerId} className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-muted/50">
                      <RadioGroupItem value={candidate.partnerId.toString()} id={`partner-${candidate.partnerId}`} />
                      <div className="flex-1">
                        <Label htmlFor={`partner-${candidate.partnerId}`} className="flex items-center gap-2 cursor-pointer">
                          <span className="font-medium">{candidate.partnerName}</span>
                          <Badge variant={index === 0 ? "default" : "outline"} className={index === 0 ? "bg-yellow-600" : ""}>
                            {candidate.score.toFixed(0)}점
                          </Badge>
                        </Label>
                        <p className="text-xs text-muted-foreground mt-1">
                          {candidate.matchedRules.join(', ')}
                        </p>
                      </div>
                    </div>
                  ))}
                </RadioGroup>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRematchDialogOpen(false)}>
              취소
            </Button>
            <Button 
              onClick={handleManualMatch}
              disabled={!selectedPartnerId || manualMatchMutation.isPending}
            >
              {manualMatchMutation.isPending ? "매칭 중..." : "매칭 확정"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
