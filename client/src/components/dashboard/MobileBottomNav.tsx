/**
 * 모바일 하단 네비게이션 바
 * 
 * - Home (공지보드)
 * - Alerts (알림)
 * - Log (커뮤니케이션 로그)
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  Home,
  Bell,
  MessageSquare,
  Settings,
} from "lucide-react";

interface MobileBottomNavProps {
  activeTab?: "home" | "alerts" | "log" | "settings";
}

export default function MobileBottomNav({ activeTab = "home" }: MobileBottomNavProps) {
  const [, setLocation] = useLocation();
  const { user, isAdmin, isWorker } = useAuth();

  // 읽지 않은 알림 수
  const { data: unreadData } = trpc.board.getUnreadCount.useQuery(undefined, {
    refetchInterval: 30000,
    enabled: !!user,
  });
  const unreadCount = unreadData?.count || 0;

  const navItems = [
    {
      key: "home" as const,
      label: "홈",
      icon: Home,
      path: "/board",
      show: true,
    },
    {
      key: "alerts" as const,
      label: "알림",
      icon: Bell,
      path: "/board/alerts",
      show: true,
      badge: unreadCount,
    },
    {
      key: "log" as const,
      label: "로그",
      icon: MessageSquare,
      path: "/dashboard/accounting/communication-log",
      show: isWorker || isAdmin,
    },
    {
      key: "settings" as const,
      label: "설정",
      icon: Settings,
      path: "/dashboard",
      show: isAdmin,
    },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-around h-16 max-w-md mx-auto">
        {navItems
          .filter((item) => item.show)
          .map((item) => {
            const isActive = activeTab === item.key;
            const Icon = item.icon;

            return (
              <button
                key={item.key}
                onClick={() => setLocation(item.path)}
                className={`flex flex-col items-center justify-center flex-1 h-full relative transition-colors ${
                  isActive ? "text-gray-800" : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <div className="relative">
                  <Icon className={`h-5.5 w-5.5 ${isActive ? "stroke-[2.5]" : ""}`} />
                  {item.badge && item.badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </div>
                <span className={`text-[11px] mt-1 font-semibold ${isActive ? "text-gray-800" : ""}`}>
                  {item.label}
                </span>
                {isActive && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-gradient-to-r from-amber-400 to-amber-500 rounded-full" />
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}
