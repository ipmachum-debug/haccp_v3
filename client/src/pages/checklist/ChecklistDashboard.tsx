import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DailyLogCreateModal } from "@/components/production/DailyLogCreateModal";
import { DailyLogListModal } from "@/components/production/DailyLogListModal";
import { WeeklyHygieneLogModal } from "@/components/production/WeeklyHygieneLogModal";
import { WeeklyPestLogModal } from "@/components/production/WeeklyPestLogModal";
import { WeeklyHygieneLogListModal } from "@/components/production/WeeklyHygieneLogListModal";
import { WeeklyPestLogListModal } from "@/components/production/WeeklyPestLogListModal";
import { MonthlyHygieneLogModal } from "@/components/production/MonthlyHygieneLogModal";
import { MonthlyCCPLogModal } from "@/components/production/MonthlyCCPLogModal";
import { MonthlyHygieneLogListModal } from "@/components/production/MonthlyHygieneLogListModal";
import { MonthlyCCPLogListModal } from "@/components/production/MonthlyCCPLogListModal";
import { YearlyLogModal } from "@/components/production/YearlyLogModal";
import { YearlyLogListModal } from "@/components/production/YearlyLogListModal";
import { CustomPeriodLogModal } from "@/components/production/CustomPeriodLogModal";
import { CustomPeriodLogListModal } from "@/components/production/CustomPeriodLogListModal";
import { SearchModal } from "@/components/accounting/SearchModal";
import TrainingLogModal from "@/components/production/TrainingLogModal";
import TrainingLogListModal from "@/components/production/TrainingLogListModal";

import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useEffect } from "react";
import {
  FileCheck, CheckCircle2, XCircle, AlertCircle, List, Calendar, FileText, Search,
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";

import { useIndustryLabel } from "@/hooks/useIndustryFeatures";

// 2026-04-20 분해: 카테고리 정적 데이터 + SortableChecklistCard 추출
import { checklistCategories } from "./_checklistDashboard/categories";
import { SortableChecklistCard } from "./_checklistDashboard/SortableChecklistCard";


export default function ChecklistDashboard() {
  const L = useIndustryLabel();
  // 인증된 사용자의 tenantId 사용
  const { user: authUser } = useAuth();
  const user = { tenantId: authUser?.tenantId || 0 };
  const [, navigate] = useLocation();
  
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
        newItems.forEach((item: any, index: any) => {
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
      <div className="space-y-6">
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
                    onClick={() => navigate("/daily-log/daily")}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    작성하기
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("/dashboard/daily-logs")}
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
                    onClick={() => navigate("/weekly-log/form")}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    작성하기
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full"
                    onClick={() => setWeeklyHygieneListModalOpen(true)}
                  >
                    <List className="h-4 w-4 mr-2" />
                    리스트 보기
                  </Button>
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
                    onClick={() => navigate("/monthly-log/form")}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    작성하기
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="w-full"
                    onClick={() => setMonthlyHygieneListModalOpen(true)}
                  >
                    <List className="h-4 w-4 mr-2" />
                    리스트 보기
                  </Button>
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
              <Alert className={`${(stats?.overdue || 0) > 0 ? "border-red-200 bg-red-50" : (stats?.todayDue || 0) > 0 ? "border-yellow-200 bg-yellow-50" : "border-green-200 bg-green-50"}`}>
                <AlertCircle className={`h-4 w-4 ${(stats?.overdue || 0) > 0 ? "text-red-600" : (stats?.todayDue || 0) > 0 ? "text-yellow-600" : "text-green-600"}`} />
                <AlertTitle className={(stats?.overdue || 0) > 0 ? "text-red-800" : (stats?.todayDue || 0) > 0 ? "text-yellow-800" : "text-green-800"}>
                  {(stats?.overdue || 0) > 0 ? "기한 초과 알림" : (stats?.todayDue || 0) > 0 ? "오늘 마감" : "모두 완료"}
                </AlertTitle>
                <AlertDescription className={(stats?.overdue || 0) > 0 ? "text-red-700" : (stats?.todayDue || 0) > 0 ? "text-yellow-700" : "text-green-700"}>
                  {(stats?.overdue || 0) > 0
                    ? <>기한이 지난 체크리스트가 <strong>{stats?.overdue}건</strong> 있습니다. 즉시 작성해주세요.</>
                    : (stats?.todayDue || 0) > 0
                    ? <>오늘 작성해야 할 체크리스트가 <strong>{stats?.todayDue}건</strong> 있습니다.</>
                    : "현재 미완료 체크리스트가 없습니다."}
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
                        <p className="text-lg font-bold">{isStatsLoading ? "-" : stats?.overdue || 0}</p>
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
                          {isStatsLoading ? "-" : `${stats?.weeklyRate ?? 0}%`}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="bg-green-600 h-1.5 rounded-full transition-all" style={{ width: `${stats?.weeklyRate ?? 0}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium">월간</span>
                        <span className="text-xs font-bold text-blue-600">
                          {isStatsLoading ? "-" : `${stats?.monthlyRate ?? 0}%`}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1.5">
                        <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${stats?.monthlyRate ?? 0}%` }}></div>
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
          // @ts-ignore - SearchModal props mismatch
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
