import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Droplet,
  Users,
  Sparkles,
  Activity,
  Thermometer,
  Filter,
  Zap,
  Sun,
  AlertTriangle,
  Wrench,
  GraduationCap,
  FlaskConical,
  Scale,
  FileCheck,
  CheckCircle2,
  Clock,
  XCircle,
  Settings,
  Cog,
  Bug,
  Droplets,
  Trash2,
  FolderOpen,
} from "lucide-react";

// 체크리스트 카테고리 정의
const checklistCategories = [
  {
    id: "hygiene",
    title: "위생 · 환경 관리",
    description: "위생 점검, 종사자 건강, 세척·소독, 표면오염도",
    icon: Droplet,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    items: [
      {
        id: "hygiene-inspection",
        title: "위생점검",
        icon: Droplet,
        path: "/quality/checklists/list?category=위생",
        status: "completed", // completed, pending, overdue
      },
      {
        id: "employee-health",
        title: "종사자 건강상태",
        icon: Users,
        path: "/quality/checklists/list?category=위생",
        status: "pending",
      },
      {
        id: "sanitation",
        title: "세척·소독",
        icon: Sparkles,
        path: "/quality/checklists/list?category=위생",
        status: "completed",
      },
      {
        id: "surface-contamination",
        title: "표면오염도",
        icon: Activity,
        path: "/quality/checklists/list?category=위생",
        status: "pending",
      },
    ],
  },
  {
    id: "facility",
    title: "설비 · 시설 관리",
    description: "온도 관리, 필터 관리, 탐지장비 점검, 조도점검",
    icon: Thermometer,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    items: [
      {
        id: "temperature-management",
        title: "온도관리",
        icon: Thermometer,
        path: "/quality/checklists/list?category=시설",
        status: "completed",
      },
      {
        id: "filter-management",
        title: "필터 관리",
        icon: Filter,
        path: "/quality/checklists/list?category=시설",
        status: "pending",
      },
      {
        id: "equipment-inspection",
        title: "탐지장비 점검",
        icon: Zap,
        path: "/quality/checklists/list?category=시설",
        status: "completed",
      },
      {
        id: "illumination-inspection",
        title: "조도점검",
        icon: Sun,
        path: "/quality/checklists/list?category=시설",
        status: "pending",
      },
    ],
  },
  {
    id: "quality",
    title: "품질 · 시정 · 교육",
    description: "부적합 처리, 검교정 관리, 교육훈련일지",
    icon: AlertTriangle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    items: [
      {
        id: "nonconformance",
        title: "부적합 처리",
        icon: AlertTriangle,
        path: "/quality/checklists/list?category=품질",
        status: "overdue",
      },
      {
        id: "calibration",
        title: "검교정 관리",
        icon: Wrench,
        path: "/quality/checklists/list?category=품질",
        status: "completed",
      },
      {
        id: "training-log",
        title: "교육훈련일지",
        icon: GraduationCap,
        path: "/quality/checklists/list?category=품질",
        status: "pending",
      },
    ],
  },
  {
    id: "inspection",
    title: "검사 · 성적 · 품질보증",
    description: "자가품질검사, 중량·용량 검사, 제품검사 성적서",
    icon: FlaskConical,
    color: "text-green-600",
    bgColor: "bg-green-50",
    items: [
      {
        id: "self-inspection",
        title: "자가품질검사",
        icon: FlaskConical,
        path: "/quality/checklists/list?category=검사",
        status: "completed",
      },
      {
        id: "weight-volume-inspection",
        title: "중량·용량 검사",
        icon: Scale,
        path: "/quality/checklists/list?category=검사",
        status: "pending",
      },
      {
        id: "product-test-report",
        title: "제품검사 성적서",
        icon: FileCheck,
        path: "/quality/checklists/list?category=검사",
        status: "completed",
      },
    ],
  },
  {
    id: "equipment",
    title: "설비·기구 관리",
    description: "설비 리스트(설비대장), 설비 점검·유지보수",
    icon: Cog,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    items: [
      {
        id: "equipment-list",
        title: "설비 리스트(설비대장)",
        icon: Cog,
        path: "/quality/checklists/list?category=설비",
        status: "pending",
      },
      {
        id: "equipment-maintenance",
        title: "설비 점검·유지보수",
        icon: Wrench,
        path: "/quality/checklists/list?category=설비",
        status: "pending",
      },
    ],
  },
  {
    id: "pest-control",
    title: "방충·방서 관리",
    description: "방충·방서 설비 리스트, 트랩 위치도, 포획 개체 수 기록",
    icon: Bug,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    items: [
      {
        id: "pest-control-equipment",
        title: "방충·방서 설비 리스트",
        icon: Bug,
        path: "/quality/checklists/list?category=방충방서",
        status: "pending",
      },
      {
        id: "pest-control-record",
        title: "포획 개체 수 기록",
        icon: FileCheck,
        path: "/quality/checklists/list?category=방충방서",
        status: "pending",
      },
    ],
  },
  {
    id: "water",
    title: "용수 관리",
    description: "상수도/지하수 구분, 정기 검사 여부, 검사 결과 보관",
    icon: Droplets,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    items: [
      {
        id: "water-source",
        title: "용수 구분 및 검사",
        icon: Droplets,
        path: "/quality/checklists/list?category=용수",
        status: "pending",
      },
      {
        id: "water-test-report",
        title: "검사 결과 보관",
        icon: FileCheck,
        path: "/quality/checklists/list?category=용수",
        status: "pending",
      },
    ],
  },
  {
    id: "waste",
    title: "폐기물 관리",
    description: "폐기물 종류별 구분, 일일 폐기 기록, 외부 위탁 처리 내역",
    icon: Trash2,
    color: "text-gray-600",
    bgColor: "bg-gray-50",
    items: [
      {
        id: "waste-classification",
        title: "폐기물 종류별 구분",
        icon: Trash2,
        path: "/quality/checklists/list?category=폐기물",
        status: "pending",
      },
      {
        id: "waste-disposal-record",
        title: "일일 폐기 기록",
        icon: FileCheck,
        path: "/quality/checklists/list?category=폐기물",
        status: "pending",
      },
    ],
  },
  {
    id: "document",
    title: "문서·기록 관리",
    description: "기준서 최신본 여부, 제·개정 이력 관리, 기록 보존 기간 관리",
    icon: FolderOpen,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    items: [
      {
        id: "document-standard",
        title: "기준서 최신본 관리",
        icon: FolderOpen,
        path: "/quality/checklists/list?category=문서",
        status: "pending",
      },
      {
        id: "document-revision",
        title: "제·개정 이력 관리",
        icon: FileCheck,
        path: "/quality/checklists/list?category=문서",
        status: "pending",
      },
    ],
  },
];

