import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Bell, Check, Trash2, AlertTriangle, Info, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function NotificationDropdown() {
  const [, setLocation] = useLocation();
  const { data: notifications, refetch } = trpc.notification.list.useQuery();
  const { data: ccpAlerts, refetch: refetchAlerts } = trpc.ccp.getUserPendingAlerts.useQuery();
  const markAsReadMutation = trpc.notification.markAsRead.useMutation();

  // 5초마다 알림 새로고침
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      refetchAlerts();
    }, 5000);
    return () => clearInterval(interval);
  }, [refetch, refetchAlerts]);

  const unreadCount = notifications?.filter((n: any) => n.isRead === 0).length || 0;
  const ccpAlertCount = ccpAlerts?.length || 0;
  const totalUnreadCount = unreadCount + ccpAlertCount;
  const recentNotifications = notifications?.slice(0, 5) || [];

  const handleMarkAsRead = async (notificationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await markAsReadMutation.mutateAsync({ notificationId });
      refetch();
    } catch (error) {
      toast.error("알림 읽음 처리에 실패했습니다.");
    }
  };

  const handleNotificationClick = async (notificationId: number, isRead: number) => {
    if (isRead === 0) {
      try {
        await markAsReadMutation.mutateAsync({ notificationId });
      } catch (error) {
        // 무시
      }
    }
    setLocation("/notifications");
  };

  const handleCcpAlertClick = (batchId: number) => {
    setLocation(`/batch/${batchId}`);
  };

  const getNotificationIcon = (type: string, priority?: string | null) => {
    if (priority === "urgent") {
      return <Zap className="h-4 w-4 text-red-600" />;
    }
    
    switch (type) {
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-600" />;
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {totalUnreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>알림</span>
          {unreadCount > 0 && (
            <Badge variant="secondary" className="ml-2">
              {unreadCount}개 읽지 않음
            </Badge>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[300px]">
          {ccpAlertCount > 0 && (
            <>
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                CCP 점검 알림
              </div>
              {ccpAlerts?.filter((alert: any) => alert.batchId !== null).map((alert: any) => (
                <DropdownMenuItem
                  key={`ccp-${alert.id}`}
                  className="flex items-start gap-3 p-3 cursor-pointer bg-amber-50"
                  onClick={() => handleCcpAlertClick(alert.batchId!)}
                >
                  <div className="mt-0.5">
                    <Zap className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium leading-none">
                      CCP 점검 필요
                    </p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      배치 ID: {alert.batchId} - CCP 인스턴스 ID: {alert.instanceId}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      예정 시간: {new Date(alert.scheduledTime).toLocaleString("ko-KR")}
                    </p>
                  </div>
                </DropdownMenuItem>
              ))}
              {recentNotifications.length > 0 && <DropdownMenuSeparator />}
            </>
          )}
          {recentNotifications.length === 0 && ccpAlertCount === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              알림이 없습니다
            </div>
          ) : (
            <>
              {recentNotifications.length > 0 && (
                <>
                  <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">
                    일반 알림
                  </div>
                  {recentNotifications.map((notification: any) => (
                    <DropdownMenuItem
                      key={notification.id}
                      className={`flex items-start gap-3 p-3 cursor-pointer ${
                        notification.isRead === 0 ? "bg-blue-50" : ""
                      }`}
                      onClick={() => handleNotificationClick(notification.id, notification.isRead ?? 0)}
                    >
                      <div className="mt-0.5">
                        {getNotificationIcon(notification.notificationType || "info", notification.priority)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {notification.title}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(notification.createdAt).toLocaleString("ko-KR")}
                        </p>
                      </div>
                      {notification.isRead === 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => handleMarkAsRead(notification.id, e)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollArea>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-center justify-center cursor-pointer"
          onClick={() => setLocation("/notifications")}
        >
          모든 알림 보기
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
