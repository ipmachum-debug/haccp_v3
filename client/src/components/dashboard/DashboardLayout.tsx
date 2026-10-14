import FloatingAIChatbot from "@/components/ai/FloatingAIChatbot";
import FloatingAIBriefing from "@/components/ai/FloatingAIBriefing";
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
import { useIsMobile } from "@/hooks/useMobile";
import { Crown, LogIn, LogOut, PanelLeft, FileText, Star, Moon, Sun, CheckCircle, ChevronRight, Sparkles, Bot } from "lucide-react";
import { MillioMark } from "@/components/brand/MillioMark";
import { useTheme } from "@/contexts/ThemeContext";
import { Badge } from "@/components/ui/badge";
import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import NotificationDropdown from "./NotificationDropdown";
import { FEATURES, MODULES } from "@/lib/featureFlags";
import { ROUTES } from "@/lib/routePaths";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { useIndustryFeatures, type ModuleKey } from "@/hooks/useIndustryFeatures";
// Phase Plugin-3: Menu Engine — Plugin 기반 사이드바 동적 생성
import { useDomainPlugin } from "@/domain/useDomainPlugin";
import { buildMenuFromPlugin, getIcon } from "@/domain/engines/clientMenuEngine";
import { selectTabMenu, isChildRouteOf, DEMO_ALLOWED_PATHS, type MenuPlacement } from "@shared/navigation/menuRegistry";
import type { RouterOutput } from "@/lib/trpcTypes";
import { cn } from "@/lib/utils";

// 사이드바 favorite 메뉴 타입 — trpc proxy 가 깊은 타입을 완전히 전파하지 못해 명시 추출
type FavoriteItem = RouterOutput["favorites"]["list"][number];
// 사이드바 MenuItem 타입 (FIXED: 사이드바 렌더링용)
/** 레지스트리 항목(아이콘 이름) → 사이드바 항목(아이콘 컴포넌트). 그 외 필드는 그대로 */
function toMenuItems(placements: readonly MenuPlacement[]): MenuItem[] {
  return placements.map((p) => ({
    icon: getIcon(p.icon),
    label: p.label,
    path: p.path,
    roles: [...p.roles],
    ...(p.group ? { group: p.group } : {}),
    ...(p.requireModule ? { requireModule: p.requireModule as ModuleKey } : {}),
    ...(p.highlight ? { highlight: true } : {}),
    ...(p.category ? { category: p.category } : {}),
  }));
}

type MenuItem = {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
  highlight?: boolean;
  badge?: string;
  group?: string;
  /** 이 메뉴를 표시하려면 활성이어야 하는 업종 모듈 */
  requireModule?: ModuleKey;
  category?: string;
};
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
  const checkSubscription = trpc.subscriptionPublic.checkSubscriptionStatus.useMutation();
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

  // 색상 결정 - 사이드바/메인과 통일된 부드러운 뉴트럴 톤
  let textColor = "text-muted-foreground";
  let iconColor = "text-muted-foreground/60";
  let statusDot = "bg-emerald-500/70";

  if (isSuspended) {
    textColor = "text-red-500/80 dark:text-red-400/80";
    iconColor = "text-red-500/60 dark:text-red-400/60";
    statusDot = "bg-red-500/70";
  } else if (isGracePeriod) {
    textColor = "text-red-500/80 dark:text-red-400/80";
    iconColor = "text-red-500/60 dark:text-red-400/60";
    statusDot = "bg-red-500/70";
  } else if (isUrgent) {
    textColor = "text-amber-600/80 dark:text-amber-400/80";
    iconColor = "text-amber-600/60 dark:text-amber-400/60";
    statusDot = "bg-amber-500/70";
  } else if (isExpiringSoon) {
    textColor = "text-amber-600/80 dark:text-amber-400/80";
    iconColor = "text-amber-600/60 dark:text-amber-400/60";
    statusDot = "bg-amber-500/70";
  }

  // 패키지 표시 — 신 체계(starter/standard/enterprise) + 구 체계(basic/pro) 호환
  // ★ 2026-04-14: 구 체계만 지원하던 버그 수정 (사이드바/시스템관리 표시 불일치)
  const PACKAGE_LABEL: Record<string, string> = {
    starter: "Starter",
    standard: "Standard",
    erp_basic: "ERP Basic",
    enterprise: "Enterprise",
    pro: "Pro",      // legacy
    basic: "Basic",  // legacy
  };
  const packageLabel = PACKAGE_LABEL[subInfo.subscriptionPackage as string] || "Basic";

  return (
    <div className="mb-1.5 flex items-center justify-between px-1">
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
        <span className="text-[10px] text-muted-foreground/60">
          {packageLabel}
        </span>
        <span className={`text-[10px] font-medium ${textColor}`}>
          {isSuspended ? "중단됨" : isGracePeriod ? "유예기간" : daysRemaining > 0 ? `${daysRemaining}일` : "만료"}
        </span>
      </div>
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
  item: MenuItem;
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
            <span>{item.label}</span>
                          {(item as any).highlight && <span className="ml-auto text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-medium">NEW</span>}
          </SidebarMenuButton>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="p-1 hover:bg-accent rounded mr-2"
            title="즐겨찾기 제거"
          >
            <Star className="h-4 w-4 fill-amber-400/80 text-amber-400/80" />
          </button>
        </div>
      </SidebarMenuItem>
    </div>
  );
}

