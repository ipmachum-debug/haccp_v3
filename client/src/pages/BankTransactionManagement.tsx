import React, { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, Download, Filter, RefreshCw, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

export default function BankTransactionManagement() {
  const [selectedAccountId, setSelectedAccountId] = useState<number | undefined>();
  const [matchStatus, setMatchStatus] = useState<"unmatched" | "matched" | "all">("all");
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const { data: accounts } = trpc.bankAccount.list.useQuery({ isActive: "Y" });
  const { data: transactions, refetch } = trpc.bankTransaction.list.useQuery({
    bankAccountId: selectedAccountId,
    matchStatus,
    page: 1,
    pageSize: 100,
  });

  const bulkUploadMutation = trpc.bankTransactionBulk.bulkUploadFromExcel.useMutation();
  const runAutoMatchMutation = trpc.bankTransactionBulk.runAutoMatch.useMutation();
  const approveMutation = trpc.bankTransaction.approve.useMutation();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !selectedAccountId) {
      toast.error("파일과 계좌를 선택해주세요.");
      return;
    }

    try {
      // 파일을 base64로 변환
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result?.toString().split(",")[1];
        if (!base64) {
          toast.error("파일 읽기 실패");
          return;
        }

        try {
          const result = await bulkUploadMutation.mutateAsync({
            fileData: base64,
            bankAccountId: selectedAccountId,
            autoMatch: true,
          });

          setUploadResult(result);
          
          if (result.success > 0) {
            toast.success(`${result.success}건 업로드 완료 (자동 매칭: ${result.autoMatched}건)`);
            refetch();
          }
          
          if (result.failed > 0 || result.skipped > 0) {
            toast.warning(`실패: ${result.failed}건, 중복: ${result.skipped}건`);
          }
        } catch (error: any) {
          toast.error(error.message || "업로드 실패");
        }
      };
      reader.readAsDataURL(uploadFile);
    } catch (error: any) {
      toast.error(error.message || "파일 처리 실패");
    }
  };

  const handleRunAutoMatch = async () => {
    if (!selectedAccountId) {
      toast.error("계좌를 선택해주세요.");
      return;
    }

    try {
      const result = await runAutoMatchMutation.mutateAsync({
        bankAccountId: selectedAccountId,
      });
      
      toast.success(`${result.matched}건 자동 매칭 완료`);
      refetch();
    } catch (error: any) {
      toast.error(error.message || "자동 매칭 실패");
    }
  };

  const handleApprove = async (id: number, amount: number, isHighAmount: boolean) => {
    try {
      await approveMutation.mutateAsync({
        id,
        confirmedAmount: isHighAmount ? amount : undefined,
      });
      
      toast.success("승인되었습니다.");
      refetch();
    } catch (error: any) {
      toast.error(error.message || "승인 실패");
    }
  };

  const downloadTemplate = () => {
    const template = [
      {
        "거래일시": "2024-01-01",
        "거래유형": "입금",
        "금액": 1000000,
        "잔액": 5000000,
        "적요": "매출 입금",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "거래내역");
    XLSX.writeFile(wb, "은행거래_업로드_템플릿.xlsx");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">은행 거래 내역</h1>
            <p className="text-gray-500 mt-1">은행 거래 내역을 조회하고 관리합니다</p>
          </div>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              템플릿 다운로드
            </Button>
            
            <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Upload className="w-4 h-4 mr-2" />
                  엑셀 업로드
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>거래 내역 일괄 업로드</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>계좌 선택 *</Label>
                    <Select value={selectedAccountId?.toString()} onValueChange={(v) => setSelectedAccountId(Number(v))}>
                      <SelectTrigger>
                        <SelectValue placeholder="계좌를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts?.map((account: any) => (
                          <SelectItem key={account.id} value={account.id.toString()}>
                            {account.bankName} - {account.accountNo}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>파일 선택 *</Label>
                    <Input type="file" accept=".xlsx,.xls" onChange={handleFileChange} />
                    <p className="text-sm text-gray-500 mt-1">
                      Excel 파일 (.xlsx, .xls)만 업로드 가능합니다.
                    </p>
                  </div>

                  {uploadResult && (
                    <Card>
                      <CardHeader>
                        <CardTitle>업로드 결과</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5 text-green-500" />
                          <span>성공: {uploadResult.success}건</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <RefreshCw className="w-5 h-5 text-blue-500" />
                          <span>자동 매칭: {uploadResult.autoMatched}건</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <XCircle className="w-5 h-5 text-red-500" />
                          <span>실패: {uploadResult.failed}건</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <AlertCircle className="w-5 h-5 text-yellow-500" />
                          <span>중복: {uploadResult.skipped}건</span>
                        </div>

                        {uploadResult.errors.length > 0 && (
                          <div className="mt-4">
                            <p className="font-semibold mb-2">오류 내역:</p>
                            <div className="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded text-sm">
                              {uploadResult.errors.map((error: string, idx: number) => (
                                <div key={idx} className="text-red-600">{error}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                      닫기
                    </Button>
                    <Button onClick={handleUpload} disabled={!uploadFile || !selectedAccountId || bulkUploadMutation.isLoading}>
                      {bulkUploadMutation.isLoading ? "업로드 중..." : "업로드"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* 필터 */}
        <div className="flex gap-2">
          <Select value={selectedAccountId?.toString() || "all"} onValueChange={(v) => setSelectedAccountId(v === "all" ? undefined : Number(v))}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="계좌 선택" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 계좌</SelectItem>
              {accounts?.map((account: any) => (
                <SelectItem key={account.id} value={account.id.toString()}>
                  {account.bankName} - {account.accountNo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={matchStatus} onValueChange={(v: any) => setMatchStatus(v)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              <SelectItem value="unmatched">미매칭</SelectItem>
              <SelectItem value="matched">매칭 완료</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleRunAutoMatch} disabled={!selectedAccountId}>
            <RefreshCw className="w-4 h-4 mr-2" />
            자동 매칭 실행
          </Button>
        </div>

        {/* 거래 내역 */}
        <Card>
          <CardHeader>
            <CardTitle>거래 내역 ({transactions?.total || 0}건)</CardTitle>
            <CardDescription>
              미매칭: {transactions?.data.filter((t: any) => t.transaction.matchStatus === "unmatched").length || 0}건
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>거래일시</TableHead>
                  <TableHead>유형</TableHead>
                  <TableHead className="text-right">금액</TableHead>
                  <TableHead>적요</TableHead>
                  <TableHead>매칭 상태</TableHead>
                  <TableHead>계정 과목</TableHead>
                  <TableHead>승인 상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                      거래 내역이 없습니다
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions?.data.map((item: any) => {
                    const tx = item.transaction;
                    return (
                      <TableRow key={tx.id}>
                        <TableCell>{new Date(tx.txDate).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Badge variant={tx.transactionType === "deposit" ? "default" : "destructive"}>
                            {tx.transactionType === "deposit" ? "입금" : "출금"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(tx.amount).toLocaleString()}원
                          {tx.isHighAmount === "Y" && (
                            <Badge variant="outline" className="ml-2">고액</Badge>
                          )}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{tx.description || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={tx.matchStatus === "matched" ? "default" : "secondary"}>
                            {tx.matchStatus === "matched" ? "완료" : "미매칭"}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.accountingAccount?.name || "-"}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              tx.approvalStatus === "approved" ? "default" :
                              tx.approvalStatus === "rejected" ? "destructive" : "secondary"
                            }
                          >
                            {tx.approvalStatus === "approved" ? "승인" :
                             tx.approvalStatus === "rejected" ? "반려" : "대기"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {tx.approvalStatus === "pending" && (
                            <Button
                              size="sm"
                              onClick={() => handleApprove(tx.id, Number(tx.amount), tx.isHighAmount === "Y")}
                            >
                              승인
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
