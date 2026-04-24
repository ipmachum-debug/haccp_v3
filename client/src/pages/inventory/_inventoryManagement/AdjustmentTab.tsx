/**
 * 재고 조정 탭 — InventoryManagementIntegrated.tsx 에서 분리 (2026-04-19)
 *
 * 2026-04-22 리팩토링: 제품 모드는 "제품 선택 + 자동 LOT 배분" 방식으로 전환.
 * - 증가(+): 최신 LOT 1개에 추가 (createdAt DESC first)
 * - 감소(-): 가장 오래된 LOT 부터 cascade 차감 (FEFO)
 * - 원재료 모드는 기존 LOT 직접 선택 방식 유지 (PR 별도에서 개선 예정)
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/inventory/InventoryHelpers";
import { ProductCombobox } from "@/components/inventory/ProductCombobox";
import type { InventoryLot } from "./types";

export function AdjustmentTab({ isMat }: { isMat: boolean }) {
  if (isMat) return <MaterialLotAdjustment />;
  return <ProductAdjustment />;
}

/* ═══════════════════════════════════════════════════
   제품 재고 조정 — 제품 선택 + 자동 LOT 배분 (B 방식)
   ═══════════════════════════════════════════════════ */
function ProductAdjustment() {
  const [productId, setProductId] = useState<number | null>(null);
  const [productName, setProductName] = useState<string>("");
  const [adjType, setAdjType] = useState<"increase" | "decrease">("increase");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  // 선택 제품의 현재 활성 LOT 정보 (미리보기 + 합계)
  const { data: allLots } = trpc.inventory.list.useQuery();
  const productLots = useMemo(() => {
    if (!productId) return [];
    return ((allLots as InventoryLot[] | undefined) ?? []).filter(
      (l: any) =>
        Number(l.productId) === productId &&
        (l.status === "available" || !l.status),
    );
  }, [allLots, productId]);

  const totalAvailable = productLots.reduce(
    (s, l) => s + parseFloat(String(l.availableQuantity ?? "0")),
    0,
  );
  const unit = productLots[0]?.unit ?? "";

  const changeAmt = parseFloat(qty) || 0;
  const previewTotal =
    adjType === "increase"
      ? totalAvailable + changeAmt
      : Math.max(0, totalAvailable - changeAmt);

  const mut = trpc.inventory.adjustStockByProduct.useMutation({
    onSuccess: (r: { affectedLots: Array<{ lotNumber: string; changeQty: number; newAvailable: number }>; message: string }) => {
      utils.inventory.list.invalidate();
      utils.inventory.getDashboard.invalidate();
      const detail = r.affectedLots
        .map((a) => `  • ${a.lotNumber}: ${a.changeQty > 0 ? "+" : ""}${a.changeQty.toFixed(1)} → ${a.newAvailable.toFixed(1)} ${unit}`)
        .join("\n");
      alert(`${r.message}\n\n${detail}`);
      setProductId(null);
      setProductName("");
      setQty("");
      setReason("");
    },
    onError: (e: { message: string }) => alert(`실패: ${e.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !qty || !reason) {
      alert("제품, 수량, 사유를 모두 입력해주세요.");
      return;
    }
    if (changeAmt <= 0) {
      alert("수량은 0보다 커야 합니다.");
      return;
    }
    if (productLots.length === 0) {
      alert("활성 LOT 이 없습니다. 생산 완료 또는 수동 입고로 먼저 LOT 을 생성해주세요.");
      return;
    }
    if (adjType === "decrease" && changeAmt > totalAvailable + 0.001) {
      alert(`재고 부족: 요청 ${changeAmt}, 가용 ${totalAvailable.toFixed(1)} ${unit}`);
      return;
    }
    const signedChange = adjType === "increase" ? changeAmt : -changeAmt;
    const lotHint =
      adjType === "increase"
        ? `→ 최신 LOT 에 추가`
        : `→ 오래된 LOT 부터 차감 (FEFO)`;
    if (
      confirm(
        `[${adjType === "increase" ? "증가" : "감소"}] ${productName}\n\n` +
          `현재 합계: ${totalAvailable.toFixed(1)} ${unit}\n` +
          `변경: ${adjType === "increase" ? "+" : "-"}${changeAmt.toFixed(1)} ${unit}\n` +
          `결과 합계: ${previewTotal.toFixed(1)} ${unit}\n` +
          `${lotHint}\n\n사유: ${reason}\n\n진행하시겠습니까?`,
      )
    ) {
      mut.mutate({ productId, quantityChange: signedChange, reason });
    }
  };

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle
          icon={Settings}
          title="제품 재고 조정"
          desc="제품 선택 후 수량 조정 · LOT 은 자동 배분 (증가=최신 LOT / 감소=FEFO)"
        />
      </CardHeader>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                제품 선택 <span className="text-red-500">*</span>
              </label>
              <ProductCombobox
                selectedId={productId}
                selectedName={productName}
                onSelect={(p) => {
                  setProductId(p.id);
                  setProductName(p.productName);
                }}
                onClear={() => {
                  setProductId(null);
                  setProductName("");
                }}
                placeholder="제품명으로 검색..."
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                조정 유형 <span className="text-red-500">*</span>
              </label>
              <Select value={adjType} onValueChange={(v) => setAdjType(v as typeof adjType)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="increase">증가 (+) → 최신 LOT</SelectItem>
                  <SelectItem value="decrease">감소 (-) → 오래된 LOT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                변경 수량 <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="변경할 수량"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                사유 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                className="w-full h-9 px-3 border rounded-lg text-xs bg-background focus:ring-2 focus:ring-blue-500/20 transition"
                placeholder="조정 사유 (필수)"
                required
              />
            </div>
          </div>

          {/* 미리보기 */}
          {productId && (
            <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
              <div className="flex items-center gap-4 flex-wrap text-xs">
                <div>
                  <span className="text-muted-foreground">제품:</span>{" "}
                  <span className="font-medium">{productName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">활성 LOT:</span>{" "}
                  <span className="font-mono font-medium">{productLots.length} 개</span>
                </div>
                <div>
                  <span className="text-muted-foreground">현재 합계:</span>{" "}
                  <span className="font-mono font-medium">
                    {totalAvailable.toFixed(1)} {unit}
                  </span>
                </div>
                {changeAmt > 0 && (
                  <>
                    <div>
                      <span
                        className={
                          adjType === "increase"
                            ? "text-emerald-600 font-bold"
                            : "text-red-600 font-bold"
                        }
                      >
                        {adjType === "increase" ? "+" : "-"}
                        {changeAmt.toFixed(1)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">결과:</span>{" "}
                      <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                        {previewTotal.toFixed(1)} {unit}
                      </span>
                    </div>
                  </>
                )}
              </div>
              {productLots.length === 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠ 활성 LOT 없음 — 생산 완료 또는 수동 입고로 먼저 LOT 을 생성해주세요.
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={mut.isPending || !productId || !qty || !reason || productLots.length === 0}
              className="h-9 text-xs px-5"
            >
              {mut.isPending ? "처리 중..." : "조정 처리"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════
   원재료 재고 조정 — 기존 LOT 직접 선택 방식 유지
   (PR 2 에서 원재료 LOT 매칭 버그 수정 예정)
   ═══════════════════════════════════════════════════ */
function MaterialLotAdjustment() {
  const [lotId, setLotId] = useState<number | null>(null);
  const [adjType, setAdjType] = useState<"increase" | "decrease">("increase");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();
  const { data: lots } = trpc.inventory.list.useQuery();
  const mut = trpc.inventory.adjustStock.useMutation({
    onSuccess: (r: any) => {
      utils.inventory.list.invalidate();
      utils.inventory.getDashboard.invalidate();
      alert(r?.message || "조정 완료");
      setLotId(null);
      setQty("");
      setReason("");
    },
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
        <SectionTitle icon={Settings} title="원재료 재고 조정" desc="재고 실사, 오류 보정 등 수동 조정" />
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