// 2-a (2026-10-14): 하위 경로 매핑은 shared/navigation/menuRegistry.ts 의 CHILD_ROUTES (isChildRouteOf)


/**
 * 메뉴 path 에서 industry 추출 — Phase 3 industry 격리 필터.
 *
 * 패턴: /dashboard/{industry}/* 형태일 때 해당 industry 반환.
 * 그 외에는 null (industry 무관 메뉴 = 모두에게 표시).
 *
 * Industry 키:
 *   food / cosmetic / pharmaceutical / health-functional / medical-device / general-manufacturing
 */
function getMenuRequiredIndustry(path: string): string | null {
  const m = path.match(/^\/dashboard\/(food|cosmetic|pharmaceutical|health-functional|medical-device|general-manufacturing)\//);
  return m ? m[1] : null;
}

/**
 * useIndustryFeatures().category (서버 IndustryCategory) 를
 * 메뉴 path 의 IndustryKey 로 매핑.
 *
 * 서버 category → 메뉴 industry:
 *   food         → food
 *   cosmetics    → cosmetic
 *   pharma       → pharmaceutical
 *   supplement   → health-functional
 *   general      → general-manufacturing
 *   electronics  → null (medical-device 프로필 미정의 — 추후 보강)
 *   textile      → null
 *   chemical     → null
 *
 * @returns 매핑된 IndustryKey 또는 null (매칭 안 되는 경우 industry-specific 메뉴 모두 hide)
 */
function mapCategoryToIndustryKey(category: string | null | undefined): string | null {
  if (!category) return null;
  const map: Record<string, string> = {
    food: "food",
    cosmetics: "cosmetic",
    pharma: "pharmaceutical",
    supplement: "health-functional",
    general: "general-manufacturing",
  };
  return map[category] ?? null;
}

// 2-a (2026-10-14): HACCP 탭 폴백 메뉴 — 정본은 shared/navigation/menuRegistry.ts (탭별 결과는 스냅샷 테스트로 고정)
const menuItems = toMenuItems(selectTabMenu("haccp", { isErpOnly: false, features: { GOGOGOPICK_INTEGRATION: FEATURES.GOGOGOPICK_INTEGRATION } }));

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
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

  // employee는 공지보드만 접근 가능
  if (user.role === "employee") {
    window.location.href = "/board";
    return null;
  }

  return (
    <>
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
      <FloatingAIBriefing />
    </>
  );
}

