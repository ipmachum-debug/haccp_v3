import { useState, useMemo, useCallback } from "react";
import { Calendar, dateFnsLocalizer, View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { format, parse, startOfWeek, getDay, addMonths, subMonths } from "date-fns";
import { ko } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// date-fns localizer 설정
const locales = {
  ko: ko,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

// DnD 지원 캘린더
const DnDCalendar = withDragAndDrop<CalendarEvent, object>(Calendar);

// 캘린더 이벤트 타입 정의
interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: {
    batchId: number;
    status: string;
    notes?: string;
  };
}

export default function BatchSchedule() {
  const [, setLocation] = useLocation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<View>("month");

  // 현재 월의 시작일과 종료일 계산
  const dateRange = useMemo(() => {
    const start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    return { start, end };
  }, [currentDate]);

  // 배치 일정 조회
  const { data: schedules, isLoading, refetch } = trpc.batchSchedule.list.useQuery({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  // 배치 일정 수정 mutation
  const updateScheduleMutation = trpc.batchSchedule.update.useMutation({
    onSuccess: () => {
      toast.success("일정이 수정되었습니다.");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`일정 수정 실패: ${error.message}`);
    },
  });

  // 배치 정보 조회 (일정에 표시할 배치 정보)
  const { data: batchData } = trpc.batch.list.useQuery();
  const batches = batchData?.items || [];

  // 캘린더 이벤트 데이터 변환
  const events: CalendarEvent[] = useMemo(() => {
    if (!schedules || !batches) return [];

    return schedules.map((schedule: any) => {
      const batch = batches.find((b: any) => b.id === schedule.batchId);
      const scheduledDate = new Date(schedule.scheduledDate);

      return {
        id: schedule.id,
        title: batch
          ? `${batch.batchCode}`
          : `배치 ID: ${schedule.batchId}`,
        start: scheduledDate,
        end: scheduledDate,
        resource: {
          batchId: schedule.batchId,
          status: schedule.status || "planned",
          notes: schedule.notes || undefined,
        },
      };
    });
  }, [schedules, batches]);

  // 일정 클릭 핸들러 - 배치 상세 페이지로 이동
  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      setLocation(`/batch/${event.resource.batchId}`);
    },
    [setLocation]
  );

  // 날짜 범위 변경 핸들러
  const handleNavigate = useCallback(
    (newDate: Date) => {
      setCurrentDate(newDate);
    },
    []
  );

  // 뷰 변경 핸들러
  const handleViewChange = useCallback((newView: View) => {
    setView(newView);
  }, []);

  // 이전 달로 이동
  const handlePrevMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
  };

  // 다음 달로 이동
  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  // 오늘로 이동
  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // 드래그 앤 드롭으로 일정 변경 핸들러
  const handleEventDrop = useCallback(
    ({ event, start, end }: any) => {
      // 일정 수정 API 호출
      const newStart = typeof start === 'string' ? new Date(start) : start;
      updateScheduleMutation.mutate({
        id: event.id,
        scheduledDate: newStart,
      });
    },
    [updateScheduleMutation]
  );

  // 드래그로 일정 크기 변경 핸들러
  const handleEventResize = useCallback(
    ({ event, start, end }: any) => {
      // 일정 수정 API 호출
      const newStart = typeof start === 'string' ? new Date(start) : start;
      updateScheduleMutation.mutate({
        id: event.id,
        scheduledDate: newStart,
      });
    },
    [updateScheduleMutation]
  );

  // 이벤트 스타일 커스터마이징
  const eventStyleGetter = (event: any) => {
    let backgroundColor = "#3b82f6"; // 기본 파란색

    switch (event.resource.status) {
      case "planned":
        backgroundColor = "#3b82f6"; // 파란색
        break;
      case "in_progress":
        backgroundColor = "#f59e0b"; // 주황색
        break;
      case "completed":
        backgroundColor = "#10b981"; // 녹색
        break;
      case "cancelled":
        backgroundColor = "#ef4444"; // 빨간색
        break;
    }

    return {
      style: {
        backgroundColor,
        borderRadius: "4px",
        opacity: 0.9,
        color: "white",
        border: "0px",
        display: "block",
      },
    };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">일정을 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="h-6 w-6" />
              배치 생산 일정 캘린더
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleToday}>
                오늘
              </Button>
              <Button variant="outline" size="sm" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className="text-lg font-semibold ml-4">
                {format(currentDate, "yyyy년 M월", { locale: ko })}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[700px]">
            <DnDCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              style={{ height: "100%" }}
              onSelectEvent={handleSelectEvent}
              onNavigate={handleNavigate}
              onView={handleViewChange}
              onEventDrop={handleEventDrop}
              onEventResize={handleEventResize}
              view={view}
              date={currentDate}
              eventPropGetter={eventStyleGetter}
              draggableAccessor={() => true}
              resizable
              messages={{
                next: "다음",
                previous: "이전",
                today: "오늘",
                month: "월",
                week: "주",
                day: "일",
                agenda: "일정",
                date: "날짜",
                time: "시간",
                event: "일정",
                noEventsInRange: "이 기간에 일정이 없습니다.",
                showMore: (total) => `+${total} 더보기`,
              }}
              culture="ko"
            />
          </div>

          {/* 범례 */}
          <div className="mt-4 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-blue-500"></div>
              <span>계획됨</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-orange-500"></div>
              <span>진행 중</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-500"></div>
              <span>완료</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-red-500"></div>
              <span>취소됨</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
