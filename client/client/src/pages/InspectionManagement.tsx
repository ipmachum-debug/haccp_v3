import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import MaterialInspections from "./MaterialInspections";
import ShippingInspections from "./ShippingInspections";
import HygieneInspections from "./HygieneInspections";

export default function InspectionManagement() {
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'material');

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
          <h1 className="text-3xl font-bold mb-2">검사 관리</h1>
          <p className="text-muted-foreground">
            원재료, 출하, 위생 검사를 통합 관리합니다.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-[450px]">
            <TabsTrigger value="material">원재료</TabsTrigger>
            <TabsTrigger value="shipping">출하</TabsTrigger>
            <TabsTrigger value="hygiene">위생</TabsTrigger>
          </TabsList>

          <TabsContent value="material" className="space-y-4">
            <MaterialInspections />
          </TabsContent>

          <TabsContent value="shipping" className="space-y-4">
            <ShippingInspections />
          </TabsContent>

          <TabsContent value="hygiene" className="space-y-4">
            <HygieneInspections />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
