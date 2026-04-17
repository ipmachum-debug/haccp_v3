/**
 * 전표 관리 (Journal Entries) — ERP 핵심
 * 수기 전표 입력 + 전체 전표 조회
 */
import { useState, useMemo } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountCombobox } from "@/components/accounting/AccountCombobox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Trash2, FileText, Search, Loader2, Eye, BookOpen, ArrowDownLeft, ArrowUpRight,
} from "lucide-react";
import { todayLocal } from "@/lib/dateUtils";

interface JournalLine {
  id: string;
  accountId: number | null;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
}

function newLine(): JournalLine {
  return { id: `${Date.now()}-${Math.random()}`, accountId: null, accountCode: "", accountName: "", debitAmount: 0, creditAmount: 0, description: "" };
}

export default function JournalEntries() {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [manualOnly, setManualOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  // 전표 목록
  const { data, isLoading, refetch } = trpc.journalEntry.list.useQuery({
    search: search || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    manualOnly,
    page,
    limit: 30,
  }, { refetchInterval: 30000 });

  // 계정과목 목록
  const { data: accountsData } = trpc.accountingAccounts.list.useQuery();
  const accounts = useMemo(() => {
    const items = (accountsData as any)?.items ?? (Array.isArray(accountsData) ? accountsData : []);
    return items.filter((a: any) => a.isActive === "Y" || a.isActive === 1);
  }, [accountsData]);

  // 삭제
  const deleteMut = trpc.journalEntry.delete.useMutation({
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
              <BookOpen className="h-5 w-5 text-blue-600" /> 전표 관리
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">수기 전표 입력 및 전체 분개 내역 조회</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> 수기 전표
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" /> 수기 전표 입력
                </DialogTitle>
              </DialogHeader>
              <CreateJournalForm
                accounts={accounts}
                onSuccess={() => { setCreateOpen(false); refetch(); }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* 필터 */}
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[150px]">
                <Label className="text-[10px]">검색</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={search} onChange={(e: any) => { setSearch(e.target.value); setPage(1); }}
                    placeholder="적요 검색..." className="h-8 pl-8 text-xs" />
                </div>
              </div>
              <div>
                <Label className="text-[10px]">시작일</Label>
                <Input type="date" value={startDate} onChange={(e: any) => { setStartDate(e.target.value); setPage(1); }}
                  className="h-8 text-xs w-[130px]" />
              </div>
              <div>
                <Label className="text-[10px]">종료일</Label>
                <Input type="date" value={endDate} onChange={(e: any) => { setEndDate(e.target.value); setPage(1); }}
                  className="h-8 text-xs w-[130px]" />
              </div>
              <Button variant={manualOnly ? "default" : "outline"} size="sm"
                onClick={() => { setManualOnly(!manualOnly); setPage(1); }}
                className="h-8 text-xs">
                수기만
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 요약 */}
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground">전체 전표</p>
              <p className="text-xl font-bold text-gray-800">{data.total}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground">이 페이지</p>
              <p className="text-xl font-bold text-blue-700">{data.items.length}건</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-[10px] text-muted-foreground">페이지</p>
              <p className="text-xl font-bold text-gray-600">{page} / {Math.ceil(data.total / data.limit) || 1}</p>
            </CardContent></Card>
          </div>
        )}

        {/* 테이블 */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-16 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
            ) : !data?.items.length ? (
              <div className="py-16 text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>전표가 없습니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/30">
                    <th className="text-left p-3 text-xs font-medium w-[90px]">일자</th>
                    <th className="text-left p-3 text-xs font-medium">적요</th>
                    <th className="text-center p-3 text-xs font-medium w-[60px]">유형</th>
                    <th className="text-right p-3 text-xs font-medium w-[120px]">차변</th>
                    <th className="text-right p-3 text-xs font-medium w-[120px]">대변</th>
                    <th className="text-left p-3 text-xs font-medium w-[80px]">작성자</th>
                    <th className="text-center p-3 text-xs font-medium w-[70px]">액션</th>
                  </tr></thead>
                  <tbody>
                    {data.items.map((item: any) => (
                      <tr key={item.id} className="border-b hover:bg-accent/50 cursor-pointer"
                        onClick={() => setDetailId(item.id)}>
                        <td className="p-3 text-xs font-mono">{item.entryDate}</td>
                        <td className="p-3 text-xs truncate max-w-[300px]">{item.description}</td>
                        <td className="p-3 text-center">
                          <Badge variant="outline" className={`text-[10px] ${item.isManual ? "border-blue-300 text-blue-700" : "border-gray-300 text-gray-500"}`}>
                            {item.isManual ? "수기" : "자동"}
                          </Badge>
                        </td>
                        <td className="p-3 text-right text-xs font-mono text-blue-700">
                          {item.totalDebit > 0 ? `₩${item.totalDebit.toLocaleString()}` : "-"}
                        </td>
                        <td className="p-3 text-right text-xs font-mono text-red-600">
                          {item.totalCredit > 0 ? `₩${item.totalCredit.toLocaleString()}` : "-"}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">{item.postedByName}</td>
                        <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                              onClick={() => setDetailId(item.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {item.isManual && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500"
                                onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMut.mutate({ id: item.id }); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 페이지네이션 */}
        {data && data.total > data.limit && (
          <div className="flex justify-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1}
              onClick={() => setPage(page - 1)}>이전</Button>
            <span className="text-xs self-center text-muted-foreground">
              {page} / {Math.ceil(data.total / data.limit)}
            </span>
            <Button variant="outline" size="sm" disabled={page >= Math.ceil(data.total / data.limit)}
              onClick={() => setPage(page + 1)}>다음</Button>
          </div>
        )}

        {/* 상세 다이얼로그 */}
        {detailId && (
          <JournalDetailDialog id={detailId} onClose={() => setDetailId(null)} />
        )}
      </div>
    </DashboardLayout>
  );
}

/* ═══════════════════════════════════════════
   수기 전표 입력 폼
   ═══════════════════════════════════════════ */
function CreateJournalForm({ accounts, onSuccess }: { accounts: any[]; onSuccess: () => void }) {
  const [entryDate, setEntryDate] = useState(todayLocal());
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<JournalLine[]>([newLine(), newLine()]);

  const createMut = trpc.journalEntry.create.useMutation({
    onSuccess: (r: any) => { toast.success(r.message); onSuccess(); },
    onError: (e: any) => toast.error(e.message),
  });

  const totalDebit = lines.reduce((s, l) => s + l.debitAmount, 0);
  const totalCredit = lines.reduce((s, l) => s + l.creditAmount, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const addLine = () => setLines([...lines, newLine()]);
  const removeLine = (id: string) => {
    if (lines.length <= 2) return;
    setLines(lines.filter((l) => l.id !== id));
  };
  const updateLine = (id: string, updates: Partial<JournalLine>) => {
    setLines(lines.map((l) => l.id === id ? { ...l, ...updates } : l));
  };

  const handleAccountSelect = (lineId: string, accountId: string) => {
    const acc = accounts.find((a: any) => a.id === Number(accountId));
    if (acc) {
      updateLine(lineId, {
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
      });
    }
  };

  const handleSubmit = () => {
    if (!entryDate || !description.trim()) {
      toast.error("일자와 적요를 입력하세요.");
      return;
    }
    const validLines = lines.filter((l) => l.accountId && (l.debitAmount > 0 || l.creditAmount > 0));
    if (validLines.length < 2) {
      toast.error("최소 2개 행이 필요합니다.");
      return;
    }
    if (!isBalanced) {
      toast.error("차변과 대변이 일치하지 않습니다.");
      return;
    }

    createMut.mutate({
      entryDate,
      description: description.trim(),
      lines: validLines.map((l) => ({
        accountId: l.accountId!,
        accountCode: l.accountCode,
        accountName: l.accountName,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
        description: l.description || undefined,
      })),
    });
  };

  // 계정과목 카테고리별 그룹
  const categoryLabels: Record<string, string> = {
    assets: "자산", liabilities: "부채", equity: "자본", revenue: "수익", expenses: "비용",
  };

  return (
    <div className="space-y-4">
      {/* 헤더 정보 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label className="text-xs">전표일자 *</Label>
          <Input type="date" value={entryDate} onChange={(e: any) => setEntryDate(e.target.value)}
            className="h-9 text-sm" />
        </div>
        <div>
          <Label className="text-xs">적요 *</Label>
          <Input value={description} onChange={(e: any) => setDescription(e.target.value)}
            placeholder="거래 내용을 입력하세요" className="h-9 text-sm" />
        </div>
      </div>

      {/* 분개 행 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold">분개 행</Label>
          <Button variant="outline" size="sm" onClick={addLine} className="h-7 text-xs gap-1">
            <Plus className="h-3 w-3" /> 행 추가
          </Button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead><tr className="bg-muted/50 border-b">
              <th className="p-2 text-left font-medium w-[250px]">계정과목</th>
              <th className="p-2 text-left font-medium">적요</th>
              <th className="p-2 text-right font-medium w-[130px]">
                <span className="flex items-center justify-end gap-1"><ArrowDownLeft className="h-3 w-3 text-blue-600" />차변</span>
              </th>
              <th className="p-2 text-right font-medium w-[130px]">
                <span className="flex items-center justify-end gap-1"><ArrowUpRight className="h-3 w-3 text-red-500" />대변</span>
              </th>
              <th className="p-2 w-8"></th>
            </tr></thead>
            <tbody>
              {lines.map((line) => (
                <tr key={line.id} className="border-b last:border-0">
                  <td className="p-1.5">
                    <AccountCombobox
                      selectedId={line.accountId}
                      selectedCode={line.accountCode}
                      selectedName={line.accountName}
                      onSelect={(acc) => updateLine(line.id, {
                        accountId: acc.id, accountCode: acc.code, accountName: acc.name,
                      })}
                      onClear={() => updateLine(line.id, { accountId: null, accountCode: "", accountName: "" })}
                      placeholder="계정 검색..."
                    />
                  </td>
                  <td className="p-1.5">
                    <Input value={line.description} onChange={(e: any) => updateLine(line.id, { description: e.target.value })}
                      placeholder="행 적요 (선택)" className="h-8 text-xs" />
                  </td>
                  <td className="p-1.5">
                    <Input type="number" min={0} value={line.debitAmount || ""}
                      onChange={(e: any) => updateLine(line.id, { debitAmount: Number(e.target.value) || 0, creditAmount: 0 })}
                      placeholder="0" className="h-8 text-xs text-right font-mono" />
                  </td>
                  <td className="p-1.5">
                    <Input type="number" min={0} value={line.creditAmount || ""}
                      onChange={(e: any) => updateLine(line.id, { creditAmount: Number(e.target.value) || 0, debitAmount: 0 })}
                      placeholder="0" className="h-8 text-xs text-right font-mono" />
                  </td>
                  <td className="p-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                      onClick={() => removeLine(line.id)} disabled={lines.length <= 2}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            {/* 합계 */}
            <tfoot><tr className="bg-muted/30 border-t-2">
              <td colSpan={2} className="p-2 text-right font-bold">합계</td>
              <td className="p-2 text-right font-mono font-bold text-blue-700">₩{totalDebit.toLocaleString()}</td>
              <td className="p-2 text-right font-mono font-bold text-red-600">₩{totalCredit.toLocaleString()}</td>
              <td></td>
            </tr></tfoot>
          </table>
        </div>

        {/* 대차 균형 표시 */}
        <div className={`text-xs text-center p-2 rounded-lg ${isBalanced ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
          {isBalanced
            ? `✓ 대차 균형 (₩${totalDebit.toLocaleString()})`
            : `✗ 차이: ₩${Math.abs(totalDebit - totalCredit).toLocaleString()} (차변 ₩${totalDebit.toLocaleString()} ≠ 대변 ₩${totalCredit.toLocaleString()})`
          }
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => { setLines([newLine(), newLine()]); setDescription(""); }}>
          초기화
        </Button>
        <Button size="sm" onClick={handleSubmit} disabled={createMut.isPending || !isBalanced}
          className="gap-1.5">
          {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          전표 등록
        </Button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   전표 상세 다이얼로그
   ═══════════════════════════════════════════ */
function JournalDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, isLoading } = trpc.journalEntry.getById.useQuery({ id });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" /> 전표 상세 #{id}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : data ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">일자</span>
                <p className="font-mono font-medium">{data.entryDate}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">유형</span>
                <p><Badge variant="outline" className={data.isManual ? "text-blue-700" : "text-gray-500"}>
                  {data.isManual ? "수기 전표" : "자동 전표"}
                </Badge></p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">작성자</span>
                <p className="font-medium">{data.postedByName}</p>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">적요</span>
              <p className="text-sm font-medium">{data.description}</p>
            </div>
            <table className="w-full text-xs border rounded-lg overflow-hidden">
              <thead><tr className="bg-muted/50 border-b">
                <th className="p-2 text-left">계정</th>
                <th className="p-2 text-left">적요</th>
                <th className="p-2 text-right">차변</th>
                <th className="p-2 text-right">대변</th>
              </tr></thead>
              <tbody>
                {data.lines.map((l: any, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-2"><span className="font-mono text-[10px] mr-1">{l.accountCode}</span>{l.accountName}</td>
                    <td className="p-2 text-muted-foreground">{l.description || "-"}</td>
                    <td className="p-2 text-right font-mono text-blue-700">
                      {l.debitAmount > 0 ? `₩${l.debitAmount.toLocaleString()}` : ""}
                    </td>
                    <td className="p-2 text-right font-mono text-red-600">
                      {l.creditAmount > 0 ? `₩${l.creditAmount.toLocaleString()}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-muted/30 border-t-2 font-bold">
                <td colSpan={2} className="p-2 text-right">합계</td>
                <td className="p-2 text-right font-mono text-blue-700">₩{data.totalDebit.toLocaleString()}</td>
                <td className="p-2 text-right font-mono text-red-600">₩{data.totalCredit.toLocaleString()}</td>
              </tr></tfoot>
            </table>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">전표를 찾을 수 없습니다.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
