/**
 * 공지보드 (일반직원용 + 관리자 수정/삭제)
 * 
 * /board 경로
 * - HACCP-One 프리미엄 브랜딩 헤더 + 로그아웃 버튼
 * - 📢 공지 / 📋 작업 / 📌 전달사항 섹션
 * - 각 항목에 [확인] 버튼 (확인 수 표시)
 * - 관리자: 수정/삭제 버튼
 * - 모바일 최적화 UX (인터넷 활용도가 떨어지는 사용자 대응)
 */
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Bell,
  Megaphone,
  ClipboardList,
  Pin,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  LogOut,
  User,
  Loader2,
  RefreshCw,
  Pencil,
  Trash2,
  X,
  Plus,
  AlertCircle,
  Shield,
  ChevronRight,
} from "lucide-react";
import MobileBottomNav from "@/components/MobileBottomNav";
import { BookOpen, Sparkles } from "lucide-react";

// 타입별 아이콘/색상 설정
const typeConfig: Record<string, { icon: any; label: string; emoji: string; bgColor: string; textColor: string; borderColor: string; gradientFrom: string; gradientTo: string }> = {
  notice: { icon: Megaphone, label: "공지", emoji: "📢", bgColor: "bg-blue-50", textColor: "text-blue-700", borderColor: "border-l-blue-500", gradientFrom: "from-blue-500", gradientTo: "to-blue-600" },
  work: { icon: ClipboardList, label: "작업", emoji: "📋", bgColor: "bg-amber-50", textColor: "text-amber-700", borderColor: "border-l-amber-500", gradientFrom: "from-amber-500", gradientTo: "to-amber-600" },
  handover: { icon: Pin, label: "전달사항", emoji: "📌", bgColor: "bg-emerald-50", textColor: "text-emerald-700", borderColor: "border-l-emerald-500", gradientFrom: "from-emerald-500", gradientTo: "to-emerald-600" },
};

