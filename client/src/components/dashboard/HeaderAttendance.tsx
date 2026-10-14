/**
 * 상단 헤더 출퇴근 (2026-10-14 대표 지시 — 사이드바 하단의 대형 출근/퇴근 버튼을 헤더로 이동)
 *
 * - 미출근: [출근] 버튼 — 누르면 바로 출근 (기존 사이드바 버튼과 같은 동작)
 * - 근무 중: '근무 중' 상태 칩 — 누르면 팝오버(출근 시간·근무 상태·[퇴근] 버튼)
 * - 퇴근 후: '퇴근 완료' 칩 — 누르면 팝오버(출근·퇴근 시간·근무시간)
 * - 모바일: 시계 아이콘 하나 — 누르면 같은 팝오버 (미출근이면 팝오버 안에 [출근])
 *
 * 근태 API·DB·권한·기록 로직은 그대로다: hr.myToday / hr.clockIn / hr.clockOut 을 기존과 같은 방식으로 호출한다.
 * 노출 역할도 기존 사이드바 위젯과 같다 (ATTENDANCE_ROLES). 처리 후 hr.myToday 캐시를 무효화해 다른 화면의 출퇴근 표시도 함께 갱신된다.
 */
import { Clock, LogIn, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

/** 기존 사이드바 출퇴근 위젯과 같은 노출 역할 */
export const ATTENDANCE_ROLES = ["worker", "admin", "super_admin", "inspector"] as const;

const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : "-");

export default function HeaderAttendance({ compact = false }: { compact?: boolean }) {
  const utils = trpc.useUtils();
  const { data: myToday, isLoading } = trpc.hr.myToday.useQuery(undefined, { refetchInterval: 30000, retry: 1 });
  const refresh = () => utils.hr.myToday.invalidate();
  const clockIn = trpc.hr.clockIn.useMutation({ onSuccess: refresh });
  const clockOut = trpc.hr.clockOut.useMutation({ onSuccess: refresh });

  if (isLoading) return null;

  const working = !!myToday && !myToday.clockOut;
  const done = !!myToday?.clockOut;

  // PC 미출근: 버튼 하나로 바로 출근
  if (!myToday && !compact) {
    return (
      <Button size="sm" onClick={() => clockIn.mutate()} disabled={clockIn.isPending}
        className="h-8 gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white" data-testid="header-clock-in">
        <LogIn className="h-3.5 w-3.5" /> 출근
      </Button>
    );
  }

  const trigger = compact ? (
    <button type="button" aria-label="출퇴근" data-testid="header-attendance-mobile"
      className={cn("relative h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors")}>
      <Clock className="h-4 w-4" />
      <span className={cn("absolute top-1.5 right-1.5 h-2 w-2 rounded-full",
        working ? "bg-emerald-500" : done ? "bg-blue-500" : "bg-slate-300")} />
    </button>
  ) : (
    <button type="button" data-testid="header-attendance"
      className={cn("h-8 inline-flex items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition-colors",
        working ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300")}>
      <span className={cn("h-2 w-2 rounded-full", working ? "bg-emerald-500 animate-pulse" : "bg-blue-500")} />
      {working ? "근무 중" : "퇴근 완료"}
    </button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-4">
        <p className="text-sm font-semibold mb-3">오늘 근태</p>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">상태</dt>
            <dd className={cn("font-medium", working ? "text-emerald-600" : done ? "text-blue-600" : "text-muted-foreground")}>
              {working ? "근무 중" : done ? "퇴근 완료" : "미출근"}
            </dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">출근</dt><dd className="font-mono">{hhmm(myToday?.clockIn)}</dd></div>
          {done && (
            <>
              <div className="flex justify-between"><dt className="text-muted-foreground">퇴근</dt><dd className="font-mono">{hhmm(myToday?.clockOut)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">근무시간</dt><dd className="font-mono">{Number(myToday?.workHours ?? 0).toFixed(1)}h</dd></div>
            </>
          )}
        </dl>
        {!myToday && (
          <Button className="w-full mt-4 gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => clockIn.mutate()} disabled={clockIn.isPending}>
            <LogIn className="h-4 w-4" /> 출근
          </Button>
        )}
        {working && (
          <Button className="w-full mt-4 gap-1.5 bg-rose-500 hover:bg-rose-600 text-white" onClick={() => clockOut.mutate()} disabled={clockOut.isPending}
            data-testid="header-clock-out">
            <LogOut className="h-4 w-4" /> 퇴근
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
