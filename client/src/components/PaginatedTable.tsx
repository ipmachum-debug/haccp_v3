/**
 * PaginatedTable.tsx - 공통 페이지네이션 + 정렬 컴포넌트
 * 
 * usePaginatedSort - 정렬 + 페이지네이션 상태 관리 훅
 * SortableHeader - 클릭 가능한 정렬 헤더 (▲▼ 아이콘)
 * PaginationBar - 30/50/100건 선택 + 페이지 번호 네비게이션
 */
import React, { useState, useMemo, useCallback } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/* ─── Types ─── */
export type SortDirection = "asc" | "desc" | null;

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface PaginationState {
  page: number;
  pageSize: number;
}

/* ─── usePaginatedSort Hook ─── */
export function usePaginatedSort<T>(
  data: T[],
  options?: {
    defaultSort?: { key: string; direction: SortDirection };
    defaultPageSize?: number;
    sortFn?: (a: T, b: T, key: string, dir: SortDirection) => number;
  }
) {
  const [sort, setSort] = useState<SortState>(
    options?.defaultSort ?? { key: "", direction: null }
  );
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    pageSize: options?.defaultPageSize ?? 30,
  });

  const handleSort = useCallback((key: string) => {
    setSort(prev => {
      if (prev.key === key) {
        if (prev.direction === "asc") return { key, direction: "desc" as SortDirection };
        if (prev.direction === "desc") return { key: "", direction: null };
        return { key, direction: "asc" as SortDirection };
      }
      return { key, direction: "asc" as SortDirection };
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  }, []);

  const setPage = useCallback((page: number) => {
    setPagination(prev => ({ ...prev, page }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination({ page: 1, pageSize });
  }, []);

  const sortedData = useMemo(() => {
    if (!sort.key || !sort.direction) return data;
    
    const sorted = [...data].sort((a, b) => {
      if (options?.sortFn) return options.sortFn(a, b, sort.key, sort.direction);
      
      const aVal = (a as any)[sort.key];
      const bVal = (b as any)[sort.key];
      
      // null/undefined handling
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sort.direction === "asc" ? 1 : -1;
      if (bVal == null) return sort.direction === "asc" ? -1 : 1;
      
      // Date comparison (Drizzle timestamp columns arrive as Date objects via superjson)
      const isDateLike = (v: any): boolean => v instanceof Date || (typeof v === 'object' && v !== null && typeof v.getTime === 'function');
      if (isDateLike(aVal) || isDateLike(bVal)) {
        const aTime = isDateLike(aVal) ? aVal.getTime() : (typeof aVal === 'string' ? new Date(aVal).getTime() || 0 : 0);
        const bTime = isDateLike(bVal) ? bVal.getTime() : (typeof bVal === 'string' ? new Date(bVal).getTime() || 0 : 0);
        return sort.direction === "asc" ? aTime - bTime : bTime - aTime;
      }
      
      // Number comparison
      const aNum = typeof aVal === "string" ? parseFloat(aVal) : aVal;
      const bNum = typeof bVal === "string" ? parseFloat(bVal) : bVal;
      if (typeof aNum === "number" && typeof bNum === "number" && !isNaN(aNum) && !isNaN(bNum)) {
        return sort.direction === "asc" ? aNum - bNum : bNum - aNum;
      }
      
      // String comparison (ensure values are strings)
      const aStr = typeof aVal === 'string' ? aVal : String(aVal ?? "");
      const bStr = typeof bVal === 'string' ? bVal : String(bVal ?? "");
      if (typeof aStr.localeCompare !== 'function' || typeof bStr.localeCompare !== 'function') return 0;
      const cmp = aStr.localeCompare(bStr, "ko");
      return sort.direction === "asc" ? cmp : -cmp;
    });
    
    return sorted;
  }, [data, sort, options?.sortFn]);

  const totalItems = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pagination.pageSize));
  const safePage = Math.min(pagination.page, totalPages);
  const startIdx = (safePage - 1) * pagination.pageSize;
  const endIdx = Math.min(startIdx + pagination.pageSize, totalItems);
  const pageData = sortedData.slice(startIdx, endIdx);

  return {
    sort,
    handleSort,
    pagination: { ...pagination, page: safePage },
    setPage,
    setPageSize,
    pageData,
    totalItems,
    totalPages,
    startIdx: startIdx + 1,
    endIdx,
  };
}

/* ─── SortableHeader ─── */
export function SortableHeader({
  label,
  sortKey,
  currentSort,
  onSort,
  className = "",
  align,
}: {
  label: string;
  sortKey: string;
  currentSort: SortState;
  onSort: (key: string) => void;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const isActive = currentSort.key === sortKey;
  const dir = isActive ? currentSort.direction : null;
  const alignCls = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  
  return (
    <TableHead
      className={`cursor-pointer select-none hover:bg-muted/50 transition-colors text-xs font-semibold ${className}`}
      onClick={() => onSort(sortKey)}
    >
      <div className={`flex items-center gap-1 ${alignCls}`}>
        <span>{label}</span>
        <span className="inline-flex flex-col -space-y-1">
          {dir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5 text-primary" />
          ) : dir === "desc" ? (
            <ChevronDown className="h-3.5 w-3.5 text-primary" />
          ) : (
            <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />
          )}
        </span>
      </div>
    </TableHead>
  );
}

/* ─── PaginationBar ─── */
export function PaginationBar({
  totalItems,
  totalPages,
  currentPage,
  pageSize,
  startIdx,
  endIdx,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [30, 50, 100],
}: {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  startIdx: number;
  endIdx: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
}) {
  // Generate visible page numbers
  const getVisiblePages = () => {
    const pages: (number | "...")[] = [];
    const maxVisible = 7;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  if (totalItems === 0) return null;

  return (
    <div className="flex items-center justify-between flex-wrap gap-3 py-3 px-1">
      {/* Left: info */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          총 <strong className="text-foreground">{totalItems.toLocaleString()}</strong>건 중{" "}
          <strong className="text-foreground">{startIdx}-{endIdx}</strong>
        </span>
        <div className="flex items-center gap-1.5">
          <Select value={pageSize.toString()} onValueChange={v => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-7 w-[72px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map(s => (
                <SelectItem key={s} value={s.toString()}>{s}건</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Right: page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">이전</span>
          </Button>
          
          {getVisiblePages().map((p, i) =>
            p === "..." ? (
              <span key={`dots-${i}`} className="px-1 text-xs text-muted-foreground">...</span>
            ) : (
              <Button
                key={p}
                variant={currentPage === p ? "default" : "outline"}
                size="sm"
                className={`h-7 min-w-[28px] px-2 text-xs ${currentPage === p ? "font-bold text-white" : "text-foreground"}`}
                onClick={() => onPageChange(p as number)}
              >
                {p}
              </Button>
            )
          )}
          
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
          >
            <span className="hidden sm:inline">다음</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
