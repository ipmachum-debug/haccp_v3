import { Layers, ShieldCheck, BarChart3, Clock, AlertCircle, Package } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableHeader, TableRow, TableBody } from "@/components/ui/table";
import { StatCard, StyledTable, TH, TD, SectionTitle, Loading, Empty, fmt, won } from "./InventoryHelpers";
import { usePaginatedSort, SortableHeader, PaginationBar } from "@/components/PaginatedTable";

export function MaterialStockView({ dashboard, isLoading }: { dashboard: any; isLoading: boolean }) {
  const stocks = dashboard?.materialStocks || [];
  const {
    sort, handleSort, pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(stocks, {
    defaultSort: { key: "materialName", direction: "asc" },
    defaultPageSize: 30,
    sortFn: (a: any, b: any, key: string, dir) => {
      if (["totalQuantity", "lotCount", "unitPrice", "totalValue"].includes(key)) {
        const aVal = parseFloat(a[key] || "0");
        const bVal = parseFloat(b[key] || "0");
        return dir === "asc" ? aVal - bVal : bVal - aVal;
      }
      const aVal = String(a[key] || "");
      const bVal = String(b[key] || "");
      return dir === "asc" ? aVal.localeCompare(bVal, "ko") : bVal.localeCompare(aVal, "ko");
    },
  });

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
          <SectionTitle icon={Package} title="원재료별 재고 현황" desc={stocks.length > 0 ? `총 ${stocks.length}종` : undefined} />
        </CardHeader>
        <CardContent className="p-3">
          {isLoading ? <Loading /> : !stocks.length ? <Empty /> : (
            <>
              {/* 데스크톱: 테이블 뷰 */}
              <div className="hidden sm:block">
                <StyledTable>
                  <TableHeader><TableRow>
                    <SortableHeader label="원재료" sortKey="materialName" currentSort={sort} onSort={handleSort} />
                    <SortableHeader label="총 수량" sortKey="totalQuantity" currentSort={sort} onSort={handleSort} />
                    <SortableHeader label="LOT" sortKey="lotCount" currentSort={sort} onSort={handleSort} align="center" />
                    <SortableHeader label="단가" sortKey="unitPrice" currentSort={sort} onSort={handleSort} align="right" />
                    <SortableHeader label="총 가치" sortKey="totalValue" currentSort={sort} onSort={handleSort} align="right" />
                    <TH className="text-center">상태</TH>
                  </TableRow></TableHeader>
                  <TableBody>
                    {pageData.map((m: any) => (
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
              </div>

              {/* 모바일: 카드 리스트 뷰 */}
              <div className="sm:hidden space-y-2">
                {pageData.map((m: any) => (
                  <div key={m.materialId} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{m.materialName}</p>
                        <p className="text-xs text-muted-foreground">{m.materialCode}</p>
                      </div>
                      <Badge variant={m.isLowStock ? "destructive" : "secondary"} className="text-xs px-2 py-0.5 shrink-0">
                        {m.isLowStock ? "부족" : "정상"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 border-t">
                      <div>
                        <p className="text-[10px] text-muted-foreground">수량</p>
                        <p className="text-sm font-mono font-semibold">{fmt(m.totalQuantity)} <span className="text-xs font-normal">{m.unit}</span></p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">LOT</p>
                        <p className="text-sm font-mono">{m.lotCount}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">총 가치</p>
                        <p className="text-sm font-semibold">{won(m.totalValue)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <PaginationBar
                totalItems={totalItems} totalPages={totalPages}
                currentPage={pagination.page} pageSize={pagination.pageSize}
                startIdx={startIdx} endIdx={endIdx}
                onPageChange={setPage} onPageSizeChange={setPageSize}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
