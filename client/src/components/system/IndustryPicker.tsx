/**
 * 업종 고르기 — 첫 설정 안내와 관리자 설정이 같은 것을 쓴다 (2026-10-20 신규 회사 시험).
 *   업종에 따라 메뉴·기록지·라벨이 바뀐다. 저장은 기존 industry.updateIndustry (관리자만) 한 경로.
 */
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { INDUSTRY_OPTIONS } from "@/lib/industryOptions";
import { useIndustryFeatures, useUpdateIndustry } from "@/hooks/useIndustryFeatures";
import { Loader2 } from "lucide-react";

export default function IndustryPicker({ onSaved }: { onSaved?: (code: string) => void }) {
  const { industryCode } = useIndustryFeatures();
  const update = useUpdateIndustry();
  const [pending, setPending] = useState<string | null>(null);
  const choose = (code: string) => {
    if (code === industryCode || update.isPending) return;
    const label = INDUSTRY_OPTIONS.find((o) => o.code === code)?.label ?? code;
    // 이미 정한 업종을 바꿀 때만 한 번 묻는다 (처음 정할 때는 바로)
    if (industryCode && !confirm(`업종을 '${label}'(으)로 바꾸면 메뉴와 기능이 바뀝니다. 바꿀까요?`)) return;
    setPending(code);
    update.mutate({ industryCode: code }, {
      onSuccess: () => { toast.success(`업종: ${label} — 메뉴를 맞췄습니다`); setPending(null); onSaved?.(code); },
      onError: (e: { message: string }) => { toast.error(e.message); setPending(null); },
    });
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="industry-picker">
      {INDUSTRY_OPTIONS.map((o) => {
        const Icon = o.icon;
        const on = (pending ?? industryCode) === o.code;
        return (
          <button key={o.code} type="button" onClick={() => choose(o.code)} disabled={update.isPending} data-testid={`pick-industry-${o.code}`}
            className={cn("min-h-11 rounded-md border px-2 py-2 text-sm flex items-center gap-1.5 text-left",
              on ? "border-blue-600 bg-blue-50 text-blue-800 dark:bg-blue-500/10 dark:text-blue-300" : "bg-background hover:bg-accent")}>
            {pending === o.code ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Icon className="h-4 w-4 shrink-0" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}
