import { Layers, ShieldCheck, BarChart3, Clock, AlertCircle, Package } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableHeader, TableRow, TableBody } from "@/components/ui/table";
import { StatCard, StyledTable, TH, TD, SectionTitle, Loading, Empty, fmt, won } from "./InventoryHelpers";

export function MaterialStockView({ dashboard, isLoading }: { dashboard: any; isLoading: boolean }) {
  return (
    <div className="space-y-4">
      {/* 스탯 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={Layers} label="전체 LOT" value={isLoading ? "-" : dashboard?.stats.totalLots?.toLocaleString() || "0"} color="blue" />
        <StatCard icon={ShieldCheck} label="가용 LOT" value={isLoading ? "-" : dashboard?.stats.availableLots?.toLocaleString() || "0"} color="emerald" />
        <StatCard icon={BarChart3} label="총 재고가치" value={isLoading ? "-" : won(dashboard?.stats.totalValue)} color="slate" />
        <StatCard icon={Clock} label="유통기한 임박" value={isLoading ? "-" : dashboard?.stats.expiringSoonLots?.toLocaleString() || "0"} color="red" sub="7일 이내" />
        <StatCard icon={AlertCircle} label="재고 부족" value={isLoading ? "-" : dashboard?.stats.lowStockCount?.toLocaleString() || "0"} color="amber" sub="안전재고 미달" />
      </div>

      {/* 원재료별 전체 재고 */}
      <Card>
        <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
          <SectionTitle icon={Package} title="원재료별 재고 현황" />
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? <Loading /> : !dashboard?.materialStocks?.length ? <Empty /> : (
            <StyledTable>
              <TableHeader><TableRow>
                <TH>원재료</TH><TH>총 수량</TH><TH className="text-center">LOT</TH>
                <TH className="text-right">단가</TH><TH className="text-right">총 가치</TH><TH className="text-center">상태</TH>
              </TableRow></TableHeader>
              <TableBody>
                {dashboard.materialStocks.map((m: any) => (
                  <TableRow key={m.materialId} className="hover:bg-muted/30">
                    <TD>
                      <span className="font-medium">{m.materialName}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{m.materialCode}</span>
                    </TD>
                    <TD className="font-mono">{fmt(m.totalQuantity)} {m.unit}</TD>
                    <TD className="text-center">{m.lotCount}</TD>
                    <TD className="text-right text-muted-foreground">{won(m.unitPrice)}</TD>
                    <TD className="text-right font-medium">{won(m.totalValue)}</TD>
                    <TD className="text-center">
                      <Badge variant={m.isLowStock ? "destructive" : "secondary"} className="text-xs px-2.5 py-1">
                        {m.isLowStock ? "부족" : "정상"}
                      </Badge>
                    </TD>
                  </TableRow>
                ))}
              </TableBody>
            </StyledTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
