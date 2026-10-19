/**
 * 생산 설계 화면 공용 조각 (2026-10-19) — 신호등 · 숫자 표시
 */
import { cn } from "@/lib/utils";

export type Signal = "green" | "yellow" | "red";

const SIGNAL: Record<Signal, { dot: string; label: string; badge: string }> = {
  green: { dot: "bg-emerald-500", label: "생산 가능", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  yellow: { dot: "bg-amber-400", label: "확인 필요", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  red: { dot: "bg-red-500", label: "바로 고칠 것", badge: "bg-red-50 text-red-700 border-red-200" },
};

export function SignalBadge({ signal, className }: { signal: Signal; className?: string }) {
  const s = SIGNAL[signal];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.badge, className)}>
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />{s.label}
    </span>
  );
}

export const signalLabel = (s: Signal) => SIGNAL[s].label;

export function fmtKg(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "-";
  return `${Math.round(v * 100) / 100}kg`;
}

export function fmtVal(v: unknown): string {
  if (v == null || v === "") return "없음";
  return String(v);
}

/** 기존 수정 화면 경로 — 1단계는 수정을 기존 화면에서 */
export const EDIT_PATHS = {
  recipe: (reportId: number) => `/dashboard/mf-report/edit/${reportId}`,
  /** 생산 설계 제품 배합 상세 (배합표 | 공정 흐름도). versionId = 그 버전 그대로, focus=unknown = 들어가는 곳 미정 원료로 바로 */
  recipeDetail: (reportId: number, opts?: { versionId?: number; focus?: "unknown" }) => {
    const q = new URLSearchParams();
    if (opts?.versionId) q.set("version", String(opts.versionId));
    if (opts?.focus) q.set("focus", opts.focus);
    const qs = q.toString();
    return `/design/recipes/${reportId}${qs ? `?${qs}` : ""}`;
  },
  equipment: "/quality/ccp-monitoring",
  process: "/quality/ccp-limits",
  approval: "/dashboard/approval",
} as const;
