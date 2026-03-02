import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { FileText, Activity, Calendar, Zap, TrendingUp, Package } from "lucide-react";
import { ProductionDailyReportContent } from "./ProductionDailyReport";
import ProductionStatus from "./ProductionStatus";
import ProductionSchedule from "./ProductionSchedule";
import ScheduleOptimization from "./ScheduleOptimization";
import CapacityAnalysis from "./CapacityAnalysis";
import ProductAnalysis from "./ProductAnalysis";

export default function ProductionOperations() {
  const [activeTab, setActiveTab] = useState("daily-logs");

  return (
    <DashboardLayout>
      <div className="container mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">생산운영</h1>
          <p className="text-muted-foreground mt-2">
            생산 일보, 현황, 일정 관리 및 분석
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="daily-logs" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              생산일보
            </TabsTrigger>
            <TabsTrigger value="status" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              생산현황
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              배치일정
            </TabsTrigger>
            <TabsTrigger value="optimize" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              일정최적화
            </TabsTrigger>
            <TabsTrigger value="capacity" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              생산능력분석
            </TabsTrigger>
            <TabsTrigger value="product" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              제품별분석
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily-logs">
            <ProductionDailyReportContent />
          </TabsContent>

          <TabsContent value="status">
            <ProductionStatus />
          </TabsContent>

          <TabsContent value="schedule">
            <ProductionSchedule />
          </TabsContent>

          <TabsContent value="optimize">
            <ScheduleOptimization />
          </TabsContent>

          <TabsContent value="capacity">
            <CapacityAnalysis />
          </TabsContent>

          <TabsContent value="product">
            <ProductAnalysis />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
