/**
 * 회계 - 사내공지보드
 * 회계탭에서 접근하는 공지보드 (회계/재무 관련 공지 + 전체 공지)
 * DashboardLayout 감싸기 + 기존 board API 재사용
 */
import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Megaphone, ClipboardList, Pin, CheckCircle2, User, Loader2,
  Plus, X, Pencil, Trash2, Bell, BookOpen, Sparkles, Users,
  Calendar, AlertTriangle, TrendingUp, Award, ChevronDown, FileText
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Printer } from "lucide-react";

const typeConfig: Record<string, { label: string; emoji: string; color: string; bg: string }> = {
  notice: { label: "공지", emoji: "📢", color: "text-blue-700", bg: "bg-blue-50 border-l-blue-500" },
  work: { label: "작업지시", emoji: "📋", color: "text-amber-700", bg: "bg-amber-50 border-l-amber-500" },
  handover: { label: "전달사항", emoji: "📌", color: "text-emerald-700", bg: "bg-emerald-50 border-l-emerald-500" },
};

const categoryLabels: Record<string, { label: string; color: string }> = {
  BASIC: { label: "기본", color: "bg-blue-100 text-blue-700" },
  HYGIENE: { label: "위생", color: "bg-emerald-100 text-emerald-700" },
  PROCESS: { label: "공정", color: "bg-amber-100 text-amber-700" },
  CCP: { label: "CCP", color: "bg-red-100 text-red-700" },
  TRACE: { label: "추적", color: "bg-purple-100 text-purple-700" },
  RESPONSE: { label: "대응", color: "bg-orange-100 text-orange-700" },
};

