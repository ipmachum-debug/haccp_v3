/**
 * DashboardLayout 분해 — 출퇴근 위젯 (사이드바 하단).
 */
import { trpc } from "@/lib/trpc";
import { CheckCircle, LogIn, LogOut } from "lucide-react";

export function ClockInOutWidget({ isCollapsed }: { isCollapsed: boolean }) {
  const { data: myToday, refetch } = trpc.hr.myToday.useQuery(undefined, {
    refetchInterval: 30000,
    retry: 1,
  });
  const clockInMut = trpc.hr.clockIn.useMutation({
    onSuccess: () => refetch(),
  });
  const clockOutMut = trpc.hr.clockOut.useMutation({
    onSuccess: () => refetch(),
  });

  if (isCollapsed) {
    // 접힌 상태: 아이콘만
    return (
      <div className="flex justify-center py-1.5">
        {myToday ? (
          myToday.clockOut ? (
            <div className="h-6 w-6 rounded-full bg-blue-100 flex items-center justify-center" title={`퇴근 ${myToday.clockOut}`}>
              <CheckCircle className="h-3 w-3 text-blue-600" />
            </div>
          ) : (
            <button onClick={() => clockOutMut.mutate()}
              className="h-6 w-6 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition" title="퇴근하기">
              <LogOut className="h-3 w-3 text-red-600" />
            </button>
          )
        ) : (
          <button onClick={() => clockInMut.mutate()}
            className="h-6 w-6 rounded-full bg-emerald-100 hover:bg-emerald-200 flex items-center justify-center transition" title="출근하기">
            <LogIn className="h-3 w-3 text-emerald-600" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5 border-t border-sidebar-border space-y-1">
      {/* 출근 버튼/상태 */}
      <div className="flex items-center gap-1.5">
        {myToday ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <LogIn className="h-3 w-3 text-emerald-600 shrink-0" />
            <span className="text-[10px] font-bold text-emerald-700">출근</span>
            <span className="text-[10px] font-mono text-emerald-600">{myToday.clockIn?.slice(0, 5)}</span>
          </div>
        ) : (
          <button onClick={() => clockInMut.mutate()} disabled={clockInMut.isPending}
            className="w-full text-[10px] py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 font-bold transition flex items-center justify-center gap-1.5 shadow-sm">
            <LogIn className="h-3.5 w-3.5" /> 출근
          </button>
        )}
      </div>

      {/* 퇴근 버튼/상태 (출근 후에만) */}
      {myToday && (
        <div className="flex items-center gap-1.5">
          {myToday.clockOut ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <LogOut className="h-3 w-3 text-blue-600 shrink-0" />
              <span className="text-[10px] font-bold text-blue-700">퇴근</span>
              <span className="text-[10px] font-mono text-blue-600">{myToday.clockOut?.slice(0, 5)}</span>
              <span className="text-[9px] text-muted-foreground ml-auto">{myToday.workHours.toFixed(1)}h</span>
            </div>
          ) : (
            <button onClick={() => clockOutMut.mutate()} disabled={clockOutMut.isPending}
              className="w-full text-[10px] py-1.5 rounded-md bg-rose-500 text-white hover:bg-rose-600 font-bold transition flex items-center justify-center gap-1.5 shadow-sm">
              <LogOut className="h-3.5 w-3.5" /> 퇴근
            </button>
          )}
        </div>
      )}
    </div>
  );
}