// ============================================================================
// 데모 모드 배너 (30분 타이머 + 읽기 전용 안내)
// ============================================================================
function DemoBanner({ onLogout }: { onLogout: () => void }) {
  const [remaining, setRemaining] = useState(30 * 60); // 30분

  useEffect(() => {
    const startTime = sessionStorage.getItem("demo_start");
    if (!startTime) {
      sessionStorage.setItem("demo_start", Date.now().toString());
    }

    const timer = setInterval(() => {
      const start = Number(sessionStorage.getItem("demo_start") || Date.now());
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, 30 * 60 - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        sessionStorage.removeItem("demo_start");
        onLogout();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [onLogout]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const isUrgent = remaining < 5 * 60;

  return (
    <div className={`sticky top-0 z-50 flex items-center justify-between px-4 py-2 text-sm font-medium ${
      isUrgent ? "bg-red-500 text-white" : "bg-amber-400 text-amber-900"
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-black/15 font-bold">DEMO</span>
        <span>읽기 전용 모드 &middot; 데이터 수정 불가</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs tabular-nums">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")} 남음
        </span>
        <a href="/register" className="text-xs px-3 py-1 rounded-full bg-black/20 hover:bg-black/30 transition-colors font-semibold">
          회원가입
        </a>
      </div>
    </div>
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

  // ✨ 데모 계정 감지
  const isDemo = !!(user as any)?.isDemo;

  // ★ 업종코드 기반 모듈 활성화
  const {
    isModuleActive: isIndustryModuleActive,
    hasHACCP: industryHasHACCP,
    hasGMP: industryHasGMP,
    hasISO: industryHasISO,
    getLabel: industryLabel,
    category: industryCategory,
    isLoading: industryLoading,
  } = useIndustryFeatures();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  // childRoutes를 사용하여 현재 경로에 해당하는 부모 메뉴 찾기
  const isChildRoute = (itemPath: string) => isChildRouteOf(itemPath, location);
  const { theme, toggleTheme } = useTheme();
  
  // WORK/회계/HACCP 탭 상태 관리 (기본값: work)
  const [activeTab, setActiveTab] = useState<"work" | "finance" | "haccp">("work");

  // ★ 2026-05-09 (PR #279): super_admin 도 기본적으로 industry 필터 적용
  // 사유: 식품 테넌트 진입 시 화장품/의약품 메뉴까지 다 보여 사용자 혼란 (PR #262 이후 지속 보고)
  // localStorage 기반: super_admin 이 명시적으로 toggle 시에만 전체 메뉴 노출
  const [superAdminShowAllMenus, setSuperAdminShowAllMenus] = useState<boolean>(() => {
    try {
      return localStorage.getItem("dashboard-super-admin-show-all") === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("dashboard-super-admin-show-all", String(superAdminShowAllMenus));
    } catch {}
  }, [superAdminShowAllMenus]);

  // 구독 기반 모듈 활성화 (DB 동적 + sessionStorage 캐시 + 환경변수 폴백)
  const MODULES_CACHE_KEY = "tenant-modules-cache";
  const cachedModules = (() => {
    try { const r = sessionStorage.getItem(MODULES_CACHE_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
  })();
  const [dynamicModules, setDynamicModules] = useState<{ erp: boolean; haccp: boolean }>(
    cachedModules || { erp: MODULES.ERP, haccp: MODULES.HACCP }
  );
  const checkSubMut = trpc.subscriptionPublic.checkSubscriptionStatus.useMutation();
  useEffect(() => {
    checkSubMut.mutateAsync().then((info: { expired?: boolean; package?: string; modules?: { erp?: boolean; haccp?: boolean } }) => {
      if (info?.modules) {
        const m = { erp: !!info.modules.erp, haccp: !!info.modules.haccp };
        setDynamicModules(m);
        try { sessionStorage.setItem(MODULES_CACHE_KEY, JSON.stringify(m)); } catch {}
      }
    }).catch(() => {});
  }, []);
  const moduleERP = dynamicModules.erp;
  const moduleHACCP = dynamicModules.haccp;
  const isErpOnly = moduleERP && !moduleHACCP;
  
  // location 변경 시 탭 자동 전환
  useEffect(() => {
    const isHaccpRoute = menuItems.some(item => 
      item.path === location || 
      location.startsWith(item.path + "/") ||
      isChildRoute(item.path)
    );
    const isAccountingRoute = accountingMenuItems.some(item => 
      item.path === location || location.startsWith(item.path + "/")
    );
    if (isAccountingRoute && moduleERP) {
      setActiveTab("finance");
    } else if (isHaccpRoute && activeTab !== "haccp" && moduleHACCP) {
      const isWorkRoute = workMenuItems.some(item => item.path === location) || 
                          superAdminMenuItems.some(item => item.path === location);
      if (!isWorkRoute) {
        setActiveTab("haccp");
      }
    }
  }, [location]);

  // localStorage에서 탭 상태 불러오기 (최초 로그인 시에만)
  // ERP 전용 모드: 기본 탭을 "회계"로 자동 전환
  useEffect(() => {
    if (isErpOnly) {
      const saved = localStorage.getItem("dashboard-active-tab");
      if (!saved || saved === "haccp" || saved === "compliance") {
        setActiveTab("finance");
      } else {
        setActiveTab(saved as "work" | "finance" | "haccp");
      }
    } else {
      const saved = localStorage.getItem("dashboard-active-tab");
      if (saved === "finance" || saved === "haccp" || saved === "compliance") {
        setActiveTab(saved === "compliance" ? "haccp" : saved as "work" | "finance" | "haccp");
      }
    }
  }, [isErpOnly]);

  useEffect(() => {
    localStorage.setItem("dashboard-active-tab", activeTab);
  }, [activeTab]);
  
  // 즐겨찾기 데이터 조회
  const { data: favorites = [] } = trpc.favorites.list.useQuery();
  const utils = trpc.useUtils();
  const addFavoriteMutation = trpc.favorites.add.useMutation({
    onMutate: async (newFavorite: { menuPath: string; menuLabel: string; menuIcon: string }) => {
      // 낙관적 업데이트: 즉시 UI에 반영
      await utils.favorites.list.cancel();
      const previousFavorites = utils.favorites.list.getData();
      
      // 임시 ID로 새 즐겨찾기 추가
      const tempId = Date.now();
      utils.favorites.list.setData(undefined, (old: FavoriteItem[] | undefined) => [
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
    onError: (err: Error, _newFavorite: unknown, context: { previousFavorites?: FavoriteItem[] } | undefined) => {
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
    onMutate: async (variables: { favoriteId?: number; updates?: Array<{ favoriteId: number; displayOrder: number }> }) => {
      // 낙관적 업데이트: 즉시 UI에서 제거
      await utils.favorites.list.cancel();
      const previousFavorites = utils.favorites.list.getData();
      
      utils.favorites.list.setData(undefined, (old: FavoriteItem[] | undefined) =>
        (old || []).filter((fav: FavoriteItem) => fav.id !== variables.favoriteId)
      );
      
      return { previousFavorites };
    },
    onError: (err: Error, _variables: unknown, context: { previousFavorites?: FavoriteItem[] } | undefined) => {
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
    onMutate: async (variables: { favoriteId?: number; updates?: Array<{ favoriteId: number; displayOrder: number }> }) => {
      // 낙관적 업데이트: 드래그 순서 즉시 반영
      await utils.favorites.list.cancel();
      const previousFavorites = utils.favorites.list.getData();
      
      utils.favorites.list.setData(undefined, (old: FavoriteItem[] | undefined) => {
        if (!old) return old;
        const updated = [...old];
        (variables.updates ?? []).forEach(({ favoriteId, displayOrder }: { favoriteId: number; displayOrder: number }) => {
          const fav = updated.find((f: FavoriteItem) => f.id === favoriteId);
          if (fav) fav.sortOrder = displayOrder;
        });
        return updated.sort((a: FavoriteItem, b: FavoriteItem) => a.sortOrder - b.sortOrder);
      });
      
      return { previousFavorites };
    },
    onError: (err: Error, _variables: unknown, context: { previousFavorites?: FavoriteItem[] } | undefined) => {
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
    
    const oldIndex = favorites.findIndex((fav: FavoriteItem) => fav.id === active.id);
    const newIndex = favorites.findIndex((fav: FavoriteItem) => fav.id === over.id);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const reorderedFavorites = arrayMove(favorites, oldIndex, newIndex) as FavoriteItem[];
      const updates = reorderedFavorites.map((fav, index) => ({
        favoriteId: fav.id,
        displayOrder: index,
      }));
      updateFavoriteOrderMutation.mutate({ updates });
    }
  };
  
  // 2-a (2026-10-14): WORK·회계·슈퍼관리자 탭 메뉴도 레지스트리에서. ERP 전용 모드 분기는 selectTabMenu 의 mode.
  const menuCtx = { isErpOnly, features: { GOGOGOPICK_INTEGRATION: FEATURES.GOGOGOPICK_INTEGRATION } };
  const workMenuItems = toMenuItems(selectTabMenu("work", menuCtx));
  const accountingMenuItems = toMenuItems(selectTabMenu("finance", menuCtx));
  const superAdminMenuItems = toMenuItems(selectTabMenu("superAdmin", menuCtx));

  
  // 모든 메뉴 통합 (즐겨찾기 검색용 + activeMenuItem 판별용)
  const allMenuItems = [...menuItems, ...accountingMenuItems, ...workMenuItems, ...superAdminMenuItems];

  // activeMenuItem: 모든 메뉴에서 정확한 경로 매칭을 먼저 시도하고, 없으면 가장 긴 접두사 매칭
  const activeMenuItem = (() => {
    // 1. 정확한 경로 매칭
    const exact = allMenuItems.find(item => item.path === location);
    if (exact) return exact;
    // 2. childRoutes 매칭
    const childMatch = allMenuItems.find(item => isChildRoute(item.path));
    if (childMatch) return childMatch;
    // 3. 가장 긴 접두사 매칭 (길이 내림차순으로 정렬하여 가장 구체적인 경로 먼저 매칭)
    const prefixMatch = [...allMenuItems]
      .filter(item => location.startsWith(item.path + "/"))
      .sort((a, b) => b.path.length - a.path.length);
    return prefixMatch[0] || null;
  })();
  
  // 즐겨찾기 메뉴 항목 생성
  const favoriteMenuItems = favorites.map((fav: FavoriteItem) => {
    const menuItem = allMenuItems.find(item => item.path === fav.menuPath);
    return menuItem ? { ...menuItem, favoriteId: fav.id } : null;
   }).filter(Boolean);

  // 데모 계정 허용 경로 (핵심 기능만)
  // 데모 계정 허용 경로 — shared/navigation/menuRegistry.ts DEMO_ALLOWED_PATHS

  // ★ Phase Plugin-3 (Menu Engine): Plugin 기반 동적 메뉴
  // - HACCP 탭: tenant 의 industry plugin 메뉴 사용 (plugin 미정 시 legacy menuItems 폴백)
  // - WORK / 회계 탭: 기존 그대로 (산업 무관)
  const { plugin: domainPlugin } = useDomainPlugin();
  const pluginBasedMenu: MenuItem[] = useMemo(
    () => buildMenuFromPlugin(domainPlugin).map((b) => ({
      icon: b.icon, label: b.label, path: b.path, roles: [...b.roles],
      ...(b.group ? { group: b.group } : {}),
      ...(b.requireModule ? { requireModule: b.requireModule as ModuleKey } : {}),
      ...(b.highlight ? { highlight: true } : {}),
    })),
    [domainPlugin],
  );

  // 표시할 메뉴 선택 (슈퍼관리자는 전용 메뉴 표시) — 2-a: 네 탭 모두 MenuItem[] 한 타입
  let displayedMenuItems: MenuItem[] = user?.role === "super_admin" && activeTab === "work"
    ? superAdminMenuItems
    : activeTab === "work"
    ? workMenuItems
    : activeTab === "finance"
    ? accountingMenuItems
    // HACCP 탭: plugin 기반 메뉴 (plugin 없으면 legacy menuItems 폴백)
    : (domainPlugin ? pluginBasedMenu : menuItems);

  // ★ 2026-05-09 (PR #279): super_admin 도 기본적으로 필터 적용
  // (식품 테넌트 진입 시 화장품/의약품 메뉴 혼재 문제 해결)
  // super_admin 이 명시적으로 "전체 메뉴 보기" 토글 시에만 우회.
  const applyMenuFilters = !industryLoading && (user?.role !== "super_admin" || !superAdminShowAllMenus);

  // ★ 업종코드 기반 메뉴 필터링 (requireModule이 지정된 메뉴만 체크)
  if (applyMenuFilters) {
    displayedMenuItems = displayedMenuItems.filter((item: any) => {
      if (!item.requireModule) return true; // requireModule 없으면 항상 표시
      return isIndustryModuleActive(item.requireModule);
    });
  }

  // ★ Phase 3 industry 격리 필터 — path 기반 자동 필터.
  //
  // 동작:
  //   /dashboard/{industry}/* 패턴의 메뉴는 테넌트 industry 와 일치해야만 표시.
  //   - 화장품 테넌트 (category=cosmetics) 는 /dashboard/medical-device/* 메뉴 hide
  //   - 의약품 테넌트 (category=pharma) 는 /dashboard/cosmetic/* 메뉴 hide
  //   - super_admin: 기본 적용, "전체 메뉴 보기" 토글 시 우회 (PR #279)
  //
  // 이유:
  //   PR-4/PR-5 에서 Phase 3 (pharmaceutical / medical-device / general-mfg) 메뉴
  //   추가 시 requireModule 만으로는 industry 격리 안 됨 (cosmetic GMP 와
  //   pharmaceutical KGMP 가 둘 다 modules.gmp=true 라서 서로 노출됨).
  //   path 기반 필터링으로 시각적 industry 격리 보장. 데이터는 기존부터 router
  //   industry view filter 가 격리.
  if (applyMenuFilters) {
    const tenantIndustry = mapCategoryToIndustryKey(industryCategory);
    displayedMenuItems = displayedMenuItems.filter((item: any) => {
      const required = getMenuRequiredIndustry(item.path);
      if (!required) return true; // industry-specific 패턴 아님 → 표시
      return tenantIndustry === required;
    });
  }

  // ★ 업종별 동적 라벨 적용
  if (!industryLoading && user?.role !== "super_admin") {
    const batchLabel = industryLabel("batch", "배치");
    const materialLabel = industryLabel("material", "원재료");
    const siteLabel = industryLabel("site", "공장");
    const labelMap: Record<string, string> = {
      "생산관리": `${industryLabel("product", "제품")} 생산관리`,
      "재고 관리": `${materialLabel} · 재고 관리`,
      "마스터 데이터": `${materialLabel} 마스터`,
      "품목 마스터": `품목 마스터`,
      "부적합제품관리": `부적합${industryLabel("product", "제품")}관리`,
    };
    displayedMenuItems = displayedMenuItems.map((item: any) => {
      if (labelMap[item.label]) {
        return { ...item, label: labelMap[item.label] };
      }
      return item;
    });
  }

  // 데모 계정: 허용된 메뉴만 표시
  if (isDemo) {
    displayedMenuItems = displayedMenuItems.filter(
      (item: any) => DEMO_ALLOWED_PATHS.includes(item.path)
    );
  }
  
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
          className="border-r border-sidebar-border"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-auto py-4 justify-center">
            {/* Premium Logo */}
            <div className="flex items-center gap-2.5 px-3 transition-all w-full mb-4">
              {!isCollapsed ? (
                <div className="flex items-center gap-2.5 w-full">
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-300/40 via-amber-200/20 to-blue-300/30 rounded-xl blur-md" />
                    <MillioMark className="relative w-10 h-10" />
                  </div>
                  <div className="flex flex-col leading-tight">
                    <h1 className="text-[16px] font-bold tracking-tight text-sidebar-foreground whitespace-nowrap font-serif">
                      Millio<span className="text-orange-500"> AI</span>
                    </h1>
                    <span className="text-[9px] text-sidebar-foreground/50 font-semibold tracking-[0.18em] uppercase -mt-0.5">
                      Manufacturing · AI
                    </span>
                    {/* 업종 카테고리 배지 */}
                    {!industryLoading && industryCategory !== "general" && user?.role !== "super_admin" && (
                      <span className="text-[8px] text-sidebar-foreground/35 font-medium tracking-wide -mt-0.5">
                        {industryCategory === "food" ? "식품제조" :
                         industryCategory === "cosmetics" ? "화장품" :
                         industryCategory === "supplement" ? "건기식" :
                         industryCategory === "pharma" ? "의약품" :
                         industryCategory === "electronics" ? "전자" :
                         industryCategory === "textile" ? "섬유" : "제조"}
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={toggleSidebar}
                  className="flex items-center justify-center w-full hover:bg-sidebar-accent rounded-lg p-2 transition-colors focus:outline-none"
                  aria-label="Open navigation"
                  title="메뉴 열기"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-300/30 to-blue-300/20 rounded-lg blur-sm" />
                    <MillioMark className="relative w-9 h-9" />
                  </div>
                </button>
              )}
            </div>
            
            {/* WORK/회계/HACCP tabs - Premium */}
            {!isCollapsed && (
              <div className="px-3 mb-2">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "work" | "finance" | "haccp")} className="w-full">
                  <TabsList className={`grid w-full grid-cols-${1 + (moduleERP && !isDemo ? 1 : 0) + (moduleHACCP ? 1 : 0)} text-[11px] h-8 bg-sidebar-accent/60`}>
                    <TabsTrigger value="work" className="text-[11px] h-6 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                      {isErpOnly ? "일반" : "WORK"}
                    </TabsTrigger>
                    {moduleERP && !isDemo && (
                      <TabsTrigger value="finance" className="text-[11px] h-6 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">회계</TabsTrigger>
                    )}
                    {moduleHACCP && (
                      <TabsTrigger value="haccp" className="text-[11px] h-6 data-[state=active]:bg-emerald-600 data-[state=active]:text-white">
                        {industryHasHACCP && industryHasGMP ? "HACCP+GMP"
                          : industryHasHACCP ? "HACCP"
                          : industryHasGMP ? "GMP"
                          : "품질인증"}
                      </TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>

                {/* ★ 2026-05-09 (PR #279): super_admin 전용 — 전체 메뉴 보기 토글
                    기본은 industry 격리 (food 테넌트면 cosmetic 메뉴 hide).
                    토글 ON 시 모든 industry 메뉴 노출 (테넌트 관리/디버깅 용도). */}
                {user?.role === "super_admin" && (
                  <div className="mt-2 flex items-center justify-between rounded border border-sidebar-border/40 px-2 py-1 text-[10px] text-muted-foreground">
                    <span title="기본은 테넌트 industry 격리 — 토글 ON 시 모든 메뉴 노출">
                      {superAdminShowAllMenus ? "🔓 전체 메뉴" : "🔒 테넌트 격리"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSuperAdminShowAllMenus((v) => !v)}
                      className="ml-2 rounded bg-sidebar-accent/80 px-2 py-0.5 text-[10px] hover:bg-sidebar-accent"
                    >
                      {superAdminShowAllMenus ? "격리" : "전체"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </SidebarHeader>

          <SidebarContent className="gap-0" ref={(el: HTMLDivElement | null) => {
            if (!el) return;
            // 스크롤 위치 복원
            const saved = sessionStorage.getItem("sidebar-scroll");
            if (saved && el.scrollTop === 0) el.scrollTop = Number(saved);
            // 스크롤 위치 저장
            const handler = () => sessionStorage.setItem("sidebar-scroll", String(el.scrollTop));
            el.addEventListener("scroll", handler, { passive: true });
            return () => el.removeEventListener("scroll", handler);
          }}>
            <SidebarMenu className="px-3 py-1">
              {(() => {
                const visibleItems = displayedMenuItems.filter((item: MenuItem) => user && item.roles?.includes(user.role));
                let prevGroup: string | undefined;

                return visibleItems.map((item: MenuItem, idx: number) => {
                  const exactMatch = location === item.path;
                  const childMatch = isChildRoute(item.path);
                  // startsWith 매칭: 다른 메뉴에 정확한 매칭이 있으면 사용하지 않음
                  const hasOtherExactMatch = displayedMenuItems.some(
                    (other: MenuItem) => other.path !== item.path && (location === other.path || isChildRoute(other.path))
                  );
                  const prefixMatch = !hasOtherExactMatch && location.startsWith(item.path + "/");
                  const isActive = exactMatch || childMatch || prefixMatch;

                  // 그룹 헤더 표시 여부 (이전 group 과 다를 때만)
                  const showGroupHeader = !isCollapsed && item.group && item.group !== prevGroup;
                  prevGroup = item.group;

                  return (
                    <div key={item.path}>
                      {showGroupHeader && (
                        <div className={cn("px-1 pb-1", idx === 0 ? "pt-0" : "pt-3")}>
                          <p className="text-[10px] font-semibold text-sidebar-foreground/50 uppercase tracking-wider">
                            {item.group}
                          </p>
                        </div>
                      )}
                      <SidebarMenuItem>
                        <div className="flex items-center gap-1 w-full">
                          <SidebarMenuButton
                            isActive={isActive}
                            onClick={() => setLocation(item.path)}
                            tooltip={item.label}
                            className={`h-9 font-normal flex-1 text-[13px] rounded-lg ${isActive ? "bg-emerald-50 text-emerald-700 font-medium dark:bg-emerald-500/10 dark:text-emerald-400" : "text-slate-600 hover:text-foreground hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"} ${(item as any).highlight ? "border border-primary/20 rounded-lg font-medium" : ""}`}
                          >
                            <item.icon
                              className={`h-4 w-4 ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"}`}
                            />
                            <span>{item.label}</span>
                          </SidebarMenuButton>
                          {!isCollapsed && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const isFavorited = favorites.some((fav: FavoriteItem) => fav.menuPath === item.path);
                                if (isFavorited) {
                                  const fav = favorites.find((f: FavoriteItem) => f.menuPath === item.path);
                                  if (fav) removeFavoriteMutation.mutate({ favoriteId: fav.id });
                                } else {
                                  addFavoriteMutation.mutate({
                                    menuPath: item.path,
                                    menuLabel: item.label,
                                    menuIcon: (item.icon as any).displayName || (item.icon as any).name || "FileText",
                                  });
                                  // WORK 탭이 아닌 탭에서 추가 시 안내 토스트
                                  // (즐겨찾기 섹션은 WORK 탭 허브에서만 표시됨)
                                  if (activeTab !== "work") {
                                    toast({
                                      title: `즐겨찾기 추가: ${item.label}`,
                                      description: "WORK 탭 하단의 즐겨찾기에서 확인할 수 있습니다.",
                                    });
                                  }
                                }
                              }}
                              className="p-1 hover:bg-accent rounded mr-2"
                              title={favorites.some((fav: FavoriteItem) => fav.menuPath === item.path) ? "즐겨찾기 제거" : "즐겨찾기 추가 (WORK 탭에서 확인)"}
                            >
                              <Star
                                className={cn(
                                  "h-4 w-4",
                                  favorites.some((fav: FavoriteItem) => fav.menuPath === item.path)
                                    ? "fill-amber-400/80 text-amber-400/80"
                                    : "text-muted-foreground/40"
                                )}
                              />
                            </button>
                          )}
                        </div>
                      </SidebarMenuItem>
                    </div>
                  );
                });
              })()}


              {/* Super Admin - Premium */}
              {user?.role === "super_admin" && activeTab === "work" && !isCollapsed && (
                <div className="px-3 py-2 mt-2">
                  <button
                    onClick={() => setLocation("/dashboard/super-admin")}
                    className="w-full group flex items-center gap-2.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5 transition-all hover:bg-primary/15 hover:border-primary/30"
                  >
                    <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
                      <Crown className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="flex flex-col items-start flex-1 min-w-0">
                      <span className="text-[13px] font-semibold text-sidebar-foreground">
                        Super Admin
                      </span>
                      <span className="text-[10px] text-sidebar-foreground/50">
                        관리자 패널
                      </span>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-sidebar-foreground/40 group-hover:text-sidebar-foreground/60 transition-colors" />
                  </button>
                </div>
              )}
              
              {/* 즐겨찾기 섹션 — WORK 탭 전용 허브 (원래 디자인 복원)
                  ★ 2026-04-14: 회계/HACCP 탭에서 표시하던 걸 WORK 탭으로 원복.
                     이유: 회계 탭에서 HACCP 메뉴(생산관리 등)가 즐겨찾기로 보이는
                     어색한 상황 발생. 즐겨찾기는 사용자가 원래 WORK 탭에서 한 곳에서
                     관리하도록 설계됨. 다른 탭에서 Star 클릭 시 toast 로 WORK 탭
                     안내 메시지 표시. */}
              {activeTab === "work" && favoriteMenuItems.length > 0 && !isCollapsed && (
                <>
                  <div className="px-3 py-2 mt-2">
                    <div className="h-px bg-sidebar-border" />
                  </div>
                  <div className="px-4 py-2">
                    <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
                      즐겨찾기
                    </p>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={favorites.map((fav: FavoriteItem) => fav.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {favoriteMenuItems
                        .filter((item: MenuItem) => user && item.roles?.includes(user.role))
                        .map((item: MenuItem) => {
                          const fav = favorites.find((f: FavoriteItem) => f.menuPath === item.path);
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
            </SidebarMenu>
            
          </SidebarContent>

          <SidebarFooter className="px-2 py-2 space-y-1">
            {/* AI 어시스턴트 - 심플 한 줄 버튼 (데모 모드에서는 숨김) */}
            {!isDemo && user && ["super_admin", "admin", "inspector"].includes(user.role) && (
              <button
                onClick={() => setLocation("/dashboard/ai-assistant")}
                className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium transition-all ${
                  location === "/dashboard/ai-assistant" || location.startsWith("/dashboard/ai-assistant/")
                    ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
                    : "text-sidebar-foreground/70 hover:bg-violet-500/10 hover:text-violet-600 dark:hover:text-violet-300"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                {!isCollapsed && (
                  <>
                    <span>AI 어시스턴트</span>
                    <span className="ml-auto text-[8px] bg-violet-500 text-white px-1 py-px rounded font-bold">N</span>
                  </>
                )}
              </button>
            )}

            {/* 생산 자동화 에이전트 — 허용된 이메일만 표시 */}
            {user && ["ipmachum@gmail.com", "sokoorymall@naver.com", "dduckdanji@naver.com", "danjimall@naver.com", "sokoorymall1@naver.com"].includes(user.email) && (
              <button
                onClick={() => setLocation("/dashboard/agent")}
                title="생산 자동화 에이전트"
                className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] font-medium transition-all ${
                  location === "/dashboard/agent"
                    ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                    : "text-sidebar-foreground/50 hover:bg-indigo-500/10 hover:text-indigo-500"
                }`}
              >
                <Bot className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                {!isCollapsed && <span className="text-[11px]">자동화 에이전트</span>}
              </button>
            )}

            {/* 구독 + 테마/접기 한 줄 */}
            {!isCollapsed && (
              <div className="flex items-center justify-between">
                {user?.role !== "super_admin" && (
                  <SubscriptionInfo isCollapsed={isCollapsed} />
                )}
                <div className="flex items-center gap-0.5 ml-auto">
                  <button
                    onClick={toggleSidebar}
                    className="h-6 w-6 flex items-center justify-center rounded text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                    title="접기"
                  >
                    <PanelLeft className="h-3 w-3" />
                  </button>
                  <button
                    onClick={toggleTheme}
                    className="h-6 w-6 flex items-center justify-center rounded text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
                    title={theme === "light" ? "다크" : "라이트"}
                  >
                    {theme === "light" ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            )}
            {isCollapsed && user?.role !== "super_admin" && (
              <SubscriptionInfo isCollapsed={isCollapsed} />
            )}

            {/* 출퇴근 위젯 (작업자 이상) */}
            {user && ["worker", "admin", "super_admin", "inspector"].includes(user.role) && (
              <ClockInOutWidget isCollapsed={isCollapsed} />
            )}

            {/* 유저 프로필 - 컴팩트 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-sidebar-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none">
                  <Avatar className="h-6 w-6 shrink-0 border border-sidebar-border">
                    <AvatarFallback className="text-[9px] font-semibold bg-primary/15 text-primary">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <p className="text-[11px] font-medium truncate leading-none text-sidebar-foreground">
                          {user?.name || "-"}
                        </p>
                        {user?.role === "admin" && (
                          <span className="text-[8px] px-1 py-px rounded bg-primary/15 text-primary font-semibold">Admin</span>
                        )}
                        {user?.role === "worker" && (
                          <span className="text-[8px] px-1 py-px rounded bg-blue-500/15 text-blue-400 font-semibold">Worker</span>
                        )}
                      </div>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{user?.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
                </div>
                <div className="h-px bg-border" />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive mt-1"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>로그아웃</span>
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
        {/* 데모 모드 배너 */}
        {isDemo && <DemoBanner onLogout={logout} />}
        {isMobile && (
          <div className="flex border-b border-border h-[72px] items-center justify-between bg-white dark:bg-card backdrop-blur-xl px-4 sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="h-9 w-9 p-0 flex items-center justify-center hover:bg-accent rounded-lg transition-colors">
                <PanelLeft className="h-4 w-4" />
              </SidebarTrigger>
              <span className="text-sm font-semibold tracking-tight text-foreground">
                {activeMenuItem?.label ?? "Menu"}
              </span>
            </div>
            <NotificationDropdown />
          </div>
        )}
        {!isMobile && (
          <div className="flex border-b border-border h-[72px] items-center justify-between bg-white dark:bg-card backdrop-blur-xl px-6 sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <span className="text-[15px] font-semibold text-foreground tracking-tight">
                {activeMenuItem?.label ?? ""}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <NotificationDropdown />
            </div>
          </div>
        )}
        {/* ★ 2026-05-11: min-w-0 + w-full — flex-1 만으로는 자식 wide table 이
            viewport 를 밀어내는 사고. SidebarInset 와 함께 적용해 모바일 좌우
            스와이프 + Table 자체 overflow-x-auto 가 정상 작동하게 한다. */}
        <main className="flex-1 min-w-0 w-full px-3 py-4 md:px-5 md:py-5">{children}</main>
      </SidebarInset>
    </>
  );
}

/* ═══════════════════════════════════════════
   출퇴근 위젯 (사이드바 프로필 위)
   ═══════════════════════════════════════════ */
function ClockInOutWidget({ isCollapsed }: { isCollapsed: boolean }) {
  const { data: myToday, refetch } = trpc.hr.myToday.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 1,
  });
  const clockInMut = trpc.hr.clockIn.useMutation({
    onSuccess: () => refetch(),
  });
  const clockOutMut = trpc.hr.clockOut.useMutation({
    onSuccess: () => refetch(),
  });

  if (isCollapsed) {
    // 접힌 상태: 아이콘만
    return (
      <div className="flex justify-center py-1.5">
        {myToday ? (
          myToday.clockOut ? (
            <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center" title={`퇴근 ${myToday.clockOut}`}>
              <CheckCircle className="h-3 w-3 text-blue-600" />
            </div>
          ) : (
            <button onClick={() => clockOutMut.mutate()}
              className="h-6 w-6 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition" title="퇴근하기">
              <LogOut className="h-3 w-3 text-red-600" />
            </button>
          )
        ) : (
          <button onClick={() => clockInMut.mutate()}
            className="h-6 w-6 rounded-full bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center transition" title="출근하기">
            <LogIn className="h-3 w-3 text-emerald-600" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5 border-t border-sidebar-border space-y-1">
      {/* 출근 버튼/상태 */}
      <div className="flex items-center gap-1.5">
        {myToday ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <LogIn className="h-3 w-3 text-emerald-600 shrink-0" />
            <span className="text-[10px] font-bold text-emerald-700">출근</span>
            <span className="text-[10px] font-mono text-emerald-600">{myToday.clockIn?.slice(0, 5)}</span>
          </div>
        ) : (
          <button onClick={() => clockInMut.mutate()} disabled={clockInMut.isPending}
            className="w-full text-[10px] py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 font-bold transition flex items-center justify-center gap-1.5 shadow-sm">
            <LogIn className="h-3.5 w-3.5" /> 출근
          </button>
        )}
      </div>

      {/* 퇴근 버튼/상태 (출근 후에만) */}
      {myToday && (
        <div className="flex items-center gap-1.5">
          {myToday.clockOut ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <LogOut className="h-3 w-3 text-blue-600 shrink-0" />
              <span className="text-[10px] font-bold text-blue-700">퇴근</span>
              <span className="text-[10px] font-mono text-blue-600">{myToday.clockOut?.slice(0, 5)}</span>
              <span className="text-[9px] text-muted-foreground ml-auto">{myToday.workHours.toFixed(1)}h</span>
            </div>
          ) : (
            <button onClick={() => clockOutMut.mutate()} disabled={clockOutMut.isPending}
              className="w-full text-[10px] py-1.5 rounded-md bg-rose-500 text-white hover:bg-rose-600 font-bold transition flex items-center justify-center gap-1.5 shadow-sm">
              <LogOut className="h-3.5 w-3.5" /> 퇴근
            </button>
          )}
        </div>
      )}
    </div>
  );
}
