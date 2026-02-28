import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DailyLogCreateModal } from "@/components/DailyLogCreateModal";
import { DailyLogListModal } from "@/components/DailyLogListModal";
import { WeeklyHygieneLogModal } from "@/components/WeeklyHygieneLogModal";
import { WeeklyPestLogModal } from "@/components/WeeklyPestLogModal";
import { WeeklyHygieneLogListModal } from "@/components/WeeklyHygieneLogListModal";
import { WeeklyPestLogListModal } from "@/components/WeeklyPestLogListModal";
import { MonthlyHygieneLogModal } from "@/components/MonthlyHygieneLogModal";
import { MonthlyCCPLogModal } from "@/components/MonthlyCCPLogModal";
import { MonthlyHygieneLogListModal } from "@/components/MonthlyHygieneLogListModal";
import { MonthlyCCPLogListModal } from "@/components/MonthlyCCPLogListModal";
import { YearlyLogModal } from "@/components/YearlyLogModal";
import { YearlyLogListModal } from "@/components/YearlyLogListModal";
import { CustomPeriodLogModal } from "@/components/CustomPeriodLogModal";
import { CustomPeriodLogListModal } from "@/components/CustomPeriodLogListModal";
import { SearchModal } from "@/components/SearchModal";
import TrainingLogModal from "@/components/TrainingLogModal";
import TrainingLogListModal from "@/components/TrainingLogListModal";

import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
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
  Calendar,
  FileText,
  Search,
  Truck,
  Building2,
  ClipboardCheck,
  ShieldCheck,
  HeartPulse,
  Microscope,
  ThermometerSun,
  Gauge,
  Package,
  UserCheck,
  Handshake,
  MessageSquareWarning,
} from "lucide-react";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ============================================================
// 항목별 일지 카테고리 정의 (PDF 양식 기반 매칭)
// ============================================================
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
        title: "세척소독 관리대장",
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
        id: "health-certificates",
        title: "건강진단결과서 관리",
        description: "건강진단결과서(구, 보건증) 현황 및 만료 임박 현황",
        icon: FileCheck,
        listPath: "/dashboard/checklist/employee-health",
        createPath: "/dashboard/checklist/employee-health",
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
    description: "온·습도, 냉장·냉동 온도, 필터, 조도, 차량온도, 설비이력, 설비점검",
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
        title: "압축공기 필터·에어컨 필터 관리대장",
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
      {
        id: "air-compressor-maintenance",
        title: "에어콤프레샤 관리일지",
        description: "에어 콤프레샤 윤활유 교환 및 에어 크리너 세척/소독을 기록합니다",
        icon: Cog,
        listPath: "/air-compressor-maintenance",
        createPath: "/air-compressor-maintenance/new",
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
        listPath: "/calibration",
        createPath: "/calibration",
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
    description: "자가품질검사, 중량·품질검사, 제품검사, 완제품출고검사, 협력업체점검",
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
    description: "방충·방서 점검, 공중낙하세균 검사, 식품회수",
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
        listPath: "/pest-control/checklists",
        createPath: "/pest-control/checklists/new",
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
    description: "업무인수인계서, 보건증 관리, 일일 폐기 기록",
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
        id: "waste-disposal-record",
        title: "일일 폐기 기록",
        description: "일일 폐기 기록을 관리합니다",
        icon: Trash2,
        listPath: "/daily-disposal-record",
        createPath: "/daily-disposal-record/new",
      },
      {
        id: "waste-management",
        title: "폐기물 관리대장",
        description: "폐기물 발생량, 자가처리, 재활용 현황을 기록합니다",
        icon: Trash2,
        listPath: "/waste-management",
        createPath: "/waste-management/new",
      },
    ],
  },
];

