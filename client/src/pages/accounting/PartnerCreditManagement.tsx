/**
 * 거래처 신용관리 — ERP 강화 Phase 2-3
 * 신용한도 + 연체 현황 + AP/AR 잔액
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Shield, Search, AlertTriangle, CheckCircle, Clock, Users,
  ArrowDownLeft, ArrowUpRight, Loader2,
} from "lucide-react";

const fmt = (n: number) => `₩${n.toLocaleString()}`;

const gradeConfig: Record<string, { label: string; color: string }> = {
  A: { label: "A 우수", color: "bg-emerald-100 text-emerald-700" },
  B: { label: "B 양호", color: "bg-blue-100 text-blue-700" },
  C: { label: "C 주의", color: "bg-amber-100 text-amber-700" },
  D: { label: "D 위험", color: "bg-red-100 text-red-700" },
};

export default function PartnerCreditManagement() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "customer" | "supplier">("all");

  const { data: partners, isLoading, refetch } = trpc.partnerCredit.list.useQuery({
    type: typeFilter, search: search || undefined,
  });
  const { data: summary } = trpc.partnerCredit.summary.useQuery();
  const { data: aging } = trpc.partnerCredit.agingAnalysis.useQuery();

  const setLimitMut = trpc.partnerCredit.setCreditLimit.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSetLimit = (id: number, name: string, current: number) => {
    const val = prompt(`${name} 신용한도 설정 (현재: ₩${current.toLocaleString()})`, current.toString());
    if (val === null) return;
    setLimitMut.mutate({ partnerId: id, creditLimit: Number(val) || 0 });
  };

  const overduePartners = partners?.filter((p: any) => p.isOverdue) || [];
  const overLimitPartners = partners?.filter((p: any) => p.isOverLimit) || [];

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-rose-600" /> 거래처 신용관리
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">신용한도, 연체 현황, AP/AR 잔액 관리</p>
        </div>

        {/* 요약 카드 */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card className="border-l-4 border-l-gray-400"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">거래처</p>
              <p className="text-xl font-bold">{summary.partnerCount}<span className="text-xs text-gray-400">개</span></p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-red-400"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">미지급 (AP)</p>
              <p className="text-lg font-bold text-red-600">{fmt(summary.totalAP)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.apCount}건</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-blue-400"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">미수금 (AR)</p>
              <p className="text-lg font-bold text-blue-700">{fmt(summary.totalAR)}</p>
              <p className="text-[10px] text-muted-foreground">{summary.arCount}건</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-amber-400"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">연체 거래처</p>
              <p className="text-xl font-bold text-amber-700">{overduePartners.length}</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-rose-400"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">한도 초과</p>
              <p className="text-xl font-bold text-rose-600">{overLimitPartners.length}</p>
            </CardContent></Card>
          </div>
        )}

        {/* 필터 */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e: any) => setSearch(e.target.value)}
              placeholder="거래처명/사업자번호 검색..." className="h-8 pl-8 text-xs" />
          </div>
          {(["all", "supplier", "customer"] as const).map((t) => (
            <Button key={t} variant={typeFilter === t ? "default" : "outline"} size="sm"
              onClick={() => setTypeFilter(t)} className="h-8 text-xs">
              {t === "all" ? "전체" : t === "supplier" ? "공급업체" : "고객"}
            </Button>
          ))}
        </div>

        {/* 연령분석 */}
        {aging && (
          <div className="grid md:grid-cols-2 gap-3">
            {[
              { label: "미지급금 (AP) 연령분석", data: aging.ap, color: "red" },
              { label: "미수금 (AR) 연령분석", data: aging.ar, color: "blue" },
            ].map(({ label, data: d, color }) => (
              <Card key={label}>
                <CardHeader className="py-2.5 px-4 border-b">
                  <CardTitle className="text-xs">{label}</CardTitle>
                </CardHeader>
                <CardContent className="p-3">
                  <div className="grid grid-cols-5 gap-1 text-center text-[10px]">
                    {[
                      { label: "30일 이내", value: d.current, bg: "bg-emerald-50" },
                      { label: "31~60일", value: d.d30, bg: "bg-amber-50" },
                      { label: "61~90일", value: d.d60, bg: "bg-orange-50" },
                      { label: "90일 초과", value: d.d90plus, bg: "bg-red-50" },
                      { label: "합계", value: d.total, bg: "bg-gray-50" },
                    ].map((b) => (
                      <div key={b.label} className={`${b.bg} rounded-lg p-2`}>
                        <p className="text-muted-foreground">{b.label}</p>
                        <p className={`text-sm font-bold ${b.value > 0 ? `text-${color}-700` : "text-gray-300"}`}>
                          {b.value > 0 ? fmt(b.value) : "-"}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 테이블 */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
            ) : !partners?.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>거래처가 없습니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="p-2.5 text-left font-medium">거래처</th>
                    <th className="p-2.5 text-center font-medium">등급</th>
                    <th className="p-2.5 text-right font-medium">신용한도</th>
                    <th className="p-2.5 text-right font-medium">미지급(AP)</th>
                    <th className="p-2.5 text-right font-medium">미수금(AR)</th>
                    <th className="p-2.5 text-right font-medium">잔액합계</th>
                    <th className="p-2.5 text-center font-medium">연체</th>
                    <th className="p-2.5 text-center font-medium">상태</th>
                    <th className="p-2.5 text-center font-medium w-[70px]">한도설정</th>
                  </tr></thead>
                  <tbody>
                    {partners.map((p: any) => {
                      const grade = gradeConfig[p.creditGrade] || gradeConfig.A;
                      return (
                        <tr key={p.id} className={`border-b hover:bg-accent/50 ${p.isOverdue || p.isOverLimit ? "bg-red-50/50" : ""}`}>
                          <td className="p-2.5">
                            <div className="font-medium">{p.companyName}</div>
                            <div className="text-[10px] text-muted-foreground">{p.bizNo || "-"}</div>
                          </td>
                          <td className="p-2.5 text-center">
                            <Badge className={`${grade.color} text-[10px]`}>{grade.label}</Badge>
                          </td>
                          <td className="p-2.5 text-right font-mono">
                            {p.creditLimit > 0 ? fmt(p.creditLimit) : <span className="text-gray-300">미설정</span>}
                          </td>
                          <td className="p-2.5 text-right font-mono text-red-600">
                            {p.apBalance > 0 ? fmt(p.apBalance) : "-"}
                            {p.apCount > 0 && <span className="text-[9px] text-muted-foreground ml-1">({p.apCount})</span>}
                          </td>
                          <td className="p-2.5 text-right font-mono text-blue-700">
                            {p.arBalance > 0 ? fmt(p.arBalance) : "-"}
                            {p.arCount > 0 && <span className="text-[9px] text-muted-foreground ml-1">({p.arCount})</span>}
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold">{fmt(p.outstandingBalance)}</td>
                          <td className="p-2.5 text-center">
                            {p.overdueDays > 0 ? (
                              <span className="text-red-600 font-bold flex items-center justify-center gap-0.5">
                                <Clock className="h-3 w-3" />{p.overdueDays}일
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="p-2.5 text-center">
                            {p.isOverLimit && <Badge variant="destructive" className="text-[9px]">한도초과</Badge>}
                            {p.isOverdue && !p.isOverLimit && <Badge className="bg-amber-100 text-amber-700 text-[9px]">연체</Badge>}
                            {!p.isOverdue && !p.isOverLimit && <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mx-auto" />}
                          </td>
                          <td className="p-2.5 text-center">
                            <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2"
                              onClick={() => handleSetLimit(p.id, p.companyName, p.creditLimit)}>
                              설정
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
