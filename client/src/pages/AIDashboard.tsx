import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertTriangle, Bell, CheckCircle, Clock, FileText, PlayCircle,
  RefreshCw, Shield, Upload, ChevronRight, Sparkles, Loader2,
  XCircle, Eye, FileCheck, BookOpen, Search, Trash2, RotateCcw,
  Database, Plus, Download, TrendingUp, Brain, DollarSign,
  AlertOctagon, BookCheck,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ============================================================================
// 타입
// ============================================================================
type AlertItem = {
  id: number;
  rule_code: string;
  title: string;
  message: string;
  severity: string;
  entity_type: string;
  entity_code?: string;
  status: string;
  created_at: string;
  contextData?: Record<string, any>;
};

type ParsedItem = {
  id: string;
  category: string;
  checkItem: string;
  standard: string;
  frequency: string;
  method?: string;
  responsibleRole?: string;
  itemType?: string;
  importance?: string;
  validationRules?: { min?: number | null; max?: number | null; options?: string[] | null };
};

// ============================================================================
// 헬퍼
// ============================================================================
const SEVERITY_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  critical: { color: "bg-red-100 text-red-800 border-red-200", icon: XCircle, label: "위험" },
  high: { color: "bg-orange-100 text-orange-800 border-orange-200", icon: AlertTriangle, label: "높음" },
  medium: { color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Bell, label: "보통" },
  low: { color: "bg-blue-100 text-blue-800 border-blue-200", icon: Eye, label: "낮음" },
};

const STANDARD_TYPE_LABELS: Record<string, string> = {
  haccp_plan: "HACCP 관리계획",
  prerequisite: "선행요건 (PRP)",
  operational_prp: "운영선행요건 (OPRP)",
  ccp_standard: "CCP 기준",
  sanitation: "위생관리기준",
  quality_standard: "품질기준",
  facility_standard: "시설기준",
  training_standard: "교육훈련기준",
  recall_plan: "리콜 계획",
  custom: "사용자 정의",
};