// 드래그 가능한 체크리스트 카드 컴포넌트
function SortableChecklistCard({ item, category }: { item: any; category: any }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const ItemIcon = item.icon;
  // 임시 데이터 - 0으로 고정 (Math.random()은 React 렌더 오류 #185 유발)
  const completedCount = 0;
  const daysRemaining = 0;

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Card className="hover:shadow-lg transition-shadow cursor-move">
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

          {/* 버튼 렌더링 (actions 또는 listPath/createPath) */}
          {item.actions ? (
            <div className="flex flex-col gap-2">
              {item.actions.map((action: any, idx: number) => (
                <Button
                  key={idx}
                  variant={idx === item.actions.length - 1 ? "default" : "outline"}
                  size="sm"
                  className="w-full gap-1"
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ChecklistDashboard() {
  // 인증된 사용자의 tenantId 사용
  const { user: authUser } = useAuth();
  const user = { tenantId: authUser?.tenantId || 0 };
  
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [allItems, setAllItems] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>("period"); // "period" 또는 "item"
  const [dailyLogCreateModalOpen, setDailyLogCreateModalOpen] = useState(false);
  const [dailyLogListModalOpen, setDailyLogListModalOpen] = useState(false);
  const [weeklyHygieneModalOpen, setWeeklyHygieneModalOpen] = useState(false);
  const [weeklyPestModalOpen, setWeeklyPestModalOpen] = useState(false);
  const [weeklyHygieneListModalOpen, setWeeklyHygieneListModalOpen] = useState(false);
  const [weeklyPestListModalOpen, setWeeklyPestListModalOpen] = useState(false);
  const [monthlyHygieneModalOpen, setMonthlyHygieneModalOpen] = useState(false);
  const [monthlyCCPModalOpen, setMonthlyCCPModalOpen] = useState(false);
  const [monthlyHygieneListModalOpen, setMonthlyHygieneListModalOpen] = useState(false);
  const [monthlyCCPListModalOpen, setMonthlyCCPListModalOpen] = useState(false);
  const [yearlyLogModalOpen, setYearlyLogModalOpen] = useState(false);
  const [yearlyLogListModalOpen, setYearlyLogListModalOpen] = useState(false);
  const [customPeriodLogModalOpen, setCustomPeriodLogModalOpen] = useState(false);
  const [customPeriodLogListModalOpen, setCustomPeriodLogListModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [trainingLogModalOpen, setTrainingLogModalOpen] = useState(false);
  const [trainingLogListModalOpen, setTrainingLogListModalOpen] = useState(false);

  
  // 체크리스트 통계 조회
  const { data: stats, isLoading: isStatsLoading } = trpc.qualityChecklist.getStatistics.useQuery();
  
  // 로컬스토리지에서 순서 불러오기
  useEffect(() => {
    const savedOrder = localStorage.getItem("checklistOrder");
    if (savedOrder) {
      try {
        const orderMap = JSON.parse(savedOrder);
        const items = checklistCategories.flatMap((category) =>
          category.items.map((item) => ({ ...item, category }))
        );
        
        // 저장된 순서대로 정렬
        const sortedItems = items.sort((a, b) => {
          const indexA = orderMap[a.id] ?? 999;
          const indexB = orderMap[b.id] ?? 999;
          return indexA - indexB;
        });
        
        setAllItems(sortedItems);
      } catch (error) {
        console.error("Failed to load checklist order:", error);
        // 기본 순서로 설정
        setAllItems(
          checklistCategories.flatMap((category) =>
            category.items.map((item) => ({ ...item, category }))
          )
        );
      }
    } else {
      // 기본 순서로 설정
      setAllItems(
        checklistCategories.flatMap((category) =>
          category.items.map((item) => ({ ...item, category }))
        )
      );
    }
  }, []);

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

    if (over && active.id !== over.id) {
      setAllItems((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newItems = arrayMove(items, oldIndex, newIndex);

        // 로컬스토리지에 순서 저장
        const orderMap: Record<string, number> = {};
        newItems.forEach((item, index) => {
          orderMap[item.id] = index;
        });
        localStorage.setItem("checklistOrder", JSON.stringify(orderMap));

        return newItems;
      });
    }
  };

  // 필터링된 항목
  const filteredItems = selectedCategory === "all" 
    ? allItems 
    : allItems.filter(item => item.category.filterLabel === selectedCategory);

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
      <div className="container py-6">
        {/* 헤더 */}
        <div className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold mb-2">HACCP 체크리스트</h1>
            <p className="text-muted-foreground">
              작성할 체크리스트 유형을 선택해주세요
            </p>
          </div>
          <Button onClick={() => setSearchModalOpen(true)} variant="outline">
            <Search className="w-4 h-4 mr-2" />
            일지 검색
          </Button>
        </div>

        {/* 탭 추가 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="period" className="gap-2">
              <Calendar className="h-4 w-4" />
              기간별 일지
            </TabsTrigger>
            <TabsTrigger value="item" className="gap-2">
              <FileText className="h-4 w-4" />
              항목별 일지
            </TabsTrigger>
          </TabsList>

          {/* 기간별 일지 탭 */}
          <TabsContent value="period" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-blue-50">
                      <Calendar className="h-5 w-5 text-blue-600" />
                    </div>
                  </div>
                  <CardTitle className="text-lg">일일일지</CardTitle>
                  <CardDescription className="text-sm">
                    매일 작성하는 5개 일지
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={() => setDailyLogCreateModalOpen(true)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    작성하기
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full"
                    onClick={() => setDailyLogListModalOpen(true)}
                  >
                    <List className="h-4 w-4 mr-2" />
                    리스트 보기
                  </Button>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-green-50">
                      <Calendar className="h-5 w-5 text-green-600" />
                    </div>
                  </div>
                  <CardTitle className="text-lg">주간일지</CardTitle>
                  <CardDescription className="text-sm">
                    주간 단위 일지 (일반위생관리, 방충방서)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={() => setWeeklyHygieneModalOpen(true)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    일반위생관리
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full"
                    onClick={() => setWeeklyPestModalOpen(true)}
                  >
                    <Bug className="h-4 w-4 mr-2" />
                    방충방서
                  </Button>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Button 
                      size="sm" 
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => setWeeklyHygieneListModalOpen(true)}
                    >
                      <List className="h-3 w-3 mr-1" />
                      위생관리 목록
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => setWeeklyPestListModalOpen(true)}
                    >
                      <List className="h-3 w-3 mr-1" />
                      방충방서 목록
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-purple-50">
                      <Calendar className="h-5 w-5 text-purple-600" />
                    </div>
                  </div>
                  <CardTitle className="text-lg">월간일지</CardTitle>
                  <CardDescription className="text-sm">
                    월간 단위 일지 (일반위생관리, CCP 검증)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    size="sm" 
                    className="w-full"
                    onClick={() => setMonthlyHygieneModalOpen(true)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    일반위생관리
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full"
                    onClick={() => setMonthlyCCPModalOpen(true)}
                  >
                    <FlaskConical className="h-4 w-4 mr-2" />
                    CCP 검증
                  </Button>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Button 
                      size="sm" 
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => setMonthlyHygieneListModalOpen(true)}
                    >
                      <List className="h-3 w-3 mr-1" />
                      위생관리 목록
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      className="w-full text-xs"
                      onClick={() => setMonthlyCCPListModalOpen(true)}
                    >
                      <List className="h-3 w-3 mr-1" />
                      CCP 목록
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-orange-50">
                      <Calendar className="h-5 w-5 text-orange-600" />
                    </div>
                  </div>
                  <CardTitle className="text-lg">연간일지</CardTitle>
                  <CardDescription className="text-sm">
                    일반위생관리 및 공정점검표 (연간)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => setYearlyLogModalOpen(true)}>
                      일지 작성
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setYearlyLogListModalOpen(true)}>
                      목록 보기
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 rounded-lg bg-red-50">
                      <AlertCircle className="h-5 w-5 text-red-600" />
                    </div>
                  </div>
                  <CardTitle className="text-lg">특정기간일지</CardTitle>
                  <CardDescription className="text-sm">
                    사용자 지정 기간 일지
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => setCustomPeriodLogModalOpen(true)}>
                      일지 작성
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setCustomPeriodLogListModalOpen(true)}>
                      목록 보기
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* 항목별 일지 탭 */}
          <TabsContent value="item" className="space-y-6">
            {/* 알람 박스와 통계 대시보드를 3열 그리드로 좌우 배치 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
            <div className="flex flex-wrap gap-2">
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

            {/* 카테고리별 체크리스트 - 4열 그리드 + 드래그 앤 드롭 */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={filteredItems.map(item => item.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {filteredItems.map((item) => (
                    <SortableChecklistCard key={item.id} item={item} category={item.category} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </TabsContent>
        </Tabs>
      </div>

      {/* 일일일지 작성 모달 - 조건부 렌더링으로 무한 루프 방지 */}
      {dailyLogCreateModalOpen && (
        <Dialog open={dailyLogCreateModalOpen} onOpenChange={setDailyLogCreateModalOpen}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>일일일지 작성</DialogTitle>
              <DialogDescription>
                오늘 날짜의 5개 일지를 작성합니다.
              </DialogDescription>
            </DialogHeader>
            <DailyLogCreateModal />
          </DialogContent>
        </Dialog>
      )}

      {/* 일일일지 리스트 모달 - 조건부 렌더링 */}
      {dailyLogListModalOpen && (
        <Dialog open={dailyLogListModalOpen} onOpenChange={setDailyLogListModalOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>일일일지 목록</DialogTitle>
              <DialogDescription>
                과거에 작성된 일일일지를 조회합니다.
              </DialogDescription>
            </DialogHeader>
            <DailyLogListModal onViewDetail={(logId) => {
              console.log("상세 보기:", logId);
            }} />
          </DialogContent>
        </Dialog>
      )}

      {/* 주간일지 - 일반위생관리 모달 (조건부 렌더링) */}
      {weeklyHygieneModalOpen && (
        <WeeklyHygieneLogModal
          open={weeklyHygieneModalOpen}
          onClose={() => setWeeklyHygieneModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 주간일지 - 방충방서 모달 */}
      {weeklyPestModalOpen && (
        <WeeklyPestLogModal
          open={weeklyPestModalOpen}
          onClose={() => setWeeklyPestModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 주간일지 - 일반위생관리 목록 모달 */}
      {weeklyHygieneListModalOpen && (
        <WeeklyHygieneLogListModal
          open={weeklyHygieneListModalOpen}
          onClose={() => setWeeklyHygieneListModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 주간일지 - 방충방서 목록 모달 */}
      {weeklyPestListModalOpen && (
        <WeeklyPestLogListModal
          open={weeklyPestListModalOpen}
          onClose={() => setWeeklyPestListModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 월간일지 - 일반위생관리 모달 */}
      {monthlyHygieneModalOpen && (
        <MonthlyHygieneLogModal
          open={monthlyHygieneModalOpen}
          onClose={() => setMonthlyHygieneModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 월간일지 - CCP 검증 모달 */}
      {monthlyCCPModalOpen && (
        <MonthlyCCPLogModal
          open={monthlyCCPModalOpen}
          onClose={() => setMonthlyCCPModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 월간일지 - 일반위생관리 목록 모달 */}
      {monthlyHygieneListModalOpen && (
        <MonthlyHygieneLogListModal
          open={monthlyHygieneListModalOpen}
          onClose={() => setMonthlyHygieneListModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 월간일지 - CCP 검증 목록 모달 */}
      {monthlyCCPListModalOpen && (
        <MonthlyCCPLogListModal
          open={monthlyCCPListModalOpen}
          onClose={() => setMonthlyCCPListModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 연간일지 작성 모달 */}
      {yearlyLogModalOpen && (
        <YearlyLogModal
          open={yearlyLogModalOpen}
          onClose={() => setYearlyLogModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 연간일지 목록 모달 */}
      {yearlyLogListModalOpen && (
        <YearlyLogListModal
          open={yearlyLogListModalOpen}
          onClose={() => setYearlyLogListModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 특정기간일지 작성 모달 */}
      {customPeriodLogModalOpen && (
        <CustomPeriodLogModal
          open={customPeriodLogModalOpen}
          onClose={() => setCustomPeriodLogModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}

      {/* 특정기간일지 목록 모달 */}
      {customPeriodLogListModalOpen && (
        <CustomPeriodLogListModal
          open={customPeriodLogListModalOpen}
          onClose={() => setCustomPeriodLogListModalOpen(false)}
          tenantId={user?.tenantId || 0}
        />
      )}
      
      {/* 검색 모달 */}
      {searchModalOpen && (
        <SearchModal
          open={searchModalOpen}
          onClose={() => setSearchModalOpen(false)}
        />
      )}

      {/* 교육훈련일지 작성 모달 */}
      {trainingLogModalOpen && (
        <TrainingLogModal
          open={trainingLogModalOpen}
          onClose={() => setTrainingLogModalOpen(false)}
          onSuccess={() => setTrainingLogListModalOpen(true)}
        />
      )}

      {/* 교육훈련일지 목록 모달 */}
      {trainingLogListModalOpen && (
        <TrainingLogListModal
          open={trainingLogListModalOpen}
          onClose={() => setTrainingLogListModalOpen(false)}
        />
      )}


    </DashboardLayout>
  );
}
