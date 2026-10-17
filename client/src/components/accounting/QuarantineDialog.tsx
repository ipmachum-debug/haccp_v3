/**
 * 검수 불합격 격리 — 재검수·반품 (2026-10-17, CEO 결정 4)
 * 불합격 입고는 가용 재고에 들어가지 않는다. 재검수 합격이면 그때 재고·전표 초안, 불합격이면 이력만, 반품이면 발주 입고량만 되돌린다.
 * 최초 불합격은 덮어쓰지 않고 이력에 남는다 (서버: server/lib/inventory/inbound/inboundService.ts).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const ACTION: Record<string, string> = { initial: "최초 검수", reinspect: "재검수", return: "반품" };
const RESULT: Record<string, { label: string; className: string }> = {
  pass: { label: "합격", className: "bg-green-600 text-white border-transparent" },
  fail: { label: "불합격", className: "bg-red-600 text-white border-transparent" },
  conditional: { label: "조건부", className: "bg-amber-500 text-white border-transparent" },
  pending: { label: "대기", className: "bg-gray-400 text-white border-transparent" },
};

export function QuarantineDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils();
  const { data: rows = [] } = trpc.inbound.quarantined.useQuery(undefined, { enabled: open });
  const [notes, setNotes] = useState<Record<number, string>>({});
  const refresh = () => {
    utils.inbound.quarantined.invalidate();
    utils.purchaseOrder.list.invalidate();
    utils.purchaseOrder.receivableLines.invalidate();
  };
  const onError = (e: { message: string }) => toast({ title: "처리 실패", description: e.message, variant: "destructive" });
  const reinspect = trpc.inbound.reinspect.useMutation({
    onSuccess: (r: { disposition: string; voucherId: number | null }) => {
      toast({ title: r.disposition === "released" ? `재검수 합격 — 재고 반영${r.voucherId ? " · 매입전표 초안 생성" : ""}` : "재검수 불합격 — 계속 격리" });
      refresh();
    },
    onError,
  });
  const returnLine = trpc.inbound.returnLine.useMutation({
    onSuccess: () => { toast({ title: "반품 처리 — 발주 잔량이 다시 열렸습니다" }); refresh(); },
    onError,
  });
  const busy = reinspect.isPending || returnLine.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>검수 불합격 격리</DialogTitle>
          <DialogDescription>
            불합격 입고는 가용 재고에 들어가지 않습니다. 재검수(합격이면 그때 재고·전표 초안) 또는 반품으로 처리하세요.
            최초 불합격 기록은 그대로 남습니다.
          </DialogDescription>
        </DialogHeader>
        {(rows as any[]).length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">격리 중인 입고가 없습니다.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>입고</TableHead>
                <TableHead>원료</TableHead>
                <TableHead className="text-right">수량</TableHead>
                <TableHead>검수 이력</TableHead>
                <TableHead className="w-[160px]">메모·사유</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rows as any[]).map((r) => (
                <TableRow key={r.lineId}>
                  <TableCell className="text-xs">
                    <div>{r.inboundNumber}-{r.lineNumber}</div>
                    <div className="text-muted-foreground">{r.inboundDate} · {r.supplier ?? "-"}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.materialName}
                    {r.lotNumber && <div className="text-[10px] text-muted-foreground">LOT {r.lotNumber}</div>}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">{r.stockQuantity} {r.stockUnit}</TableCell>
                  <TableCell className="text-xs space-y-1">
                    {(r.history as any[]).map((h) => (
                      <div key={h.seq} className="flex items-center gap-1">
                        <span>{h.seq}. {ACTION[h.action] ?? h.action}</span>
                        {h.result && <Badge className={RESULT[h.result]?.className}>{RESULT[h.result]?.label ?? h.result}</Badge>}
                        {h.notes && <span className="text-muted-foreground">{h.notes}</span>}
                      </div>
                    ))}
                  </TableCell>
                  <TableCell>
                    <Input
                      value={notes[r.lineId] ?? ""} placeholder="재검수 메모 / 반품 사유"
                      onChange={(e) => setNotes({ ...notes, [r.lineId]: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap space-x-1">
                    <Button size="sm" className="h-7 text-xs" disabled={busy}
                      onClick={() => { if (confirm("재검수 합격 — 재고에 넣습니다. 진행할까요?")) reinspect.mutate({ lineId: r.lineId, result: "pass", notes: notes[r.lineId] || null }); }}
                    >합격</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy}
                      onClick={() => reinspect.mutate({ lineId: r.lineId, result: "fail", notes: notes[r.lineId] || null })}
                    >불합격</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" disabled={busy || !(notes[r.lineId] ?? "").trim()}
                      title="반품 사유를 먼저 입력하세요"
                      onClick={() => { if (confirm("반품 처리합니다 (발주 잔량이 다시 열립니다). 진행할까요?")) returnLine.mutate({ lineId: r.lineId, reason: notes[r.lineId].trim() }); }}
                    >반품</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