function SeverityBadge({ severity }: { severity: string }) {
  const config = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.color} text-xs font-medium gap-1`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

function formatDate(dateStr: string) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ============================================================================
// 메인 컴포넌트
// ============================================================================
export default function AIDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold">AI HACCP Assistant</h1>
            <p className="text-sm text-muted-foreground">규칙엔진 + AI 기반 식품안전 관리 시스템</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 w-full max-w-6xl h-auto">
            <TabsTrigger value="overview">대시보드</TabsTrigger>
            <TabsTrigger value="anomaly">이상탐지</TabsTrigger>
            <TabsTrigger value="prediction">예측분석</TabsTrigger>
            <TabsTrigger value="alerts">알림 관리</TabsTrigger>
            <TabsTrigger value="standards">기준서 관리</TabsTrigger>
            <TabsTrigger value="knowledge">지식베이스</TabsTrigger>
            <TabsTrigger value="corrective">시정조치 AI</TabsTrigger>
            <TabsTrigger value="audit">감사 AI</TabsTrigger>
            <TabsTrigger value="supplier">공급업체 리스크</TabsTrigger>
            <TabsTrigger value="training">교육 추천</TabsTrigger>
            <TabsTrigger value="reports">AI 보고서</TabsTrigger>
            <TabsTrigger value="chatbot">AI 챗봇</TabsTrigger>
            <TabsTrigger value="erp-expense" className="text-blue-600">비용 분석</TabsTrigger>
            <TabsTrigger value="erp-cashflow" className="text-blue-600">현금흐름</TabsTrigger>
            <TabsTrigger value="erp-payment" className="text-blue-600">AP/AR 리스크</TabsTrigger>
            <TabsTrigger value="erp-journal" className="text-blue-600">분개 검증</TabsTrigger>
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
          <TabsContent value="chatbot"><ChatbotTab /></TabsContent>
          <TabsContent value="erp-expense"><ExpenseAnomalyTab /></TabsContent>
          <TabsContent value="erp-cashflow"><CashFlowTab /></TabsContent>
          <TabsContent value="erp-payment"><PaymentRiskTab /></TabsContent>
          <TabsContent value="erp-journal"><JournalValidationTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

// ============================================================================
// Tab 1: 대시보드 개요
// ============================================================================
function OverviewTab() {
  const summary = trpc.ai.dashboardSummary.useQuery();
  const evaluateMutation = trpc.ai.evaluateRules.useMutation();
  const utils = trpc.useUtils();

  const handleEvaluate = async () => {
    await evaluateMutation.mutateAsync({});
    utils.ai.dashboardSummary.invalidate();
  };

  const data = summary.data;
  const alerts = data?.activeAlerts || { critical: 0, high: 0, medium: 0, low: 0, total: 0 };

  return (
    <div className="space-y-4">
      {/* 규칙 평가 실행 버튼 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">오늘의 현황</h2>
        <Button onClick={handleEvaluate} disabled={evaluateMutation.isPending} size="sm">
          {evaluateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          규칙 평가 실행
        </Button>
      </div>

      {/* 평가 결과 */}
      {evaluateMutation.data?.success && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-green-800">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">
                규칙 평가 완료: {evaluateMutation.data.totalTriggered}건 탐지,
                {evaluateMutation.data.savedAlerts}건 새 알림 저장
              </span>
            </div>
            {evaluateMutation.data.totalTriggered > 0 && (
              <div className="mt-2 flex gap-3 text-sm">
                {evaluateMutation.data.bySeverity.critical > 0 && (
                  <span className="text-red-600 font-medium">위험 {evaluateMutation.data.bySeverity.critical}</span>
                )}
                {evaluateMutation.data.bySeverity.high > 0 && (
                  <span className="text-orange-600 font-medium">높음 {evaluateMutation.data.bySeverity.high}</span>
                )}
                {evaluateMutation.data.bySeverity.medium > 0 && (
                  <span className="text-yellow-600 font-medium">보통 {evaluateMutation.data.bySeverity.medium}</span>
                )}
                {evaluateMutation.data.bySeverity.low > 0 && (
                  <span className="text-blue-600 font-medium">낮음 {evaluateMutation.data.bySeverity.low}</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className={alerts.critical > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">위험 경고</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{alerts.critical}</div>
          </CardContent>
        </Card>
        <Card className={alerts.high > 0 ? "border-orange-300 bg-orange-50" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">높은 경고</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{alerts.high}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">보통 경고</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{alerts.medium}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">전체 활성 알림</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{alerts.total}</div>
          </CardContent>
        </Card>
      </div>

      {/* 최근 알림 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="w-5 h-5" /> 최근 알림
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (data?.recentAlerts || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>활성 알림이 없습니다. "규칙 평가 실행"을 눌러 점검하세요.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(data?.recentAlerts || []).map((alert: any) => (
                <div key={alert.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition">
                  <SeverityBadge severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{alert.title}</p>
                    <p className="text-xs text-muted-foreground">{alert.entityType} | {formatDate(alert.createdAt)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* P9-7: 30일 트렌드 차트 */}
      <TrendCharts />

      {/* 시스템 규칙 목록 */}
      <SystemRulesCard />
    </div>
  );
}

// ============================================================================
// P9-7: 트렌드 차트 컴포넌트
// ============================================================================
function TrendCharts() {
  const trend = trpc.ai.trendData.useQuery({ days: 30 });
  const d = trend.data;

  if (trend.isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">트렌드 로딩 중...</span>
        </CardContent>
      </Card>
    );
  }

  if (!d || (d.alerts.length === 0 && d.ccp.length === 0 && d.checklist.length === 0)) {
    return null; // 데이터 없으면 숨김
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* 알림 발생 추이 */}
      {d.alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> 알림 발생 추이 (30일)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={d.alerts}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip labelFormatter={(v: string) => v} contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="critical" stackId="1" fill="#ef4444" stroke="#ef4444" name="위험" />
                <Area type="monotone" dataKey="high" stackId="1" fill="#f97316" stroke="#f97316" name="높음" />
                <Area type="monotone" dataKey="other" stackId="1" fill="#eab308" stroke="#eab308" name="기타" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* CCP 적합/부적합 추이 */}
      {d.ccp.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" /> CCP 모니터링 추이 (30일)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={d.ccp}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip labelFormatter={(v: string) => v} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="pass" fill="#22c55e" name="적합" stackId="a" />
                <Bar dataKey="fail" fill="#ef4444" name="부적합" stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 체크리스트 완료율 추이 */}
      {d.checklist.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> 체크리스트 완료율 (30일)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={d.checklist}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" />
                <Tooltip labelFormatter={(v: string) => v} contentStyle={{ fontSize: 12 }} formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} dot={false} name="완료율" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const RULE_TYPES = [
  { value: "threshold", label: "임계값" },
  { value: "missing", label: "누락 탐지" },
  { value: "overdue", label: "기한 초과" },
  { value: "anomaly", label: "이상 패턴" },
  { value: "recurrence", label: "반복 탐지" },
];

const ENTITY_TYPES = [
  { value: "ccp", label: "CCP" },
  { value: "checklist", label: "체크리스트" },
  { value: "equipment", label: "설비" },
  { value: "batch", label: "배치" },
  { value: "lot", label: "LOT" },
  { value: "inspection", label: "검사" },
  { value: "hygiene", label: "위생" },
  { value: "calibration", label: "검교정" },
  { value: "document", label: "문서" },
  { value: "training", label: "교육" },
];

function SystemRulesCard() {
  const systemRules = trpc.ai.listSystemRules.useQuery();
  const customRules = trpc.ai.listCustomRules.useQuery();
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState<"system" | "custom">("system");

  // 새 규칙 생성 폼
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState("threshold");
  const [entityType, setEntityType] = useState("ccp");
  const [severity, setSeverity] = useState("medium");
  const [condField, setCondField] = useState("");
  const [condOperator, setCondOperator] = useState("gt");
  const [condValue, setCondValue] = useState("");

  const createMutation = trpc.ai.createCustomRule.useMutation();
  const updateMutation = trpc.ai.updateCustomRule.useMutation();
  const deleteMutation = trpc.ai.deleteCustomRule.useMutation();
  const utils = trpc.useUtils();

  const handleCreate = async () => {
    if (!code.trim() || !name.trim()) return;
    const result = await createMutation.mutateAsync({
      code: code.toUpperCase().replace(/\s+/g, "_"),
      name,
      ruleType: ruleType as any,
      entityType: entityType as any,
      severity: severity as any,
      conditions: {
        field: condField || undefined,
        operator: condOperator,
        value: condValue ? parseFloat(condValue) || condValue : undefined,
      },
    });
    if (result.success) {
      setShowAdd(false);
      setCode(""); setName(""); setCondField(""); setCondValue("");
      utils.ai.listCustomRules.invalidate();
    }
  };

  const handleToggle = async (ruleId: number, isActive: boolean) => {
    await updateMutation.mutateAsync({ ruleId, isActive: !isActive });
    utils.ai.listCustomRules.invalidate();
  };

  const handleDelete = async (ruleId: number) => {
    if (!confirm("이 규칙을 삭제하시겠습니까?")) return;
    await deleteMutation.mutateAsync({ ruleId });
    utils.ai.listCustomRules.invalidate();
  };

  const sysRules = systemRules.data?.rules || [];
  const custRules = (customRules.data?.rules || []) as any[];
  const displaySysRules = expanded ? sysRules : sysRules.slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5" /> 규칙 관리
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant={tab === "system" ? "default" : "outline"}
              size="sm" onClick={() => setTab("system")}
            >
              시스템 ({sysRules.length})
            </Button>
            <Button
              variant={tab === "custom" ? "default" : "outline"}
              size="sm" onClick={() => setTab("custom")}
            >
              커스텀 ({custRules.length})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {tab === "system" ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">규칙 코드</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead className="w-[80px]">유형</TableHead>
                  <TableHead className="w-[80px]">대상</TableHead>
                  <TableHead className="w-[80px]">심각도</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displaySysRules.map((rule: any) => (
                  <TableRow key={rule.code}>
                    <TableCell className="font-mono text-xs">{rule.code}</TableCell>
                    <TableCell className="text-sm">{rule.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{rule.ruleType}</Badge></TableCell>
                    <TableCell className="text-xs">{rule.entityType}</TableCell>
                    <TableCell><SeverityBadge severity={rule.severity} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {sysRules.length > 5 && (
              <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setExpanded(!expanded)}>
                {expanded ? "접기" : `나머지 ${sysRules.length - 5}개 더보기`}
              </Button>
            )}
          </>
        ) : (
          <>
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1" /> 커스텀 규칙 추가
              </Button>
            </div>

            {custRules.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Shield className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">커스텀 규칙이 없습니다. 우리 회사만의 규칙을 추가하세요.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">코드</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead className="w-[80px]">유형</TableHead>
                    <TableHead className="w-[80px]">심각도</TableHead>
                    <TableHead className="w-[60px]">활성</TableHead>
                    <TableHead className="w-[80px]">작업</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {custRules.map((rule: any) => (
                    <TableRow key={rule.id} className={rule.isActive ? "" : "opacity-50"}>
                      <TableCell className="font-mono text-xs">{rule.code}</TableCell>
                      <TableCell className="text-sm">{rule.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{rule.ruleType}</Badge></TableCell>
                      <TableCell><SeverityBadge severity={rule.severity} /></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs"
                          onClick={() => handleToggle(rule.id, !!rule.isActive)}>
                          {rule.isActive ? "ON" : "OFF"}
                        </Button>
                      </TableCell>
                      <TableCell>
                        {!rule.isSystem && (
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                            onClick={() => handleDelete(rule.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {/* 새 규칙 생성 다이얼로그 */}
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>커스텀 규칙 추가</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>규칙 코드</Label>
                      <Input value={code} onChange={e => setCode(e.target.value)}
                        placeholder="CUSTOM_RULE_01" className="font-mono text-sm" />
                    </div>
                    <div>
                      <Label>규칙 이름</Label>
                      <Input value={name} onChange={e => setName(e.target.value)}
                        placeholder="냉장고 온도 15°C 초과" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>규칙 유형</Label>
                      <Select value={ruleType} onValueChange={setRuleType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {RULE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>대상 엔티티</Label>
                      <Select value={entityType} onValueChange={setEntityType}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ENTITY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>심각도</Label>
                      <Select value={severity} onValueChange={setSeverity}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">낮음</SelectItem>
                          <SelectItem value="medium">보통</SelectItem>
                          <SelectItem value="high">높음</SelectItem>
                          <SelectItem value="critical">위험</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>조건 필드</Label>
                      <Input value={condField} onChange={e => setCondField(e.target.value)}
                        placeholder="temperature" />
                    </div>
                    <div>
                      <Label>연산자</Label>
                      <Select value={condOperator} onValueChange={setCondOperator}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="gt">초과 (&gt;)</SelectItem>
                          <SelectItem value="lt">미만 (&lt;)</SelectItem>
                          <SelectItem value="eq">같음 (=)</SelectItem>
                          <SelectItem value="ne">다름 (≠)</SelectItem>
                          <SelectItem value="missing">누락</SelectItem>
                          <SelectItem value="overdue">기한초과</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>기준값</Label>
                      <Input value={condValue} onChange={e => setCondValue(e.target.value)}
                        placeholder="15" />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowAdd(false)}>취소</Button>
                  <Button onClick={handleCreate} disabled={createMutation.isPending || !code.trim() || !name.trim()}>
                    {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                    규칙 추가
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Tab 2: 알림 관리
// ============================================================================
function AlertsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const alerts = trpc.ai.listAlerts.useQuery({
    status: statusFilter as any || undefined,
    severity: (severityFilter === "all" ? undefined : severityFilter) as any,
    limit: 100,
  });

  const updateMutation = trpc.ai.updateAlert.useMutation();
  const utils = trpc.useUtils();

  const handleUpdateStatus = async (alertId: number, status: "acknowledged" | "resolved" | "dismissed") => {
    await updateMutation.mutateAsync({ alertId, status });
    utils.ai.listAlerts.invalidate();
    utils.ai.dashboardSummary.invalidate();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="상태 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">활성</SelectItem>
            <SelectItem value="acknowledged">확인됨</SelectItem>
            <SelectItem value="resolved">해결됨</SelectItem>
            <SelectItem value="dismissed">무시됨</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="심각도 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="critical">위험</SelectItem>
            <SelectItem value="high">높음</SelectItem>
            <SelectItem value="medium">보통</SelectItem>
            <SelectItem value="low">낮음</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-sm text-muted-foreground">총 {alerts.data?.total || 0}건</span>
          <CsvExportButton statusFilter={statusFilter} severityFilter={severityFilter} />
        </div>
      </div>

      {alerts.isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (alerts.data?.alerts || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p>해당 조건의 알림이 없습니다.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {(alerts.data?.alerts || []).map((alert: AlertItem) => (
            <Card key={alert.id} className="hover:shadow-sm transition">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  <SeverityBadge severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{alert.entity_type}</span>
                      {alert.entity_code && <span>| {alert.entity_code}</span>}
                      <span>| {formatDate(alert.created_at)}</span>
                    </div>
                  </div>
                  {alert.status === "active" && (
                    <div className="flex gap-1 shrink-0">
                      <Button variant="outline" size="sm" className="text-xs h-7"
                        onClick={() => handleUpdateStatus(alert.id, "acknowledged")}>
                        확인
                      </Button>
                      <Button variant="outline" size="sm" className="text-xs h-7 text-green-600"
                        onClick={() => handleUpdateStatus(alert.id, "resolved")}>
                        해결
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground"
                        onClick={() => handleUpdateStatus(alert.id, "dismissed")}>
                        무시
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Tab 3: 기준서 관리 (기준서 → 체크리스트 자동생성)
// ============================================================================
function StandardsTab() {
  const [showUpload, setShowUpload] = useState(false);
  const [name, setName] = useState("");
  const [standardType, setStandardType] = useState("sanitation");
  const [content, setContent] = useState("");
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [currentStandardId, setCurrentStandardId] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const standards = trpc.ai.listStandards.useQuery();
  const uploadMutation = trpc.ai.uploadStandard.useMutation();
  const createMutation = trpc.ai.createChecklistFromStandard.useMutation();
  const utils = trpc.useUtils();

  const handleUploadAndParse = async () => {
    if (!name.trim() || !content.trim()) return;
    const result = await uploadMutation.mutateAsync({
      name, standardType: standardType as any, content,
    });
    if (result.success) {
      setParsedItems(result.parsedItems as ParsedItem[]);
      setCurrentStandardId(result.standardId);
      setShowUpload(false);
      setShowPreview(true);
    }
  };

  const handleCreateTemplate = async () => {
    if (!currentStandardId || parsedItems.length === 0) return;
    const result = await createMutation.mutateAsync({
      standardId: currentStandardId,
      templateName: `${name} 체크리스트`,
      category: "QUALITY",
      items: parsedItems,
    });
    if (result.success) {
      setShowPreview(false);
      setParsedItems([]);
      setName("");
      setContent("");
      utils.ai.listStandards.invalidate();
    }
  };

  const removeItem = (id: string) => {
    setParsedItems(prev => prev.filter(item => item.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">기준서 → 체크리스트 자동생성</h2>
        <Button onClick={() => setShowUpload(true)} size="sm">
          <Upload className="w-4 h-4 mr-2" /> 기준서 업로드
        </Button>
      </div>

      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="pt-4">
          <p className="text-sm text-indigo-800">
            <strong>사용법:</strong> HACCP 기준서(관리기준, 위생관리기준 등)를 붙여넣으면 AI가 자동으로 점검항목을 추출하여
            체크리스트 템플릿을 생성합니다. 회사마다 기준이 비슷하므로 기준서만 주면 바로 쓸 수 있는 체크리스트가 나옵니다.
          </p>
        </CardContent>
      </Card>

      {/* 기준서 업로드 다이얼로그 */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>기준서 업로드</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>기준서 이름</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 위생관리기준서 v2.0" />
            </div>
            <div>
              <Label>기준서 유형</Label>
              <Select value={standardType} onValueChange={setStandardType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STANDARD_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>기준서 내용 (붙여넣기)</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="기준서 전체 내용을 붙여넣으세요. AI가 자동으로 점검항목을 추출합니다."
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">{content.length}/50,000자</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>취소</Button>
            <Button onClick={handleUploadAndParse} disabled={uploadMutation.isPending || !name.trim() || !content.trim()}>
              {uploadMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
              AI 분석 시작
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 파싱 결과 미리보기 및 편집 */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>AI 추출 결과 - {parsedItems.length}개 항목</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            AI가 기준서에서 추출한 점검항목입니다. 불필요한 항목은 삭제하고, 확인 후 체크리스트를 생성하세요.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">#</TableHead>
                <TableHead className="w-[100px]">분류</TableHead>
                <TableHead>점검항목</TableHead>
                <TableHead className="w-[150px]">기준</TableHead>
                <TableHead className="w-[80px]">주기</TableHead>
                <TableHead className="w-[80px]">유형</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsedItems.map((item, idx) => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{idx + 1}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{item.category}</Badge></TableCell>
                  <TableCell className="text-sm">{item.checkItem}</TableCell>
                  <TableCell className="text-xs">{item.standard}</TableCell>
                  <TableCell className="text-xs">{item.frequency}</TableCell>
                  <TableCell className="text-xs">{item.itemType}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                      onClick={() => removeItem(item.id)}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreview(false)}>취소</Button>
            <Button onClick={handleCreateTemplate} disabled={createMutation.isPending || parsedItems.length === 0}>
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileCheck className="w-4 h-4 mr-2" />}
              체크리스트 템플릿 생성 ({parsedItems.length}개 항목)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 기존 기준서 목록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">등록된 기준서</CardTitle>
        </CardHeader>
        <CardContent>
          {standards.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (standards.data?.standards || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>등록된 기준서가 없습니다. 위 "기준서 업로드" 버튼으로 시작하세요.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead className="w-[150px]">유형</TableHead>
                  <TableHead className="w-[100px]">상태</TableHead>
                  <TableHead className="w-[80px]">항목 수</TableHead>
                  <TableHead className="w-[120px]">등록일</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(standards.data?.standards || []).map((std: any) => (
                  <TableRow key={std.id}>
                    <TableCell className="font-medium">{std.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{STANDARD_TYPE_LABELS[std.standard_type] || std.standard_type}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={std.status === "applied" ? "default" : "outline"} className="text-xs">
                        {std.status === "uploaded" ? "업로드" : std.status === "parsed" ? "파싱완료" : std.status === "reviewed" ? "검토완료" : "적용됨"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{std.item_count || "-"}</TableCell>
                    <TableCell className="text-xs">{formatDate(std.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Tab 4: 시정조치 AI
// ============================================================================
function CorrectiveActionTab() {
  const [deviationType, setDeviationType] = useState("CCP 온도 이탈");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [batchCode, setBatchCode] = useState("");
  const [actualValue, setActualValue] = useState("");
  const [standardValue, setStandardValue] = useState("");
  const [draft, setDraft] = useState<Record<string, string> | null>(null);

  const mutation = trpc.ai.generateCorrectiveAction.useMutation();

  const handleGenerate = async () => {
    if (!description.trim()) return;
    const result = await mutation.mutateAsync({
      type: deviationType,
      description,
      location: location || undefined,
      batchCode: batchCode || undefined,
      actualValue: actualValue || undefined,
      standardValue: standardValue || undefined,
    });
    if (result.success) {
      setDraft(result.draft as Record<string, string>);
    }
  };

  const FIELD_LABELS: Record<string, string> = {
    immediateAction: "즉시 조치사항",
    rootCauseAnalysis: "근본원인 분석",
    rootCauseCategory: "원인 분류",
    correctiveAction: "시정조치 내용",
    preventiveAction: "재발방지 대책",
    verificationMethod: "효과 검증 방법",
    timeline: "조치 기한",
    responsiblePerson: "담당부서/담당자",
    additionalNotes: "기타 참고사항",
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-5 h-5" /> 시정조치서 AI 초안 생성
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>이탈/부적합 유형</Label>
              <Select value={deviationType} onValueChange={setDeviationType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CCP 온도 이탈">CCP 온도 이탈</SelectItem>
                  <SelectItem value="CCP 시간 이탈">CCP 시간 이탈</SelectItem>
                  <SelectItem value="CCP 압력 이탈">CCP 압력 이탈</SelectItem>
                  <SelectItem value="금속검출 부적합">금속검출 부적합</SelectItem>
                  <SelectItem value="위생점검 불량">위생점검 불량</SelectItem>
                  <SelectItem value="원재료 검사 부적합">원재료 검사 부적합</SelectItem>
                  <SelectItem value="출하검사 부적합">출하검사 부적합</SelectItem>
                  <SelectItem value="보관온도 이상">보관온도 이상</SelectItem>
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>발생 장소</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="예: 가열실, 냉각실, 포장실" />
            </div>
          </div>
          <div>
            <Label>상세 설명</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="이탈/부적합의 상세 내용을 입력하세요. 예: 증숙 공정에서 중심온도 78°C로 한계기준(85°C) 미달..."
              className="min-h-[100px]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>관련 배치코드</Label>
              <Input value={batchCode} onChange={(e) => setBatchCode(e.target.value)} placeholder="예: B-2026-0316-001" />
            </div>
            <div>
              <Label>실측값</Label>
              <Input value={actualValue} onChange={(e) => setActualValue(e.target.value)} placeholder="예: 78°C" />
            </div>
            <div>
              <Label>기준값</Label>
              <Input value={standardValue} onChange={(e) => setStandardValue(e.target.value)} placeholder="예: 85°C 이상" />
            </div>
          </div>
          <Button onClick={handleGenerate} disabled={mutation.isPending || !description.trim()}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            시정조치서 초안 생성
          </Button>
        </CardContent>
      </Card>

      {/* 생성된 초안 */}
      {draft && (
        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-green-800">
              <CheckCircle className="w-5 h-5" /> AI 생성 시정조치서 초안
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(draft)
                .filter(([key]) => FIELD_LABELS[key])
                .map(([key, value]) => (
                  <div key={key} className="border-b pb-2">
                    <Label className="text-xs text-muted-foreground">{FIELD_LABELS[key]}</Label>
                    <p className="text-sm mt-1">{value}</p>
                  </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4 border-t pt-2">
              * 이 내용은 AI가 생성한 초안입니다. 반드시 담당자가 검토 후 수정/확정하세요.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Tab 4: 지식베이스 (RAG) 관리
// ============================================================================

const DOC_TYPE_LABELS: Record<string, string> = {
  regulation: "법규/규정",
  standard: "기준서/표준",
  sop: "표준작업절차서",
  manual: "매뉴얼/지침서",
  guideline: "가이드라인",
  training: "교육 자료",
  template: "양식/서식",
  faq: "FAQ/Q&A",
  internal: "사내 문서",
  custom: "기타",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  uploaded: { label: "업로드", color: "bg-gray-100 text-gray-600" },
  chunking: { label: "분할중", color: "bg-blue-100 text-blue-600" },
  embedding: { label: "임베딩중", color: "bg-purple-100 text-purple-600" },
  ready: { label: "준비완료", color: "bg-green-100 text-green-600" },
  error: { label: "오류", color: "bg-red-100 text-red-600" },
};

function KnowledgeBaseTab() {
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [docType, setDocType] = useState<string>("regulation");
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");

  const stats = trpc.ai.kbStats.useQuery();
  const documents = trpc.ai.kbListDocuments.useQuery({
    docType: (docTypeFilter === "all" ? undefined : docTypeFilter) as any,
    limit: 50,
  });
  const uploadMutation = trpc.ai.kbUploadDocument.useMutation();
  const deleteMutation = trpc.ai.kbDeleteDocument.useMutation();
  const reindexMutation = trpc.ai.kbReindexDocument.useMutation();
  const searchMutation = trpc.ai.kbSearch.useMutation();
  const utils = trpc.useUtils();

  const handleUpload = async () => {
    if (!title.trim() || !content.trim()) return;
    const result = await uploadMutation.mutateAsync({
      title,
      description: description || undefined,
      docType: docType as any,
      content,
    });
    if (result.success) {
      setShowUpload(false);
      setTitle(""); setDescription(""); setContent("");
      utils.ai.kbListDocuments.invalidate();
      utils.ai.kbStats.invalidate();
    }
  };

  const handleDelete = async (documentId: number) => {
    if (!confirm("이 문서를 삭제하시겠습니까?")) return;
    await deleteMutation.mutateAsync({ documentId });
    utils.ai.kbListDocuments.invalidate();
    utils.ai.kbStats.invalidate();
  };

  const handleReindex = async (documentId: number) => {
    await reindexMutation.mutateAsync({ documentId });
    utils.ai.kbListDocuments.invalidate();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    const result = await searchMutation.mutateAsync({
      query: searchQuery,
      topK: 5,
    });
    if (result.success) {
      setSearchResults(result.results);
    }
  };

  const kbStats = stats.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5" /> 지식베이스 (RAG)
        </h2>
        <Button onClick={() => setShowUpload(true)} size="sm">
          <Upload className="w-4 h-4 mr-2" /> 문서 등록
        </Button>
      </div>

      <Card className="bg-indigo-50 border-indigo-200">
        <CardContent className="pt-4">
          <p className="text-sm text-indigo-800">
            <strong>AI 지식베이스:</strong> HACCP 관련 법규, 기준서, SOP, 매뉴얼 등을 등록하면
            AI가 자동으로 문서를 분석하고 벡터 인덱스를 생성합니다.
            챗봇 "하나"가 질문에 답변할 때 등록된 문서를 참고하여 더 정확한 답변을 제공합니다.
          </p>
        </CardContent>
      </Card>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-4 h-4 text-indigo-500" />
              <span className="text-xs text-muted-foreground">등록 문서</span>
            </div>
            <div className="text-2xl font-bold">{kbStats?.totalDocuments || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">검색 가능</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{kbStats?.readyDocuments || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">총 청크</span>
            </div>
            <div className="text-2xl font-bold">{kbStats?.totalChunks || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">총 토큰</span>
            </div>
            <div className="text-2xl font-bold">{(kbStats?.totalTokens || 0).toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      {/* 시맨틱 검색 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-5 h-5" /> 지식베이스 검색
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="HACCP 관련 질문을 입력하세요. 예: CCP 온도 관리 기준은?"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={searchMutation.isPending || !searchQuery.trim()}>
              {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>

          {searchResults && (
            <div className="space-y-2 mt-3">
              {searchResults.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">관련 문서를 찾을 수 없습니다.</p>
              ) : (
                searchResults.map((r: any, idx: number) => (
                  <div key={r.chunkId} className="border rounded-lg p-3 hover:bg-muted/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs">{DOC_TYPE_LABELS[r.docType] || r.docType}</Badge>
                      <span className="text-sm font-medium">{r.documentTitle}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        유사도: {Math.round(r.score * 100)}%
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-3">{r.content}</p>
                    {r.metadata?.section && (
                      <p className="text-xs text-indigo-600 mt-1">섹션: {r.metadata.section}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 문서 업로드 다이얼로그 */}
      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>지식베이스 문서 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>문서 제목</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 식품위생법 시행규칙 제36조" />
            </div>
            <div>
              <Label>설명 (선택)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="문서에 대한 간단한 설명" />
            </div>
            <div>
              <Label>문서 유형</Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>문서 내용</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="문서 전체 내용을 붙여넣으세요. AI가 자동으로 청크 분할 + 벡터 임베딩을 생성합니다."
                className="min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">{content.length}자 입력</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>취소</Button>
            <Button onClick={handleUpload} disabled={uploadMutation.isPending || !title.trim() || !content.trim()}>
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  문서 분석 중...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  등록 및 인덱싱
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 문서 목록 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">등록된 문서</CardTitle>
            <Select value={docTypeFilter} onValueChange={(v) => { setDocTypeFilter(v === "all" ? "all" : v); }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="유형 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {Object.entries(DOC_TYPE_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {documents.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : (documents.data?.documents || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>등록된 문서가 없습니다. "문서 등록"으로 HACCP 관련 문서를 추가하세요.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead className="w-[120px]">유형</TableHead>
                  <TableHead className="w-[80px]">상태</TableHead>
                  <TableHead className="w-[60px]">청크</TableHead>
                  <TableHead className="w-[80px]">토큰</TableHead>
                  <TableHead className="w-[100px]">등록일</TableHead>
                  <TableHead className="w-[100px]">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(documents.data?.documents || []).map((doc: any) => {
                  const statusConfig = STATUS_LABELS[doc.status] || STATUS_LABELS.uploaded;
                  return (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{doc.title}</p>
                          {doc.description && <p className="text-xs text-muted-foreground truncate max-w-[300px]">{doc.description}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {DOC_TYPE_LABELS[doc.docType] || doc.docType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs ${statusConfig.color}`}>
                          {statusConfig.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">{doc.chunkCount}</TableCell>
                      <TableCell className="text-sm">{doc.totalTokens?.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{formatDate(doc.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                            title="재인덱싱"
                            onClick={() => handleReindex(doc.id)}
                            disabled={reindexMutation.isPending}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                            title="삭제"
                            onClick={() => handleDelete(doc.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Tab 6: 감사 자료 자동 묶기
// ============================================================================
function AuditTab() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const [startDate, setStartDate] = useState(`${year}-${month}-01`);
  const [endDate, setEndDate] = useState(`${year}-${month}-${String(now.getDate()).padStart(2, "0")}`);
  const [enabled, setEnabled] = useState(false);

  const auditDocs = trpc.ai.gatherAuditDocs.useQuery(
    { startDate, endDate },
    { enabled }
  );

  const handleGather = () => setEnabled(true);

  const summary = auditDocs.data?.summary as any;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-5 h-5" /> 감사/점검 대응 자료 현황
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            HACCP 인증 심사 또는 내부 점검 시 필요한 기록 현황을 기간별로 확인합니다.
          </p>
          <div className="flex items-end gap-3">
            <div>
              <Label>시작일</Label>
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setEnabled(false); }} />
            </div>
            <div>
              <Label>종료일</Label>
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setEnabled(false); }} />
            </div>
            <Button onClick={handleGather} disabled={auditDocs.isLoading}>
              {auditDocs.isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              현황 조회
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <AuditCard title="체크리스트" total={summary.checklists?.cnt || 0} detail={`완료 ${summary.checklists?.completed || 0}건`} icon={<CheckCircle className="w-5 h-5 text-green-600" />} />
          <AuditCard title="CCP 모니터링" total={summary.ccpMonitoring?.cnt || 0} detail={`승인 ${summary.ccpMonitoring?.approved || 0}건`} icon={<Shield className="w-5 h-5 text-blue-600" />} />
          <AuditCard title="시정조치" total={summary.correctiveActions?.cnt || 0} detail={`해결 ${summary.correctiveActions?.resolved || 0}건`} icon={<AlertTriangle className="w-5 h-5 text-orange-600" />} />
          <AuditCard title="검교정" total={summary.calibrations?.cnt || 0} detail="실시 기록" icon={<Clock className="w-5 h-5 text-purple-600" />} />
          <AuditCard title="위생점검" total={summary.hygieneInspections?.cnt || 0} detail="실시 기록" icon={<Shield className="w-5 h-5 text-teal-600" />} />
          <AuditCard title="교육훈련" total={summary.trainings?.cnt || 0} detail="실시 기록" icon={<FileText className="w-5 h-5 text-indigo-600" />} />
          <AuditCard title="수입검사" total={summary.inspections?.material || 0} detail="실시 기록" icon={<Eye className="w-5 h-5 text-yellow-600" />} />
          <AuditCard title="출하검사" total={summary.inspections?.shipping || 0} detail="실시 기록" icon={<FileCheck className="w-5 h-5 text-red-600" />} />
        </div>
      )}
    </div>
  );
}

