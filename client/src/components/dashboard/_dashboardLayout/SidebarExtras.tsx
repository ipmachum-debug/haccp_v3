/**
 * DashboardLayout 분해 — 사이드바 보조 컴포넌트 묶음.
 *  - SubscriptionInfo    패키지/남은일수 표시
 *  - ThemeToggleButton   라이트/다크 토글
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { useTheme } from "@/contexts/ThemeContext";
import { Moon, Sun } from "lucide-react";

// ─── 구독 정보 위젯 ──────────────────────────────
interface SubInfo {
  daysRemaining?: number;
  status?: string;
  isReadOnly?: boolean;
  subscriptionPackage?: string;
}

export function SubscriptionInfo({ isCollapsed }: { isCollapsed: boolean }) {
  const checkSubscription = trpc.subscriptionPublic.checkSubscriptionStatus.useMutation();
  const [subInfo, setSubInfo] = useState<SubInfo | null>(null);

  useEffect(() => {
    checkSubscription.mutateAsync().then(setSubInfo).catch(() => {});
  }, []);

  if (!subInfo || isCollapsed) return null;

  const daysRemaining = subInfo.daysRemaining || 0;
  const isExpiringSoon = daysRemaining <= 7 && daysRemaining > 3;
  const isUrgent = daysRemaining <= 3 && daysRemaining > 0;
  const isGracePeriod = subInfo.status === "expired" && subInfo.isReadOnly;
  const isSuspended = subInfo.status === "suspended";

  let textColor = "text-muted-foreground";
  let statusDot = "bg-emerald-500/70";

  if (isSuspended) {
    textColor = "text-red-500/80 dark:text-red-400/80";
    statusDot = "bg-red-500/70";
  } else if (isGracePeriod) {
    textColor = "text-red-500/80 dark:text-red-400/80";
    statusDot = "bg-red-500/70";
  } else if (isUrgent) {
    textColor = "text-amber-600/80 dark:text-amber-400/80";
    statusDot = "bg-amber-500/70";
  } else if (isExpiringSoon) {
    textColor = "text-amber-600/80 dark:text-amber-400/80";
    statusDot = "bg-amber-500/70";
  }

  // 패키지 표시 — 신 체계(starter/standard/enterprise) + 구 체계(basic/pro) 호환
  const PACKAGE_LABEL: Record<string, string> = {
    starter: "Starter",
    standard: "Standard",
    enterprise: "Enterprise",
    pro: "Pro",      // legacy
    basic: "Basic",  // legacy
  };
  const packageLabel = PACKAGE_LABEL[subInfo.subscriptionPackage as string] || "Basic";

  return (
    <div className="mb-1.5 flex items-center justify-between px-1">
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
        <span className="text-[10px] text-muted-foreground/60">
          {packageLabel}
        </span>
        <span className={`text-[10px] font-medium ${textColor}`}>
          {isSuspended
            ? "중단됨"
            : isGracePeriod
              ? "유예기간"
              : daysRemaining > 0
                ? `${daysRemaining}일`
                : "만료"}
        </span>
      </div>
    </div>
  );
}

// ─── 테마 토글 버튼 ──────────────────────────────
export function ThemeToggleButton({ isCollapsed }: { isCollapsed: boolean }) {
  const { theme, toggleTheme } = useTheme();

  if (!toggleTheme) return null; // switchable이 false면 버튼 숨김

  return (
    <button
      onClick={toggleTheme}
      className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
      aria-label="Toggle theme"
      title={isCollapsed ? (theme === "light" ? "다크 모드" : "라이트 모드") : undefined}
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Sun className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}
