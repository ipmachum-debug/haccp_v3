import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, BarChart3, PieChart, CheckCircle, AlertTriangle, Download, Settings } from "lucide-react";

// Excel 다운로드 헬퍼
function downloadBase64File(base64: string, filename: string, mimeType: string) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ko-KR", { style: "decimal" }).format(Math.round(amount));
}

const CATEGORY_LABELS: Record<string, string> = {
  assets: "자산",
  liabilities: "부채",
  equity: "자본",
  revenue: "수익",
  expenses: "비용",
};

const CATEGORY_COLORS: Record<string, string> = {
  assets: "bg-blue-100 text-blue-800",
  liabilities: "bg-red-100 text-red-800",
  equity: "bg-purple-100 text-purple-800",
  revenue: "bg-green-100 text-green-800",
  expenses: "bg-orange-100 text-orange-800",
};

export default function FinancialReports() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");

  const [startDate, setStartDate] = useState(`${year}-01-01`);
  const [endDate, setEndDate] = useState(`${year}-${month}-${String(now.getDate()).padStart(2, "0")}`);
  const [activeTab, setActiveTab] = useState("trial-balance");
  const [fetchEnabled, setFetchEnabled] = useState(false);

  // 시산표
  const trialBalance = trpc.financialReports.trialBalance.useQuery(
    { startDate, endDate },
    { enabled: fetchEnabled && activeTab === "trial-balance" }
  );

  // 재무상태표
  const balanceSheet = trpc.financialReports.balanceSheet.useQuery(
    { asOfDate: endDate },
    { enabled: fetchEnabled && activeTab === "balance-sheet" }
  );

  // 손익계산서
  const incomeStatement = trpc.financialReports.incomeStatement.useQuery(
    { startDate, endDate },
    { enabled: fetchEnabled && activeTab === "income-statement" }
  );

  const handleGenerate = () => {
    setFetchEnabled(true);
  };

  // Excel 내보내기 뮤테이션
  const exportTrialBalanceMut = trpc.financialReports.exportTrialBalance.useMutation({
    onSuccess: (result: any) => downloadBase64File(result.data, result.filename, result.mimeType),
  });
  const exportBalanceSheetMut = trpc.financialReports.exportBalanceSheet.useMutation({
    onSuccess: (result: any) => downloadBase64File(result.data, result.filename, result.mimeType),
  });
  const exportIncomeStatementMut = trpc.financialReports.exportIncomeStatement.useMutation({
    onSuccess: (result: any) => downloadBase64File(result.data, result.filename, result.mimeType),
  });

  const handleExportExcel = () => {
    if (activeTab === "trial-balance") {
      exportTrialBalanceMut.mutate({ startDate, endDate });
    } else if (activeTab === "balance-sheet") {
      exportBalanceSheetMut.mutate({ asOfDate: endDate });
    } else if (activeTab === "income-statement") {
      exportIncomeStatementMut.mutate({ startDate, endDate });
    }
  };

  const isExporting = exportTrialBalanceMut.isPending || exportBalanceSheetMut.isPending || exportIncomeStatementMut.isPending;

  return (
    <DashboardLayout>
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">재무보고서</h1>
          <p className="text-muted-foreground text-sm mt-1">
            시산표, 재무상태표, 손익계산서를 조회합니다.
          </p>
        </div>
      </div>

      {/* 기간 설정 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">시작일</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => { setStartDate(e.target.value); setFetchEnabled(false); }}
                className="w-44"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">종료일</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => { setEndDate(e.target.value); setFetchEnabled(false); }}
                className="w-44"
              />
            </div>
            <Button onClick={handleGenerate}>
              <FileText className="mr-2 h-4 w-4" />
              보고서 생성
            </Button>
            {fetchEnabled && (
              <Button variant="outline" onClick={handleExportExcel} disabled={isExporting}>
                {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Excel 내보내기
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setStartDate(`${year}-01-01`); setEndDate(`${year}-12-31`); setFetchEnabled(false); }}
              >
                올해
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStartDate(`${year}-${month}-01`);
                  setEndDate(`${year}-${month}-${String(now.getDate()).padStart(2, "0")}`);
                  setFetchEnabled(false);
                }}
              >
                이번 달
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 탭 */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); }}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trial-balance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            시산표
          </TabsTrigger>
          <TabsTrigger value="balance-sheet" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            재무상태표
          </TabsTrigger>
          <TabsTrigger value="income-statement" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            손익계산서
          </TabsTrigger>
          <TabsTrigger value="opening-balance" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            기초잔액
          </TabsTrigger>
        </TabsList>

        {/* 시산표 */}
        <TabsContent value="trial-balance">
          {!fetchEnabled ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              기간을 설정하고 "보고서 생성"을 클릭하세요.
            </CardContent></Card>
          ) : trialBalance.isLoading ? (
            <Card><CardContent className="py-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></CardContent></Card>
          ) : trialBalance.error ? (
            <Card><CardContent className="py-12 text-center text-destructive">오류: {trialBalance.error.message}</CardContent></Card>
          ) : trialBalance.data ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  시산표 (Trial Balance)
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    {trialBalance.data.period.startDate} ~ {trialBalance.data.period.endDate}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">계정코드</TableHead>
                      <TableHead>계정과목</TableHead>
                      <TableHead className="w-20">분류</TableHead>
                      <TableHead className="text-right w-36">차변 합계</TableHead>
                      <TableHead className="text-right w-36">대변 합계</TableHead>
                      <TableHead className="text-right w-36">차변 잔액</TableHead>
                      <TableHead className="text-right w-36">대변 잔액</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trialBalance.data.rows.map((row: any) => (
                      <TableRow key={row.accountCode}>
                        <TableCell className="font-mono text-sm">{row.accountCode}</TableCell>
                        <TableCell>{row.accountName}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={CATEGORY_COLORS[row.category] || ""}>
                            {CATEGORY_LABELS[row.category] || row.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.debitTotal)}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(row.creditTotal)}</TableCell>
                        <TableCell className="text-right font-mono">{row.debitBalance > 0 ? formatCurrency(row.debitBalance) : "-"}</TableCell>
                        <TableCell className="text-right font-mono">{row.creditBalance > 0 ? formatCurrency(row.creditBalance) : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-bold">
                      <TableCell colSpan={3}>합계</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(trialBalance.data.totals.totalDebit)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(trialBalance.data.totals.totalCredit)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(trialBalance.data.totals.totalDebitBalance)}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(trialBalance.data.totals.totalCreditBalance)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
                {trialBalance.data.rows.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">해당 기간에 거래 데이터가 없습니다.</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        {/* 재무상태표 */}
        <TabsContent value="balance-sheet">
          {!fetchEnabled ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              기간을 설정하고 "보고서 생성"을 클릭하세요.
            </CardContent></Card>
          ) : balanceSheet.isLoading ? (
            <Card><CardContent className="py-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></CardContent></Card>
          ) : balanceSheet.error ? (
            <Card><CardContent className="py-12 text-center text-destructive">오류: {balanceSheet.error.message}</CardContent></Card>
          ) : balanceSheet.data ? (
            <div className="space-y-4">
              {/* 대차 균형 체크 */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    {balanceSheet.data.totals.balanceCheck ? (
                      <><CheckCircle className="h-5 w-5 text-green-600" /><span className="text-green-700 font-medium">대차 균형: 정상</span></>
                    ) : (
                      <><AlertTriangle className="h-5 w-5 text-yellow-600" /><span className="text-yellow-700 font-medium">대차 불균형 주의</span></>
                    )}
                    <span className="text-muted-foreground text-sm ml-4">
                      기준일: {balanceSheet.data.asOfDate}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-blue-700">자산 (Assets)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-blue-900 mb-3">{formatCurrency(balanceSheet.data.totals.totalAssets)}원</div>
                    <div className="space-y-1.5">
                      {balanceSheet.data.assets.map((row: any) => (
                        <div key={row.accountCode} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{row.accountName}</span>
                          <span className="font-mono">{formatCurrency(row.debitTotal - row.creditTotal)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-red-700">부채 (Liabilities)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-red-900 mb-3">{formatCurrency(balanceSheet.data.totals.totalLiabilities)}원</div>
                    <div className="space-y-1.5">
                      {balanceSheet.data.liabilities.map((row: any) => (
                        <div key={row.accountCode} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{row.accountName}</span>
                          <span className="font-mono">{formatCurrency(row.creditTotal - row.debitTotal)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-purple-700">자본 (Equity)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-900 mb-3">{formatCurrency(balanceSheet.data.totals.totalEquity)}원</div>
                    <div className="space-y-1.5">
                      {balanceSheet.data.equity.map((row: any) => (
                        <div key={row.accountCode} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">{row.accountName}</span>
                          <span className="font-mono">{formatCurrency(row.creditTotal - row.debitTotal)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 등식 표시 */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-center gap-4 text-lg">
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground">자산</div>
                      <div className="font-bold text-blue-700">{formatCurrency(balanceSheet.data.totals.totalAssets)}원</div>
                    </div>
                    <span className="text-2xl">=</span>
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground">부채</div>
                      <div className="font-bold text-red-700">{formatCurrency(balanceSheet.data.totals.totalLiabilities)}원</div>
                    </div>
                    <span className="text-2xl">+</span>
                    <div className="text-center">
                      <div className="text-sm text-muted-foreground">자본</div>
                      <div className="font-bold text-purple-700">{formatCurrency(balanceSheet.data.totals.totalEquity)}원</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>

        {/* 손익계산서 */}
        <TabsContent value="income-statement">
          {!fetchEnabled ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              기간을 설정하고 "보고서 생성"을 클릭하세요.
            </CardContent></Card>
          ) : incomeStatement.isLoading ? (
            <Card><CardContent className="py-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></CardContent></Card>
          ) : incomeStatement.error ? (
            <Card><CardContent className="py-12 text-center text-destructive">오류: {incomeStatement.error.message}</CardContent></Card>
          ) : incomeStatement.data ? (
            <div className="space-y-4">
              {/* 당기순이익 요약 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-green-700">총 수익</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-900">
                      {formatCurrency(incomeStatement.data.totals.totalRevenue)}원
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-orange-700">총 비용</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-900">
                      {formatCurrency(incomeStatement.data.totals.totalExpenses)}원
                    </div>
                  </CardContent>
                </Card>
                <Card className={incomeStatement.data.totals.netIncome >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                  <CardHeader className="pb-2">
                    <CardTitle className={`text-base ${incomeStatement.data.totals.netIncome >= 0 ? "text-green-800" : "text-red-800"}`}>
                      당기순이익
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${incomeStatement.data.totals.netIncome >= 0 ? "text-green-900" : "text-red-900"}`}>
                      {formatCurrency(incomeStatement.data.totals.netIncome)}원
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 수익 상세 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-green-700">
                    수익 (Revenue)
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      {incomeStatement.data.period.startDate} ~ {incomeStatement.data.period.endDate}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">계정코드</TableHead>
                        <TableHead>계정과목</TableHead>
                        <TableHead className="text-right w-40">금액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incomeStatement.data.revenue.map((row: any) => (
                        <TableRow key={row.accountCode}>
                          <TableCell className="font-mono text-sm">{row.accountCode}</TableCell>
                          <TableCell>{row.accountName}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(row.creditTotal - row.debitTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="font-bold">
                        <TableCell colSpan={2}>수익 합계</TableCell>
                        <TableCell className="text-right font-mono text-green-700">{formatCurrency(incomeStatement.data.totals.totalRevenue)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                  {incomeStatement.data.revenue.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">수익 데이터가 없습니다.</p>
                  )}
                </CardContent>
              </Card>

              {/* 비용 상세 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-orange-700">비용 (Expenses)</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">계정코드</TableHead>
                        <TableHead>계정과목</TableHead>
                        <TableHead className="text-right w-40">금액</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incomeStatement.data.expenses.map((row: any) => (
                        <TableRow key={row.accountCode}>
                          <TableCell className="font-mono text-sm">{row.accountCode}</TableCell>
                          <TableCell>{row.accountName}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(row.debitTotal - row.creditTotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="font-bold">
                        <TableCell colSpan={2}>비용 합계</TableCell>
                        <TableCell className="text-right font-mono text-orange-700">{formatCurrency(incomeStatement.data.totals.totalExpenses)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                  {incomeStatement.data.expenses.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">비용 데이터가 없습니다.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>

        {/* 기초 잔액 */}
        <TabsContent value="opening-balance">
          <OpeningBalanceTab year={year} />
        </TabsContent>
      </Tabs>
    </div>
    </DashboardLayout>
  );
}

// ============================================
// 기초 잔액 탭 컴포넌트 (P4-4)
// ============================================
function OpeningBalanceTab({ year: defaultYear }: { year: number }) {
  const [fiscalYear, setFiscalYear] = useState(defaultYear);
  const utils = trpc.useUtils();

  // 계정과목 목록
  const { data: accounts = [] } = trpc.accountingAccounts.list.useQuery();

  // 기초 잔액 조회
  const { data: openingData, isLoading } = trpc.financialReports.getOpeningBalances.useQuery(
    { fiscalYear },
  );

  // 편집 상태
  const [editItems, setEditItems] = useState<Array<{
    accountId: number;
    accountCode: string;
    accountName: string;
    category: string;
    debitAmount: number;
    creditAmount: number;
  }>>([]);
  const [isEditing, setIsEditing] = useState(false);

  const saveMutation = trpc.financialReports.saveOpeningBalances.useMutation({
    onSuccess: () => {
      utils.financialReports.getOpeningBalances.invalidate();
      setIsEditing(false);
    },
  });

  const deleteMutation = trpc.financialReports.deleteOpeningBalances.useMutation({
    onSuccess: () => {
      utils.financialReports.getOpeningBalances.invalidate();
      setEditItems([]);
    },
  });

  const handleStartEdit = () => {
    if (openingData?.items && openingData.items.length > 0) {
      setEditItems(openingData.items.map((i: any) => ({ ...i })));
    } else {
      // 모든 계정으로 초기화
      setEditItems(
        (accounts as any[]).map((acc: any) => ({
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          category: acc.category || "assets",
          debitAmount: 0,
          creditAmount: 0,
        }))
      );
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    const validItems = editItems.filter(i => i.debitAmount > 0 || i.creditAmount > 0);
    saveMutation.mutate({
      fiscalYear,
      items: validItems.map(i => ({
        accountId: i.accountId,
        accountCode: i.accountCode,
        accountName: i.accountName,
        debitAmount: i.debitAmount,
        creditAmount: i.creditAmount,
      })),
    });
  };

  const editTotalDebit = editItems.reduce((s, i) => s + i.debitAmount, 0);
  const editTotalCredit = editItems.reduce((s, i) => s + i.creditAmount, 0);
  const editIsBalanced = Math.abs(editTotalDebit - editTotalCredit) < 0.01;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">기초 잔액 설정 (전기이월)</CardTitle>
            <div className="flex items-center gap-3">
              <Label>회계연도</Label>
              <Input
                type="number"
                value={fiscalYear}
                onChange={(e) => { setFiscalYear(Number(e.target.value)); setIsEditing(false); }}
                className="w-28"
                min={2020}
                max={2100}
              />
              {!isEditing ? (
                <Button onClick={handleStartEdit} size="sm">
                  <Settings className="mr-2 h-4 w-4" />
                  {openingData?.items?.length ? "수정" : "설정"}
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button
                    onClick={handleSave}
                    size="sm"
                    disabled={!editIsBalanced || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    저장
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    취소
                  </Button>
                </div>
              )}
              {openingData?.journalEntryId && !isEditing && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    if (confirm(`${fiscalYear}년 기초 잔액을 삭제하시겠습니까?`)) {
                      deleteMutation.mutate({ fiscalYear });
                    }
                  }}
                  disabled={deleteMutation.isPending}
                >
                  삭제
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
          ) : isEditing ? (
            <div>
              {/* 대차 균형 표시 */}
              <div className={`flex items-center gap-3 mb-4 p-3 rounded-lg ${editIsBalanced ? "bg-green-50" : "bg-red-50"}`}>
                {editIsBalanced ? (
                  <><CheckCircle className="h-5 w-5 text-green-600" /><span className="text-green-700 font-medium">대차 균형 일치</span></>
                ) : (
                  <><AlertTriangle className="h-5 w-5 text-red-600" /><span className="text-red-700 font-medium">
                    대차 불균형: 차변 {formatCurrency(editTotalDebit)}원 / 대변 {formatCurrency(editTotalCredit)}원 (차이: {formatCurrency(Math.abs(editTotalDebit - editTotalCredit))}원)
                  </span></>
                )}
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">코드</TableHead>
                    <TableHead>계정과목</TableHead>
                    <TableHead className="w-20">분류</TableHead>
                    <TableHead className="text-right w-40">차변 (원)</TableHead>
                    <TableHead className="text-right w-40">대변 (원)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {editItems.map((item, idx) => (
                    <TableRow key={item.accountId}>
                      <TableCell className="font-mono text-sm">{item.accountCode}</TableCell>
                      <TableCell>{item.accountName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={CATEGORY_COLORS[item.category] || ""}>
                          {CATEGORY_LABELS[item.category] || item.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.debitAmount || ""}
                          onChange={(e) => {
                            const newItems = [...editItems];
                            newItems[idx] = { ...newItems[idx], debitAmount: Number(e.target.value) || 0 };
                            setEditItems(newItems);
                          }}
                          className="text-right w-full"
                          min={0}
                          placeholder="0"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.creditAmount || ""}
                          onChange={(e) => {
                            const newItems = [...editItems];
                            newItems[idx] = { ...newItems[idx], creditAmount: Number(e.target.value) || 0 };
                            setEditItems(newItems);
                          }}
                          className="text-right w-full"
                          min={0}
                          placeholder="0"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold">
                    <TableCell colSpan={3}>합계</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(editTotalDebit)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(editTotalCredit)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>

              {saveMutation.error && (
                <p className="text-destructive text-sm mt-2">{saveMutation.error.message}</p>
              )}
            </div>
          ) : openingData?.items && openingData.items.length > 0 ? (
            <div>
              <div className={`flex items-center gap-3 mb-4 p-3 rounded-lg ${openingData.isBalanced ? "bg-green-50" : "bg-red-50"}`}>
                {openingData.isBalanced ? (
                  <><CheckCircle className="h-5 w-5 text-green-600" /><span className="text-green-700 font-medium">{fiscalYear}년 기초 잔액 설정 완료</span></>
                ) : (
                  <><AlertTriangle className="h-5 w-5 text-red-600" /><span className="text-red-700 font-medium">대차 불균형</span></>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">코드</TableHead>
                    <TableHead>계정과목</TableHead>
                    <TableHead className="w-20">분류</TableHead>
                    <TableHead className="text-right w-36">차변</TableHead>
                    <TableHead className="text-right w-36">대변</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openingData.items.map((item: any) => (
                    <TableRow key={item.accountId}>
                      <TableCell className="font-mono text-sm">{item.accountCode}</TableCell>
                      <TableCell>{item.accountName}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={CATEGORY_COLORS[item.category] || ""}>
                          {CATEGORY_LABELS[item.category] || item.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{item.debitAmount > 0 ? formatCurrency(item.debitAmount) : "-"}</TableCell>
                      <TableCell className="text-right font-mono">{item.creditAmount > 0 ? formatCurrency(item.creditAmount) : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-bold">
                    <TableCell colSpan={3}>합계</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(openingData.totalDebit)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(openingData.totalCredit)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center text-muted-foreground">
              <Settings className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{fiscalYear}년 기초 잔액이 설정되지 않았습니다.</p>
              <p className="text-sm mt-1">"설정" 버튼을 클릭하여 전기이월 금액을 입력하세요.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
