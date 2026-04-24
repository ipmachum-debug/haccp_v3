/**
 * 재고 조정 탭 — 4가지 품목 유형 통합 지원
 *
 * 2026-04-22 PR #58: 제품 모드를 "제품 선택 + 자동 LOT 배분" 으로 전환.
 * 2026-04-22 PR #59: 원재료/부자재/외주제품 모드도 동일 패턴으로 통일.
 *
 * UX:
 *   - 품목(원재료/제품/부자재/외주제품) 선택
 *   - 증가(+) / 감소(−)
 *   - 수량 + 사유 입력
 *   - 활성 LOT 목록 미리보기 (합계)
 *   - 자동 LOT 배분 (B 방식 FEFO):
 *       증가 → 최신 LOT 에 추가
 *       감소 → 가장 오래된 LOT 부터 cascade 차감
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Settings } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/components/inventory/InventoryHelpers";
import { ProductCombobox } from "@/components/inventory/ProductCombobox";
import { MaterialCombobox } from "@/components/inventory/MaterialCombobox";
import type { InventoryLot } from "./types";

export type AdjustmentView = "material" | "product" | "subsidiary" | "external";

const VIEW_LABELS: Record<AdjustmentView, string> = {
  material: "원재료",
  product: "제품",
  subsidiary: "부자재",
  external: "외주제품",
};

const VIEW_ITEM_TYPE: Record<Exclude<AdjustmentView, "product">, string> = {
  material: "raw_material",
  subsidiary: "subsidiary",
  external: "external_product",
};

export function AdjustmentTab({ view }: { view: AdjustmentView }) {
  if (view === "product") return <ProductAdjustment />;
  return <MaterialLikeAdjustment view={view} />;
}

/* ═══════════════════════════════════════════════════
   자사제품 재고 조정 — ProductCombobox + adjustStockByProduct(productId)
   ═══════════════════════════════════════════════════ */
function ProductAdjustment() {
  const [productId, setProductId] = useState<number | null>(null);
  const [productName, setProductName] = useState<string>("");
  const [adjType, setAdjType] = useState<"increase" | "decrease">("increase");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const { data: allLots } = trpc.inventory.list.useQuery();
  const itemLots = useMemo(() => {
    if (!productId) return [];
    return ((allLots as InventoryLot[] | undefined) ?? []).filter(
      (l: any) =>
        Number(l.productId) === productId &&
        (l.status === "available" || !l.status),
    );
  }, [allLots, productId]);

  return (
    <AdjustmentFormShell
      label="제품"
      desc="제품 선택 후 수량 조정 · LOT 은 자동 배분 (증가=최신 LOT / 감소=FEFO)"
      picker={
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
      }
      itemName={productName}
      lots={itemLots}
      adjType={adjType}
      setAdjType={setAdjType}
      qty={qty}
      setQty={setQty}
      reason={reason}
      setReason={setReason}
      mutateInput={
        productId
          ? {
              productId,
              quantityChange:
                adjType === "increase"
                  ? Math.abs(parseFloat(qty) || 0)
                  : -Math.abs(parseFloat(qty) || 0),
              reason,
            }
          : null
      }
      onSuccess={() => {
        utils.inventory.list.invalidate();
        utils.inventory.getDashboard.invalidate();
        setProductId(null);
        setProductName("");
        setQty("");
        setReason("");
      }}
      canSubmit={!!productId}
    />
  );
}

/* ═══════════════════════════════════════════════════
   원재료/부자재/외주제품 재고 조정 — MaterialCombobox + materialId
   ═══════════════════════════════════════════════════ */
function MaterialLikeAdjustment({ view }: { view: Exclude<AdjustmentView, "product"> }) {
  const [materialId, setMaterialId] = useState<number | null>(null);
  const [materialName, setMaterialName] = useState<string>("");
  const [adjType, setAdjType] = useState<"increase" | "decrease">("increase");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const itemType = VIEW_ITEM_TYPE[view];
  const label = VIEW_LABELS[view];

  const { data: allLots } = trpc.inventory.list.useQuery();
  const itemLots = useMemo(() => {
    if (!materialId) return [];
    return ((allLots as InventoryLot[] | undefined) ?? []).filter(
      (l: any) =>
        Number(l.materialId) === materialId &&
        (l.status === "available" || !l.status),
    );
  }, [allLots, materialId]);

  return (
    <AdjustmentFormShell
      label={label}
      desc={`${label} 선택 후 수량 조정 · LOT 은 자동 배분 (증가=최신 LOT / 감소=FEFO)`}
      picker={
        <MaterialCombobox
          selectedId={materialId}
          selectedName={materialName}
          onSelect={(m) => {
            setMaterialId(m.id);
            setMaterialName(m.materialName);
          }}
          onClear={() => {
            setMaterialId(null);
            setMaterialName("");
          }}
          placeholder={`${label}명으로 검색...`}
          itemTypes={[itemType]}
        />
      }
      itemName={materialName}
      lots={itemLots}
      adjType={adjType}
      setAdjType={setAdjType}
      qty={qty}
      setQty={setQty}
      reason={reason}
      setReason={setReason}
      mutateInput={
        materialId
          ? {
              materialId,
              quantityChange:
                adjType === "increase"
                  ? Math.abs(parseFloat(qty) || 0)
                  : -Math.abs(parseFloat(qty) || 0),
              reason,
            }
          : null
      }
      onSuccess={() => {
        utils.inventory.list.invalidate();
        utils.inventory.getDashboard.invalidate();
        setMaterialId(null);
        setMaterialName("");
        setQty("");
        setReason("");
      }}
      canSubmit={!!materialId}
    />
  );
}

