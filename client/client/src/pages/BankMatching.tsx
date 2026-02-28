import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Building2, Upload, CheckCircle, XCircle, Plus } from "lucide-react";
import * as XLSX from "xlsx";

export default function BankMatching() {
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);

  // 계좌 목록 조회
  const { data: accounts = [], refetch: refetchAccounts } = trpc.bankAccounts.list.useQuery();

  // 거래 내역 조회
  const { data: transactions = [], refetch: refetchTransactions } = trpc.bankTransactions.list.useQuery(
    { bankAccountId: selectedAccountId || undefined },
    { enabled: !!selectedAccountId }
  );

  // 통계
  const { data: stats } = trpc.bankTransactions.stats.useQuery(
    { bankAccountId: selectedAccountId || 0 },
    { enabled: !!selectedAccountId }
  );

  // 계좌 생성
  const createAccountMutation = trpc.bankAccounts.create.useMutation({
    onSuccess: () => {
      toast.success("계좌가 등록되었습니다");
      setShowAccountDialog(false);
      refetchAccounts();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 거래 업로드
  const uploadMutation = trpc.bankTransactions.upload.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.inserted}건 업로드 완료 (중복 ${result.duplicates}건)`);
      setShowUploadDialog(false);
      setUploadFile(null);
      setParsedData([]);
      refetchTransactions();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 자동 매칭
  const autoMatchMutation = trpc.bankTransactions.autoMatch.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.matched}건 자동 매칭 완료`);
      refetchTransactions();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 수동 매칭
  const manualMatchMutation = trpc.bankTransactions.manualMatch.useMutation({
    onSuccess: () => {
      toast.success("매칭이 완료되었습니다");
      refetchTransactions();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // 엑셀 파일 파싱
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        // 데이터 변환 (은행별 컬럼명 매핑 필요)
        const parsed = json.map((row: any) => ({
          occurredAt: row["거래일시"] || row["거래일"] || "",
          direction: row["입출금"] === "입금" || row["입금"] ? "in" : "out",
          amount: String(row["거래금액"] || row["금액"] || 0),
          counterparty: row["거래처"] || row["적요"] || "",
          memo: row["메모"] || row["비고"] || "",
          balance: String(row["잔액"] || 0),
        }));

        setParsedData(parsed);
        toast.success(`${parsed.length}건의 거래 내역을 읽었습니다`);
      } catch (error) {
        toast.error("파일 파싱 실패");
        console.error(error);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 계좌 등록 폼 제출
  const handleCreateAccount = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createAccountMutation.mutate({
      bankName: formData.get("bankName") as string,
      accountNumber: formData.get("accountNumber") as string,
      ownerName: formData.get("ownerName") as string,
      accountType: (formData.get("accountType") as "checking" | "savings" | "corporate") || "checking",
    });
  };

  // 거래 업로드 제출
  const handleUploadTransactions = () => {
    if (!selectedAccountId || parsedData.length === 0) {
      toast.error("계좌를 선택하고 파일을 업로드해주세요");
      return;
    }

    uploadMutation.mutate({
      bankAccountId: selectedAccountId,
      transactions: parsedData,
    });
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">은행 거래 매칭</h1>
          <p className="text-muted-foreground mt-1">통장 거래 내역을 업로드하고 매입/매출과 자동 매칭</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowAccountDialog(true)}>
            <Plus className="w-4 h-4 mr-2" />
            계좌 등록
          </Button>
        </div>
      </div>

      {/* 계좌 선택 */}
      <Card>
        <CardHeader>
          <CardTitle>은행 계좌 선택</CardTitle>
          <CardDescription>매칭할 은행 계좌를 선택해주세요</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <Card
                key={account.id}
                className={`cursor-pointer transition-all ${
                  selectedAccountId === account.id ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => setSelectedAccountId(account.id)}
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-semibold">{account.bankName}</p>
                      <p className="text-sm text-muted-foreground">{account.accountNumber}</p>
                      {account.ownerName && (
                        <p className="text-xs text-muted-foreground mt-1">{account.ownerName}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 통계 */}
      {selectedAccountId && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">전체 거래</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">매칭 완료</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.matched}건</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">미매칭</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.unmatched}건</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 거래 내역 */}
      {selectedAccountId && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>거래 내역</CardTitle>
                <CardDescription>은행 거래 내역 및 매칭 상태</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setShowUploadDialog(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  엑셀 업로드
                </Button>
                <Button
                  variant="outline"
                  onClick={() => autoMatchMutation.mutate({ bankAccountId: selectedAccountId })}
                  disabled={autoMatchMutation.isPending}
                >
                  자동 매칭
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>거래일시</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>거래처</TableHead>
                  <TableHead>메모</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead className="text-right">잔액</TableHead>
                  <TableHead>매칭 상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      거래 내역이 없습니다. 엑셀 파일을 업로드해주세요.
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>{new Date(tx.occurredAt).toLocaleString("ko-KR")}</TableCell>
                      <TableCell>
                        <Badge variant={tx.direction === "in" ? "default" : "secondary"}>
                          {tx.direction === "in" ? "입금" : "출금"}
                        </Badge>
                      </TableCell>
                      <TableCell>{tx.counterpartyText || "-"}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{tx.memo || "-"}</TableCell>
                      <TableCell className="text-right font-mono">
                        {Number(tx.amount).toLocaleString()}원
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {tx.balance ? Number(tx.balance).toLocaleString() + "원" : "-"}
                      </TableCell>
                      <TableCell>
                        {tx.matchedLedgerType ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {tx.matchedLedgerType === "ap" ? "매입" : "매출"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <XCircle className="w-3 h-3" />
                            미매칭
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 계좌 등록 다이얼로그 */}
      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>은행 계좌 등록</DialogTitle>
            <DialogDescription>새 은행 계좌를 등록합니다</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateAccount}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="bankName">은행명</Label>
                <Input id="bankName" name="bankName" placeholder="예: 신한은행" required />
              </div>
              <div>
                <Label htmlFor="accountNumber">계좌번호</Label>
                <Input id="accountNumber" name="accountNumber" placeholder="예: 110-123-456789" required />
              </div>
              <div>
                <Label htmlFor="ownerName">예금주</Label>
                <Input id="ownerName" name="ownerName" placeholder="예: 홍길동" />
              </div>
              <div>
                <Label htmlFor="accountType">계좌 유형</Label>
                <Select name="accountType" defaultValue="checking">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">보통예금</SelectItem>
                    <SelectItem value="savings">저축예금</SelectItem>
                    <SelectItem value="corporate">법인계좌</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setShowAccountDialog(false)}>
                취소
              </Button>
              <Button type="submit" disabled={createAccountMutation.isPending}>
                등록
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 거래 업로드 다이얼로그 */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>은행 거래 내역 업로드</DialogTitle>
            <DialogDescription>엑셀 파일을 업로드하여 거래 내역을 등록합니다</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="uploadFile">엑셀 파일 선택</Label>
              <Input id="uploadFile" type="file" accept=".xlsx,.xls" onChange={handleFileUpload} />
              <p className="text-xs text-muted-foreground mt-1">
                은행에서 다운로드한 거래 내역 엑셀 파일을 업로드해주세요
              </p>
            </div>

            {parsedData.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">미리보기 ({parsedData.length}건)</p>
                <div className="border rounded-md max-h-[300px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>거래일시</TableHead>
                        <TableHead>구분</TableHead>
                        <TableHead>거래처</TableHead>
                        <TableHead className="text-right">금액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedData.slice(0, 10).map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{row.occurredAt}</TableCell>
                          <TableCell>
                            <Badge variant={row.direction === "in" ? "default" : "secondary"}>
                              {row.direction === "in" ? "입금" : "출금"}
                            </Badge>
                          </TableCell>
                          <TableCell>{row.counterparty}</TableCell>
                          <TableCell className="text-right">{Number(row.amount).toLocaleString()}원</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {parsedData.length > 10 && (
                  <p className="text-xs text-muted-foreground mt-2">... 외 {parsedData.length - 10}건</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowUploadDialog(false)}>
              취소
            </Button>
            <Button
              onClick={handleUploadTransactions}
              disabled={uploadMutation.isPending || parsedData.length === 0}
            >
              업로드
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
