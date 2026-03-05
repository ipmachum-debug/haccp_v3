import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
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
  AlertCircle,
  List,
  PlusCircle,
  Truck,
  Building2,
  ClipboardCheck,
  ShieldCheck,
  HeartPulse,
  FileText,
  Microscope,
  ThermometerSun,
  Gauge,
  Package,
  UserCheck,
  Handshake,
  MessageSquareWarning,
} from "lucide-react";

// K-HACCP 표준 체크리스트 카테고리 정의
const checklistCategories = [
  {
    id: "hygiene",
    title: "위생 관리",
    description: "개인위생, 종사자 건강, 세척·소독, 표면오염도, 위생시설, 작업장위생",
    icon: Droplet,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    filterLabel: "위생",
    items: [
      {
        id: "personal-hygiene",
        title: "개인 위생관리 점검표",
        description: "종사자 개인위생 상태를 점검합니다",
        icon: UserCheck,
        listPath: "/personal-hygiene-check",
        createPath: "/personal-hygiene-check/new",
      },
      {
        id: "employee-health",
        title: "종사자 건강상태 확인 일지",
        description: "작업장 출입 전 종사자 건강상태를 확인합니다",
        icon: HeartPulse,
        listPath: "/employee-health-check",
        createPath: "/employee-health-check/new",
      },
      {
        id: "sanitation",
        title: "세척소독 관리 대장",
        description: "세척·소독 제품 및 사용 기록을 관리합니다",
        icon: Sparkles,
        listPath: "/sanitation-record",
        createPath: "/sanitation-record/new",
      },
      {
        id: "surface-contamination",
        title: "표면오염도 검사 성적서",
        description: "표면오염도 검사 결과를 기록합니다",
        icon: Microscope,
        listPath: "/surface-contamination-test",
        createPath: "/surface-contamination-test/new",
      },
      {
        id: "hygiene-facility",
        title: "위생시설 점검일지",
        description: "위생시설의 상태를 점검합니다",
        icon: Building2,
        listPath: "/hygiene-facility-check",
        createPath: "/hygiene-facility-check/new",
      },
      {
        id: "workplace-hygiene",
        title: "작업장 위생관리 점검표",
        description: "작업장 전반의 위생 상태를 점검합니다",
        icon: ClipboardCheck,
        listPath: "/workplace-hygiene-check",
        createPath: "/workplace-hygiene-check/new",
      },
    ],
  },
  {
    id: "facility",
    title: "시설·설비 관리",
    description: "온·습도, 냉장·냉동 온도, 필터, 조도, 차량온도",
    icon: Thermometer,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    filterLabel: "시설",
    items: [
      {
        id: "temperature-humidity",
        title: "온·습도 점검표",
        description: "각 공간의 온·습도를 점검합니다",
        icon: ThermometerSun,
        listPath: "/temperature-humidity-check",
        createPath: "/temperature-humidity-check/new",
      },
      {
        id: "cold-storage-temperature",
        title: "냉장·냉동창고 자동온도 기록지",
        description: "냉장·냉동창고의 온도를 기록합니다",
        icon: Thermometer,
        listPath: "/refrigeration-check",
        createPath: "/refrigeration-check/new",
      },
      {
        id: "filter-management",
        title: "압축공기 필터, 에어컨 필터 관리대장",
        description: "압축공기 및 에어컨 필터를 관리합니다",
        icon: Filter,
        listPath: "/air-compressor",
        createPath: "/air-compressor/new",
      },
      {
        id: "illumination",
        title: "조도점검표",
        description: "작업장 조도를 점검합니다",
        icon: Sun,
        listPath: "/illumination-check",
        createPath: "/illumination-check/new",
      },
      {
        id: "vehicle-temperature",
        title: "입·출고 차량 온도기록지",
        description: "입·출고 차량의 온도를 기록합니다",
        icon: Truck,
        listPath: "/vehicle-temperature-check",
        createPath: "/vehicle-temperature-check/new",
      },
      {
        id: "equipment-history",
        title: "시설·설비 이력카드",
        description: "시설·설비의 이력을 관리합니다",
        icon: Cog,
        listPath: "/equipment-history",
        createPath: "/equipment-history/new",
      },
      {
        id: "equipment-inspection",
        title: "시설·설비·제조도구 점검표",
        description: "시설·설비·제조도구를 점검합니다",
        icon: Wrench,
        listPath: "/equipment-inspection",
        createPath: "/equipment-inspection/new",
      },
    ],
  },
  {
    id: "quality",
    title: "품질·시정·교육",
    description: "부적합품 관리, 검교정, 교육훈련, 소비자불만",
    icon: AlertTriangle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    filterLabel: "품질",
    items: [
      {
        id: "nonconformance",
        title: "부적합품 관리 점검표",
        description: "부적합품 발생 및 처리를 관리합니다",
        icon: AlertTriangle,
        listPath: "/quality-issue-record",
        createPath: "/quality-issue-record/new",
      },
      {
        id: "calibration",
        title: "검교정 관리",
        description: "계측기기 검교정을 관리합니다",
        icon: Gauge,
        listPath: "/quality/calibration/list",
        createPath: "/quality/calibration/new",
      },
      {
        id: "training-log",
        title: "교육훈련일지",
        description: "교육훈련 기록을 관리합니다",
        icon: GraduationCap,
        listPath: "/training-log",
        createPath: "/training-log/new",
      },
      {
        id: "consumer-complaint",
        title: "소비자 불만 관리 일지",
        description: "소비자 불만 접수 및 처리를 관리합니다",
        icon: MessageSquareWarning,
        listPath: "/consumer-complaint",
        createPath: "/consumer-complaint/new",
      },
    ],
  },
  {
    id: "inspection",
    title: "검사·성적·품질보증",
    description: "자가품질검사, 중량·품질검사, 제품검사, 완제품출고검사",
    icon: FlaskConical,
    color: "text-green-600",
    bgColor: "bg-green-50",
    filterLabel: "검사",
    items: [
      {
        id: "self-inspection",
        title: "자가품질검사",
        description: "자가품질검사 기록을 관리합니다",
        icon: FlaskConical,
        listPath: "/quality/self-inspection",
        createPath: "/quality/self-inspection/new",
      },
      {
        id: "weight-quality",
        title: "중량 및 품질 검사 일지",
        description: "중량 및 품질 검사를 기록합니다",
        icon: Scale,
        listPath: "/weight-quality-check",
        createPath: "/weight-quality-check/new",
      },
      {
        id: "product-test-report",
        title: "제품검사 성적서",
        description: "제품검사 성적서를 관리합니다",
        icon: FileCheck,
        listPath: "/product-test-report",
        createPath: "/product-test-report/new",
      },
      {
        id: "product-test-log",
        title: "제품 검사 일지",
        description: "제품 검사 일지를 기록합니다",
        icon: FileText,
        listPath: "/product-test-log",
        createPath: "/product-test-log/new",
      },
      {
        id: "finished-product",
        title: "완제품 출고검사 일지",
        description: "완제품 출고 시 검사를 기록합니다",
        icon: Package,
        listPath: "/finished-product-check",
        createPath: "/finished-product-check/new",
      },
      {
        id: "supplier-inspection",
        title: "협력업체 점검표",
        description: "협력업체를 점검합니다",
        icon: Handshake,
        listPath: "/supplier-inspection",
        createPath: "/supplier-inspection/new",
      },
    ],
  },
  {
    id: "pest-control",
    title: "방충·방서 관리",
    description: "방충·방서 점검, 공중낙하세균 검사",
    icon: Bug,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    filterLabel: "방충",
    items: [
      {
        id: "pest-control-checklist",
        title: "방충·방서 점검표",
        description: "방충·방서 상태를 점검합니다",
        icon: Bug,
        listPath: "/pest-control-checklist",
        createPath: "/pest-control-checklist/new",
      },
      {
        id: "airborne-bacteria",
        title: "공중낙하세균 검사 성적서",
        description: "공중낙하세균 검사 결과를 기록합니다",
        icon: Zap,
        listPath: "/airborne-bacteria-test",
        createPath: "/airborne-bacteria-test/new",
      },
      {
        id: "food-recall",
        title: "식품 회수 안내문",
        description: "식품 회수 안내문을 관리합니다",
        icon: ShieldCheck,
        listPath: "/food-recall-notice",
        createPath: "/food-recall-notice/new",
      },
    ],
  },
  {
    id: "water",
    title: "용수 관리",
    description: "용수검사 성적서, 용수관리 점검표",
    icon: Droplets,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
    filterLabel: "용수",
    items: [
      {
        id: "water-quality-test",
        title: "용수검사 성적서",
        description: "용수검사 결과를 관리합니다",
        icon: Droplets,
        listPath: "/water-quality-test",
        createPath: "/water-quality-test/new",
      },
      {
        id: "water-management",
        title: "용수관리 점검표",
        description: "용수 관리 상태를 점검합니다",
        icon: Droplet,
        listPath: "/water-management-check",
        createPath: "/water-management-check/new",
      },
    ],
  },
  {
    id: "document",
    title: "문서·기록·기타",
    description: "업무인수인계서, 보건증 관리",
    icon: FolderOpen,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    filterLabel: "문서",
    items: [
      {
        id: "handover-document",
        title: "업무 인수인계서",
        description: "업무 인수인계 기록을 관리합니다",
        icon: FolderOpen,
        listPath: "/handover-document",
        createPath: "/handover-document/new",
      },
      {
        id: "health-certificate",
        title: "보건증 관리",
        description: "종사자 보건증을 관리합니다",
        icon: Users,
        listPath: "/health-certificate",
        createPath: "/health-certificate/new",
      },
    ],
  },
];

