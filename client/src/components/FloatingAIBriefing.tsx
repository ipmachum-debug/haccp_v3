/**
 * AI 비서 플로팅 브리핑
 * 로그인 시 자동 표시 → 핵심 알림만 → 닫기
 *
 * 원칙: 위험(Risk) + 돈(Money) + 행동(Action) 만
 * 3개 이하, 보고용 X, 결정 유도용 O
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { X, Sparkles, ChevronRight, AlertTriangle, Loader2 } from "lucide-react";
import { useLocation } from "wouter";

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

export default function FloatingAIBriefing() {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  // 오늘 이미 닫았는지 확인
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const lastDismissed = sessionStorage.getItem("ai-briefing-dismissed");
    if (lastDismissed === today) {
      setDismissed(true);
    }
  }, []);

  const { data: briefing, isLoading } = trpc.ai.briefing.useQuery(undefined, {
    enabled: !dismissed,
    staleTime: 5 * 60 * 1000, // 5분 캐시
    retry: false,
  });

  // 데이터 로드 후 애니메이션 표시
  useEffect(() => {
    if (briefing && !dismissed) {
      const timer = setTimeout(() => {
        setVisible(true);
        setTimeout(() => setAnimateIn(true), 50);
      }, 800); // 페이지 로드 후 0.8초 딜레이
      return () => clearTimeout(timer);
    }
  }, [briefing, dismissed]);

  const handleDismiss = () => {
    setAnimateIn(false);
    setTimeout(() => {
      setVisible(false);
      setDismissed(true);
      const today = new Date().toISOString().split("T")[0];
      sessionStorage.setItem("ai-briefing-dismissed", today);
    }, 300);
  };

  const handleAction = (url: string) => {
    handleDismiss();
    navigate(url);
  };

  if (dismissed || !visible) return null;

  return (
    <div className={`fixed inset-0 z-[9999] pointer-events-none flex items-start justify-center pt-16 sm:pt-24 transition-opacity duration-300 ${animateIn ? "opacity-100" : "opacity-0"}`}>
      {/* 배경 오버레이 */}
      <div
        className={`fixed inset-0 bg-black/10 dark:bg-black/30 pointer-events-auto transition-opacity duration-300 ${animateIn ? "opacity-100" : "opacity-0"}`}
        onClick={handleDismiss}
      />

      {/* 카드 */}
      <div className={`relative pointer-events-auto w-[90vw] max-w-[420px] rounded-2xl border shadow-2xl bg-white dark:bg-slate-900 overflow-hidden transition-all duration-500 ${animateIn ? "translate-y-0 scale-100" : "-translate-y-8 scale-95"}`}>
        {/* 상단 헤더 */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-white text-[13px] font-bold tracking-tight">AI 비서</p>
              <p className="text-white/70 text-[10px]">오늘의 핵심 브리핑</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="w-7 h-7 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
          >
            <X className="h-3.5 w-3.5 text-white" />
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="px-5 py-4">
          {isLoading ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" />
              <span className="text-sm text-muted-foreground">분석 중...</span>
            </div>
          ) : briefing ? (
            <>
              {/* 인사 */}
              <div className="mb-3.5">
                <p className="text-[15px] leading-snug">
                  <span className="mr-1.5">👋</span>
                  <span className="font-semibold">{briefing.userName}님</span>
                  <span className="text-muted-foreground ml-1">{briefing.greeting}</span>
                </p>
              </div>

              {/* 알림 항목 */}
              {briefing.items.length > 0 ? (
                <div className="space-y-2">
                  {briefing.items.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className={`rounded-xl border px-3.5 py-2.5 ${SEVERITY_STYLES[item.severity as keyof typeof SEVERITY_STYLES] || SEVERITY_STYLES.info}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[item.severity as keyof typeof SEVERITY_DOT] || SEVERITY_DOT.info}`} />
                          <span className="text-sm">{item.icon}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{item.label}</span>
                          <p className="text-[13px] font-medium leading-snug mt-0.5">{item.message}</p>
                        </div>
                        {item.actionUrl && (
                          <button
                            onClick={() => handleAction(item.actionUrl)}
                            className="shrink-0 mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                          >
                            {item.actionLabel || '확인'}
                            <ChevronRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 text-center">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">
                    <span className="mr-1">✅</span>
                    현재 특이사항 없습니다. 좋은 하루 보내세요!
                  </p>
                </div>
              )}

              {/* 하단 조치 안내 */}
              {briefing.items.length > 0 && (
                <div className="mt-3 pt-3 border-t border-dashed">
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    <span>👉</span>
                    <span>항목을 클릭하면 해당 페이지로 이동합니다</span>
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="py-3 text-center text-sm text-muted-foreground">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-amber-400" />
              브리핑을 불러올 수 없습니다
            </div>
          )}
        </div>

        {/* 하단 닫기 */}
        <div className="px-5 pb-4">
          <button
            onClick={handleDismiss}
            className="w-full h-9 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-medium text-muted-foreground transition-colors"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}
