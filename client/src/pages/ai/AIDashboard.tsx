import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield, Sparkles, DollarSign, Database,
} from "lucide-react";
import {
  OverviewTab,
  AnomalyTab,
  PredictionTab,
  AlertsTab,
  StandardsTab,
  KnowledgeBaseTab,
  CorrectiveActionTab,
  AuditTab,
  SupplierRiskTab,
  TrainingTab,
  ReportsTab,
  ExpenseAnomalyTab,
  CashFlowTab,
  PaymentRiskTab,
  JournalValidationTab,
  InlineChatbot,
} from "./index";
import type { Section } from "./index";

// ============================================================================
// 섹션 정의
// ============================================================================
const SECTION_CONFIG: Record<Section, { label: string; icon: any; color: string; description: string }> = {
  haccp: { label: "HACCP AI", icon: Shield, color: "text-emerald-600 border-emerald-500 bg-emerald-50", description: "식품안전 AI 분석" },
  erp: { label: "ERP AI", icon: DollarSign, color: "text-blue-600 border-blue-500 bg-blue-50", description: "회계/재무 AI 분석" },
  manage: { label: "관리", icon: Database, color: "text-slate-600 border-slate-500 bg-slate-50", description: "규칙/지식 관리" },
};

const SECTION_TABS: Record<Section, Array<{ value: string; label: string }>> = {
  haccp: [
    { value: "overview", label: "대시보드" },
    { value: "anomaly", label: "이상탐지" },
    { value: "prediction", label: "예측분석" },
    { value: "corrective", label: "시정조치" },
    { value: "supplier", label: "공급업체 리스크" },
    { value: "training", label: "교육 추천" },
    { value: "audit", label: "감사 AI" },
  ],
  erp: [
    { value: "erp-expense", label: "비용 이상탐지" },
    { value: "erp-cashflow", label: "현금흐름 예측" },
    { value: "erp-payment", label: "AP/AR 리스크" },
    { value: "erp-journal", label: "분개 검증" },
  ],
  manage: [
    { value: "alerts", label: "알림 관리" },
    { value: "standards", label: "기준서 관리" },
    { value: "knowledge", label: "지식베이스" },
    { value: "reports", label: "AI 보고서" },
  ],
};

const DEFAULT_TABS: Record<Section, string> = {
  haccp: "overview",
  erp: "erp-expense",
  manage: "alerts",
};

const SECTION_GREETING: Record<Section, string> = {
  haccp: "하나 \u00b7 HACCP AI \u00b7 식품안전 점검과 품질관리를 도와드려요",
  erp: "하나 \u00b7 ERP AI \u00b7 회계와 경영 데이터를 분석해드려요",
  manage: "하나 \u00b7 무엇이든 물어보세요.",
};

// ============================================================================
// 메인 컴포넌트
// ============================================================================
export default function AIDashboard() {
  const [section, setSection] = useState<Section>("haccp");
  const [activeTab, setActiveTab] = useState("overview");
  const [chatExpanded, setChatExpanded] = useState(false);

  const handleSectionChange = (s: Section) => {
    setSection(s);
    setActiveTab(DEFAULT_TABS[s]);
  };

  return (
    <DashboardLayout>
      <div className="p-3 md:p-4 space-y-2.5">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-indigo-100 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight">AI 관제 센터</h1>
              <p className="text-[11px] text-muted-foreground">HACCP + ERP 통합 AI 분석</p>
            </div>
          </div>
        </div>

        {/* 섹션 선택 */}
        <div className="flex gap-1.5">
          {(Object.entries(SECTION_CONFIG) as [Section, typeof SECTION_CONFIG[Section]][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isActive = section === key;
            return (
              <button
                key={key}
                onClick={() => handleSectionChange(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border-2 transition-all text-xs font-medium ${
                  isActive
                    ? `${cfg.color} border-current shadow-sm`
                    : "border-transparent text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* AI 챗봇 하나 - 인라인 임베드 */}
        <InlineChatbot
          section={section}
          greeting={SECTION_GREETING[section]}
          expanded={chatExpanded}
          onToggle={() => setChatExpanded(!chatExpanded)}
        />

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-2.5">
          <TabsList className="flex flex-wrap gap-0.5 h-auto">
            {SECTION_TABS[section].map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="anomaly"><AnomalyTab /></TabsContent>
          <TabsContent value="prediction"><PredictionTab /></TabsContent>
          <TabsContent value="alerts"><AlertsTab /></TabsContent>
          <TabsContent value="standards"><StandardsTab /></TabsContent>
          <TabsContent value="knowledge"><KnowledgeBaseTab /></TabsContent>
          <TabsContent value="corrective"><CorrectiveActionTab /></TabsContent>
          <TabsContent value="audit"><AuditTab /></TabsContent>
          <TabsContent value="supplier"><SupplierRiskTab /></TabsContent>
          <TabsContent value="training"><TrainingTab /></TabsContent>
          <TabsContent value="reports"><ReportsTab /></TabsContent>
          <TabsContent value="erp-expense"><ExpenseAnomalyTab /></TabsContent>
          <TabsContent value="erp-cashflow"><CashFlowTab /></TabsContent>
          <TabsContent value="erp-payment"><PaymentRiskTab /></TabsContent>
          <TabsContent value="erp-journal"><JournalValidationTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
