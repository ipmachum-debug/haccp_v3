/**
 * DataGrid — 데이터 표 표준 (3-a, 명세 §5)
 *   열 정렬 · 하단 페이지 이동 · 행 선택 체크박스 + 선택 시 상단 일괄 작업 바 · 빈 상태 문구 · 로딩 스켈레톤
 *   모바일: mobileCard 를 주면 md 미만에서 카드 목록으로 (명세: 표는 카드 목록으로)
 *
 *   <DataGrid
 *     rows={sales} rowKey={(r) => r.id} loading={q.isLoading} emptyText="조건에 맞는 매출이 없습니다."
 *     columns={[
 *       { key: "date", header: "일자", sortable: true },
 *       { key: "partner", header: "거래처", sortable: true },
 *       { key: "amount", header: "금액", align: "right", sortable: true, cell: (r) => r.amount.toLocaleString() },
 *       { key: "status", header: "상태", cell: (r) => <StatusBadge status={r.status} domain="sale" /> },
 *     ]}
 *     selectable bulkActions={(sel) => <Button size="sm" onClick={() => approve(sel)}>선택 {sel.length}건 확정</Button>}
 *     onRowClick={(r) => navigate(`/dashboard/accounting/sales/${r.id}`)}
 *     mobileCard={(r) => <SaleCard sale={r} />}
 *   />
 * 기존 components/accounting/DataGrid(회계 원장 전용)는 그대로 둔다.
 */
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DataGridColumn<T> = {
  key: string;
  header: string;
  cell?: (row: T) => ReactNode;
  /** 정렬 값 (없으면 row[key]) */
  sortValue?: (row: T) => string | number | null | undefined;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
};

export type SortState = { key: string; dir: "asc" | "desc" } | null;

/** 순수 정렬 — null 은 항상 뒤, 숫자는 숫자로, 문자는 한국어 순 */
export function sortRows<T>(rows: readonly T[], columns: readonly DataGridColumn<T>[], sort: SortState): T[] {
  if (!sort) return [...rows];
  const col = columns.find((c) => c.key === sort.key);
  if (!col) return [...rows];
  const val = (r: T) => (col.sortValue ? col.sortValue(r) : (r as any)[col.key]);
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    const xn = x == null || x === "", yn = y == null || y === "";
    if (xn || yn) return xn && yn ? 0 : xn ? 1 : -1;
    const nx = typeof x === "number" ? x : Number(x), ny = typeof y === "number" ? y : Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny) && String(x).trim() !== "" && String(y).trim() !== "") return (nx - ny) * dir;
    return String(x).localeCompare(String(y), "ko") * dir;
  });
}

export function paginate<T>(rows: readonly T[], page: number, pageSize: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return { items: rows.slice((p - 1) * pageSize, p * pageSize), page: p, pages };
}

export function nextSort(cur: SortState, key: string): SortState {
  if (!cur || cur.key !== key) return { key, dir: "asc" };
  if (cur.dir === "asc") return { key, dir: "desc" };
  return null;
}

export function DataGrid<T>({
  rows, columns, rowKey, loading, emptyText = "데이터가 없습니다.", pageSize = 50,
  selectable, bulkActions, onRowClick, mobileCard, initialSort = null, className,
}: {
  rows: readonly T[];
  columns: readonly DataGridColumn<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyText?: string;
  pageSize?: number;
  selectable?: boolean;
  bulkActions?: (selected: T[]) => ReactNode;
  onRowClick?: (row: T) => void;
  mobileCard?: (row: T) => ReactNode;
  initialSort?: SortState;
  className?: string;
}) {
  const [sort, setSort] = useState<SortState>(initialSort);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());

  const sorted = useMemo(() => sortRows(rows, columns, sort), [rows, columns, sort]);
  const { items, page: cur, pages } = paginate(sorted, page, pageSize);
  const selectedRows = useMemo(() => rows.filter((r) => selected.has(rowKey(r))), [rows, selected, rowKey]);
  const allOnPage = items.length > 0 && items.every((r) => selected.has(rowKey(r)));

  const toggle = (k: string | number) => setSelected((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const togglePage = () => setSelected((s) => {
    const n = new Set(s);
    if (allOnPage) items.forEach((r) => n.delete(rowKey(r))); else items.forEach((r) => n.add(rowKey(r)));
    return n;
  });
  const alignClass = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "");

  if (loading) {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }
  if (rows.length === 0) {
    return <div className={cn("rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground", className)}>{emptyText}</div>;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {selectable && selectedRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2" data-testid="datagrid-bulkbar">
          <span className="text-sm font-medium">{selectedRows.length}건 선택</span>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            {bulkActions?.(selectedRows)}
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>선택 해제</Button>
          </div>
        </div>
      )}

      {mobileCard && (
        <div className="md:hidden space-y-2">
          {items.map((r) => (
            <div key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("rounded-xl border bg-card p-3", onRowClick && "cursor-pointer active:bg-accent")}>
              {mobileCard(r)}
            </div>
          ))}
        </div>
      )}

      <div className={cn("overflow-x-auto rounded-xl border", mobileCard && "hidden md:block")}>
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10"><Checkbox checked={allOnPage} onCheckedChange={togglePage} aria-label="이 페이지 전체 선택" /></TableHead>
              )}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                const Icon = !active ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
                return (
                  <TableHead key={c.key} className={cn(alignClass(c.align), c.className)} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sortable ? (
                      <button type="button" onClick={() => setSort((s) => nextSort(s, c.key))} className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}>
                        {c.header}<Icon className={cn("h-3 w-3", !active && "opacity-40")} />
                      </button>
                    ) : c.header}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((r) => {
              const k = rowKey(r);
              return (
                <TableRow key={k} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn(onRowClick && "cursor-pointer", selected.has(k) && "bg-primary/5")}>
                  {selectable && (
                    <TableCell onClick={(e) => e.stopPropagation()}><Checkbox checked={selected.has(k)} onCheckedChange={() => toggle(k)} aria-label="행 선택" /></TableCell>
                  )}
                  {columns.map((c) => (
                    <TableCell key={c.key} className={cn(alignClass(c.align), c.className)}>{c.cell ? c.cell(r) : String((r as any)[c.key] ?? "")}</TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{rows.length.toLocaleString()}건 중 {((cur - 1) * pageSize + 1).toLocaleString()}–{Math.min(cur * pageSize, rows.length).toLocaleString()}</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setPage(cur - 1)} disabled={cur <= 1} aria-label="이전 페이지"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="px-2 tabular-nums">{cur} / {pages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(cur + 1)} disabled={cur >= pages} aria-label="다음 페이지"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
