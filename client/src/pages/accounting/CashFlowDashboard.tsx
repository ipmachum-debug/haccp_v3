/**
 * 자금현황 대시보드 — ERP 강화
 * 은행잔액 + AP/AR + 예상 현금흐름 + 자금일보
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wallet, Landmark, ArrowDownLeft, ArrowUpRight, TrendingUp, TrendingDown,
  FileText, Package, Loader2, AlertTriangle, CheckCircle, Calendar,
} from "lucide-react";

const fmt = (n: number) => `₩${n.toLocaleString()}`;

export default function CashFlowDashboard() {
  const now = new Date();
  const [dailyStart, setDailyStart] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`);
  const [dailyEnd, setDailyEnd] = useState(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`);

  const { data, isLoading } = trpc.cashFlow.dashboard.useQuery(undefined, { refetchInterval: 60000 });
  const { data: dailyData } = trpc.cashFlow.dailyReport.useQuery({ startDate: dailyStart, endDate: dailyEnd });

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground" /></div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center text-muted-foreground">데이터를 불러올 수 없습니다.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 헤더 */}
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-emerald-600" /> 자금현황
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">은행 잔액, 미지급/미수금, 예상 현금흐름을 한눈에</p>
        </div>

        {/* 핵심 지표 카드 4개 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Landmark className="h-3.5 w-3.5 text-emerald-600" /> 은행 잔액 합계
              </div>
              <p className="text-xl font-bold text-emerald-700">{fmt(data.totalBankBalance)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{data.bankAccounts.length}개 계좌</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-red-400">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <ArrowUpRight className="h-3.5 w-3.5 text-red-500" /> 미지급금 (AP)
              </div>
              <p className="text-xl font-bold text-red-600">{fmt(data.ap.total)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">미결제 매입 {data.ap.count}건</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-blue-400">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <ArrowDownLeft className="h-3.5 w-3.5 text-blue-600" /> 미수금 (AR)
              </div>
              <p className="text-xl font-bold text-blue-700">{fmt(data.ar.total)}</p>
              <p className="text-[10px] text-muted-foreground mt-1">미결제 매출 {data.ar.count}건</p>
            </CardContent>
          </Card>

          <Card className={`border-l-4 ${data.projectedCash >= 0 ? "border-l-teal-500" : "border-l-orange-500"}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                {data.projectedCash >= 0 ? <CheckCircle className="h-3.5 w-3.5 text-teal-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                예상 가용 자금
              </div>
              <p className={`text-xl font-bold ${data.projectedCash >= 0 ? "text-teal-700" : "text-orange-600"}`}>
                {fmt(data.projectedCash)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">잔액 + 미수금 - 미지급금</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview" className="text-xs gap-1.5"><Wallet className="h-3.5 w-3.5" /> 자금현황</TabsTrigger>
            <TabsTrigger value="daily" className="text-xs gap-1.5"><Calendar className="h-3.5 w-3.5" /> 자금일보</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
        <div className="grid md:grid-cols-2 gap-4">
          {/* 은행 계좌별 잔액 */}
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <Landmark className="h-4 w-4 text-emerald-600" /> 은행 계좌별 잔액
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.bankAccounts.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">등록된 은행 계좌가 없습니다</div>
              ) : (
                <div className="divide-y">
                  {data.bankAccounts.map((bank: any) => (
                    <div key={bank.id} className="flex items-center justify-between px-4 py-3 hover:bg-accent/50">
                      <div>
                        <p className="text-sm font-medium">{bank.bankName}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {bank.accountNumber} · {bank.accountName}
                        </p>
                      </div>
                      <p className={`text-sm font-bold font-mono ${bank.balance >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {fmt(bank.balance)}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-4 py-3 bg-muted/30 font-bold">
                    <span className="text-sm">합계</span>
                    <span className="text-sm font-mono text-emerald-700">{fmt(data.totalBankBalance)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 자금 흐름 요약 */}
          <Card>
            <CardHeader className="py-3 px-4 border-b">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" /> 자금 흐름 요약
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              {/* 최근 30일 입출금 */}
              <div className="border rounded-lg p-3">
                <p className="text-[10px] font-bold text-muted-foreground mb-2">최근 30일 은행 거래</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-muted-foreground">입금</p>
                    <p className="text-sm font-bold text-emerald-600">{fmt(data.recentTransactions.deposit)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">출금</p>
                    <p className="text-sm font-bold text-red-600">{fmt(data.recentTransactions.withdrawal)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">거래</p>
                    <p className="text-sm font-bold text-gray-700">{data.recentTransactions.count}건</p>
                  </div>
                </div>
              </div>

              {/* 예상 지출/수입 */}
              <div className="border rounded-lg p-3">
                <p className="text-[10px] font-bold text-muted-foreground mb-2">미결 거래 (예상)</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Package className="h-3 w-3" /> 미결 발주서 (예상 지출)
                    </span>
                    <span className="font-mono font-bold text-red-600">
                      {data.pendingPO.count > 0 ? `-${fmt(data.pendingPO.total)}` : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <FileText className="h-3 w-3" /> 미결 견적서 (예상 수입)
                    </span>
                    <span className="font-mono font-bold text-emerald-600">
                      {data.pendingQuotation.count > 0 ? `+${fmt(data.pendingQuotation.total)}` : "-"}
                    </span>
                  </div>
                </div>
              </div>

              {/* 자금 계산식 */}
              <div className="bg-muted/30 rounded-lg p-3 text-xs">
                <p className="font-bold text-muted-foreground mb-1">예상 가용 자금 계산</p>
                <div className="font-mono space-y-0.5">
                  <div className="flex justify-between"><span>은행 잔액</span><span>{fmt(data.totalBankBalance)}</span></div>
                  <div className="flex justify-between text-blue-700"><span>+ 미수금 (AR)</span><span>+{fmt(data.ar.total)}</span></div>
                  <div className="flex justify-between text-red-600"><span>- 미지급금 (AP)</span><span>-{fmt(data.ap.total)}</span></div>
                  <div className="flex justify-between font-bold border-t pt-1 mt-1">
                    <span>= 예상 가용 자금</span>
                    <span className={data.projectedCash >= 0 ? "text-teal-700" : "text-orange-600"}>
                      {fmt(data.projectedCash)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
          </TabsContent>

          {/* 자금일보 탭 */}
          <TabsContent value="daily">
            <div className="space-y-3">
              <div className="flex gap-2 items-end">
                <div>
                  <Label className="text-[10px]">시작일</Label>
                  <Input type="date" value={dailyStart} onChange={(e: any) => setDailyStart(e.target.value)} className="h-8 text-xs w-[130px]" />
                </div>
                <div>
                  <Label className="text-[10px]">종료일</Label>
                  <Input type="date" value={dailyEnd} onChange={(e: any) => setDailyEnd(e.target.value)} className="h-8 text-xs w-[130px]" />
                </div>
              </div>

              <Card>
                <CardHeader className="py-2.5 px-4 border-b">
                  <CardTitle className="text-sm">일별 입출금 내역</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {!dailyData?.daily?.length ? (
                    <div className="py-12 text-center text-muted-foreground text-sm">해당 기간 거래가 없습니다</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b bg-muted/30">
                          <th className="p-2.5 text-left font-medium">날짜</th>
                          <th className="p-2.5 text-right font-medium">입금</th>
                          <th className="p-2.5 text-right font-medium">출금</th>
                          <th className="p-2.5 text-right font-medium">순액</th>
                          <th className="p-2.5 text-center font-medium">건수</th>
                        </tr></thead>
                        <tbody>
                          {dailyData.daily.map((d: any) => (
                            <tr key={d.date} className="border-b hover:bg-accent/50">
                              <td className="p-2.5 font-mono">{d.date}</td>
                              <td className="p-2.5 text-right font-mono text-emerald-700">{d.deposit > 0 ? `+${fmt(d.deposit)}` : "-"}</td>
                              <td className="p-2.5 text-right font-mono text-red-600">{d.withdrawal > 0 ? `-${fmt(d.withdrawal)}` : "-"}</td>
                              <td className={`p-2.5 text-right font-mono font-bold ${d.net >= 0 ? "text-emerald-700" : "text-red-600"}`}>{fmt(d.net)}</td>
                              <td className="p-2.5 text-center">{d.count}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot><tr className="bg-muted/30 border-t-2 font-bold">
                          <td className="p-2.5">합계</td>
                          <td className="p-2.5 text-right font-mono text-emerald-700">+{fmt(dailyData.daily.reduce((s: number, d: any) => s + d.deposit, 0))}</td>
                          <td className="p-2.5 text-right font-mono text-red-600">-{fmt(dailyData.daily.reduce((s: number, d: any) => s + d.withdrawal, 0))}</td>
                          <td className="p-2.5 text-right font-mono">{fmt(dailyData.daily.reduce((s: number, d: any) => s + d.net, 0))}</td>
                          <td className="p-2.5 text-center">{dailyData.daily.reduce((s: number, d: any) => s + d.count, 0)}</td>
                        </tr></tfoot>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 지급/수금 예정 */}
              <div className="grid md:grid-cols-2 gap-3">
                <Card>
                  <CardHeader className="py-2 px-4 border-b">
                    <CardTitle className="text-xs text-red-700 flex items-center gap-1"><ArrowUpRight className="h-3 w-3" /> 지급 예정</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!dailyData?.payables?.length ? <div className="p-4 text-center text-muted-foreground text-xs">없음</div> : (
                      <div className="divide-y">{dailyData.payables.map((p: any, i: number) => (
                        <div key={i} className="flex justify-between px-4 py-2 text-xs">
                          <span className="font-mono">{p.date}</span>
                          <span className="font-mono text-red-600">{fmt(p.amount)} ({p.count}건)</span>
                        </div>
                      ))}</div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="py-2 px-4 border-b">
                    <CardTitle className="text-xs text-emerald-700 flex items-center gap-1"><ArrowDownLeft className="h-3 w-3" /> 수금 예정</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {!dailyData?.receivables?.length ? <div className="p-4 text-center text-muted-foreground text-xs">없음</div> : (
                      <div className="divide-y">{dailyData.receivables.map((r: any, i: number) => (
                        <div key={i} className="flex justify-between px-4 py-2 text-xs">
                          <span className="font-mono">{r.date}</span>
                          <span className="font-mono text-emerald-700">{fmt(r.amount)} ({r.count}건)</span>
                        </div>
                      ))}</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
