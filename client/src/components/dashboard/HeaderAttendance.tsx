/**
 * 상단 헤더 출퇴근 (2026-10-14 대표 지시 — 사이드바 하단의 대형 출근/퇴근 버튼을 헤더로 이동, 같은 날 디자인 개편)
 *
 * 헤더 버튼: 아이콘 + 한 줄(출근하기 / 근무 3시간 12분 / 퇴근 · 8.1시간) + 상태 점 — 낮은 강조 (2026-10-20 헤더 정리)
 *   - 출근 전: "출근 전 / 출근하기" — 누르면 바로 출근 (기존 사이드바 버튼과 같은 동작)
 *   - 근무 중: "근무 중 / 3시간 12분" (출근 후 경과, 30초마다 갱신) — 누르면 팝오버
 *   - 퇴근 후: "퇴근 완료 / 8.1시간" (서버 근무시간) — 누르면 팝오버
 * 팝오버: 날짜 · 큰 경과 시간 · 출근→퇴근 타임라인 · [퇴근하기]
 * 모바일(compact): 시계 아이콘 + 상태 점 → 같은 팝오버 (출근 전이면 팝오버 안 [출근하기])
 *
 * 근태 API·DB·권한·기록 로직은 그대로다: hr.myToday / hr.clockIn / hr.clockOut 만 호출한다.
 * 노출 역할도 기존 사이드바 위젯과 같다 (ATTENDANCE_ROLES). 처리 후 hr.myToday 캐시를 무효화해 인사관리·공지보드 표시도 함께 갱신된다.
 * 경과 시간은 화면 표시용 계산(출근 시각 ~ 지금)이고, 근무시간 정본(점심 제외 규칙 포함)은 퇴근 후 서버 값이다.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Clock, LogIn, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

/** 기존 사이드바 출퇴근 위젯과 같은 노출 역할 */
export const ATTENDANCE_ROLES = ["worker", "admin", "super_admin", "inspector"] as const;

type State = "before" | "working" | "done";

const hhmm = (t?: string | null) => (t ? String(t).slice(0, 5) : "--:--");

