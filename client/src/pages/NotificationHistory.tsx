import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Check, AlertTriangle, Info } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export default function NotificationHistory() {
  const [filter, setFilter] = useState<"all" | "unread">("all");

  // 알림 목록 조회
  const { data: notifications, isLoading, refetch } = trpc.notification.list.useQuery();

  // 알림 읽음 처리
  const markAsReadMutation = trpc.notification.markAsRead.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleMarkAsRead = (id: number) => {
    markAsReadMutation.mutate({ notificationId: id });
  };

  const handleMarkAllAsRead = async () => {
    if (!notifications) return;
    
    const unreadNotifications = notifications.filter((n: any) => !n.isRead);
    for (const notification of unreadNotifications) {
      await markAsReadMutation.mutateAsync({ notificationId: notification.id });
    }
    refetch();
  };

  const filteredNotifications = notifications?.filter((n: any) => {
    if (filter === "unread") return !n.isRead;
    return true;
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "ccp_deviation":
      case "low_stock":
      case "expiry_warning":
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case "batch_completed":
      case "inspection_completed":
        return <Check className="h-5 w-5 text-green-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getNotificationTypeName = (type: string) => {
    const typeMap: Record<string, string> = {
      ccp_deviation: "CCP 이탈",
      low_stock: "재고 부족",
      expiry_warning: "유통기한 임박",
      batch_completed: "배치 완료",
      inspection_completed: "검사 완료",
      approval_request: "승인 요청",
      system: "시스템",
    };
    return typeMap[type] || type;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>알림 히스토리</CardTitle>
              <CardDescription>시스템 알림 및 경고 메시지를 확인합니다.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={filter === "all" ? "default" : "outline"}
                onClick={() => setFilter("all")}
                size="sm"
              >
                <Bell className="mr-2 h-4 w-4" />
                전체
              </Button>
              <Button
                variant={filter === "unread" ? "default" : "outline"}
                onClick={() => setFilter("unread")}
                size="sm"
              >
                <BellOff className="mr-2 h-4 w-4" />
                읽지 않음
              </Button>
              <Button
                variant="outline"
                onClick={handleMarkAllAsRead}
                size="sm"
                disabled={!notifications?.some((n: any) => !n.isRead)}
              >
                <Check className="mr-2 h-4 w-4" />
                모두 읽음 처리
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">로딩 중...</div>
          ) : filteredNotifications && filteredNotifications.length > 0 ? (
            <div className="space-y-3">
              {filteredNotifications.map((notification: any) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border transition-colors ${
                    notification.isRead
                      ? "bg-background border-border"
                      : "bg-accent/50 border-accent"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getNotificationIcon(notification.notificationType || "system")}</div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {getNotificationTypeName(notification.notificationType || "system")}
                          </Badge>
                          {!notification.isRead && (
                            <Badge variant="default" className="text-xs">
                              새 알림
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {notification.createdAt ? format(new Date(notification.createdAt), "yyyy-MM-dd HH:mm", {
                            locale: ko,
                          }) : "-"}
                        </span>
                      </div>
                      <p className="text-sm font-medium">{notification.title || "제목 없음"}</p>
                      <p className="text-sm text-muted-foreground">{notification.message || "내용 없음"}</p>
                      {!notification.isRead && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="mt-2"
                        >
                          읽음 처리
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {filter === "unread" ? "읽지 않은 알림이 없습니다." : "알림이 없습니다."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
