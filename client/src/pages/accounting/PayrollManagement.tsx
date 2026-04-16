/**
 * 급여 관리 — ERP 강화 Phase 3-1
 * 급여대장 + 4대보험 자동계산 + 급여 지급
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  DollarSign, Users, Calculator, CheckCircle, Loader2, Plus, CreditCard, Pencil, Trash2,
} from "lucide-react";

const fmt = (n: number) => `₩${n.toLocaleString()}`;

export default function PayrollManagement() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);

  const { data: payroll, isLoading, refetch } = trpc.payroll.list.useQuery({ year, month });
  const { data: summary } = trpc.payroll.summary.useQuery({ year, month });

  const deleteMut = trpc.payroll.delete.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMut = trpc.payroll.update.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); setEditItem(null); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleEditPayroll = (p: any) => {
    setEditItem({ id: p.id, name: p.employeeName, baseSalary: p.baseSalary, overtime: p.overtime, bonus: p.bonus, allowances: p.allowances });
  };

  const confirmMut = trpc.payroll.confirmPayment.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" /> 급여 관리
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">급여대장, 4대보험 자동계산, 급여명세서</p>
          </div>
          <div className="flex gap-2 items-center">
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}
              className="h-8 text-xs border rounded px-2">
              {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
              className="h-8 text-xs border rounded px-2">
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
            </select>

            <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> 급여 생성</Button>
              </DialogTrigger>
              <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>급여대장 생성 — {year}년 {month}월</DialogTitle></DialogHeader>
                <GeneratePayrollForm year={year} month={month}
                  onSuccess={() => { setGenerateOpen(false); refetch(); }} />
              </DialogContent>
            </Dialog>

            {summary && summary.count > 0 && summary.paidCount < summary.count && (
              <Button size="sm" variant="outline" className="gap-1.5 text-green-700 border-green-300"
                onClick={() => { if (confirm(`${year}년 ${month}월 급여 전체 지급 확정?`)) confirmMut.mutate({ year, month }); }}
                disabled={confirmMut.isPending}>
                <CreditCard className="h-4 w-4" /> 지급 확정
              </Button>
            )}
          </div>
        </div>

        {/* 요약 */}
        {summary && summary.count > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-l-4 border-l-green-500"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">대상 인원</p>
              <p className="text-xl font-bold text-green-700">{summary.count}<span className="text-xs text-gray-400">명</span></p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-blue-500"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">총 지급액</p>
              <p className="text-lg font-bold text-blue-700">{fmt(summary.totalGross)}</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-amber-500"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">총 공제액</p>
              <p className="text-lg font-bold text-amber-700">{fmt(summary.totalDeductions)}</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">실 지급액</p>
              <p className="text-lg font-bold text-emerald-700">{fmt(summary.totalNet)}</p>
            </CardContent></Card>
          </div>
        )}

        {/* 급여대장 테이블 */}
        <Card>
          <CardHeader className="py-3 px-4 border-b">
            <CardTitle className="text-sm">{year}년 {month}월 급여대장</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
            ) : !payroll?.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>급여대장이 없습니다</p>
                <p className="text-xs mt-1">"급여 생성" 버튼으로 생성하세요</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="p-2 text-left font-medium">성명</th>
                    <th className="p-2 text-left font-medium">직급</th>
                    <th className="p-2 text-right font-medium">기본급</th>
                    <th className="p-2 text-right font-medium">연장</th>
                    <th className="p-2 text-right font-medium">상여</th>
                    <th className="p-2 text-right font-medium bg-blue-50">총지급</th>
                    <th className="p-2 text-right font-medium">국민연금</th>
                    <th className="p-2 text-right font-medium">건강보험</th>
                    <th className="p-2 text-right font-medium">장기요양</th>
                    <th className="p-2 text-right font-medium">고용보험</th>
                    <th className="p-2 text-right font-medium">소득세</th>
                    <th className="p-2 text-right font-medium">지방세</th>
                    <th className="p-2 text-right font-medium bg-amber-50">총공제</th>
                    <th className="p-2 text-right font-medium bg-emerald-50 font-bold">실지급</th>
                    <th className="p-2 text-center font-medium">상태</th>
                    <th className="p-2 text-center font-medium w-[70px]">액션</th>
                  </tr></thead>
                  <tbody>
                    {payroll.map((p: any) => (
                      <tr key={p.id} className="border-b hover:bg-accent/50">
                        <td className="p-2 font-medium">{p.employeeName}</td>
                        <td className="p-2 text-muted-foreground">{p.position || "-"}</td>
                        <td className="p-2 text-right font-mono">{fmt(p.baseSalary)}</td>
                        <td className="p-2 text-right font-mono">{p.overtime > 0 ? fmt(p.overtime) : "-"}</td>
                        <td className="p-2 text-right font-mono">{p.bonus > 0 ? fmt(p.bonus) : "-"}</td>
                        <td className="p-2 text-right font-mono font-bold bg-blue-50/50">{fmt(p.grossPay)}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{fmt(p.nationalPension)}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{fmt(p.healthInsurance)}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{fmt(p.longTermCare)}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{fmt(p.employment)}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{fmt(p.incomeTax)}</td>
                        <td className="p-2 text-right font-mono text-muted-foreground">{fmt(p.localIncomeTax)}</td>
                        <td className="p-2 text-right font-mono font-bold bg-amber-50/50 text-amber-700">{fmt(p.totalDeductions)}</td>
                        <td className="p-2 text-right font-mono font-bold bg-emerald-50/50 text-emerald-700">{fmt(p.netPay)}</td>
                        <td className="p-2 text-center">
                          <Badge variant="outline" className={p.status === "paid" ? "text-emerald-600" : "text-gray-500"}>
                            {p.status === "paid" ? "지급" : "대기"}
                          </Badge>
                        </td>
                        <td className="p-2 text-center">
                          {p.status === "draft" && (
                            <div className="flex gap-0.5 justify-center">
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-600"
                                onClick={() => handleEditPayroll(p)} title="수정">
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500"
                                onClick={() => { if (confirm(`${p.employeeName} 급여 삭제?`)) deleteMut.mutate({ id: p.id }); }} title="삭제">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {payroll.length > 0 && (
                    <tfoot><tr className="bg-muted/40 border-t-2 font-bold text-[11px]">
                      <td colSpan={5} className="p-2 text-right">합계</td>
                      <td className="p-2 text-right font-mono bg-blue-50/50">{fmt(payroll.reduce((s: number, p: any) => s + p.grossPay, 0))}</td>
                      <td colSpan={6}></td>
                      <td className="p-2 text-right font-mono bg-amber-50/50 text-amber-700">{fmt(payroll.reduce((s: number, p: any) => s + p.totalDeductions, 0))}</td>
                      <td className="p-2 text-right font-mono bg-emerald-50/50 text-emerald-700">{fmt(payroll.reduce((s: number, p: any) => s + p.netPay, 0))}</td>
                      <td></td>
                    </tr></tfoot>
                  )}
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 수정 다이얼로그 */}
        {editItem && (
          <Dialog open onOpenChange={() => setEditItem(null)}>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>{editItem.name} 급여 수정</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">기본급</Label>
                  <Input type="number" value={editItem.baseSalary} className="h-9 text-sm"
                    onChange={(e: any) => setEditItem({ ...editItem, baseSalary: Number(e.target.value) || 0 })} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-xs">연장근로</Label>
                    <Input type="number" value={editItem.overtime} className="h-9 text-sm"
                      onChange={(e: any) => setEditItem({ ...editItem, overtime: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">상여금</Label>
                    <Input type="number" value={editItem.bonus} className="h-9 text-sm"
                      onChange={(e: any) => setEditItem({ ...editItem, bonus: Number(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <Label className="text-xs">수당</Label>
                    <Input type="number" value={editItem.allowances} className="h-9 text-sm"
                      onChange={(e: any) => setEditItem({ ...editItem, allowances: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">저장 시 4대보험·소득세가 자동 재계산됩니다.</p>
                <Button className="w-full" disabled={updateMut.isPending}
                  onClick={() => updateMut.mutate({
                    id: editItem.id, baseSalary: editItem.baseSalary,
                    overtime: editItem.overtime, bonus: editItem.bonus, allowances: editItem.allowances,
                  })}>
                  {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  수정 (자동 재계산)
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════
   급여 생성 폼
   ═══════════════════════════════════════════ */
function GeneratePayrollForm({ year, month, onSuccess }: { year: number; month: number; onSuccess: () => void }) {
  const { data: employeeList } = trpc.payroll.employees.useQuery();

  const [entries, setEntries] = useState<Array<{
    employeeId: number; name: string; baseSalary: number; overtime: number; bonus: number; allowances: number;
  }>>([]);

  // 직원 목록 로드되면 자동 초기화
  useMemo(() => {
    if (employeeList && entries.length === 0) {
      setEntries((employeeList as any[]).map((e: any) => ({
        employeeId: e.id,
        name: e.name,
        baseSalary: 0,
        overtime: 0,
        bonus: 0,
        allowances: 0,
      })));
    }
  }, [employeeList]);

  const generateMut = trpc.payroll.generate.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); onSuccess(); },
    onError: (e: any) => toast.error(e.message),
  });

  const updateEntry = (idx: number, field: string, value: number) => {
    const next = [...entries];
    (next[idx] as any)[field] = value;
    setEntries(next);
  };

  const validEntries = entries.filter((e) => e.baseSalary > 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">직원별 기본급과 수당을 입력하면 4대보험·소득세가 자동 계산됩니다.</p>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="bg-muted/50 border-b">
            <th className="p-2 text-left">성명</th>
            <th className="p-2 text-right">기본급 *</th>
            <th className="p-2 text-right">연장근로</th>
            <th className="p-2 text-right">상여금</th>
            <th className="p-2 text-right">수당</th>
          </tr></thead>
          <tbody>
            {entries.map((e, idx) => (
              <tr key={e.employeeId} className="border-b">
                <td className="p-2 font-medium">{e.name}</td>
                <td className="p-1.5"><Input type="number" value={e.baseSalary || ""} className="h-7 text-xs text-right"
                  onChange={(ev: any) => updateEntry(idx, "baseSalary", Number(ev.target.value) || 0)} /></td>
                <td className="p-1.5"><Input type="number" value={e.overtime || ""} className="h-7 text-xs text-right"
                  onChange={(ev: any) => updateEntry(idx, "overtime", Number(ev.target.value) || 0)} /></td>
                <td className="p-1.5"><Input type="number" value={e.bonus || ""} className="h-7 text-xs text-right"
                  onChange={(ev: any) => updateEntry(idx, "bonus", Number(ev.target.value) || 0)} /></td>
                <td className="p-1.5"><Input type="number" value={e.allowances || ""} className="h-7 text-xs text-right"
                  onChange={(ev: any) => updateEntry(idx, "allowances", Number(ev.target.value) || 0)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">기본급 입력된 직원: {validEntries.length}명</span>
        <Button onClick={() => generateMut.mutate({
          year, month,
          employees: validEntries.map((e) => ({
            employeeId: e.employeeId,
            baseSalary: e.baseSalary,
            overtime: e.overtime,
            bonus: e.bonus,
            allowances: e.allowances,
          })),
        })} disabled={generateMut.isPending || validEntries.length === 0}>
          {generateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Calculator className="h-4 w-4 mr-2" />}
          급여 생성 (4대보험 자동계산)
        </Button>
      </div>
    </div>
  );
}
