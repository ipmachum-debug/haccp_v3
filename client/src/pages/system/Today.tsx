/**
 * Today — 오늘 해야 할 일 (2026-10-14, UI/UX 개편 0-1)
 *
 * 데이터 연결을 바로잡았다 (docs/architecture/14-ui-ux-restructure-spec.md §2).
 *  - 오늘 배치: 생성일(createdAt) 이 아니라 업무일자(planned_date). "오늘" 은 서버가 주는 테넌트 업무일자(KST).
 *  - 미완료 CCP: 설비행 사본(h_ccp_instances) 이 아니라 공식 기록지(h_ccp_form_records) 의 오늘 작업일 draft.
 *  - 이탈: 0 하드코딩 → 미해결 CCP 이탈 실제 건수.
 *  - "미완료 검사 0" 은 집계가 없던 가짜 수치라 제거하고, 실제 값이 있는 승인 대기로 바꿨다.
 * 새 업무 처리 로직은 없다. 전부 기존 엔드포인트.
 */
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import {
  CheckCircle2, Package, ClipboardCheck, AlertTriangle, BookOpen, Inbox, FileWarning,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { useTenantModules } from "@/hooks/useTenantModules";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
import { summarizeBatches, splitForms, unresolvedOnly } from "@/lib/todaySummary";

type BatchRow = {
  id: number;
  batchCode: string;
  productName?: string | null;
  plannedQuantity?: string | number | null;
  actualQuantity?: string | number | null;
  plannedDate?: string | Date | null;
  status: string;
};

type FormRow = {
  id: number;
  ccpType: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  batchId: number | null;
  batchCode: string | null;
  productName: string | null;
  rowCount: number;
  deviationCount: number;
};

type DeviationRow = {
  id: number;
  ccpType?: string;
  type?: string;
  description?: string;
  message?: string;
  severity?: string;
  isResolved?: boolean;
  batchCode?: string | null;
  batchId?: number | null;
};

const BATCH_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  planned: { label: "계획", variant: "outline" },
  in_progress: { label: "진행 중", variant: "secondary" },
  paused: { label: "일시정지", variant: "outline" },
  completed: { label: "완료", variant: "default" },
  shipped: { label: "출하", variant: "default" },
  failed: { label: "실패", variant: "destructive" },
  cancelled: { label: "취소", variant: "destructive" },
};

