/**
 * 발주 수량 변경 요청·승인 (2026-10-17, CEO 결정 3)
 * 초과 입고는 자동 허용 없이 막힌다. 실제로 더 들어왔다면 여기서 발주 수량 변경을 요청하고, 승인된 뒤 추가 입고한다.
 * 원래 수량·요청자·승인자·사유는 이력으로 남는다 (서버: server/lib/inventory/inbound/poQtyChange.ts).
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "승인 대기", className: "bg-amber-500 text-white border-transparent" },
  approved: { label: "승인", className: "bg-green-600 text-white border-transparent" },
  rejected: { label: "반려", className: "bg-gray-400 text-white border-transparent" },
};

export function PoQtyChangeDialog({ poId, open, onOpenChange }: { poId: number | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const utils = trpc.useUtils();
  const enabled = !!poId && open;
  const { data: po } = trpc.purchaseOrder.getById.useQuery({ id: poId! }, { enabled });
  const { data: changes = [] } = trpc.purchaseOrder.qtyChanges.useQuery({ poId: poId! }, { enabled });
  const [newQty, setNewQty] = useState<Record<number, string>>({});
  const [reason, setReason] = useState<Record<number, string>>({});

  const refresh = () => {
    utils.purchaseOrder.qtyChanges.invalidate();
    utils.purchaseOrder.getById.invalidate();
    utils.purchaseOrder.list.invalidate();
    utils.purchaseOrder.receivableLines.invalidate();
  };
  const requestMutation = trpc.purchaseOrder.requestQtyChange.useMutation({
    onSuccess: (_r: unknown, v: { poLineId: number }) => {
      toast({ title: "수량 변경 요청", description: "승인되면 추가 입고할 수 있습니다." });
      setNewQty((s) => ({ ...s, [v.poLineId]: "" }));
      setReason((s) => ({ ...s, [v.poLineId]: "" }));
      refresh();
    },
    onError: (e: { message: string }) => toast({ title: "요청 실패", description: e.message, variant: "destructive" }),
  });
  const decideMutation = trpc.purchaseOrder.decideQtyChange.useMutation({
    onSuccess: (r: { status: string }) => { toast({ title: r.status === "approved" ? "변경 승인 — 발주 수량 반영" : "변경 반려" }); refresh(); },
    onError: (e: { message: string }) => toast({ title: "처리 실패", description: e.message, variant: "destructive" }),
  });

  const pendingLines = new Set((changes as any[]).filter((c) => c.status === "pending").map((c) => c.poLineId));
  const decide = (changeId: number, approve: boolean) => {
    const note = approve ? null : prompt("반려 사유 (선택)");
    if (!approve && note === null) return;
    if (approve && !confirm("발주 수량을 바꿉니다. 승인할까요?")) return;
    decideMutation.mutate({ changeId, approve, note: note || undefined });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>발주 수량 변경 — {(po as any)?.poNumber}</DialogTitle>
          <DialogDescription>
            발주보다 더 들어온 경우 입고는 막힙니다. 수량 변경을 요청하고 승인받은 뒤 추가 입고하세요.
            원래 발주 수량과 변경 이력은 그대로 남습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>라인</TableHead>
                <TableHead>품목</TableHead>
                <TableHead className="text-right">발주</TableHead>
                <TableHead className="text-right">입고</TableHead>
                <TableHead className="w-[110px]">새 발주 수량</TableHead>
                <TableHead>사유</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {((po as any)?.lines ?? []).map((line: any) => {
                const id = Number(line.id);
                const qty = parseFloat(newQty[id] ?? "");
                const waiting = pendingLines.has(id);
                return (
                  <TableRow key={id}>
                    <TableCell className="text-xs">{line.lineNumber}</TableCell>
                    <TableCell className="text-sm">{line.itemName}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{Number(line.orderedQty)} {line.unit}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{Number(line.receivedQty)} {line.unit}</TableCell>
                    <TableCell>
                      <Input
                        type="number" step="0.001" min={Number(line.receivedQty)}
                        value={newQty[id] ?? ""} placeholder={String(Number(line.orderedQty))}
                        onChange={(e) => setNewQty({ ...newQty, [id]: e.target.value })}
                        className="h-8 text-right" disabled={waiting}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={reason[id] ?? ""} placeholder={waiting ? "승인 대기 중" : "예: 실입고 120kg"}
                        onChange={(e) => setReason({ ...reason, [id]: e.target.value })}
                        className="h-8 text-xs" disabled={waiting}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm" variant="outline" className="h-8 text-xs"
                        disabled={waiting || !(qty > 0) || !(reason[id] ?? "").trim() || requestMutation.isPending}
                        onClick={() => requestMutation.mutate({ poLineId: id, newQty: qty, reason: reason[id].trim() })}
                      >요청</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4">
          <div className="text-sm font-semibold mb-2">변경 이력</div>
          {(changes as any[]).length === 0 ? (
            <div className="text-xs text-muted-foreground">변경 이력이 없습니다.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>라인</TableHead>
                  <TableHead>품목</TableHead>
                  <TableHead className="text-right">원래 → 새 수량</TableHead>
                  <TableHead>사유</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(changes as any[]).map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs">{c.lineNumber ?? "-"}</TableCell>
                    <TableCell className="text-sm">{c.itemName}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{c.oldQty} → <b>{c.newQty}</b> {c.unit}</TableCell>
                    <TableCell className="text-xs">
                      {c.reason}
                      {c.decisionNote && <div className="text-muted-foreground">처리: {c.decisionNote}</div>}
                    </TableCell>
                    <TableCell><Badge className={STATUS[c.status]?.className}>{STATUS[c.status]?.label ?? c.status}</Badge></TableCell>
                    <TableCell className="whitespace-nowrap">
                      {c.status === "pending" && (
                        <>
                          <Button size="sm" className="h-7 text-xs mr-1" disabled={decideMutation.isPending} onClick={() => decide(c.id, true)}>승인</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={decideMutation.isPending} onClick={() => decide(c.id, false)}>반려</Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