function AuditCard({ title, total, detail, icon }: { title: string; total: number; detail: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="text-2xl font-bold">{total}건</div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// P8-2: 이상탐지 탭
// ============================================================================
function AnomalyTab() {
  const anomalyQuery = trpc.ai.detectAnomalies.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = anomalyQuery.data;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-500" />
          AI 이상 패턴 탐지
        </h2>
        <Button variant="outline" size="sm" onClick={() => anomalyQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> 재분석
        </Button>
      </div>

      {anomalyQuery.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />데이터 분석 중...</div>}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4 text-center">
              <div className="text-3xl font-bold">{data.totalAnomalies}</div>
              <p className="text-sm text-muted-foreground">총 이상 감지</p>
            </CardContent></Card>
            <Card className={data.criticalCount > 0 ? "border-red-300 bg-red-50" : ""}>
              <CardContent className="pt-4 text-center">
                <div className="text-3xl font-bold text-red-600">{data.criticalCount}</div>
                <p className="text-sm text-muted-foreground">위험 등급</p>
              </CardContent>
            </Card>
          </div>

          {data.aiSummary && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4" /> AI 종합 분석</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{data.aiSummary}</p></CardContent>
            </Card>
          )}

          {data.anomalies.map((anomaly: any, i: number) => (
            <Card key={i} className={anomaly.severity === "critical" ? "border-red-300" : anomaly.severity === "high" ? "border-orange-300" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={anomaly.severity} />
                    <span className="font-medium">{anomaly.title}</span>
                  </div>
                  {anomaly.zScore && <span className="text-xs text-muted-foreground">Z-score: {anomaly.zScore}</span>}
                </div>
                <p className="text-sm text-muted-foreground mb-2">{anomaly.description}</p>
                {anomaly.possibleCauses && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">가능한 원인:</span> {anomaly.possibleCauses.join(", ")}
                  </div>
                )}
                {anomaly.recommendedActions && (
                  <div className="text-xs text-blue-600 mt-1">
                    <span className="font-medium">권장 조치:</span> {anomaly.recommendedActions.join(", ")}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {data.totalAnomalies === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              이상 패턴이 감지되지 않았습니다
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// P8-3: 예측분석 탭
// ============================================================================
function PredictionTab() {
  const predQuery = trpc.ai.getPredictions.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = predQuery.data;

  const RISK_COLORS: Record<string, string> = {
    critical: "border-red-300 bg-red-50",
    high: "border-orange-300 bg-orange-50",
    medium: "border-yellow-300 bg-yellow-50",
    low: "border-green-300 bg-green-50",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ChevronRight className="w-5 h-5 text-blue-500" />
          AI 예측 분석
        </h2>
        <Button variant="outline" size="sm" onClick={() => predQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> 재분석
        </Button>
      </div>

      {predQuery.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />예측 분석 중...</div>}

      {data && (
        <>
          {data.aiNarrative && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4" /> AI 전망</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{data.aiNarrative}</p></CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.predictions.map((pred: any, i: number) => (
              <Card key={i} className={RISK_COLORS[pred.riskLevel] || ""}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-medium text-sm">{pred.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {pred.trend === "up" ? "↑" : pred.trend === "down" ? "↓" : "→"} {pred.timeframe}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">{pred.description}</p>
                  <div className="flex items-center gap-4 text-xs">
                    <span>신뢰도: <strong>{pred.confidence}</strong></span>
                    <SeverityBadge severity={pred.riskLevel} />
                  </div>
                  {pred.recommendations.length > 0 && (
                    <div className="mt-2 text-xs text-blue-600">
                      {pred.recommendations.map((r: string, j: number) => <div key={j}>- {r}</div>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {data.predictions.length === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              현재 주의가 필요한 예측이 없습니다
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// P8-7: 공급업체 리스크 탭
// ============================================================================
function SupplierRiskTab() {
  const riskQuery = trpc.ai.analyzeSupplierRisk.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = riskQuery.data;

  const RISK_BG: Record<string, string> = {
    critical: "bg-red-100", high: "bg-orange-100", medium: "bg-yellow-50", low: "",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-500" />
          공급업체 리스크 분석
        </h2>
        <Button variant="outline" size="sm" onClick={() => riskQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> 재분석
        </Button>
      </div>

      {riskQuery.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />공급업체 분석 중...</div>}

      {data && (
        <>
          {data.aiSummary && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4" /> AI 종합 분석</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{data.aiSummary}</p></CardContent>
            </Card>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>공급업체</TableHead>
                <TableHead className="text-center">리스크점수</TableHead>
                <TableHead className="text-center">납품지연</TableHead>
                <TableHead className="text-center">불합격률</TableHead>
                <TableHead className="text-center">가격변동</TableHead>
                <TableHead className="text-center">거래건수</TableHead>
                <TableHead>주요 우려</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.suppliers.map((s: any) => (
                <TableRow key={s.partnerId} className={RISK_BG[s.riskLevel] || ""}>
                  <TableCell className="font-medium">{s.partnerName}</TableCell>
                  <TableCell className="text-center">
                    <SeverityBadge severity={s.riskLevel} /> <span className="ml-1">{s.overallScore}</span>
                  </TableCell>
                  <TableCell className="text-center">{s.metrics.deliveryDelayRate}%</TableCell>
                  <TableCell className="text-center">{s.metrics.qualityRejectRate}%</TableCell>
                  <TableCell className="text-center">{s.metrics.priceVolatility}%</TableCell>
                  <TableCell className="text-center">{s.metrics.transactionCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                    {s.concerns.join("; ") || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.suppliers.length === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">분석 가능한 공급업체가 없습니다</CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// P8-8: 교육 추천 탭
// ============================================================================
function TrainingTab() {
  const trainQuery = trpc.ai.getTrainingRecommendations.useQuery(undefined, { refetchOnWindowFocus: false });
  const data = trainQuery.data;

  const PRIORITY_COLORS: Record<string, string> = {
    urgent: "bg-red-100 text-red-800 border-red-300",
    high: "bg-orange-100 text-orange-800 border-orange-300",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
    low: "bg-blue-100 text-blue-800 border-blue-300",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-green-600" />
          AI 교육 추천
        </h2>
        <Button variant="outline" size="sm" onClick={() => trainQuery.refetch()}>
          <RefreshCw className="w-4 h-4 mr-1" /> 재분석
        </Button>
      </div>

      {trainQuery.isLoading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />교육 필요도 분석 중...</div>}

      {data && (
        <>
          {data.overallAssessment && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Brain className="w-4 h-4" /> AI 종합 평가</CardTitle></CardHeader>
              <CardContent><p className="text-sm whitespace-pre-wrap">{data.overallAssessment}</p></CardContent>
            </Card>
          )}

          {data.scheduleSuggestion.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">추천 교육 일정 (4주)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>주차</TableHead>
                      <TableHead>교육명</TableHead>
                      <TableHead>대상</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.scheduleSuggestion.map((s: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell>{s.week}주차</TableCell>
                        <TableCell>{s.training}</TableCell>
                        <TableCell>{s.target}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {data.recommendations.map((rec: any, i: number) => (
            <Card key={i} className={rec.priority === "urgent" ? "border-red-300" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-medium">{rec.title}</span>
                  <Badge variant="outline" className={PRIORITY_COLORS[rec.priority] || ""}>
                    {rec.priority === "urgent" ? "긴급" : rec.priority === "high" ? "높음" : rec.priority === "medium" ? "보통" : "낮음"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-2">{rec.description}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><strong>대상:</strong> {rec.targetAudience.join(", ")}</div>
                  <div><strong>소요시간:</strong> {rec.suggestedDuration}</div>
                  <div><strong>근거:</strong> {rec.reason}</div>
                  <div><strong>관련 건수:</strong> {rec.relatedIncidents}건</div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <strong>핵심 주제:</strong> {rec.keyTopics.join(" / ")}
                </div>
              </CardContent>
            </Card>
          ))}

          {data.recommendations.length === 0 && (
            <Card><CardContent className="pt-6 text-center text-muted-foreground">
              <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
              현재 추가 교육이 필요한 항목이 없습니다
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// P8-5: AI 보고서 탭
// ============================================================================
function ReportsTab() {
  const [reportType, setReportType] = useState<string>("executive");
  const execMutation = trpc.ai.generateExecutiveSummary.useMutation();
  const haccpMutation = trpc.ai.generateHaccpNarrative.useMutation();
  const financialMutation = trpc.ai.generateFinancialNarrative.useMutation();

  const isLoading = execMutation.isPending || haccpMutation.isPending || financialMutation.isPending;
  const currentData = reportType === "executive" ? execMutation.data
    : reportType === "haccp" ? haccpMutation.data
    : financialMutation.data;

  const handleGenerate = () => {
    if (reportType === "executive") execMutation.mutate({});
    else if (reportType === "haccp") haccpMutation.mutate({});
    else {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const end = now.toISOString().split("T")[0];
      financialMutation.mutate({ startDate: start, endDate: end });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-teal-600" />
          AI 보고서 생성
        </h2>
        <div className="flex items-center gap-2">
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="executive">경영진 요약</SelectItem>
              <SelectItem value="haccp">HACCP 주간보고</SelectItem>
              <SelectItem value="financial">재무 월간보고</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleGenerate} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Brain className="w-4 h-4 mr-1" />}
            보고서 생성
          </Button>
        </div>
      </div>

      {currentData && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{(currentData as any).title}</CardTitle>
              <p className="text-xs text-muted-foreground">기간: {(currentData as any).period} | 생성: {(currentData as any).generatedAt?.split("T")[0]}</p>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">{(currentData as any).narrative}</div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(currentData as any).highlights?.length > 0 && (
              <Card className="border-green-200 bg-green-50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-green-700">긍정적 지표</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {(currentData as any).highlights.map((h: string, i: number) => <div key={i} className="mb-1">+ {h}</div>)}
                </CardContent>
              </Card>
            )}
            {(currentData as any).concerns?.length > 0 && (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-orange-700">우려 사항</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {(currentData as any).concerns.map((c: string, i: number) => <div key={i} className="mb-1">! {c}</div>)}
                </CardContent>
              </Card>
            )}
            {(currentData as any).recommendations?.length > 0 && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">권장 사항</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {(currentData as any).recommendations.map((r: string, i: number) => <div key={i} className="mb-1">* {r}</div>)}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {!currentData && !isLoading && (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">
          보고서 유형을 선택하고 "보고서 생성" 버튼을 클릭하세요
        </CardContent></Card>
      )}
    </div>
  );
}

// ============================================================================
// P9-8: AI 챗봇 탭
// ============================================================================
function ChatbotTab() {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const chatMutation = trpc.ai.chat.useMutation();

  const handleSend = async () => {
    const text = message.trim();
    if (!text || chatMutation.isPending) return;
    setMessage("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);

    try {
      const result = await chatMutation.mutateAsync({
        message: text,
        conversationId,
      });
      if (result.conversationId) setConversationId(result.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response || "응답을 생성하지 못했습니다." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "오류가 발생했습니다. 다시 시도해주세요." },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600" />
          AI 어시스턴트 "하나"
        </h2>
        <Button variant="outline" size="sm" onClick={handleNewChat}>
          <RefreshCw className="w-4 h-4 mr-1" /> 새 대화
        </Button>
      </div>

      {/* 메시지 영역 */}
      <Card className="min-h-[400px] max-h-[600px] flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">안녕하세요! HACCP-ONE AI 어시스턴트 "하나"입니다.</p>
              <p className="text-sm mt-1">식품안전, CCP, 재고, 회계 등 무엇이든 물어보세요.</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {["오늘 위험한 항목이 있어?", "체크리스트 진행 현황", "이번주 CCP 요약", "감사 준비 상태"].map((q) => (
                  <Button key={q} variant="outline" size="sm" className="text-xs"
                    onClick={() => { setMessage(q); }}>
                    {q}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "bg-muted"
              }`}>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}
          {chatMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-muted-foreground">하나가 생각하는 중...</span>
              </div>
            </div>
          )}
        </CardContent>

        {/* 입력 영역 */}
        <div className="border-t p-3 flex gap-2">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요... (Enter로 전송, Shift+Enter로 줄바꿈)"
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button onClick={handleSend} disabled={!message.trim() || chatMutation.isPending} className="shrink-0">
            전송
          </Button>
        </div>
      </Card>
    </div>
  );
}

// ============================================================================
// P9-9: CSV 내보내기 버튼
// ============================================================================
function CsvExportButton({ statusFilter, severityFilter }: { statusFilter: string; severityFilter: string }) {
  const exportMutation = trpc.ai.exportAlertsCsv.useMutation();

  const handleExport = async () => {
    const result = await exportMutation.mutateAsync({
      status: statusFilter as any,
      severity: severityFilter === "all" ? undefined : severityFilter as any,
    });
    // CSV 다운로드
    const blob = new Blob(["\uFEFF" + result.csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-alerts-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exportMutation.isPending}>
      {exportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      <span className="ml-1 hidden sm:inline">CSV</span>
    </Button>
  );
}

// ============================================================================
// ERP AI Tab 1: 비용 이상탐지
// ============================================================================
function ExpenseAnomalyTab() {
  const data = trpc.ai.detectExpenseAnomalies.useQuery();
  const report = data.data;

  const sevColor: Record<string, string> = {
    critical: "text-red-600 bg-red-50 border-red-200",
    high: "text-orange-600 bg-orange-50 border-orange-200",
    medium: "text-yellow-600 bg-yellow-50 border-yellow-200",
    low: "text-blue-600 bg-blue-50 border-blue-200",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <AlertOctagon className="w-5 h-5 text-red-500" /> 비용 이상탐지
      </h2>

      {data.isLoading ? (
        <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
      ) : !report || report.anomalies.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-50" />
          <p>비용 이상 항목이 없습니다.</p>
        </CardContent></Card>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-red-200 bg-red-50"><CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-red-600">{report.criticalCount}</div>
              <div className="text-xs text-muted-foreground">위험</div>
            </CardContent></Card>
            <Card className="border-orange-200 bg-orange-50"><CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold text-orange-600">{report.highCount}</div>
              <div className="text-xs text-muted-foreground">높음</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <div className="text-2xl font-bold">{report.anomalies.length}</div>
              <div className="text-xs text-muted-foreground">전체</div>
            </CardContent></Card>
          </div>

          <div className="space-y-2">
            {report.anomalies.map((a: any, i: number) => (
              <Card key={i} className={`border ${sevColor[a.severity] || ""}`}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Badge variant="outline" className={sevColor[a.severity]}>{a.severity}</Badge>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{a.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{a.description}</p>
                      {a.recommendations?.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {a.recommendations.map((r: string, j: number) => <span key={j} className="mr-2">• {r}</span>)}
                        </div>
                      )}
                    </div>
                    {a.amount && <span className="text-sm font-mono font-medium shrink-0">{Number(a.amount).toLocaleString()}원</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// ERP AI Tab 2: 현금흐름 예측
// ============================================================================
function CashFlowTab() {
  const data = trpc.ai.forecastCashFlow.useQuery({ days: 30 });
  const forecast = data.data;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-green-600" /> 현금흐름 30일 예측
      </h2>

      {data.isLoading ? (
        <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
      ) : !forecast ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">데이터 없음</CardContent></Card>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">현재 잔고</div>
              <div className="text-xl font-bold">{forecast.currentBalance.toLocaleString()}원</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">30일 후 예상</div>
              <div className={`text-xl font-bold ${forecast.summary.endingBalance < 0 ? "text-red-600" : ""}`}>
                {forecast.summary.endingBalance.toLocaleString()}원
              </div>
            </CardContent></Card>
            <Card className={forecast.summary.dangerDays > 0 ? "border-red-300 bg-red-50" : ""}>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">위험일</div>
                <div className="text-xl font-bold text-red-600">{forecast.summary.dangerDays}일</div>
              </CardContent></Card>
            <Card><CardContent className="pt-4">
              <div className="text-xs text-muted-foreground">최저 잔고일</div>
              <div className="text-sm font-medium">{forecast.summary.lowestDate}</div>
              <div className="text-xs">{forecast.summary.lowestBalance.toLocaleString()}원</div>
            </CardContent></Card>
          </div>

          {/* 차트 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">일별 캐시 포지션</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={forecast.dailyForecast}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${(v / 10000).toFixed(0)}만`} />
                  <Tooltip labelFormatter={(v: string) => v} formatter={(v: number) => `${v.toLocaleString()}원`} contentStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="closingBalance" fill="#3b82f6" stroke="#3b82f6" fillOpacity={0.2} name="잔고" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* AP/AR 흐름 */}
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="pt-4 text-center">
              <div className="text-xs text-muted-foreground">AP 지출 예정</div>
              <div className="text-lg font-bold text-red-600">{forecast.summary.totalApOutflow.toLocaleString()}원</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <div className="text-xs text-muted-foreground">AR 회수 예상</div>
              <div className="text-lg font-bold text-green-600">{forecast.summary.totalArInflow.toLocaleString()}원</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <div className="text-xs text-muted-foreground">운영비 합계</div>
              <div className="text-lg font-bold">{forecast.summary.totalOperating.toLocaleString()}원</div>
            </CardContent></Card>
          </div>

          {/* 권고사항 */}
          {forecast.recommendations.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">AI 권고사항</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {forecast.recommendations.map((r: string, i: number) => <div key={i} className="mb-1">• {r}</div>)}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// ERP AI Tab 3: AP/AR 연체 리스크
// ============================================================================
function PaymentRiskTab() {
  const data = trpc.ai.analyzePaymentRisk.useQuery();
  const report = data.data;

  const riskColor: Record<string, string> = {
    critical: "text-red-600",
    high: "text-orange-600",
    medium: "text-yellow-600",
    low: "text-green-600",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-orange-500" /> AP/AR 연체 리스크 분석
      </h2>

      {data.isLoading ? (
        <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
      ) : !report ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">데이터 없음</CardContent></Card>
      ) : (
        <>
          {/* Aging 요약 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-red-600">AP (미지급금) Aging</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">구간</TableHead><TableHead className="text-xs text-right">금액</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell className="text-xs">정상</TableCell><TableCell className="text-xs text-right">{report.apSummary.current.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-yellow-600">30일</TableCell><TableCell className="text-xs text-right">{report.apSummary.days30.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-orange-600">60일</TableCell><TableCell className="text-xs text-right">{report.apSummary.days60.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-red-600">90일+</TableCell><TableCell className="text-xs text-right">{(report.apSummary.days90 + report.apSummary.days120plus).toLocaleString()}</TableCell></TableRow>
                    <TableRow className="font-bold"><TableCell className="text-xs">합계</TableCell><TableCell className="text-xs text-right">{report.apSummary.total.toLocaleString()}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-600">AR (미수금) Aging</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">구간</TableHead><TableHead className="text-xs text-right">금액</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    <TableRow><TableCell className="text-xs">정상</TableCell><TableCell className="text-xs text-right">{report.arSummary.current.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-yellow-600">30일</TableCell><TableCell className="text-xs text-right">{report.arSummary.days30.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-orange-600">60일</TableCell><TableCell className="text-xs text-right">{report.arSummary.days60.toLocaleString()}</TableCell></TableRow>
                    <TableRow><TableCell className="text-xs text-red-600">90일+</TableCell><TableCell className="text-xs text-right">{(report.arSummary.days90 + report.arSummary.days120plus).toLocaleString()}</TableCell></TableRow>
                    <TableRow className="font-bold"><TableCell className="text-xs">합계</TableCell><TableCell className="text-xs text-right">{report.arSummary.total.toLocaleString()}</TableCell></TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* 거래처별 리스크 */}
          {report.apProfiles.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">AP 거래처별 리스크 (상위)</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-xs">거래처</TableHead>
                    <TableHead className="text-xs text-right">미지급액</TableHead>
                    <TableHead className="text-xs text-right">최장 연체</TableHead>
                    <TableHead className="text-xs text-right">기한준수</TableHead>
                    <TableHead className="text-xs text-center">리스크</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {report.apProfiles.slice(0, 10).map((p: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{p.partnerName}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{p.totalOutstanding.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">{p.oldestOverdueDays > 0 ? `${p.oldestOverdueDays}일` : "-"}</TableCell>
                        <TableCell className="text-xs text-right">{p.onTimeRate}%</TableCell>
                        <TableCell className="text-xs text-center">
                          <Badge variant="outline" className={riskColor[p.riskLevel]}>{p.riskScore}점</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* AI 분석 + 권고 */}
          {report.aiAnalysis && (
            <Card className="border-indigo-200 bg-indigo-50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-indigo-700 flex items-center gap-2"><Brain className="w-4 h-4" /> AI 종합 분석</CardTitle></CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">{report.aiAnalysis}</CardContent>
            </Card>
          )}
          {report.recommendations.length > 0 && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-blue-700">권고사항</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {report.recommendations.map((r: string, i: number) => <div key={i} className="mb-1">• {r}</div>)}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// ERP AI Tab 4: 분개 검증
// ============================================================================
function JournalValidationTab() {
  const data = trpc.ai.validateJournals.useQuery({});
  const report = data.data;

  const typeLabel: Record<string, string> = {
    imbalance: "대차 불균형",
    unusual_pair: "비정상 계정조합",
    round_number: "라운드 넘버",
    off_hours: "비업무시간",
    sequence_gap: "번호 누락",
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <BookCheck className="w-5 h-5 text-indigo-600" /> 분개 검증 AI
      </h2>

      {data.isLoading ? (
        <Card><CardContent className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
      ) : !report ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">데이터 없음</CardContent></Card>
      ) : (
        <>
          {/* 요약 */}
          <div className="grid grid-cols-4 gap-3">
            <Card><CardContent className="pt-4 text-center">
              <div className="text-xs text-muted-foreground">검증 기간</div>
              <div className="text-sm font-medium">{report.period}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <div className="text-xs text-muted-foreground">총 분개</div>
              <div className="text-xl font-bold">{report.stats.totalEntries}건</div>
            </CardContent></Card>
            <Card className={report.stats.criticalCount > 0 ? "border-red-300 bg-red-50" : ""}>
              <CardContent className="pt-4 text-center">
                <div className="text-xs text-muted-foreground">위험 이슈</div>
                <div className="text-xl font-bold text-red-600">{report.stats.criticalCount}</div>
              </CardContent></Card>
            <Card><CardContent className="pt-4 text-center">
              <div className="text-xs text-muted-foreground">전체 이슈</div>
              <div className="text-xl font-bold">{report.stats.issueCount}</div>
            </CardContent></Card>
          </div>

          {report.issues.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              <CheckCircle className="w-10 h-10 mx-auto mb-2 text-green-500" />
              <p>분개 이상 항목이 발견되지 않았습니다.</p>
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {report.issues.map((issue: any, i: number) => (
                <Card key={i} className={issue.severity === "critical" ? "border-red-200" : issue.severity === "high" ? "border-orange-200" : ""}>
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <Badge variant="outline" className="shrink-0">{typeLabel[issue.type] || issue.type}</Badge>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{issue.title}</p>
                        <p className="text-sm text-muted-foreground mt-1">{issue.description}</p>
                      </div>
                      <SeverityBadge severity={issue.severity} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
