import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileWarning, RotateCcw, Info } from "lucide-react";
import NonconformingProduct from "@/pages/NonconformingProduct";
import RecallSimulation from "@/pages/RecallSimulation";

export default function NonconformingManagement() {
  const [activeTab, setActiveTab] = useState("nonconforming");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-2xl font-bold">부적합 제품 관리</h1>
          <p className="text-muted-foreground mt-1">
            부적합 제품 발생 시 처리 절차와 회수 시뮬레이션을 통합 관리합니다. 신속한 대응으로 식품 안전을 확보하세요.
          </p>
        </div>

        {/* 안내 배너 */}
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-red-800 dark:text-red-300">
            <strong>사용 가이드:</strong> 「부적합 제품 관리」에서 부적합 제품의 발생·처리·시정조치를, 「회수 시뮬레이션」에서 제품 회수 절차 모의훈련을 수행할 수 있습니다. 정기적인 회수 시뮬레이션은 HACCP 인증 유지의 필수 요건입니다.
          </div>
        </div>

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="nonconforming" className="flex items-center gap-2 text-sm">
              <FileWarning className="h-4 w-4" />
              부적합 제품 관리
            </TabsTrigger>
            <TabsTrigger value="recall-simulation" className="flex items-center gap-2 text-sm">
              <RotateCcw className="h-4 w-4" />
              회수 시뮬레이션
            </TabsTrigger>
          </TabsList>

          <TabsContent value="nonconforming" className="mt-4">
            <NonconformingProduct embedded />
          </TabsContent>

          <TabsContent value="recall-simulation" className="mt-4">
            <RecallSimulation embedded />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
