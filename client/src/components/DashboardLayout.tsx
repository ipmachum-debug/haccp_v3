import FloatingAIChatbot from "@/components/FloatingAIChatbot";
import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
// getLoginUrl import removed - using local login only
import { useIsMobile } from "@/hooks/useMobile";
import { Crown, Building, LayoutDashboard, LogOut, Package, PanelLeft, Settings, Users, ClipboardList, Warehouse, Calendar, FileText, BarChart3, Shield, ListChecks, ClipboardCheck, Sliders, TrendingUp, FileCode, Building2, Bell, BellRing, Award, Activity, AlertTriangle, FileWarning, GraduationCap, GitBranch, AlertCircle, Database, Star, Clock, Moon, Sun, CheckCircle, PackagePlus, PackageMinus, FolderOpen, BookOpen, Sparkles, UserCheck, Landmark, ArrowLeftRight, RotateCcw, Search, MessageSquare } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { Badge } from "@/components/ui/badge";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { ParticleBackground } from './ParticleBackground';
import { Button } from "./ui/button";
import NotificationDropdown from "./NotificationDropdown";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
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
import { GripVertical } from "lucide-react";

// Subscription Info Component
function SubscriptionInfo({ isCollapsed }: { isCollapsed: boolean }) {
  const checkSubscription = trpc.subscription.checkSubscriptionStatus.useMutation();
  const [subInfo, setSubInfo] = useState<any>(null);

  useEffect(() => {
    checkSubscription.mutateAsync().then(setSubInfo).catch(() => {});
  }, []);

  if (!subInfo || isCollapsed) return null;

  const daysRemaining = subInfo.daysRemaining || 0;
  const isExpiringSoon = daysRemaining <= 7 && daysRemaining > 3;
  const isUrgent = daysRemaining <= 3 && daysRemaining > 0;
  const isGracePeriod = subInfo.status === "expired" && subInfo.isReadOnly;
  const isSuspended = subInfo.status === "suspended";

  // 색상 결정
  let bgColor = "bg-green-50 dark:bg-green-950/30";
  let borderColor = "border-green-200 dark:border-green-800";
  let textColor = "text-green-700 dark:text-green-300";
  let iconColor = "text-green-600 dark:text-green-400";

  if (isSuspended) {
    bgColor = "bg-red-50 dark:bg-red-950/30";
    borderColor = "border-red-300 dark:border-red-700";
    textColor = "text-red-700 dark:text-red-300";
    iconColor = "text-red-600 dark:text-red-400";
  } else if (isGracePeriod) {
    bgColor = "bg-red-50 dark:bg-red-950/30";
    borderColor = "border-red-300 dark:border-red-700";
    textColor = "text-red-700 dark:text-red-300";
    iconColor = "text-red-600 dark:text-red-400";
  } else if (isUrgent) {
    bgColor = "bg-red-50 dark:bg-red-950/30";
    borderColor = "border-red-200 dark:border-red-800";
    textColor = "text-red-700 dark:text-red-300";
    iconColor = "text-red-600 dark:text-red-400";
  } else if (isExpiringSoon) {
    bgColor = "bg-yellow-50 dark:bg-yellow-950/30";
    borderColor = "border-yellow-200 dark:border-yellow-800";
    textColor = "text-yellow-700 dark:text-yellow-300";
    iconColor = "text-yellow-600 dark:text-yellow-400";
  }

  // 패키지 표시
  const packageLabel = subInfo.subscriptionPackage === "pro" ? "Pro" : "Basic";
  const packageBadgeColor = subInfo.subscriptionPackage === "pro" 
    ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" 
    : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";

  return (
    <div className={`mb-3 rounded-lg border-2 p-3 transition-all ${bgColor} ${borderColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock className={`h-4 w-4 ${iconColor}`} />
          <span className={`text-xs font-semibold ${textColor}`}>
            구독 정보
          </span>
        </div>
        <Badge className={`text-[10px] px-2 py-0.5 ${packageBadgeColor}`}>
          {packageLabel}
        </Badge>
      </div>
      
      {isSuspended ? (
        <div className={`text-xs ${textColor} font-medium`}>
          ⚠️ 구독이 중단되었습니다
        </div>
      ) : isGracePeriod ? (
        <>
          <div className={`text-xs ${textColor} font-medium mb-1`}>
            현재 유예기간 (읽기 전용)
          </div>
          <div className={`text-[10px] ${textColor} opacity-80`}>
            {subInfo.gracePeriodEndDate && `${new Date(subInfo.gracePeriodEndDate).toLocaleDateString('ko-KR')} 까지`}
          </div>
        </>
      ) : (
        <>
          <div className={`text-xs ${textColor} font-medium mb-1`}>
            {daysRemaining > 0 ? `${daysRemaining}일 남음` : "만료됨"}
          </div>
          <div className={`text-[10px] ${textColor} opacity-80`}>
            {subInfo.subscriptionEndDate && `만료일: ${new Date(subInfo.subscriptionEndDate).toLocaleDateString('ko-KR')}`}
          </div>
        </>
      )}
    </div>
  );
}

// Theme toggle button component
function ThemeToggleButton({ isCollapsed }: { isCollapsed: boolean }) {
  const { theme, toggleTheme } = useTheme();
  
  if (!toggleTheme) return null; // switchable이 false면 버튼 숨김
  
  return (
    <button
      onClick={toggleTheme}
      className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
      aria-label="Toggle theme"
      title={isCollapsed ? (theme === "light" ? "다크 모드" : "라이트 모드") : undefined}
    >
      {theme === "light" ? (
        <Moon className="h-4 w-4 text-muted-foreground" />
      ) : (
        <Sun className="h-4 w-4 text-muted-foreground" />
      )}
    </button>
  );
}

// Sortable Favorite Item 컴포넌트
function SortableFavoriteItem({
  id,
  item,
  isActive,
  onNavigate,
  onRemove,
}: {
  id: number;
  item: any;
  isActive: boolean;
  onNavigate: () => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SidebarMenuItem>
        <div className="flex items-center gap-1 w-full">
          <button
            {...attributes}
            {...listeners}
            className="p-2 hover:bg-accent rounded cursor-grab active:cursor-grabbing touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
            title="드래그하여 순서 변경"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </button>
          <SidebarMenuButton
            isActive={isActive}
            onClick={onNavigate}
            tooltip={item.label}
            className={`h-8 transition-all font-normal flex-1 ${(item as any).highlight ? "bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-300 rounded-lg font-semibold" : ""}`}
          >
            <item.icon
              className={`h-4 w-4 ${isActive ? "text-primary" : (item as any).highlight ? "text-indigo-600" : ""}`}
            />
            <span className={(item as any).highlight ? "text-indigo-700 font-semibold" : ""}>{item.label}</span>
                          {(item as any).highlight && <span className="ml-auto text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">NEW</span>}
          </SidebarMenuButton>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 hover:bg-accent rounded mr-2"
            title="즐겨찾기 제거"
          >
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
          </button>
        </div>
      </SidebarMenuItem>
    </div>
  );
}

const menuItems = [
  // 슈퍼관리자 전용 메뉴 (WORK 탭)
  { icon: Crown, label: "슈퍼관리자 대시보드", path: "/dashboard/super-admin", roles: ["super_admin"], category: "work" },
  { icon: UserCheck, label: "사용자 승인", path: "/dashboard/users/approval", roles: ["super_admin"], category: "work" },
  { icon: Building, label: "테넌트 관리", path: "/dashboard/tenants", roles: ["super_admin"], category: "work" },

  // WORK 탭 고정 메뉴
  { icon: LayoutDashboard, label: "통합 대시보드", path: "/dashboard", roles: ["admin", "worker", "inspector", "user"] },
  
  // ALL 탭 통합 메뉴 (Production)
  { icon: Package, label: "생산관리", path: "/dashboard/production-management", roles: ["super_admin", "admin", "worker"], children: [
    { label: "생산 예측", path: "/dashboard/production/prediction" },
  ] },
  { icon: Calendar, label: "생산운영", path: "/dashboard/production-operations", roles: ["super_admin", "admin", "worker"] },
  { icon: FileCode, label: "제조기준관리", path: "/dashboard/manufacturing-standards", roles: ["super_admin", "admin", "worker"] },
  
  // ALL 탭 통합 메뉴 (Quality)
  { icon: Shield, label: "CCP 관리", path: "/quality/ccp-monitoring", roles: ["super_admin", "admin", "worker", "inspector"] },
  { icon: ClipboardCheck, label: "검사 관리", path: "/dashboard/inspections", roles: ["super_admin", "admin", "worker", "inspector"], children: [
    { label: "원재료 검사", path: "/dashboard/inspection/material" },
    { label: "위생 점검", path: "/dashboard/inspection/hygiene" },
    { label: "출하 검사", path: "/dashboard/inspection/shipping" },
    { label: "검사 통계", path: "/dashboard/inspection/statistics" },
  ] },
  { icon: ListChecks, label: "HACCP 체크리스트", path: "/quality/checklists", roles: ["super_admin", "admin", "worker", "inspector"], children: [
    { label: "체크리스트 목록", path: "/quality/checklists" },
    { label: "템플릿 관리", path: "/quality/templates" },
    { label: "건강진단결과서 관리", path: "/dashboard/checklist/employee-health" },
  ] },
  
  // ALL 탭 통합 메뉴 (Inventory & Traceability)
  { icon: Warehouse, label: "재고 관리", path: "/inventory-management", roles: ["super_admin", "admin", "worker"] },
  
  
  // ALL 탭 통합 메뉴 (Notifications)
  { icon: Bell, label: "알림 관리", path: "/dashboard/notifications", roles: ["admin", "worker", "inspector", "user"] },
  
  // ALL 탭 통합 메뉴 (Approval)
  { icon: CheckCircle, label: "승인 관리", path: "/dashboard/approval", roles: ["super_admin", "admin", "inspector", "worker"], children: [
    { label: "승인 대시보드", path: "/dashboard/approval/dashboard" },
  ] },
  
  // ALL 탭 통합 메뉴 (Document Output)
  { icon: FileText, label: "문서 출력", path: "/dashboard/document-output", roles: ["super_admin", "admin", "inspector", "worker"], children: [
    { label: "승인된 문서", path: "/dashboard/document-output/approved" },
    { label: "일일일지 출력", path: "/dashboard/document-output/daily-log" },
  ] },
  
  // ALL 탭 통합 메뉴 (Equipment Management)
  { icon: Settings, label: "설비 관리", path: "/equipment-management", roles: ["super_admin", "admin"] },
  
  // ALL 탭 통합 메뉴 (Master Data)
  { icon: Database, label: "마스터 데이터", path: "/dashboard/master-data", roles: ["super_admin", "admin"] },
  { icon: Package, label: "품목 마스터", path: "/dashboard/item-master", roles: ["super_admin", "admin"] },
        { icon: ClipboardCheck, label: "생산 검증", path: "/dashboard/production-verification", roles: ["super_admin", "admin", "worker", "inspector"] },
  
  // ALL 탭 통합 메뉴 (Mobile)
  { icon: ClipboardCheck, label: "모바일 빠른 점검", path: "/mobile-quick-check", roles: ["admin", "worker", "inspector", "user"] },
  
  // 기타 (통합되지 않은 페이지)
  { icon: FileWarning, label: "시정 조치 관리", path: "/corrective-actions", roles: ["super_admin", "admin", "worker", "inspector"] },
    // HACCP 검증 & 감사
    { icon: FileWarning, label: "부적합제품관리", path: "/dashboard/nonconforming-management", roles: ["super_admin", "admin", "worker", "inspector"] },
    { icon: Building2, label: "감사관리", path: "/dashboard/audit-management", roles: ["super_admin", "admin", "inspector"] },
    { icon: ClipboardCheck, label: "HACCP 검증", path: "/dashboard/haccp-verification", roles: ["super_admin", "admin", "inspector"] },

  // HACCP 검증 & 감사
  

  
    // HACCP 검증 & 감사

  // ALL 탭 통합 메뉴 (System) - HACCP 7원칙 아래 최하단
  { icon: Settings, label: "시스템 관리", path: "/admin/settings", roles: ["super_admin", "admin"] },
  { icon: ArrowLeftRight, label: "GOGOGOPICK 연동", path: "/admin/opscore-sync", roles: ["super_admin", "admin"], highlight: true },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    // 로그인하지 않은 경우 바로 로그인 페이지로 리다이렉트
    window.location.href = "/login";
    return null;
  }

  return (
    <>
      <ParticleBackground />
      <SidebarProvider
        style={
          {
            "--sidebar-width": `${sidebarWidth}px`,
          } as CSSProperties
        }
      >
        <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
          {children}
        </DashboardLayoutContent>
      </SidebarProvider>
      <FloatingAIChatbot />
    </>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const { theme, toggleTheme } = useTheme();
  
  // WORK/회계/HACCP 탭 상태 관리 (기본값: work)
  const [activeTab, setActiveTab] = useState<"work" | "finance" | "haccp">("work");
  
  // localStorage에서 탭 상태 불러오기 (최초 로그인 시에만)
  useEffect(() => {
    const saved = localStorage.getItem("dashboard-active-tab");
    if (saved === "finance" || saved === "haccp" || saved === "compliance") {
      // compliance는 haccp으로 변환
      setActiveTab(saved === "compliance" ? "haccp" : saved as "work" | "finance" | "haccp");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("dashboard-active-tab", activeTab);
  }, [activeTab]);
  
  // 즐겨찾기 데이터 조회
  const { data: favorites = [] } = trpc.favorites.list.useQuery();
  const utils = trpc.useUtils();
  const addFavoriteMutation = trpc.favorites.add.useMutation({
    onMutate: async (newFavorite) => {
      // 낙관적 업데이트: 즉시 UI에 반영
      await utils.favorites.list.cancel();
      const previousFavorites = utils.favorites.list.getData();
      
      // 임시 ID로 새 즐겨찾기 추가
      const tempId = Date.now();
      utils.favorites.list.setData(undefined, (old: any) => [
        ...(old || []),
        {
          id: tempId,
          menuPath: newFavorite.menuPath,
          menuLabel: newFavorite.menuLabel,
          menuIcon: newFavorite.menuIcon || "FileText",
          sortOrder: (old?.length || 0) + 1,
        },
      ]);
      
      return { previousFavorites };
    },
    onError: (err, newFavorite, context: any) => {
      // 에러 발생 시 롤백
      if (context?.previousFavorites) {
        utils.favorites.list.setData(undefined, context.previousFavorites);
      }
    },
    onSettled: () => {
      // 서버에서 최신 데이터 가져오기
      utils.favorites.list.invalidate();
    },
  });
  const removeFavoriteMutation = trpc.favorites.remove.useMutation({
    onMutate: async (variables) => {
      // 낙관적 업데이트: 즉시 UI에서 제거
      await utils.favorites.list.cancel();
      const previousFavorites = utils.favorites.list.getData();
      
      utils.favorites.list.setData(undefined, (old: any) =>
        (old || []).filter((fav: any) => fav.id !== variables.favoriteId)
      );
      
      return { previousFavorites };
    },
    onError: (err, variables, context: any) => {
      // 에러 발생 시 롤백
      if (context?.previousFavorites) {
        utils.favorites.list.setData(undefined, context.previousFavorites);
      }
    },
    onSettled: () => {
      utils.favorites.list.invalidate();
    },
  });
  const updateFavoriteOrderMutation = trpc.favorites.updateOrder.useMutation({
    onMutate: async (variables) => {
      // 낙관적 업데이트: 드래그 순서 즉시 반영
      await utils.favorites.list.cancel();
      const previousFavorites = utils.favorites.list.getData();
      
      utils.favorites.list.setData(undefined, (old: any) => {
        if (!old) return old;
        const updated = [...old];
        variables.updates.forEach(({ favoriteId, displayOrder }) => {
          const fav = updated.find((f: any) => f.id === favoriteId);
          if (fav) fav.sortOrder = displayOrder;
        });
        return updated.sort((a: any, b: any) => a.sortOrder - b.sortOrder);
      });
      
      return { previousFavorites };
    },
    onError: (err, variables, context: any) => {
      if (context?.previousFavorites) {
        utils.favorites.list.setData(undefined, context.previousFavorites);
      }
    },
    onSettled: () => {
      utils.favorites.list.invalidate();
    },
  });
  
  // 드래그 앤 드롭 센서 설정
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  
  // 드래그 종료 핸들러
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }
    
    const oldIndex = favorites.findIndex((fav: any) => fav.id === active.id);
    const newIndex = favorites.findIndex((fav: any) => fav.id === over.id);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const reorderedFavorites = arrayMove(favorites, oldIndex, newIndex);
      const updates = reorderedFavorites.map((fav: any, index: number) => ({
        favoriteId: fav.id,
        displayOrder: index,
      }));
      updateFavoriteOrderMutation.mutate({ updates });
    }
  };
  
  // WORK 탭 메뉴 정의
  const workMenuItems = [
    { icon: LayoutDashboard, label: "통합 대시보드", path: "/dashboard", roles: ["super_admin", "admin", "worker", "inspector", "user"] },
    { icon: Clock, label: "Today", path: "/dashboard/today", roles: ["super_admin", "admin", "worker", "inspector", "user"] },
  ];
  
  // 회계 탭 메뉴 정의 (이카운트 ERP 참고)
  const accountingMenuItems = [
    { icon: TrendingUp, label: "대시보드", path: "/dashboard/accounting", roles: ["super_admin", "admin"] },
    { icon: PackageMinus, label: "매입 등록", path: "/dashboard/accounting/purchases/create", roles: ["super_admin", "admin"] },
    { icon: FileText, label: "매입 조회", path: "/dashboard/accounting/purchases/list", roles: ["super_admin", "admin"] },
    { icon: PackagePlus, label: "매출 등록", path: "/dashboard/accounting/sales/create", roles: ["super_admin", "admin"] },
    { icon: FileText, label: "매출 조회", path: "/dashboard/accounting/sales/list", roles: ["super_admin", "admin"] },
    { icon: Landmark, label: "은행 관리", path: "/dashboard/accounting/bank-management", roles: ["super_admin", "admin"] },
    { icon: Building2, label: "거래처 조회", path: "/dashboard/accounting/partners", roles: ["super_admin", "admin"] },
    { icon: MessageSquare, label: "커뮤니케이션 로그", path: "/dashboard/accounting/communication-log", roles: ["super_admin", "admin"] },
    { icon: Clock, label: "마감 관리", path: "/dashboard/accounting/closing-management", roles: ["super_admin", "admin"] },
    { icon: BookOpen, label: "계정 과목 관리", path: "/dashboard/accounting/accounts", roles: ["super_admin", "admin"] },
    { icon: FolderOpen, label: "외부회계 문서함", path: "/accounting/documents", roles: ["super_admin", "admin"] },
  ];
  
  // HACCP 탭 메뉴 정의 (모든 HACCP 관련 메뉴)
  const haccpMenuItems = [
    // Production
    { icon: Package, label: "생산관리", path: "/dashboard/production-management", roles: ["super_admin", "admin", "worker"], children: [
      { label: "생산 예측", path: "/dashboard/production/prediction" },
    ] },
    { icon: Calendar, label: "생산운영", path: "/dashboard/production-operations", roles: ["super_admin", "admin", "worker"] },
    { icon: FileCode, label: "제조기준관리", path: "/dashboard/manufacturing-standards", roles: ["super_admin", "admin", "worker"] },

    // Quality
    { icon: Shield, label: "CCP 관리", path: "/quality/ccp-monitoring", roles: ["super_admin", "admin", "worker", "inspector"] },
    { icon: ClipboardCheck, label: "검사 관리", path: "/dashboard/inspections", roles: ["super_admin", "admin", "worker", "inspector"], children: [
      { label: "원재료 검사", path: "/dashboard/inspection/material" },
      { label: "위생 점검", path: "/dashboard/inspection/hygiene" },
      { label: "출하 검사", path: "/dashboard/inspection/shipping" },
      { label: "검사 통계", path: "/dashboard/inspection/statistics" },
    ] },
    { icon: ListChecks, label: "HACCP 체크리스트", path: "/quality/checklists", roles: ["super_admin", "admin", "worker", "inspector"], children: [
      { label: "체크리스트 목록", path: "/quality/checklists" },
      { label: "템플릿 관리", path: "/quality/templates" },
      { label: "건강진단결과서 관리", path: "/dashboard/checklist/employee-health" },
    ] },
    
    // Inventory
    { icon: Warehouse, label: "재고 관리", path: "/inventory-management", roles: ["super_admin", "admin", "worker"] },
    
    // Notifications
    { icon: Bell, label: "알림 관리", path: "/dashboard/notifications", roles: ["super_admin", "admin", "worker", "inspector", "user"] },
    
    // Approval
    { icon: CheckCircle, label: "승인 관리", path: "/dashboard/approval", roles: ["super_admin", "admin", "inspector", "worker"], children: [
      { label: "승인 대시보드", path: "/dashboard/approval/dashboard" },
    ] },
    
    // Document Output
    { icon: FileText, label: "문서 출력", path: "/dashboard/document-output", roles: ["super_admin", "admin", "inspector", "worker"], children: [
      { label: "승인된 문서", path: "/dashboard/document-output/approved" },
      { label: "일일일지 출력", path: "/dashboard/document-output/daily-log" },
    ] },
    
    // Master Data
    { icon: Database, label: "마스터 데이터", path: "/dashboard/master-data", roles: ["super_admin", "admin"] },
  { icon: Package, label: "품목 마스터", path: "/dashboard/item-master", roles: ["super_admin", "admin"] },
        { icon: ClipboardCheck, label: "생산 검증", path: "/dashboard/production-verification", roles: ["super_admin", "admin", "worker", "inspector"] },
    
    // Mobile
    { icon: ClipboardCheck, label: "모바일 빠른 점검", path: "/mobile-quick-check", roles: ["admin", "worker", "inspector", "user"] },
    
    // HACCP 검증 & 감사
    { icon: FileWarning, label: "부적합제품관리", path: "/dashboard/nonconforming-management", roles: ["super_admin", "admin", "worker", "inspector"] },
    { icon: Building2, label: "감사관리", path: "/dashboard/audit-management", roles: ["super_admin", "admin", "inspector"] },
    { icon: ClipboardCheck, label: "HACCP 검증", path: "/dashboard/haccp-verification", roles: ["super_admin", "admin", "inspector"] },


    
    // System
    { icon: Settings, label: "시스템 관리", path: "/admin/settings", roles: ["super_admin", "admin"] },
    { icon: ArrowLeftRight, label: "GOGOGOPICK 연동", path: "/admin/opscore-sync", roles: ["super_admin", "admin"], highlight: true },
  ];
  
  // 슈퍼관리자 전용 메뉴 정의 (Work 탭에는 일반 메뉴만 표시)
  const superAdminMenuItems = [
    // 일반 WORK 탭 메뉴 (슈퍼관리자도 접근 가능)
    { icon: LayoutDashboard, label: "통합 대시보드", path: "/dashboard", roles: ["super_admin"] },
    { icon: Clock, label: "Today", path: "/dashboard/today", roles: ["super_admin"] },
  ];
  
  // 모든 메뉴 통합 (즐겨찾기 검색용)
  const allMenuItems = [...menuItems, ...accountingMenuItems, ...haccpMenuItems];
  
  // 즐겨찾기 메뉴 항목 생성
  const favoriteMenuItems = favorites.map(fav => {
    const menuItem = allMenuItems.find(item => item.path === fav.menuPath);
    return menuItem ? { ...menuItem, favoriteId: fav.id } : null;
   }).filter(Boolean);

  // 표시할 메뉴 선택 (슈퍼관리자는 전용 메뉴 표시)
  const displayedMenuItems = user?.role === "super_admin" && activeTab === "work"
    ? superAdminMenuItems
    : activeTab === "work" 
    ? workMenuItems
    : activeTab === "finance"
    ? accountingMenuItems
    : haccpMenuItems;
  
  // 자동 탭 전환 로직 제거 - 사용자가 수동으로 탭을 선택할 수 있도록 함
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-auto py-3 justify-center">
            {/* 로고 영역 - 한 줄로 정리 */}
            <div className="flex items-center gap-2 px-2 transition-all w-full mb-3">
              {!isCollapsed ? (
                <div className="flex items-center gap-2 w-full">
                  <Shield className="h-7 w-7 text-yellow-600 shrink-0" />
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-600 via-yellow-500 to-yellow-600 bg-clip-text text-transparent whitespace-nowrap">
                    HACCP-ONE
                  </h1>
                </div>
              ) : (
                <button
                  onClick={toggleSidebar}
                  className="flex items-center justify-center w-full hover:bg-accent rounded-lg p-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open navigation"
                  title="메뉴 열기"
                >
                  <Shield className="h-7 w-7 text-yellow-600" />
                </button>
              )}
            </div>
            
            {/* 메뉴바/테마 버튼 - 탭 스타일로 시각화 */}
            {!isCollapsed && (
              <div className="flex items-center gap-1 px-2 mb-2">
                <button
                  onClick={toggleSidebar}
                  className="flex-1 h-9 flex items-center justify-center gap-2 hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm font-medium text-muted-foreground hover:text-foreground"
                  aria-label="Toggle navigation"
                >
                  <PanelLeft className="h-4 w-4" />
                  <span>메뉴</span>
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex-1 h-9 flex items-center justify-center gap-2 hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm font-medium text-muted-foreground hover:text-foreground"
                  aria-label="Toggle theme"
                >
                  {theme === "light" ? (
                    <>
                      <Moon className="h-4 w-4" />
                      <span>다크</span>
                    </>
                  ) : (
                    <>
                      <Sun className="h-4 w-4" />
                      <span>라이트</span>
                    </>
                  )}
                </button>
              </div>
            )}
            {/* WORK/회계/HACCP 탭 */}
            {!isCollapsed && (
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "work" | "finance" | "haccp")} className="w-full px-2">
                <TabsList className="grid w-full grid-cols-3 text-xs">
                  <TabsTrigger value="work" className="text-xs">
                    WORK
                  </TabsTrigger>
                  <TabsTrigger value="finance" className="text-xs">회계</TabsTrigger>
                  <TabsTrigger value="haccp" className="text-xs">HACCP</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-0.5">
              {displayedMenuItems
                .filter((item: any) => user && item.roles?.includes(user.role))
                .map((item: any) => {
                  const isActive = location === item.path || (item.subItems && item.subItems.some((sub: any) => location === sub.path));
                  return (
                    <div key={item.path}>
                      <SidebarMenuItem>
                        <div className="flex items-center gap-1 w-full">
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(item.path)}
                            tooltip={item.label}
                            className={`h-8 transition-all font-normal flex-1 ${(item as any).highlight ? "bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-300 rounded-lg font-semibold" : ""}`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-primary" : (item as any).highlight ? "text-indigo-600" : ""}`}
                            />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                          {!isCollapsed && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const isFavorited = favorites.some((fav: any) => fav.menuPath === item.path);
                                if (isFavorited) {
                                  const fav = favorites.find((f: any) => f.menuPath === item.path);
                                  if (fav) removeFavoriteMutation.mutate({ favoriteId: fav.id });
                                } else {
                                  addFavoriteMutation.mutate({
                                    menuPath: item.path,
                                    menuLabel: item.label,
                                    menuIcon: item.icon.name || "FileText",
                                  });
                                }
                              }}
                              className="p-1 hover:bg-accent rounded mr-2"
                              title="즐겨찾기"
                            >
                              <Star
                                className={cn(
                                  "h-4 w-4",
                                  favorites.some((fav: any) => fav.menuPath === item.path)
                                    ? "fill-yellow-400 text-yellow-400"
                                    : "text-muted-foreground"
                                )}
                              />
                            </button>
                          )}
                        </div>
                      </SidebarMenuItem>
                      {item.subItems && !isCollapsed && (
                        <div className="ml-6 mt-0.5 space-y-0.5">
                          {item.subItems.map((subItem: any) => {
                            const isSubActive = location === subItem.path;
                            return (
                              <button
                                key={subItem.path}
                                onClick={() => setLocation(subItem.path)}
                                className={`w-full text-left px-3 py-1 text-sm rounded-md transition-colors ${
                                  isSubActive
                                    ? "bg-accent text-accent-foreground font-medium"
                                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                }`}
                              >
                                {subItem.label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              

              {/* 슈퍼관리자 전용 화려한 이동 버튼 */}
              {user?.role === "super_admin" && activeTab === "work" && !isCollapsed && (
                <div className="px-3 py-2 mt-2">
                  <button
                    onClick={() => setLocation("/dashboard/super-admin")}
                    className="w-full group relative overflow-hidden rounded-2xl transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50 active:scale-95"
                  >
                    {/* 배경 그라디언트 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 animate-gradient" />
                    
                    {/* 글로우 효과 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                    
                    {/* 네온 테두리 */}
                    <div className="absolute inset-0 rounded-2xl border-2 border-white/20 group-hover:border-white/40 transition-all duration-500" />
                    
                    {/* 컴텐츠 */}
                    <div className="relative flex items-center justify-center gap-2 px-4 py-2.5">
                      <div className="relative">
                        <Crown className="h-4 w-4 text-yellow-300 group-hover:text-yellow-200 transition-all duration-500 group-hover:scale-110 group-hover:rotate-12" />
                        <div className="absolute inset-0 bg-yellow-300 blur-md opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
                      </div>
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-bold text-white group-hover:text-yellow-100 transition-colors duration-300">
                          슈퍼관리자 페이지
                        </span>
                        <span className="text-[10px] text-white/70 group-hover:text-white/90 transition-colors duration-300">
                          Super Admin Panel
                        </span>
                      </div>
                      <Sparkles className="ml-auto h-3.5 w-3.5 text-yellow-300 animate-pulse" />
                    </div>
                    
                    {/* 애니메이션 라인 */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-white to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-500" />
                  </button>
                  
                  <style>{
                    `@keyframes gradient {
                      0%, 100% { background-position: 0% 50%; }
                      50% { background-position: 100% 50%; }
                    }
                    .animate-gradient {
                      background-size: 200% 200%;
                      animation: gradient 3s ease infinite;
                    }`
                  }</style>
                </div>
              )}
              
              {/* WORK 탭에서 즐겨찾기 섹션 표시 (모든 사용자) */}
              {activeTab === "work" && favoriteMenuItems.length > 0 && !isCollapsed && (
                <>
                  <div className="px-2 py-2 mt-2">
                    <div className="h-px bg-border" />
                  </div>
                  <div className="px-4 py-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      즐겨찾기
                    </p>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={favorites.map((fav: any) => fav.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {favoriteMenuItems
                        .filter((item: any) => user && item.roles?.includes(user.role))
                        .map((item: any) => {
                          const fav = favorites.find((f: any) => f.menuPath === item.path);
                          if (!fav) return null;
                          return (
                            <SortableFavoriteItem
                              key={fav.id}
                              id={fav.id}
                              item={item}
                              isActive={location === item.path}
                              onNavigate={() => setLocation(item.path)}
                              onRemove={() => removeFavoriteMutation.mutate({ favoriteId: fav.id })}
                            />
                          );
                        })}
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </SidebarMenu>          </SidebarContent>

          <SidebarFooter className="p-3">
            {/* 구독 정보 표시 (슈퍼관리자 제외) */}
            {user?.role !== "super_admin" && (
              <SubscriptionInfo isCollapsed={isCollapsed} />
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate leading-none">
                        {user?.name || "-"}
                      </p>
                      {user?.role === "admin" && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                          관리자
                        </Badge>
                      )}
                      {user?.role === "worker" && (
                        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-800 hover:bg-blue-100">
                          작업자
                        </Badge>
                      )}
                      {user?.role === "monitor" && (
                        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-800 hover:bg-green-100">
                          모니터
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5 text-sm font-semibold">
                  {user?.name}
                </div>
                <div className="px-2 py-1 text-xs text-muted-foreground">
                  {user?.email}
                </div>
                <div className="px-2 py-1.5 flex items-center gap-2">
                  <Shield className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">
                    {user?.role === "admin" && "관리자"}
                    {user?.role === "worker" && "작업자"}
                    {user?.role === "monitor" && "모니터"}
                  </span>
                </div>
                <div className="h-px bg-border my-1" />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-10 w-10 p-0 flex items-center justify-center hover:bg-accent rounded-md transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
              </SidebarTrigger>
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
            <NotificationDropdown />
          </div>
        )}
        {!isMobile && (
          <div className="flex border-b h-14 items-center justify-end bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <NotificationDropdown />
          </div>
        )}
        <main className="flex-1 p-2">{children}</main>
      </SidebarInset>
    </>
  );
}
