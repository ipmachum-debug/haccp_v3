/**
 * AI 비서 "하나" 오늘의 브리핑 — 헤더 버튼 + 알림 표시 (2026-10-20, 대표 요청)
 *
 * 이전: 로그인하면 왼쪽 아래에 말풍선이 저절로 떠서 매번 닫아야 했다 (FloatingAIBriefing).
 * 지금: 헤더 업무 도구 자리에 'AI 비서 하나' 이름이 보이는 버튼, 오늘 아직 안 본 항목이 있으면 숫자(위험이면 빨강)로 알려 준다.
 *       눌렀을 때만 브리핑이 열린다. '확인했습니다' 를 누르면 그날(한국 시각) 숫자 표시가 사라진다 — 버튼은 그대로.
 *
 * 원칙: 위험(Risk) + 돈(Money) + 행동(Action) 만, 3개 이하, 결정 유도용.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronRight, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const SEVERITY_STYLES = {
  critical: "border-red-200 bg-red-50/80 dark:bg-red-950/30 dark:border-red-800",
  warning: "border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800",
  info: "border-blue-200 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-800",
};

const SEVERITY_DOT = {
  critical: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
};

// 그날(한국 시각) 확인했으면 숫자 표시를 숨긴다 — 이전 말풍선과 같은 저장 키 (이미 확인한 날은 그대로 이어짐)
const SEEN_KEY = "ai-briefing-dismissed";
const kstToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()); // YYYY-MM-DD
const seenToday = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === kstToday();
  } catch {
    return false;
  }
};

export default function AIBriefingButton({ compact = false }: { compact?: boolean }) {
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(seenToday);

  const { data: briefing, isLoading } = trpc.ai.briefing.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const items: any[] = briefing?.items ?? [];
  const count = items.length;
  const hasCritical = items.some((i) => i.severity === "critical");
  const showBadge = !seen && count > 0;

  const markSeen = () => {
    setSeen(true);
    try {
      localStorage.setItem(SEEN_KEY, kstToday());
    } catch {
      /* 저장할 수 없는 브라우저(사생활 모드 등) — 이번 화면에서만 */
    }
  };

  const handleAction = (url: string) => {
    markSeen();
    setOpen(false);
    navigate(url);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="ai-briefing-button"
          aria-label={showBadge ? `AI 비서 하나 — 오늘 확인할 것 ${count}건` : "AI 비서 하나 — 오늘의 브리핑"}
          title={showBadge ? `오늘 확인할 것 ${count}건` : "오늘의 브리핑"}
          className={`group inline-flex items-center gap-1.5 rounded-full border border-emerald-200/70 bg-gradient-to-b from-white to-emerald-50/70 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-all hover:border-emerald-300 hover:shadow-[0_2px_6px_rgba(16,185,129,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 dark:border-emerald-800/60 dark:from-slate-900 dark:to-emerald-950/40 ${compact ? "h-9 pl-0.5 pr-2" : "h-9 pl-1 pr-3"}`}
        >
          <img src="/ai-hana-character.png" alt="" className="h-7 w-7 rounded-full object-cover object-top ring-1 ring-emerald-100 dark:ring-emerald-900" />
          {/* 이름이 보이게 — 프로필 사진으로 오해하지 않도록 (2026-10-20 대표 요청) */}
          <span className="text-[12.5px] font-semibold tracking-tight text-emerald-900 dark:text-emerald-200 whitespace-nowrap">
            {compact ? "AI 하나" : "AI 비서 하나"}
          </span>
          {showBadge && (
            <span
              data-testid="ai-briefing-badge"
              className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white leading-[18px] text-center tabular-nums ${hasCritical ? "bg-rose-500" : "bg-amber-500"}`}
            >
              {count}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] max-w-[calc(100vw-32px)] p-0 overflow-hidden rounded-2xl border-emerald-200 dark:border-emerald-800" data-testid="ai-briefing-panel">
        {/* 헤더 - 하나 아바타 + 이름 */}
        <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30">
          <img src="/ai-hana-character.png" alt="하나" className="h-8 w-8 rounded-full object-cover object-top" />
          <div>
            <p className="text-[13px] font-bold text-emerald-800 dark:text-emerald-300">AI 비서 하나</p>
            <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/60">오늘의 브리핑</p>
          </div>
        </div>

        <div className="px-4 py-3">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
              <span className="text-xs text-muted-foreground">분석 중...</span>
            </div>
          ) : briefing ? (
            <>
              <p className="text-[13px] leading-snug mb-2.5">
                <span className="mr-1">👋</span>
                <span className="font-semibold">{briefing.userName}님</span>
                <span className="text-muted-foreground ml-1">{briefing.greeting}</span>
              </p>
              {count > 0 ? (
                <div className="space-y-1.5">
                  {items.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className={`rounded-lg border px-3 py-2 transition-shadow ${item.actionUrl ? "cursor-pointer hover:shadow-sm" : ""} ${SEVERITY_STYLES[item.severity as keyof typeof SEVERITY_STYLES] || SEVERITY_STYLES.info}`}
                      onClick={() => item.actionUrl && handleAction(item.actionUrl)}
                    >
                      <div className="flex items-start gap-2">
                        <div className="flex items-center gap-1 shrink-0 mt-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[item.severity as keyof typeof SEVERITY_DOT] || SEVERITY_DOT.info}`} />
                          <span className="text-xs">{item.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{item.label}</span>
                          <p className="text-[12px] font-medium leading-snug">{item.message}</p>
                        </div>
                        {item.actionUrl && <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground" />}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-center">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">✅ 특이사항 없습니다. 좋은 하루 보내세요!</p>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground py-2">브리핑을 불러오지 못했습니다. 잠시 후 다시 눌러 주세요.</p>
          )}
        </div>

        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => { markSeen(); setOpen(false); }}
            className="w-full h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-medium text-muted-foreground transition-colors"
          >
            확인했습니다
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
