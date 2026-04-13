import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardCheck, Shield, Info } from "lucide-react";
import HaccpPlanVerification from "@/pages/haccp/HaccpPlanVerification";
import HazardAnalysis from "@/pages/haccp/HazardAnalysis";

export default function HaccpVerification() {
  const [activeTab, setActiveTab] = useState("plan-verification");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-2xl font-bold">HACCP 검증</h1>
          <p className="text-muted-foreground mt-1">
            HACCP 계획의 검증과 7원칙 기반 위해요소 분석을 통합 관리합니다. 체계적인 검증으로 식품 안전 시스템의 유효성을 확보하세요.
          </p>
        </div>

        {/* 안내 배너 */}
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-green-800 dark:text-green-300">
            <strong>사용 가이드:</strong> 「HACCP 계획 검증」에서 HACCP 계획의 적절성과 이행 상태를 검증하고, 「HACCP 7원칙」에서 위해요소 분석(HA), 중요관리점(CCP) 결정, 한계기준 설정 등 7원칙 기반 관리를 수행할 수 있습니다.
          </div>
        </div>

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="plan-verification" className="flex items-center gap-2 text-sm">
              <ClipboardCheck className="h-4 w-4" />
              HACCP 계획 검증
            </TabsTrigger>
            <TabsTrigger value="seven-principles" className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4" />
              HACCP 7원칙
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plan-verification" className="mt-4">
            <HaccpPlanVerification embedded />
          </TabsContent>

          <TabsContent value="seven-principles" className="mt-4">
            <HazardAnalysis embedded />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
