import { useState, useEffect } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Mail, Smartphone, Clock, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

/**
 * 체크리스트 알림 설정 페이지
 * 사용자별로 알림 채널 및 알림 시점 설정
 */
export default function ChecklistNotificationSettings() {
  const { user } = useAuth();
  
  // 알림 설정 상태
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [reminderHours, setReminderHours] = useState("24");
  const [overdueReminderEnabled, setOverdueReminderEnabled] = useState(true);
  const [completionNotificationEnabled, setCompletionNotificationEnabled] = useState(true);
  const [approvalNotificationEnabled, setApprovalNotificationEnabled] = useState(true);
  const [rejectionNotificationEnabled, setRejectionNotificationEnabled] = useState(true);

  // 알림 설정 조회 (로컬 스토리지)
  useEffect(() => {
    const savedSettings = localStorage.getItem('checklist_notification_settings');
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings);
        setEmailEnabled(settings.emailEnabled ?? true);
        setPushEnabled(settings.pushEnabled ?? false);
        setReminderHours(settings.reminderHours ?? "24");
        setOverdueReminderEnabled(settings.overdueReminderEnabled ?? true);
        setCompletionNotificationEnabled(settings.completionNotificationEnabled ?? true);
        setApprovalNotificationEnabled(settings.approvalNotificationEnabled ?? true);
        setRejectionNotificationEnabled(settings.rejectionNotificationEnabled ?? true);
      } catch (error) {
        console.error('Failed to load notification settings:', error);
      }
    }
  }, []);

  const handleSave = () => {
    const settings = {
      emailEnabled,
      pushEnabled,
      reminderHours,
      overdueReminderEnabled,
      completionNotificationEnabled,
      approvalNotificationEnabled,
      rejectionNotificationEnabled,
    };
    
    localStorage.setItem('checklist_notification_settings', JSON.stringify(settings));
    toast.success("알림 설정이 저장되었습니다");
  };

  return (
    <DashboardLayout>
    <div className="space-y-6">
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
            체크리스트 알림 설정
          </h1>
          <p className="text-muted-foreground mt-2">
            체크리스트 관련 알림을 받을 채널과 시점을 설정하세요
          </p>
        </div>

        {/* 알림 채널 설정 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              알림 채널
            </CardTitle>
            <CardDescription>알림을 받을 채널을 선택하세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 이메일 알림 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="email-enabled" className="text-base font-medium">
                    이메일 알림
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {user?.email || "등록된 이메일"}로 알림을 받습니다
                  </p>
                </div>
              </div>
              <Switch
                id="email-enabled"
                checked={emailEnabled}
                onCheckedChange={setEmailEnabled}
              />
            </div>

            {/* 푸시 알림 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-muted-foreground" />
                <div>
                  <Label htmlFor="push-enabled" className="text-base font-medium">
                    푸시 알림
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    브라우저 또는 모바일 앱으로 푸시 알림을 받습니다
                  </p>
                </div>
              </div>
              <Switch
                id="push-enabled"
                checked={pushEnabled}
                onCheckedChange={setPushEnabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* 알림 시점 설정 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              알림 시점
            </CardTitle>
            <CardDescription>알림을 받을 시점을 설정하세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 사전 알림 */}
            <div className="space-y-2">
              <Label htmlFor="reminder-hours" className="text-base font-medium">
                체크리스트 마감 사전 알림
              </Label>
              <p className="text-sm text-muted-foreground">
                체크리스트 마감 전에 미리 알림을 받습니다
              </p>
              <div className="flex items-center gap-2">
                <Select value={reminderHours} onValueChange={setReminderHours}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1시간 전</SelectItem>
                    <SelectItem value="3">3시간 전</SelectItem>
                    <SelectItem value="6">6시간 전</SelectItem>
                    <SelectItem value="12">12시간 전</SelectItem>
                    <SelectItem value="24">24시간 전</SelectItem>
                    <SelectItem value="48">48시간 전</SelectItem>
                    <SelectItem value="72">72시간 전</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-sm text-muted-foreground">에 알림</span>
              </div>
            </div>

            {/* 마감 초과 알림 */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="overdue-enabled" className="text-base font-medium">
                  마감 초과 알림
                </Label>
                <p className="text-sm text-muted-foreground">
                  마감일이 지난 미완료 체크리스트에 대한 알림
                </p>
              </div>
              <Switch
                id="overdue-enabled"
                checked={overdueReminderEnabled}
                onCheckedChange={setOverdueReminderEnabled}
              />
            </div>

            {/* 완료 알림 */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="completion-enabled" className="text-base font-medium">
                  체크리스트 완료 알림
                </Label>
                <p className="text-sm text-muted-foreground">
                  담당 체크리스트가 완료되었을 때 알림
                </p>
              </div>
              <Switch
                id="completion-enabled"
                checked={completionNotificationEnabled}
                onCheckedChange={setCompletionNotificationEnabled}
              />
            </div>

            {/* 승인 알림 */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="approval-enabled" className="text-base font-medium">
                  승인 완료 알림
                </Label>
                <p className="text-sm text-muted-foreground">
                  제출한 체크리스트가 승인되었을 때 알림
                </p>
              </div>
              <Switch
                id="approval-enabled"
                checked={approvalNotificationEnabled}
                onCheckedChange={setApprovalNotificationEnabled}
              />
            </div>

            {/* 반려 알림 */}
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="rejection-enabled" className="text-base font-medium">
                  반려 알림
                </Label>
                <p className="text-sm text-muted-foreground">
                  제출한 체크리스트가 반려되었을 때 알림
                </p>
              </div>
              <Switch
                id="rejection-enabled"
                checked={rejectionNotificationEnabled}
                onCheckedChange={setRejectionNotificationEnabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* 알림 예시 */}
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle className="text-blue-700">알림 예시</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-blue-700">
              <strong>사전 알림:</strong> "체크리스트 #123이 {reminderHours}시간 후 마감됩니다"
            </p>
            {overdueReminderEnabled && (
              <p className="text-blue-700">
                <strong>마감 초과:</strong> "체크리스트 #123의 마감일이 지났습니다"
              </p>
            )}
            {completionNotificationEnabled && (
              <p className="text-blue-700">
                <strong>완료:</strong> "체크리스트 #123이 완료되었습니다"
              </p>
            )}
            {approvalNotificationEnabled && (
              <p className="text-blue-700">
                <strong>승인:</strong> "체크리스트 #123이 승인되었습니다"
              </p>
            )}
            {rejectionNotificationEnabled && (
              <p className="text-blue-700">
                <strong>반려:</strong> "체크리스트 #123이 반려되었습니다. 사유: ..."
              </p>
            )}
          </CardContent>
        </Card>

        {/* 저장 버튼 */}
        <div className="flex justify-end">
          <Button onClick={handleSave} size="lg">
            <Save className="w-4 h-4 mr-2" />
            설정 저장
          </Button>
        </div>
      </div>
    </div>
    </DashboardLayout>
  );
}
