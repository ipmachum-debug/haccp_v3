import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import BatchList from "./BatchList";
import BatchCreate from "./BatchCreate";
import BatchProfitabilityDashboard from "./BatchProfitabilityDashboard";
import CostAnalysis from "./CostAnalysis";

export default function BatchManagement() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'list');

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
        <div className="mb-4">
          <h1 className="text-2xl font-bold mb-1">배치 관리</h1>
          <p className="text-muted-foreground text-sm">
            배치 목록, 생성 및 수익성 분석을 통합 관리합니다.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
            <TabsTrigger value="list">목록</TabsTrigger>
            <TabsTrigger value="create">생성</TabsTrigger>
            <TabsTrigger value="profitability">수익성</TabsTrigger>
            <TabsTrigger value="cost-analysis">원가 분석</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-4">
            <BatchList />
          </TabsContent>

          <TabsContent value="create" className="space-y-4">
            <BatchCreate embedded />
          </TabsContent>

          <TabsContent value="profitability" className="space-y-4">
            <BatchProfitabilityDashboard />
          </TabsContent>

          <TabsContent value="cost-analysis" className="space-y-4">
            <CostAnalysis />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