// 상태 아이콘 및 색상
const statusConfig = {
  completed: {
    icon: CheckCircle2,
    label: "완료",
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  pending: {
    icon: Clock,
    label: "미작성",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100",
  },
  overdue: {
    icon: XCircle,
    label: "기한 초과",
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
};

export default function QualityChecklistMap() {
  // 체크리스트 통계 조회
  const { data: stats, isLoading: isStatsLoading } = trpc.qualityChecklist.getStatistics.useQuery();
  
  // 카테고리별 최근 작성 조회
  const { data: recentByCategory } = trpc.qualityChecklist.getRecentByCategory.useQuery();

  return (
    <DashboardLayout>
      <div className="container py-6">
        {/* 헤더 */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">HACCP 체크리스트</h1>
            <p className="text-muted-foreground">
              HACCP 체크리스트 전체 지형도를 한눈에 확인하고, 각 항목을 관리하세요.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href="/quality/checklists/list">
              <Button variant="default" className="gap-2">
                <FileCheck className="w-4 h-4" />
                체크리스트 목록
              </Button>
            </Link>
            <Link href="/quality/checklists/create">
              <Button variant="default" className="gap-2">
                <FileCheck className="w-4 h-4" />
                새 체크리스트
              </Button>
            </Link>
            <Link href="/quality/approvals">
              <Button variant="outline" className="gap-2">
                <CheckCircle2 className="w-4 h-4" />
                승인 대기
              </Button>
            </Link>
            <Link href="/quality/templates">
              <Button variant="outline" className="gap-2">
                <Settings className="w-4 h-4" />
                템플릿 관리
              </Button>
            </Link>
            <Link href="/quality/statistics">
              <Button variant="outline" className="gap-2">
                <Activity className="w-4 h-4" />
                통계 대시보드
              </Button>
            </Link>
            <Link href="/quality/notification-settings">
              <Button variant="outline" className="gap-2">
                <Settings className="w-4 h-4" />
                알림 설정
              </Button>
            </Link>
          </div>
        </div>

        {/* 통계 대시보드 - 컴팩트 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* 오늘 상태 요약 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">오늘 체크리스트 요약</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-full bg-blue-100">
                    <FileCheck className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{isStatsLoading ? "-" : (stats?.inProgress || 0) + (stats?.completed || 0) + (stats?.pendingApproval || 0)}</p>
                    <p className="text-xs text-muted-foreground">전체</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-full bg-green-100">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{isStatsLoading ? "-" : stats?.completed || 0}</p>
                    <p className="text-xs text-muted-foreground">완료</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-full bg-red-100">
                    <XCircle className="h-4 w-4 text-red-600" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{isStatsLoading ? "-" : 0}</p>
                    <p className="text-xs text-muted-foreground">기한초과</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 주간/월간 완료율 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">주간/월간 완료율</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">주간</span>
                    <span className="text-xs font-bold text-green-600">
                      {isStatsLoading ? "-" : "85%"}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-green-600 h-1.5 rounded-full" style={{ width: "85%" }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">월간</span>
                    <span className="text-xs font-bold text-blue-600">
                      {isStatsLoading ? "-" : "78%"}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5">
                    <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: "78%" }}></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>



        {/* 카테고리별 체크리스트 */}
        <div className="space-y-8">
          {checklistCategories.map((category) => {
            const CategoryIcon = category.icon;
            return (
              <div key={category.id}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${category.bgColor}`}>
                    <CategoryIcon className={`h-6 w-6 ${category.color}`} />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold">{category.title}</h2>
                    <p className="text-sm text-muted-foreground">{category.description}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {category.items.map((item) => {
                    const ItemIcon = item.icon;
                    const StatusIcon = statusConfig[item.status as keyof typeof statusConfig].icon;
                    const statusInfo = statusConfig[item.status as keyof typeof statusConfig];

                    return (
                      <Card key={item.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <ItemIcon className="h-5 w-5 text-muted-foreground" />
                              <CardTitle className="text-lg">{item.title}</CardTitle>
                            </div>
                            <Badge className={`${statusInfo.bgColor} ${statusInfo.color} border-0`}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusInfo.label}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Link href={item.path}>
                            <Button variant="outline" className="w-full">
                              {item.status === "completed" ? "기록 보기" : "작성하기"}
                            </Button>
                          </Link>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