export default function AccountingNoticeBoard() {
  const { isAdmin } = useAuth();
  const [selectedType, setSelectedType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [newType, setNewType] = useState("notice");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [statsPeriod, setStatsPeriod] = useState(30);
  const [showAllTopics, setShowAllTopics] = useState(false);
  const now = new Date();
  const [reportYear, setReportYear] = useState(now.getFullYear());
  const [reportMonth, setReportMonth] = useState(now.getMonth() + 1);

  const { data: items = [], refetch, isLoading } = trpc.board.getBoardItems.useQuery(
    { type: selectedType as any },
    { refetchInterval: 30000 }
  );
  const { data: stats, refetch: refetchStats } = trpc.board.getBoardStats.useQuery(undefined, { refetchInterval: 30000 });

  const ackMutation = trpc.board.ackLog.useMutation({
    onSuccess: (r: any) => {
      toast.success(r.alreadyAcked ? "이미 확인됨" : "확인 완료!");
      refetch();
    },
  });
  const createMutation = trpc.board.createNotice.useMutation({
    onSuccess: () => {
      toast.success("등록 완료!");
      setNewContent(""); setNewTitle(""); setShowForm(false);
      refetch(); refetchStats();
    },
  });
  const deleteMutation = trpc.board.deleteNotice.useMutation({
    onSuccess: () => { toast.success("삭제 완료!"); refetch(); refetchStats(); },
  });

  // ── 교육 관련 쿼리 ──
  const { data: trainingData, refetch: refetchTraining } = trpc.dailyTraining.getTodayTraining.useQuery(undefined, { refetchInterval: 60000 });
  const { data: trainingStatus } = trpc.dailyTraining.getStatus.useQuery(undefined, { refetchInterval: 30000 });
  const { data: trainingStats } = trpc.dailyTraining.getStats.useQuery({ days: statsPeriod }, { refetchInterval: 60000 });
  const { data: topics } = trpc.dailyTraining.listTopics.useQuery();
  const completeMutation = trpc.dailyTraining.complete.useMutation({
    onSuccess: () => { toast.success("교육 완료!"); refetchTraining(); },
  });

  // 미완료 이력 (관리자)
  const [historyDays, setHistoryDays] = useState(30);
  const { data: incompleteHistory } = trpc.dailyTraining.getIncompleteHistory.useQuery({ days: historyDays });

  // 월간 리포트 관련
  const { data: monthlyReports, refetch: refetchReports } = trpc.dailyTraining.listMonthlyReports.useQuery();
  const createReportMutation = trpc.dailyTraining.createMonthlyReport.useMutation({
    onSuccess: (result: any) => {
      if (result.success) {
        toast.success(result.message);
        refetchReports();
      } else {
        toast.info(result.message);
      }
    },
    onError: (e: any) => toast.error("리포트 생성 실패: " + e.message),
  });

  const { data: monthlyReport } = trpc.dailyTraining.getMonthlyReport.useQuery(
    { year: reportYear, month: reportMonth },
    { enabled: true }
  );

  const handlePrintReport = (year: number, month: number) => {
    // 승인된 리포트만 출력
    if (!monthlyReport) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>교육훈련 월간 기록부 ${year}년 ${month}월</title>
      <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      <style>@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
      </head><body><div id="root"></div>
      <script>window.onload=function(){setTimeout(function(){window.print()},500)}</script>
      </body></html>`);
    printWindow.document.close();
  };

  const completedUsers = trainingStatus?.users?.filter((u: any) => u.completed) || [];
  const incompleteUsers = trainingStatus?.users?.filter((u: any) => !u.completed) || [];

  const s = stats || { total: 0, notice: 0, work: 0, handover: 0 };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* 헤더 */}
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-600" />
            사내 공지보드
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">공지사항, 작업지시, 교육관리를 한 곳에서</p>
        </div>

        {/* 2탭: 공지/작업지시 + 교육 관리 */}
        <Tabs defaultValue="notice">
          <TabsList className="mb-4">
            <TabsTrigger value="notice" className="gap-1.5"><Megaphone className="h-4 w-4" /> 공지 / 작업지시</TabsTrigger>
            <TabsTrigger value="training" className="gap-1.5"><BookOpen className="h-4 w-4" /> 교육 관리 (5분 HACCP)</TabsTrigger>
          </TabsList>

          {/* ═══ TAB 1: 공지/작업지시 ═══ */}
          <TabsContent value="notice" className="space-y-5">
            <div className="flex justify-end">
              {isAdmin && (
                <Button onClick={() => setShowForm(!showForm)} variant={showForm ? "outline" : "default"} size="sm">
                  {showForm ? <><X className="h-4 w-4 mr-1" />닫기</> : <><Plus className="h-4 w-4 mr-1" />새 공지</>}
                </Button>
              )}
            </div>

        {/* 통계 */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "전체", count: s.total, color: "text-gray-700", bg: "bg-gray-50" },
            { label: "공지", count: s.notice, color: "text-blue-700", bg: "bg-blue-50" },
            { label: "작업", count: s.work, color: "text-amber-700", bg: "bg-amber-50" },
            { label: "전달", count: s.handover, color: "text-emerald-700", bg: "bg-emerald-50" },
          ].map((c) => (
            <div key={c.label} className={`${c.bg} rounded-lg border p-3 text-center`}>
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className={`text-xl font-bold ${c.color}`}>{c.count}</p>
            </div>
          ))}
        </div>

        {/* 필터 탭 */}
        <div className="flex gap-2">
          {[
            { key: "all", label: "전체" },
            { key: "notice", label: "📢 공지" },
            { key: "work", label: "📋 작업" },
            { key: "handover", label: "📌 전달" },
          ].map((t) => (
            <Button
              key={t.key}
              variant={selectedType === t.key ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedType(t.key)}
              className="text-xs"
            >
              {t.label}
            </Button>
          ))}
        </div>

        {/* 작성 폼 */}
        {showForm && isAdmin && (
          <div className="bg-white border rounded-xl p-5 space-y-3 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-gray-600">분류</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notice">📢 공지</SelectItem>
                    <SelectItem value="work">📋 작업지시</SelectItem>
                    <SelectItem value="handover">📌 전달사항</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold text-gray-600">제목</Label>
                <Input value={newTitle} onChange={(e: any) => setNewTitle(e.target.value)} placeholder="제목 (선택)" className="mt-1" />
              </div>
            </div>
            <Textarea value={newContent} onChange={(e: any) => setNewContent(e.target.value)} placeholder="내용을 입력하세요..." rows={3} />
            <div className="flex justify-end">
              <Button onClick={() => {
                if (!newContent.trim()) { toast.error("내용을 입력하세요"); return; }
                createMutation.mutate({ type: newType as any, content: newContent.trim(), title: newTitle.trim() || undefined });
              }} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                등록
              </Button>
            </div>
          </div>
        )}

        {/* 게시글 리스트 */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
          ) : (items as any[]).length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Megaphone className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">등록된 공지가 없습니다</p>
            </div>
          ) : (
            (items as any[]).map((item: any) => {
              const cfg = typeConfig[item.logType] || typeConfig.notice;
              const isAcked = Number(item.myAck) > 0;
              const ackCount = Number(item.ackCount) || 0;
              const totalUsers = Number(item.totalUsers) || 0;

              return (
                <div key={item.id} className={`bg-white rounded-xl border border-l-4 ${cfg.bg} p-4 shadow-sm`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`${cfg.color} text-[11px]`}>{cfg.emoji} {cfg.label}</Badge>
                      <span className="text-[11px] text-gray-400">
                        {new Date(item.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {isAdmin && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"
                          onClick={() => { if (confirm("삭제?")) deleteMutation.mutate({ id: item.id }); }}>
                          <Trash2 className="h-3.5 w-3.5 text-gray-400" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {item.title && <h3 className="font-bold text-gray-900 mb-1">{item.title}</h3>}
                  <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">{item.content}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <User className="h-3 w-3" /> {item.authorName || "관리자"}
                      <span>· 확인 {ackCount}/{totalUsers}</span>
                    </div>
                    <Button
                      size="sm"
                      variant={isAcked ? "outline" : "default"}
                      disabled={isAcked}
                      onClick={() => ackMutation.mutate({ logId: item.id })}
                      className="h-8 text-xs"
                    >
                      {isAcked ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />확인완료</> : "확인"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
          </TabsContent>

          {/* ═══ TAB 2: 교육 관리 (5분 HACCP) ═══ */}
          <TabsContent value="training" className="space-y-5">
            {/* 월간 교육훈련일지 생성 바 */}
            <div className="flex items-center justify-between bg-white rounded-xl border p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-700">월간 교육훈련일지</span>
                <select value={reportYear} onChange={e => setReportYear(Number(e.target.value))} className="text-xs border rounded px-2 py-1">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select value={reportMonth} onChange={e => setReportMonth(Number(e.target.value))} className="text-xs border rounded px-2 py-1">
                  {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                </select>
              </div>
              <Button
                size="sm"
                onClick={() => createReportMutation.mutate({ year: reportYear, month: reportMonth })}
                disabled={createReportMutation.isPending}
                className="gap-1.5 text-xs"
              >
                {createReportMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                집계 생성 + 승인요청
              </Button>
            </div>

            {/* 교육훈련일지 이력 리스트 */}
            {monthlyReports && monthlyReports.length > 0 && (
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="px-4 py-3 border-b font-bold text-sm text-gray-900 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-600" /> 교육훈련일지 이력
                </div>
                <div className="divide-y">
                  {(monthlyReports as any[]).map((r: any) => {
                    const statusConfig: Record<string, { label: string; color: string }> = {
                      draft: { label: "초안", color: "bg-gray-100 text-gray-600" },
                      pending: { label: "승인대기", color: "bg-amber-100 text-amber-700" },
                      reviewed: { label: "검토완료", color: "bg-blue-100 text-blue-700" },
                      approved: { label: "승인완료", color: "bg-emerald-100 text-emerald-700" },
                      rejected: { label: "반려", color: "bg-red-100 text-red-700" },
                    };
                    const sc = statusConfig[r.status] || statusConfig.draft;
                    return (
                      <div key={r.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-gray-800">{r.year}년 {r.month}월</span>
                          <Badge className={`${sc.color} text-[10px] px-2`}>{sc.label}</Badge>
                          <span className="text-xs text-gray-500">
                            교육 {r.total_days}일 · {r.total_users}명 · 이수율 {r.overall_rate}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400">
                            {r.created_by_name} · {new Date(r.created_at).toLocaleDateString("ko-KR")}
                          </span>
                          {r.status === "approved" && (
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                              setReportYear(r.year); setReportMonth(r.month);
                              handlePrintReport(r.year, r.month);
                            }}>
                              <Printer className="h-3 w-3" /> 출력
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 교육 요약 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><Calendar className="h-3.5 w-3.5" /> 오늘 교육</div>
                <p className="text-xl font-bold text-violet-700">{trainingStatus?.assigned ? `Day ${trainingStatus.dayNo}` : "휴무"}</p>
              </div>
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> 완료</div>
                <p className="text-xl font-bold text-emerald-600">{trainingStatus?.completedCount || 0}<span className="text-sm text-gray-400">/{trainingStatus?.totalCount || 0}명</span></p>
              </div>
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><AlertTriangle className="h-3.5 w-3.5 text-red-500" /> 미완료</div>
                <p className="text-xl font-bold text-red-600">{incompleteUsers.length}<span className="text-sm text-gray-400">명</span></p>
              </div>
              <div className="bg-white rounded-xl border p-4 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1"><TrendingUp className="h-3.5 w-3.5 text-blue-500" /> {statsPeriod}일 이수율</div>
                <p className={`text-xl font-bold ${(trainingStats?.completionRate || 0) >= 90 ? "text-emerald-600" : (trainingStats?.completionRate || 0) >= 70 ? "text-amber-600" : "text-red-600"}`}>{trainingStats?.completionRate || 0}%</p>
              </div>
            </div>

            {/* 오늘의 교육 카드 */}
            {trainingData?.assigned && trainingData.topic && (
              <div className={`bg-white rounded-xl border p-5 shadow-sm ${trainingData.completed ? "border-emerald-200" : "border-violet-200 border-l-4 border-l-violet-500"}`}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className="bg-violet-100 text-violet-700 text-xs">Day {trainingData.dayNo}</Badge>
                  <Badge className={(categoryLabels[trainingData.topic.category]?.color || "bg-gray-100 text-gray-700") + " text-xs"}>
                    {categoryLabels[trainingData.topic.category]?.label || trainingData.topic.category}
                  </Badge>
                  {trainingData.completed && <Badge className="bg-emerald-100 text-emerald-700 text-xs">완료</Badge>}
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                  오늘의 5분 HACCP — {trainingData.topic.title}
                </h3>
                <div className="space-y-3">
                  <div className="bg-violet-50 rounded-lg px-4 py-3 border border-violet-100">
                    <p className="text-xs font-bold text-violet-700 mb-1">❓ 질문</p>
                    <p className="text-sm text-gray-700">{trainingData.topic.question}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg px-4 py-3 border border-blue-100">
                    <p className="text-xs font-bold text-blue-700 mb-1">📘 핵심</p>
                    <p className="text-sm text-gray-700">{trainingData.topic.content}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg px-4 py-3 border border-amber-100">
                    <p className="text-xs font-bold text-amber-700 mb-1">👉 오늘 행동</p>
                    <p className="text-sm text-gray-700 font-medium">{trainingData.topic.action}</p>
                  </div>
                </div>
                {!trainingData.completed && (
                  <Button
                    onClick={() => completeMutation.mutate({ dayNo: trainingData.dayNo! })}
                    disabled={completeMutation.isPending}
                    className="w-full mt-4 h-10 bg-violet-600 hover:bg-violet-700"
                  >
                    {completeMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                    완료하기
                  </Button>
                )}
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-5">
              {/* 오늘 완료 현황 */}
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="px-4 py-3 border-b font-bold text-sm text-gray-900 flex items-center gap-2">
                  <Users className="h-4 w-4" /> 오늘 완료 현황
                </div>
                <div className="p-4 space-y-1.5 max-h-[300px] overflow-y-auto">
                  {!trainingStatus?.assigned ? (
                    <p className="text-center text-gray-400 py-6 text-sm">오늘은 교육 배정 없음 (휴무)</p>
                  ) : (trainingStatus?.users || []).length === 0 ? (
                    <p className="text-center text-gray-400 py-6 text-sm">등록된 직원 없음</p>
                  ) : (
                    <>
                      {incompleteUsers.map((u: any) => (
                        <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-sm">
                          <span className="font-medium">{u.name} <span className="text-xs text-gray-400">{u.role}</span></span>
                          <Badge variant="outline" className="text-red-600 border-red-200 text-[10px]">미완료</Badge>
                        </div>
                      ))}
                      {completedUsers.map((u: any) => (
                        <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-100 text-sm">
                          <span className="font-medium">{u.name} <span className="text-xs text-gray-400">{u.role}</span></span>
                          <span className="text-[11px] text-emerald-600">{u.completedAt ? new Date(u.completedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "완료"}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* 이수율 통계 */}
              <div className="bg-white rounded-xl border shadow-sm">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <span className="font-bold text-sm text-gray-900 flex items-center gap-2"><Award className="h-4 w-4 text-amber-500" /> 이수율 통계</span>
                  <div className="flex gap-1">{[30, 60, 90].map(d => (
                    <Button key={d} variant={statsPeriod === d ? "default" : "outline"} size="sm" onClick={() => setStatsPeriod(d)} className="h-6 text-[10px] px-2">{d}일</Button>
                  ))}</div>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">전체 이수율</span>
                      <span className="font-bold">{trainingStats?.completionRate || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${(trainingStats?.completionRate || 0) >= 90 ? "bg-emerald-500" : (trainingStats?.completionRate || 0) >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(trainingStats?.completionRate || 0, 100)}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1 max-h-[200px] overflow-y-auto">
                    {(trainingStats?.userStats || []).map((u: any) => {
                      const r = trainingStats?.assignedDays ? Math.round((u.done_count / trainingStats.assignedDays) * 100) : 0;
                      return (
                        <div key={u.id} className="flex items-center gap-2 text-xs">
                          <span className="w-16 truncate font-medium text-gray-700">{u.name}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-1.5"><div className={`h-1.5 rounded-full ${r >= 90 ? "bg-emerald-400" : r >= 70 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${r}%` }} /></div>
                          <span className="font-bold text-gray-600 w-8 text-right">{r}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* 미완료 이력 (관리자) */}
            {incompleteHistory && incompleteHistory.length > 0 && (
              <div className="bg-white rounded-xl border border-red-200 shadow-sm">
                <div className="px-4 py-3 border-b border-red-100 flex items-center justify-between bg-red-50">
                  <span className="font-bold text-sm text-red-800 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> 미완료 이력 ({incompleteHistory.length}건)
                  </span>
                  <div className="flex gap-1">{[7, 14, 30].map(d => (
                    <Button key={d} variant={historyDays === d ? "default" : "outline"} size="sm" onClick={() => setHistoryDays(d)} className="h-6 text-[10px] px-2">{d}일</Button>
                  ))}</div>
                </div>
                <div className="divide-y max-h-[300px] overflow-y-auto">
                  {(incompleteHistory as any[]).map((h: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 text-sm hover:bg-red-50/50">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-800 w-16 truncate">{h.userName}</span>
                        <span className="text-[10px] text-gray-400">{h.role}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          {new Date(h.assignmentDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" })}
                        </span>
                        <Badge className="bg-violet-100 text-violet-700 text-[10px]">Day {h.dayNo}</Badge>
                        <span className="text-xs text-gray-600 w-24 truncate">{h.title}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 120일 교육 과정 */}
            <div className="bg-white rounded-xl border shadow-sm">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <span className="font-bold text-sm text-gray-900 flex items-center gap-2"><BookOpen className="h-4 w-4 text-violet-600" /> 120일 교육 과정</span>
                <Button variant="outline" size="sm" onClick={() => setShowAllTopics(!showAllTopics)} className="h-7 text-xs">
                  {showAllTopics ? "접기" : "전체 보기"} <ChevronDown className={`h-3 w-3 ml-1 ${showAllTopics ? "rotate-180" : ""}`} />
                </Button>
              </div>
              <div className="p-4 space-y-1">
                {/* 헤더 행 */}
                <div className="flex items-center gap-3 px-3 py-1 text-[10px] font-bold text-gray-400 border-b border-gray-100 mb-1">
                  <span className="w-6 text-right">Day</span>
                  <span className="w-12">분류</span>
                  <span className="flex-1">제목</span>
                  <span className="w-20 text-center hidden md:block">교육일</span>
                  <span className="w-16 text-right hidden md:block">이수율</span>
                </div>
                {(topics || []).slice(0, showAllTopics ? 120 : 10).map((t: any) => {
                  const cat = categoryLabels[t.category] || { label: t.category, color: "bg-gray-100 text-gray-700" };
                  const isToday = trainingStatus?.dayNo === t.day_no;
                  const rate = t.completionRate ?? 0;
                  const dateStr = t.assignedDate ? new Date(t.assignedDate).toLocaleDateString("ko-KR", { month: "short", day: "numeric" }) : "-";
                  return (
                    <div key={t.id} className={`flex items-center gap-3 px-3 py-1.5 rounded text-sm ${isToday ? "bg-violet-50 border border-violet-200" : "hover:bg-gray-50"}`}>
                      <span className="text-gray-400 w-6 text-right text-xs font-mono">{isToday ? "▶" : ""}{t.day_no}</span>
                      <Badge className={`${cat.color} text-[10px] px-1.5 h-5 w-12 justify-center`}>{cat.label}</Badge>
                      <span className={`font-medium flex-1 truncate ${isToday ? "text-violet-700" : "text-gray-700"}`}>{t.title}</span>
                      <span className="text-gray-400 text-xs w-20 text-center hidden md:block">{dateStr}</span>
                      <span className={`text-xs font-bold w-16 text-right hidden md:block ${
                        rate >= 90 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : rate > 0 ? "text-red-500" : "text-gray-300"
                      }`}>
                        {t.assignedDate ? `${rate}%` : "-"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
