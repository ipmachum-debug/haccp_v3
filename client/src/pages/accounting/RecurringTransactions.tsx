/**
 * 반복 거래 관리 — 매입/매출 반복 템플릿
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, RefreshCw, Loader2, Trash2, Play } from "lucide-react";

const fmt = (n: number) => `₩${n.toLocaleString()}`;

export default function RecurringTransactions() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data: templates, isLoading, refetch } = trpc.recurring.listTemplates.useQuery();

  const generateMut = trpc.recurring.generateFromTemplate.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-indigo-600" /> 반복 거래
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">매입/매출 반복 템플릿 관리</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" /> 템플릿 추가</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>반복 거래 템플릿</DialogTitle></DialogHeader>
              <CreateTemplateForm onSuccess={() => { setCreateOpen(false); refetch(); }} />
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></div>
            ) : !templates?.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <RefreshCw className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>반복 거래 템플릿이 없습니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="p-2.5 text-left font-medium">이름</th>
                    <th className="p-2.5 text-center font-medium">유형</th>
                    <th className="p-2.5 text-left font-medium">품목</th>
                    <th className="p-2.5 text-right font-medium">금액</th>
                    <th className="p-2.5 text-center font-medium">주기</th>
                    <th className="p-2.5 text-center font-medium">다음 실행</th>
                    <th className="p-2.5 text-center font-medium w-[100px]">액션</th>
                  </tr></thead>
                  <tbody>
                    {(templates as any[]).map((t: any) => (
                      <tr key={t.id} className="border-b hover:bg-accent/50">
                        <td className="p-2.5 font-medium">{t.name}</td>
                        <td className="p-2.5 text-center">
                          <Badge className={t.type === "purchase" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"} variant="outline">
                            {t.type === "purchase" ? "매입" : "매출"}
                          </Badge>
                        </td>
                        <td className="p-2.5">{t.itemName}</td>
                        <td className="p-2.5 text-right font-mono">{fmt(t.amount)}</td>
                        <td className="p-2.5 text-center">
                          {t.frequency === "monthly" ? "매월" : t.frequency === "quarterly" ? "분기" : "연간"}
                        </td>
                        <td className="p-2.5 text-center font-mono text-xs">{t.nextDate || "-"}</td>
                        <td className="p-2.5 text-center">
                          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1"
                            onClick={() => generateMut.mutate({ templateId: t.id })}
                            disabled={generateMut.isPending}>
                            <Play className="h-3 w-3" /> 실행
                          </Button>
                        </td>
                      </tr>
                    ))}
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

function CreateTemplateForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({
    type: "purchase", name: "", itemName: "", quantity: "1",
    unitPrice: "", amount: "", frequency: "monthly", nextDate: "",
  });

  const createMut = trpc.recurring.createTemplate.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); onSuccess(); },
    onError: (e: any) => toast.error(e.message),
  });

  const upd = (k: string, v: string) => {
    const next = { ...form, [k]: v };
    if (k === "unitPrice" || k === "quantity") {
      next.amount = String(Number(next.quantity || 0) * Number(next.unitPrice || 0));
    }
    setForm(next);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">유형</Label>
          <select className="w-full h-9 border rounded-lg px-2 text-sm" value={form.type} onChange={(e) => upd("type", e.target.value)}>
            <option value="purchase">매입</option><option value="sale">매출</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">주기</Label>
          <select className="w-full h-9 border rounded-lg px-2 text-sm" value={form.frequency} onChange={(e) => upd("frequency", e.target.value)}>
            <option value="monthly">매월</option><option value="quarterly">분기</option><option value="yearly">연간</option>
          </select>
        </div>
      </div>
      <div>
        <Label className="text-xs">템플릿 이름 *</Label>
        <Input value={form.name} onChange={(e: any) => upd("name", e.target.value)} placeholder="예: 월 임대료" className="h-9 text-sm" />
      </div>
      <div>
        <Label className="text-xs">품목명</Label>
        <Input value={form.itemName} onChange={(e: any) => upd("itemName", e.target.value)} placeholder="품목/서비스명" className="h-9 text-sm" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div><Label className="text-xs">수량</Label>
          <Input type="number" value={form.quantity} onChange={(e: any) => upd("quantity", e.target.value)} className="h-9 text-sm" /></div>
        <div><Label className="text-xs">단가</Label>
          <Input type="number" value={form.unitPrice} onChange={(e: any) => upd("unitPrice", e.target.value)} className="h-9 text-sm" /></div>
        <div><Label className="text-xs">금액</Label>
          <Input type="number" value={form.amount} onChange={(e: any) => upd("amount", e.target.value)} className="h-9 text-sm" readOnly /></div>
      </div>
      <div>
        <Label className="text-xs">다음 실행일</Label>
        <Input type="date" value={form.nextDate} onChange={(e: any) => upd("nextDate", e.target.value)} className="h-9 text-sm" />
      </div>
      <Button className="w-full" disabled={createMut.isPending || !form.name || !form.amount}
        onClick={() => createMut.mutate({
          type: form.type as any, name: form.name, itemName: form.itemName,
          quantity: Number(form.quantity), unitPrice: Number(form.unitPrice),
          amount: Number(form.amount), frequency: form.frequency as any, nextDate: form.nextDate,
        })}>
        {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        템플릿 저장
      </Button>
    </div>
  );
}