export default function QualityChecklistMap() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  
  // 체크리스트 통계 조회
  const { data: stats, isLoading: isStatsLoading } = trpc.qualityChecklist.getStatistics.useQuery();
  
  // 필터링된 카테고리
  const filteredCategories = selectedCategory === "all" 
    ? checklistCategories 
    : checklistCategories.filter(cat => cat.filterLabel === selectedCategory);

  // 카테고리 필터 버튼
  const categoryFilters = [
    { id: "all", label: "전체" },
    { id: "위생", label: "위생" },
    { id: "시설", label: "시설" },
    { id: "품질", label: "품질" },
    { id: "검사", label: "검사" },
    { id: "방충", label: "방충" },
    { id: "용수", label: "용수" },
    { id: "문서", label: "문서" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">HACCP 기타일지 관리</h1>
          <p className="text-muted-foreground">
            K-HACCP 표준 양식에 맞춰 각 항목별 일지를 작성하고 관리합니다. 카테고리를 선택하여 필요한 일지를 찾아보세요.
          </p>
        </div>

        {/* 알람 박스 & 통계 대시보드 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* 알람 박스 */}
          <Alert className="border-yellow-200 bg-yellow-50">
            <AlertCircle className="h-4 w-4 text-yellow-600" />
            <AlertTitle className="text-yellow-800">중요 알림</AlertTitle>
            <AlertDescription className="text-yellow-700">
              오늘 작성해야 할 체크리스트가 <strong>3건</strong> 있습니다. 기한이 지나기 전에 작성해주세요.
            </AlertDescription>
          </Alert>

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

        {/* 카테고리 필터 버튼 */}
        <div className="flex flex-wrap gap-2 mb-6">
          {categoryFilters.map((filter) => (
            <Button
              key={filter.id}
              variant={selectedCategory === filter.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedCategory(filter.id)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        {/* 카테고리별 체크리스트 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredCategories.flatMap((category) =>
            category.items.map((item) => {
              const ItemIcon = item.icon;
              // 임시 데이터 (실제로는 API에서 가져와야 함)
              const completedCount = Math.floor(Math.random() * 10);
              const daysRemaining = Math.floor(Math.random() * 10) - 2;

              return (
                <Card key={item.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${category.bgColor}`}>
                          <ItemIcon className={`h-5 w-5 ${category.color}`} />
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {category.filterLabel}
                      </Badge>
                    </div>
                    <CardTitle className="text-lg">{item.title}</CardTitle>
                    <CardDescription className="text-sm">{item.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* 상태 배지 */}
                    <div className="flex flex-wrap gap-2">
                      {completedCount > 0 && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          완료 {completedCount}건
                        </Badge>
                      )}
                      {daysRemaining > 0 ? (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          <Clock className="h-3 w-3 mr-1" />
                          {daysRemaining}일 남음
                        </Badge>
                      ) : daysRemaining < 0 ? (
                        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                          <XCircle className="h-3 w-3 mr-1" />
                          기간초과
                        </Badge>
                      ) : null}
                    </div>

                    {/* 2개 버튼 */}
                    <div className="flex gap-2">
                      <Link href={item.listPath} className="flex-1">
                        <Button variant="outline" size="sm" className="w-full gap-1">
                          <List className="h-3 w-3" />
                          리스트 보기
                        </Button>
                      </Link>
                      <Link href={item.createPath} className="flex-1">
                        <Button size="sm" className="w-full gap-1">
                          <PlusCircle className="h-3 w-3" />
                          작성하기
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
