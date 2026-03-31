import { TrendingUp, RotateCw } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TableHeader, TableRow, TableBody } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useMemo } from "react";
import { StyledTable, TH, TD, SectionTitle, Loading, Empty, fmt, won } from "./InventoryHelpers";
import { usePaginatedSort, PaginationBar } from "@/components/PaginatedTable";

/* ═══════════════════════════════════════════════════
   제품 출고 추이 (일별 판매/납품/샘플)
   ═══════════════════════════════════════════════════ */
export function ProductTrendCard({ trendDates, trendPeriod, setTrendPeriod }: { trendDates: { startDate: string; endDate: string }; trendPeriod: string; setTrendPeriod: (v: any) => void }) {
  const { data: productTrend, isLoading } = trpc.inventory.getProductOutboundTrend.useQuery(trendDates);

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <div className="flex items-center justify-between">
          <SectionTitle icon={TrendingUp} title="제품 출고 추이" desc="일별 판매/납품/반품" />
          <Select value={trendPeriod} onValueChange={setTrendPeriod}>
            <SelectTrigger className="w-32 h-10 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="week">최근 7일</SelectItem>
              <SelectItem value="month">최근 30일</SelectItem>
              <SelectItem value="quarter">최근 90일</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? <Loading /> : !productTrend?.length ? <Empty text="선택 기간에 출고 데이터 없음" /> : (
          <ProductTrendTable data={productTrend as any[]} />
        )}
      </CardContent>
    </Card>
  );
}

/* ─── 제품 출고 추이 테이블 (페이지네이션 + 최신순) ─── */
function ProductTrendTable({ data }: { data: any[] }) {
  // 최신일순 정렬
  const sorted = useMemo(() => [...data].sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), [data]);
  const {
    pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(sorted, {
    defaultSort: { key: "date", direction: "desc" },
    defaultPageSize: 30,
  });

  return (
    <>
      <StyledTable>
        <TableHeader>
          <TableRow>
            <TH>일자</TH>
            <TH>판매출고(kg)</TH>
            <TH>샘플출고(kg)</TH>
            <TH>반품(kg)</TH>
            <TH className="text-right">출고액</TH>
            <TH className="text-center">건수</TH>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageData.map((r: any) => (
            <TableRow key={r.date} className="hover:bg-muted/30">
              <TD className="font-mono">{r.date}</TD>
              <TD className="text-blue-600 dark:text-blue-400 font-medium">{fmt(r.saleQuantity)}</TD>
              <TD className="text-amber-600 dark:text-amber-400">{fmt(r.sampleQuantity)}</TD>
              <TD className="text-red-500 dark:text-red-400">{fmt(r.returnQuantity)}</TD>
              <TD className="text-right font-medium">{won(r.totalAmount)}</TD>
              <TD className="text-center">{r.transactionCount}</TD>
            </TableRow>
          ))}
        </TableBody>
      </StyledTable>
      <PaginationBar
        totalItems={totalItems} totalPages={totalPages}
        currentPage={pagination.page} pageSize={pagination.pageSize}
        startIdx={startIdx} endIdx={endIdx}
        onPageChange={setPage} onPageSizeChange={setPageSize}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════
   제품 재고 회전율 (생산 vs 출고)
   ═══════════════════════════════════════════════════ */
export function ProductTurnoverCard({ trendDates, trendPeriod }: { trendDates: { startDate: string; endDate: string }; trendPeriod: string }) {
  const { data: turnover, isLoading } = trpc.inventory.getProductTurnoverAnalysis.useQuery(trendDates);

  return (
    <Card>
      <CardHeader className="py-2.5 px-4 border-b bg-muted/20">
        <SectionTitle icon={RotateCw} title="제품별 회전율" desc={`${trendPeriod === "week" ? "최근 7일" : trendPeriod === "quarter" ? "최근 90일" : "최근 30일"} · 생산 vs 출고`} />
      </CardHeader>
      <CardContent className="p-3">
        {isLoading ? <Loading /> : !turnover?.length ? <Empty text="데이터 없음" /> : (
          <ProductTurnoverTable data={turnover as any[]} />
        )}
      </CardContent>
    </Card>
  );
}

/* ─── 제품 회전율 테이블 (페이지네이션) ─── */
function ProductTurnoverTable({ data }: { data: any[] }) {
  const {
    pagination, setPage, setPageSize,
    pageData, totalItems, totalPages, startIdx, endIdx
  } = usePaginatedSort(data, {
    defaultSort: { key: "turnoverRate", direction: "desc" },
    defaultPageSize: 30,
  });

  return (
    <>
      <StyledTable>
        <TableHeader>
          <TableRow>
            <TH>제품</TH>
            <TH>생산량(kg)</TH>
            <TH>출고량(kg)</TH>
            <TH>재고(kg)</TH>
            <TH>회전율</TH>
            <TH>재고일수</TH>
            <TH>효율</TH>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageData.map((p: any) => (
            <TableRow key={p.productId} className="hover:bg-muted/30">
              <TD>
                <span className="font-medium">{p.productName}</span>
                {p.productCode && <span className="text-muted-foreground ml-2 text-xs">{p.productCode}</span>}
              </TD>
              <TD className="text-emerald-600">{fmt(p.productionQuantity)}</TD>
              <TD className="text-blue-600">{fmt(p.outboundQuantity)}</TD>
              <TD>{fmt(p.currentStock)}</TD>
              <TD>
                <Badge variant={p.turnoverRate >= 1 ? "default" : "secondary"} className="text-xs px-2.5 py-1">
                  {p.turnoverRate.toFixed(2)}
                </Badge>
              </TD>
              <TD>{p.averageHoldingPeriod >= 999 ? "-" : `${p.averageHoldingPeriod.toFixed(0)}일`}</TD>
              <TD>
                <span className={`font-semibold ${p.efficiency === "양호" ? "text-emerald-600" : p.efficiency === "적정" ? "text-blue-600" : "text-amber-600"}`}>
                  {p.efficiency}
                </span>
              </TD>
            </TableRow>
          ))}
        </TableBody>
      </StyledTable>
      <PaginationBar
        totalItems={totalItems} totalPages={totalPages}
        currentPage={pagination.page} pageSize={pagination.pageSize}
        startIdx={startIdx} endIdx={endIdx}
        onPageChange={setPage} onPageSizeChange={setPageSize}
      />
    </>
  );
}
