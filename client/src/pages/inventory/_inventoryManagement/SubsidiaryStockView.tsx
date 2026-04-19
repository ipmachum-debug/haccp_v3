/**
 * 부자재 · 외주제품 재고 현황 (간소화 LOT 뷰) — InventoryManagementIntegrated.tsx 에서 분리 (2026-04-19)
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { TableBody, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, won, Empty, Loading, StyledTable, TH, TD, SectionTitle } from "@/components/inventory/InventoryHelpers";
import type { SubsidiaryLot } from "./types";

export function SubsidiaryStockView({ filterType }: { filterType: "subsidiary" | "external_product" }) {
  const { data: allLots, isLoading } = trpc.inventory.listLots.useQuery();
  const label = filterType === "subsidiary" ? "부자재" : "외주제품";

  const subsidiaryLots = useMemo(() => {
    if (!allLots) return [];
    return (allLots as SubsidiaryLot[]).filter((lot) => lot.itemType === filterType);
  }, [allLots, filterType]);

  const activeLots = subsidiaryLots.filter((l) => l.status === "available");
  const totalValue = activeLots.reduce((sum, l) => {
    return sum + (parseFloat(String(l.availableQuantity ?? "0")) * parseFloat(String(l.unitPrice ?? "0")));
  }, 0);

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">로딩 중...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">전체 LOT</p>
          <p className="text-2xl font-bold text-teal-700">{subsidiaryLots.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">가용 LOT</p>
          <p className="text-2xl font-bold text-emerald-600">{activeLots.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground">총 재고가치</p>
          <p className="text-2xl font-bold text-blue-700">₩{totalValue.toLocaleString()}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="h-4 w-4" /> {label} 재고 현황 · {subsidiaryLots.length}건
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {subsidiaryLots.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>{label} 재고가 없습니다</p>
              <p className="text-xs mt-1">발주서 입고 확정 시 자동으로 재고가 생성됩니다</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/30">
                  <th className="text-left p-3 font-medium text-xs">LOT</th>
                  <th className="text-left p-3 font-medium text-xs">품목</th>
                  <th className="text-left p-3 font-medium text-xs">유형</th>
                  <th className="text-right p-3 font-medium text-xs">수량</th>
                  <th className="text-right p-3 font-medium text-xs">가용</th>
                  <th className="text-right p-3 font-medium text-xs">단가</th>
                  <th className="text-left p-3 font-medium text-xs">입고일</th>
                  <th className="text-center p-3 font-medium text-xs">상태</th>
                </tr></thead>
                <tbody>
                  {subsidiaryLots.map((lot) => (
                    <tr key={lot.id} className="border-b hover:bg-accent/50">
                      <td className="p-3 font-mono text-xs">{lot.lotNumber}</td>
                      <td className="p-3">
                        <div className="font-medium text-xs">{lot.materialName}</div>
                        <div className="text-[10px] text-muted-foreground">{lot.materialCode}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          filterType === "subsidiary" ? "bg-amber-100 text-amber-700" : "bg-purple-100 text-purple-700"
                        }`}>
                          {label}
                        </span>
                      </td>
                      <td className="p-3 text-right text-xs">{lot.quantity} {lot.unit}</td>
                      <td className="p-3 text-right text-xs font-bold">{lot.availableQuantity} {lot.unit}</td>
                      <td className="p-3 text-right text-xs">₩{parseFloat(lot.unitPrice || "0").toLocaleString()}</td>
                      <td className="p-3 text-xs">{lot.receiptDate ? new Date(lot.receiptDate).toLocaleDateString("ko-KR") : "-"}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          lot.status === "available" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          {lot.status === "available" ? "사용가능" : lot.status === "disposed" ? "폐기" : lot.status}
                        </span>
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
  );
}
