import { ReactNode, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Building2, 
  Activity, 
  FileText,
  LayoutDashboard,
  Briefcase,
  Calculator,
  FlaskConical,
  X,
  Menu,
  LogOut,
  User as UserIcon
} from "lucide-react";

interface SuperAdminLayoutProps {
  children: ReactNode;
}

export default function SuperAdminLayout({ children }: SuperAdminLayoutProps) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  const [location, setLocation] = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setLocation("/login");
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user || user.role !== "super_admin") {
    setLocation("/");
    return null;
  }

  const superAdminMenuItems = [
    {
      icon: LayoutDashboard,
      label: "슈퍼관리자 대시보드",
      path: "/dashboard/super-admin",
    },
    {
      icon: Users,
      label: "클라이언트 승인",
      path: "/dashboard/user-approval",
    },
    {
      icon: Building2,
      label: "테넌트 관리",
      path: "/dashboard/tenant-management",
    },
    {
      icon: Activity,
      label: "시스템 모니터링",
      path: "/dashboard/system-monitoring",
    },
    {
      icon: FileText,
      label: "감사 로그",
      path: "/dashboard/audit-logs",
    },
  ];

  const quickAccessItems = [
    {
      icon: Briefcase,
      label: "WORK 탭",
      path: "/dashboard",
    },
    {
      icon: Calculator,
      label: "회계 탭",
      path: "/dashboard/accounting",
    },
    {
      icon: FlaskConical,
      label: "HACCP 탭",
      path: "/dashboard/haccp",
    },
  ];

  const handleMenuClick = (path: string) => {
    setLocation(path);
    setIsSidebarOpen(false); // 모바일에서 메뉴 클릭 시 사이드바 닫기
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* 모바일 오버레이 */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* 슈퍼 관리자 사이드메뉴바 */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-80 lg:w-64
        bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 
        text-white flex flex-col
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* 헤더 */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-lg">👑</span>
            </div>
            <div>
              <h2 className="text-lg font-bold">슈퍼관리자</h2>
              <p className="text-xs text-white/70">Super Admin Panel</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-white hover:bg-white/10 h-6 w-6 p-0"
            onClick={() => {
              setLocation("/dashboard");
              setIsSidebarOpen(false);
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* 메뉴 아이템 */}
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {superAdminMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            
            return (
              <Button
                key={item.path}
                variant="ghost"
                className={`w-full justify-start gap-3 text-white hover:bg-white/10 ${
                  isActive 
                    ? "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700" 
                    : ""
                }`}
                onClick={() => handleMenuClick(item.path)}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Button>
            );
          })}

          {/* 빠른 이동 구분선 */}
          <div className="pt-4 pb-2">
            <div className="flex items-center gap-2 text-xs text-white/50 px-3">
              <span>⚙️ 빠른 이동</span>
            </div>
          </div>

          {quickAccessItems.map((item) => {
            const Icon = item.icon;
            
            return (
              <Button
                key={item.path}
                variant="ghost"
                className="w-full justify-start gap-3 text-white/80 hover:bg-white/10 hover:text-white"
                onClick={() => handleMenuClick(item.path)}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Button>
            );
          })}
        </nav>

        {/* 사용자 정보 및 로그아웃 */}
        <div className="p-4 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center">
              <UserIcon className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{user?.name}</p>
              <p className="text-xs text-white/60 truncate">{user?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-white/80 hover:bg-red-500/20 hover:text-red-300"
            onClick={handleLogout}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="h-5 w-5" />
            {logoutMutation.isPending ? "로그아웃 중..." : "로그아웃"}
          </Button>
        </div>
      </aside>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 overflow-auto w-full">
        {/* 모바일 헤더 (햄버거 메뉴) */}
        <div className="lg:hidden sticky top-0 z-30 bg-background border-b px-4 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSidebarOpen(true)}
            className="h-9 w-9 p-0"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">슈퍼 관리자</h1>
        </div>

        <div className="container mx-auto py-6 px-4 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
