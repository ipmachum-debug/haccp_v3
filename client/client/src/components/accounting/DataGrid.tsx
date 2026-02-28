import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataGridColumn {
  key: string;
  header: string;
  width?: string; // 예: "150px", "20%"
  align?: "left" | "center" | "right";
  fixed?: boolean; // 고정 컬럼 여부
  render?: (value: any, row: any, index: number) => React.ReactNode;
}

interface DataGridProps {
  columns: DataGridColumn[];
  data: any[];
  onRowClick?: (row: any, index: number) => void;
  selectedRowIndex?: number;
  className?: string;
  stickyHeader?: boolean; // 헤더 고정 여부
  maxHeight?: string; // 최대 높이 (스크롤)
  emptyMessage?: string;
}

/**
 * 엑셀/이카운트 스타일 데이터 그리드
 * - 고정 헤더 (스크롤 시에도 헤더 유지)
 * - 고정 컬럼 지원
 * - 행 선택 표시
 * - 흔들림 없는 안정적인 레이아웃
 */
export function DataGrid({
  columns,
  data,
  onRowClick,
  selectedRowIndex,
  className,
  stickyHeader = true,
  maxHeight = "500px",
  emptyMessage = "데이터가 없습니다",
}: DataGridProps) {
  const tableContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={tableContainerRef}
      className={cn(
        "relative border rounded-md overflow-auto",
        className
      )}
      style={{ maxHeight }}
    >
      <Table className="relative">
        <TableHeader
          className={cn(
            stickyHeader && "sticky top-0 z-10 bg-background shadow-sm"
          )}
        >
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  "font-bold text-foreground border-r last:border-r-0",
                  column.align === "center" && "text-center",
                  column.align === "right" && "text-right",
                  column.fixed && "sticky left-0 bg-background z-20"
                )}
                style={{ width: column.width }}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center text-muted-foreground h-32"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, rowIndex) => (
              <TableRow
                key={rowIndex}
                onClick={() => onRowClick?.(row, rowIndex)}
                className={cn(
                  "cursor-pointer transition-colors",
                  selectedRowIndex === rowIndex && "bg-muted",
                  onRowClick && "hover:bg-muted/50"
                )}
              >
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn(
                      "border-r last:border-r-0",
                      column.align === "center" && "text-center",
                      column.align === "right" && "text-right",
                      column.fixed && "sticky left-0 bg-background"
                    )}
                    style={{ width: column.width }}
                  >
                    {column.render
                      ? column.render(row[column.key], row, rowIndex)
                      : row[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
