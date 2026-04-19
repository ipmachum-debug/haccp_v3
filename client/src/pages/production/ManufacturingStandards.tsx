import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, FileCode, Info, Printer } from "lucide-react";
import MaterialLedger from "@/pages/accounting/MaterialLedger";
import MfReportList from "@/pages/production/MfReportList";
import MaterialUsageReportList from "@/pages/accounting/MaterialUsageReportList";

export default function ManufacturingStandards() {
  const [activeTab, setActiveTab] = useState("material-ledger");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-2xl font-bold">제조기준관리</h1>
          <p className="text-muted-foreground mt-1">
            원료수불부 · 주간/월간 수불 보고서 · 품목제조보고를 통합 관리합니다.
          </p>
        </div>

        {/* 안내 배너 */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800 dark:text-blue-300">
            <strong>사용 가이드:</strong> 「원료수불부」에서는 일일/월별 원재료 입출고를 관리하고,
            「수불 보고서」에서는 주간·월간 단위로 생산 실적과 원재료 사용 보고서를 자동 생성·검토·승인·인쇄할 수 있습니다.
            「품목제조보고」에서는 제품별 제조보고서를 작성·조회합니다.
          </div>
        </div>

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="material-ledger" className="flex items-center gap-2 text-sm">
              <ClipboardList className="h-4 w-4" />
              원료수불부
            </TabsTrigger>
            <TabsTrigger value="usage-reports" className="flex items-center gap-2 text-sm">
              <Printer className="h-4 w-4" />
              수불 보고서 (주간/월간)
            </TabsTrigger>
            <TabsTrigger value="mf-reports" className="flex items-center gap-2 text-sm">
              <FileCode className="h-4 w-4" />
              품목제조보고
            </TabsTrigger>
          </TabsList>

          <TabsContent value="material-ledger" className="mt-4">
            <MaterialLedger embedded />
          </TabsContent>

          <TabsContent value="usage-reports" className="mt-4">
            <MaterialUsageReportList embedded />
          </TabsContent>

          <TabsContent value="mf-reports" className="mt-4">
            <MfReportList embedded />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
