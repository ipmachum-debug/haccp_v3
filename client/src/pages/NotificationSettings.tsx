import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Mail, MessageSquare, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function NotificationSettings() {
  const { data: settings, isLoading, refetch } = trpc.notificationSettings.get.useQuery();
  
  const saveMutation = trpc.notificationSettings.save.useMutation({
    onSuccess: () => {
      alert("알림 설정이 저장되었습니다.");
      refetch();
    },
    onError: (error: any) => {
      alert(`오류: ${error.message}`);
    },
  });

  // 알림 설정 상태
  const [localSettings, setLocalSettings] = useState({
    ccpDeviation: {
      system: true,
      email: false,
      sms: false,
    },
    lowStock: {
      system: true,
      email: true,
      sms: false,
    },
    expiryWarning: {
      system: true,
      email: true,
      sms: false,
    },
    batchCompleted: {
      system: true,
      email: false,
      sms: false,
    },
    approvalRequest: {
      system: true,
      email: true,
      sms: false,
    },
    inspectionCompleted: {
      system: true,
      email: false,
      sms: false,
    },
  });

  const [workingHoursOnly, setWorkingHoursOnly] = useState(false);

  // 설정 로드 시 상태 업데이트
  useEffect(() => {
    if (settings) {
      setLocalSettings({
        ccpDeviation: {
          system: !!settings.ccpDeviationEnabled && !!settings.systemNotificationEnabled,
          email: !!settings.ccpDeviationEnabled && !!settings.emailEnabled,
          sms: !!settings.ccpDeviationEnabled && !!settings.smsEnabled,
        },
        lowStock: {
          system: !!settings.stockLowEnabled && !!settings.systemNotificationEnabled,
          email: !!settings.stockLowEnabled && !!settings.emailEnabled,
          sms: !!settings.stockLowEnabled && !!settings.smsEnabled,
        },
        expiryWarning: {
          system: !!settings.expiryWarningEnabled && !!settings.systemNotificationEnabled,
          email: !!settings.expiryWarningEnabled && !!settings.emailEnabled,
          sms: !!settings.expiryWarningEnabled && !!settings.smsEnabled,
        },
        batchCompleted: {
          system: !!settings.batchCompletedEnabled && !!settings.systemNotificationEnabled,
          email: !!settings.batchCompletedEnabled && !!settings.emailEnabled,
          sms: !!settings.batchCompletedEnabled && !!settings.smsEnabled,
        },
        approvalRequest: {
          system: !!settings.approvalRequestEnabled && !!settings.systemNotificationEnabled,
          email: !!settings.approvalRequestEnabled && !!settings.emailEnabled,
          sms: !!settings.approvalRequestEnabled && !!settings.smsEnabled,
        },
        inspectionCompleted: {
          system: !!settings.inspectionCompletedEnabled && !!settings.systemNotificationEnabled,
          email: !!settings.inspectionCompletedEnabled && !!settings.emailEnabled,
          sms: !!settings.inspectionCompletedEnabled && !!settings.smsEnabled,
        },
      });
      setWorkingHoursOnly(!!settings.businessHoursOnly);
    }
  }, [settings]);

  const handleToggle = (type: string, channel: string) => {
    setLocalSettings((prev) => ({
      ...prev,
      [type]: {
        ...prev[type as keyof typeof prev],
        [channel]: !prev[type as keyof typeof prev][channel as keyof typeof prev.ccpDeviation],
      },
    }));
  };

  const handleSave = () => {
    // 로컬 설정을 백엔드 형식으로 변환
    const hasSystemEnabled = Object.values(localSettings).some(s => s.system);
    const hasEmailEnabled = Object.values(localSettings).some(s => s.email);
    const hasSmsEnabled = Object.values(localSettings).some(s => s.sms);

    saveMutation.mutate({
      ccpDeviationEnabled: localSettings.ccpDeviation.system || localSettings.ccpDeviation.email || localSettings.ccpDeviation.sms ? 1 : 0,
      stockLowEnabled: localSettings.lowStock.system || localSettings.lowStock.email || localSettings.lowStock.sms ? 1 : 0,
      expiryWarningEnabled: localSettings.expiryWarning.system || localSettings.expiryWarning.email || localSettings.expiryWarning.sms ? 1 : 0,
      batchCompletedEnabled: localSettings.batchCompleted.system || localSettings.batchCompleted.email || localSettings.batchCompleted.sms ? 1 : 0,
      approvalRequestEnabled: localSettings.approvalRequest.system || localSettings.approvalRequest.email || localSettings.approvalRequest.sms ? 1 : 0,
      inspectionCompletedEnabled: localSettings.inspectionCompleted.system || localSettings.inspectionCompleted.email || localSettings.inspectionCompleted.sms ? 1 : 0,
      systemNotificationEnabled: hasSystemEnabled ? 1 : 0,
      emailEnabled: hasEmailEnabled ? 1 : 0,
      smsEnabled: hasSmsEnabled ? 1 : 0,
      businessHoursOnly: workingHoursOnly ? 1 : 0,
    });
  };

  const notificationTypes = [
    {
      key: "ccpDeviation",
      title: "CCP 이탈",
      description: "CCP 한계기준을 벗어난 경우",
      icon: <Bell className="h-5 w-5 text-orange-500" />,
    },
    {
      key: "lowStock",
      title: "재고 부족",
      description: "원재료 재고가 안전 수준 이하로 떨어진 경우",
      icon: <Bell className="h-5 w-5 text-red-500" />,
    },
    {
      key: "expiryWarning",
      title: "유통기한 임박",
      description: "원재료 유통기한이 7일 이내로 남은 경우",
      icon: <Clock className="h-5 w-5 text-yellow-500" />,
    },
    {
      key: "batchCompleted",
      title: "배치 완료",
      description: "배치 생산이 완료된 경우",
      icon: <Bell className="h-5 w-5 text-green-500" />,
    },
    {
      key: "approvalRequest",
      title: "승인 요청",
      description: "배치 승인 또는 CCP 검토 요청이 있는 경우",
      icon: <Bell className="h-5 w-5 text-blue-500" />,
    },
    {
      key: "inspectionCompleted",
      title: "검사 완료",
      description: "원재료, 출하, 위생 검사가 완료된 경우",
      icon: <Bell className="h-5 w-5 text-purple-500" />,
    },
  ];

  if (isLoading) {
    return (
      
        <div className="space-y-6">
          <div className="text-center">설정을 불러오는 중...</div>
        </div>
      
    );
  }

  return (
    
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">알림 설정</h1>
          <p className="text-muted-foreground mt-2">
            알림 유형별로 수신 채널을 설정하고 알림 수신 시간을 관리합니다.
          </p>
        </div>

        {/* 전역 설정 */}
        <Card>
          <CardHeader>
            <CardTitle>전역 설정</CardTitle>
            <CardDescription>모든 알림에 적용되는 설정입니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="working-hours">업무 시간만 알림 수신</Label>
                <p className="text-sm text-muted-foreground">
                  평일 09:00 ~ 18:00 시간대에만 알림을 수신합니다.
                </p>
              </div>
              <Switch
                id="working-hours"
                checked={workingHoursOnly}
                onCheckedChange={setWorkingHoursOnly}
              />
            </div>
          </CardContent>
        </Card>

        {/* 알림 유형별 설정 */}
        <Card>
          <CardHeader>
            <CardTitle>알림 유형별 설정</CardTitle>
            <CardDescription>각 알림 유형별로 수신 채널을 선택합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {notificationTypes.map((type) => (
                <div key={type.key} className="space-y-3 pb-6 border-b last:border-b-0">
                  <div className="flex items-start gap-3">
                    {type.icon}
                    <div className="flex-1">
                      <h3 className="font-medium">{type.title}</h3>
                      <p className="text-sm text-muted-foreground">{type.description}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 ml-8">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`${type.key}-system`}
                        checked={localSettings[type.key as keyof typeof localSettings].system}
                        onCheckedChange={() => handleToggle(type.key, "system")}
                      />
                      <Label htmlFor={`${type.key}-system`} className="flex items-center gap-2">
                        <Bell className="h-4 w-4" />
                        시스템 알림
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`${type.key}-email`}
                        checked={localSettings[type.key as keyof typeof localSettings].email}
                        onCheckedChange={() => handleToggle(type.key, "email")}
                      />
                      <Label htmlFor={`${type.key}-email`} className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        이메일
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id={`${type.key}-sms`}
                        checked={localSettings[type.key as keyof typeof localSettings].sms}
                        onCheckedChange={() => handleToggle(type.key, "sms")}
                      />
                      <Label htmlFor={`${type.key}-sms`} className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        SMS
                      </Label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 저장 버튼 */}
        <div className="flex justify-end">
          <Button 
            size="lg" 
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "저장 중..." : "설정 저장"}
          </Button>
        </div>
      </div>
    
  );
}
