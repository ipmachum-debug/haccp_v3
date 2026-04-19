import { useState } from "react";
import { useRoute, useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  FileText,
  Lock,
  CheckCircle,
  AlertCircle,
  Download,
  RefreshCw,
} from "lucide-react";

export default function AccountingMonthlySummaryDetail() {
  const [, params] = useRoute("/accounting/monthly-summary/:year/:month");
  const [, setLocation] = useLocation();
  
  const year = parseInt(params?.year || "0");
  const month = parseInt(params?.month || "0");

  const { data: detail, isLoading, refetch } = trpc.accountingMonthly.getDetail.useQuery({
    year,
    month,
  });

  const confirmMutation = trpc.accountingMonthly.confirmClose.useMutation({
    onSuccess: () => {
      toast.success("월 마감이 확정되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`확정 실패: ${error.message}`);
    },
  });

  const lockMutation = trpc.accountingMonthly.lockClose.useMutation({
    onSuccess: () => {
      toast.success("월 마감이 잠금되었습니다. 더 이상 수정할 수 없습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`잠금 실패: ${error.message}`);
    },
  });

  const generatePDFMutation = trpc.accountingMonthly.generatePDF.useMutation({
    onSuccess: (data: any) => {
      toast.success("PDF 리포트가 생성되었습니다.");
      refetch();
      // TODO: 실제 PDF 다운로드 로직
      window.open(data.fileUrl, "_blank");
    },
    onError: (error: { message: string }) => {
      toast.error(`PDF 생성 실패: ${error.message}`);
    },
  });

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
    }).format(num);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="gap-1"><AlertCircle className="h-3 w-3" />임시저장</Badge>;
      case "confirmed":
        return <Badge variant="default" className="gap-1 bg-blue-500"><CheckCircle className="h-3 w-3" />확정</Badge>;
      case "locked":
        return <Badge variant="secondary" className="gap-1"><Lock className="h-3 w-3" />잠금</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">로딩 중...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!detail) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-64">
          <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">월 마감 데이터를 찾을 수 없습니다.</p>
          <Button className="mt-4" onClick={() => setLocation("/accounting/monthly-summary")}>
            목록으로 돌아가기
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const missingDays = detail.missingDays && detail.missingDays.length > 0 ? detail.missingDays : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {detail.year}년 {detail.month}월 마감
            </h1>
            <p className="text-muted-foreground mt-1">
              월간 집계 및 고액 거래 상세 정보
            </p>
          </div>
          <div className="flex gap-2">
            {getStatusBadge(detail.status)}
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          {detail.status === "draft" && (
            <Button
              onClick={() => confirmMutation.mutate({ year, month })}
              disabled={confirmMutation.isPending}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {confirmMutation.isPending ? "확정 중..." : "월 마감 확정"}
            </Button>
          )}
          {detail.status === "confirmed" && (
            <Button
              onClick={() => lockMutation.mutate({ year, month })}
              disabled={lockMutation.isPending}
              variant="secondary"
            >
              <Lock className="mr-2 h-4 w-4" />
              {lockMutation.isPending ? "잠금 중..." : "월 마감 잠금"}
            </Button>
          )}
          <Button
            onClick={() => generatePDFMutation.mutate({ year, month })}
            disabled={generatePDFMutation.isPending}
            variant="outline"
          >
            <FileText className="mr-2 h-4 w-4" />
            {generatePDFMutation.isPending ? "생성 중..." : "PDF 리포트 생성"}
          </Button>
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            새로고침
          </Button>
        </div>

        {/* 월간 집계 요약 */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                총 입금
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(detail.totalDeposit)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                총 출금
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(detail.totalWithdrawal)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">순현금흐름</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${parseFloat(detail.netCashFlow) >= 0 ? "text-blue-600" : "text-red-600"}`}>
                {formatCurrency(detail.netCashFlow)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 마감 현황 */}
        <Card>
          <CardHeader>
            <CardTitle>마감 현황</CardTitle>
            <CardDescription>
              {detail.year}년 {detail.month}월 일일 마감 현황
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold">{detail.totalDays}일</div>
                <div className="text-sm text-muted-foreground">전체 영업일</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{detail.closedDays}일</div>
                <div className="text-sm text-muted-foreground">마감 완료</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{missingDays.length}일</div>
                <div className="text-sm text-muted-foreground">마감 누락</div>
              </div>
            </div>

            {missingDays.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950 p-4 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-red-900 dark:text-red-100">
                      마감 누락일: {missingDays.join(", ")}
                    </p>
                    <p className="mt-1 text-red-700 dark:text-red-300">
                      해당 날짜의 일일 마감을 완료해주세요.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 고액 거래 목록 */}
        {detail.highAmountTransactions && detail.highAmountTransactions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>고액 거래 목록</CardTitle>
              <CardDescription>
                {detail.highAmountThreshold ? formatCurrency(detail.highAmountThreshold) : ""} 이상의 거래 내역
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>구분</TableHead>
                    <TableHead>거래처/메모</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.highAmountTransactions.map((tx: any) => (
                    <TableRow key={tx.id}>
                      <TableCell>{tx.transactionDate}</TableCell>
                      <TableCell>
                        <Badge variant={tx.transactionType === "deposit" ? "default" : "secondary"}>
                          {tx.transactionType === "deposit" ? "입금" : "출금"}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {tx.counterparty || (tx as any).memo || "-"}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(tx.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* PDF 리포트 목록 */}
        {detail.reports && detail.reports.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>생성된 리포트</CardTitle>
              <CardDescription>
                월 마감 PDF 리포트 다운로드
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {detail.reports.map((report: any) => (
                  <div key={report.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{report.fileName}</div>
                        <div className="text-sm text-muted-foreground">
                          생성일: {new Date(report.generatedAt).toLocaleString("ko-KR")}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(report.fileUrl, "_blank")}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      다운로드
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