// 오늘 날짜 포맷
function getTodayString(): string {
  const now = new Date();
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일 (${days[now.getDay()]})`;
}

// 시간대별 인사
function getBoardGreeting(): string {
  const h = new Date().getHours();
  const day = new Date().getDay();
  if (day === 5) return "불금이에요! 오늘도 힘내세요";
  if (day === 1) return "새로운 한 주가 시작됐어요";
  if (h >= 5 && h < 12) return "좋은 아침이에요! 오늘도 화이팅";
  if (h >= 12 && h < 14) return "점심 맛있게 드세요";
  if (h >= 14 && h < 18) return "오후도 파이팅이에요";
  if (h >= 18 && h < 22) return "오늘 하루도 수고하셨어요";
  return "늦은 시간까지 정말 수고 많으세요";
}

function BoardItem({ item, onAck, onEdit, onDelete }: { 
  item: any; 
  onAck: (id: number) => void;
  onEdit?: (item: any) => void;
  onDelete?: (id: number) => void;
}) {
  const config = typeConfig[item.logType] || typeConfig.notice;
  const isAcked = Number(item.myAck) > 0;
  const ackCount = Number(item.ackCount) || 0;
  const totalUsers = Number(item.totalUsers) || 0;
  const ackPercent = totalUsers > 0 ? Math.round((ackCount / totalUsers) * 100) : 0;

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg overflow-hidden border-l-[5px] ${config.borderColor} transition-all duration-200`}>
      <div className="p-4 sm:p-5">
        {/* 타입 뱃지 + 시간 + 수정/삭제 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold ${config.bgColor} ${config.textColor}`}>
              <span className="text-sm">{config.emoji}</span>
              {config.label}
            </span>
            {item.status === "received" && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100">
                <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
                NEW
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-gray-400 mr-1">
              {new Date(item.createdAt).toLocaleString("ko-KR", {
                month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit"
              })}
            </span>
            {onEdit && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-300 hover:text-blue-500 rounded-lg" onClick={() => onEdit(item)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {onDelete && (
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-gray-300 hover:text-rose-500 rounded-lg" onClick={() => onDelete(item.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* 제목 (있으면) */}
        {item.title && (
          <h3 className="text-[16px] font-bold text-gray-900 mb-2 leading-snug">{item.title}</h3>
        )}

        {/* 내용 */}
        <p className="text-[14px] text-gray-600 leading-relaxed whitespace-pre-wrap mb-4">
          {item.content}
        </p>

        {/* 하단: 작성자 + 확인 진행바 + 버튼 */}
        <div className="flex items-center gap-3">
          {/* 작성자 */}
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
              <User className="h-3 w-3 text-gray-500" />
            </div>
            <span className="text-[12px] font-medium text-gray-500">{item.authorName || "관리자"}</span>
          </div>

          {/* 확인 진행 */}
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${
                  ackPercent >= 100 ? 'bg-emerald-500' : ackPercent >= 50 ? 'bg-blue-500' : 'bg-amber-400'
                }`}
                style={{ width: `${Math.min(ackPercent, 100)}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-400 font-semibold shrink-0">{ackCount}/{totalUsers}</span>
          </div>

          {/* 확인 버튼 - 크게 */}
          <Button
            size="sm"
            disabled={isAcked}
            onClick={() => onAck(item.id)}
            className={`h-10 px-5 rounded-xl text-[13px] font-bold transition-all shrink-0 ${
              isAcked
                ? "bg-gray-50 text-gray-400 cursor-not-allowed border border-gray-200"
                : "bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 shadow-lg shadow-blue-500/25 active:scale-95"
            }`}
          >
            {isAcked ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1.5" />
                확인완료
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-1.5" />
                확인
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function NoticeBoard() {
  const { user, logout, isAdmin } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 로그아웃 핸들러 - 즉시 로딩 표시 + 완료 후 로그인 페이지 이동
  const handleLogout = async () => {
    if (!confirm("로그아웃 하시겠습니까?")) return;
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (e) {
      // ignore
    } finally {
      window.location.href = "/login";
    }
  };
  const [selectedType, setSelectedType] = useState<string>("all");
  
  // 수정 모드 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editType, setEditType] = useState<string>("notice");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  // 작성 폼 상태 (관리자용)
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newType, setNewType] = useState<string>("notice");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const { data: items = [], refetch, isLoading } = trpc.board.getBoardItems.useQuery(
    { type: selectedType as any },
    { refetchInterval: 30000 }
  );

  const { data: boardStats, refetch: refetchStats } = trpc.board.getBoardStats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  // ── 오늘의 5분 HACCP 교육 ──
  const { data: trainingData, refetch: refetchTraining } = trpc.dailyTraining.getTodayTraining.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const completeMutation = trpc.dailyTraining.complete.useMutation({
    onSuccess: () => {
      toast.success("교육 완료! 오늘도 수고하셨습니다 👍");
      refetchTraining();
    },
    onError: (e: any) => toast.error("완료 처리 실패: " + e.message),
  });

  const ackMutation = trpc.board.ackLog.useMutation({
    onSuccess: (result: any) => {
      if (result.alreadyAcked) {
        toast.info("이미 확인한 항목입니다");
      } else {
        toast.success("확인 완료!");
      }
      refetch();
    },
    onError: (error: any) => {
      toast.error("확인 처리 실패: " + error.message);
    },
  });

  const createNoticeMutation = trpc.board.createNotice.useMutation({
    onSuccess: () => {
      toast.success("등록 완료! 직원들에게 알림이 전송됩니다.");
      setNewContent(""); setNewTitle(""); setNewType("notice"); setShowCreateForm(false);
      refetch(); refetchStats();
    },
    onError: (error: any) => toast.error("등록 실패: " + error.message),
  });

  const updateNoticeMutation = trpc.board.updateNotice.useMutation({
    onSuccess: () => {
      toast.success("수정 완료!");
      setEditingId(null);
      refetch(); refetchStats();
    },
    onError: (error: any) => toast.error("수정 실패: " + error.message),
  });

  const deleteNoticeMutation = trpc.board.deleteNotice.useMutation({
    onSuccess: () => {
      toast.success("삭제 완료!");
      refetch(); refetchStats();
    },
    onError: (error: any) => toast.error("삭제 실패: " + error.message),
  });

  const isCreatePending = "isPending" in createNoticeMutation ? (createNoticeMutation as any).isPending : (createNoticeMutation as any).isLoading;

  const handleAck = (logId: number) => {
    ackMutation.mutate({ logId });
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditType(item.logType || "notice");
    setEditTitle(item.title || "");
    setEditContent(item.content || "");
  };

  const submitEdit = () => {
    if (!editingId || !editContent.trim()) return;
    updateNoticeMutation.mutate({
      id: editingId,
      type: editType as any,
      title: editTitle.trim() || undefined,
      content: editContent.trim(),
    });
  };

  const filteredItems = (items as any[]);
  const stats = boardStats || { total: 0, notice: 0, work: 0, handover: 0, received: 0, inProgress: 0, completed: 0 };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 pb-20">
      {/* ═══════════════════════════════════════ */}
      {/* 프리미엄 브랜딩 헤더 (밝은 톤) */}
      {/* ═══════════════════════════════════════ */}
      <div className="sticky top-0 z-40">
        <div className="bg-gradient-to-br from-white via-slate-50 to-blue-50/80 shadow-lg border-b border-gray-200/60">
          {/* 골드 악센트 상단 라인 */}
          <div className="h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />

          {/* 상단 바: 텍스트 로고 + 유저 + 로그아웃 */}
          <div className="px-4 pt-3 pb-2.5">
            <div className="flex items-center justify-between">
              {/* 텍스트 로고 */}
              <div>
                <div className="flex items-baseline gap-0.5">
                  <h1 className="text-[20px] font-black tracking-tight text-gray-800">HACCP</h1>
                  <span className="text-[20px] font-bold text-amber-500">-One</span>
                </div>
                <p className="text-[11px] text-gray-400 font-semibold -mt-0.5 tracking-wide">식품안전관리 통합 플랫폼</p>
              </div>

              {/* 유저 + 로그아웃 */}
              <div className="flex items-center gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center text-sm font-bold text-white shadow-md shadow-amber-300/30">
                    {(user?.name || "?")[0]}
                  </div>
                  <div className="hidden sm:block text-right">
                    <p className="text-xs font-bold text-gray-700 leading-tight">{user?.name || "사용자"}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">
                      {isAdmin ? "관리자" : "직원"}
                    </p>
                  </div>
                </div>

                {/* 로그아웃 버튼 */}
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-500 border border-red-200 hover:border-red-500 text-red-600 hover:text-white text-[13px] font-bold transition-all duration-200 active:scale-95 disabled:opacity-60 disabled:cursor-wait"
                >
                  {isLoggingOut ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <LogOut className="h-4 w-4" />
                  )}
                  <span>로그아웃</span>
                </button>
              </div>
            </div>
          </div>

          {/* 인사말 + 날짜 카드 */}
          <div className="px-4 pb-3">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl px-4 py-3 border border-blue-100/60">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-gray-800 leading-snug truncate">
                    {user?.name ? `${user.name}님, ` : ""}{getBoardGreeting()}
                  </p>
                  <p className="text-[12px] text-gray-400 mt-0.5">
                    오늘의 공지와 작업지시를 확인해주세요
                  </p>
                </div>
                <div className="text-right shrink-0 bg-white/70 rounded-xl px-3 py-1.5 border border-gray-200/60">
                  <p className="text-[11px] font-bold text-gray-500">{getTodayString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 통계 카드 4개 */}
          <div className="px-4 pb-4">
            <div className="grid grid-cols-4 gap-2">
              {[
                { emoji: "📢", label: "공지", count: stats.notice, bg: "bg-blue-50", border: "border-blue-100", text: "text-blue-700", labelColor: "text-blue-400" },
                { emoji: "📋", label: "작업", count: stats.work, bg: "bg-amber-50", border: "border-amber-100", text: "text-amber-700", labelColor: "text-amber-500" },
                { emoji: "📌", label: "전달", count: stats.handover, bg: "bg-emerald-50", border: "border-emerald-100", text: "text-emerald-700", labelColor: "text-emerald-500" },
                { emoji: "📖", label: "교육", count: trainingData?.assigned ? (trainingData.completed ? 0 : 1) : 0, bg: "bg-violet-50", border: "border-violet-100", text: "text-violet-700", labelColor: "text-violet-400" },
              ].map((card) => (
                <div key={card.label} className={`${card.bg} rounded-2xl border ${card.border} overflow-hidden`}>
                  <div className="flex flex-col items-center justify-center px-2 py-3 text-center">
                    <span className="text-lg leading-none">{card.emoji}</span>
                    <p className={`text-[10px] ${card.labelColor} font-bold leading-none mt-1.5 truncate w-full`}>{card.label}</p>
                    <p className={`text-2xl font-black ${card.text} leading-none mt-1`}>{card.count}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 필터 탭 바 */}
        <div className="bg-white/95 backdrop-blur-md border-b border-gray-200/80 shadow-sm px-3 py-2.5">
          <div className="flex items-center justify-between gap-1">
            <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
              {[
                { key: "all", label: "전체", count: stats.total },
                { key: "notice", label: "공지", count: stats.notice },
                { key: "work", label: "작업", count: stats.work },
                { key: "handover", label: "전달", count: stats.handover },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSelectedType(tab.key)}
                  className={`flex items-center gap-0.5 px-2.5 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all shrink-0 ${
                    selectedType === tab.key
                      ? "bg-gradient-to-r from-gray-800 to-gray-700 text-white shadow-lg shadow-gray-400/25"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200 active:bg-gray-300"
                  }`}
                >
                  {tab.label}
                  {tab.count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${
                      selectedType === tab.key ? "bg-white/20 text-white" : "bg-gray-200 text-gray-600"
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isAdmin && (
                <Button 
                  onClick={() => setShowCreateForm(!showCreateForm)} 
                  size="sm"
                  className={`h-10 px-5 text-[13px] font-bold rounded-xl shadow-md ${
                    showCreateForm 
                      ? "bg-gray-200 text-gray-600 hover:bg-gray-300" 
                      : "bg-gradient-to-r from-gray-800 to-gray-700 text-white hover:opacity-90 shadow-gray-400/25"
                  }`}
                >
                  {showCreateForm ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  {showCreateForm ? "닫기" : "새 글 등록"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════ */}
      {/* 관리자 글 작성 폼 */}
      {/* ═══════════════════════════════════════ */}
      {showCreateForm && isAdmin && (
        <div className="px-4 pt-4">
          <div className="bg-white border border-gray-200/80 rounded-2xl p-5 space-y-4 shadow-lg shadow-gray-200/50">
            <div className="flex items-center gap-2.5">
              <div className="w-1.5 h-7 bg-gradient-to-b from-amber-400 to-amber-500 rounded-full" />
              <span className="text-[15px] font-bold text-gray-800">새 글 작성</span>
              <span className="text-[11px] text-gray-400 ml-auto bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg font-semibold border border-amber-100">전 직원에게 알림 전송</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-bold text-gray-600">분류 *</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger className="bg-gray-50 border-gray-200 h-11 text-sm rounded-xl font-medium"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="notice">📢 공지</SelectItem>
                    <SelectItem value="work">📋 작업지시</SelectItem>
                    <SelectItem value="handover">📌 전달사항</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-bold text-gray-600">제목 (선택)</Label>
                <Input value={newTitle} onChange={(e: any) => setNewTitle(e.target.value)} placeholder="제목 입력" className="bg-gray-50 border-gray-200 h-11 text-sm rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-bold text-gray-600">내용 *</Label>
              <Textarea value={newContent} onChange={(e: any) => setNewContent(e.target.value)} placeholder="공지, 작업지시 또는 전달사항 내용을 입력하세요..." rows={4} className="bg-gray-50 border-gray-200 resize-none text-sm rounded-xl leading-relaxed" />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={() => { setNewContent(""); setNewTitle(""); setNewType("notice"); }} className="h-10 px-5 text-[13px] text-gray-500 rounded-xl font-medium">초기화</Button>
              <Button size="sm" onClick={() => {
                if (!newContent.trim()) { toast.error("내용을 입력해주세요"); return; }
                createNoticeMutation.mutate({ type: newType as any, content: newContent.trim(), title: newTitle.trim() || undefined });
              }} disabled={isCreatePending} className="h-10 px-7 text-[13px] font-bold bg-gradient-to-r from-gray-800 to-gray-700 text-white rounded-xl shadow-lg shadow-gray-400/20">
                {isCreatePending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />등록 중...</> : "등록하기"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* 게시글 리스트 */}
      {/* ═══════════════════════════════════════ */}
      <div className="px-4 py-4 space-y-3">
        {/* ═══ 오늘의 5분 HACCP (고정 교육 카드) ═══ */}
        {trainingData?.assigned && trainingData.topic && (
          <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all duration-200 ${
            trainingData.completed
              ? "border-gray-200 opacity-75"
              : "border-l-[5px] border-l-violet-500 border-violet-200 shadow-lg shadow-violet-100/50"
          }`}>
            <div className="p-4 sm:p-5">
              {/* 헤더 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold bg-violet-50 text-violet-700">
                    <span className="text-sm">📖</span>
                    교육
                  </span>
                  <span className="text-[11px] font-bold text-violet-500 bg-violet-50 px-2 py-1 rounded-lg">
                    Day {trainingData.dayNo}/{trainingData.totalDays > 0 ? Math.min(trainingData.totalDays, 120) : trainingData.dayNo}
                  </span>
                  {trainingData.topic.category && (
                    <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                      {trainingData.topic.category}
                    </span>
                  )}
                </div>
                {trainingData.completed && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-100">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    완료
                  </span>
                )}
              </div>

              {/* 제목 */}
              <h3 className="text-[16px] font-bold text-gray-900 mb-3 leading-snug flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-500 shrink-0" />
                오늘의 5분 HACCP — {trainingData.topic.title}
              </h3>

              {/* 질문 */}
              <div className="bg-violet-50/60 rounded-xl px-4 py-3 mb-3 border border-violet-100/60">
                <p className="text-[13px] font-bold text-violet-800 mb-1">❓ 질문</p>
                <p className="text-[14px] text-gray-700 leading-relaxed">{trainingData.topic.question}</p>
              </div>

              {/* 핵심 내용 */}
              <div className="bg-blue-50/50 rounded-xl px-4 py-3 mb-3 border border-blue-100/60">
                <p className="text-[13px] font-bold text-blue-800 mb-1">📘 핵심</p>
                <p className="text-[14px] text-gray-700 leading-relaxed">{trainingData.topic.content}</p>
              </div>

              {/* 오늘 행동 */}
              <div className="bg-amber-50/50 rounded-xl px-4 py-3 mb-4 border border-amber-100/60">
                <p className="text-[13px] font-bold text-amber-800 mb-1">👉 오늘 행동</p>
                <p className="text-[14px] text-gray-700 leading-relaxed font-medium">{trainingData.topic.action}</p>
              </div>

              {/* 완료 버튼 */}
              {!trainingData.completed ? (
                <Button
                  onClick={() => completeMutation.mutate({ dayNo: trainingData.dayNo! })}
                  disabled={completeMutation.isPending}
                  className="w-full h-12 rounded-xl text-[15px] font-bold bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-500/25 active:scale-[0.98] transition-all"
                >
                  {completeMutation.isPending ? (
                    <><Loader2 className="h-5 w-5 mr-2 animate-spin" />완료 처리 중...</>
                  ) : (
                    <><CheckCircle2 className="h-5 w-5 mr-2" />✔ 완료하기</>
                  )}
                </Button>
              ) : (
                <div className="text-center py-2">
                  <p className="text-[13px] text-emerald-600 font-bold">오늘 교육을 완료했습니다! 수고하셨어요 👏</p>
                </div>
              )}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-28">
            <div className="w-16 h-16 rounded-2xl bg-white shadow-lg flex items-center justify-center mb-4">
              <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
            </div>
            <p className="text-[15px] font-bold text-gray-400">불러오는 중...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-28">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-gray-50 to-gray-100 shadow-inner flex items-center justify-center mb-5 border border-gray-200/60">
              <Megaphone className="h-10 w-10 text-gray-300" />
            </div>
            <p className="text-lg font-bold text-gray-400">등록된 공지가 없습니다</p>
            <p className="text-sm text-gray-300 mt-2">새로운 공지가 등록되면 여기에 표시됩니다</p>
          </div>
        ) : (
          filteredItems.map((item: any) => {
            const isEditMode = editingId === item.id;
            return isEditMode ? (
              /* 수정 모드 인라인 폼 */
              <div key={item.id} className="bg-white border border-blue-200 rounded-2xl p-5 space-y-3 shadow-md">
                <div className="flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-gray-700" />
                  <span className="text-[15px] font-bold text-gray-800">수정하기</span>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <Label className="text-[12px] font-bold text-gray-600">분류</Label>
                    <Select value={editType} onValueChange={setEditType}>
                      <SelectTrigger className="bg-gray-50 border-gray-200 h-10 text-sm rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="notice">📢 공지</SelectItem>
                        <SelectItem value="work">📋 작업지시</SelectItem>
                        <SelectItem value="handover">📌 전달사항</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px] font-bold text-gray-600">제목</Label>
                    <Input value={editTitle} onChange={(e: any) => setEditTitle(e.target.value)} placeholder="제목" className="bg-gray-50 border-gray-200 h-10 text-sm rounded-xl" />
                  </div>
                </div>
                <Textarea value={editContent} onChange={(e: any) => setEditContent(e.target.value)} rows={3} className="bg-gray-50 border-gray-200 resize-none text-sm rounded-xl" />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-9 px-5 text-[13px] text-gray-500 rounded-xl">취소</Button>
                  <Button size="sm" onClick={submitEdit} className="h-9 px-6 text-[13px] font-bold bg-gray-800 text-white rounded-xl shadow-md">저장</Button>
                </div>
              </div>
            ) : (
              <BoardItem 
                key={item.id} 
                item={item} 
                onAck={handleAck}
                onEdit={isAdmin ? startEdit : undefined}
                onDelete={isAdmin ? (id) => { if (confirm("정말 삭제하시겠습니까?")) deleteNoticeMutation.mutate({ id }); } : undefined}
              />
            );
          })
        )}
      </div>

      {/* 하단 패딩 (하단 네비 공간) */}
      <div className="h-4" />

      {/* 모바일 하단 네비게이션 */}
      <MobileBottomNav activeTab="home" />
    </div>
  );
}
