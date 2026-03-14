import { useState, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Download, TrendingUp, TrendingDown, DollarSign, Calendar, Filter, Edit, Trash2, BarChart3, FileText } from "lucide-react";
import * as XLSX from "xlsx";

export default function AccountingManagement() {
  return (
    <DashboardLayout>
      <AccountingManagementContent />
    </DashboardLayout>
  );
}

function AccountingManagementContent() {
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [transactionForm, setTransactionForm] = useState({
    transactionDate: new Date().toISOString().split("T")[0],
    type: "expense" as "income" | "expense",
    amount: "",
    categoryId: "",
    description: "",
  });

  // 필터 상태
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0],
    endDate: new Date().toISOString().split("T")[0],
    type: "all" as "all" | "income" | "expense",
    categoryId: "all",
  });

  // 데이터 조회
  const { data: categories = [] } = trpc.accounting.getCategories.useQuery();
  const { data: transactions = [], refetch: refetchTransactions } = trpc.accounting.listTransactions.useQuery({
    startDate: filters.startDate,
    endDate: filters.endDate,
    type: filters.type === "all" ? undefined : filters.type,
    categoryId: filters.categoryId === "all" ? undefined : Number(filters.categoryId),
  });

  const { data: financialOverview } = trpc.accounting.getFinancialOverview.useQuery({
    startDate: filters.startDate,
    endDate: filters.endDate,
  });

  const { data: expenseBreakdown = [] } = trpc.accounting.getCategoryBreakdown.useQuery({
    startDate: filters.startDate,
    endDate: filters.endDate,
    type: "expense",
  });

  // Mutations
  const createMutation = trpc.accounting.createTransaction.useMutation({
    onSuccess: () => {
      toast.success("거래가 등록되었습니다");
      setTransactionDialogOpen(false);
      resetForm();
      refetchTransactions();
    },
    onError: (error: any) => {
      toast.error(`거래 등록 실패: ${error.message}`);
    },
  });

  const updateMutation = trpc.accounting.updateTransaction.useMutation({
    onSuccess: () => {
      toast.success("거래가 수정되었습니다");
      setTransactionDialogOpen(false);
      setEditingTransaction(null);
      resetForm();
      refetchTransactions();
    },
    onError: (error: any) => {
      toast.error(`거래 수정 실패: ${error.message}`);
    },
  });

  const deleteMutation = trpc.accounting.deleteTransaction.useMutation({
    onSuccess: () => {
      toast.success("거래가 삭제되었습니다");
      refetchTransactions();
    },
    onError: (error: any) => {
      toast.error(`거래 삭제 실패: ${error.message}`);
    },
  });

  const initializeMutation = trpc.accounting.initializeCategories.useMutation({
    onSuccess: () => {
      toast.success("기본 계정 과목이 초기화되었습니다");
      window.location.reload();
    },
    onError: (error: any) => {
      toast.error(`초기화 실패: ${error.message}`);
    },
  });

  const resetForm = () => {
    setTransactionForm({
      transactionDate: new Date().toISOString().split("T")[0],
      type: "expense",
      amount: "",
      categoryId: "",
      description: "",
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transactionForm.amount || !transactionForm.categoryId) {
      toast.error("금액과 계정 과목은 필수입니다");
      return;
    }

    if (editingTransaction) {
      updateMutation.mutate({
        id: editingTransaction.id,
        ...transactionForm,
        categoryId: Number(transactionForm.categoryId),
      });
    } else {
      createMutation.mutate({
        ...transactionForm,
        categoryId: Number(transactionForm.categoryId),
      });
    }
  };

  const handleEdit = (transaction: any) => {
    setEditingTransaction(transaction);
    setTransactionForm({
      transactionDate: transaction.transactionDate,
      type: transaction.type,
      amount: transaction.amount,
      categoryId: String(transaction.categoryId),
      description: transaction.description || "",
    });
    setTransactionDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("정말 이 거래를 삭제하시겠습니까?")) {
      deleteMutation.mutate({ id });
    }
  };

  const handleExportExcel = () => {
    const exportData = transactions.map((t: any) => ({
      거래일자: t.transactionDate,
      구분: t.type === "income" ? "수입" : "지출",
      계정과목: `[${t.categoryCode}] ${t.categoryName}`,
      금액: Number(t.amount),
      내용: t.description || "",
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "거래내역");
    XLSX.writeFile(wb, `거래내역_${filters.startDate}_${filters.endDate}.xlsx`);
    toast.success("엑셀 파일이 다운로드되었습니다");
  };

  // 계정 과목별 지출 비율 계산
  const expenseChartData = useMemo(() => {
    const total = expenseBreakdown.reduce((sum: any, item: any) => sum + (item.totalAmount || 0), 0);
    return expenseBreakdown.map((item: any) => ({
      ...item,
      percentage: total > 0 ? ((item.totalAmount || 0) / total * 100).toFixed(1) : "0",
    }));
  }, [expenseBreakdown]);

  // 카테고리 필터링 (수입/지출 구분)
  const filteredCategories = useMemo(() => {
    return categories.filter((cat: any) => cat.type === transactionForm.type);
  }, [categories, transactionForm.type]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">회계 관리</h1>
          <p className="text-muted-foreground">수입/지출 관리 및 재무 현황</p>
        </div>
        <div className="flex gap-2">
          {categories.length === 0 && (
            <Button onClick={() => initializeMutation.mutate()} variant="outline">
              계정 과목 초기화
            </Button>
          )}
          <Dialog open={transactionDialogOpen} onOpenChange={(open) => {
            setTransactionDialogOpen(open);
            if (!open) {
              setEditingTransaction(null);
              resetForm();
            }
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                거래 등록
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingTransaction ? "거래 수정" : "거래 등록"}</DialogTitle>
                <DialogDescription>
                  {editingTransaction ? "거래 정보를 수정합니다" : "새로운 수입/지출 거래를 등록합니다"}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="transactionDate">거래 일자</Label>
                  <Input
                    id="transactionDate"
                    type="date"
                    value={transactionForm.transactionDate}
                    onChange={(e) => setTransactionForm({ ...transactionForm, transactionDate: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="type">구분</Label>
                  <Select
                    value={transactionForm.type}
                    onValueChange={(value: "income" | "expense") => setTransactionForm({ ...transactionForm, type: value, categoryId: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">수입</SelectItem>
                      <SelectItem value="expense">지출</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="categoryId">계정 과목</Label>
                  <Select
                    value={transactionForm.categoryId}
                    onValueChange={(value) => setTransactionForm({ ...transactionForm, categoryId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="계정 과목 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredCategories.map((cat: any) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          [{cat.code}] {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="amount">금액</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={transactionForm.amount}
                    onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">내용/메모</Label>
                  <Textarea
                    id="description"
                    value={transactionForm.description}
                    onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })}
                    placeholder="거래 내용을 입력하세요"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setTransactionDialogOpen(false)}>
                    취소
                  </Button>
                  <Button type="submit">
                    {editingTransaction ? "수정" : "등록"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 재무 현황 요약 */}
      {financialOverview && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">총 수입</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                ₩{Number(financialOverview.totalIncome || 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {financialOverview.incomeCount}건
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">총 지출</CardTitle>
              <TrendingDown className="h-4 w-4 text-red-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                ₩{Number(financialOverview.totalExpense || 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {financialOverview.expenseCount}건
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">순이익</CardTitle>
              <DollarSign className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${financialOverview.netCashFlow >= 0 ? "text-blue-600" : "text-red-600"}`}>
                ₩{Number(financialOverview.netCashFlow || 0).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                총 {financialOverview.totalCount}건
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            대시보드
          </TabsTrigger>
          <TabsTrigger value="transactions">
            <DollarSign className="h-4 w-4 mr-2" />
            거래 관리
          </TabsTrigger>
          <TabsTrigger value="analysis">
            <TrendingUp className="h-4 w-4 mr-2" />
            분석
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileText className="h-4 w-4 mr-2" />
            리포트
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          {/* 필터 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                필터
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="filterStartDate">시작일</Label>
                  <Input
                    id="filterStartDate"
                    type="date"
                    value={filters.startDate}
                    onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="filterEndDate">종료일</Label>
                  <Input
                    id="filterEndDate"
                    type="date"
                    value={filters.endDate}
                    onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="filterType">구분</Label>
                  <Select
                    value={filters.type}
                    onValueChange={(value: "all" | "income" | "expense") => setFilters({ ...filters, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      <SelectItem value="income">수입</SelectItem>
                      <SelectItem value="expense">지출</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="filterCategory">계정 과목</Label>
                  <Select
                    value={filters.categoryId}
                    onValueChange={(value) => setFilters({ ...filters, categoryId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="전체" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {categories.map((cat: any) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                          [{cat.code}] {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={handleExportExcel} variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  엑셀 다운로드
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 거래 내역 테이블 */}
          <Card>
            <CardHeader>
              <CardTitle>거래 내역</CardTitle>
              <CardDescription>
                총 {transactions.length}건의 거래
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>거래일자</TableHead>
                    <TableHead>구분</TableHead>
                    <TableHead>계정 과목</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead>내용</TableHead>
                    <TableHead className="text-right">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        거래 내역이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((transaction: any) => (
                      <TableRow key={transaction.id}>
                        <TableCell>{transaction.transactionDate}</TableCell>
                        <TableCell>
                          <Badge variant={transaction.type === "income" ? "default" : "destructive"}>
                            {transaction.type === "income" ? "수입" : "지출"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{transaction.categoryName}</span>
                            <span className="text-xs text-muted-foreground">[{transaction.categoryCode}]</span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-right font-medium ${transaction.type === "income" ? "text-green-600" : "text-red-600"}`}>
                          {transaction.type === "income" ? "+" : "-"}₩{Number(transaction.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {transaction.description || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEdit(transaction)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDelete(transaction.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>계정 과목별 지출 분석</CardTitle>
              <CardDescription>
                {filters.startDate} ~ {filters.endDate}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>계정 과목</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                    <TableHead className="text-right">비율</TableHead>
                    <TableHead className="text-right">거래 건수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenseChartData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        지출 내역이 없습니다
                      </TableCell>
                    </TableRow>
                  ) : (
                    expenseChartData.map((item: any) => (
                      <TableRow key={item.categoryId}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{item.categoryName}</span>
                            <span className="text-xs text-muted-foreground">[{item.categoryCode}]</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₩{Number(item.totalAmount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline">{item.percentage}%</Badge>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {item.transactionCount}건
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 대시보드 탭 */}
        <TabsContent value="dashboard" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>최근 거래 내역</CardTitle>
              <CardDescription>최근 10건의 거래 내역</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>구분</TableHead>
                    <TableHead>계정 과목</TableHead>
                    <TableHead className="text-right">금액</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.slice(0, 10).map((transaction: any) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{transaction.transactionDate}</TableCell>
                      <TableCell>
                        <Badge variant={transaction.type === "income" ? "default" : "destructive"}>
                          {transaction.type === "income" ? "수입" : "지출"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        [{transaction.categoryCode}] {transaction.categoryName}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ₩{Number(transaction.amount).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 리포트 탭 */}
        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>재무 리포트</CardTitle>
              <CardDescription>월간/연간 재무제표 및 리포트 다운로드</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary" onClick={() => window.location.href = '/dashboard/accounting/financial-reports'}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-blue-600" />
                        시산표 (Trial Balance)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">계정 과목별 차변/대변 합계와 잔액을 확인합니다</p>
                    </CardContent>
                  </Card>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary" onClick={() => window.location.href = '/dashboard/accounting/financial-reports'}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-5 w-5 text-green-600" />
                        재무상태표 (Balance Sheet)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">자산, 부채, 자본의 현재 상태를 확인합니다</p>
                    </CardContent>
                  </Card>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary" onClick={() => window.location.href = '/dashboard/accounting/financial-reports'}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-purple-600" />
                        손익계산서 (Income Statement)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">수익과 비용을 비교하여 순이익을 산출합니다</p>
                    </CardContent>
                  </Card>
                  <Card className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-primary" onClick={() => window.location.href = '/dashboard/accounting/financial-reports'}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Download className="h-5 w-5 text-orange-600" />
                        엑셀 내보내기
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">시산표, 재무상태표, 손익계산서를 Excel로 다운로드합니다</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="pt-2">
                  <Button onClick={() => window.location.href = '/dashboard/accounting/financial-reports'} className="w-full">
                    <FileText className="h-4 w-4 mr-2" />
                    재무 리포트 전체 보기
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
