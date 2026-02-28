import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import NotificationCenter from "./NotificationCenter";
import NotificationHistory from "./NotificationHistory";
import NotificationStatistics from "./NotificationStatistics";
import NotificationSettings from "./NotificationSettings";

export default function NotificationManagement() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'center');

  // URL 쿼리 파라미터와 탭 상태 동기화
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const tab = params.get('tab');
    if (tab && tab !== activeTab) {
      setActiveTab(tab);
    }
  }, [location]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const basePath = location.split('?')[0];
    setLocation(`${basePath}?tab=${value}`);
  };

  return (
    <DashboardLayout>
      <div className="container py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">알림 관리</h1>
          <p className="text-muted-foreground">
            시스템 알림을 확인하고 알림 설정을 관리합니다.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="center">센터</TabsTrigger>
            <TabsTrigger value="history">히스토리</TabsTrigger>
            <TabsTrigger value="statistics">통계</TabsTrigger>
            <TabsTrigger value="settings">설정</TabsTrigger>
          </TabsList>

          <TabsContent value="center" className="space-y-4">
            <NotificationCenter />
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <NotificationHistory />
          </TabsContent>

          <TabsContent value="statistics" className="space-y-4">
            <NotificationStatistics />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <NotificationSettings />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