const FORM_STATUS: Record<FormRow["status"], { label: string; className: string }> = {
  draft: { label: "작성 중", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  submitted: { label: "제출됨", className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300" },
  approved: { label: "승인 완료", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300" },
  rejected: { label: "반려", className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
};

export default function Today() {
  const { hasHACCP } = useTenantModules();
  const L = useIndustryLabel();
  const [activeTab, setActiveTab] = useTabWithUrl("tab", "batches");

  // 업무일자·집계는 서버(테넌트 KST) 기준 — #481 getDashboardStats
  const { data: stats } = trpc.dashboard.getStats.useQuery(undefined, { staleTime: 60_000 });
  const businessDate: string | undefined = stats?.businessDate;

  // 오늘 배치 = planned_date 가 업무일자인 배치
  const { data: batchesData, isLoading: batchesLoading } = trpc.batch.list.useQuery(
    { fromDate: businessDate!, toDate: businessDate!, limit: 200 },
    { enabled: !!businessDate },
  );
  const todayBatches = ((batchesData?.items ?? []) as BatchRow[]);

  // 오늘 공식 기록지 (정본) — HACCP 모듈에서만
  const { data: todayForms, isLoading: formsLoading } = trpc.ccpForm.listByWorkDate.useQuery(
    { workDate: businessDate! },
    { enabled: hasHACCP && !!businessDate },
  );
  const forms = (todayForms ?? []) as FormRow[];
  const { drafts: draftForms } = splitForms(forms);

  // 미해결 CCP 이탈 (실제 건수)
  const { data: deviations, isLoading: devLoading } = trpc.dashboard.ccpDeviations.useQuery(
    { limit: 50 },
    { enabled: hasHACCP },
  );
  const unresolved = unresolvedOnly((deviations ?? []) as DeviationRow[]);

  const { data: trainingIncomplete } = trpc.dailyTraining.getIncompleteCount.useQuery();

  const { inProgress, completed } = summarizeBatches(todayBatches);
  const pendingApprovals = stats?.pendingApprovalCount ?? 0;
  const dateObj = businessDate ? new Date(`${businessDate}T00:00:00`) : new Date();

  const fmtQty = (v: BatchRow["plannedQuantity"]) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n.toLocaleString() : String(v ?? "");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">오늘 할 일</h1>
          <p className="text-muted-foreground">
            {format(dateObj, "yyyy년 M월 d일 EEEE", { locale: ko })} · 업무일자 기준 {businessDate ? `(${businessDate})` : ""}
          </p>
        </div>

        {/* 주요 지표 — 전부 실제 집계 */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">오늘 {L("batch")}</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{todayBatches.length}</div>
              <p className="text-xs text-muted-foreground">진행 {inProgress} · 완료 {completed}</p>
            </CardContent>
          </Card>

          {hasHACCP && (
            <>
              <Card className={draftForms.length > 0 ? "border-amber-200 dark:border-amber-500/30" : ""}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">미작성 기록지</CardTitle>
                  <ClipboardCheck className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${draftForms.length > 0 ? "text-amber-600" : ""}`}>{draftForms.length}</div>
                  <p className="text-xs text-muted-foreground">오늘 기록지 {forms.length}건 중 (공식 기록지 기준)</p>
                </CardContent>
              </Card>
              <Card className={unresolved.length > 0 ? "border-red-200 dark:border-red-500/30" : ""}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">CCP 이탈 미해결</CardTitle>
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${unresolved.length > 0 ? "text-destructive" : ""}`}>{unresolved.length}</div>
                  <p className="text-xs text-muted-foreground">시정 조치 필요</p>
                </CardContent>
              </Card>
            </>
          )}

          <Link href="/dashboard/approval">
            <Card className={`cursor-pointer hover:bg-accent/40 transition-colors ${pendingApprovals > 0 ? "border-blue-200 dark:border-blue-500/30" : ""}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">승인 대기</CardTitle>
                <Inbox className="h-4 w-4 text-blue-500" />
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${pendingApprovals > 0 ? "text-blue-600" : ""}`}>{pendingApprovals}</div>
                <p className="text-xs text-muted-foreground">승인 관리로 이동</p>
              </CardContent>
            </Card>
          </Link>

          <Card className={trainingIncomplete?.count ? "border-violet-200 dark:border-violet-500/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">교육 미완료</CardTitle>
              <BookOpen className="h-4 w-4 text-violet-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${trainingIncomplete?.count ? "text-violet-600" : ""}`}>
                {trainingIncomplete?.assigned ? trainingIncomplete.count : "-"}
              </div>
              <p className="text-xs text-muted-foreground">
                {trainingIncomplete?.assigned ? `전체 ${trainingIncomplete.total}명 중` : "오늘 배정 없음"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="batches"><Package className="h-4 w-4 mr-2" />{L("batch")} ({todayBatches.length})</TabsTrigger>
            {hasHACCP && (
              <>
                <TabsTrigger value="forms"><ClipboardCheck className="h-4 w-4 mr-2" />기록지 ({draftForms.length}/{forms.length})</TabsTrigger>
                <TabsTrigger value="deviations"><AlertTriangle className="h-4 w-4 mr-2" />이탈 ({unresolved.length})</TabsTrigger>
              </>
            )}
          </TabsList>

          {/* 오늘 배치 — 업무일자 기준 */}
          <TabsContent value="batches" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>오늘 생산 {L("batch")}</CardTitle>
                <CardDescription>생산일(업무일자)이 오늘인 {L("batch")} 입니다. 어제 미리 만든 오늘 생산도 포함됩니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {batchesLoading || !businessDate ? (
                  <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
                ) : todayBatches.length > 0 ? (
                  <div className="space-y-3">
                    {todayBatches.map((batch) => {
                      const st = BATCH_STATUS[batch.status] ?? { label: batch.status, variant: "outline" as const };
                      return (
                        <Link key={batch.id} href={`/dashboard/batch/${batch.id}`}>
                          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium font-mono text-sm">{batch.batchCode}</span>
                                <Badge variant={st.variant}>{st.label}</Badge>
                              </div>
                              <p className="text-sm text-muted-foreground truncate">
                                {batch.productName ?? "제품"} · 계획 {fmtQty(batch.plannedQuantity)}
                                {batch.actualQuantity != null ? ` · 실적 ${fmtQty(batch.actualQuantity)}` : ""}
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>오늘 생산 {L("batch")}가 없습니다</p>
                    <Link href="/dashboard/batch-management?tab=create">
                      <Button className="mt-4" variant="outline">새 {L("batch")} 만들기</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 오늘 기록지 — 공식 기록지 기준 */}
          <TabsContent value="forms" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>오늘 쓸 기록지</CardTitle>
                <CardDescription>작업일이 오늘인 공식 CCP 기록지입니다. 작성 중인 것이 위로 옵니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {formsLoading || !businessDate ? (
                  <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
                ) : forms.length > 0 ? (
                  <div className="space-y-3">
                    {forms.map((f) => {
                      const st = FORM_STATUS[f.status] ?? FORM_STATUS.draft;
                      const href = f.batchId ? `/dashboard/batch/${f.batchId}` : "/quality/ccp-monitoring";
                      return (
                        <Link key={f.id} href={href}>
                          <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-medium font-mono text-sm">{f.ccpType}</span>
                                <span className={`text-[11px] px-1.5 py-0.5 rounded ${st.className}`}>{st.label}</span>
                                {f.deviationCount > 0 && (
                                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300">이탈 {f.deviationCount}</span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground truncate">
                                {f.productName ?? (f.ccpType === "CCP-4P" ? "일일 통합" : "제품 미지정")}
                                {f.batchCode ? ` · ${f.batchCode}` : ""} · 행 {f.rowCount}
                              </p>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50 text-green-500" />
                    <p>오늘 작업일 기록지가 없습니다</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 미해결 이탈 */}
          <TabsContent value="deviations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>미해결 CCP 이탈</CardTitle>
                <CardDescription>시정 조치가 끝나지 않은 이탈입니다. 최근 50건 중 미해결만 보여줍니다.</CardDescription>
              </CardHeader>
              <CardContent>
                {devLoading ? (
                  <div className="text-center py-8 text-muted-foreground">불러오는 중...</div>
                ) : unresolved.length > 0 ? (
                  <div className="space-y-3">
                    {unresolved.map((d) => (
                      <Link key={d.id} href={d.batchId ? `/dashboard/batch/${d.batchId}` : "/quality/ccp-monitoring"}>
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <FileWarning className="h-4 w-4 text-destructive shrink-0" />
                              <span className="font-medium">{d.ccpType ?? d.type ?? "CCP"}</span>
                              {d.severity && <Badge variant="outline" className="text-[10px]">{d.severity}</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{d.description ?? ""}{d.message ? ` · ${d.message}` : ""}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50 text-green-500" />
                    <p>미해결 이탈이 없습니다</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
