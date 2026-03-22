/**
 * AI 비서 "하나" 플로팅 브리핑
 * 로그인 시 왼쪽 하단(계정정보 옆)에 말풍선으로 표시
 *
 * 원칙: 위험(Risk) + 돈(Money) + 행동(Action) 만
 * 3개 이하, 보고용 X, 결정 유도용 O
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { X, ChevronRight, Loader2 } from "lucide-react";
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

/** 하나 아바타 SVG - 둥근 얼굴 + 헤드셋 */
function HanaAvatar({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 배경 원 */}
      <circle cx="24" cy="24" r="23" fill="url(#hana-grad)" stroke="#10b981" strokeWidth="1.5"/>
      {/* 얼굴 */}
      <circle cx="24" cy="22" r="12" fill="#FFF5E6"/>
      {/* 눈 */}
      <ellipse cx="20" cy="20" rx="1.8" ry="2.2" fill="#334155"/>
      <ellipse cx="28" cy="20" rx="1.8" ry="2.2" fill="#334155"/>
      {/* 눈 반짝 */}
      <circle cx="20.8" cy="19.2" r="0.7" fill="white"/>
      <circle cx="28.8" cy="19.2" r="0.7" fill="white"/>
      {/* 입 (미소) */}
      <path d="M20 25.5 Q24 28.5 28 25.5" stroke="#e11d48" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
      {/* 볼 터치 */}
      <circle cx="17" cy="24" r="2" fill="#FECDD3" opacity="0.6"/>
      <circle cx="31" cy="24" r="2" fill="#FECDD3" opacity="0.6"/>
      {/* 헤드셋 */}
      <path d="M12 20 Q12 12 24 12 Q36 12 36 20" stroke="#10b981" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <rect x="10" y="18" width="4" height="7" rx="2" fill="#10b981"/>
      <rect x="34" y="18" width="4" height="7" rx="2" fill="#10b981"/>
      {/* 마이크 */}
      <path d="M36 25 L38 30 L40 30" stroke="#10b981" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <circle cx="40" cy="30" r="1.5" fill="#10b981"/>
      {/* 머리카락 */}
      <path d="M14 16 Q18 8 24 10 Q30 8 34 16" stroke="#1e293b" strokeWidth="2" fill="none" strokeLinecap="round"/>
      <defs>
        <linearGradient id="hana-grad" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#ecfdf5"/>
          <stop offset="100%" stopColor="#d1fae5"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function FloatingAIBriefing() {
  const [, navigate] = useLocation();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const lastDismissed = sessionStorage.getItem("ai-briefing-dismissed");
    if (lastDismissed === today) {
      setDismissed(true);
    }
  }, []);

  const { data: briefing, isLoading } = trpc.ai.briefing.useQuery(undefined, {
    enabled: !dismissed,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (briefing && !dismissed) {
      const timer = setTimeout(() => {
        setVisible(true);
        setTimeout(() => setAnimateIn(true), 50);
      }, 1000);
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
    <div className={`fixed z-[9998] transition-all duration-500 ease-out ${animateIn ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
      style={{ left: "16px", bottom: "72px" }}>

      {/* 말풍선 카드 */}
      <div className="relative w-[340px] max-w-[calc(100vw-32px)] rounded-2xl border border-emerald-200 shadow-xl bg-white dark:bg-slate-900 dark:border-emerald-800 overflow-hidden">
        {/* 말풍선 꼬리 (왼쪽 하단) */}
        <div className="absolute -bottom-2 left-6 w-4 h-4 bg-white dark:bg-slate-900 border-b border-r border-emerald-200 dark:border-emerald-800 transform rotate-45" />

        {/* 헤더 - 하나 아바타 + 이름 */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-100 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2.5">
            <HanaAvatar size={32} />
            <div>
              <p className="text-[13px] font-bold text-emerald-800 dark:text-emerald-300">AI 비서 하나</p>
              <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/60">오늘의 브리핑</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="w-6 h-6 rounded-full hover:bg-emerald-200/50 dark:hover:bg-emerald-800/50 flex items-center justify-center transition-colors"
          >
            <X className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="px-4 py-3">
          {isLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 className="h-4 w-4 text-emerald-500 animate-spin" />
              <span className="text-xs text-muted-foreground">분석 중...</span>
            </div>
          ) : briefing ? (
            <>
              {/* 인사 */}
              <p className="text-[13px] leading-snug mb-2.5">
                <span className="mr-1">👋</span>
                <span className="font-semibold">{briefing.userName}님</span>
                <span className="text-muted-foreground ml-1">{briefing.greeting}</span>
              </p>

              {/* 알림 항목 */}
              {briefing.items.length > 0 ? (
                <div className="space-y-1.5">
                  {briefing.items.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className={`rounded-lg border px-3 py-2 cursor-pointer hover:shadow-sm transition-shadow ${SEVERITY_STYLES[item.severity as keyof typeof SEVERITY_STYLES] || SEVERITY_STYLES.info}`}
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
                        {item.actionUrl && (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-1 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2 text-center">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    ✅ 특이사항 없습니다. 좋은 하루 보내세요!
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* 하단 닫기 */}
        <div className="px-4 pb-3">
          <button
            onClick={handleDismiss}
            className="w-full h-8 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-medium text-muted-foreground transition-colors"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}
