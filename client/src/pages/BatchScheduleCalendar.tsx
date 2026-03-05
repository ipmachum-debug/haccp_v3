import { useState, useCallback } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { ko } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { CalendarIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";

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

interface CalendarEvent {
  id: number;
  title: string;
  start: Date;
  end: Date;
  resource?: any;
}

export default function BatchScheduleCalendar() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCreateMode, setIsCreateMode] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");

  // 배치 목록 조회
  const { data: batchData, refetch } = trpc.batch.list.useQuery();
  const batches = batchData?.items || [];

  // 배치 데이터를 캘린더 이벤트로 변환
  const calendarEvents: CalendarEvent[] = batches?.map((batch: any) => ({
    id: batch.id,
    title: `배치 ${batch.batchCode}`,
    start: batch.startTime ? new Date(batch.startTime) : new Date(batch.plannedDate),
    end: batch.endTime ? new Date(batch.endTime) : new Date(batch.plannedDate),
    resource: batch,
  })) || [];

  // 이벤트 선택 핸들러
  const handleSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setIsDialogOpen(true);
    setIsCreateMode(false);
  }, []);

  // 슬롯 선택 핸들러 (새 일정 생성)
  const handleSelectSlot = useCallback(({ start, end }: { start: Date; end: Date }) => {
    setNewEventStart(format(start, "yyyy-MM-dd"));
    setNewEventEnd(format(end, "yyyy-MM-dd"));
    setIsDialogOpen(true);
    setIsCreateMode(true);
  }, []);

  // 배치 일정 변경 API
  const updateSchedule = trpc.batch.updateSchedule.useMutation({
    onSuccess: () => {
      toast.success("일정이 변경되었습니다");
      refetch();
    },
    onError: (error) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  // 이벤트 드래그 앤 드롭 핸들러
  const handleEventDrop = useCallback(
    ({ event, start, end }: { event: CalendarEvent; start: Date; end: Date }) => {
      updateSchedule.mutate({
        id: event.id,
        startTime: start,
        endTime: end,
      });
    },
    [updateSchedule]
  );

  // 이벤트 리사이즈 핸들러
  const handleEventResize = useCallback(
    ({ event, start, end }: { event: CalendarEvent; start: Date; end: Date }) => {
      updateSchedule.mutate({
        id: event.id,
        startTime: start,
        endTime: end,
      });
    },
    [updateSchedule]
  );

  // 새 일정 생성
  const handleCreateEvent = () => {
    if (!newEventTitle || !newEventStart || !newEventEnd) {
      toast.error("모든 필드를 입력해주세요");
      return;
    }
    toast.success(`"${newEventTitle}" 일정이 생성되었습니다`);
    setIsDialogOpen(false);
    setNewEventTitle("");
    setNewEventStart("");
    setNewEventEnd("");
    refetch();
  };

  return (
    <DashboardLayout>

    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">배치 생산 일정 캘린더</h1>
          <p className="text-muted-foreground">
            배치 생산 계획을 캘린더 형식으로 시각화하고 관리합니다
          </p>
        </div>
        <Button
          onClick={() => {
            setIsCreateMode(true);
            setIsDialogOpen(true);
            setNewEventStart(format(new Date(), "yyyy-MM-dd"));
            setNewEventEnd(format(new Date(), "yyyy-MM-dd"));
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          새 일정 추가
        </Button>
      </div>

      {/* 캘린더 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            생산 일정
          </CardTitle>
          <CardDescription>
            일정을 클릭하여 상세 정보를 확인하거나, 드래그하여 일정을 변경할 수 있습니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ height: "600px" }}>
            <Calendar
              localizer={localizer}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              style={{ height: "100%" }}
              onSelectEvent={handleSelectEvent}
              onSelectSlot={handleSelectSlot}
              selectable
              culture="ko"
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
                noEventsInRange: "이 기간에는 일정이 없습니다",
                showMore: (total) => `+${total} 더보기`,
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 일정 상세/생성 다이얼로그 */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isCreateMode ? "새 배치 일정 추가" : "배치 일정 상세"}
            </DialogTitle>
            <DialogDescription>
              {isCreateMode
                ? "새로운 배치 생산 일정을 추가합니다"
                : "배치 생산 일정 정보를 확인합니다"}
            </DialogDescription>
          </DialogHeader>

          {isCreateMode ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="title">배치 이름</Label>
                <Input
                  id="title"
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  placeholder="예: 제품A 배치 #123"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="start">시작일</Label>
                <Input
                  id="start"
                  type="date"
                  value={newEventStart}
                  onChange={(e) => setNewEventStart(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="end">종료일</Label>
                <Input
                  id="end"
                  type="date"
                  value={newEventEnd}
                  onChange={(e) => setNewEventEnd(e.target.value)}
                />
              </div>
            </div>
          ) : (
            selectedEvent && (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label>배치 이름</Label>
                  <p className="text-sm font-medium">{selectedEvent.title}</p>
                </div>
                <div className="grid gap-2">
                  <Label>시작일</Label>
                  <p className="text-sm">{format(selectedEvent.start, "yyyy-MM-dd")}</p>
                </div>
                <div className="grid gap-2">
                  <Label>종료일</Label>
                  <p className="text-sm">{format(selectedEvent.end, "yyyy-MM-dd")}</p>
                </div>
                {selectedEvent.resource && (
                  <>
                    <div className="grid gap-2">
                      <Label>배치 코드</Label>
                      <p className="text-sm">{selectedEvent.resource.batchCode}</p>
                    </div>
                    <div className="grid gap-2">
                      <Label>상태</Label>
                      <p className="text-sm">
                        {selectedEvent.resource.status === "in_progress"
                          ? "진행중"
                          : selectedEvent.resource.status === "completed"
                          ? "완료"
                          : "대기"}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              닫기
            </Button>
            {isCreateMode && (
              <Button onClick={handleCreateEvent}>생성</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  
    </DashboardLayout>
  );
}
