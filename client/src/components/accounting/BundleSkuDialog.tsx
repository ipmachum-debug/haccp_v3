/**
 * 묶음(번들) SKU 선택·생성 다이얼로그 — 매출 엑셀 업로드 "검증/매칭" 단계 (2026-10-14, CEO 요청)
 *
 * 생산은 단품(예: 마카다미아왕찹쌀떡 흰/쑥/복분자/단호박) 으로 하고 판매는 묶음(혼합) 으로 할 때,
 * 업로드 행의 품목을 묶음으로 지정한다. 매출 확정 시 묶음 구성대로 단품 재고가 차감된다.
 *  - 기존 묶음 선택: skuBundle.listBundleParents
 *  - 새 묶음 만들기: 대표 SKU + 단품 SKU·비율 → skuBundle.setBundleComposition (관리자)
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Layers, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export type BundleChoice = {
  parentSkuId: number;
  parentSkuName: string;
  itemMasterId: number;
  productId: number;
  childCount: number;
};

type BundleParent = {
  parentSkuId: number;
  parentSkuName: string;
  parentSkuCode: string | null;
  itemMasterId: number | null;
  itemName: string | null;
  productId: number | null;
  children: Array<{ childSkuId: number; childSkuName: string; ratio: number; pieces: number | null }>;
};

type SkuOption = {
  skuId: number;
  skuName: string;
  skuCode: string | null;
  itemMasterId: number;
  itemName: string;
  productId: number | null;
  hasProduct: boolean;
  isBundle: boolean;
};

type ChildDraft = { skuId: number | null; ratio: string; pieces: string };

export default function BundleSkuDialog({
  open,
  onOpenChange,
  rowItemName,
  sameNameCount,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 엑셀 원본 품목명 (안내용) */
  rowItemName: string;
  /** 같은 품목명 행 수 — 2 이상이면 "모두 적용" 선택지 노출 */
  sameNameCount: number;
  onSelect: (choice: BundleChoice, applyToSameName: boolean) => void;
}) {
  const [tab, setTab] = useState<"pick" | "create">("pick");
  const [applyAll, setApplyAll] = useState(true);
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();
  const parentsQuery = trpc.skuBundle.listBundleParents.useQuery(undefined, { enabled: open });
  const skuQuery = trpc.skuBundle.listSkuOptions.useQuery(undefined, { enabled: open && tab === "create" });
  const saveMutation = trpc.skuBundle.setBundleComposition.useMutation();

  const parents = (parentsQuery.data ?? []) as BundleParent[];
  const skus = (skuQuery.data ?? []) as SkuOption[];

  const filteredParents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return parents;
    return parents.filter((p) =>
      [p.parentSkuName, p.itemName ?? "", ...p.children.map((c) => c.childSkuName)].some((s) => s.toLowerCase().includes(q)),
    );
  }, [parents, search]);

  const choose = (p: BundleParent) => {
    if (!p.itemMasterId || !p.productId) {
      toast.error("이 묶음의 대표 품목이 생산 제품과 연결돼 있지 않아 재고 차감이 안 됩니다. 품목 마스터에서 연결 후 사용하세요.");
      return;
    }
    onSelect(
      { parentSkuId: p.parentSkuId, parentSkuName: p.parentSkuName, itemMasterId: p.itemMasterId, productId: p.productId, childCount: p.children.length },
      applyAll && sameNameCount > 1,
    );
  };

  // ── 새 묶음 만들기 ──
  const [parentSkuId, setParentSkuId] = useState<number | null>(null);
  const [children, setChildren] = useState<ChildDraft[]>([
    { skuId: null, ratio: "", pieces: "" },
    { skuId: null, ratio: "", pieces: "" },
  ]);
  const parentCandidates = skus.filter((s) => s.hasProduct);
  const totalRatio = children.reduce((s, c) => s + (parseFloat(c.ratio) || 0), 0);

  const splitEvenly = () => {
    const n = children.length;
    if (n === 0) return;
    const base = Math.floor((100 / n) * 100) / 100;
    setChildren(children.map((c, i) => ({ ...c, ratio: String(i === n - 1 ? Math.round((100 - base * (n - 1)) * 100) / 100 : base) })));
  };

  const saveNew = async () => {
    const parent = skus.find((s) => s.skuId === parentSkuId);
    if (!parent) { toast.error("묶음 대표 SKU 를 선택하세요."); return; }
    const valid = children.filter((c) => c.skuId);
    if (valid.length < 2) { toast.error("단품 SKU 를 2개 이상 선택하세요."); return; }
    if (Math.abs(totalRatio - 100) > 0.01) { toast.error(`비율 합계가 100% 여야 합니다 (현재 ${totalRatio.toFixed(2)}%).`); return; }
    try {
      await saveMutation.mutateAsync({
        parentSkuId: parent.skuId,
        children: valid.map((c, i) => ({
          childSkuId: c.skuId!,
          defaultRatio: parseFloat(c.ratio),
          childPieces: c.pieces ? parseInt(c.pieces, 10) : null,
          sortOrder: i,
        })),
      });
      toast.success(`묶음 "${parent.skuName}" 저장`);
      await utils.skuBundle.listBundleParents.invalidate();
      onSelect(
        { parentSkuId: parent.skuId, parentSkuName: parent.skuName, itemMasterId: parent.itemMasterId, productId: parent.productId!, childCount: valid.length },
        applyAll && sameNameCount > 1,
      );
    } catch (e) {
      toast.error(`묶음 저장 실패: ${(e as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Layers className="h-4 w-4 text-violet-600" /> 묶음(혼합) 상품으로 지정</DialogTitle>
          <DialogDescription>
            엑셀 품목 <strong>"{rowItemName}"</strong> 을 묶음 상품으로 지정합니다. 매출 확정 시 묶음 구성대로 단품 재고가 차감됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 border-b pb-2">
          <Button size="sm" variant={tab === "pick" ? "default" : "outline"} onClick={() => setTab("pick")}>기존 묶음 선택</Button>
          <Button size="sm" variant={tab === "create" ? "default" : "outline"} onClick={() => setTab("create")}><Plus className="h-3.5 w-3.5 mr-1" />새 묶음 만들기</Button>
          {sameNameCount > 1 && (
            <label className="ml-auto flex items-center gap-1.5 text-xs cursor-pointer select-none">
              <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} />
              같은 품목명 {sameNameCount}행 모두 적용
            </label>
          )}
        </div>

        {tab === "pick" && (
          <div className="space-y-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input className="pl-8 h-9" placeholder="묶음 이름·단품 이름 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {parentsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">불러오는 중...</p>
            ) : filteredParents.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">등록된 묶음이 없습니다. "새 묶음 만들기" 로 등록하세요.</p>
            ) : (
              filteredParents.map((p) => (
                <button
                  key={p.parentSkuId}
                  onClick={() => choose(p)}
                  className="w-full text-left rounded-lg border p-3 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{p.parentSkuName}</span>
                    <Badge variant="outline" className="text-[10px]">{p.children.length}종</Badge>
                    {!p.productId && <Badge variant="destructive" className="text-[10px]">제품 미연결</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {p.children.map((c) => `${c.childSkuName} ${c.ratio}%${c.pieces ? `·${c.pieces}개` : ""}`).join(" / ")}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {tab === "create" && (
          <div className="space-y-3 text-sm">
            <div>
              <div className="text-xs font-medium mb-1">묶음 대표 SKU (판매 단위)</div>
              <select
                className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                value={parentSkuId ?? ""}
                onChange={(e) => setParentSkuId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">선택하세요</option>
                {parentCandidates.map((s) => (
                  <option key={s.skuId} value={s.skuId}>
                    {s.itemName} — {s.skuName}{s.isBundle ? " (기존 묶음 덮어쓰기)" : ""}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                대표 SKU 는 품목 마스터에 먼저 등록돼 있어야 합니다 (예: "마카다미아왕찹쌀떡(혼합) 80g*20ea").
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">단품 구성</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={splitEvenly}>균등 배분</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setChildren([...children, { skuId: null, ratio: "", pieces: "" }])}>
                    <Plus className="h-3 w-3 mr-1" />단품 추가
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                {children.map((c, i) => (
                  <div key={i} className="flex gap-1.5 items-center">
                    <select
                      className="flex-1 h-8 rounded-md border bg-background px-2 text-xs"
                      value={c.skuId ?? ""}
                      onChange={(e) => setChildren(children.map((x, j) => (j === i ? { ...x, skuId: e.target.value ? Number(e.target.value) : null } : x)))}
                    >
                      <option value="">단품 SKU 선택</option>
                      {skus.filter((s) => s.skuId !== parentSkuId && !s.isBundle).map((s) => (
                        <option key={s.skuId} value={s.skuId}>{s.itemName} — {s.skuName}</option>
                      ))}
                    </select>
                    <Input className="w-20 h-8 text-xs" placeholder="비율 %" value={c.ratio}
                      onChange={(e) => setChildren(children.map((x, j) => (j === i ? { ...x, ratio: e.target.value } : x)))} />
                    <Input className="w-20 h-8 text-xs" placeholder="개수(선택)" value={c.pieces}
                      onChange={(e) => setChildren(children.map((x, j) => (j === i ? { ...x, pieces: e.target.value } : x)))} />
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={children.length <= 2}
                      onClick={() => setChildren(children.filter((_, j) => j !== i))}>
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className={`text-xs mt-1 ${Math.abs(totalRatio - 100) < 0.01 ? "text-emerald-600" : "text-amber-600"}`}>
                비율 합계 {totalRatio.toFixed(2)}% {Math.abs(totalRatio - 100) < 0.01 ? "✓" : "(100% 여야 저장 가능)"}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>취소</Button>
              <Button size="sm" onClick={saveNew} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "저장 중..." : "묶음 저장 후 지정"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
