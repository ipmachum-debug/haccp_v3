import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsTrigger, TabsList } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, BarChart3, Download, Settings, Cpu } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CCPRecordsList } from "@/components/ccp/CCPRecordsList";
import CcpStats from "./CcpStats";
import CcpReportGenerator from "./CcpReportGenerator";
import CCPLimitsManagement from "./CCPLimitsManagement";
import DashboardLayout from "@/components/dashboard/DashboardLayout";

import { formatLocalDate } from "../../lib/dateUtils";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// 2026-04-20 분해: 폼 3개 + 헬퍼 2개 + 상수 2개를 _ccpMonitoring/ 으로 이동
import {
  ccpTypes, equipmentTypes,
  EquipmentFormDialog, EquipmentBasedCcpForm, EquipmentCcpSettingsForm,
} from "./_ccpMonitoring/Forms";

// CCP 타입별 설명/색상 (main 전용)
const ccpTypeDescriptions: Record<string, string> = {
  "CCP-1B": "가열/증숙",
  "CCP-2B": "가열 굽기",
  "CCP-3B": "가열/볶음",
  "CCP-4P": "금속검출",
};

const ccpTypeColors: Record<string, string> = {
  "CCP-1B": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  "CCP-2B": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  "CCP-3B": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  "CCP-4P": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
};

export default function CCPMonitoring() {
  const L = useIndustryLabel();
  const [activeTab, setActiveTab] = useState("records");
  const [selectedCcpType, setSelectedCcpType] = useState<"CCP-1B" | "CCP-2B" | "CCP-3B" | "CCP-4P">("CCP-1B");
  const [pdfPeriod, setPdfPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [reportCcpType, setReportCcpType] = useState("");

  const generateReportMutation = trpc.report.generateCcpReport.useMutation();
  const generatePdfMutation = trpc.ccpMonitoring.generateCcpPdf.useMutation();

  const handleGeneratePdf = async () => {
    try {
      const today = new Date();
      let startDate = new Date();
      let endDate = new Date();

      if (pdfPeriod === "daily") {
        startDate = today;
        endDate = today;
      } else if (pdfPeriod === "weekly") {
        startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (pdfPeriod === "monthly") {
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      }

      const result = await generatePdfMutation.mutateAsync({
        period: pdfPeriod,
        startDate,
        endDate,
        ccpType: selectedCcpType,
      });

      const link = document.createElement("a");
      link.href = `data:application/pdf;base64,${result.pdf}`;
      link.download = `CCP_모니터링_${pdfPeriod}_${selectedCcpType}_${formatLocalDate(today)}.pdf`;
      link.click();

      toast.success("PDF 보고서가 성공적으로 생성되었습니다.");
    } catch (error: any) {
      toast.error(error.message || "PDF 생성 중 오류가 발생했습니다.");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">CCP 모니터링</h1>
            <p className="text-muted-foreground text-sm">
              중요관리점(CCP) 모니터링 기록 및 관리
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pdfPeriod}
              onChange={(e) => setPdfPeriod(e.target.value as "daily" | "weekly" | "monthly")}
              className="border rounded-md px-3 py-2"
            >
              <option value="daily">일간</option>
              <option value="weekly">주간</option>
              <option value="monthly">월간</option>
            </select>
            <Button onClick={handleGeneratePdf} disabled={generatePdfMutation.isPending}>
              <Download className="h-4 w-4 mr-2" />
              PDF 출력
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="records" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              모니터링 기록
            </TabsTrigger>
            <TabsTrigger value="equipment" className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              설비기준
            </TabsTrigger>
            <TabsTrigger value="limits" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              공정그룹설정
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              통계
            </TabsTrigger>
            <TabsTrigger value="reports" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              보고서 생성
            </TabsTrigger>
          </TabsList>

          <TabsContent value="records" className="space-y-3">
            <CCPRecordsList />
          </TabsContent>

          <TabsContent value="equipment" className="space-y-3">
            <EquipmentBasedCcpForm />
          </TabsContent>

          <TabsContent value="limits" className="space-y-3">
            <CCPLimitsManagement />
          </TabsContent>

          <TabsContent value="stats" className="space-y-3">
            <CcpStats />
          </TabsContent>

          <TabsContent value="reports" className="space-y-3">
            <CcpReportGenerator />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