/** 지금(한국 시각)의 하루 중 분 */
function nowMinutesKST(): number {
  const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Seoul", hour12: false }).split(":").map(Number);
  return h * 60 + m;
}
function minutesOf(t?: string | null): number | null {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
function fmtDuration(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? `${h}시간 ${m}분` : `${m}분`;
}
function todayLabel(): string {
  return new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
}

const TONE: Record<State, { tile: string; icon: string; dot: string; ring: string; label: string }> = {
  before:  { tile: "bg-slate-100 dark:bg-slate-800", icon: "text-slate-500", dot: "bg-slate-300", ring: "hover:border-emerald-300", label: "출근 전" },
  working: { tile: "bg-emerald-500/10", icon: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", ring: "hover:border-emerald-300", label: "근무 중" },
  done:    { tile: "bg-sky-500/10", icon: "text-sky-600 dark:text-sky-400", dot: "bg-sky-500", ring: "hover:border-sky-300", label: "퇴근 완료" },
};

function StatusDot({ state }: { state: State }) {
  return (
    <span className="relative flex h-2 w-2">
      {state === "working" && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", TONE[state].dot)} />
    </span>
  );
}

export default function HeaderAttendance({ compact = false }: { compact?: boolean }) {
  const utils = trpc.useUtils();
  const { data: myToday, isLoading } = trpc.hr.myToday.useQuery(undefined, { refetchInterval: 30000, retry: 1 });
  const refresh = () => utils.hr.myToday.invalidate();
  const clockIn = trpc.hr.clockIn.useMutation({ onSuccess: refresh });
  const clockOut = trpc.hr.clockOut.useMutation({ onSuccess: refresh });

  // 경과 시간 표시용 30초 틱
  const [now, setNow] = useState(nowMinutesKST);
  useEffect(() => { const t = setInterval(() => setNow(nowMinutesKST()), 30000); return () => clearInterval(t); }, []);

  if (isLoading) return null;

  const state: State = !myToday ? "before" : myToday.clockOut ? "done" : "working";
  const tone = TONE[state];
  const inMin = minutesOf(myToday?.clockIn);
  const elapsed = inMin === null ? 0 : (now - inMin + 1440) % 1440;
  const workHours = Number(myToday?.workHours ?? 0);
  const Icon = state === "before" ? LogIn : state === "working" ? Clock : CheckCircle2;

  // 헤더 정리 (2026-10-20 대표 요청): 출퇴근은 업무 도구 중 하나 — 한 줄·작은 크기·낮은 강조 (타일·두 줄·그림자 없음)
  const shell = cn(
    "h-8 shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-full px-2.5 text-[12px] text-muted-foreground",
    "transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
  );
  const short = state === "before" ? "출근하기" : state === "working" ? `근무 ${fmtDuration(elapsed)}` : `퇴근 · ${workHours.toFixed(1)}시간`;
  // 중간 폭(lg 미만)에서는 더 짧게 — 줄바꿈 대신 글자를 줄인다 (2026-10-20, #612 검토 잔여 2)
  const shorter = state === "before" ? "출근" : state === "working" ? `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : `${workHours.toFixed(1)}h`;
  const body = (
    <>
      <Icon className={cn("h-3.5 w-3.5 shrink-0", tone.icon)} />
      <span className={cn("tabular-nums", state === "before" ? "font-medium text-foreground/80" : "")}>
        <span className="hidden lg:inline">{short}</span><span className="lg:hidden">{shorter}</span>
      </span>
      <StatusDot state={state} />
    </>
  );

  // PC 출근 전: 버튼 하나로 바로 출근 (기존 동작)
  if (state === "before" && !compact) {
    return (
      <button type="button" className={shell} onClick={() => clockIn.mutate()} disabled={clockIn.isPending} data-testid="header-clock-in">
        {body}
      </button>
    );
  }

  const trigger = compact ? (
    <button type="button" aria-label={`출퇴근 — ${tone.label}`} data-testid="header-attendance-mobile"
      className="relative h-9 w-9 flex items-center justify-center rounded-lg hover:bg-accent transition-colors">
      <Clock className="h-[18px] w-[18px]" />
      <span className="absolute top-1.5 right-1.5"><StatusDot state={state} /></span>
    </button>
  ) : (
    <button type="button" className={shell} data-testid="header-attendance">{body}</button>
  );

  return (
    <Popover>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-0 overflow-hidden rounded-2xl">
        {/* 머리 */}
        <div className={cn("px-4 pt-4 pb-3", state === "working" ? "bg-emerald-500/[0.06]" : state === "done" ? "bg-sky-500/[0.06]" : "bg-muted/40")}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-muted-foreground">{todayLabel()}</span>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold"><StatusDot state={state} />{tone.label}</span>
          </div>
          <p className="mt-2 text-[26px] font-bold tracking-tight tabular-nums leading-none">
            {state === "before" ? "--" : state === "working" ? fmtDuration(elapsed) : `${workHours.toFixed(1)}시간`}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {state === "before" ? "아직 출근 기록이 없습니다" : state === "working" ? "출근 후 경과 시간" : "오늘 근무시간 (점심 제외 규칙 적용)"}
          </p>
        </div>

        {/* 타임라인 */}
        <ol className="px-4 py-3 space-y-2.5">
          <li className="flex items-center gap-3">
            <span className={cn("h-2.5 w-2.5 rounded-full ring-4", myToday ? "bg-emerald-500 ring-emerald-500/15" : "bg-slate-300 ring-slate-300/20")} />
            <span className="text-[13px] text-muted-foreground w-10">출근</span>
            <span className="ml-auto font-mono text-[13px] font-semibold">{hhmm(myToday?.clockIn)}</span>
          </li>
          <li className="flex items-center gap-3">
            <span className={cn("h-2.5 w-2.5 rounded-full ring-4", state === "done" ? "bg-sky-500 ring-sky-500/15" : "bg-slate-300 ring-slate-300/20")} />
            <span className="text-[13px] text-muted-foreground w-10">퇴근</span>
            <span className={cn("ml-auto font-mono text-[13px]", state === "done" ? "font-semibold" : "text-muted-foreground")}>
              {state === "done" ? hhmm(myToday?.clockOut) : state === "working" ? "근무 중" : "--:--"}
            </span>
          </li>
        </ol>

        {/* 동작 */}
        {state !== "done" && (
          <div className="px-4 pb-4">
            {state === "before" ? (
              <button type="button" onClick={() => clockIn.mutate()} disabled={clockIn.isPending}
                className="w-full h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
                <LogIn className="h-4 w-4" /> 출근하기
              </button>
            ) : (
              <button type="button" onClick={() => clockOut.mutate()} disabled={clockOut.isPending} data-testid="header-clock-out"
                className="w-full h-10 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[13px] font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <LogOut className="h-4 w-4" /> 퇴근하기
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
