import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { TabsList } from "@/components/ui/tabs";
import { Activity, Package, BarChart3, DollarSign, TrendingUp } from "lucide-react";
import BatchList from "./BatchList";
import BatchCostAnalysisDashboard from "./BatchCostAnalysisDashboard";
import BatchProfitabilityDashboard from "./BatchProfitabilityDashboard";
import CostAnalysisDashboard from "./CostAnalysisDashboard";
import { PipelineDashboardContent } from "./PipelineDashboard";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
export default function ProductionManagement() {
  const L = useIndustryLabel();
  const [activeTab, setActiveTab] = useState("pipeline");

  return (
    <DashboardLayout>
      <div className="space-y-3">
        {/* 탭 네비게이션 - 에메랄드 테마 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
          <div className="rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-1 shadow-lg shadow-emerald-200/50">
            <TabsList className="grid w-full grid-cols-5 bg-transparent h-auto p-0 gap-1">
              <TabsTrigger 
                value="pipeline" 
                className="flex items-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg transition-all duration-200
                  text-emerald-100 hover:text-white hover:bg-white/10
                  data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md"
              >
                <Activity className="h-4 w-4" />
                <span className="hidden sm:inline">파이프라인</span>
                <span className="sm:hidden">현황</span>
              </TabsTrigger>
              <TabsTrigger 
                value="list" 
                className="flex items-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg transition-all duration-200
                  text-emerald-100 hover:text-white hover:bg-white/10
                  data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md"
              >
                <Package className="h-4 w-4" />
                배치
              </TabsTrigger>
              <TabsTrigger 
                value="cost-analysis" 
                className="flex items-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg transition-all duration-200
                  text-emerald-100 hover:text-white hover:bg-white/10
                  data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md"
              >
                <BarChart3 className="h-4 w-4" />
                원가분석
              </TabsTrigger>
              <TabsTrigger 
                value="batch-cost" 
                className="flex items-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg transition-all duration-200
                  text-emerald-100 hover:text-white hover:bg-white/10
                  data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md"
              >
                <DollarSign className="h-4 w-4" />
                <span className="hidden sm:inline">배치비용분석</span>
                <span className="sm:hidden">비용</span>
              </TabsTrigger>
              <TabsTrigger 
                value="profitability" 
                className="flex items-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg transition-all duration-200
                  text-emerald-100 hover:text-white hover:bg-white/10
                  data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md"
              >
                <TrendingUp className="h-4 w-4" />
                <span className="hidden sm:inline">원가비교</span>
                <span className="sm:hidden">비교</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 파이프라인 현황판 - 에메랄드 테마 배경 */}
          <TabsContent value="pipeline" className="mt-4">
            <PipelineDashboardContent />
          </TabsContent>

          {/* 배치 목록 */}
          <TabsContent value="list" className="space-y-4 pt-4">
            <BatchList />
          </TabsContent>

          {/* 원가분석 */}
          <TabsContent value="cost-analysis" className="space-y-4 pt-4">
            <CostAnalysisDashboard />
          </TabsContent>

          {/* 배치비용분석 */}
          <TabsContent value="batch-cost" className="space-y-4 pt-4">
            <BatchCostAnalysisDashboard />
          </TabsContent>

          {/* 수익 */}
          <TabsContent value="profitability" className="space-y-4 pt-4">
            <BatchProfitabilityDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
