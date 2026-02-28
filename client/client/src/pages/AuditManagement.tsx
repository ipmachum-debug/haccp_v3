import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Search, CalendarCheck, Info } from "lucide-react";
import SupplierAudit from "@/pages/SupplierAudit";
import InternalAudit from "@/pages/InternalAudit";
import InternalAuditPlan from "@/pages/InternalAuditPlan";

export default function AuditManagement() {
  const [activeTab, setActiveTab] = useState("supplier-audit");

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-2xl font-bold">감사관리</h1>
          <p className="text-muted-foreground mt-1">
            거래처 감사, 내부 감사, 감사 계획을 통합 관리합니다. HACCP 인증 유지를 위한 체계적인 감사 활동을 수행하세요.
          </p>
        </div>

        {/* 안내 배너 */}
        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-amber-800 dark:text-amber-300">
            <strong>사용 가이드:</strong> 「거래처 감사」에서 공급업체 위생·품질 감사를, 「내부 감사」에서 자체 HACCP 이행 점검을, 「내부 감사 계획」에서 연간 감사 일정을 관리할 수 있습니다.
          </div>
        </div>

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-12">
            <TabsTrigger value="supplier-audit" className="flex items-center gap-2 text-sm">
              <Building2 className="h-4 w-4" />
              거래처 감사
            </TabsTrigger>
            <TabsTrigger value="internal-audit" className="flex items-center gap-2 text-sm">
              <Search className="h-4 w-4" />
              내부 감사
            </TabsTrigger>
            <TabsTrigger value="audit-plan" className="flex items-center gap-2 text-sm">
              <CalendarCheck className="h-4 w-4" />
              내부 감사 계획
            </TabsTrigger>
          </TabsList>

          <TabsContent value="supplier-audit" className="mt-4">
            <SupplierAudit embedded />
          </TabsContent>

          <TabsContent value="internal-audit" className="mt-4">
            <InternalAudit embedded />
          </TabsContent>

          <TabsContent value="audit-plan" className="mt-4">
            <InternalAuditPlan embedded />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
