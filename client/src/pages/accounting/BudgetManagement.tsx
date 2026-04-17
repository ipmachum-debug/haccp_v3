/**
 * 예산 관리 — ERP 강화 Phase 2-2
 * 계정별 월간 예산 설정 + 실적 비교
 */
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { AccountCombobox } from "@/components/accounting/AccountCombobox";
import {
  Plus, PieChart, TrendingUp, Loader2, Calculator, AlertTriangle, CheckCircle,
} from "lucide-react";

const fmt = (n: number) => `₩${n.toLocaleString()}`;
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

export default function BudgetManagement() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [createOpen, setCreateOpen] = useState(false);

  const { data: budgets, isLoading, refetch } = trpc.budget.list.useQuery({ year });
  const { data: comparison } = trpc.budget.comparison.useQuery({ year });

  const deleteMut = trpc.budget.delete.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  // 요약 통계
  const totals = useMemo(() => {
    if (!comparison) return { budget: 0, actual: 0 };
    return {
      budget: comparison.reduce((s: number, c: any) => s + c.annualBudget, 0),
      actual: comparison.reduce((s: number, c: any) => s + c.annualActual, 0),
    };
  }, [comparison]);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <PieChart className="h-5 w-5 text-orange-600" /> 예산 관리
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">계정별 예산 설정 및 실적 비교</p>
          </div>
          <div className="flex gap-2">
            <Select value={year.toString()} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-[100px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map((y) => (
                  <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> 예산 설정</Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader><DialogTitle>예산 설정</DialogTitle></DialogHeader>
                <BudgetForm year={year} onSuccess={() => { setCreateOpen(false); refetch(); }} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-l-4 border-l-orange-500"><CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">연간 예산 합계</p>
            <p className="text-xl font-bold text-orange-700">{fmt(totals.budget)}</p>
          </CardContent></Card>
          <Card className="border-l-4 border-l-blue-500"><CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">연간 실적 합계</p>
            <p className="text-xl font-bold text-blue-700">{fmt(totals.actual)}</p>
          </CardContent></Card>
          <Card className={`border-l-4 ${totals.budget >= totals.actual ? "border-l-emerald-500" : "border-l-red-500"}`}>
            <CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">집행률</p>
              <p className={`text-xl font-bold ${totals.budget >= totals.actual ? "text-emerald-700" : "text-red-600"}`}>
                {totals.budget > 0 ? Math.round((totals.actual / totals.budget) * 100) : 0}%
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="comparison">
          <TabsList>
            <TabsTrigger value="comparison" className="text-xs gap-1.5"><TrendingUp className="h-3.5 w-3.5" /> 예산 vs 실적</TabsTrigger>
            <TabsTrigger value="list" className="text-xs gap-1.5"><Calculator className="h-3.5 w-3.5" /> 예산 목록</TabsTrigger>
          </TabsList>

          {/* 예산 vs 실적 비교 */}
          <TabsContent value="comparison">
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm">{year}년 예산 대비 실적</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!comparison?.length ? (
                  <div className="py-16 text-center text-muted-foreground">
                    <PieChart className="h-12 w-12 mx-auto mb-3 opacity-30" />
                    <p>설정된 예산이 없습니다</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-muted/30">
                        <th className="p-2 text-left font-medium sticky left-0 bg-muted/30">계정</th>
                        <th className="p-2 text-right font-medium">연간예산</th>
                        <th className="p-2 text-right font-medium">연간실적</th>
                        <th className="p-2 text-right font-medium">차이</th>
                        <th className="p-2 text-center font-medium">집행률</th>
                        <th className="p-2 text-center font-medium w-[50px]">상태</th>
                      </tr></thead>
                      <tbody>
                        {comparison.map((c: any) => (
                          <tr key={c.accountId} className="border-b hover:bg-accent/50">
                            <td className="p-2 sticky left-0 bg-white">
                              <span className="font-mono text-[10px] mr-1 text-muted-foreground">{c.accountCode}</span>
                              <span className="font-medium">{c.accountName}</span>
                            </td>
                            <td className="p-2 text-right font-mono">{fmt(c.annualBudget)}</td>
                            <td className="p-2 text-right font-mono">{fmt(c.annualActual)}</td>
                            <td className={`p-2 text-right font-mono ${c.annualDiff >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              {c.annualDiff >= 0 ? "+" : ""}{fmt(c.annualDiff)}
                            </td>
                            <td className="p-2 text-center">
                              <div className="flex items-center gap-1 justify-center">
                                <div className="w-12 bg-gray-100 rounded-full h-1.5">
                                  <div className={`h-1.5 rounded-full ${c.annualRate > 100 ? "bg-red-500" : c.annualRate > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
                                    style={{ width: `${Math.min(c.annualRate, 100)}%` }} />
                                </div>
                                <span className="font-bold text-[10px]">{c.annualRate}%</span>
                              </div>
                            </td>
                            <td className="p-2 text-center">
                              {c.annualRate > 100 ? (
                                <AlertTriangle className="h-3.5 w-3.5 text-red-500 mx-auto" />
                              ) : (
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 예산 목록 */}
          <TabsContent value="list">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
                ) : !budgets?.length ? (
                  <div className="py-16 text-center text-muted-foreground">설정된 예산이 없습니다</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b bg-muted/30">
                        <th className="p-2 text-left font-medium sticky left-0 bg-muted/30">계정</th>
                        {MONTHS.map((m) => <th key={m} className="p-2 text-right font-medium">{m}</th>)}
                        <th className="p-2 text-right font-medium font-bold">연간</th>
                        <th className="p-2 w-8"></th>
                      </tr></thead>
                      <tbody>
                        {budgets.map((b: any) => (
                          <tr key={b.id} className="border-b hover:bg-accent/50">
                            <td className="p-2 sticky left-0 bg-white">
                              <span className="font-mono text-[10px] mr-1">{b.accountCode}</span>{b.accountName}
                            </td>
                            {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                              <td key={m} className="p-2 text-right font-mono">
                                {b[`m${m}`] > 0 ? fmt(b[`m${m}`]) : <span className="text-gray-300">-</span>}
                              </td>
                            ))}
                            <td className="p-2 text-right font-mono font-bold">{fmt(b.annual)}</td>
                            <td className="p-2">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500"
                                onClick={() => { if (confirm("삭제?")) deleteMut.mutate({ id: b.id }); }}>×</Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════
   예산 설정 폼
   ═══════════════════════════════════════════ */
function BudgetForm({ year, onSuccess }: { year: number; onSuccess: () => void }) {
  const [accountId, setAccountId] = useState<number | null>(null);
  const [amounts, setAmounts] = useState(Array(12).fill(0));
  const [uniformAmount, setUniformAmount] = useState("");

  const { data: accountsData } = trpc.accountingAccounts.list.useQuery();
  const accounts = useMemo(() => {
    const items = (accountsData as any)?.items ?? (Array.isArray(accountsData) ? accountsData : []);
    return items.filter((a: any) => a.isActive === "Y" || a.isActive === 1);
  }, [accountsData]);

  const upsertMut = trpc.budget.upsert.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); onSuccess(); },
    onError: (e: any) => toast.error(e.message),
  });

  const applyUniform = () => {
    const val = Number(uniformAmount) || 0;
    setAmounts(Array(12).fill(val));
  };

  const total = amounts.reduce((s, a) => s + a, 0);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs">계정과목 *</Label>
        <AccountCombobox
          selectedId={accountId}
          onSelect={(acc) => setAccountId(acc.id)}
          onClear={() => setAccountId(null)}
          placeholder="계정 검색..."
        />
      </div>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs">균등 배분 금액</Label>
          <Input type="number" value={uniformAmount} onChange={(e: any) => setUniformAmount(e.target.value)}
            placeholder="매월 동일 금액" className="h-8 text-xs" />
        </div>
        <Button variant="outline" size="sm" onClick={applyUniform} className="h-8 text-xs">적용</Button>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {MONTHS.map((label, i) => (
          <div key={i}>
            <Label className="text-[10px]">{label}</Label>
            <Input type="number" value={amounts[i] || ""} className="h-8 text-xs"
              onChange={(e: any) => {
                const next = [...amounts];
                next[i] = Number(e.target.value) || 0;
                setAmounts(next);
              }} />
          </div>
        ))}
      </div>

      <div className="text-right text-sm font-bold">
        연간 합계: {fmt(total)}
      </div>

      <Button className="w-full" disabled={!accountId || upsertMut.isPending}
        onClick={() => upsertMut.mutate({
          accountId: accountId!,
          year,
          amounts: { m1: amounts[0], m2: amounts[1], m3: amounts[2], m4: amounts[3],
            m5: amounts[4], m6: amounts[5], m7: amounts[6], m8: amounts[7],
            m9: amounts[8], m10: amounts[9], m11: amounts[10], m12: amounts[11] },
        })}>
        {upsertMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        예산 저장
      </Button>
    </div>
  );
}
