/**
 * 모바일 빠른 점검 - 업그레이드 버전
 * - 컴팩트 리스트 UI (카드 → 리스트 행)
 * - 빠른 메뉴 그리드 (주요 점검 폼 바로가기)
 * - 실시간 모니터링 (CCP 이탈, 승인대기, 알림, 재고부족)
 * - 오늘의 점검 현황 요약
 * - 탭: 대시보드 / 점검메뉴 / CCP현황 / 재고현황
 */
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  ClipboardCheck, Package, Search, CheckCircle2, XCircle, AlertCircle,
  ThermometerSun, Droplets, Shield, Beaker, Bug, Scale, Wrench,
  Truck, GraduationCap, Trash2, UserCheck, Eye, Bell, TrendingUp,
  Activity, AlertTriangle, Clock, ArrowRight, RefreshCw,
  FileText, Zap, LayoutGrid, BarChart3, Snowflake, Sparkles,
  ChevronRight, ExternalLink, ListChecks, Loader2, ShieldCheck
} from "lucide-react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";

// ============================================================================
// 빠른 점검 메뉴 정의
// ============================================================================
interface QuickMenuItem {
  id: string;
  label: string;
  icon: any;
  path: string;
  newPath?: string; // /new 경로
  category: "ccp" | "hygiene" | "facility" | "production" | "other";
  color: string;
  description: string;
}

