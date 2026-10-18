/**
 * 개별 온습도·냉동냉장 화면 안내 — 일지 설정(v2)을 발행한 회사는 같은 측정을 일일일지에서 한 번만 적는다
 * (2026-10-18, docs/architecture/17 E). 막지 않는다: 이전 기록 열람·수정은 그대로.
 */
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { SECTION_TITLES, type MeasureSection } from "@shared/dailyLog/definition";

export default function DailyLogV2Notice({ section, date }: { section: MeasureSection; date?: string }) {
  const [, navigate] = useLocation();
  const { data } = trpc.dailyLog.mode.useQuery(undefined, { staleTime: 60_000, retry: false });
  if (data?.version !== 2) return null;
  return (
    <div className="mx-6 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900 print:hidden" data-testid="daily-log-v2-notice">
      <span>이 회사는 {SECTION_TITLES[section]}를 일일일지에서 기록합니다 — 같은 측정을 두 번 적지 않도록 일일일지에 입력하세요. 이 화면은 이전 기록 확인용입니다.</span>
      <Button size="sm" className="h-11" onClick={() => navigate(date ? `/daily-log/daily?date=${date}` : "/daily-log/daily")}>일일일지로 가기</Button>
    </div>
  );
}
