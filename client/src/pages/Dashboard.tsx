import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { trpc } from "@/lib/trpc";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, Package, TrendingUp } from "lucide-react";
import ApprovalPendingWidget from "@/components/ApprovalPendingWidget";
import { CcpDeviationWidget } from "@/components/CcpDeviationWidget";
import { LowStockWidget } from "@/components/LowStockWidget";
import { ExpiringMaterialsWidget } from "@/components/ExpiringMaterialsWidget";
import { ProductionTrendWidget } from "@/components/ProductionTrendWidget";
import { MaterialConsumptionWidget } from "@/components/MaterialConsumptionWidget";
import { MonthlyCcpDeviationWidget } from "@/components/MonthlyCcpDeviationWidget";
import { BatchScheduleWidget } from "@/components/BatchScheduleWidget";
import { CcpComplianceChartWidget } from "@/components/CcpComplianceChartWidget";
import { HealthCertificateExpiringWidget } from "@/components/HealthCertificateExpiringWidget";
import { RecentActivityWidget } from "@/components/RecentActivityWidget";
import { AccountingSummaryWidget } from "@/components/AccountingSummaryWidget";
import { SortableWidget } from "@/components/SortableWidget";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/animations";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Settings, Eye, EyeOff, GripVertical } from "lucide-react";
import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STORAGE_KEY_WIDGETS = "dashboard_widget_visibility";
const STORAGE_KEY_WIDGET_ORDER = "dashboard_widget_order";
const STORAGE_KEY_WIDGET_SIZES = "dashboard_widget_sizes";

const DEFAULT_WIDGETS = {
  approvalPending: false,  // 비활성화: 로그인 문제 해결을 위해 모든 위젯 비활성화
  batchSchedule: false,
  ccpDeviation: false,
  lowStock: false,
  expiringMaterials: false,
  productionTrend: false,
  materialConsumption: false,
  monthlyCcpDeviation: false,
  ccpComplianceChart: false,
  healthCertificateExpiring: true,  // 보건증 만료 임박 위젯 활성화
  recentActivity: true,  // 최근 활동 위젯 활성화
  accountingSummary: true,  // 회계 요약 위젯 활성화
};

const DEFAULT_WIDGET_ORDER = [
  "accountingSummary",
  "healthCertificateExpiring",
  "recentActivity",
  "approvalPending",
  "batchSchedule",
  "ccpDeviation",
  "lowStock",
  "expiringMaterials",
  "productionTrend",
  "materialConsumption",
  "monthlyCcpDeviation",
  "ccpComplianceChart",
];

const DEFAULT_WIDGET_SIZES: Record<string, "small" | "medium" | "large"> = {
  healthCertificateExpiring: "medium",
  recentActivity: "large",
  approvalPending: "medium",
  batchSchedule: "medium",
  ccpDeviation: "large",
  lowStock: "medium",
  expiringMaterials: "medium",
  productionTrend: "large",
  materialConsumption: "medium",
  monthlyCcpDeviation: "large",
  ccpComplianceChart: "large",
};

