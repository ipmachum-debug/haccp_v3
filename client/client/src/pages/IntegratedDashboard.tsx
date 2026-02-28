import { useState } from "react";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ProductionEfficiency from "./ProductionEfficiency";
import InventoryTrend from "./InventoryTrend";
import PurchaseProposalHistory from "./PurchaseProposalHistory";
import DashboardLayout from "@/components/DashboardLayout";

export default function IntegratedDashboard() {
  const [activeTab, setActiveTab] = useState("production");

  return (
    <DashboardLayout>
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">통합 대시보드</h1>
          <p className="text-muted-foreground mt-2">
            생산 효율성, 재고 추이, 발주 제안을 한눈에 확인하세요
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>대시보드 메뉴</CardTitle>
          <CardDescription>원하는 대시보드를 선택하여 데이터를 확인합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="production">생산 효율성</TabsTrigger>
              <TabsTrigger value="inventory">재고 추이</TabsTrigger>
              <TabsTrigger value="purchase">발주 제안 이력</TabsTrigger>
            </TabsList>
            <TabsContent value="production" className="mt-6">
              <ProductionEfficiency />
            </TabsContent>
            <TabsContent value="inventory" className="mt-6">
              <InventoryTrend />
            </TabsContent>
            <TabsContent value="purchase" className="mt-6">
              <PurchaseProposalHistory />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
