/**
 * MaterialPriceManagement — 원재료 단가 관리 (2026-10-13, CEO 요청)
 *
 *  · 자재별 현재 단가 / 최근 입고가(날짜) / 차이 / 입고 시 자동 갱신 / 마지막 변경
 *  · 현재 단가 → 최근 입고가로 일괄 갱신 (전체 / 누락만). 자동 갱신 꺼진 자재(수동 고정)는 건너뜀
 *  · 자재별 수동 입력 — 샘플·1회성 매입·원가 누락 보강. 사유 필수. "수동 고정" 체크 시 이후 입고가 무시
 *  · 단가 이력
 *
 * 원가 계산 원칙: 과거 배치는 그 시점 LOT 단가, 여기서 바꾸는 "현재 단가" 는 LOT 단가가 없는 투입과 앞으로의
 * 계획·추정에만 쓰인다 (과거 원가에 소급되지 않음).
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, History, Loader2, Lock, RefreshCw, Search, Tag } from "lucide-react";
import { toast } from "sonner";

type Row = {
  materialId: number;
  materialCode: string;
  materialName: string;
  unit: string | null;
  kind: string | null;
  currentPrice: number;
  autoUpdate: boolean;
  latestReceiptPrice: number | null;
  latestReceiptDate: string | null;
  latestReceiptSource: "lot" | "receipt_tx" | null;
  diffPct: number | null;
  lastChangeAt: string | Date | null;
  lastChangeReason: string | null;
  lastChangeNewPrice: number | null;
  missing: boolean;
  stale: boolean;
};

type Filter = "all" | "missing" | "stale" | "fixed";

const won = (n: number | null | undefined) => (n == null ? "-" : `₩${Math.round(n).toLocaleString("ko-KR")}`);
const fmtDate = (v: string | Date | null | undefined) => {
  if (!v) return "-";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
};

export default function MaterialPriceManagement() {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Row | null>(null);
  const [historyFor, setHistoryFor] = useState<Row | null>(null);

  const { data, isLoading } = trpc.materialPrice.list.useQuery({ search: search || undefined });
  const rows: Row[] = (data as Row[] | undefined) ?? [];

  const refresh = () => utils.materialPrice.list.invalidate();

  const refreshAll = trpc.materialPrice.refreshAll.useMutation({
    onSuccess: (r: { total: number; updated: number; skippedFixed: number; skippedSame: number; noReceipt: number; updatedNames: string[] }) => {
      toast.success(`일괄 갱신 완료: ${r.updated}건 변경`, {
        description: `동일 ${r.skippedSame} · 수동 고정 제외 ${r.skippedFixed} · 입고가 없음 ${r.noReceipt} (전체 ${r.total})`,
      });
      refresh();
    },
    onError: (e: { message: string }) => toast.error(`일괄 갱신 실패: ${e.message}`),
  });
  const setAuto = trpc.materialPrice.setAutoUpdate.useMutation({
    onSuccess: () => refresh(),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const counts = useMemo(() => ({
    all: rows.length,
    missing: rows.filter((r) => r.missing).length,
    stale: rows.filter((r) => r.stale).length,
    fixed: rows.filter((r) => !r.autoUpdate).length,
  }), [rows]);

  const visible = rows.filter((r) =>
    filter === "missing" ? r.missing : filter === "stale" ? r.stale : filter === "fixed" ? !r.autoUpdate : true,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="h-6 w-6" />원재료 단가 관리</h1>
          <p className="text-muted-foreground text-sm">
            현재 단가는 LOT 단가가 없는 투입과 앞으로의 계획·추정에 쓰입니다. 과거 배치 원가는 그 시점 LOT 단가로 계산돼 여기서 바꿔도 소급되지 않습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={refreshAll.isPending}
            onClick={() => { if (confirm(`현재 단가가 비어 있는 자재 ${counts.missing}건을 최근 입고가로 채웁니다. 진행할까요?`)) refreshAll.mutate({ onlyMissing: true }); }}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> 누락만 갱신 ({counts.missing})
          </Button>
          <Button
            disabled={refreshAll.isPending}
            onClick={() => { if (confirm(`자동 갱신이 켜진 자재 전부를 최근 입고가로 맞춥니다 (차이 있는 ${counts.stale}건 예상). 수동 고정 자재는 제외됩니다. 진행할까요?`)) refreshAll.mutate({ onlyMissing: false }); }}
          >
            {refreshAll.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            최근 입고가로 전체 갱신
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
            <div className="flex gap-1 flex-wrap">
              {([
                ["all", `전체 ${counts.all}`],
                ["missing", `단가 누락 ${counts.missing}`],
                ["stale", `입고가와 다름 ${counts.stale}`],
                ["fixed", `수동 고정 ${counts.fixed}`],
              ] as [Filter, string][]).map(([k, label]) => (
                <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{label}</Button>
              ))}
            </div>
            <div className="relative w-full md:w-64">
              <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
              <Input className="pl-8" placeholder="자재명 / 코드" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <CardDescription className="text-xs">
            최근 입고가 = 단가가 있는 최신 입고 LOT (없으면 입고 거래 금액 ÷ 수량). 자동 갱신 ON 이면 새 입고 때 현재 단가가 그 값으로 바뀌고 이력에 남습니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />불러오는 중...</div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">해당하는 자재가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>자재</TableHead>
                    <TableHead className="text-right">현재 단가</TableHead>
                    <TableHead className="text-right">최근 입고가</TableHead>
                    <TableHead className="text-right">차이</TableHead>
                    <TableHead className="text-center">입고 시 자동 갱신</TableHead>
                    <TableHead>마지막 변경</TableHead>
                    <TableHead className="text-right w-40"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((r) => (
                    <TableRow key={r.materialId} className={r.missing ? "bg-amber-50/50 dark:bg-amber-950/20" : ""}>
                      <TableCell>
                        <div className="font-medium flex items-center gap-1.5">
                          {r.materialName}
                          {r.missing && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                          {!r.autoUpdate && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">{r.materialCode}{r.unit ? ` · ${r.unit}` : ""}</div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{r.currentPrice > 0 ? won(r.currentPrice) : <span className="text-amber-600">없음</span>}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.latestReceiptPrice != null ? (
                          <>
                            {won(r.latestReceiptPrice)}
                            <div className="text-[10px] text-muted-foreground">{r.latestReceiptDate ?? "-"}{r.latestReceiptSource === "receipt_tx" ? " (거래)" : ""}</div>
                          </>
                        ) : <span className="text-muted-foreground">입고 없음</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.diffPct == null ? "-" : (
                          <span className={Math.abs(r.diffPct) >= 1 ? (r.diffPct > 0 ? "text-red-600" : "text-blue-600") : "text-muted-foreground"}>
                            {r.diffPct > 0 ? "+" : ""}{r.diffPct}%
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={r.autoUpdate}
                          disabled={setAuto.isPending}
                          onCheckedChange={(v) => setAuto.mutate({ materialId: r.materialId, enabled: v })}
                          title={r.autoUpdate ? "ON: 새 입고가가 들어오면 현재 단가 자동 갱신" : "OFF: 수동 고정 — 입고가가 와도 현재 단가 유지"}
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                        {r.lastChangeAt ? (
                          <>
                            <div>{fmtDate(r.lastChangeAt)} · {won(r.lastChangeNewPrice)}</div>
                            <div className="truncate" title={r.lastChangeReason ?? ""}>{r.lastChangeReason ?? ""}</div>
                          </>
                        ) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="outline" onClick={() => setEditing(r)}>수동 입력</Button>
                          <Button size="sm" variant="ghost" onClick={() => setHistoryFor(r)} title="단가 이력"><History className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && <ManualPriceDialog row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {historyFor && <PriceHistoryDialog row={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

function ManualPriceDialog({ row, onClose, onSaved }: { row: Row; onClose: () => void; onSaved: () => void }) {
  const [price, setPrice] = useState(row.currentPrice > 0 ? String(row.currentPrice) : row.latestReceiptPrice != null ? String(row.latestReceiptPrice) : "");
  const [reason, setReason] = useState("");
  const [fix, setFix] = useState(!row.autoUpdate);
  const save = trpc.materialPrice.setManual.useMutation({
    onSuccess: () => { toast.success(`${row.materialName} 단가 저장`); onSaved(); },
    onError: (e: { message: string }) => toast.error(`저장 실패: ${e.message}`),
  });
  const n = parseFloat(price);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row.materialName} — 단가 수동 입력</DialogTitle>
          <DialogDescription>
            샘플·1회성 매입·원가 누락 보강용입니다. 사유가 이력에 남습니다. 현재 {won(row.currentPrice)} · 최근 입고가 {won(row.latestReceiptPrice)}{row.latestReceiptDate ? ` (${row.latestReceiptDate})` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>단가 (원 / {row.unit ?? "단위"})</Label>
            <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>사유 *</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 샘플 구매라 시세 적용 / 1회성 특가 / 견적가" className="mt-1" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <div className="text-sm font-medium flex items-center gap-1"><Lock className="h-3.5 w-3.5" />수동 고정</div>
              <div className="text-xs text-muted-foreground">켜면 이후 입고가가 들어와도 이 단가를 유지합니다 (입고 시 자동 갱신 OFF)</div>
            </div>
            <Switch checked={fix} onCheckedChange={setFix} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button
            disabled={save.isPending || !(n >= 0) || !reason.trim()}
            onClick={() => save.mutate({ materialId: row.materialId, unitPrice: n, reason: reason.trim(), autoUpdate: !fix })}
          >
            {save.isPending ? "저장 중..." : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PriceHistoryDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const { data, isLoading } = trpc.materialPrice.history.useQuery({ materialId: row.materialId, limit: 30 });
  const items = (data as Array<{ id: number; oldPrice: number | null; newPrice: number; changedAt: string | Date | null; reason: string | null; changedByName: string | null }> | undefined) ?? [];
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row.materialName} — 단가 이력</DialogTitle>
          <DialogDescription>입고 자동 갱신 · 수동 입력 · 일괄 갱신 · 백필이 모두 남습니다.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="text-sm text-muted-foreground py-4">불러오는 중...</div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">이력이 없습니다.</p>
        ) : (
          <ol className="space-y-2 max-h-80 overflow-y-auto">
            {items.map((h) => (
              <li key={h.id} className="text-sm border-b pb-2 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{won(h.oldPrice)} → <span className="font-semibold">{won(h.newPrice)}</span></span>
                  <span className="text-xs text-muted-foreground">{h.changedAt ? new Date(h.changedAt).toLocaleString("ko-KR") : "-"}{h.changedByName ? ` · ${h.changedByName}` : ""}</span>
                </div>
                {h.reason && <div className="text-xs text-muted-foreground mt-0.5">{h.reason}</div>}
              </li>
            ))}
          </ol>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>닫기</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
