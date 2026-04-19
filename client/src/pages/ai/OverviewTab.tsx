import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Bell, CheckCircle, Loader2, PlayCircle, Shield,
  ChevronRight, Plus, Trash2, TrendingUp,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { SeverityBadge } from "./SeverityBadge";
import { formatDate } from "./types";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
// ============================================================================
// Tab 1: 대시보드 개요
// ============================================================================
export function OverviewTab() {
  const L = useIndustryLabel();
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
    <div className="space-y-2.5">
      {/* 규칙 평가 실행 버튼 */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">오늘의 현황</h2>
        <Button onClick={handleEvaluate} disabled={evaluateMutation.isPending} size="sm" className="h-7 text-xs px-2.5">
          {evaluateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5 mr-1" />}
          규칙 평가 실행
        </Button>
      </div>

      {/* 평가 결과 */}
      {evaluateMutation.data?.success && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-2.5 px-3">
            <div className="flex items-center gap-2 text-green-800 text-sm">
              <CheckCircle className="w-4 h-4" />
              <span className="font-medium">
                규칙 평가 완료: {evaluateMutation.data.totalTriggered}건 탐지,
                {evaluateMutation.data.savedAlerts}건 새 알림 저장
              </span>
            </div>
            {evaluateMutation.data.totalTriggered > 0 && (
              <div className="mt-1.5 flex gap-2 text-xs">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Card className={alerts.critical > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardContent className="py-2.5 px-3">
            <p className="text-xs text-muted-foreground mb-1">위험 경고</p>
            <div className="text-lg font-bold text-red-600">{alerts.critical}</div>
          </CardContent>
        </Card>
        <Card className={alerts.high > 0 ? "border-orange-300 bg-orange-50" : ""}>
          <CardContent className="py-2.5 px-3">
            <p className="text-xs text-muted-foreground mb-1">높은 경고</p>
            <div className="text-lg font-bold text-orange-600">{alerts.high}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <p className="text-xs text-muted-foreground mb-1">보통 경고</p>
            <div className="text-lg font-bold text-yellow-600">{alerts.medium}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2.5 px-3">
            <p className="text-xs text-muted-foreground mb-1">전체 활성 알림</p>
            <div className="text-lg font-bold">{alerts.total}</div>
          </CardContent>
        </Card>
      </div>

      {/* 최근 알림 */}
      <Card>
        <CardContent className="py-2.5 px-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <Bell className="w-4 h-4" /> 최근 알림
          </h3>
          {summary.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (data?.recentAlerts || []).length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <Shield className="w-10 h-10 mx-auto mb-1.5 opacity-30" />
              <p className="text-sm">활성 알림이 없습니다. "규칙 평가 실행"을 눌러 점검하세요.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {(data?.recentAlerts || []).map((alert: any) => (
                <div key={alert.id} className="flex items-center gap-2 p-2 rounded-md border hover:bg-muted/50 transition">
                  <SeverityBadge severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{alert.title}</p>
                    <p className="text-[11px] text-muted-foreground">{alert.entityType} | {formatDate(alert.createdAt)}</p>
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
        <CardContent className="flex items-center justify-center py-6">
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
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
      {/* 알림 발생 추이 */}
      {d.alerts.length > 0 && (
        <Card>
          <CardContent className="py-2.5 px-3">
            <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> 알림 발생 추이 (30일)
            </h4>
            <ResponsiveContainer width="100%" height={150}>
              <AreaChart data={d.alerts}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} width={24} />
                <Tooltip labelFormatter={(v: string) => v} contentStyle={{ fontSize: 11 }} />
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
          <CardContent className="py-2.5 px-3">
            <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
              <Shield className="w-3.5 h-3.5" /> CCP 모니터링 추이 (30일)
            </h4>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={d.ccp}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 9 }} allowDecimals={false} width={24} />
                <Tooltip labelFormatter={(v: string) => v} contentStyle={{ fontSize: 11 }} />
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
          <CardContent className="py-2.5 px-3">
            <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> 체크리스트 완료율 (30일)
            </h4>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={d.checklist}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} />
                <YAxis tick={{ fontSize: 9 }} domain={[0, 100]} unit="%" width={30} />
                <Tooltip labelFormatter={(v: string) => v} contentStyle={{ fontSize: 11 }} formatter={(v: number) => `${v}%`} />
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
      <CardContent className="py-2.5 px-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Shield className="w-4 h-4" /> 규칙 관리
          </h3>
          <div className="flex gap-1.5">
            <Button
              variant={tab === "system" ? "default" : "outline"}
              size="sm" className="h-6 text-xs px-2" onClick={() => setTab("system")}
            >
              시스템 ({sysRules.length})
            </Button>
            <Button
              variant={tab === "custom" ? "default" : "outline"}
              size="sm" className="h-6 text-xs px-2" onClick={() => setTab("custom")}
            >
              커스텀 ({custRules.length})
            </Button>
          </div>
        </div>
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
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
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
                  <div className="grid grid-cols-3 gap-2">
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
                  <div className="grid grid-cols-3 gap-2">
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
                          <SelectItem value="ne">다름 (!=)</SelectItem>
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
