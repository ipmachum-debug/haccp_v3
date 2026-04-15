import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Trash2, AlertTriangle, Info, CheckCircle2, AlertCircle, Zap, ExternalLink, CheckCircle, CheckSquare, Square, Save, Star, X } from "lucide-react";
import { toast } from "sonner";
import { useRefetchOnFocus } from "@/hooks/useRefetchOnFocus";

const STORAGE_KEY_TYPE = "notification_filter_type";
const STORAGE_KEY_STATUS = "notification_filter_status";
const STORAGE_KEY_PRESETS = "notification_filter_presets";

type FilterPreset = { id: string; name: string; filterType: string; filterStatus: string; };

export default function NotificationCenter() {
  const [filterType, setFilterType] = useState<string>(() => typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_TYPE) || "all" : "all");
  const [filterStatus, setFilterStatus] = useState<string>(() => typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_STATUS) || "all" : "all");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [presets, setPresets] = useState<FilterPreset[]>(() => { try { const s = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY_PRESETS) : null; return s ? JSON.parse(s) : []; } catch { return []; } });
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState("");

  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_TYPE, filterType); }, [filterType]);
  useEffect(() => { if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY_STATUS, filterStatus); }, [filterStatus]);

  const { data: notifications, refetch } = trpc.notification.list.useQuery();
  const { data: countsByType, refetch: refetchCounts } = trpc.notification.countsByType.useQuery();
  useRefetchOnFocus(refetch);
  useRefetchOnFocus(refetchCounts);
  useEffect(() => { const iv = setInterval(() => { refetch(); refetchCounts(); }, 30000); return () => clearInterval(iv); }, [refetch, refetchCounts]);

  const markAsReadMutation = trpc.notification.markAsRead.useMutation();
  const deleteMutation = trpc.notification.delete.useMutation();
  const markAllAsReadMutation = trpc.notification.markAllAsRead.useMutation();
  const deleteAllMutation = trpc.notification.deleteAll.useMutation();
  const resolvedMutation = trpc.notification.markAsResolved.useMutation();
  const markMultipleAsReadMutation = trpc.notification.markMultipleAsRead.useMutation();
  const deleteMultipleMutation = trpc.notification.deleteMultiple.useMutation();

  const handleMarkAsRead = async (id: number) => { try { await markAsReadMutation.mutateAsync({ notificationId: id }); toast.success("읽음 처리"); refetch(); refetchCounts(); } catch { toast.error("실패"); } };
  const handleDelete = async (id: number) => { try { await deleteMutation.mutateAsync({ notificationId: id }); toast.success("삭제됨"); refetch(); refetchCounts(); } catch { toast.error("실패"); } };
  const handleMarkAllAsRead = async () => { try { await markAllAsReadMutation.mutateAsync(); toast.success("모두 읽음"); refetch(); refetchCounts(); } catch { toast.error("실패"); } };
  const handleMarkMultipleAsRead = async () => { if (selectedIds.length === 0) return; try { await markMultipleAsReadMutation.mutateAsync({ notificationIds: selectedIds }); toast.success(`${selectedIds.length}개 읽음`); setSelectedIds([]); refetch(); refetchCounts(); } catch { toast.error("실패"); } };
  const handleDeleteMultiple = async () => { if (selectedIds.length === 0) return; try { await deleteMultipleMutation.mutateAsync({ notificationIds: selectedIds }); toast.success(`${selectedIds.length}개 삭제`); setSelectedIds([]); refetch(); refetchCounts(); } catch { toast.error("실패"); } };
  const handleToggleSelect = (id: number) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const handleToggleSelectAll = () => { if (!filteredNotifications) return; setSelectedIds(selectedIds.length === filteredNotifications.length ? [] : filteredNotifications.map((n: any) => n.id)); };
  const handleDeleteAll = async () => { if (!confirm("모든 알림을 삭제하시겠습니까?")) return; try { await deleteAllMutation.mutateAsync(); toast.success("모두 삭제"); refetch(); refetchCounts(); } catch { toast.error("실패"); } };
  const handleMarkAsResolved = async (id: number) => { try { await resolvedMutation.mutateAsync({ notificationId: id }); toast.success("조치 완료"); refetch(); } catch { toast.error("실패"); } };

  const handleSavePreset = () => {
    if (!presetName.trim()) { toast.error("프리셋 이름을 입력해주세요."); return; }
    const up = [...presets, { id: Date.now().toString(), name: presetName, filterType, filterStatus }];
    setPresets(up); localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(up));
    toast.success(`"${presetName}" 저장`); setPresetName(""); setShowPresetDialog(false);
  };
  const handleLoadPreset = (p: FilterPreset) => { setFilterType(p.filterType); setFilterStatus(p.filterStatus); toast.success(`"${p.name}" 적용`); };
  const handleDeletePreset = (id: string) => { const up = presets.filter(p => p.id !== id); setPresets(up); localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(up)); };

  const getNotificationIcon = (type: string, priority?: string | null) => {
    if (priority === "urgent") return <Zap className="h-4 w-4 text-red-600 animate-pulse" />;
    switch (type) {
      case "warning": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "error": return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case "success": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    const m: Record<string, { label: string; cls: string }> = {
      urgent: { label: "긴급", cls: "bg-red-600 text-white animate-pulse" },
      high: { label: "높음", cls: "bg-red-100 text-red-700" },
      medium: { label: "보통", cls: "bg-gray-100 text-gray-700" },
      low: { label: "낮음", cls: "bg-gray-50 text-gray-500" },
    };
    const c = m[priority || "medium"] || m.medium;
    return <Badge className={`${c.cls} text-[10px] px-1 py-0`}>{c.label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const m: Record<string, { label: string; cls: string }> = {
      info: { label: "정보", cls: "bg-blue-100 text-blue-700" },
      warning: { label: "경고", cls: "bg-yellow-100 text-yellow-700" },
      error: { label: "오류", cls: "bg-red-100 text-red-700" },
      success: { label: "성공", cls: "bg-green-100 text-green-700" },
      ccp_reminder: { label: "CCP점검", cls: "bg-blue-100 text-blue-700" },
      ccp_overdue: { label: "CCP누락", cls: "bg-red-100 text-red-700" },
      expiry_warning_7d: { label: "7일전", cls: "bg-yellow-100 text-yellow-700" },
      expiry_warning_3d: { label: "3일전", cls: "bg-orange-100 text-orange-700" },
      expiry_urgent: { label: "기한초과", cls: "bg-red-100 text-red-700" },
      low_stock: { label: "재고부족", cls: "bg-red-100 text-red-700" },
    };
    const c = m[type] || m.info;
    return <Badge className={`${c.cls} text-[10px] px-1 py-0`}>{c.label}</Badge>;
  };

  const filteredNotifications = notifications
    ?.filter((n: any) => {
      const typeOk = filterType === "all" || n.notificationType === filterType;
      const statusOk = filterStatus === "all" || (filterStatus === "read" && n.isRead === 1) || (filterStatus === "unread" && n.isRead === 0);
      return typeOk && statusOk;
    })
    .sort((a: any, b: any) => {
      const po: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
      const d = (po[b.priority || "medium"] || 2) - (po[a.priority || "medium"] || 2);
      return d !== 0 ? d : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const unreadCount = notifications?.filter((n: any) => n.isRead === 0).length || 0;

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h2 className="text-lg font-bold">알림 센터</h2>
          {unreadCount > 0 && <Badge variant="destructive" className="text-xs">{unreadCount} 읽지않음</Badge>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {selectedIds.length > 0 && (
            <>
              <Badge variant="secondary" className="text-xs">{selectedIds.length}개 선택</Badge>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleMarkMultipleAsRead}><Check className="h-3 w-3 mr-0.5" />선택읽음</Button>
              <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDeleteMultiple}><Trash2 className="h-3 w-3 mr-0.5" />선택삭제</Button>
            </>
          )}
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleMarkAllAsRead} disabled={unreadCount === 0}><Check className="h-3 w-3 mr-0.5" />모두읽음</Button>
          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={handleDeleteAll} disabled={!filteredNotifications?.length}><Trash2 className="h-3 w-3 mr-0.5" />모두삭제</Button>
        </div>
      </div>

      {/* 필터 */}
      <Card className="p-3">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[10px] text-muted-foreground font-medium self-center mr-1">타입</span>
            {[
              { v: "all", l: "전체", c: unreadCount },
              { v: "ccp_reminder", l: "CCP점검", c: countsByType?.ccp_reminder },
              { v: "ccp_overdue", l: "CCP누락", c: countsByType?.ccp_overdue },
              { v: "expiry_warning_7d", l: "7일전", c: countsByType?.expiry_warning_7d },
              { v: "expiry_warning_3d", l: "3일전", c: countsByType?.expiry_warning_3d },
              { v: "expiry_urgent", l: "기한초과", c: countsByType?.expiry_urgent },
              { v: "low_stock", l: "재고부족", c: countsByType?.low_stock },
            ].map(f => (
              <Button key={f.v} variant={filterType === f.v ? "default" : "outline"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setFilterType(f.v)}>
                {f.l}{f.c ? <Badge className="ml-1 h-3.5 px-1 text-[9px] bg-red-500 text-white">{f.c}</Badge> : null}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground font-medium mr-1">상태</span>
            {[{ v: "all", l: "전체" }, { v: "unread", l: "읽지않음" }, { v: "read", l: "읽음" }].map(f => (
              <Button key={f.v} variant={filterStatus === f.v ? "default" : "outline"} size="sm" className="h-6 text-[10px] px-2" onClick={() => setFilterStatus(f.v)}>{f.l}</Button>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowPresetDialog(true)}><Save className="h-2.5 w-2.5 mr-0.5" />저장</Button>
              {presets.map(p => (
                <div key={p.id} className="flex items-center gap-0.5 bg-secondary rounded px-1 py-0.5">
                  <Button variant="ghost" size="sm" className="h-auto py-0 px-1 text-[10px]" onClick={() => handleLoadPreset(p)}><Star className="h-2.5 w-2.5 mr-0.5" />{p.name}</Button>
                  <button className="text-destructive hover:text-destructive/80" onClick={() => handleDeletePreset(p.id)}><X className="h-2.5 w-2.5" /></button>
                </div>
              ))}
            </div>
          </div>
          {filteredNotifications && filteredNotifications.length > 0 && (
            <div className="flex items-center gap-1.5 pt-1 border-t">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={handleToggleSelectAll}>
                {selectedIds.length === filteredNotifications.length ? <><CheckSquare className="h-3 w-3 mr-0.5 text-blue-600" />선택해제</> : <><Square className="h-3 w-3 mr-0.5" />전체선택</>}
              </Button>
              <span className="text-[10px] text-muted-foreground">{filteredNotifications.length}건</span>
            </div>
          )}
        </div>
      </Card>

      {/* 프리셋 다이얼로그 */}
      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-base">필터 프리셋 저장</DialogTitle></DialogHeader>
          <div><Label className="text-xs">이름</Label><Input placeholder="예: 긴급+읽지않음" value={presetName} onChange={(e) => setPresetName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleSavePreset(); }} className="h-8 text-xs" /></div>
          <DialogFooter><Button variant="outline" size="sm" onClick={() => setShowPresetDialog(false)}>취소</Button><Button size="sm" onClick={handleSavePreset}>저장</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 알림 목록 - 컴팩트 행 */}
      <Card>
        <CardContent className="p-0">
          {filteredNotifications && filteredNotifications.length > 0 ? (
            filteredNotifications.map((n: any) => (
              <div key={n.id}
                className={`flex items-start gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-accent/40 transition-colors ${n.isRead === 0 ? "bg-accent/30 border-l-2 border-l-primary" : "opacity-80"}`}
              >
                {/* 체크박스 */}
                <button className="mt-0.5 flex-shrink-0 text-muted-foreground hover:text-blue-600" onClick={() => handleToggleSelect(n.id)}>
                  {selectedIds.includes(n.id) ? <CheckSquare className="h-4 w-4 text-blue-600" /> : <Square className="h-4 w-4" />}
                </button>

                {/* 아이콘 */}
                <div className="mt-0.5 flex-shrink-0">{getNotificationIcon(n.notificationType || "info", n.priority)}</div>

                {/* 내용 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm truncate">{n.title}</span>
                    {getPriorityBadge(n.priority)}
                    {getTypeBadge(n.notificationType || "info")}
                    {n.isRead === 0 && <Badge variant="outline" className="bg-primary/10 text-[10px] px-1 py-0">새알림</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{n.message}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {n.actionUrl && (
                      <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => window.location.href = n.actionUrl!}>
                        <ExternalLink className="h-2.5 w-2.5 mr-0.5" />바로가기
                      </Button>
                    )}
                    {n.isResolved === 0 && (
                      <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5" onClick={() => handleMarkAsResolved(n.id)} disabled={resolvedMutation.isPending}>
                        <CheckCircle className="h-2.5 w-2.5 mr-0.5" />조치완료
                      </Button>
                    )}
                    {n.isResolved === 1 && n.resolvedAt && (
                      <Badge className="bg-green-100 text-green-700 text-[10px] px-1 py-0">
                        조치완료 {new Date(n.resolvedAt).toLocaleDateString("ko-KR")}
                      </Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(n.createdAt).toLocaleString("ko-KR")}</span>
                  </div>
                </div>

                {/* 액션 */}
                <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                  {n.isRead === 0 && (
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleMarkAsRead(n.id)} title="읽음">
                      <Check className="h-3 w-3" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-gray-400 hover:text-red-500" onClick={() => handleDelete(n.id)} title="삭제">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">알림이 없습니다.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
