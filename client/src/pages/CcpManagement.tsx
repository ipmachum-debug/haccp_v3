import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { TabsList } from "@/components/ui/tabs";
import CcpRecords from "./CcpRecords";
import CcpEquipmentMonitoring from "./CcpEquipmentMonitoring";
import CcpLimitSettings from "./CcpLimitSettings";
import CcpStats from "./CcpStats";
import CcpReportGenerator from "./CcpReportGenerator";

export default function CcpManagement() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'records');

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
          <h1 className="text-3xl font-bold mb-2">CCP 관리</h1>
          <p className="text-muted-foreground">
            중요관리점(CCP) 모니터링 기록, 설비 기준 관리, 한계기준 설정, 통계 분석 및 보고서를 통합 관리합니다.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <TabsList className="grid w-full grid-cols-5 lg:w-[800px]">
              <TabsTrigger value="records" className="text-xs md:text-sm">모니터링 기록</TabsTrigger>
              <TabsTrigger value="equipment" className="text-xs md:text-sm">설비 기준</TabsTrigger>
              <TabsTrigger value="limits" className="text-xs md:text-sm">한계기준 설정</TabsTrigger>
              <TabsTrigger value="stats" className="text-xs md:text-sm">통계</TabsTrigger>
              <TabsTrigger value="reports" className="text-xs md:text-sm">보고서 생성</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="records" className="space-y-4">
            <CcpRecords />
          </TabsContent>

          <TabsContent value="equipment" className="space-y-4">
            <CcpEquipmentMonitoring />
          </TabsContent>

          <TabsContent value="limits" className="space-y-4">
            <CcpLimitSettings />
          </TabsContent>

          <TabsContent value="stats" className="space-y-4">
            <CcpStats />
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <CcpReportGenerator />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
