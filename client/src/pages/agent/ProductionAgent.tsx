/**
 * 생산 자동화 에이전트 (시크릿 페이지)
 * /dashboard/agent — 메뉴에 표시되지 않음
 *
 * 자연어로 생산 데이터를 입력하면 배치, CCP, 체크리스트를 자동 생성
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Bot, Send, CheckCircle2, AlertCircle, Package, ClipboardCheck,
  ShieldCheck, Loader2, Play, Eye, RotateCcw, Sparkles
} from "lucide-react";

interface PlanItem {
  status: "ready" | "error";
  productId?: number;
  productName: string;
  quantity: number;
  unit?: string;
  bomInfo?: { batchKg: number; batchCount: number };
  ccpCount?: number;
  checklistCount?: number;
  startTime?: string;
  error?: string;
}

interface PreviewResult {
  workDate: string;
  startTime: string;
  plans: PlanItem[];
}

interface ExecuteResult {
  status: "success" | "error";
  productId: number;
  batchId?: number;
  batchCode?: string;
  quantity?: number;
  ccpRecords?: number;
  checklists?: number;
  error?: string;
}

export default function ProductionAgent() {
  const [text, setText] = useState("");
  const [workDate, setWorkDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [executeResults, setExecuteResults] = useState<ExecuteResult[] | null>(null);

  const previewMutation = trpc.autoAgent.preview.useMutation({
    onSuccess: (data: any) => {
      setPreview(data);
      setExecuteResults(null);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const { data: siteInfo } = trpc.autoAgent.getSiteId.useQuery();

  const bulkCreateMutation = trpc.batch.bulkCreateForDay.useMutation({
    onSuccess: (data: any) => {
      const results: ExecuteResult[] = (data.created || []).map((b: any) => ({
        status: "success" as const,
        productId: b.productId,
        batchId: b.batchId,
        batchCode: b.batchCode,
        quantity: b.plannedQuantity,
        ccpRecords: b.ccpRecordsCreated || 0,
        checklists: b.checklistsCreated || 0,
      }));
      setExecuteResults(results);
      toast.success(`${results.length}건 배치 생성 완료!`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const executeMutation = { isPending: bulkCreateMutation.isPending };

  const handlePreview = () => {
    if (!text.trim()) { toast.error("생산 내용을 입력해주세요"); return; }
    previewMutation.mutate({ text, workDate, startTime });
  };

  const handleExecute = () => {
    if (!preview) return;
    const items = preview.plans
      .filter((p) => p.status === "ready" && p.productId)
      .map((p) => ({
        productId: p.productId!,
        plannedQuantityKg: p.quantity,
        startTime: p.startTime,
      }));
    if (!items.length) { toast.error("실행 가능한 항목이 없습니다"); return; }
    bulkCreateMutation.mutate({
      siteId: siteInfo?.siteId || 1,
      workDate: preview.workDate,
      dayStartTime: startTime,
      items,
    });
  };

  const handleReset = () => {
    setText("");
    setPreview(null);
    setExecuteResults(null);
  };

  const readyCount = preview?.plans.filter((p) => p.status === "ready").length || 0;
  const errorCount = preview?.plans.filter((p) => p.status === "error").length || 0;
  const isLoading = previewMutation.isPending || executeMutation.isPending;

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">생산 자동화 에이전트</h1>
            <p className="text-sm text-muted-foreground">자연어로 입력하면 배치·CCP·체크리스트를 자동 생성합니다</p>
          </div>
        </div>

        {/* 입력 영역 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              생산 내용 입력
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={"예시:\n초코크림 케이크 3,200kg\n딸기 타르트 1,500kg\n바닐라 쿠키 2,000kg"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="resize-none text-sm"
              disabled={isLoading}
            />
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">날짜</label>
                <Input
                  type="date"
                  value={workDate}
                  onChange={(e) => setWorkDate(e.target.value)}
                  className="h-8 text-xs w-36"
                  disabled={isLoading}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground whitespace-nowrap">시작</label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-8 text-xs w-28"
                  disabled={isLoading}
                />
              </div>
              <div className="ml-auto flex gap-2">
                {preview && (
                  <Button variant="outline" size="sm" onClick={handleReset} disabled={isLoading}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1" /> 초기화
                  </Button>
                )}
                <Button size="sm" onClick={handlePreview} disabled={isLoading || !text.trim()}>
                  {previewMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <Eye className="w-3.5 h-3.5 mr-1" />
                  )}
                  검증
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 검증 결과 (미리보기) */}
        {preview && !executeResults && (
          <Card className="border-violet-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4 text-violet-500" />
                  실행 계획 미리보기
                </CardTitle>
                <div className="flex gap-1.5">
                  {readyCount > 0 && <Badge className="bg-emerald-100 text-emerald-700 text-xs">{readyCount}건 준비</Badge>}
                  {errorCount > 0 && <Badge variant="destructive" className="text-xs">{errorCount}건 오류</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-xs text-muted-foreground mb-2">
                작업일: {preview.workDate} · 시작: {preview.startTime}
              </div>

              {preview.plans.map((plan, i) => (
                <div key={i} className={`rounded-lg border p-3 ${
                  plan.status === "error" ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/30"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {plan.status === "ready" ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="font-semibold text-sm">{plan.productName}</span>
                    </div>
                    <span className="text-sm font-bold">{plan.quantity?.toLocaleString()} {plan.unit || "kg"}</span>
                  </div>

                  {plan.status === "error" ? (
                    <p className="text-xs text-red-600">{plan.error}</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Package className="w-3 h-3" />
                        {plan.bomInfo ? `${plan.bomInfo.batchCount}배치 (${plan.bomInfo.batchKg}kg/배치)` : "1배치"}
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <ShieldCheck className="w-3 h-3" />
                        CCP {plan.ccpCount || 0}건
                      </div>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <ClipboardCheck className="w-3 h-3" />
                        체크리스트 {plan.checklistCount || 0}건
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {readyCount > 0 && (
                <Button
                  className="w-full bg-gradient-to-r from-violet-500 to-indigo-600 hover:from-violet-600 hover:to-indigo-700"
                  onClick={handleExecute}
                  disabled={executeMutation.isPending}
                >
                  {executeMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> 생성 중...</>
                  ) : (
                    <><Play className="w-4 h-4 mr-2" /> {readyCount}건 실행</>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* 실행 결과 */}
        {executeResults && (
          <Card className="border-emerald-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                실행 완료
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {executeResults.map((r, i) => (
                <div key={i} className={`rounded-lg border p-3 ${
                  r.status === "error" ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/30"
                }`}>
                  {r.status === "success" ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium">{r.batchCode}</span>
                        <span className="text-xs text-muted-foreground">{r.quantity?.toLocaleString()} kg</span>
                      </div>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        <span>CCP {r.ccpRecords}건</span>
                        <span>체크리스트 {r.checklists}건</span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500" />
                      <span className="text-sm text-red-600">{r.error}</span>
                    </div>
                  )}
                </div>
              ))}

              <Button variant="outline" className="w-full mt-3" onClick={handleReset}>
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> 새로운 입력
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 사용 가이드 */}
        {!preview && !executeResults && (
          <Card className="bg-muted/30">
            <CardContent className="pt-4">
              <p className="text-xs font-semibold text-muted-foreground mb-2">입력 예시</p>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p className="cursor-pointer hover:text-foreground" onClick={() => setText("초코크림 케이크 3,200kg")}>
                  "초코크림 케이크 3,200kg"
                </p>
                <p className="cursor-pointer hover:text-foreground" onClick={() => setText("딸기 타르트 1,500kg\n바닐라 쿠키 2,000kg\n초코크림 케이크 3,200kg")}>
                  "딸기 타르트 1,500kg, 바닐라 쿠키 2,000kg, 초코크림 케이크 3,200kg"
                </p>
                <p className="cursor-pointer hover:text-foreground" onClick={() => setText("오늘 생산: 앙버터 500kg, 크림빵 800kg, 시작 07:30")}>
                  "오늘 생산: 앙버터 500kg, 크림빵 800kg, 시작 07:30"
                </p>
              </div>
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-semibold text-muted-foreground mb-1">자동 생성 항목</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <span>- 배치 (레시피 기반 원료 투입)</span>
                  <span>- CCP 기록 (공정별 자동)</span>
                  <span>- 일일 체크리스트</span>
                  <span>- 생산일지 / 승인요청</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