const QUICK_MENUS: QuickMenuItem[] = [
  // CCP / 중요 관리점
  { id: "ccp-monitoring", label: "CCP 모니터링", icon: Shield, path: "/quality/ccp-monitoring", category: "ccp", color: "text-red-600 bg-red-50 dark:bg-red-900/20", description: "중요관리점 실시간 감시" },
  { id: "ccp-records", label: "CCP 기록", icon: ClipboardCheck, path: "/dashboard/ccp-records", category: "ccp", color: "text-red-500 bg-red-50 dark:bg-red-900/20", description: "CCP 점검 기록 조회" },
  { id: "temperature-humidity", label: "온습도 점검", icon: ThermometerSun, path: "/temperature-humidity-check", newPath: "/temperature-humidity-check/new", category: "ccp", color: "text-orange-600 bg-orange-50 dark:bg-orange-900/20", description: "온습도 모니터링 기록" },

  // 위생 관리
  { id: "personal-hygiene", label: "개인위생", icon: UserCheck, path: "/personal-hygiene-check", newPath: "/personal-hygiene-check/new", category: "hygiene", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20", description: "개인위생 점검표" },
  { id: "sanitation", label: "세척소독", icon: Droplets, path: "/sanitation-record", newPath: "/sanitation-record/new", category: "hygiene", color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20", description: "세척소독 기록" },
  { id: "workplace-hygiene", label: "작업장위생", icon: ShieldCheck, path: "/workplace-hygiene-check", newPath: "/workplace-hygiene-check/new", category: "hygiene", color: "text-blue-500 bg-blue-50 dark:bg-blue-900/20", description: "작업장위생 점검표" },
  { id: "employee-health", label: "건강점검", icon: Activity, path: "/employee-health-check", newPath: "/employee-health-check/new", category: "hygiene", color: "text-green-600 bg-green-50 dark:bg-green-900/20", description: "건강상태 확인" },
  { id: "hygiene-facility", label: "위생시설", icon: Sparkles, path: "/hygiene-facility-check", newPath: "/hygiene-facility-check/new", category: "hygiene", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20", description: "위생시설 점검" },

  // 시설 관리
  { id: "equipment-cleaning", label: "설비세척", icon: Wrench, path: "/equipment-cleaning-record", newPath: "/equipment-cleaning-record/new", category: "facility", color: "text-gray-600 bg-gray-50 dark:bg-gray-900/20", description: "설비세척 기록" },
  { id: "illumination", label: "조도점검", icon: Zap, path: "/illumination-check", newPath: "/illumination-check/new", category: "facility", color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20", description: "작업장 조도 측정" },
  { id: "water-management", label: "용수관리", icon: Droplets, path: "/water-management-check", newPath: "/water-management-check/new", category: "facility", color: "text-teal-600 bg-teal-50 dark:bg-teal-900/20", description: "용수 수질 관리" },
  { id: "air-compressor", label: "압축공기", icon: Snowflake, path: "/air-compressor", newPath: "/air-compressor/new", category: "facility", color: "text-slate-600 bg-slate-50 dark:bg-slate-900/20", description: "에어콤프레샤 관리" },

  // 품질 관리
  { id: "surface-contamination", label: "표면오염", icon: Beaker, path: "/surface-contamination-test", newPath: "/surface-contamination-test/new", category: "production", color: "text-purple-600 bg-purple-50 dark:bg-purple-900/20", description: "표면오염도 검사" },
  { id: "airborne-bacteria", label: "낙하균", icon: Bug, path: "/airborne-bacteria-test", newPath: "/airborne-bacteria-test/new", category: "production", color: "text-pink-600 bg-pink-50 dark:bg-pink-900/20", description: "낙하세균 검사" },
  { id: "weight-quality", label: "중량검사", icon: Scale, path: "/weight-quality-check", newPath: "/weight-quality-check/new", category: "production", color: "text-amber-600 bg-amber-50 dark:bg-amber-900/20", description: "중량/품질 검사" },
  { id: "finished-product", label: "완제품검사", icon: Package, path: "/finished-product-check", newPath: "/finished-product-check/new", category: "production", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20", description: "완제품 출하 검사" },

  // 기타
  { id: "vehicle-temp", label: "차량온도", icon: Truck, path: "/vehicle-temperature-check", newPath: "/vehicle-temperature-check/new", category: "other", color: "text-stone-600 bg-stone-50 dark:bg-stone-900/20", description: "운송차량 온도 확인" },
  { id: "training", label: "교육훈련", icon: GraduationCap, path: "/training-log", newPath: "/training-log/new", category: "other", color: "text-violet-600 bg-violet-50 dark:bg-violet-900/20", description: "교육훈련 기록" },
  { id: "waste-mgmt", label: "폐기물", icon: Trash2, path: "/waste-management", newPath: "/waste-management/new", category: "other", color: "text-rose-600 bg-rose-50 dark:bg-rose-900/20", description: "폐기물 처리 기록" },
  { id: "daily-log", label: "생산일지", icon: FileText, path: "/daily-log/daily", category: "other", color: "text-sky-600 bg-sky-50 dark:bg-sky-900/20", description: "일일 생산 기록" },
];

const CATEGORY_LABELS: Record<string, string> = {
  all: "전체",
  ccp: "CCP",
  hygiene: "위생관리",
  facility: "시설관리",
  production: "품질관리",
  other: "기타",
};

const CATEGORY_COLORS: Record<string, string> = {
  ccp: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  hygiene: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  facility: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  production: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  other: "bg-stone-100 text-stone-700 dark:bg-stone-900/30 dark:text-stone-400",
};

export default function MobileQuickCheck() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [menuFilter, setMenuFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // ============================================================================
  // API 조회
  // ============================================================================
  const { data: ccpSchedules, isLoading: ccpLoading, refetch: refetchCcp } = trpc.dashboard.getTodaySchedules.useQuery(undefined, {
    retry: 1, refetchOnWindowFocus: true,
  });
  const { data: pendingCount } = trpc.approval.getPendingCount.useQuery(undefined, { retry: 1 });
  const { data: notifications } = trpc.notification.list.useQuery(undefined, { retry: 1 });
  const { data: ccpDeviations } = trpc.dashboard.ccpDeviations.useQuery({}, { retry: 1 });
  const { data: lowStockWarnings } = trpc.dashboard.getLowStockWarnings.useQuery(undefined, { retry: 1 });
  const { data: checklistStats } = trpc.checklists.getStats.useQuery(undefined, { retry: 1 });
  const { data: _rawMaterials } = trpc.material.list.useQuery({ limit: 9999 }, { retry: 1 });
  const materials = (_rawMaterials as any)?.items ?? (Array.isArray(_rawMaterials) ? _rawMaterials : []);

  // 파생 데이터
  const unreadNotifications = useMemo(() =>
    Array.isArray(notifications) ? notifications.filter((n: any) => !n.readAt).length : 0
  , [notifications]);

  const recentDeviations = useMemo(() =>
    Array.isArray(ccpDeviations) ? ccpDeviations.slice(0, 5) : []
  , [ccpDeviations]);

  const lowStockCount = useMemo(() =>
    Array.isArray(lowStockWarnings) ? lowStockWarnings.length : 0
  , [lowStockWarnings]);

  const totalPending = typeof pendingCount === "number" ? pendingCount : (pendingCount as any)?.count ?? 0;

  // 체크리스트 요약
  const checklistSummary = useMemo(() => {
    if (!Array.isArray(checklistStats)) return { total: 0, completed: 0, pending: 0, rate: 0 };
    const total = checklistStats.reduce((sum: number, s: any) => sum + (s.total || 0), 0);
    const completed = checklistStats.reduce((sum: number, s: any) => sum + (s.completed || 0), 0);
    return { total, completed, pending: total - completed, rate: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [checklistStats]);

  // 메뉴 필터링
  const filteredMenus = useMemo(() => {
    let menus = QUICK_MENUS;
    if (menuFilter !== "all") menus = menus.filter(m => m.category === menuFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      menus = menus.filter(m => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q));
    }
    return menus;
  }, [menuFilter, searchQuery]);

  // CCP 필터링
  const filteredCcp = useMemo(() => {
    if (!Array.isArray(ccpSchedules)) return [];
    if (!searchQuery) return ccpSchedules;
    const q = searchQuery.toLowerCase();
    return ccpSchedules.filter((s: any) => s.ccpName?.toLowerCase().includes(q) || s.productName?.toLowerCase().includes(q));
  }, [ccpSchedules, searchQuery]);

  // 재고 필터링
  const filteredMaterials = useMemo(() => {
    if (!Array.isArray(materials)) return [];
    if (!searchQuery) return materials;
    const q = searchQuery.toLowerCase();
    return materials.filter((m: any) => m.materialName?.toLowerCase().includes(q) || m.materialCode?.toLowerCase().includes(q));
  }, [materials, searchQuery]);

  // ============================================================================
  // 모니터링 카드 렌더링
  // ============================================================================
  const monitorCards = [
    { label: "CCP 이탈", value: recentDeviations.length, icon: AlertTriangle, color: recentDeviations.length > 0 ? "text-red-600" : "text-green-600", bgColor: recentDeviations.length > 0 ? "bg-red-50 dark:bg-red-900/20" : "bg-green-50 dark:bg-green-900/20", onClick: () => navigate("/quality/ccp-monitoring") },
    { label: "승인대기", value: totalPending, icon: Clock, color: totalPending > 0 ? "text-orange-600" : "text-gray-500", bgColor: totalPending > 0 ? "bg-orange-50 dark:bg-orange-900/20" : "bg-gray-50 dark:bg-gray-900/20", onClick: () => navigate("/dashboard/approval") },
    { label: "미확인 알림", value: unreadNotifications, icon: Bell, color: unreadNotifications > 0 ? "text-blue-600" : "text-gray-500", bgColor: unreadNotifications > 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-gray-50 dark:bg-gray-900/20", onClick: () => navigate("/dashboard/notifications") },
    { label: "재고부족", value: lowStockCount, icon: Package, color: lowStockCount > 0 ? "text-amber-600" : "text-green-600", bgColor: lowStockCount > 0 ? "bg-amber-50 dark:bg-amber-900/20" : "bg-green-50 dark:bg-green-900/20", onClick: () => { setActiveTab("inventory"); setSearchQuery(""); } },
  ];

  const handleRefresh = () => {
    refetchCcp();
  };

  return (
    <DashboardLayout>
    <div className="space-y-3">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />빠른 점검
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">현장 점검 · 모니터링 · 바로가기</p>
        </div>
        <Button variant="ghost" size="sm" className="h-8" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" />새로고침
        </Button>
      </div>

      {/* ============================================================================ */}
      {/* 모니터링 요약 카드 (항상 표시) */}
      {/* ============================================================================ */}
      <div className="grid grid-cols-4 gap-2">
        {monitorCards.map((mc) => (
          <Card key={mc.label} className="cursor-pointer hover:shadow-md transition-all" onClick={mc.onClick}>
            <CardContent className="py-2 px-2 text-center">
              <div className={`inline-flex p-1.5 rounded-lg ${mc.bgColor} mb-1`}>
                <mc.icon className={`h-3.5 w-3.5 ${mc.color}`} />
              </div>
              <p className={`text-lg font-bold leading-tight ${mc.color}`}>{mc.value}</p>
              <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">{mc.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ============================================================================ */}
      {/* 탭 */}
      {/* ============================================================================ */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSearchQuery(""); }}>
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="dashboard" className="flex items-center gap-1 text-xs px-2.5 py-1.5">
            <BarChart3 className="h-3.5 w-3.5" />대시보드
          </TabsTrigger>
          <TabsTrigger value="menu" className="flex items-center gap-1 text-xs px-2.5 py-1.5">
            <LayoutGrid className="h-3.5 w-3.5" />점검메뉴
          </TabsTrigger>
          <TabsTrigger value="ccp" className="flex items-center gap-1 text-xs px-2.5 py-1.5">
            <Shield className="h-3.5 w-3.5" />CCP현황
            {Array.isArray(ccpSchedules) && ccpSchedules.length > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{ccpSchedules.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="inventory" className="flex items-center gap-1 text-xs px-2.5 py-1.5">
            <Package className="h-3.5 w-3.5" />재고
            {lowStockCount > 0 && (
              <Badge variant="destructive" className="ml-0.5 h-4 px-1 text-[10px]">{lowStockCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ================================================================== */}
        {/* 대시보드 탭 */}
        {/* ================================================================== */}
        <TabsContent value="dashboard" className="mt-2 space-y-3">
          {/* 오늘의 점검 현황 */}
          <Card>
            <CardHeader className="pb-2 px-3 pt-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <ListChecks className="h-4 w-4 text-blue-600" />오늘의 점검 현황
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${checklistSummary.rate}%` }} />
                  </div>
                </div>
                <span className="text-sm font-bold text-green-600">{checklistSummary.rate}%</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="py-1.5 rounded bg-gray-50 dark:bg-gray-900/30">
                  <p className="font-bold text-base">{checklistSummary.total}</p>
                  <p className="text-muted-foreground">전체</p>
                </div>
                <div className="py-1.5 rounded bg-green-50 dark:bg-green-900/30">
                  <p className="font-bold text-base text-green-600">{checklistSummary.completed}</p>
                  <p className="text-muted-foreground">완료</p>
                </div>
                <div className="py-1.5 rounded bg-yellow-50 dark:bg-yellow-900/30">
                  <p className="font-bold text-base text-yellow-600">{checklistSummary.pending}</p>
                  <p className="text-muted-foreground">미완료</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* CCP 이탈 현황 */}
          <Card>
            <CardHeader className="pb-2 px-3 pt-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <AlertTriangle className={`h-4 w-4 ${recentDeviations.length > 0 ? "text-red-600" : "text-green-600"}`} />
                  CCP 이탈 현황
                  {recentDeviations.length > 0 && <Badge variant="destructive" className="text-[10px] px-1 py-0">{recentDeviations.length}</Badge>}
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => navigate("/quality/ccp-monitoring")}>
                  상세 <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              {recentDeviations.length > 0 ? (
                <div className="space-y-0">
                  {recentDeviations.map((d: any, i: number) => (
                    <div key={d.id || i} className="flex items-center gap-2 py-1.5 border-b last:border-b-0 text-xs">
                      <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium truncate block">{d.ccpName || d.title || `이탈 #${d.id}`}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {d.deviationDate ? new Date(d.deviationDate).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" }) : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-xs text-green-600 py-3">
                  <CheckCircle2 className="h-5 w-5 mx-auto mb-1" />이탈 없음 - 정상
                </p>
              )}
            </CardContent>
          </Card>

          {/* 빠른 바로가기 */}
          <Card>
            <CardHeader className="pb-2 px-3 pt-3">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-yellow-500" />빠른 바로가기
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <div className="grid grid-cols-4 gap-2">
                {QUICK_MENUS.slice(0, 8).map((menu) => (
                  <button key={menu.id}
                    className="flex flex-col items-center gap-1 py-2 px-1 rounded-lg hover:bg-accent/50 transition-colors"
                    onClick={() => navigate(menu.newPath || menu.path)}
                  >
                    <div className={`p-2 rounded-lg ${menu.color}`}>
                      <menu.icon className="h-4 w-4" />
                    </div>
                    <span className="text-[10px] font-medium text-center leading-tight">{menu.label}</span>
                  </button>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2 h-7 text-xs" onClick={() => setActiveTab("menu")}>
                전체 점검 메뉴 보기 <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </CardContent>
          </Card>

          {/* 재고 부족 알림 */}
          {lowStockCount > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-2 px-3 pt-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-1.5 text-amber-600">
                    <Package className="h-4 w-4" />재고 부족
                    <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1 py-0">{lowStockCount}</Badge>
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => { setActiveTab("inventory"); }}>
                    상세 <ChevronRight className="h-3 w-3 ml-0.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-3 pb-3">
                {Array.isArray(lowStockWarnings) && lowStockWarnings.slice(0, 3).map((w: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 py-1 border-b last:border-b-0 text-xs">
                    <AlertCircle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    <span className="flex-1 truncate">{w.materialName || w.name || `원재료 #${w.id}`}</span>
                    <span className="text-amber-600 font-medium flex-shrink-0">{w.currentStock ?? 0} {w.unit || ""}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ================================================================== */}
        {/* 점검 메뉴 탭 */}
        {/* ================================================================== */}
        <TabsContent value="menu" className="mt-2 space-y-3">
          {/* 카테고리 필터 */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
              <Badge key={key}
                className={`cursor-pointer text-xs px-2 py-1 ${menuFilter === key ? "bg-primary text-primary-foreground" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200"}`}
                onClick={() => setMenuFilter(key)}
              >
                {label}
              </Badge>
            ))}
          </div>

          {/* 검색 */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="점검 항목 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          {/* 메뉴 그리드 */}
          <Card>
            <CardContent className="p-0">
              {filteredMenus.length > 0 ? filteredMenus.map((menu, idx) => (
                <div key={menu.id}
                  className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 hover:bg-accent/40 transition-colors cursor-pointer group"
                  onClick={() => navigate(menu.path)}
                >
                  <div className={`p-2 rounded-lg ${menu.color} flex-shrink-0`}>
                    <menu.icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm">{menu.label}</span>
                      <Badge className={`${CATEGORY_COLORS[menu.category]} text-[9px] px-1 py-0`}>
                        {CATEGORY_LABELS[menu.category]}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{menu.description}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    {menu.newPath && (
                      <Button variant="default" size="sm" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); navigate(menu.newPath!); }}>
                        신규
                      </Button>
                    )}
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              )) : (
                <div className="text-center py-8 text-gray-400">
                  <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">검색 결과가 없습니다</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================== */}
        {/* CCP 현황 탭 */}
        {/* ================================================================== */}
        <TabsContent value="ccp" className="mt-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="CCP 이름 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>

          <Card>
            <CardContent className="p-0">
              {ccpLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                  <p className="text-xs">로딩 중...</p>
                </div>
              ) : filteredCcp.length > 0 ? filteredCcp.map((schedule: any) => {
                const statusBadge = schedule.status === "completed"
                  ? { label: "완료", color: "bg-green-100 text-green-700", icon: CheckCircle2 }
                  : schedule.status === "in_progress"
                  ? { label: "진행중", color: "bg-yellow-100 text-yellow-700", icon: AlertCircle }
                  : { label: "대기", color: "bg-gray-100 text-gray-700", icon: Clock };

                return (
                  <div key={schedule.id}
                    className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-accent/40 transition-colors"
                  >
                    <Badge className={`${statusBadge.color} text-[10px] px-1.5 py-0 flex-shrink-0 flex items-center gap-0.5`}>
                      <statusBadge.icon className="h-2.5 w-2.5" />
                      {statusBadge.label}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm truncate block">{schedule.ccpName}</span>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{schedule.productName || ""}</span>
                        {schedule.scheduledTime && <span>· {schedule.scheduledTime}</span>}
                        {schedule.assignedTo && <span>· {schedule.assignedTo}</span>}
                      </div>
                    </div>
                    <Button size="sm" variant={schedule.status === "completed" ? "ghost" : "default"}
                      className="h-7 px-2 text-xs flex-shrink-0"
                      onClick={() => navigate("/dashboard/ccp-inspection")}
                    >
                      {schedule.status === "completed" ? <Eye className="h-3 w-3" /> : <>점검<ArrowRight className="h-3 w-3 ml-0.5" /></>}
                    </Button>
                  </div>
                );
              }) : (
                <div className="text-center py-8 text-gray-400">
                  <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">오늘 예정된 CCP 점검이 없습니다</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================================================================== */}
        {/* 재고 현황 탭 */}
        {/* ================================================================== */}
        <TabsContent value="inventory" className="mt-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="원재료 이름/코드 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>

          {/* 재고 부족 경고 (상단 고정) */}
          {lowStockCount > 0 && (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="px-3 py-2">
                <p className="text-xs font-medium text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />재고 부족 경고: {lowStockCount}개 항목
                </p>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0">
              {filteredMaterials.length > 0 ? filteredMaterials.map((material: any) => {
                const safetyStock = Number(material.safetyStockLevel) || 0;
                const currentStock = Number(material.currentStock) || 0;
                const isLowStock = safetyStock > 0 && currentStock < safetyStock;
                const unit = material.unit || "개";

                return (
                  <div key={material.id}
                    className={`flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-accent/40 transition-colors ${isLowStock ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}
                  >
                    {isLowStock ? (
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    ) : (
                      <Package className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm truncate block">{material.materialName}</span>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{material.materialCode || ""}</span>
                        {material.category && <span>· {material.category}</span>}
                        {safetyStock > 0 && <span>· 안전재고 {safetyStock}{unit}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-bold ${isLowStock ? "text-red-500" : "text-green-600"}`}>
                        {currentStock} <span className="text-[10px] font-normal text-muted-foreground">{unit}</span>
                      </p>
                      {isLowStock && <Badge variant="destructive" className="text-[9px] px-1 py-0">부족</Badge>}
                    </div>
                  </div>
                );
              }) : (
                <div className="text-center py-8 text-gray-400">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">등록된 원재료가 없습니다</p>
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
