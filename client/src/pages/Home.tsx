import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ClipboardCheck, 
  Wrench, 
  Droplet, 
  Bug, 
  GraduationCap, 
  FileText, 
  Eye,
  Shield,
  ArrowRight,
  Bell,
  AlertTriangle,
  Clock
} from "lucide-react";
import { trpc } from "@/lib/trpc";

const modules = [
  {
    id: "calibration",
    title: "검교정 관리",
    description: "검교정설비 등록 및 검교정 기록 관리",
    icon: Wrench,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
    paths: {
      equipment: "/calibration/equipment",
      records: "/calibration/records",
    },
  },
  {
    id: "hygiene",
    title: "일반위생관리",
    description: "일반위생 점검 체크리스트 작성 및 관리",
    icon: Droplet,
    color: "text-cyan-500",
    bgColor: "bg-cyan-50",
    path: "/hygiene/checklists",
  },
  {
    id: "pest-control",
    title: "방충·방서 점검",
    description: "포충등/포서통 위치별 포획수 기록",
    icon: Bug,
    color: "text-green-500",
    bgColor: "bg-green-50",
    path: "/pest-control/checklists",
  },
  {
    id: "training",
    title: "교육 훈련 일지",
    description: "직원 교육 훈련 기록 관리",
    icon: GraduationCap,
    color: "text-purple-500",
    bgColor: "bg-purple-50",
    path: "#",
    disabled: true,
  },
  {
    id: "health-cert",
    title: "보건증 관리",
    description: "직원 보건증 유효기간 관리",
    icon: FileText,
    color: "text-pink-500",
    bgColor: "bg-pink-50",
    path: "#",
    disabled: true,
  },
  {
    id: "validation",
    title: "유효성 평가",
    description: "HACCP 시스템 유효성 평가 기록",
    icon: Shield,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    path: "#",
    disabled: true,
  },
  {
    id: "inspection",
    title: "육안검사 일지",
    description: "원료 및 제품 육안검사 기록",
    icon: Eye,
    color: "text-indigo-500",
    bgColor: "bg-indigo-50",
    path: "#",
    disabled: true,
  },
  {
    id: "incoming",
    title: "입고성적서 관리",
    description: "원료 입고성적서 등록 및 관리",
    icon: ClipboardCheck,
    color: "text-teal-500",
    bgColor: "bg-teal-50",
    path: "#",
    disabled: true,
  },
];

export default function Home() {
  const [, setLocation] = useLocation();
  
  // 알람 통계 조회
  const { data: alertStats } = trpc.stockAlerts.getStats.useQuery();

  const handleModuleClick = (module: typeof modules[0]) => {
    if (module.disabled) {
      return;
    }
    if (module.paths) {
      // 검교정 관리는 설비 목록으로 이동
      setLocation(module.paths.equipment);
    } else if (module.path) {
      setLocation(module.path);
    }
  };

  return (
    <div className="container mx-auto py-8">
      {/* 헤더 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Millio AI | 제조기반 올인원 AI ERP</h1>
        <p className="text-muted-foreground">
          공장의 모든 데이터를 하나로. 생산·재고·품질·HACCP·회계 통합 운영 허브입니다.
        </p>
      </div>

      {/* 알람 통계 카드 */}
      {alertStats && alertStats.total > 0 && (
        <Card className="mb-6 border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-orange-500" />
              재고 알람
            </CardTitle>
            <CardDescription>현재 미해제 알람이 {alertStats.total}건 있습니다</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">만료됨</p>
                  <p className="text-2xl font-bold text-red-600">{alertStats.expired}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">만료 임박</p>
                  <p className="text-2xl font-bold text-orange-600">{alertStats.expiringSoon}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">재고 부족</p>
                  <p className="text-2xl font-bold text-yellow-600">{alertStats.lowStock}</p>
                </div>
              </div>
            </div>
            <Button 
              className="w-full mt-4" 
              variant="outline"
              onClick={() => setLocation("/stock-alerts")}
            >
              알람 목록 보기
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 모듈 카드 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Card
              key={module.id}
              className={`cursor-pointer transition-all hover:shadow-lg ${
                module.disabled ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-1"
              }`}
              onClick={() => handleModuleClick(module)}
            >
              <CardHeader>
                <div className={`w-12 h-12 rounded-lg ${module.bgColor} flex items-center justify-center mb-4`}>
                  <Icon className={`h-6 w-6 ${module.color}`} />
                </div>
                <CardTitle className="flex items-center justify-between">
                  {module.title}
                  {!module.disabled && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                </CardTitle>
                <CardDescription>{module.description}</CardDescription>
              </CardHeader>
              {module.disabled && (
                <CardContent>
                  <p className="text-xs text-muted-foreground">준비 중...</p>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* 빠른 시작 가이드 */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>빠른 시작 가이드</CardTitle>
          <CardDescription>HACCP 기초관리 시스템 사용 방법</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
              1
            </div>
            <div>
              <h4 className="font-semibold mb-1">검교정설비 등록</h4>
              <p className="text-sm text-muted-foreground">
                먼저 검교정설비를 등록하고, 정기적으로 검교정 기록을 작성하세요.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
              2
            </div>
            <div>
              <h4 className="font-semibold mb-1">일반위생관리 점검</h4>
              <p className="text-sm text-muted-foreground">
                매일 또는 주기적으로 일반위생관리 체크리스트를 작성하세요.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold flex-shrink-0">
              3
            </div>
            <div>
              <h4 className="font-semibold mb-1">방충·방서 점검</h4>
              <p className="text-sm text-muted-foreground">
                정기적으로 포충등/포서통의 포획수를 기록하고 관리하세요.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
