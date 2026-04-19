import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { CreditCard, Check, Crown, Zap, Building2, Users, Package, Calendar } from "lucide-react";

const PLAN_ICONS: Record<string, any> = {
  starter: Zap,
  standard: Crown,
  enterprise: Building2,
};

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-blue-50 border-blue-200 text-blue-700",
  standard: "bg-purple-50 border-purple-200 text-purple-700",
  enterprise: "bg-amber-50 border-amber-200 text-amber-700",
};

// ★ 2026-04-13: Date 또는 string 어느쪽이 와도 안전하게 표시 (React #31 버그 수정)
function formatDateSafe(val: any): string {
  if (!val) return "-";
  try {
    const d = val instanceof Date ? val : new Date(val);
    if (isNaN(d.getTime())) return String(val);
    return d.toISOString().slice(0, 10);
  } catch {
    return String(val);
  }
}

const FEATURE_LABELS: Record<string, string> = {
  accounting: "회계 모듈",
  aiAssistant: "AI 비서 '하나'",
  documentPdf: "문서 PDF 출력",
  customPdf: "커스텀 PDF 양식",
  apiIntegration: "API 연동",
  excelExport: "엑셀 내보내기",
  financialReports: "재무보고서",
  autoBackup: "자동 백업",
};

function formatPrice(price: number): string {
  if (price === 0) return "무료";
  return new Intl.NumberFormat("ko-KR").format(price) + "원";
}

function UsageBar({ label, current, limit, icon: Icon }: {
  label: string; current: number; limit: number; icon: any;
}) {
  const isUnlimited = limit === Infinity || limit > 99999;
  const percent = isUnlimited ? 10 : Math.min(100, (current / limit) * 100);
  const isWarning = !isUnlimited && percent >= 80;
  const isDanger = !isUnlimited && percent >= 95;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <span className={`font-medium ${isDanger ? "text-red-600" : isWarning ? "text-amber-600" : ""}`}>
          {current} / {isUnlimited ? "무제한" : limit}
        </span>
      </div>
      <Progress value={percent} className={`h-2 ${isDanger ? "[&>div]:bg-red-500" : isWarning ? "[&>div]:bg-amber-500" : ""}`} />
    </div>
  );
}

export default function SubscriptionManagement() {
  const { data: status, isLoading, refetch } = trpc.subscription.getStatus.useQuery();
  const { data: plans } = trpc.subscription.getPlans.useQuery();
  const changePlanMutation = trpc.subscription.changePlan.useMutation({
    onSuccess: (result: any) => {
      toast.success(result.message);
      refetch();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  if (isLoading || !status) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">로딩 중...</div>;
  }

  const PlanIcon = PLAN_ICONS[status.plan] || Zap;

  return (
    <div className="space-y-6">
      {/* 현재 플랜 */}
      <Card className={`border-2 ${PLAN_COLORS[status.plan] || ""}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white/80 shadow-sm">
                <PlanIcon className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-xl">현재 플랜: {status.planName}</CardTitle>
                <CardDescription>
                  월 {formatPrice(status.monthlyPrice)} (부가세 별도)
                </CardDescription>
              </div>
            </div>
            <Badge variant={status.status === "active" ? "default" : "destructive"} className="text-sm px-3 py-1">
              {status.status === "active" ? "활성" : status.status === "trial" ? "체험 중" : status.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 구독 기간 */}
          {status.subscriptionEndDate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              구독 기간: {formatDateSafe(status.subscriptionStartDate)} ~ {formatDateSafe(status.subscriptionEndDate)}
            </div>
          )}

          {/* 사용량 */}
          <div className="grid gap-3 pt-2">
            <UsageBar label={status.usage.users.label} current={status.usage.users.current}
              limit={status.usage.users.limit} icon={Users} />
            <UsageBar label={status.usage.products.label} current={status.usage.products.current}
              limit={status.usage.products.limit} icon={Package} />
            <UsageBar label={status.usage.batchesThisMonth.label} current={status.usage.batchesThisMonth.current}
              limit={status.usage.batchesThisMonth.limit} icon={Calendar} />
          </div>
        </CardContent>
      </Card>

      {/* 기능 허용 현황 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">포함된 기능</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(FEATURE_LABELS).map(([key, label]) => {
              const enabled = (status.features as any)[key];
              return (
                <div key={key} className={`flex items-center gap-2 text-sm p-2 rounded-md ${enabled ? "bg-green-50 text-green-700" : "bg-gray-50 text-gray-400"}`}>
                  <Check className={`h-4 w-4 ${enabled ? "" : "opacity-30"}`} />
                  {label}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 플랜 비교 */}
      {plans && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              플랜 비교
            </CardTitle>
            <CardDescription>모든 요금은 부가세 별도입니다</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              {plans.map((plan: any) => {
                const isCurrent = plan.id === status.plan;
                const PIcon = PLAN_ICONS[plan.id] || Zap;
                return (
                  <div key={plan.id} className={`rounded-xl border-2 p-5 space-y-4 ${isCurrent ? "border-primary bg-primary/5" : "border-muted"}`}>
                    <div className="flex items-center gap-2">
                      <PIcon className="h-5 w-5" />
                      <h3 className="font-bold text-lg">{plan.name}</h3>
                      {isCurrent && <Badge variant="outline" className="ml-auto">현재</Badge>}
                    </div>

                    <div className="text-2xl font-bold">
                      {formatPrice(plan.monthlyPrice)}
                      <span className="text-sm font-normal text-muted-foreground">/월</span>
                    </div>

                    <div className="space-y-1.5 text-sm text-muted-foreground">
                      <div>사용자: {plan.maxUsers}</div>
                      <div>제품: {plan.maxProducts}</div>
                      <div>배치: {plan.maxBatchesPerMonth}/월</div>
                      <div>사이트: {plan.maxSites}</div>
                    </div>

                    <div className="pt-2 space-y-1">
                      {Object.entries(plan.features).map(([key, enabled]) => (
                        <div key={key} className={`text-xs flex items-center gap-1 ${enabled ? "text-green-600" : "text-gray-300"}`}>
                          <Check className="h-3 w-3" />
                          {FEATURE_LABELS[key] || key}
                        </div>
                      ))}
                    </div>

                    {!isCurrent && (
                      <Button
                        className="w-full"
                        variant={plan.id === "enterprise" ? "default" : "outline"}
                        onClick={() => changePlanMutation.mutate({ newPlan: plan.id })}
                        disabled={changePlanMutation.isPending}
                      >
                        {changePlanMutation.isPending ? "변경 중..." : isCurrent ? "현재 플랜" : "변경하기"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
