/**
 * StatusBadge — 상태 표시 표준 (3-a). 문구·색은 lib/statusDictionary 한 곳에서.
 *   <StatusBadge status={row.status} />                 // 원래 코드 그대로 넘긴다
 *   <StatusBadge status={row.status} domain="sale" />   // 업무별 예외(매출 pending = 승인 대기)
 *   <StatusBadge status="custom" label="입고 대기" tone="amber" />  // 사전에 없는 업무 고유 상태
 */
import { cn } from "@/lib/utils";
import { resolveStatus, STATUS_TONE_CLASS, type StatusTone } from "@/lib/statusDictionary";

export function StatusBadge({ status, domain, label, tone, className }: {
  status: string | null | undefined;
  domain?: string;
  label?: string;
  tone?: StatusTone;
  className?: string;
}) {
  const r = resolveStatus(status, domain);
  return (
    <span
      data-status={r.kind ?? status ?? ""}
      className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap", STATUS_TONE_CLASS[tone ?? r.tone], className)}
    >
      {label ?? r.label}
    </span>
  );
}
