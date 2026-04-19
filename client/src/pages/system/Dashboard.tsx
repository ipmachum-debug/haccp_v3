import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import {
  AlertCircle, AlertTriangle, ArrowRight, ArrowUpRight, ArrowDownRight,
  BarChart3, Box, CalendarCheck, CheckCircle2, ChevronRight, Clock,
  ClipboardCheck, DollarSign, Factory, FileWarning, FlaskConical,
  Layers, Package, ShieldAlert, ShieldCheck, ThermometerSun,
  TrendingUp, Truck, Users, Warehouse, Zap
} from "lucide-react";
import { Link } from "wouter";
import { WelcomeBanner } from "@/components/dashboard/WelcomeBanner";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Area, AreaChart } from "recharts";
import { useState, useEffect, useMemo } from "react";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// ─── Section Header Component ───
function SectionHeader({ icon: Icon, title, description, actionLabel, actionHref }: {
  icon: any; title: string; description?: string; actionLabel?: string; actionHref?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
          <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground gap-1">
            {actionLabel} <ChevronRight className="h-3 w-3" />
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─── Mini KPI Card ───
function MiniKPI({ label, value, icon: Icon, color, sub, href }: {
  label: string; value: string | number; icon: any; color: string; sub?: string; href?: string;
}) {
  const colorMap: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400",
    red: "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400",
  };
  const textColorMap: Record<string, string> = {
    slate: "text-foreground",
    blue: "text-blue-600 dark:text-blue-400",
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    violet: "text-violet-600 dark:text-violet-400",
  };
  const content = (
    <div className="kpi-card group cursor-pointer">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
      </div>
      <div className={`text-[28px] font-bold tracking-tight leading-none ${textColorMap[color]}`}>{value}</div>
      {sub && <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{sub}</p>}
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

// ─── Today Task Item ───
function TaskItem({ icon: Icon, label, count, color, href }: {
  icon: any; label: string; count: number; color: string; href: string;
}) {
  const dotColor: Record<string, string> = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
  };
  if (count === 0) return null;
  return (
    <Link href={href}>
      <div className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer group">
        <div className="flex items-center gap-3">
          <div className={`h-2 w-2 rounded-full ${dotColor[color]}`} />
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">{count}건</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </Link>
  );
}

// ─── Status Badge ───
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    in_progress: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    running: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
    planned: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    shipped: "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
    error: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  };
  const labels: Record<string, string> = {
    completed: "완료", in_progress: "진행 중", running: "진행 중",
    planned: "계획", shipped: "출하", error: "오류",
  };
  return (
    <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${styles[status] || styles.planned}`}>
      {labels[status] || status}
    </span>
  );
}

// ─── Progress Bar ───
function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={`premium-progress-track ${className || ""}`}>
      <div
        className="premium-progress-fill"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN DASHBOARD - Control Center
// ═══════════════════════════════════════════
export default function Dashboard() {
  const L = useIndustryLabel();

  // ─── Data Queries ───
  const { data: stats } = trpc.dashboard.getStats.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const { data: batchProgress } = trpc.dashboard.batchProgress.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const { data: lowStockMaterials } = trpc.inventory.getLowStock.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const { data: todaySchedules } = trpc.dashboard.getTodaySchedules.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const { data: notifications } = trpc.notification.list.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const { data: recentActivities } = trpc.dashboard.recentActivities.useQuery({ limit: 8 }, {
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const { data: ccpDeviations } = trpc.dashboard.ccpDeviations.useQuery({ limit: 5 }, {
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const { data: productionTrend } = trpc.dashboard.getProductionTrend.useQuery({ days: 7 }, {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const { data: expiringMaterials } = trpc.dashboard.getExpiringMaterials.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const { data: accountingSummary } = trpc.dashboard.getAccountingSummary.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const { data: batchesData } = trpc.batch.list.useQuery(undefined, {
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });
  const markAsRead = trpc.notification.markAsRead.useMutation();

  // ─── Derived Data ───
  const batches = batchesData?.items || [];
  const inProgressBatches = batches.filter((b: any) => b.status === "in_progress" || b.status === "running");
  const todayStr = todayLocal();
  const completedToday = batches.filter((b: any) => {
    if (b.status !== "completed") return false;
    const updated = b.updatedAt ? formatLocalDate(new Date(b.updatedAt)) : "";
    return updated === todayStr;
  });

  const unreadNotifications = notifications?.filter((n: any) => n.isRead === 0) || [];
  const expiryNotifications = notifications?.filter((n: any) => n.notificationType === "inventory_expiry" && n.isRead === 0) || [];

  // Production progress
  const totalBatches = batchProgress
    ? (batchProgress.planned || 0) + (batchProgress.running || 0) + (batchProgress.finished || 0) + (batchProgress.shipped || 0)
    : batches.length;
  const completedCount = batchProgress?.finished || completedToday.length;
  const progressPercent = totalBatches > 0 ? Math.round((completedCount / totalBatches) * 100) : 0;

  // Chart data for production trend
  const trendChartData = useMemo(() => {
    if (!productionTrend) return [];
    // ★ 2026-04-13: 서버가 { trend, total } 객체 또는 배열 어느쪽이든 수용
    const trendArr = Array.isArray(productionTrend)
      ? productionTrend
      : ((productionTrend as any).trend ?? []);
    return trendArr.map((item: any) => ({
      date: item.date?.slice(5) || "",
      생산: item.count || item.total || 0,
      완료: item.completed || 0,
    }));
  }, [productionTrend]);

  // Batch progress pie data
  const batchPieData = useMemo(() => {
    if (!batchProgress) return [];
    return [
      { name: "계획", value: batchProgress.planned || 0, color: "#f59e0b" },
      { name: "진행 중", value: batchProgress.running || 0, color: "#3b82f6" },
      { name: "완료", value: batchProgress.finished || 0, color: "#10b981" },
      { name: "출하", value: batchProgress.shipped || 0, color: "#8b5cf6" },
    ].filter(d => d.value > 0);
  }, [batchProgress]);

  // Today's date formatted
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-6 md:gap-7 max-w-[1400px]">

        {/* ═══ Welcome Banner ═══ */}
        <WelcomeBanner />

        {/* ═══ Page Header ═══ */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-[26px] font-bold tracking-tight text-foreground">
              경영 상황판
            </h1>
            <p className="text-[13px] text-muted-foreground mt-1">
              {dateStr} 기준 {L("site")} 운영 현황을 한눈에 확인하세요
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="outline" size="sm" className="h-9" asChild>
              <Link href="/dashboard/pipeline">
                <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
                생산 파이프라인
              </Link>
            </Button>
            <Button size="sm" className="h-9" asChild>
              <Link href="/dashboard/batch-management?tab=create">
                <Package className="mr-1.5 h-3.5 w-3.5" />
                새 {L("batch")} 생성
              </Link>
            </Button>
          </div>
        </div>

        {/* ═══ TOP KPI CARDS ═══ */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <MiniKPI
            label={`오늘 생산 ${L("batch")}`}
            value={totalBatches}
            icon={Factory}
            color="slate"
            sub={`완료 ${completedCount} | 진행 ${inProgressBatches.length}`}
            href="/dashboard/batch-management"
          />
          <MiniKPI
            label={`진행 중 ${L("batch")}`}
            value={inProgressBatches.length}
            icon={Zap}
            color="blue"
            sub="실시간 생산 현황"
            href="/dashboard/pipeline"
          />
          <MiniKPI
            label="HACCP 경고"
            value={(ccpDeviations?.length || 0) + (todaySchedules?.length || 0)}
            icon={ShieldAlert}
            color={(ccpDeviations?.length || 0) > 0 ? "red" : "emerald"}
            sub={`CCP 이탈 ${ccpDeviations?.length || 0} | 점검 ${todaySchedules?.length || 0}`}
            href="/quality/ccp-monitoring"
          />
          <MiniKPI
            label="재고 경고"
            value={(stats?.lowStockCount || 0) + (expiryNotifications?.length || 0)}
            icon={Warehouse}
            color={(stats?.lowStockCount || 0) > 0 ? "amber" : "emerald"}
            sub={`부족 ${stats?.lowStockCount || 0} | 만료임박 ${expiryNotifications?.length || 0}`}
            href="/dashboard/inventory"
          />
          <MiniKPI
            label="이번달 매출"
            value={accountingSummary?.totalSales
              ? `${Math.round(Number(accountingSummary.totalSales) / 10000)}만`
              : "0"}
            icon={DollarSign}
            color="violet"
            sub={accountingSummary?.totalPurchases
              ? `매입 ${Math.round(Number(accountingSummary.totalPurchases) / 10000)}만`
              : "데이터 없음"}
            href="/accounting/monthly-summary"
          />
        </div>

        {/* ═══ TODAY'S TASKS + PRODUCTION PROGRESS ═══ */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 오늘 해야 할 일 */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-4.5 w-4.5 text-emerald-600" />
                <CardTitle className="text-[15px]">오늘 해야 할 일</CardTitle>
              </div>
              <CardDescription className="text-xs">미완료 작업 현황</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-0.5">
                <TaskItem
                  icon={ThermometerSun}
                  label="CCP 점검"
                  count={todaySchedules?.length || 0}
                  color="red"
                  href="/quality/ccp-monitoring"
                />
                <TaskItem
                  icon={FlaskConical}
                  label="검사 미완료"
                  count={ccpDeviations?.length || 0}
                  color="amber"
                  href="/dashboard/inspections"
                />
                <TaskItem
                  icon={Package}
                  label="생산 진행"
                  count={inProgressBatches.length}
                  color="blue"
                  href="/dashboard/batch-management"
                />
                <TaskItem
                  icon={Warehouse}
                  label="재고 부족 처리"
                  count={stats?.lowStockCount || 0}
                  color="amber"
                  href="/dashboard/inventory"
                />
                <TaskItem
                  icon={ClipboardCheck}
                  label="승인 대기"
                  count={unreadNotifications.length}
                  color="blue"
                  href="/dashboard/approval"
                />
                {(todaySchedules?.length || 0) === 0 &&
                 (ccpDeviations?.length || 0) === 0 &&
                 inProgressBatches.length === 0 &&
                 (stats?.lowStockCount || 0) === 0 &&
                 unreadNotifications.length === 0 && (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">모든 작업이 완료되었습니다</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 생산 진행률 */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Factory className="h-4.5 w-4.5 text-emerald-600" />
                  <CardTitle className="text-[15px]">오늘의 생산 진행률</CardTitle>
                </div>
                <Link href="/dashboard/pipeline">
                  <Button variant="ghost" size="sm" className="text-xs gap-1">
                    파이프라인 보기 <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Progress Overview */}
              <div className="mb-6">
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{progressPercent}%</span>
                    <span className="text-sm text-muted-foreground ml-2">완료</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{completedCount} / {totalBatches} {L("batch")}</span>
                </div>
                <ProgressBar value={progressPercent} />
              </div>

              {/* Batch Status Pills */}
              <div className="grid grid-cols-4 gap-3 mb-6">
                {[
                  { label: "계획", value: batchProgress?.planned || 0, color: "bg-amber-500" },
                  { label: "진행 중", value: batchProgress?.running || 0, color: "bg-blue-500" },
                  { label: "완료", value: batchProgress?.finished || 0, color: "bg-emerald-500" },
                  { label: "출하", value: batchProgress?.shipped || 0, color: "bg-violet-500" },
                ].map((item) => (
                  <div key={item.label} className="text-center p-3 rounded-xl bg-accent/30">
                    <div className={`h-1.5 w-8 rounded-full ${item.color} mx-auto mb-2`} />
                    <div className="text-lg font-bold text-foreground">{item.value}</div>
                    <div className="text-[11px] text-muted-foreground">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* In-progress Batches Table */}
              {inProgressBatches.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground mb-2">현재 생산 중</p>
                  {inProgressBatches.slice(0, 4).map((batch: any) => (
                    <Link key={batch.id} href={`/dashboard/batch/${batch.id}`}>
                      <div className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-accent/50 transition-colors cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                          <span className="text-sm font-medium">{batch.batchCode}</span>
                          <span className="text-xs text-muted-foreground">{batch.productName || ""}</span>
                        </div>
                        <StatusBadge status={batch.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══ HACCP STATUS + INVENTORY STATUS ═══ */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* HACCP 상태 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4.5 w-4.5 text-emerald-600" />
                  <CardTitle className="text-[15px]">HACCP 상태</CardTitle>
                </div>
                <Link href="/quality/ccp-monitoring">
                  <Button variant="ghost" size="sm" className="text-xs gap-1">
                    전체 보기 <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <CardDescription className="text-xs">CCP 점검 및 검사 현황</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {/* HACCP Mini KPIs */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3.5 rounded-xl bg-red-50/50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10">
                  <div className="flex items-center gap-2 mb-1">
                    <ThermometerSun className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-[11px] text-muted-foreground">CCP 미기록</span>
                  </div>
                  <div className="text-xl font-bold text-red-600 dark:text-red-400">{todaySchedules?.length || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10">
                  <div className="flex items-center gap-2 mb-1">
                    <FlaskConical className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-[11px] text-muted-foreground">검사 미완료</span>
                  </div>
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{ccpDeviations?.length || 0}</div>
                </div>
              </div>

              {/* HACCP Alerts List */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">최근 HACCP 경고</p>
                {todaySchedules && todaySchedules.length > 0 ? (
                  todaySchedules.slice(0, 4).map((schedule: any) => (
                    <div key={schedule.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-accent/50 transition-colors">
                      <div className="h-7 w-7 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
                        <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{schedule.ccpType || "CCP 점검"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {schedule.productName || "점검 필요"} · {schedule.frequency === "daily" ? "일일" : schedule.frequency === "weekly" ? "주간" : "월간"}
                        </p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 font-medium flex-shrink-0">미점검</span>
                    </div>
                  ))
                ) : ccpDeviations && ccpDeviations.length > 0 ? (
                  ccpDeviations.slice(0, 4).map((deviation: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-accent/50 transition-colors">
                      <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{deviation.ccpType || deviation.type || "CCP 이탈"}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{deviation.description || deviation.message || "확인 필요"}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center">
                    <ShieldCheck className="h-7 w-7 text-emerald-500 mx-auto mb-1.5" />
                    <p className="text-sm text-muted-foreground">HACCP 경고 없음</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 재고 상태 */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Warehouse className="h-4.5 w-4.5 text-emerald-600" />
                  <CardTitle className="text-[15px]">재고 상태</CardTitle>
                </div>
                <Link href="/dashboard/inventory">
                  <Button variant="ghost" size="sm" className="text-xs gap-1">
                    전체 보기 <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <CardDescription className="text-xs">재고 부족 및 유통기한 임박</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {/* Inventory Mini KPIs */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="p-3.5 rounded-xl bg-amber-50/50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/10">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <span className="text-[11px] text-muted-foreground">재고 부족</span>
                  </div>
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{stats?.lowStockCount || lowStockMaterials?.length || 0}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-red-50/50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-3.5 w-3.5 text-red-500" />
                    <span className="text-[11px] text-muted-foreground">만료 임박</span>
                  </div>
                  <div className="text-xl font-bold text-red-600 dark:text-red-400">{expiringMaterials?.length || expiryNotifications.length || 0}</div>
                </div>
              </div>

              {/* Inventory Alerts List */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground mb-2">재고 경고 목록</p>
                {lowStockMaterials && lowStockMaterials.length > 0 ? (
                  lowStockMaterials.slice(0, 4).map((material: any) => (
                    <div key={material.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-accent/50 transition-colors">
                      <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <Box className="h-3.5 w-3.5 text-amber-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{material.materialName}</p>
                        <p className="text-[11px] text-muted-foreground">
                          현재 {material.currentStock} {material.unit} / 안전 {material.safetyStockLevel} {material.unit}
                        </p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 font-medium flex-shrink-0">
                        부족
                      </span>
                    </div>
                  ))
                ) : expiringMaterials && expiringMaterials.length > 0 ? (
                  expiringMaterials.slice(0, 4).map((item: any, idx: number) => (
                    <div key={idx} className="flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-accent/50 transition-colors">
                      <div className="h-7 w-7 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
                        <Clock className="h-3.5 w-3.5 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.materialName || item.name}</p>
                        <p className="text-[11px] text-muted-foreground">만료일: {item.expiryDate || item.expiry || "확인 필요"}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center">
                    <CheckCircle2 className="h-7 w-7 text-emerald-500 mx-auto mb-1.5" />
                    <p className="text-sm text-muted-foreground">재고 경고 없음</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ CHARTS: Production Trend + Batch Distribution ═══ */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* 생산 추이 차트 */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4.5 w-4.5 text-emerald-600" />
                <CardTitle className="text-[15px]">생산 추이 (7일)</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {trendChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trendChartData}>
                    <defs>
                      <linearGradient id="gradProduction" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #E5E7EB",
                        borderRadius: "12px",
                        fontSize: "12px",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      }}
                    />
                    <Area type="monotone" dataKey="생산" stroke="#059669" fill="url(#gradProduction)" strokeWidth={2} />
                    <Area type="monotone" dataKey="완료" stroke="#3b82f6" fill="transparent" strokeWidth={1.5} strokeDasharray="4 4" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  생산 데이터가 없습니다
                </div>
              )}
            </CardContent>
          </Card>

          {/* 배치 분포 차트 */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4.5 w-4.5 text-emerald-600" />
                <CardTitle className="text-[15px]">{L("batch")} 상태 분포</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {batchPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={batchPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {batchPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#fff",
                        border: "1px solid #E5E7EB",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      wrapperStyle={{ fontSize: "11px" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
                  {L("batch")} 데이터가 없습니다
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ═══ FINANCIAL SUMMARY + RECENT ACTIVITY ═══ */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 재무 요약 */}
          <Card className="lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4.5 w-4.5 text-emerald-600" />
                  <CardTitle className="text-[15px]">재무 요약</CardTitle>
                </div>
                <Link href="/accounting/monthly-summary">
                  <Button variant="ghost" size="sm" className="text-xs gap-1">
                    상세 <ChevronRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
              <CardDescription className="text-xs">이번 달 매출 · 매입 · 순이익</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {accountingSummary ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">매출</span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                    </div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                      {new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(Number(accountingSummary.totalSales || 0))}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-red-50/50 dark:bg-red-500/5 border border-red-100 dark:border-red-500/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">매입</span>
                      <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <div className="text-lg font-bold text-red-600 dark:text-red-400">
                      {new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(Number(accountingSummary.totalPurchases || 0))}
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-500/5 border border-blue-100 dark:border-blue-500/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">순이익</span>
                      <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                    </div>
                    <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(
                        Number(accountingSummary.totalSales || 0) - Number(accountingSummary.totalPurchases || 0)
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  회계 데이터가 없습니다
                </div>
              )}
            </CardContent>
          </Card>

          {/* 최근 활동 + 알림 */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4.5 w-4.5 text-emerald-600" />
                  <CardTitle className="text-[15px]">최근 활동 & 알림</CardTitle>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-md bg-accent text-muted-foreground font-medium">
                  {unreadNotifications.length}개 미읽음
                </span>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-1.5 max-h-[380px] overflow-y-auto custom-scrollbar">
                {/* Unread notifications first */}
                {unreadNotifications.slice(0, 3).map((notification: any) => (
                  <div key={`notif-${notification.id}`} className="flex items-start gap-3 py-2.5 px-3 rounded-xl bg-amber-50/30 dark:bg-amber-500/5 border border-amber-100/50 dark:border-amber-500/10">
                    <div className="h-7 w-7 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{notification.message}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(notification.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[11px] h-6 px-2"
                      onClick={() => markAsRead.mutate({ notificationId: notification.id })}
                    >
                      확인
                    </Button>
                  </div>
                ))}
                {/* Recent activities */}
                {recentActivities && recentActivities.length > 0 ? (
                  recentActivities.map((activity: any) => (
                    <div key={`act-${activity.id}`} className="flex items-start gap-3 py-2.5 px-3 rounded-xl hover:bg-accent/50 transition-colors">
                      <div className="h-7 w-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Zap className="h-3.5 w-3.5 text-slate-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{activity.action}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {activity.description || `${activity.entityType} #${activity.entityId}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {activity.userEmail} · {new Date(activity.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    최근 활동이 없습니다
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ═══ RECENT BATCHES ═══ */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="h-4.5 w-4.5 text-emerald-600" />
                <CardTitle className="text-[15px]">최근 {L("batch")}</CardTitle>
              </div>
              <Link href="/dashboard/batch-management">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  전체 보기 <ChevronRight className="h-3 w-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {batches.length > 0 ? (
              <div className="premium-table-container">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{L("batch")}코드</th>
                      <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">생성일</th>
                      <th className="text-left py-3 px-4 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.slice(0, 6).map((batch: any) => (
                      <tr key={batch.id} className="border-b border-border/40 last:border-0 hover:bg-accent/30 transition-colors cursor-pointer" onClick={() => window.location.href = `/dashboard/batch/${batch.id}`}>
                        <td className="py-3 px-4">
                          <span className="text-sm font-medium text-foreground">{batch.batchCode}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-muted-foreground">
                            {new Date(batch.createdAt).toLocaleDateString("ko-KR")}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={batch.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-muted-foreground">
                아직 생성된 {L("batch")}가 없습니다
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
