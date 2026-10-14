/**
 * 모바일 하단 네비게이션 (2-b-4, 2026-10-14 — 레지스트리 기반 역할별)
 *
 * - 앱(DashboardLayout, 모바일): 역할별 핵심 화면 최대 3개 + 알림 + 메뉴(허브 사이드바 열기)
 *   항목은 shared/navigation/menuRegistry.ts 의 mobileNavFor — 이 사용자에게 보이는 메뉴 경로만 고른다.
 * - 공지보드(/board, /board/alerts — 사이드바 없는 화면): 공지 · 알림 (+ employee 가 아니면 업무 화면으로)
 *
 * 알림 배지: 앱은 상단 알림 드롭다운과 같은 출처(notification.list 미읽음 + CCP 대기 알림, 쿼리 캐시 공유),
 * 공지보드는 기존과 같은 board.getUnreadCount.
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { cn } from "@/lib/utils";
import { getIcon } from "@/domain/engines/clientMenuEngine";
import type { MobileNavItem } from "@shared/navigation/menuRegistry";

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <nav aria-label="하단 메뉴"
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 dark:bg-card/95 backdrop-blur border-t border-border shadow-[0_-2px_10px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-stretch justify-around h-16 max-w-md mx-auto">{children}</div>
    </nav>
  );
}

function Item({ label, icon, active, badge = 0, onClick, testId }: { label: string; icon: string; active: boolean; badge?: number; onClick: () => void; testId?: string }) {
  const Icon = getIcon(icon);
  return (
    <button type="button" onClick={onClick} data-testid={testId} aria-current={active ? "page" : undefined}
      className={cn("flex flex-col items-center justify-center flex-1 min-w-0 relative transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
      {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary" />}
      <span className="relative">
        <Icon className={cn("h-5 w-5", active && "stroke-[2.4]")} />
        <Badge n={badge} />
      </span>
      <span className="text-[11px] mt-1 font-semibold truncate max-w-full px-1">{label}</span>
    </button>
  );
}

/** 앱 하단바 — DashboardLayout 이 역할·보이는 메뉴로 계산한 항목을 받는다 */
export function AppBottomNav({ items, isActivePath, onOpenMenu }: {
  items: MobileNavItem[];
  isActivePath: (path: string) => boolean;
  onOpenMenu: () => void;
}) {
  const [location, setLocation] = useLocation();
  const { data: notifications } = trpc.notification.list.useQuery();
  const { data: ccpAlerts } = trpc.ccp.getUserPendingAlerts.useQuery();
  const unread = (notifications?.filter((n: any) => n.isRead === 0).length ?? 0) + (ccpAlerts?.length ?? 0);

  return (
    <Bar>
      {items.map((it) => it.kind === "menu" ? (
        <Item key="menu" label={it.label} icon={it.icon} active={false} onClick={onOpenMenu} testId="mobile-nav-menu" />
      ) : (
        <Item key={it.path} label={it.label} icon={it.icon}
          active={it.kind === "alerts" ? location === it.path : isActivePath(it.path)}
          badge={it.kind === "alerts" ? unread : 0}
          onClick={() => setLocation(it.path)} testId={`mobile-nav-${it.path}`} />
      ))}
    </Bar>
  );
}

/** 공지보드 하단바 (사이드바 없는 화면) — 기존 사용처(NoticeBoard, BoardAlarms) 호환 */
export default function MobileBottomNav({ activeTab = "home" }: { activeTab?: "home" | "alerts" | "log" | "settings" }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { data: unreadData } = trpc.board.getUnreadCount.useQuery(undefined, { refetchInterval: 30000, enabled: !!user });

  return (
    <Bar>
      <Item label="공지" icon="Home" active={activeTab === "home"} onClick={() => setLocation("/board")} />
      <Item label="알림" icon="Bell" active={activeTab === "alerts"} badge={unreadData?.count ?? 0} onClick={() => setLocation("/board/alerts")} />
      {user && user.role !== "employee" && (
        <Item label="업무" icon="LayoutDashboard" active={false} onClick={() => setLocation("/dashboard")} />
      )}
    </Bar>
  );
}
