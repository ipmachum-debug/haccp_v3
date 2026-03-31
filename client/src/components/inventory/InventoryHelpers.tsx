import React from "react";
import { Table, TableCell, TableHead } from "@/components/ui/table";

/* ───────────────────── helpers ───────────────────── */
export const fmt = (v: any, d = 1) => Math.max(Number(v || 0), 0).toFixed(d);
export const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString("ko-KR") : "-";
export const won = (v: any) => `₩${Number(v || 0).toLocaleString()}`;
export const Empty = ({ text = "데이터가 없습니다." }: { text?: string }) => (
  <div className="text-center py-12 text-muted-foreground text-base">{text}</div>
);
export const Loading = () => <div className="text-center py-12 text-muted-foreground text-base animate-pulse">로딩 중...</div>;

/* ─────────── 통계 카드 ─────────── */
export function StatCard({ icon: Icon, label, value, sub, color = "blue" }: {
  icon: any; label: string; value: string | number; sub?: string;
  color?: "blue" | "emerald" | "amber" | "red" | "purple" | "slate";
}) {
  const colors: Record<string, string> = {
    blue: "from-blue-500/10 to-blue-600/5 border-blue-200 dark:border-blue-800 dark:from-blue-500/20 dark:to-blue-600/10",
    emerald: "from-emerald-500/10 to-emerald-600/5 border-emerald-200 dark:border-emerald-800 dark:from-emerald-500/20",
    amber: "from-amber-500/10 to-amber-600/5 border-amber-200 dark:border-amber-800 dark:from-amber-500/20",
    red: "from-red-500/10 to-red-600/5 border-red-200 dark:border-red-800 dark:from-red-500/20",
    purple: "from-purple-500/10 to-purple-600/5 border-purple-200 dark:border-purple-800 dark:from-purple-500/20",
    slate: "from-slate-500/10 to-slate-600/5 border-slate-200 dark:border-slate-800 dark:from-slate-500/20",
  };
  const iconColors: Record<string, string> = {
    blue: "text-blue-600 dark:text-blue-400", emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400", red: "text-red-600 dark:text-red-400",
    purple: "text-purple-600 dark:text-purple-400", slate: "text-slate-600 dark:text-slate-400",
  };
  const iconBg: Record<string, string> = {
    blue: "bg-blue-100 dark:bg-blue-900/40", emerald: "bg-emerald-100 dark:bg-emerald-900/40",
    amber: "bg-amber-100 dark:bg-amber-900/40", red: "bg-red-100 dark:bg-red-900/40",
    purple: "bg-purple-100 dark:bg-purple-900/40", slate: "bg-slate-100 dark:bg-slate-900/40",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-lg p-3 flex items-center gap-3`}>
      <div className={`p-2 rounded-lg ${iconBg[color]} shrink-0`}>
        <Icon className={`h-5 w-5 ${iconColors[color]}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground leading-none truncate">{label}</p>
        <p className="text-lg font-bold leading-tight mt-1 truncate">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

/* ─────────── 테이블 래퍼 (모바일 수평 스와이프 지원) ─────────── */
export const StyledTable = ({ children }: { children: React.ReactNode }) => (
  <div className="border rounded-lg overflow-x-auto -mx-px">
    <Table className="min-w-[600px]">{children}</Table>
  </div>
);
export const TH = ({ children, className = "" }: { children?: React.ReactNode; className?: string }) => (
  <TableHead className={`text-xs h-9 font-semibold bg-muted/50 px-3 ${className}`}>{children}</TableHead>
);
export const TD = ({ children, className = "", colSpan }: { children?: React.ReactNode; className?: string; colSpan?: number }) => (
  <TableCell className={`text-xs py-2 px-3 ${className}`} colSpan={colSpan}>{children}</TableCell>
);

/* ─────────── 섹션 제목 ─────────── */
export function SectionTitle({ icon: Icon, title, desc, right }: { icon: any; title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">{title}</h3>
        {desc && <span className="text-xs text-muted-foreground ml-1">· {desc}</span>}
      </div>
      {right}
    </div>
  );
}
