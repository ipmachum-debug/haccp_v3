import { useState, useMemo, useCallback } from "react";
import { Calendar, dateFnsLocalizer, View } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { ko } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { formatLocalDate } from "../lib/dateUtils";

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

const DnDCalendar = withDragAndDrop(Calendar);

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource: {
    scheduleId: number;
    ccpInstanceId: number;
    status: "pending" | "completed" | "skipped";
    frequency: "daily" | "weekly" | "monthly";
    ccpType: string | null;
    productName: string | null;
  };
}

export default function CcpCalendar() {
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [note, setNote] = useState("");

  // 캘린더 날짜 범위 계산
  const dateRange = useMemo(() => {
    const start = new Date(date);
    const end = new Date(date);
    
    if (view === "month") {
      start.setDate(1);
      start.setDate(start.getDate() - start.getDay());
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
      end.setDate(end.getDate() + (6 - end.getDay()));
    } else if (view === "week") {
      start.setDate(start.getDate() - start.getDay());
      end.setDate(end.getDate() + (6 - end.getDay()));
    } else {
      end.setDate(end.getDate() + 1);
    }
    
    return {
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
    };
  }, [date, view]);

  // CCP 점검 일정 조회
  const { data: schedules, refetch } = trpc.ccpSchedule.list.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // 점검 완료 처리
  const completeMutation = trpc.ccpSchedule.complete.useMutation({
    onSuccess: () => {
      toast.success("점검이 완료되었습니다");
      refetch();
      setIsDialogOpen(false);
      setSelectedEvent(null);
      setNote("");
    },
    onError: (error: any) => {
      toast.error(`오류: ${error.message}`);
    },
  });
  
  const updateDateMutation = trpc.ccpSchedule.updateDate.useMutation({
    onSuccess: () => {
      toast.success("일정이 변경되었습니다");
      refetch();
    },
    onError: (error: any) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  // 캘린더 이벤트 변환
  const events: CalendarEvent[] = useMemo(() => {
    if (!schedules) return [];
    
    return schedules.map((schedule: any) => {
      const scheduledDate = new Date(schedule.scheduledDate);
      return {
        id: schedule.id,
        title: `${schedule.ccpType || "CCP"} - ${schedule.productName || ""}`,
        start: scheduledDate,
        end: scheduledDate,
        resource: {
          scheduleId: schedule.id,
          ccpInstanceId: schedule.ccpInstanceId,
          status: schedule.status,
          frequency: schedule.frequency,
          ccpType: schedule.ccpType,
          productName: schedule.productName,
        },
      };
    });
  }, [schedules]);

  // 이벤트 클릭 핸들러
  const handleSelectEvent = useCallback((event: any) => {
    setSelectedEvent(event);
    setIsDialogOpen(true);
  }, []);

  // 이벤트 스타일
  const eventStyleGetter = (event: any) => {
    const { status } = event.resource;
    
    let backgroundColor = "#3b82f6"; // 기본 파란색 (대기)
    if (status === "completed") {
      backgroundColor = "#22c55e"; // 초록색 (완료)
    } else if (status === "skipped") {
      backgroundColor = "#6b7280"; // 회색 (건너뜀)
    }
    
    return {
      style: {
        backgroundColor,
        borderRadius: "4px",
        opacity: 0.8,
        color: "white",
        border: "0px",
        display: "block",
      },
    };
  };

  // 점검 완료 처리
   const handleCompleteSchedule = () => {
    if (selectedEvent) {
      completeMutation.mutate({
        scheduleId: selectedEvent.resource.scheduleId,
        note,
      });
    }
  };
  
  // 드래그&드롭 핸들러
  const onEventDrop = useCallback(
    ({ event, start }: any) => {
      // 완료된 일정은 이동 불가
      if (event.resource.status === "completed" || event.resource.status === "skipped") {
        toast.error("완료된 일정은 이동할 수 없습니다");
        return;
      }
      
      updateDateMutation.mutate({
        scheduleId: event.resource.scheduleId,
        newDate: start.toISOString(),
      });
    },
    [updateDateMutation]
  );

  return (
    
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CCP 점검 캘린더</h1>
            <p className="text-muted-foreground mt-2">
              CCP 점검 일정을 캘린더로 확인하고 관리하세요
            </p>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500">
              대기
            </Badge>
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500">
              완료
            </Badge>
            <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500">
              건너뜀
            </Badge>
          </div>
        </div>

        <div className="bg-card rounded-lg border p-4" style={{ height: "700px" }}>
          <DnDCalendar
            localizer={localizer}
            events={events as any}
            startAccessor={(event: any) => event.start}
            endAccessor={(event: any) => event.end}
            style={{ height: "100%" }}
            view={view}
            onView={setView}
            date={date}
            onNavigate={setDate}
            onSelectEvent={handleSelectEvent}
            onEventDrop={onEventDrop}
            eventPropGetter={eventStyleGetter}
            draggableAccessor={(event: any) => event.resource?.status === "pending"}
            resizable={false}
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
          />
        </div>

        {/* 일정 상세 다이얼로그 */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>CCP 점검 일정 상세</DialogTitle>
              <DialogDescription>
                점검 일정의 상세 정보를 확인하고 완료 처리할 수 있습니다.
              </DialogDescription>
            </DialogHeader>
            
            {selectedEvent && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">CCP 유형</label>
                  <p className="text-sm text-muted-foreground">{selectedEvent.resource.ccpType}</p>
                </div>
                
                <div>
                  <label className="text-sm font-medium">제품명</label>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent.resource.productName || "-"}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium">점검 예정일</label>
                  <p className="text-sm text-muted-foreground">
                    {format(selectedEvent.start, "yyyy년 MM월 dd일", { locale: ko })}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium">점검 주기</label>
                  <p className="text-sm text-muted-foreground">
                    {selectedEvent.resource.frequency === "daily" ? "일일" : 
                     selectedEvent.resource.frequency === "weekly" ? "주간" : "월간"}
                  </p>
                </div>
                
                <div>
                  <label className="text-sm font-medium">상태</label>
                  <div className="mt-1">
                    {selectedEvent.resource.status === "pending" && (
                      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500">
                        대기
                      </Badge>
                    )}
                    {selectedEvent.resource.status === "completed" && (
                      <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500">
                        완료
                      </Badge>
                    )}
                    {selectedEvent.resource.status === "skipped" && (
                      <Badge variant="outline" className="bg-gray-500/10 text-gray-500 border-gray-500">
                        건너뜀
                      </Badge>
                    )}
                  </div>
                </div>
                
                {selectedEvent.resource.status === "pending" && (
                  <div>
                    <label className="text-sm font-medium">비고</label>
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="점검 완료 시 비고 사항을 입력하세요 (선택)"
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                닫기
              </Button>
              {selectedEvent?.resource.status === "pending" && (
                <Button onClick={handleCompleteSchedule} disabled={completeMutation.isPending}>
                  {completeMutation.isPending ? "처리 중..." : "점검 완료"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    
  );
}
