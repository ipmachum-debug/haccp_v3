/**
 * 부가세 관리 — ERP 강화 Phase 1-2
 * 매입세액/매출세액 집계 + 월별 추이 + 신고서 미리보기
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Receipt, TrendingUp, TrendingDown, ArrowRight, FileText, Loader2, Calculator, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";

const fmt = (n: number) => `₩${n.toLocaleString()}`;

export default function VatManagement() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const currentHalf = now.getMonth() < 6 ? "H1" : "H2";
  const [period, setPeriod] = useState<"H1" | "H2">(currentHalf as any);

  // 올해 전체 요약
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const { data: summary, isLoading: summaryLoading } = trpc.vatManagement.summary.useQuery({ startDate, endDate });

  // 월별 추이
  const { data: monthly } = trpc.vatManagement.monthlyTrend.useQuery({ year });

  // 신고서 미리보기
  const { data: report, isLoading: reportLoading } = trpc.vatManagement.reportPreview.useQuery({ year, period });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Receipt className="h-5 w-5 text-violet-600" /> 부가세 관리
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">매입세액·매출세액 집계 및 부가세 신고서 미리보기</p>
          </div>
          <Select value={year.toString()} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026, 2027].map((y) => (
                <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 연간 요약 카드 */}
        {summaryLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
        ) : summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <ArrowDownLeft className="h-3.5 w-3.5 text-blue-600" /> 매입세액 (공제)
                </div>
                <p className="text-xl font-bold text-blue-700">{fmt(summary.input.taxAmount)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">공급가 {fmt(summary.input.supplyAmount)} · {summary.input.count}건</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <ArrowUpRight className="h-3.5 w-3.5 text-red-500" /> 매출세액
                </div>
                <p className="text-xl font-bold text-red-600">{fmt(summary.output.taxAmount)}</p>
                <p className="text-[10px] text-muted-foreground mt-1">공급가 {fmt(summary.output.supplyAmount)} · {summary.output.count}건</p>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${summary.isRefund ? "border-l-emerald-500" : "border-l-amber-500"}`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Calculator className="h-3.5 w-3.5" /> {summary.isRefund ? "환급 예상" : "납부 예상"}
                </div>
                <p className={`text-xl font-bold ${summary.isRefund ? "text-emerald-600" : "text-amber-700"}`}>
                  {fmt(Math.abs(summary.netPayable))}
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">매출세액 - 매입세액</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-gray-300">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <FileText className="h-3.5 w-3.5" /> 전체 거래
                </div>
                <p className="text-xl font-bold text-gray-700">{summary.input.count + summary.output.count}</p>
                <p className="text-[10px] text-muted-foreground mt-1">매입 {summary.input.count}건 + 매출 {summary.output.count}건</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="monthly">
          <TabsList>
            <TabsTrigger value="monthly" className="gap-1.5 text-xs"><TrendingUp className="h-3.5 w-3.5" /> 월별 추이</TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" /> 신고서 미리보기</TabsTrigger>
          </TabsList>

          {/* 월별 추이 */}
          <TabsContent value="monthly">
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm">{year}년 월별 부가세 현황</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/30 border-b">
                      <th className="p-2.5 text-center font-medium w-[50px]">월</th>
                      <th className="p-2.5 text-right font-medium">매출 공급가</th>
                      <th className="p-2.5 text-right font-medium">매출세액</th>
                      <th className="p-2.5 text-right font-medium">매입 공급가</th>
                      <th className="p-2.5 text-right font-medium">매입세액</th>
                      <th className="p-2.5 text-right font-medium">납부(환급)</th>
                      <th className="p-2.5 text-center font-medium w-[60px]">상태</th>
                    </tr></thead>
                    <tbody>
                      {monthly?.map((m: any) => {
                        const hasData = m.inputTax > 0 || m.outputTax > 0;
                        return (
                          <tr key={m.month} className={`border-b ${hasData ? "hover:bg-accent/50" : "opacity-40"}`}>
                            <td className="p-2.5 text-center font-bold">{m.month}월</td>
                            <td className="p-2.5 text-right font-mono">{hasData ? fmt(m.outputSupply) : "-"}</td>
                            <td className="p-2.5 text-right font-mono text-red-600">{hasData ? fmt(m.outputTax) : "-"}</td>
                            <td className="p-2.5 text-right font-mono">{hasData ? fmt(m.inputSupply) : "-"}</td>
                            <td className="p-2.5 text-right font-mono text-blue-700">{hasData ? fmt(m.inputTax) : "-"}</td>
                            <td className={`p-2.5 text-right font-mono font-bold ${m.netPayable >= 0 ? "text-amber-700" : "text-emerald-600"}`}>
                              {hasData ? fmt(Math.abs(m.netPayable)) : "-"}
                            </td>
                            <td className="p-2.5 text-center">
                              {hasData && (
                                <Badge variant="outline" className={`text-[9px] ${m.netPayable >= 0 ? "text-amber-600" : "text-emerald-600"}`}>
                                  {m.netPayable >= 0 ? "납부" : "환급"}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {monthly && (
                      <tfoot><tr className="bg-muted/40 border-t-2 font-bold">
                        <td className="p-2.5 text-center">합계</td>
                        <td className="p-2.5 text-right font-mono">{fmt(monthly.reduce((s: number, m: any) => s + m.outputSupply, 0))}</td>
                        <td className="p-2.5 text-right font-mono text-red-600">{fmt(monthly.reduce((s: number, m: any) => s + m.outputTax, 0))}</td>
                        <td className="p-2.5 text-right font-mono">{fmt(monthly.reduce((s: number, m: any) => s + m.inputSupply, 0))}</td>
                        <td className="p-2.5 text-right font-mono text-blue-700">{fmt(monthly.reduce((s: number, m: any) => s + m.inputTax, 0))}</td>
                        <td className="p-2.5 text-right font-mono">{fmt(monthly.reduce((s: number, m: any) => s + m.netPayable, 0))}</td>
                        <td></td>
                      </tr></tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 신고서 미리보기 */}
          <TabsContent value="report">
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">부가세 신고서 미리보기</CardTitle>
                  <div className="flex gap-2">
                    <Button variant={period === "H1" ? "default" : "outline"} size="sm"
                      onClick={() => setPeriod("H1")} className="h-7 text-xs">1기 (1~6월)</Button>
                    <Button variant={period === "H2" ? "default" : "outline"} size="sm"
                      onClick={() => setPeriod("H2")} className="h-7 text-xs">2기 (7~12월)</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {reportLoading ? (
                  <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                ) : report ? (
                  <div className="space-y-4">
                    <div className="text-center text-sm font-bold text-gray-800 pb-2 border-b">
                      부가가치세 {report.period}
                    </div>

                    {/* 매출세액 */}
                    <div className="border rounded-lg p-3">
                      <h3 className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1">
                        <ArrowUpRight className="h-3.5 w-3.5" /> 매출세액
                      </h3>
                      <table className="w-full text-xs">
                        <tbody>
                          <tr className="border-b"><td className="py-1.5 text-muted-foreground">세금계산서 발행</td>
                            <td className="py-1.5 text-right">{report.sales.taxInvoice.count}건</td>
                            <td className="py-1.5 text-right font-mono">{fmt(report.sales.taxInvoice.supply)}</td>
                            <td className="py-1.5 text-right font-mono font-bold text-red-600">{fmt(report.sales.taxInvoice.tax)}</td>
                          </tr>
                          <tr className="bg-red-50/50 font-bold"><td className="py-1.5">매출 합계</td>
                            <td className="py-1.5 text-right">{report.sales.total.count}건</td>
                            <td className="py-1.5 text-right font-mono">{fmt(report.sales.total.supply)}</td>
                            <td className="py-1.5 text-right font-mono text-red-700">{fmt(report.sales.total.tax)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* 매입세액 */}
                    <div className="border rounded-lg p-3">
                      <h3 className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1">
                        <ArrowDownLeft className="h-3.5 w-3.5" /> 매입세액
                      </h3>
                      <table className="w-full text-xs">
                        <tbody>
                          <tr className="border-b"><td className="py-1.5 text-muted-foreground">세금계산서 수취</td>
                            <td className="py-1.5 text-right">{report.purchases.taxInvoice.count}건</td>
                            <td className="py-1.5 text-right font-mono">{fmt(report.purchases.taxInvoice.supply)}</td>
                            <td className="py-1.5 text-right font-mono font-bold text-blue-600">{fmt(report.purchases.taxInvoice.tax)}</td>
                          </tr>
                          <tr className="bg-blue-50/50 font-bold"><td className="py-1.5">매입 합계</td>
                            <td className="py-1.5 text-right">{report.purchases.total.count}건</td>
                            <td className="py-1.5 text-right font-mono">{fmt(report.purchases.total.supply)}</td>
                            <td className="py-1.5 text-right font-mono text-blue-700">{fmt(report.purchases.total.tax)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* 납부세액 */}
                    <div className={`rounded-lg p-4 text-center ${report.isRefund ? "bg-emerald-50 border border-emerald-200" : "bg-amber-50 border border-amber-200"}`}>
                      <p className="text-xs text-muted-foreground mb-1">
                        매출세액 {fmt(report.outputTax)} - 매입세액 {fmt(report.inputTax)}
                      </p>
                      <p className={`text-2xl font-bold ${report.isRefund ? "text-emerald-700" : "text-amber-700"}`}>
                        {report.isRefund ? "환급" : "납부"} {fmt(Math.abs(report.netPayable))}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">데이터가 없습니다.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