export default function Dashboard() {
  const [widgetVisibility, setWidgetVisibility] = useState<typeof DEFAULT_WIDGETS>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_WIDGETS);
      return saved ? JSON.parse(saved) : DEFAULT_WIDGETS;
    }
    return DEFAULT_WIDGETS;
  });

  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_WIDGET_ORDER);
      return saved ? JSON.parse(saved) : DEFAULT_WIDGET_ORDER;
    }
    return DEFAULT_WIDGET_ORDER;
  });

  const [widgetSizes, setWidgetSizes] = useState<Record<string, "small" | "medium" | "large">>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_WIDGET_SIZES);
      return saved ? JSON.parse(saved) : DEFAULT_WIDGET_SIZES;
    }
    return DEFAULT_WIDGET_SIZES;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_WIDGETS, JSON.stringify(widgetVisibility));
    }
  }, [widgetVisibility]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_WIDGET_ORDER, JSON.stringify(widgetOrder));
    }
  }, [widgetOrder]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY_WIDGET_SIZES, JSON.stringify(widgetSizes));
    }
  }, [widgetSizes]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setWidgetOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const toggleWidget = (key: keyof typeof DEFAULT_WIDGETS) => {
    setWidgetVisibility(prev => ({ ...prev, [key]: !prev[key] }));
  };
  // Phase 1 최적화: 데이터 캠싱 전략 (staleTime 5봠6, gcTime 10봠6)
  const { data: batchesData, isLoading } = trpc.batch.list.useQuery(undefined, {
    enabled: false,
    staleTime: 5 * 60 * 1000, // 5봠6
    gcTime: 10 * 60 * 1000, // 10봠6
  });
  const batches = batchesData?.items || [];
  const { data: stats } = trpc.dashboard.getStats.useQuery(undefined, {
    enabled: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const { data: lowStockMaterials } = trpc.inventory.getLowStock.useQuery(undefined, {
    enabled: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const { data: todaySchedules } = trpc.dashboard.getTodaySchedules.useQuery(undefined, {
    enabled: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const { data: notifications } = trpc.notification.list.useQuery(undefined, {
    enabled: false,
    staleTime: 2 * 60 * 1000, // 알림은 2분마다 새로고침
    gcTime: 5 * 60 * 1000,
  });
  // const { data: inspectionStats } = trpc.inspection.getStatistics.useQuery(undefined, {
  //   staleTime: 5 * 60 * 1000,
  //   gcTime: 10 * 60 * 1000,
  // });
  const inspectionStats = null; // 임시로 null 설정
  const { data: batchProgress } = trpc.dashboard.batchProgress.useQuery(undefined, {
    enabled: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const { data: recentActivities } = trpc.dashboard.recentActivities.useQuery({ limit: 10 }, {
    enabled: false,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const markAsRead = trpc.notification.markAsRead.useMutation();

  const localStats = {
    total: batches?.length || 0,
    inProgress: stats?.inProgressBatches || 0,
    completed: stats?.completedToday || 0,
    pending: batches?.filter((b: any) => b.status === "planned").length || 0,
  };

  // 검사 통계 차트 데이터
  const inspectionChartData: any[] = [];

  // 배치 진행 현황 차트 데이터
  const batchProgressData = batchProgress
    ? [
        { name: "계획", value: batchProgress.planned, color: "#f59e0b" },
        { name: "진행 중", value: batchProgress.running, color: "#3b82f6" },
        { name: "완료", value: batchProgress.finished, color: "#10b981" },
        { name: "출하됨", value: batchProgress.shipped, color: "#8b5cf6" },
      ]
    : [];

  const COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6"];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:gap-8 p-4 md:p-8">
        {/* 환영 배너 */}
        <WelcomeBanner />
        {/* 헤더 - overflow.io 스타일 */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
              HACCP 관리 시스템
            </h1>
            <p className="text-base md:text-lg text-muted-foreground mt-2 md:mt-3">
              식품 안전 관리 및 배치 생산 현황을 한눈에 확인하세요
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="lg">
                  <Settings className="mr-2 h-4 w-4" />
                  위젯 설정
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>대시보드 위젯 설정</DialogTitle>
                  <DialogDescription>
                    표시할 위젯과 크기를 선택하세요
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="approvalPending" className="flex-1">승인 대기</Label>
                    <Select
                      value={widgetSizes.approvalPending}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, approvalPending: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="approvalPending"
                      checked={widgetVisibility.approvalPending}
                      onCheckedChange={() => toggleWidget("approvalPending")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="batchSchedule" className="flex-1">배치 일정 요약</Label>
                    <Select
                      value={widgetSizes.batchSchedule}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, batchSchedule: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="batchSchedule"
                      checked={widgetVisibility.batchSchedule}
                      onCheckedChange={() => toggleWidget("batchSchedule")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="ccpDeviation" className="flex-1">CCP 이탈 추이</Label>
                    <Select
                      value={widgetSizes.ccpDeviation}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, ccpDeviation: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="ccpDeviation"
                      checked={widgetVisibility.ccpDeviation}
                      onCheckedChange={() => toggleWidget("ccpDeviation")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="lowStock" className="flex-1">재고 부족 경고</Label>
                    <Select
                      value={widgetSizes.lowStock}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, lowStock: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="lowStock"
                      checked={widgetVisibility.lowStock}
                      onCheckedChange={() => toggleWidget("lowStock")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="expiringMaterials" className="flex-1">유통기한 임박 원재료</Label>
                    <Select
                      value={widgetSizes.expiringMaterials}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, expiringMaterials: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="expiringMaterials"
                      checked={widgetVisibility.expiringMaterials}
                      onCheckedChange={() => toggleWidget("expiringMaterials")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="productionTrend" className="flex-1">배치 생산 추이</Label>
                    <Select
                      value={widgetSizes.productionTrend}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, productionTrend: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="productionTrend"
                      checked={widgetVisibility.productionTrend}
                      onCheckedChange={() => toggleWidget("productionTrend")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="materialConsumption" className="flex-1">원재료 소비</Label>
                    <Select
                      value={widgetSizes.materialConsumption}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, materialConsumption: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="materialConsumption"
                      checked={widgetVisibility.materialConsumption}
                      onCheckedChange={() => toggleWidget("materialConsumption")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="monthlyCcpDeviation" className="flex-1">월별 CCP 이탈 비율</Label>
                    <Select
                      value={widgetSizes.monthlyCcpDeviation}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, monthlyCcpDeviation: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="monthlyCcpDeviation"
                      checked={widgetVisibility.monthlyCcpDeviation}
                      onCheckedChange={() => toggleWidget("monthlyCcpDeviation")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="ccpComplianceChart" className="flex-1">CCP 점검 현황 차트</Label>
                    <Select
                      value={widgetSizes.ccpComplianceChart}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, ccpComplianceChart: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="ccpComplianceChart"
                      checked={widgetVisibility.ccpComplianceChart}
                      onCheckedChange={() => toggleWidget("ccpComplianceChart")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="healthCertificateExpiring" className="flex-1">보건증 만료 임박</Label>
                    <Select
                      value={widgetSizes.healthCertificateExpiring}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, healthCertificateExpiring: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="healthCertificateExpiring"
                      checked={widgetVisibility.healthCertificateExpiring}
                      onCheckedChange={() => toggleWidget("healthCertificateExpiring")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="accountingSummary" className="flex-1">회계 요약</Label>
                    <Select
                      value={widgetSizes.accountingSummary}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, accountingSummary: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="accountingSummary"
                      checked={widgetVisibility.accountingSummary}
                      onCheckedChange={() => toggleWidget("accountingSummary")}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="recentActivity" className="flex-1">최근 활동</Label>
                    <Select
                      value={widgetSizes.recentActivity}
                      onValueChange={(value) => setWidgetSizes({ ...widgetSizes, recentActivity: value as "small" | "medium" | "large" })}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">작게</SelectItem>
                        <SelectItem value="medium">중간</SelectItem>
                        <SelectItem value="large">크게</SelectItem>
                      </SelectContent>
                    </Select>
                    <Switch
                      id="recentActivity"
                      checked={widgetVisibility.recentActivity}
                      onCheckedChange={() => toggleWidget("recentActivity")}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button size="lg" className="w-full md:w-auto" asChild>
              <Link href="/dashboard/batch-management?tab=create">
                <Package className="mr-2 h-4 w-4" />
                새 배치 생성
              </Link>
            </Button>
          </div>
        </motion.div>

        {/* 통계 카드 */}
        <motion.div 
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={staggerItem}>
            <Card className="card-hover transition-all duration-300 bg-gradient-to-br from-card via-card to-card/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">전체 배치</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{localStats.total}</div>
              <p className="text-xs text-muted-foreground">총 생성된 배치 수</p>
            </CardContent>
          </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="card-hover transition-all duration-300 bg-gradient-to-br from-card via-card to-card/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">진행 중</CardTitle>
              <Clock className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-500">{localStats.inProgress}</div>
              <p className="text-xs text-muted-foreground">현재 생산 중인 배치</p>
            </CardContent>
          </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="card-hover transition-all duration-300 bg-gradient-to-br from-card via-card to-card/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">오늘 완료</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-500">{localStats.completed}</div>
              <p className="text-xs text-muted-foreground">이번 주: {stats?.completedWeek || 0}건 | 이번 달: {stats?.completedMonth || 0}건</p>
            </CardContent>
          </Card>
          </motion.div>

          <motion.div variants={staggerItem}>
            <Card className="card-hover transition-all duration-300 bg-gradient-to-br from-card via-card to-card/80">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">재고 부족 알림</CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats?.lowStockCount || 0}</div>
              <p className="text-xs text-muted-foreground">안전 재고 수준 이하</p>
            </CardContent>
          </Card>
          </motion.div>
        </motion.div>

        {/* 검사 통계 및 배치 진행 현황 차트 */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* 검사 통계 차트 */}
          <Card className="card-hover bg-gradient-to-br from-card via-card to-card/80">
            <CardHeader>
              <CardTitle>검사 통계</CardTitle>
              <CardDescription>원재료, 출하, 위생 검사 현황</CardDescription>
            </CardHeader>
            <CardContent>
              {inspectionChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={inspectionChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="완료" fill="#10b981" />
                    <Bar dataKey="대기" fill="#f59e0b" />
                    <Bar dataKey="반려" fill="#ef4444" />
                    <Bar dataKey="조치필요" fill="#f97316" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-muted-foreground">검사 데이터가 없습니다</div>
              )}
            </CardContent>
          </Card>

          {/* 배치 진행 현황 차트 */}
          <Card className="card-hover bg-gradient-to-br from-card via-card to-card/80">
            <CardHeader>
              <CardTitle>배치 진행 현황</CardTitle>
              <CardDescription>배치 상태별 분포</CardDescription>
            </CardHeader>
            <CardContent>
              {batchProgressData.length > 0 && batchProgressData.some((d) => d.value > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={batchProgressData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {batchProgressData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-center py-8 text-muted-foreground">배치 데이터가 없습니다</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 드래그 앤 드롭 가능한 위젯 목록 */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={widgetOrder}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {widgetOrder.map((widgetKey) => {
                const isVisible = widgetVisibility[widgetKey as keyof typeof DEFAULT_WIDGETS];
                if (!isVisible) return null;

                return (
                  <SortableWidget key={widgetKey} id={widgetKey} size={widgetSizes[widgetKey]}>
                    {widgetKey === "approvalPending" && <ApprovalPendingWidget />}
                    {widgetKey === "batchSchedule" && <BatchScheduleWidget />}
                    {widgetKey === "ccpDeviation" && <CcpDeviationWidget />}
                    {widgetKey === "lowStock" && <LowStockWidget />}
                    {widgetKey === "expiringMaterials" && <ExpiringMaterialsWidget />}
                    {widgetKey === "productionTrend" && <ProductionTrendWidget />}
                    {widgetKey === "materialConsumption" && <MaterialConsumptionWidget />}
                    {widgetKey === "monthlyCcpDeviation" && <MonthlyCcpDeviationWidget />}
                    {widgetKey === "ccpComplianceChart" && <CcpComplianceChartWidget />}
                    {widgetKey === "healthCertificateExpiring" && <HealthCertificateExpiringWidget />}
                    {widgetKey === "recentActivity" && <RecentActivityWidget />}
                    {widgetKey === "accountingSummary" && <AccountingSummaryWidget />}
                  </SortableWidget>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>



        {/* 최근 활동 */}
        <Card>
          <CardHeader>
            <CardTitle>최근 활동</CardTitle>
            <CardDescription>시스템 내 최근 활동 내역</CardDescription>
          </CardHeader>
          <CardContent>
            {recentActivities && recentActivities.length > 0 ? (
              <div className="space-y-4">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex flex-col gap-1">
                      <div className="font-medium">{activity.action}</div>
                      <div className="text-sm text-muted-foreground">
                        {activity.description || `${activity.entityType} #${activity.entityId}`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {activity.userEmail} • {new Date(activity.createdAt).toLocaleString("ko-KR")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">최근 활동이 없습니다</div>
            )}
          </CardContent>
        </Card>

        {/* 오늘 CCP 점검 예정 알림 */}
        {todaySchedules && todaySchedules.length > 0 && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertTitle>오늘 CCP 점검 예정</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-1">
                {todaySchedules.map((schedule) => (
                  <div key={schedule.id} className="text-sm">
                    <strong>{schedule.ccpType}</strong> - {schedule.productName} 
                    (주기: {schedule.frequency === "daily" ? "일일" : schedule.frequency === "weekly" ? "주간" : "월간"})
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* 재고 부족 알림 */}
        {lowStockMaterials && lowStockMaterials.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>재고 부족 알림</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-1">
                {lowStockMaterials.map((material) => (
                  <div key={material.id} className="text-sm">
                    <strong>{material.materialName}</strong>: 현재 {material.currentStock} {material.unit} 
                    (안전 재고: {material.safetyStockLevel} {material.unit}, 
                    부족량: {material.shortage.toFixed(2)} {material.unit})
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* 재고 만료 알림 */}
        {notifications && notifications.filter(n => n.notificationType === "inventory_expiry" && n.isRead === 0).length > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>재고 유통기한 임박 알림</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-1">
                {notifications
                  .filter(n => n.notificationType === "inventory_expiry" && n.isRead === 0)
                  .slice(0, 5)
                  .map((notification) => (
                    <div key={notification.id} className="text-sm flex items-center justify-between">
                      <span>{notification.message}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markAsRead.mutate({ notificationId: notification.id })}
                      >
                        확인
                      </Button>
                    </div>
                  ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* 최근 배치 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>최근 배치</CardTitle>
            <CardDescription>최근에 생성된 배치 목록입니다</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
            ) : batches && batches.length > 0 ? (
              <div className="space-y-4">
                {batches.slice(0, 5).map((batch: any) => (
                  <Link key={batch.id} href={`/batch/${batch.id}`}>
                    <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                      <div className="flex flex-col gap-1">
                        <div className="font-medium">{batch.batchCode}</div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(batch.createdAt).toLocaleDateString("ko-KR")}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            batch.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : batch.status === "in_progress"
                                ? "bg-blue-100 text-blue-700"
                                : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {batch.status === "completed"
                            ? "완료"
                            : batch.status === "in_progress"
                              ? "진행 중"
                              : "계획"}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                아직 생성된 배치가 없습니다
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
