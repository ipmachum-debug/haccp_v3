import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  CreditCard, AlertTriangle, CheckCircle, Clock, Building2,
  TrendingUp, Ban, RefreshCw, Loader2, Calendar, DollarSign
} from "lucide-react";
import SuperAdminLayout from "@/components/dashboard/SuperAdminLayout";

const PLAN_LABEL: Record<string, string> = {
  starter: "Starter", standard: "Standard", enterprise: "Enterprise",
  basic: "Basic (레거시)", pro: "Pro (레거시)",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  active: { label: "활성", color: "bg-green-100 text-green-800", icon: CheckCircle },
  trial: { label: "체험", color: "bg-blue-100 text-blue-800", icon: Clock },
  suspended: { label: "정지", color: "bg-red-100 text-red-800", icon: Ban },
  expired: { label: "만료", color: "bg-gray-100 text-gray-600", icon: AlertTriangle },
};

function formatWon(amount: number) {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

export default function BillingManagement() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: stats, isLoading: statsLoading } = trpc.subscription.getSubscriptionStats.useQuery();
  const { data: expiring } = trpc.subscription.getExpiringTenants.useQuery({ days: 30 });

  // 전체 테넌트 목록 (구독 정보 포함)
  const { data: tenantList } = trpc.superadmin.listTenants.useQuery();

  if (statsLoading) {
    return (
      <SuperAdminLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      </SuperAdminLayout>
    );
  }

  const tenants = (tenantList as any)?.tenants || tenantList || [];
  const expiringTenants = (expiring as any)?.tenants || expiring || [];

  // 매출 추산
  const planPrices: Record<string, number> = { starter: 99000, standard: 199000, enterprise: 299000 };
  const monthlyRevenue = Array.isArray(tenants)
    ? tenants.reduce((sum: number, t: any) => sum + (planPrices[t.subscriptionPackage] || 0), 0)
    : 0;

  return (
    <SuperAdminLayout>
      <div className="container mx-auto p-6 max-w-7xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">결제 관리</h1>
          <p className="text-muted-foreground mt-1">테넌트별 구독 현황, 미납 관리, 매출 현황</p>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard icon={CheckCircle} label="활성 구독" value={stats?.active || 0} color="text-green-600" />
          <StatCard icon={Clock} label="만료 임박 (30일)" value={expiringTenants.length} color="text-yellow-600" />
          <StatCard icon={AlertTriangle} label="유예 기간" value={stats?.grace_period || 0} color="text-orange-600" />
          <StatCard icon={Ban} label="정지" value={stats?.suspended || 0} color="text-red-600" />
          <StatCard icon={DollarSign} label="월 예상 매출" value={formatWon(monthlyRevenue)} color="text-blue-600" isText />
        </div>

        {/* 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="overview">전체 현황</TabsTrigger>
            <TabsTrigger value="expiring">만료 임박</TabsTrigger>
            <TabsTrigger value="all">테넌트별 상세</TabsTrigger>
          </TabsList>

          {/* 전체 현황 */}
          <TabsContent value="overview">
            <div className="grid md:grid-cols-2 gap-6">
              {/* 플랜별 분포 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">플랜별 분포</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {["starter", "standard", "enterprise"].map(plan => {
                    const count = Array.isArray(tenants)
                      ? tenants.filter((t: any) => t.subscriptionPackage === plan).length : 0;
                    const total = Array.isArray(tenants) ? tenants.length : 1;
                    const pct = total > 0 ? Math.round(count / total * 100) : 0;
                    return (
                      <div key={plan} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{PLAN_LABEL[plan]}</Badge>
                          <span className="text-sm text-muted-foreground">{formatWon(planPrices[plan])}/월</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-medium w-16 text-right">{count}개 ({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* 매출 요약 */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">매출 요약</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <span className="text-sm font-medium">월 예상 매출 (부가세 별도)</span>
                    <span className="text-xl font-bold text-blue-600">{formatWon(monthlyRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                    <span className="text-sm font-medium">월 예상 매출 (부가세 포함)</span>
                    <span className="text-xl font-bold text-green-600">{formatWon(Math.round(monthlyRevenue * 1.1))}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted rounded-lg">
                    <span className="text-sm font-medium">연 환산 매출</span>
                    <span className="text-lg font-bold">{formatWon(monthlyRevenue * 12)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 만료 임박 */}
          <TabsContent value="expiring">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  만료 임박 테넌트 (30일 이내)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {expiringTenants.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">만료 임박 테넌트가 없습니다</p>
                ) : (
                  <div className="space-y-3">
                    {expiringTenants.map((t: any) => {
                      const endDate = t.subscriptionEndDate ? new Date(t.subscriptionEndDate) : null;
                      const daysLeft = endDate ? Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                      return (
                        <div key={t.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/30">
                          <div className="flex items-center gap-3">
                            <Building2 className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <p className="font-medium">{t.name}</p>
                              <p className="text-xs text-muted-foreground">{PLAN_LABEL[t.subscriptionPackage] || t.subscriptionPackage}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge className={daysLeft !== null && daysLeft <= 7 ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}>
                              {daysLeft !== null ? `${daysLeft}일 남음` : "날짜 미설정"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 테넌트별 상세 */}
          <TabsContent value="all">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">테넌트별 구독 상세</CardTitle>
                <CardDescription>전체 테넌트의 구독 및 결제 현황</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium">테넌트</th>
                        <th className="text-left py-2 px-3 font-medium">플랜</th>
                        <th className="text-left py-2 px-3 font-medium">상태</th>
                        <th className="text-left py-2 px-3 font-medium">만료일</th>
                        <th className="text-right py-2 px-3 font-medium">월 요금</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.isArray(tenants) && tenants.map((t: any) => {
                        const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.active;
                        const price = planPrices[t.subscriptionPackage] || 0;
                        return (
                          <tr key={t.id} className="border-b hover:bg-muted/30">
                            <td className="py-2.5 px-3">
                              <p className="font-medium">{t.name}</p>
                              <p className="text-xs text-muted-foreground">{t.slug}</p>
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline">{PLAN_LABEL[t.subscriptionPackage] || t.subscriptionPackage}</Badge>
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge className={`text-xs ${sc.color}`}>{sc.label}</Badge>
                            </td>
                            <td className="py-2.5 px-3 text-xs">
                              {t.subscriptionEndDate ? new Date(t.subscriptionEndDate).toLocaleDateString("ko-KR") : "-"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-medium">
                              {price > 0 ? formatWon(price) : "-"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </SuperAdminLayout>
  );
}

function StatCard({ icon: Icon, label, value, color, isText }: {
  icon: any; label: string; value: number | string; color: string; isText?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium">{label}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-xl font-bold ${color}`}>{isText ? value : value}</div>
      </CardContent>
    </Card>
  );
}
