/**
 * 재고 조정 탭 — InventoryManagementIntegrated.tsx 에서 분리 (2026-04-19)
 *
 * 재고 실사, 오류 보정 등 수동 조정
 * - LOT 선택 + 증가/감소 + 수량 + 사유 입력
 * - 현재/변경/결과 미리보기
 */
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/inventory/InventoryHelpers";
import type { InventoryLot } from "./types";

export function AdjustmentTab({ isMat }: { isMat: boolean }) {
  const [lotId, setLotId] = useState<number | null>(null);
  const [adjType, setAdjType] = useState<"increase" | "decrease">("increase");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const { data: lots } = trpc.inventory.list.useQuery();
  const mut = trpc.inventory.adjustStock.useMutation({
    onSuccess: (r: any) => { utils.inventory.list.invalidate(); utils.inventory.getDashboard.invalidate(); alert(r?.message || "조정 완료"); setLotId(null); setQty(""); setReason(""); },
    onError: (e: { message: string }) => alert(`실패: ${e.message}`),
  });

  const selectedLot = (lots as InventoryLot[] | undefined)?.find((l) => l.id === lotId);
  const currentQty = selectedLot ? parseFloat(String(selectedLot.availableQuantity ?? "0")) : 0;
  const changeAmt = parseFloat(qty) || 0;
  const previewQty = adjType === "increase" ? currentQty + changeAmt : Math.max(0, currentQty - changeAmt);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lotId || !qty || !reason) { alert("LOT, 수량, 사유를 모두 입력해주세요."); return; }
    if (changeAmt <= 0) { alert("수량은 0보다 커야 합니다."); return; }
    const lotInfo = selectedLot ? `${selectedLot.lotNumber} (${selectedLot.materialName})` : `LOT #${lotId}`;
    if (confirm(`[${adjType === "increase" ? "증가" : "감소"}] ${lotInfo}\n\n현재: ${currentQty.toFixed(1)} ${selectedLot?.unit || ""}\n변경: ${adjType === "increase" ? "+" : "-"}${changeAmt.toFixed(1)}\n결과: ${previewQty.toFixed(1)} ${selectedLot?.unit || ""}\n\n사유: ${reason}\n\n진행하시겠습니까?`))
      mut.mutate({ lotId, quantityChange: adjType === "increase" ? changeAmt : -changeAmt, reason });
  };

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle icon={Settings} title={`${isMat ? "원재료" : "제품"} 재고 조정`} desc="재고 실사, 오류 보정 등 수동 조정" />
      </CardHeader>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">LOT 선택 <span className="text-red-500">*</span></label>
              <Select value={lotId?.toString() || ""} onValueChange={v => setLotId(parseInt(v))}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="LOT 선택" /></SelectTrigger>
                <SelectContent>{(lots as InventoryLot[] | undefined)?.map((l) => (
                  <SelectItem key={l.id} value={l.id.toString()}>
                    <span className="text-xs">{l.lotNumber} - {l.materialName} ({l.availableQuantity} {l.unit})</span>
                  </SelectItem>
                ))}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">조정 유형 <span className="text-red-500">*</span></label>
              <Select value={adjType} onValueChange={(v) => setAdjType(v as typeof adjType)}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">증가 (+)</SelectItem>
                  <SelectItem value="decrease">감소 (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">변경 수량 <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" min="0.01" value={qty} onChange={e => setQty(e.target.value)}
                className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 transition" placeholder="변경할 수량" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">사유 <span className="text-red-500">*</span></label>
              <input type="text" value={reason} onChange={e => setReason(e.target.value)} maxLength={200}
                className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 transition" placeholder="조정 사유 (필수)" required />
            </div>
          </div>

          {/* 미리보기 */}
          {selectedLot && changeAmt > 0 && (
            <div className="p-3 rounded-lg border bg-muted/20 flex items-center gap-4 flex-wrap">
              <div className="text-xs">
                <span className="text-muted-foreground">LOT:</span> <span className="font-mono font-medium">{selectedLot.lotNumber}</span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">현재:</span> <span className="font-mono font-medium">{currentQty.toFixed(1)} {selectedLot.unit}</span>
              </div>
              <div className="text-xs">
                <span className={adjType === "increase" ? "text-emerald-600 font-bold" : "text-red-600 font-bold"}>
                  {adjType === "increase" ? "+" : "-"}{changeAmt.toFixed(1)}
                </span>
              </div>
              <div className="text-xs">
                <span className="text-muted-foreground">결과:</span> <span className="font-mono font-bold text-blue-700 dark:text-blue-400">{previewQty.toFixed(1)} {selectedLot.unit}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={mut.isPending || !lotId || !qty || !reason} className="h-9 text-xs px-5">
              {mut.isPending ? "처리 중..." : "조정 처리"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════
   부자재 · 외주제품 재고 현황 (간소화 LOT 뷰)
   ═══════════════════════════════════════════════════ */
