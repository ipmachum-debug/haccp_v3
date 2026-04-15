/**
 * 관리자 교육 관리 페이지
 * - 오늘 완료 현황 (직원별 완료/미완료)
 * - 이수율 통계 (30일/90일)
 * - 120일 교육 주제 목록
 * - 감사 대응용 리포트
 */
import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookOpen, Users, CheckCircle2, XCircle, TrendingUp,
  Calendar, Award, AlertTriangle, Loader2, ChevronDown
} from "lucide-react";

const categoryLabels: Record<string, { label: string; color: string }> = {
  BASIC: { label: "기본", color: "bg-blue-100 text-blue-700" },
  HYGIENE: { label: "위생", color: "bg-emerald-100 text-emerald-700" },
  PROCESS: { label: "공정", color: "bg-amber-100 text-amber-700" },
  CCP: { label: "CCP", color: "bg-red-100 text-red-700" },
  TRACE: { label: "추적", color: "bg-purple-100 text-purple-700" },
  RESPONSE: { label: "대응", color: "bg-orange-100 text-orange-700" },
};

export default function TrainingAdmin() {
  const [statsPeriod, setStatsPeriod] = useState(30);
  const [showAllTopics, setShowAllTopics] = useState(false);

  const { data: status, isLoading: statusLoading } = trpc.dailyTraining.getStatus.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: stats, isLoading: statsLoading } = trpc.dailyTraining.getStats.useQuery(
    { days: statsPeriod },
    { refetchInterval: 60000 }
  );
  const { data: topics } = trpc.dailyTraining.listTopics.useQuery();

  const completedUsers = status?.users?.filter((u: any) => u.completed) || [];
  const incompleteUsers = status?.users?.filter((u: any) => !u.completed) || [];

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-violet-600" />
              교육 관리 (오늘의 5분 HACCP)
            </h1>
            <p className="text-sm text-gray-500 mt-1">직원 교육 이수 현황 및 감사 대응 데이터</p>
          </div>
        </div>

        {/* ═══ 상단 요약 카드 4개 ═══ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <Calendar className="h-4 w-4" /> 오늘 교육
            </div>
            <p className="text-2xl font-bold text-violet-700">
              {status?.assigned ? `Day ${status.dayNo}` : "휴무"}
            </p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" /> 완료
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {status?.completedCount || 0}<span className="text-sm text-gray-400">/{status?.totalCount || 0}명</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-500" /> 미완료
            </div>
            <p className="text-2xl font-bold text-red-600">
              {incompleteUsers.length}<span className="text-sm text-gray-400">명</span>
            </p>
          </div>
          <div className="bg-white rounded-xl border p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-500" /> {statsPeriod}일 이수율
            </div>
            <p className={`text-2xl font-bold ${
              (stats?.completionRate || 0) >= 90 ? "text-emerald-600" :
              (stats?.completionRate || 0) >= 70 ? "text-amber-600" : "text-red-600"
            }`}>
              {stats?.completionRate || 0}%
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* ═══ 오늘 완료 현황 ═══ */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-gray-600" />
                오늘 완료 현황
              </h2>
              {status?.assigned && (
                <Badge variant="outline" className="text-violet-700 border-violet-200">
                  Day {status.dayNo}
                </Badge>
              )}
            </div>
            <div className="p-5">
              {statusLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : !status?.assigned ? (
                <p className="text-center text-gray-400 py-8">오늘은 교육 배정이 없습니다 (휴무)</p>
              ) : (
                <div className="space-y-2">
                  {/* 미완료 먼저 (경고) */}
                  {incompleteUsers.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-100">
                      <div className="flex items-center gap-2">
                        <XCircle className="h-4 w-4 text-red-400" />
                        <span className="text-sm font-medium text-gray-800">{u.name}</span>
                        <span className="text-[11px] text-gray-400">{u.role}</span>
                      </div>
                      <Badge variant="outline" className="text-red-600 border-red-200 text-[11px]">미완료</Badge>
                    </div>
                  ))}
                  {/* 완료 */}
                  {completedUsers.map((u: any) => (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm font-medium text-gray-800">{u.name}</span>
                        <span className="text-[11px] text-gray-400">{u.role}</span>
                      </div>
                      <span className="text-[11px] text-emerald-600 font-medium">
                        {u.completedAt ? new Date(u.completedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "완료"}
                      </span>
                    </div>
                  ))}
                  {(status?.users?.length || 0) === 0 && (
                    <p className="text-center text-gray-400 py-4">등록된 직원이 없습니다</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ═══ 이수율 통계 ═══ */}
          <div className="bg-white rounded-xl border shadow-sm">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Award className="h-5 w-5 text-amber-500" />
                이수율 통계
              </h2>
              <div className="flex gap-1">
                {[30, 60, 90].map((d) => (
                  <Button
                    key={d}
                    variant={statsPeriod === d ? "default" : "outline"}
                    size="sm"
                    onClick={() => setStatsPeriod(d)}
                    className="h-7 text-xs"
                  >
                    {d}일
                  </Button>
                ))}
              </div>
            </div>
            <div className="p-5">
              {statsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* 전체 이수율 게이지 */}
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600 font-medium">전체 이수율</span>
                      <span className="font-bold">{stats?.completionRate || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          (stats?.completionRate || 0) >= 90 ? "bg-emerald-500" :
                          (stats?.completionRate || 0) >= 70 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(stats?.completionRate || 0, 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                      <span>배정 {stats?.assignedDays || 0}일 × {stats?.totalUsers || 0}명 = {stats?.totalExpected || 0}건</span>
                      <span>완료 {stats?.totalDone || 0}건</span>
                    </div>
                  </div>

                  {/* 직원별 이수 현황 */}
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {(stats?.userStats || []).map((u: any) => {
                      const userRate = stats?.assignedDays ? Math.round((u.done_count / stats.assignedDays) * 100) : 0;
                      return (
                        <div key={u.id} className="flex items-center gap-3 px-2 py-1.5">
                          <span className="text-sm text-gray-700 w-20 truncate font-medium">{u.name}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${
                                userRate >= 90 ? "bg-emerald-400" : userRate >= 70 ? "bg-amber-400" : "bg-red-400"
                              }`}
                              style={{ width: `${Math.min(userRate, 100)}%` }}
                            />
                          </div>
                          <span className="text-[12px] font-bold text-gray-600 w-12 text-right">{userRate}%</span>
                          <span className="text-[11px] text-gray-400 w-16 text-right">{u.done_count}/{stats?.assignedDays || 0}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ 120일 교육 주제 목록 ═══ */}
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-violet-600" />
              120일 교육 과정
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAllTopics(!showAllTopics)}
              className="h-8 text-xs"
            >
              {showAllTopics ? "접기" : "전체 보기"}
              <ChevronDown className={`h-3 w-3 ml-1 transition-transform ${showAllTopics ? "rotate-180" : ""}`} />
            </Button>
          </div>
          <div className="p-5">
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-3 py-1 text-[10px] font-bold text-gray-400 border-b mb-1">
              <span className="w-8 text-right">Day</span>
              <span className="w-12">분류</span>
              <span className="flex-1">제목</span>
              <span className="w-20 text-center hidden sm:block">교육일</span>
              <span className="w-16 text-right hidden sm:block">이수율</span>
            </div>
            <div className="grid gap-1">
              {(topics || []).slice(0, showAllTopics ? 120 : 20).map((t: any) => {
                const cat = categoryLabels[t.category] || { label: t.category, color: "bg-gray-100 text-gray-700" };
                const isToday = status?.dayNo === t.day_no;
                const rate = t.completionRate ?? 0;
                const dateStr = t.assignedDate ? new Date(t.assignedDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : "-";
                return (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                      isToday ? "bg-violet-50 border border-violet-200" : "hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-gray-400 w-8 text-right font-mono text-xs">
                      {isToday ? "▶" : ""}{t.day_no}
                    </span>
                    <Badge className={`${cat.color} text-[10px] px-2 py-0 h-5 font-bold w-12 justify-center`}>{cat.label}</Badge>
                    <span className={`font-medium flex-1 truncate ${isToday ? "text-violet-700" : "text-gray-700"}`}>{t.title}</span>
                    <span className="text-gray-400 text-xs w-20 text-center hidden sm:block">{dateStr}</span>
                    <span className={`text-xs font-bold w-16 text-right hidden sm:block ${
                      rate >= 90 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : rate > 0 ? "text-red-500" : "text-gray-300"
                    }`}>{t.assignedDate ? `${rate}%` : "-"}</span>
                  </div>
                );
              })}
            </div>
            {!showAllTopics && (topics || []).length > 20 && (
              <p className="text-center text-gray-400 text-sm mt-3">
                ... 외 {(topics || []).length - 20}개 주제
              </p>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
