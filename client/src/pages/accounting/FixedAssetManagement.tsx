/**
 * 고정자산 관리 — ERP 강화 Phase 2-1
 * 자산 등록/조회/감가상각/처분
 */
import { useState } from "react";
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
import { toast } from "sonner";
import {
  Plus, Building, Truck, Monitor, Sofa, Wrench, Package,
  Loader2, TrendingDown, Trash2, Calculator, Search, Eye,
} from "lucide-react";
import { todayLocal } from "@/lib/dateUtils";

const fmt = (n: number) => `₩${n.toLocaleString()}`;

const categoryConfig: Record<string, { label: string; icon: any; color: string }> = {
  building: { label: "건물", icon: Building, color: "bg-blue-100 text-blue-700" },
  machinery: { label: "기계장치", icon: Wrench, color: "bg-orange-100 text-orange-700" },
  vehicle: { label: "차량운반구", icon: Truck, color: "bg-green-100 text-green-700" },
  furniture: { label: "비품", icon: Sofa, color: "bg-purple-100 text-purple-700" },
  computer: { label: "전산장비", icon: Monitor, color: "bg-teal-100 text-teal-700" },
  other: { label: "기타", icon: Package, color: "bg-gray-100 text-gray-700" },
};

export default function FixedAssetManagement() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "disposed" | "all">("active");
  const [createOpen, setCreateOpen] = useState(false);
  const [depYear, setDepYear] = useState(new Date().getFullYear());
  const [depMonth, setDepMonth] = useState(new Date().getMonth() + 1);

  const { data: assets, isLoading, refetch } = trpc.fixedAsset.list.useQuery({
    status: statusFilter, search: search || undefined,
  });
  const { data: summary } = trpc.fixedAsset.summary.useQuery();

  const disposeMut = trpc.fixedAsset.dispose.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const depMut = trpc.fixedAsset.runDepreciation.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const handleDispose = (id: number, name: string) => {
    const amount = prompt(`${name} 처분 금액 (원):`);
    if (amount === null) return;
    const reason = prompt("처분 사유:");
    disposeMut.mutate({ id, disposalDate: todayLocal(), disposalAmount: Number(amount) || 0, reason: reason || undefined });
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Building className="h-5 w-5 text-indigo-600" /> 고정자산 관리
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">자산 등록, 감가상각, 처분 관리</p>
          </div>
          <div className="flex gap-2">
            {/* 감가상각 실행 */}
            <div className="flex items-center gap-1">
              <select value={depYear} onChange={(e) => setDepYear(Number(e.target.value))}
                className="h-8 text-xs border rounded px-1">
                {[2024, 2025, 2026, 2027].map((y) => <option key={y}>{y}</option>)}
              </select>
              <select value={depMonth} onChange={(e) => setDepMonth(Number(e.target.value))}
                className="h-8 text-xs border rounded px-1">
                {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}월</option>)}
              </select>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1"
                onClick={() => depMut.mutate({ yearMonth: `${depYear}-${String(depMonth).padStart(2, "0")}` })}
                disabled={depMut.isPending}>
                {depMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Calculator className="h-3 w-3" />}
                상각 실행
              </Button>
            </div>

            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> 자산 등록</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>고정자산 등록</DialogTitle></DialogHeader>
                <CreateAssetForm onSuccess={() => { setCreateOpen(false); refetch(); }} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* 요약 카드 */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-l-4 border-l-indigo-500"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">활성 자산</p>
              <p className="text-xl font-bold text-indigo-700">{summary.activeCount}<span className="text-xs text-gray-400">건</span></p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-blue-500"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">취득원가 합계</p>
              <p className="text-lg font-bold text-blue-700">{fmt(summary.totalCost)}</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-amber-500"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">감가상각 누계</p>
              <p className="text-lg font-bold text-amber-700">{fmt(summary.totalDepreciation)}</p>
            </CardContent></Card>
            <Card className="border-l-4 border-l-emerald-500"><CardContent className="p-3">
              <p className="text-[10px] text-muted-foreground">장부가액 합계</p>
              <p className="text-lg font-bold text-emerald-700">{fmt(summary.totalBookValue)}</p>
            </CardContent></Card>
          </div>
        )}

        {/* 필터 */}
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="자산명/코드 검색..." className="h-8 pl-8 text-xs" />
          </div>
          {(["active", "disposed", "all"] as const).map((s) => (
            <Button key={s} variant={statusFilter === s ? "default" : "outline"} size="sm"
              onClick={() => setStatusFilter(s)} className="h-8 text-xs">
              {s === "active" ? "활성" : s === "disposed" ? "처분" : "전체"}
            </Button>
          ))}
        </div>

        {/* 테이블 */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
            ) : !assets?.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <Building className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>등록된 고정자산이 없습니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="p-2.5 text-left font-medium">코드</th>
                    <th className="p-2.5 text-left font-medium">자산명</th>
                    <th className="p-2.5 text-center font-medium">분류</th>
                    <th className="p-2.5 text-left font-medium">취득일</th>
                    <th className="p-2.5 text-right font-medium">취득원가</th>
                    <th className="p-2.5 text-right font-medium">감가상각</th>
                    <th className="p-2.5 text-right font-medium">장부가액</th>
                    <th className="p-2.5 text-center font-medium">상각방법</th>
                    <th className="p-2.5 text-center font-medium">상태</th>
                    <th className="p-2.5 text-center font-medium w-[60px]">액션</th>
                  </tr></thead>
                  <tbody>
                    {assets.map((a: any) => {
                      const cat = categoryConfig[a.category] || categoryConfig.other;
                      const CatIcon = cat.icon;
                      const depRate = a.acquisitionCost > 0 ? Math.round((a.accumulatedDepreciation / a.acquisitionCost) * 100) : 0;
                      return (
                        <tr key={a.id} className="border-b hover:bg-accent/50">
                          <td className="p-2.5 font-mono">{a.assetCode}</td>
                          <td className="p-2.5 font-medium">{a.assetName}</td>
                          <td className="p-2.5 text-center">
                            <Badge className={`${cat.color} text-[10px] gap-0.5`}>
                              <CatIcon className="h-2.5 w-2.5" />{cat.label}
                            </Badge>
                          </td>
                          <td className="p-2.5 font-mono">{a.acquisitionDate}</td>
                          <td className="p-2.5 text-right font-mono">{fmt(a.acquisitionCost)}</td>
                          <td className="p-2.5 text-right">
                            <span className="font-mono">{fmt(a.accumulatedDepreciation)}</span>
                            <span className="text-[9px] text-muted-foreground ml-1">({depRate}%)</span>
                          </td>
                          <td className="p-2.5 text-right font-mono font-bold text-emerald-700">{fmt(a.bookValue)}</td>
                          <td className="p-2.5 text-center text-[10px]">
                            {a.depreciationMethod === "straight_line" ? "정액법" : "정률법"}
                          </td>
                          <td className="p-2.5 text-center">
                            <Badge variant="outline" className={a.status === "active" ? "text-emerald-600" : "text-gray-500"}>
                              {a.status === "active" ? "활성" : "처분"}
                            </Badge>
                          </td>
                          <td className="p-2.5 text-center">
                            {a.status === "active" && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500"
                                onClick={() => handleDispose(a.id, a.assetName)} title="처분">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
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

/* ═══════════════════════════════════════════
   자산 등록 폼
   ═══════════════════════════════════════════ */
function CreateAssetForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    assetName: "", category: "other" as any, acquisitionDate: todayLocal(),
    acquisitionCost: "", usefulLifeMonths: "60", depreciationMethod: "straight_line" as any,
    salvageValue: "0", location: "", notes: "",
  });

  const createMut = trpc.fixedAsset.create.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); onSuccess(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const upd = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">자산명 *</Label>
          <Input value={form.assetName} onChange={(e) => upd("assetName", e.target.value)}
            placeholder="예: 냉동고 #2" className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">분류 *</Label>
          <Select value={form.category} onValueChange={(v) => upd("category", v)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(categoryConfig).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">취득일 *</Label>
          <Input type="date" value={form.acquisitionDate} onChange={(e) => upd("acquisitionDate", e.target.value)}
            className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">취득원가 (원) *</Label>
          <Input type="number" value={form.acquisitionCost} onChange={(e) => upd("acquisitionCost", e.target.value)}
            placeholder="0" className="h-9 text-sm" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">내용연수 (월)</Label>
          <Input type="number" value={form.usefulLifeMonths} onChange={(e) => upd("usefulLifeMonths", e.target.value)}
            className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">상각방법</Label>
          <Select value={form.depreciationMethod} onValueChange={(v) => upd("depreciationMethod", v)}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="straight_line">정액법</SelectItem>
              <SelectItem value="declining_balance">정률법</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">잔존가치</Label>
          <Input type="number" value={form.salvageValue} onChange={(e) => upd("salvageValue", e.target.value)}
            className="h-9 text-sm" />
        </div>
      </div>
      <div>
        <Label className="text-xs">설치장소</Label>
        <Input value={form.location} onChange={(e) => upd("location", e.target.value)}
          placeholder="예: 본사 1층 생산동" className="h-9 text-sm" />
      </div>
      <Button className="w-full" onClick={() => createMut.mutate({
        ...form,
        acquisitionCost: Number(form.acquisitionCost) || 0,
        usefulLifeMonths: Number(form.usefulLifeMonths) || 60,
        salvageValue: Number(form.salvageValue) || 0,
      })} disabled={createMut.isPending || !form.assetName || !form.acquisitionCost}>
        {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        자산 등록
      </Button>
    </div>
  );
}
