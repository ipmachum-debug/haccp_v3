import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { VisualInspectionLogContent } from "./VisualInspectionLog";
import { FinishedProductInspectionLogContent } from "../haccp/FinishedProductInspectionLog";

export default function InspectionManagement() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'visual');

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
      <div className="space-y-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">검사 관리</h1>
          <p className="text-muted-foreground">
            육안검사(원재료) 및 완제품 출고검사를 통합 관리합니다.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
            <TabsTrigger value="visual">육안검사(원재료)</TabsTrigger>
            <TabsTrigger value="finished">완제품출고검사</TabsTrigger>
          </TabsList>

          <TabsContent value="visual" className="space-y-4">
            <VisualInspectionLogContent />
          </TabsContent>

          <TabsContent value="finished" className="space-y-4">
            <FinishedProductInspectionLogContent />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
