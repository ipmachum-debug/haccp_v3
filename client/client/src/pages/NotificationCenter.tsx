import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Trash2, Filter, AlertTriangle, Info, CheckCircle2, AlertCircle, Zap, ExternalLink, CheckCircle, CheckSquare, Square, Save, Star, X } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";

const STORAGE_KEY_TYPE = "notification_filter_type";
const STORAGE_KEY_STATUS = "notification_filter_status";
const STORAGE_KEY_PRESETS = "notification_filter_presets";

type FilterPreset = {
  id: string;
  name: string;
  filterType: string;
  filterStatus: string;
};

export default function NotificationCenter() {
  // 로컬 스토리지에서 필터 상태 불러오기
  const [filterType, setFilterType] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY_TYPE) || "all";
    }
    return "all";
  });
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY_STATUS) || "all";
    }
    return "all";
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_PRESETS);
      return saved ? JSON.parse(saved) : [];
    }
    return [];
  });
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState("");

  // 필터 변경 시 로컬 스토리지에 저장
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_TYPE, filterType);
    }
  }, [filterType]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_STATUS, filterStatus);
    }
  }, [filterStatus]);

  const { data: notifications, refetch } = trpc.notification.list.useQuery();
  const { data: countsByType, refetch: refetchCounts } = trpc.notification.countsByType.useQuery();

  // 페이지 포커스 시 자동 새로고침
  useRefetchOnFocus(refetch);
  useRefetchOnFocus(refetchCounts);

  // 30초마다 자동 새로고침
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      refetchCounts();
    }, 30000); // 30초

    return () => clearInterval(interval);
  }, [refetch, refetchCounts]);
  const markAsReadMutation = trpc.notification.markAsRead.useMutation();
  const deleteMutation = trpc.notification.delete.useMutation();
  const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation();
  const deleteAllMutation = trpc.notification.deleteAll.useMutation();
  const resolvedMutation = trpc.notification.markAsResolved.useMutation();
  const markMultipleAsReadMutation = trpc.notification.markMultipleAsRead.useMutation();
  const deleteMultipleMutation = trpc.notification.deleteMultiple.useMutation();

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await markAsReadMutation.mutateAsync({ notificationId });
      toast.success("알림을 읽음으로 표시했습니다.");
      refetch();
    } catch (error) {
      toast.error("알림 읽음 처리에 실패했습니다.");
    }
  };

  const handleDelete = async (notificationId: number) => {
    try {
      await deleteMutation.mutateAsync({ notificationId });
      toast.success("알림이 삭제되었습니다.");
      refetch();
    } catch (error) {
      toast.error("알림 삭제에 실패했습니다.");
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsReadMutation.mutateAsync();
      toast.success("모든 알림을 읽음 처리했습니다.");
      refetch();
    } catch (error) {
      toast.error("알림 읽음 처리에 실패했습니다.");
    }
  };

  const handleMarkMultipleAsRead = async () => {
    if (selectedIds.length === 0) {
      toast.error("선택한 알림이 없습니다.");
      return;
    }
    try {
      await markMultipleAsReadMutation.mutateAsync({ notificationIds: selectedIds });
      toast.success(`${selectedIds.length}개의 알림을 읽음 처리했습니다.`);
      setSelectedIds([]);
      refetch();
      refetchCounts();
    } catch (error) {
      toast.error("알림 읽음 처리에 실패했습니다.");
    }
  };

  const handleDeleteMultiple = async () => {
    if (selectedIds.length === 0) {
      toast.error("선택한 알림이 없습니다.");
      return;
    }
    try {
      await deleteMultipleMutation.mutateAsync({ notificationIds: selectedIds });
      toast.success(`${selectedIds.length}개의 알림이 삭제되었습니다.`);
      setSelectedIds([]);
      refetch();
      refetchCounts();
    } catch (error) {
      toast.error("알림 삭제에 실패했습니다.");
    }
  };

  const handleToggleSelect = (notificationId: number) => {
    setSelectedIds(prev =>
      prev.includes(notificationId)
        ? prev.filter(id => id !== notificationId)
        : [...prev, notificationId]
    );
  };

  const handleToggleSelectAll = () => {
    if (!filteredNotifications) return;
    if (selectedIds.length === filteredNotifications.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredNotifications.map(n => n.id));
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("모든 알림을 삭제하시겠습니까?")) return;
    
    try {
      await deleteAllMutation.mutateAsync();
      toast.success("모든 알림이 삭제되었습니다.");
      refetch();
    } catch (error) {
      toast.error("알림 삭제에 실패했습니다.");
    }
  };

  const handleMarkAsResolved = async (notificationId: number) => {
    try {
      await resolvedMutation.mutateAsync({ notificationId });
      toast.success("알림을 조치 완료로 표시했습니다.");
      refetch();
    } catch (error) {
      toast.error("조치 완료 처리에 실패했습니다.");
    }
  };

  // 프리셋 저장
  const handleSavePreset = () => {
    if (!presetName.trim()) {
      toast.error("프리셋 이름을 입력해주세요.");
      return;
    }
    const newPreset: FilterPreset = {
      id: Date.now().toString(),
      name: presetName,
      filterType,
      filterStatus,
    };
    const updatedPresets = [...presets, newPreset];
    setPresets(updatedPresets);
    localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(updatedPresets));
    toast.success(`프리셋 "${presetName}"이(가) 저장되었습니다.`);
    setPresetName("");
    setShowPresetDialog(false);
  };

  // 프리셋 불러오기
  const handleLoadPreset = (preset: FilterPreset) => {
    setFilterType(preset.filterType);
    setFilterStatus(preset.filterStatus);
    toast.success(`프리셋 "${preset.name}"을(를) 불러왔습니다.`);
  };

  // 프리셋 삭제
  const handleDeletePreset = (presetId: string) => {
    const updatedPresets = presets.filter(p => p.id !== presetId);
    setPresets(updatedPresets);
    localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(updatedPresets));
    toast.success("프리셋이 삭제되었습니다.");
  };

  const getNotificationIcon = (type: string, priority?: string | null) => {
    // 우선순위가 urgent이면 특별 아이콘 표시
    if (priority === "urgent") {
      return <Zap className="h-5 w-5 text-red-600 animate-pulse" />;
    }
    
    switch (type) {
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case "error":
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case "success":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    const priorityMap: { [key: string]: { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string } } = {
      urgent: { label: "긴급", variant: "destructive", className: "bg-red-600 text-white animate-pulse" },
      high: { label: "높음", variant: "destructive" },
      medium: { label: "보통", variant: "secondary" },
      low: { label: "낮음", variant: "outline" },
    };

    const config = priorityMap[priority || "medium"] || priorityMap.medium;
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const getNotificationTypeBadge = (type: string) => {
    const typeMap: { [key: string]: { label: string; variant: "default" | "secondary" | "destructive" | "outline" } } = {
      info: { label: "정보", variant: "default" },
      warning: { label: "경고", variant: "secondary" },
      error: { label: "오류", variant: "destructive" },
      success: { label: "성공", variant: "outline" },
      ccp_reminder: { label: "CCP 점검 알림", variant: "default" },
      ccp_overdue: { label: "CCP 점검 누락", variant: "destructive" },
      expiry_warning_7d: { label: "유통기한 7일 전", variant: "secondary" },
      expiry_warning_3d: { label: "유통기한 3일 전", variant: "secondary" },
      expiry_urgent: { label: "유통기한 초과", variant: "destructive" },
      low_stock: { label: "재고 부족", variant: "destructive" },
    };

    const config = typeMap[type] || typeMap.info;
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  // 필터링 및 정렬된 알림 목록
  const filteredNotifications = notifications
    ?.filter((notification) => {
      const typeMatch = filterType === "all" || notification.notificationType === filterType;
      const statusMatch =
        filterStatus === "all" ||
        (filterStatus === "read" && notification.isRead === 1) ||
        (filterStatus === "unread" && notification.isRead === 0);
      return typeMatch && statusMatch;
    })
    .sort((a, b) => {
      // 우선순위별 정렬 (urgent > high > medium > low)
      const priorityOrder: { [key: string]: number } = { urgent: 4, high: 3, medium: 2, low: 1 };
      const aPriority = priorityOrder[a.priority || "medium"] || 2;
      const bPriority = priorityOrder[b.priority || "medium"] || 2;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority; // 높은 우선순위가 먼저
      }
      
      // 같은 우선순위는 생성 시간 역순
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const unreadCount = notifications?.filter((n) => n.isRead === 0).length || 0;

  return (
      <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Bell className="h-8 w-8" />
            알림 센터
          </h1>
          <p className="text-muted-foreground mt-1">
            시스템 알림을 확인하고 관리하세요
          </p>
        </div>
        <div className="flex items-center gap-4">
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-lg px-4 py-2">
              {unreadCount}개 읽지 않음
            </Badge>
          )}
          <div className="flex gap-2">
            {selectedIds.length > 0 && (
              <>
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  {selectedIds.length}개 선택됨
                </Badge>
                <Button
                  variant="outline"
                  onClick={handleMarkMultipleAsRead}
                >
                  <Check className="h-4 w-4 mr-2" />
                  선택 읽음 처리
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteMultiple}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  선택 삭제
                </Button>
              </>
            )}
            <Button
              variant="outline"
              onClick={handleMarkAllAsRead}
              disabled={unreadCount === 0}
            >
              <Check className="h-4 w-4 mr-2" />
              모두 읽음 처리
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteAll}
              disabled={!filteredNotifications || filteredNotifications.length === 0}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              모두 삭제
            </Button>
          </div>
        </div>
      </div>

      {/* 필터 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              필터
            </div>
            {filteredNotifications && filteredNotifications.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleSelectAll}
              >
                {selectedIds.length === filteredNotifications.length ? (
                  <>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    전체 선택 해제
                  </>
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    전체 선택
                  </>
                )}
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* 알림 타입 버튼 그룹 */}
            <div>
              <label className="text-sm font-medium mb-3 block">알림 타입</label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={filterType === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("all")}
                  className="relative"
                >
                  전체
                  {unreadCount > 0 && (
                    <Badge className="ml-2 bg-red-500 text-white">{unreadCount}</Badge>
                  )}
                </Button>
                <Button
                  variant={filterType === "ccp_reminder" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("ccp_reminder")}
                  className="relative"
                >
                  CCP 점검 알림
                  {countsByType?.ccp_reminder && (
                    <Badge className="ml-2 bg-blue-500 text-white">{countsByType.ccp_reminder}</Badge>
                  )}
                </Button>
                <Button
                  variant={filterType === "ccp_overdue" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("ccp_overdue")}
                  className="relative"
                >
                  CCP 점검 누락
                  {countsByType?.ccp_overdue && (
                    <Badge className="ml-2 bg-red-500 text-white">{countsByType.ccp_overdue}</Badge>
                  )}
                </Button>
                <Button
                  variant={filterType === "expiry_warning_7d" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("expiry_warning_7d")}
                  className="relative"
                >
                  유통기한 7일 전
                  {countsByType?.expiry_warning_7d && (
                    <Badge className="ml-2 bg-yellow-500 text-white">{countsByType.expiry_warning_7d}</Badge>
                  )}
                </Button>
                <Button
                  variant={filterType === "expiry_warning_3d" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("expiry_warning_3d")}
                  className="relative"
                >
                  유통기한 3일 전
                  {countsByType?.expiry_warning_3d && (
                    <Badge className="ml-2 bg-orange-500 text-white">{countsByType.expiry_warning_3d}</Badge>
                  )}
                </Button>
                <Button
                  variant={filterType === "expiry_urgent" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("expiry_urgent")}
                  className="relative"
                >
                  유통기한 초과
                  {countsByType?.expiry_urgent && (
                    <Badge className="ml-2 bg-red-600 text-white animate-pulse">{countsByType.expiry_urgent}</Badge>
                  )}
                </Button>
                <Button
                  variant={filterType === "low_stock" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterType("low_stock")}
                  className="relative"
                >
                  재고 부족
                  {countsByType?.low_stock && (
                    <Badge className="ml-2 bg-red-500 text-white">{countsByType.low_stock}</Badge>
                  )}
                </Button>
              </div>
            </div>
            
            {/* 읽음 상태 필터 */}
            <div>
              <label className="text-sm font-medium mb-3 block">읽음 상태</label>
              <div className="flex gap-2">
                <Button
                  variant={filterStatus === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("all")}
                >
                  전체
                </Button>
                <Button
                  variant={filterStatus === "unread" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("unread")}
                >
                  읽지 않음
                </Button>
                <Button
                  variant={filterStatus === "read" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilterStatus("read")}
                >
                  읽음
                </Button>
              </div>
            </div>

            {/* 프리셋 관리 */}
            <div>
              <label className="text-sm font-medium mb-3 block">필터 프리셋</label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPresetDialog(true)}
                >
                  <Save className="h-4 w-4 mr-2" />
                  현재 필터 저장
                </Button>
                {presets.map((preset) => (
                  <div key={preset.id} className="flex items-center gap-1 bg-secondary rounded-md px-2 py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadPreset(preset)}
                      className="h-auto py-1 px-2"
                    >
                      <Star className="h-3 w-3 mr-1" />
                      {preset.name}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePreset(preset.id)}
                      className="h-auto py-1 px-1 text-destructive hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 프리셋 저장 다이얼로그 */}
      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>필터 프리셋 저장</DialogTitle>
            <DialogDescription>
              현재 필터 설정을 프리셋으로 저장합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="preset-name">프리셋 이름</Label>
              <Input
                id="preset-name"
                placeholder="예: 긴급 + 읽지 않음"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSavePreset();
                  }
                }}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              <p>현재 필터 설정:</p>
              <ul className="list-disc list-inside mt-2">
                <li>알림 타입: {filterType === "all" ? "전체" : filterType}</li>
                <li>읽음 상태: {filterStatus === "all" ? "전체" : filterStatus === "unread" ? "읽지 않음" : "읽음"}</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPresetDialog(false)}>
              취소
            </Button>
            <Button onClick={handleSavePreset}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 알림 목록 */}
      <div className="space-y-4">
        {filteredNotifications && filteredNotifications.length > 0 ? (
          filteredNotifications.map((notification) => (
            <Card
              key={notification.id}
              className={`transition-all ${
                notification.isRead === 0
                  ? "border-l-4 border-l-primary bg-accent/50"
                  : "opacity-75"
              }`}
            >
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 mt-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleSelect(notification.id)}
                      className="h-8 w-8"
                    >
                      {selectedIds.includes(notification.id) ? (
                        <CheckSquare className="h-5 w-5 text-primary" />
                      ) : (
                        <Square className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                  <div className="flex-shrink-0 mt-1">
                    {getNotificationIcon(notification.notificationType || "info", notification.priority)}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-lg">{notification.title}</h3>
                          {getPriorityBadge(notification.priority)}
                          {getNotificationTypeBadge(notification.notificationType || "info")}
                          {notification.isRead === 0 && (
                            <Badge variant="outline" className="bg-primary/10">
                              새 알림
                            </Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground">{notification.message}</p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {notification.isRead === 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkAsRead(notification.id)}
                            disabled={markAsReadMutation.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            읽음
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(notification.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {notification.actionUrl && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => window.location.href = notification.actionUrl!}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          바로 가기
                        </Button>
                      )}
                      {notification.isResolved === 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkAsResolved(notification.id)}
                          disabled={resolvedMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          조치 완료
                        </Button>
                      )}
                      {notification.isResolved === 1 && notification.resolvedAt && (
                        <Badge variant="secondary" className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          조치 완료: {new Date(notification.resolvedAt).toLocaleString("ko-KR")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(notification.createdAt).toLocaleString("ko-KR")}
                      {notification.readAt && typeof notification.readAt === 'string' && (
                        <span className="ml-4">
                          읽음: {new Date(notification.readAt).toLocaleString("ko-KR")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>표시할 알림이 없습니다.</p>
            </CardContent>
          </Card>
        )}
      </div>
      </div>
  );
}