/* ═══════════════════════════════════════════════════
   공통 폼 shell (picker 슬롯 + 수량/사유/미리보기/제출)
   ═══════════════════════════════════════════════════ */
type MutInput =
  | { productId: number; quantityChange: number; reason: string }
  | { materialId: number; quantityChange: number; reason: string };

interface AdjustmentFormShellProps {
  label: string;
  desc: string;
  picker: React.ReactNode;
  itemName: string;
  lots: InventoryLot[];
  adjType: "increase" | "decrease";
  setAdjType: (v: "increase" | "decrease") => void;
  qty: string;
  setQty: (v: string) => void;
  reason: string;
  setReason: (v: string) => void;
  mutateInput: MutInput | null;
  onSuccess: () => void;
  canSubmit: boolean;
}

function AdjustmentFormShell(props: AdjustmentFormShellProps) {
  const {
    label,
    desc,
    picker,
    itemName,
    lots,
    adjType,
    setAdjType,
    qty,
    setQty,
    reason,
    setReason,
    mutateInput,
    onSuccess,
    canSubmit,
  } = props;

  const totalAvailable = lots.reduce(
    (s, l) => s + parseFloat(String(l.availableQuantity ?? "0")),
    0,
  );
  const unit = lots[0]?.unit ?? "";
  const changeAmt = parseFloat(qty) || 0;
  const previewTotal =
    adjType === "increase"
      ? totalAvailable + changeAmt
      : Math.max(0, totalAvailable - changeAmt);

  const mut = trpc.inventory.adjustStockByProduct.useMutation({
    onSuccess: (r: {
      affectedLots: Array<{ lotNumber: string; changeQty: number; newAvailable: number }>;
      message: string;
    }) => {
      const detail = r.affectedLots
        .map(
          (a) =>
            `  • ${a.lotNumber}: ${a.changeQty > 0 ? "+" : ""}${a.changeQty.toFixed(1)} → ${a.newAvailable.toFixed(1)} ${unit}`,
        )
        .join("\n");
      alert(`${r.message}\n\n${detail}`);
      onSuccess();
    },
    onError: (e: { message: string }) => alert(`실패: ${e.message}`),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mutateInput || !qty || !reason) {
      alert(`${label}, 수량, 사유를 모두 입력해주세요.`);
      return;
    }
    if (changeAmt <= 0) {
      alert("수량은 0보다 커야 합니다.");
      return;
    }
    if (lots.length === 0) {
      alert("활성 LOT 이 없습니다. 생산 완료 또는 수동 입고로 먼저 LOT 을 생성해주세요.");
      return;
    }
    if (adjType === "decrease" && changeAmt > totalAvailable + 0.001) {
      alert(`재고 부족: 요청 ${changeAmt}, 가용 ${totalAvailable.toFixed(1)} ${unit}`);
      return;
    }
    const lotHint =
      adjType === "increase"
        ? `→ 최신 LOT 에 추가`
        : `→ 오래된 LOT 부터 차감 (FEFO)`;
    if (
      confirm(
        `[${adjType === "increase" ? "증가" : "감소"}] ${itemName}\n\n` +
          `현재 합계: ${totalAvailable.toFixed(1)} ${unit}\n` +
          `변경: ${adjType === "increase" ? "+" : "-"}${changeAmt.toFixed(1)} ${unit}\n` +
          `결과 합계: ${previewTotal.toFixed(1)} ${unit}\n` +
          `${lotHint}\n\n사유: ${reason}\n\n진행하시겠습니까?`,
      )
    ) {
      mut.mutate(mutateInput as any);
    }
  };

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle icon={Settings} title={`${label} 재고 조정`} desc={desc} />
      </CardHeader>
      <CardContent className="p-4">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                {label} 선택 <span className="text-red-500">*</span>
              </label>
              {picker}
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
          {canSubmit && (
            <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
              <div className="flex items-center gap-4 flex-wrap text-xs">
                <div>
                  <span className="text-muted-foreground">{label}:</span>{" "}
                  <span className="font-medium">{itemName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">활성 LOT:</span>{" "}
                  <span className="font-mono font-medium">{lots.length} 개</span>
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
              {lots.length === 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠ 활성 LOT 없음 — 생산 완료 또는 수동 입고로 먼저 LOT 을 생성해주세요.
                </div>
              )}
              {lots.length > 0 && (
                <details className="text-xs mt-1">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    활성 LOT 목록 ({lots.length})
                  </summary>
                  <ul className="mt-2 space-y-0.5 pl-4">
                    {lots.map((l) => (
                      <li key={l.id} className="font-mono text-[11px]">
                        {l.lotNumber} ·{" "}
                        {parseFloat(String(l.availableQuantity ?? "0")).toFixed(1)} {l.unit}
                        {l.expiryDate && (
                          <span className="text-muted-foreground"> · 소비기한 {String(l.expiryDate)}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={mut.isPending || !canSubmit || !qty || !reason || lots.length === 0}
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
