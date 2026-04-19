import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CreditCard, Check, Crown, Zap, Building2, Users, Package, Calendar,
  Download, FileText, Receipt, Shield, Loader2, AlertTriangle, X
} from "lucide-react";

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

// Date or string safe display
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

const PAYMENT_STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: "결제완료", color: "bg-green-100 text-green-800" },
  pending: { label: "대기중", color: "bg-yellow-100 text-yellow-800" },
  failed: { label: "실패", color: "bg-red-100 text-red-800" },
  canceled: { label: "취소", color: "bg-gray-100 text-gray-600" },
  refunded: { label: "환불", color: "bg-blue-100 text-blue-800" },
};

function formatPrice(price: number): string {
  if (price === 0) return "무료";
  return new Intl.NumberFormat("ko-KR").format(price) + "원";
}

function formatWon(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
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
  const [activeTab, setActiveTab] = useState("plan");
  const { data: status, isLoading, refetch } = trpc.subscription.getStatus.useQuery();
  const { data: plans } = trpc.subscription.getPlans.useQuery();
  const { data: cardInfo } = trpc.subscription.getCardInfo.useQuery();
  const { data: paymentHistory } = trpc.subscription.getPaymentHistory.useQuery();

  const changePlanMutation = trpc.subscription.changePlan.useMutation({
    onSuccess: (result: any) => {
      toast.success(result.message);
      refetch();
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const generateInvoiceMutation = trpc.subscription.generateInvoice.useMutation({
    onSuccess: (result: any) => {
      // Download PDF
      const byteCharacters = atob(result.pdfBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.fileName;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`청구서 ${result.invoiceNumber} 다운로드 완료`);
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  if (isLoading || !status) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        로딩 중...
      </div>
    );
  }

  const PlanIcon = PLAN_ICONS[status.plan] || Zap;

  return (
    <div className="space-y-6">
      {/* 현재 플랜 요약 */}
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
            <div className="flex items-center gap-2">
              {cardInfo?.registered && (
                <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">
                  <CreditCard className="h-3 w-3 mr-1" />
                  {cardInfo.cardCompany} {cardInfo.cardNumber}
                </Badge>
              )}
              <Badge variant={status.status === "active" ? "default" : "destructive"} className="text-sm px-3 py-1">
                {status.status === "active" ? "활성" : status.status === "trial" ? "체험 중" : status.status}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {status.subscriptionEndDate && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              구독 기간: {formatDateSafe(status.subscriptionStartDate)} ~ {formatDateSafe(status.subscriptionEndDate)}
            </div>
          )}
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

      {/* 탭 구조: 플랜/결제/기능 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-lg grid-cols-4">
          <TabsTrigger value="plan">플랜 비교</TabsTrigger>
          <TabsTrigger value="payment">결제 관리</TabsTrigger>
          <TabsTrigger value="history">결제 이력</TabsTrigger>
          <TabsTrigger value="features">포함 기능</TabsTrigger>
        </TabsList>

        {/* 플랜 비교 탭 */}
        <TabsContent value="plan">
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
                        <div className="text-sm text-muted-foreground">
                          연 {formatPrice(plan.yearlyPrice)} (2개월 할인)
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
                              {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
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
                            {changePlanMutation.isPending ? "변경 중..." : "변경하기"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 결제 관리 탭 */}
        <TabsContent value="payment">
          <div className="grid md:grid-cols-2 gap-6">
            {/* 결제 수단 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  결제 수단
                </CardTitle>
                <CardDescription>자동 결제에 사용되는 카드 정보</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {cardInfo?.registered ? (
                  <div className="p-4 border rounded-lg bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-lg shadow-sm">
                        <CreditCard className="h-6 w-6 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium">{cardInfo.cardCompany}</p>
                        <p className="text-sm text-muted-foreground">{cardInfo.cardNumber}</p>
                      </div>
                      <Badge variant="outline" className="ml-auto bg-green-50 text-green-700">
                        <Shield className="h-3 w-3 mr-1" />
                        등록됨
                      </Badge>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 border-2 border-dashed rounded-lg text-center space-y-3">
                    <AlertTriangle className="h-8 w-8 mx-auto text-amber-500" />
                    <div>
                      <p className="font-medium">등록된 카드 없음</p>
                      <p className="text-sm text-muted-foreground">자동 결제를 위해 카드를 등록해주세요</p>
                    </div>
                    <Button variant="default" size="sm">
                      <CreditCard className="h-4 w-4 mr-1" />
                      카드 등록하기
                    </Button>
                  </div>
                )}

                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm">
                  <p className="font-medium text-blue-700 dark:text-blue-300">자동 결제 안내</p>
                  <ul className="mt-1 space-y-0.5 text-blue-600 dark:text-blue-400 text-xs">
                    <li>- 매월 1일에 등록된 카드로 자동 결제됩니다</li>
                    <li>- 결제 실패 시 5일간 유예 기간이 부여됩니다</li>
                    <li>- 유예 기간 후 읽기 전용으로 전환됩니다</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            {/* 청구서 발행 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  청구서 발행
                </CardTitle>
                <CardDescription>월별 청구서 PDF 다운로드</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(() => {
                  const months: string[] = [];
                  const now = new Date();
                  for (let i = 0; i < 6; i++) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                  }
                  return months.map((month) => (
                    <div key={month} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Receipt className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{month} 청구서</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => generateInvoiceMutation.mutate({ billingMonth: month })}
                        disabled={generateInvoiceMutation.isPending}
                      >
                        {generateInvoiceMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Download className="h-4 w-4 mr-1" />
                            PDF
                          </>
                        )}
                      </Button>
                    </div>
                  ));
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 결제 이력 탭 */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                결제 이력
              </CardTitle>
              <CardDescription>최근 12개월 결제 내역</CardDescription>
            </CardHeader>
            <CardContent>
              {!paymentHistory || paymentHistory.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Receipt className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">결제 이력이 없습니다</p>
                  <p className="text-sm">구독 결제가 완료되면 여기에 표시됩니다</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium">결제일</th>
                        <th className="text-left py-2 px-3 font-medium">주문번호</th>
                        <th className="text-left py-2 px-3 font-medium">플랜</th>
                        <th className="text-left py-2 px-3 font-medium">상태</th>
                        <th className="text-right py-2 px-3 font-medium">공급가</th>
                        <th className="text-right py-2 px-3 font-medium">부가세</th>
                        <th className="text-right py-2 px-3 font-medium">합계</th>
                        <th className="text-center py-2 px-3 font-medium">영수증</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentHistory.map((p: any) => {
                        const st = PAYMENT_STATUS[p.status] || PAYMENT_STATUS.pending;
                        return (
                          <tr key={p.id} className="border-b hover:bg-muted/30">
                            <td className="py-2.5 px-3 text-xs">{formatDateSafe(p.paidAt)}</td>
                            <td className="py-2.5 px-3 text-xs font-mono">{p.orderId}</td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline" className="text-xs">{p.plan || "-"}</Badge>
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge className={`text-xs ${st.color}`}>{st.label}</Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right">{formatWon(p.amount)}</td>
                            <td className="py-2.5 px-3 text-right">{formatWon(p.taxAmount)}</td>
                            <td className="py-2.5 px-3 text-right font-medium">{formatWon(p.totalAmount)}</td>
                            <td className="py-2.5 px-3 text-center">
                              {p.receiptUrl ? (
                                <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline text-xs">보기</a>
                              ) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 포함 기능 탭 */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">포함된 기능</CardTitle>
              <CardDescription>{status.planName} 플랜에서 사용 가능한 기능</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Object.entries(FEATURE_LABELS).map(([key, label]) => {
                  const enabled = (status.features as any)[key];
                  return (
                    <div key={key} className={`flex items-center gap-2 text-sm p-3 rounded-lg border ${enabled ? "bg-green-50 border-green-200 text-green-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}>
                      {enabled ? <Check className="h-4 w-4" /> : <X className="h-4 w-4 opacity-30" />}
                      {label}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                더 많은 기능이 필요하시면 상위 플랜으로 업그레이드하세요.
                <Button variant="link" size="sm" className="px-1 h-auto"
                  onClick={() => setActiveTab("plan")}>
                  플랜 비교 보기
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
