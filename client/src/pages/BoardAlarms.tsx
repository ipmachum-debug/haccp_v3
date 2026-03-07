/**
 * 알림 목록 페이지 (작업자/관리자용)
 * 
 * /board/alerts 경로
 * - 알림 리스트 → 클릭하면 커뮤니케이션 로그 상세로 이동
 * - 읽지않은 알림 하이라이트
 */
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Bell,
  BellOff,
  CheckCheck,
  Megaphone,
  ClipboardList,
  Pin,
  Building2,
  ChevronRight,
  Loader2,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import MobileBottomNav from "@/components/MobileBottomNav";

const typeIcons: Record<string, { emoji: string; color: string }> = {
  notice: { emoji: "📢", color: "bg-blue-500" },
  work: { emoji: "📋", color: "bg-amber-500" },
  handover: { emoji: "📌", color: "bg-emerald-500" },
  partner: { emoji: "🏢", color: "bg-purple-500" },
  status_change: { emoji: "🔄", color: "bg-orange-500" },
  mention: { emoji: "💬", color: "bg-pink-500" },
  comment: { emoji: "💬", color: "bg-indigo-500" },
};

export default function BoardAlarms() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const { data: alarms = [], refetch, isLoading } = trpc.board.getAlarms.useQuery(
    { unreadOnly: showUnreadOnly },
    { refetchInterval: 15000 }
  );

  const markReadMutation = trpc.board.markAlarmRead.useMutation({
    onSuccess: () => refetch(),
  });

  const markAllReadMutation = trpc.board.markAllAlarmsRead.useMutation({
    onSuccess: () => {
      toast.success("모든 알림을 읽음 처리했습니다");
      refetch();
    },
  });

  const handleAlarmClick = (alarm: any) => {
    // 읽음 처리
    if (!alarm.isRead) {
      markReadMutation.mutate({ alarmId: alarm.id });
    }
    // 커뮤니케이션 로그 상세로 이동
    if (alarm.logId) {
      setLocation(`/dashboard/accounting/communication-log`);
    }
  };

  const alarmList = alarms as any[];

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* 헤더 */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/board")}
              className="h-8 w-8 p-0 rounded-full"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shadow-lg shadow-orange-400/30">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">알림</h1>
              <p className="text-[11px] text-gray-400 leading-tight">
                {alarmList.filter((a: any) => !a.isRead).length}개 읽지 않음
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="h-8 w-8 p-0 rounded-full text-gray-400"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              className="h-8 px-2 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-full"
            >
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              모두읽음
            </Button>
          </div>
        </div>

        {/* 필터 */}
        <div className="px-4 pb-2 flex gap-2">
          <button
            onClick={() => setShowUnreadOnly(false)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              !showUnreadOnly ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            전체
          </button>
          <button
            onClick={() => setShowUnreadOnly(true)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              showUnreadOnly ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            읽지않음
          </button>
        </div>
      </div>

      {/* 알림 리스트 */}
      <div className="px-4 py-3 space-y-2">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400 mb-3" />
            <p className="text-sm text-gray-400">알림 로딩 중...</p>
          </div>
        ) : alarmList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <BellOff className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-400">
              {showUnreadOnly ? "읽지 않은 알림이 없습니다" : "알림이 없습니다"}
            </p>
          </div>
        ) : (
          alarmList.map((alarm: any) => {
            const typeInfo = typeIcons[alarm.logType] || typeIcons[alarm.type] || { emoji: "🔔", color: "bg-gray-500" };
            const isUnread = !alarm.isRead;

            return (
              <button
                key={alarm.id}
                onClick={() => handleAlarmClick(alarm)}
                className={`w-full text-left rounded-xl border transition-all active:scale-[0.98] ${
                  isUnread
                    ? "bg-blue-50/60 border-blue-200/60 shadow-sm"
                    : "bg-white border-gray-100"
                }`}
              >
                <div className="p-3.5 flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-xl ${typeInfo.color} flex items-center justify-center text-lg flex-shrink-0 shadow-sm`}>
                    {typeInfo.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {isUnread && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {alarm.message}
                      </span>
                    </div>
                    {alarm.logTitle && (
                      <p className="text-xs text-gray-600 font-medium truncate">{alarm.logTitle}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                      {alarm.logContent?.substring(0, 60)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">
                        {alarm.authorName || "시스템"}
                      </span>
                      <span className="text-[10px] text-gray-300">·</span>
                      <span className="text-[10px] text-gray-400">
                        {new Date(alarm.createdAt).toLocaleString("ko-KR", {
                          month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-3" />
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* 모바일 하단 네비게이션 */}
      <MobileBottomNav activeTab="alerts" />
    </div>
  );
}
