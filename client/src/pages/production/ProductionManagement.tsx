import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { TabsList } from "@/components/ui/tabs";
import { Package, BarChart3, DollarSign, TrendingUp, Tag } from "lucide-react";
import BatchList from "./BatchList";
import BatchCostAnalysisDashboard from "./BatchCostAnalysisDashboard";
import MaterialPriceManagement from "./MaterialPriceManagement";
import BatchProfitabilityDashboard from "./BatchProfitabilityDashboard";
import CostAnalysisDashboard from "./CostAnalysisDashboard";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

/**
 * 생산 기록·원가 (2026-10-20) — 지난 생산 기록(달력·목록)과 원가 분석.
 *   하루 생산 진행(예전 '파이프라인' 탭)은 생산 화면(/dashboard/production/today)의 하루 현황·줄마다 진행 표시로 옮겼다.
 */
export default function ProductionManagement() {
  const L = useIndustryLabel();
  // 선택한 탭은 URL(?tab=) — 생산 상세에서 돌아와도·새로고침해도 같은 탭 (2026-10-21)
  const [activeTab, setActiveTab] = useTabWithUrl("tab", "list", ["list", "cost-analysis", "batch-cost", "profitability", "material-price"]);

  return (
    <DashboardLayout>
      <div className="space-y-3">
        {/* 탭 네비게이션 - 에메랄드 테마 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
          <div className="rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 p-1 shadow-lg shadow-emerald-200/50">
            <TabsList className="grid w-full grid-cols-5 bg-transparent h-auto p-0 gap-1">
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
                <span className="hidden sm:inline">{`${L("batch")}비용분석`}</span>
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
              <TabsTrigger
                value="material-price"
                className="flex items-center gap-2 py-2.5 px-3 text-sm font-medium rounded-lg transition-all duration-200
                  text-emerald-100 hover:text-white hover:bg-white/10
                  data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-md"
              >
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">단가 관리</span>
                <span className="sm:hidden">단가</span>
              </TabsTrigger>
            </TabsList>
          </div>

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

          {/* 단가 관리 (2026-10-13) */}
          <TabsContent value="material-price" className="space-y-4 pt-4">
            <MaterialPriceManagement />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
