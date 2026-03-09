import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
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
  MessageSquare, 
  Search, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Building2,
  Plus,
  Filter,
  Trash2,
  Pencil,
  X,
  Check,
  MessageCircle,
  Send,
  ChevronDown,
  ChevronUp,
  User,
  ArrowUpDown,
  Megaphone,
  ClipboardList,
  Pin,
  Loader2,
  RefreshCw,
} from "lucide-react";

export default function CommunicationLog() {
  return (
    <DashboardLayout>
      <CommunicationLogWithTabs />
    </DashboardLayout>
  );
}

// ═══════════════════════════════════════════
// 탭 래퍼: [거래처 메모] [사내 공지보드]
// ═══════════════════════════════════════════
function CommunicationLogWithTabs() {
  const [activeTab, setActiveTab] = useState<"partner" | "board">("partner");

  return (
    <div className="px-3 py-2 space-y-2.5">
      {/* 헤더 */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
          <MessageSquare className="h-4 w-4 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-stone-800 leading-tight">커뮤니케이션</h1>
          <p className="text-[11px] text-stone-400">거래처 메모 및 사내 공지 통합 관리</p>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex bg-stone-100 rounded-lg p-0.5">
        <button
          onClick={() => setActiveTab("partner")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "partner"
              ? "bg-white text-amber-700 shadow-sm"
              : "text-stone-500 hover:text-stone-700"
          }`}
        >
          <Building2 className="h-4 w-4" />
          거래처 메모
        </button>
        <button
          onClick={() => setActiveTab("board")}
          className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "board"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-stone-500 hover:text-stone-700"
          }`}
        >
          <Megaphone className="h-4 w-4" />
          사내 공지보드
        </button>
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === "partner" ? <PartnerMemoTab /> : <InternalBoardTab />}
    </div>
  );
}

// ═══════════════════════════════════════════
// 탭 1: 거래처 메모 (기존 기능 그대로)
// ═══════════════════════════════════════════
function PartnerMemoTab() {
  const { user, isAdmin } = useAuth();
  const [selectedPartner, setSelectedPartner] = useState("");
  const [content, setContent] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("createdAt");
  const [showForm, setShowForm] = useState(false);

  const currentUserId = user?.id || null;

  const { data: partners = [] } = trpc.partners.list.useQuery({});

  const { data: logs = [], refetch: refetchLogs } = trpc.communicationLogs.list.useQuery(
    {
      partnerId: selectedPartner ? Number(selectedPartner) : undefined,
      status: (statusFilter !== "all" ? statusFilter : undefined) as any,
    },
    { refetchOnWindowFocus: false }
  );

  const createLogMutation = trpc.communicationLogs.create.useMutation({
    onSuccess: () => {
      toast.success("메모가 추가되었습니다");
      setContent("");
      setSelectedPartner("");
      setShowForm(false);
      refetchLogs();
    },
    onError: (error: any) => {
      toast.error("메모 추가 실패: " + error.message);
    },
  });

  const updateLogMutation = trpc.communicationLogs.update.useMutation({
    onSuccess: () => {
      toast.success("메모가 수정되었습니다");
      refetchLogs();
    },
    onError: (error: any) => {
      toast.error("메모 수정 실패: " + error.message);
    },
  });

  const updateStatusMutation = trpc.communicationLogs.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("상태가 변경되었습니다");
      refetchLogs();
    },
    onError: (error: any) => {
      toast.error("상태 변경 실패: " + error.message);
    },
  });

  const deleteLogMutation = trpc.communicationLogs.delete.useMutation({
    onSuccess: () => {
      toast.success("메모가 삭제되었습니다");
      refetchLogs();
    },
    onError: (error: any) => {
      toast.error("삭제 실패: " + error.message);
    },
  });

  const isCreatePending = "isPending" in createLogMutation ? (createLogMutation as any).isPending : (createLogMutation as any).isLoading;
  const isStatusPending = "isPending" in updateStatusMutation ? (updateStatusMutation as any).isPending : (updateStatusMutation as any).isLoading;

  const handleAddMemo = () => {
    if (!selectedPartner) {
      toast.error("거래처를 선택해주세요");
      return;
    }
    if (!content.trim()) {
      toast.error("메모 내용을 입력해주세요");
      return;
    }
    createLogMutation.mutate({
      partnerId: Number(selectedPartner),
      content: content.trim(),
      status: "received",
    });
  };

  const filteredLogs = searchQuery
    ? (logs as any[]).filter((l: any) => {
        const q = searchQuery.toLowerCase();
        return (
          (l.content && l.content.toLowerCase().includes(q)) ||
          (l.authorName && l.authorName.toLowerCase().includes(q)) ||
          (l.partnerName && l.partnerName.toLowerCase().includes(q))
        );
      })
    : (logs as any[]);

  const sortedLogs = [...filteredLogs].sort((a: any, b: any) => {
    const fieldA = sortBy === "createdAt" ? a.createdAt : a.updatedAt;
    const fieldB = sortBy === "createdAt" ? b.createdAt : b.updatedAt;
    return new Date(fieldB).getTime() - new Date(fieldA).getTime();
  });

  const allLogs = logs as any[];
  const stats = {
    total: allLogs.length,
    received: allLogs.filter((l: any) => l.status === "received").length,
    in_progress: allLogs.filter((l: any) => l.status === "in_progress").length,
    completed: allLogs.filter((l: any) => l.status === "completed").length,
  };

  return (
    <div className="space-y-2.5">
      {/* 액션 버튼 */}
      <div className="flex items-center justify-between">
        <div className="grid grid-cols-4 gap-2 flex-1">
          <div className="flex items-center gap-2 bg-white border border-stone-200/80 rounded-lg px-3 py-2 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center">
              <MessageSquare className="h-3.5 w-3.5 text-stone-500" />
            </div>
            <div>
              <p className="text-[10px] text-stone-400 font-medium">전체</p>
              <p className="text-base font-bold text-stone-800 leading-tight">{stats.total}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white border border-rose-100 rounded-lg px-3 py-2 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-rose-50 flex items-center justify-center">
              <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
            </div>
            <div>
              <p className="text-[10px] text-rose-400 font-medium">접수</p>
              <p className="text-base font-bold text-rose-600 leading-tight">{stats.received}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white border border-amber-100 rounded-lg px-3 py-2 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-amber-50 flex items-center justify-center">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] text-amber-400 font-medium">진행중</p>
              <p className="text-base font-bold text-amber-600 leading-tight">{stats.in_progress}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white border border-emerald-100 rounded-lg px-3 py-2 shadow-sm">
            <div className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            </div>
            <div>
              <p className="text-[10px] text-emerald-400 font-medium">완료</p>
              <p className="text-base font-bold text-emerald-600 leading-tight">{stats.completed}</p>
            </div>
          </div>
        </div>
        <Button 
          onClick={() => setShowForm(!showForm)}
          size="sm"
          className={`h-8 px-3 text-xs rounded-lg shadow-sm transition-all ml-2 ${
            showForm 
              ? "bg-stone-200 text-stone-600 hover:bg-stone-300" 
              : "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
          }`}
        >
          {showForm ? <X className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
          {showForm ? "닫기" : "새 메모"}
        </Button>
      </div>

      {/* 새 메모 작성 폼 */}
      {showForm && (
        <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/50 border border-amber-200/60 rounded-lg p-3 space-y-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-1 h-4 bg-amber-400 rounded-full" />
            <span className="text-xs font-semibold text-stone-700">새 거래처 메모 작성</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label htmlFor="partner" className="text-[11px] font-medium text-stone-500">거래처 *</Label>
              <Select value={selectedPartner} onValueChange={setSelectedPartner}>
                <SelectTrigger id="partner" className="bg-white/80 border-amber-200/60 focus:border-amber-400 h-8 text-xs">
                  <SelectValue placeholder="거래처 선택" />
                </SelectTrigger>
                <SelectContent>
                  {(partners as any[]).map((partner: any) => (
                    <SelectItem key={partner.id} value={String(partner.id)}>
                      {partner.companyName || partner.name || "이름 없음"}
                      {partner.bizNo ? ` (${partner.bizNo})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label htmlFor="content" className="text-[11px] font-medium text-stone-500">메모 내용 *</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e: any) => setContent(e.target.value)}
                placeholder="메모 내용을 입력하세요..."
                rows={2}
                className="bg-white/80 border-amber-200/60 focus:border-amber-400 resize-none text-sm"
              />
            </div>
          </div>
          <div className="flex gap-1.5 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setSelectedPartner(""); setContent(""); }} className="h-7 px-3 text-xs text-stone-500 hover:bg-stone-100">초기화</Button>
            <Button size="sm" onClick={handleAddMemo} disabled={isCreatePending} className="h-7 px-4 text-xs bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-md shadow-sm">
              <Plus className="h-3 w-3 mr-1" />
              {isCreatePending ? "추가 중..." : "메모 추가"}
            </Button>
          </div>
        </div>
      )}

      {/* 검색 + 필터 바 */}
      <div className="flex items-center gap-2 bg-white border border-stone-200/80 rounded-lg px-3 py-2 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
          <Input placeholder="메모 내용, 작성자, 거래처명 검색..." value={searchQuery} onChange={(e: any) => setSearchQuery(e.target.value)} className="pl-7 bg-stone-50/50 border-stone-200/60 focus:bg-white h-7 text-xs rounded-md" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[120px] bg-stone-50/50 border-stone-200/60 h-7 text-xs shrink-0">
            <Filter className="h-3 w-3 mr-1 text-stone-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="received">접수</SelectItem>
            <SelectItem value="in_progress">진행중</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[120px] bg-stone-50/50 border-stone-200/60 h-7 text-xs shrink-0">
            <ArrowUpDown className="h-3 w-3 mr-1 text-stone-400" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="createdAt">생성일순</SelectItem>
            <SelectItem value="updatedAt">수정일순</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="secondary" className="text-[10px] font-medium bg-stone-100 text-stone-500 shrink-0 px-2 py-0.5">{sortedLogs.length}건</Badge>
      </div>

      {/* 메모 목록 */}
      {sortedLogs.length === 0 ? (
        <div className="text-center py-12 bg-white border border-stone-200/80 rounded-lg shadow-sm">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-3">
            <MessageSquare className="h-7 w-7 text-amber-300" />
          </div>
          <p className="text-sm font-medium text-stone-500">등록된 메모가 없습니다</p>
          <p className="text-xs text-stone-400 mt-1">상단의 "새 메모" 버튼을 눌러 작성해보세요</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedLogs.map((log: any) => (
            <MemoItem
              key={log.id}
              log={log}
              onStatusChange={(id, s) => updateStatusMutation.mutate({ id, status: s as any })}
              onDelete={(id) => { if (confirm("정말 삭제하시겠습니까?")) deleteLogMutation.mutate({ id }); }}
              onUpdate={(id, c) => updateLogMutation.mutate({ id, content: c })}
              isStatusLoading={isStatusPending}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 탭 2: 사내 공지보드 (직원보드 스타일 리빌드)
// ═══════════════════════════════════════════

// 타입별 설정
const typeConfig: Record<string, { label: string; emoji: string; bgColor: string; textColor: string; borderColor: string; iconBg: string }> = {
  notice: { label: "공지", emoji: "📢", bgColor: "bg-blue-50", textColor: "text-blue-700", borderColor: "border-l-blue-500", iconBg: "bg-blue-50" },
  work: { label: "작업", emoji: "📋", bgColor: "bg-amber-50", textColor: "text-amber-700", borderColor: "border-l-amber-500", iconBg: "bg-amber-50" },
  handover: { label: "전달사항", emoji: "📌", bgColor: "bg-emerald-50", textColor: "text-emerald-700", borderColor: "border-l-emerald-500", iconBg: "bg-emerald-50" },
};

// 시간대별 인사
function getBoardGreeting(name?: string): string {
  const h = new Date().getHours();
  const day = new Date().getDay();
  let msg = "";
  if (h >= 5 && h < 12) msg = "좋은 아침이에요! ☀️";
  else if (h >= 12 && h < 14) msg = "점심은 드셨나요? 🍱";
  else if (h >= 14 && h < 18) msg = "오후도 힘내세요! 🌤️";
  else if (h >= 18 && h < 22) msg = "오늘도 수고하셨어요! 🌙";
  else msg = "늦은 시간까지 수고하세요! 🌃";
  if (day === 5) msg = "불금이에요! 🎉";
  if (day === 1) msg = "새로운 한 주의 시작! 💼";
  return name ? `${name}님, ${msg}` : msg;
}

function InternalBoardTab() {
  const { user, isAdmin, isWorker } = useAuth();
  const [selectedType, setSelectedType] = useState<string>("all");
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [noticeType, setNoticeType] = useState<string>("notice");
  const [noticeTitle, setNoticeTitle] = useState("");
  const [noticeContent, setNoticeContent] = useState("");
  // 수정 상태
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editType, setEditType] = useState<string>("notice");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  // 완료 목록 페이지네이션 & 드롭다운
  const [completedPage, setCompletedPage] = useState(1);
  const [expandedCompletedId, setExpandedCompletedId] = useState<number | null>(null);
  const COMPLETED_PER_PAGE = 15;

  const { data: items = [], refetch, isLoading } = trpc.board.getBoardItems.useQuery(
    { type: selectedType as any },
    { refetchInterval: 30000 }
  );

  const { data: boardStats, refetch: refetchStats } = trpc.board.getBoardStats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const ackMutation = trpc.board.ackLog.useMutation({
    onSuccess: (result: any) => {
      toast[result.alreadyAcked ? "info" : "success"](result.alreadyAcked ? "이미 확인한 항목입니다" : "확인 완료!");
      refetch();
    },
    onError: (error: any) => toast.error("확인 처리 실패: " + error.message),
  });

  const createNoticeMutation = trpc.board.createNotice.useMutation({
    onSuccess: () => {
      toast.success("등록 완료! 직원들에게 알림이 전송됩니다.");
      setNoticeContent(""); setNoticeTitle(""); setNoticeType("notice"); setShowNoticeForm(false);
      refetch(); refetchStats();
    },
    onError: (error: any) => toast.error("등록 실패: " + error.message),
  });

  const updateNoticeMutation = trpc.board.updateNotice.useMutation({
    onSuccess: () => {
      toast.success("수정 완료!");
      setEditingId(null); refetch(); refetchStats();
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

  const updateStatusMutation = trpc.board.updateBoardStatus.useMutation({
    onSuccess: () => {
      toast.success("완료 처리되었습니다");
      refetch(); refetchStats();
    },
    onError: (error: any) => toast.error("상태 변경 실패: " + error.message),
  });

  const isCreatePending = "isPending" in createNoticeMutation ? (createNoticeMutation as any).isPending : (createNoticeMutation as any).isLoading;

  const allItems = items as any[];
  // 접수/진행중 (상단 카드), 완료 (하단 리스트)
  const activeItems = allItems.filter((item: any) => item.status !== "completed");
  const completedItems = allItems.filter((item: any) => item.status === "completed");
  // 완료 목록 페이지네이션
  const completedTotalPages = Math.max(1, Math.ceil(completedItems.length / COMPLETED_PER_PAGE));
  const completedPageItems = completedItems.slice((completedPage - 1) * COMPLETED_PER_PAGE, completedPage * COMPLETED_PER_PAGE);

  const stats = boardStats || { total: 0, notice: 0, work: 0, handover: 0, received: 0, inProgress: 0, completed: 0 };

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

  const handleComplete = (id: number) => {
    updateStatusMutation.mutate({ id, status: "completed" });
  };

  return (
    <div className="space-y-3">
      {/* 인사말 배너 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl px-4 py-3">
        <p className="text-sm font-semibold text-blue-800">{getBoardGreeting(user?.name)}</p>
        <p className="text-[11px] text-blue-500 mt-0.5">오늘의 공지사항과 작업지시를 확인해주세요</p>
      </div>

      {/* 사내 공지보드 전용 통계 카드 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { emoji: "📢", label: "공지", count: stats.notice, border: "border-blue-100", labelColor: "text-blue-400", countColor: "text-blue-700" },
          { emoji: "📋", label: "작업", count: stats.work, border: "border-amber-100", labelColor: "text-amber-400", countColor: "text-amber-700" },
          { emoji: "📌", label: "전달", count: stats.handover, border: "border-emerald-100", labelColor: "text-emerald-400", countColor: "text-emerald-700" },
        ].map((card) => (
          <div key={card.label} className={`bg-white border ${card.border} rounded-lg overflow-hidden shadow-sm`}>
            <div className="flex flex-col items-center justify-center px-2 py-2.5 text-center">
              <span className="text-base leading-none">{card.emoji}</span>
              <p className={`text-[10px] ${card.labelColor} font-medium leading-none mt-1`}>{card.label}</p>
              <p className={`text-lg font-bold ${card.countColor} leading-none mt-0.5`}>{card.count}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 필터 탭 + 등록 버튼 */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          {[
            { key: "all", label: "전체", count: stats.total },
            { key: "notice", label: "공지", count: stats.notice },
            { key: "work", label: "작업", count: stats.work },
            { key: "handover", label: "전달", count: stats.handover },
          ].map((tab) => (
            <button key={tab.key} onClick={() => setSelectedType(tab.key)}
              className={`flex items-center gap-0.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all shrink-0 ${
                selectedType === tab.key ? "bg-blue-500 text-white shadow-sm" : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}>
              {tab.label}
              {tab.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  selectedType === tab.key ? "bg-white/25 text-white" : "bg-stone-200 text-stone-600"}`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isAdmin && (
            <Button onClick={() => setShowNoticeForm(!showNoticeForm)} size="sm"
              className={`h-8 px-3 text-xs rounded-lg shadow-sm ${showNoticeForm ? "bg-stone-200 text-stone-600" : "bg-gradient-to-r from-blue-500 to-indigo-500 text-white"}`}>
              {showNoticeForm ? <X className="h-3.5 w-3.5 mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
              {showNoticeForm ? "닫기" : "+ 새 글"}
            </Button>
          )}
        </div>
      </div>

      {/* 등록 폼 (관리자용) - 분류 드롭다운(공지/작업/전달) */}
      {showNoticeForm && isAdmin && (
        <div className="bg-gradient-to-br from-blue-50/80 to-indigo-50/50 border border-blue-200/60 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
            <span className="text-sm font-bold text-stone-800">새 글 작성</span>
            <span className="text-[10px] text-stone-400 ml-auto">전 직원에게 알림 전송</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-stone-500">분류 *</Label>
              <Select value={noticeType} onValueChange={setNoticeType}>
                <SelectTrigger className="bg-white border-blue-200/60 h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="notice">📢 공지</SelectItem>
                  <SelectItem value="work">📋 작업지시</SelectItem>
                  <SelectItem value="handover">📌 전달사항</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label className="text-[11px] font-medium text-stone-500">제목 (선택)</Label>
              <Input value={noticeTitle} onChange={(e: any) => setNoticeTitle(e.target.value)} placeholder="제목을 입력하세요" className="bg-white border-blue-200/60 h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-stone-500">내용 *</Label>
            <Textarea value={noticeContent} onChange={(e: any) => setNoticeContent(e.target.value)} placeholder="공지/작업/전달 내용을 입력하세요..." rows={3} className="bg-white border-blue-200/60 resize-none text-sm" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setNoticeContent(""); setNoticeTitle(""); setNoticeType("notice"); }} className="h-8 px-3 text-xs text-stone-500">초기화</Button>
            <Button size="sm" onClick={() => {
              if (!noticeContent.trim()) { toast.error("내용을 입력해주세요"); return; }
              createNoticeMutation.mutate({ type: noticeType as any, content: noticeContent.trim(), title: noticeTitle.trim() || undefined });
            }} disabled={isCreatePending} className="h-8 px-5 text-xs bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-lg shadow-sm">
              {isCreatePending ? "등록 중..." : "등록"}
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* 접수/진행중 글 - 상단 카드 형태 */}
      {/* ══════════════════════════════════════ */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-blue-400 mb-3" />
          <p className="text-sm text-gray-400">로딩 중...</p>
        </div>
      ) : activeItems.length === 0 && completedItems.length === 0 ? (
        <div className="text-center py-16 bg-white border border-stone-200/80 rounded-xl shadow-sm">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
            <Megaphone className="h-7 w-7 text-blue-300" />
          </div>
          <p className="text-sm font-medium text-stone-500">등록된 글이 없습니다</p>
          {isAdmin && <p className="text-xs text-stone-400 mt-1">"+ 새 글" 버튼을 눌러 작성해보세요</p>}
        </div>
      ) : (
        <>
          {/* 접수/진행중 카드 목록 */}
          {activeItems.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                <span className="text-xs font-bold text-stone-700">접수/진행중</span>
                <Badge variant="secondary" className="text-[10px] bg-rose-50 text-rose-600 px-1.5 py-0">{activeItems.length}건</Badge>
              </div>
              {activeItems.map((item: any) => {
                const isEditMode = editingId === item.id;
                return isEditMode ? (
                  /* 수정 모드 인라인 폼 */
                  <div key={item.id} className="bg-blue-50/50 border border-blue-200 rounded-xl p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Pencil className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-bold text-stone-800">수정하기</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-stone-500">분류</Label>
                        <Select value={editType} onValueChange={setEditType}>
                          <SelectTrigger className="bg-white border-blue-200/60 h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="notice">📢 공지</SelectItem>
                            <SelectItem value="work">📋 작업지시</SelectItem>
                            <SelectItem value="handover">📌 전달사항</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-[11px] font-medium text-stone-500">제목</Label>
                        <Input value={editTitle} onChange={(e: any) => setEditTitle(e.target.value)} placeholder="제목" className="bg-white border-blue-200/60 h-8 text-xs" />
                      </div>
                    </div>
                    <Textarea value={editContent} onChange={(e: any) => setEditContent(e.target.value)} rows={3} className="bg-white border-blue-200/60 resize-none text-sm" />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-7 px-3 text-xs text-stone-500">취소</Button>
                      <Button size="sm" onClick={submitEdit} className="h-7 px-4 text-xs bg-blue-500 text-white rounded-lg">저장</Button>
                    </div>
                  </div>
                ) : (
                  <BoardItemCard key={item.id} item={item}
                    onAck={(id) => ackMutation.mutate({ logId: id })}
                    onEdit={isAdmin ? startEdit : undefined}
                    onDelete={isAdmin ? (id) => { if (confirm("정말 삭제하시겠습니까?")) deleteNoticeMutation.mutate({ id }); } : undefined}
                    onComplete={isAdmin ? handleComplete : undefined}
                    canComment={isWorker}
                    currentUserId={user?.id || null}
                  />
                );
              })}
            </div>
          )}

          {/* ══════════════════════════════════════ */}
          {/* 완료 처리된 글 - 하단 리스트 (제목만, 15줄 페이지네이션, 클릭시 드롭다운) */}
          {/* ══════════════════════════════════════ */}
          {completedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 pt-2 border-t border-stone-200">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span className="text-xs font-bold text-stone-700">완료 처리됨</span>
                <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-600 px-1.5 py-0">{completedItems.length}건</Badge>
              </div>

              <div className="bg-white border border-stone-200/80 rounded-xl overflow-hidden shadow-sm">
                {/* 리스트 헤더 */}
                <div className="flex items-center gap-3 px-4 py-2 bg-stone-50 border-b border-stone-100 text-[11px] font-semibold text-stone-500">
                  <span className="w-12 text-center">분류</span>
                  <span className="flex-1">제목 / 내용</span>
                  <span className="w-24 text-center hidden sm:block">작성자</span>
                  <span className="w-28 text-center hidden sm:block">작성일</span>
                  {isAdmin && <span className="w-14 text-center">관리</span>}
                </div>

                {/* 리스트 아이템 */}
                {completedPageItems.map((item: any) => {
                  const config = typeConfig[item.logType] || typeConfig.notice;
                  const isExpanded = expandedCompletedId === item.id;
                  return (
                    <div key={item.id} className="border-b border-stone-100 last:border-b-0">
                      {/* 리스트 행 - 클릭시 드롭다운 */}
                      <div
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors hover:bg-stone-50/80 ${isExpanded ? "bg-emerald-50/30" : ""}`}
                        onClick={() => setExpandedCompletedId(isExpanded ? null : item.id)}
                      >
                        <span className={`w-12 text-center text-[10px] font-bold px-1.5 py-0.5 rounded ${config.bgColor} ${config.textColor}`}>
                          {config.emoji}{config.label}
                        </span>
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <span className="text-sm text-stone-700 truncate font-medium">
                            {item.title || (item.content?.substring(0, 40) + (item.content?.length > 40 ? "..." : ""))}
                          </span>
                          <BoardCommentCountBadge logId={item.id} />
                        </div>
                        <span className="w-24 text-center text-[11px] text-stone-500 hidden sm:block truncate">{item.authorName || "관리자"}</span>
                        <span className="w-28 text-center text-[10px] text-stone-400 hidden sm:block">
                          {new Date(item.createdAt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}
                        </span>
                        {isAdmin && (
                          <div className="w-14 flex justify-center" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-stone-300 hover:text-rose-500"
                              onClick={() => { if (confirm("정말 삭제하시겠습니까?")) deleteNoticeMutation.mutate({ id: item.id }); }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                      </div>

                      {/* 드롭다운 내용 */}
                      {isExpanded && (
                        <div className="px-4 pb-3 pt-1 bg-stone-50/50 border-t border-stone-100">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded">
                              <CheckCircle2 className="h-2.5 w-2.5" />완료
                            </span>
                            <span className="text-[11px] text-stone-500 flex items-center gap-0.5">
                              <User className="h-2.5 w-2.5" />{item.authorName || "관리자"}
                            </span>
                            <span className="text-[10px] text-stone-400">
                              {new Date(item.createdAt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {item.title && <h4 className="text-sm font-bold text-stone-800 mb-1">{item.title}</h4>}
                          <p className="text-sm text-stone-600 leading-relaxed whitespace-pre-wrap mb-2">{item.content}</p>

                          {/* 확인 카운트 */}
                          <div className="flex items-center gap-3 pt-2 border-t border-stone-200/60">
                            <span className="text-xs text-stone-400 font-medium">확인 {Number(item.ackCount) || 0}/{Number(item.totalUsers) || 0}</span>
                          </div>

                          {/* 댓글 섹션 */}
                          <BoardCommentSection logId={item.id} currentUserId={user?.id || null} canWrite={isWorker || false} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 페이지네이션 */}
              {completedTotalPages > 1 && (
                <div className="flex items-center justify-center gap-1 pt-1">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-stone-700"
                    disabled={completedPage <= 1}
                    onClick={() => setCompletedPage(p => Math.max(1, p - 1))}>
                    <ChevronUp className="h-4 w-4 -rotate-90" />
                  </Button>
                  {Array.from({ length: completedTotalPages }, (_, i) => i + 1).map((page) => (
                    <button key={page}
                      onClick={() => setCompletedPage(page)}
                      className={`h-7 min-w-[28px] px-1.5 rounded text-xs font-medium transition-all ${
                        completedPage === page
                          ? "bg-emerald-500 text-white shadow-sm"
                          : "text-stone-500 hover:bg-stone-100"
                      }`}>
                      {page}
                    </button>
                  ))}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-stone-400 hover:text-stone-700"
                    disabled={completedPage >= completedTotalPages}
                    onClick={() => setCompletedPage(p => Math.min(completedTotalPages, p + 1))}>
                    <ChevronUp className="h-4 w-4 rotate-90" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 공지보드 댓글 컴포넌트 (작업자/관리자 전용)
// ═══════════════════════════════════════════
function BoardCommentSection({ logId, currentUserId, canWrite }: { logId: number; currentUserId: number | null; canWrite: boolean }) {
  const [newComment, setNewComment] = useState("");

  const { data: comments = [], refetch: refetchComments } = trpc.board.getBoardComments.useQuery(
    { logId },
    { refetchOnWindowFocus: false }
  );

  const createCommentMutation = trpc.board.createBoardComment.useMutation({
    onSuccess: () => { toast.success("댓글이 추가되었습니다"); setNewComment(""); refetchComments(); },
    onError: (error: any) => { toast.error("댓글 추가 실패: " + error.message); },
  });

  const deleteCommentMutation = trpc.board.deleteBoardComment.useMutation({
    onSuccess: () => { toast.success("댓글이 삭제되었습니다"); refetchComments(); },
    onError: (error: any) => { toast.error("댓글 삭제 실패: " + error.message); },
  });

  const isPending = "isPending" in createCommentMutation ? (createCommentMutation as any).isPending : (createCommentMutation as any).isLoading;

  return (
    <div className="mt-2.5 pt-2.5 border-t border-blue-100">
      {(comments as any[]).length > 0 && (
        <div className="space-y-1.5 mb-2">
          {(comments as any[]).map((comment: any) => (
            <div key={comment.id} className="flex items-start gap-2 bg-blue-50/50 rounded-lg p-2 group">
              <div className="w-5 h-5 rounded-full bg-blue-200/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="h-2.5 w-2.5 text-blue-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-gray-700">{comment.authorName || "사용자"}</span>
                  <span className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="text-xs mt-0.5 text-gray-600 whitespace-pre-wrap break-words leading-relaxed">{comment.content}</p>
              </div>
              {currentUserId && Number(comment.authorId) === currentUserId && (
                <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={() => { if (confirm("댓글을 삭제하시겠습니까?")) deleteCommentMutation.mutate({ commentId: comment.id }); }}>
                  <X className="h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {canWrite ? (
        <div className="flex gap-1.5">
          <Input placeholder="댓글을 입력하세요..." value={newComment} onChange={(e: any) => setNewComment(e.target.value)}
            onKeyDown={(e: any) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (newComment.trim()) createCommentMutation.mutate({ logId, content: newComment.trim() }); }}}
            className="text-xs h-7 bg-blue-50/30 border-blue-200/60 focus:bg-white focus:border-blue-400 rounded-full px-3" />
          <Button size="sm" className="h-7 w-7 p-0 rounded-full bg-blue-500 hover:bg-blue-600 flex-shrink-0"
            onClick={() => { if (newComment.trim()) createCommentMutation.mutate({ logId, content: newComment.trim() }); }}
            disabled={!newComment.trim() || isPending}>
            <Send className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <p className="text-[11px] text-stone-400 text-center py-1">작업자 등급 이상부터 댓글을 작성할 수 있습니다</p>
      )}
    </div>
  );
}

// 공지보드 댓글 수 뱃지
function BoardCommentCountBadge({ logId }: { logId: number }) {
  const { data } = trpc.board.getBoardCommentCount.useQuery({ logId }, { refetchOnWindowFocus: false });
  const count = (data as any)?.count || 0;
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// ═══════════════════════════════════════════
// 공지보드 아이템 카드 (확인 + 수정/삭제 + 댓글)
// ═══════════════════════════════════════════
function BoardItemCard({ item, onAck, onEdit, onDelete, onComplete, canComment, currentUserId }: {
  item: any;
  onAck: (id: number) => void;
  onEdit?: (item: any) => void;
  onDelete?: (id: number) => void;
  onComplete?: (id: number) => void;
  canComment?: boolean;
  currentUserId?: number | null;
}) {
  const [showComments, setShowComments] = useState(false);
  const config = typeConfig[item.logType] || typeConfig.notice;
  const isAcked = Number(item.myAck) > 0;
  const ackCount = Number(item.ackCount) || 0;
  const totalUsers = Number(item.totalUsers) || 0;

  return (
    <div className={`bg-white border border-stone-200/80 rounded-xl p-4 transition-all hover:shadow-md border-l-4 ${config.borderColor}`}>
      {/* 상단: 타입 + 시간 + 완료/수정/삭제 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${config.bgColor} ${config.textColor}`}>
            <span>{config.emoji}</span>{config.label}
          </span>
          {item.status === "received" && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded"><AlertCircle className="h-2.5 w-2.5" />접수</span>}
          {item.status === "completed" && <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded"><CheckCircle2 className="h-2.5 w-2.5" />완료</span>}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-stone-400 mr-1">
            {new Date(item.createdAt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
          </span>
          {onComplete && item.status === "received" && (
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px] text-emerald-600 hover:bg-emerald-50 rounded-md font-medium"
              onClick={() => onComplete(item.id)}>
              <CheckCircle2 className="h-3 w-3 mr-0.5" />완료처리
            </Button>
          )}
          {onEdit && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-stone-300 hover:text-blue-500" onClick={() => onEdit(item)}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-stone-300 hover:text-rose-500" onClick={() => onDelete(item.id)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* 제목 */}
      {item.title && <h3 className="text-sm font-bold text-stone-900 mb-1">{item.title}</h3>}

      {/* 내용 */}
      <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap mb-2.5">{item.content}</p>

      {/* 작성자 */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <div className="w-5 h-5 rounded-full bg-stone-100 flex items-center justify-center">
          <User className="h-3 w-3 text-stone-500" />
        </div>
        <span className="text-xs text-stone-500">{item.authorName || "관리자"}</span>
      </div>

      {/* 확인 버튼 + 댓글 토글 + 카운트 */}
      <div className="flex items-center justify-between pt-2.5 border-t border-stone-100">
        <div className="flex items-center gap-3">
          <span className="text-xs text-stone-400 font-medium">확인 {ackCount}/{totalUsers}</span>
          <button className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-blue-600 transition-colors py-0.5 px-1 rounded"
            onClick={() => setShowComments(!showComments)}>
            <MessageCircle className="h-3.5 w-3.5" /><span>댓글</span>
            <BoardCommentCountBadge logId={item.id} />
            {showComments ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
          </button>
        </div>
        <Button size="sm" disabled={isAcked} onClick={() => onAck(item.id)}
          className={`h-8 px-5 rounded-full text-xs font-semibold transition-all ${
            isAcked
              ? "bg-stone-100 text-stone-400 cursor-not-allowed border border-stone-200"
              : "bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700 shadow-sm active:scale-95"
          }`}>
          {isAcked ? <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />확인완료</> : <><Check className="h-3.5 w-3.5 mr-1" />확인</>}
        </Button>
      </div>

      {/* 댓글 섹션 */}
      {showComments && (
        <BoardCommentSection logId={item.id} currentUserId={currentUserId || null} canWrite={canComment || false} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// 기존 서브 컴포넌트들 (댓글, 메모 아이템)
// ═══════════════════════════════════════════

// 댓글 컴포넌트
function CommentSection({ logId, currentUserId }: { logId: number; currentUserId: number | null }) {
  const [newComment, setNewComment] = useState("");

  const { data: comments = [], refetch: refetchComments } = trpc.communicationLogs.getComments.useQuery(
    { logId },
    { refetchOnWindowFocus: false }
  );

  const createCommentMutation = trpc.communicationLogs.createComment.useMutation({
    onSuccess: () => { toast.success("댓글이 추가되었습니다"); setNewComment(""); refetchComments(); },
    onError: (error: any) => { toast.error("댓글 추가 실패: " + error.message); },
  });

  const deleteCommentMutation = trpc.communicationLogs.deleteComment.useMutation({
    onSuccess: () => { toast.success("댓글이 삭제되었습니다"); refetchComments(); },
    onError: (error: any) => { toast.error("댓글 삭제 실패: " + error.message); },
  });

  const isPending = "isPending" in createCommentMutation ? (createCommentMutation as any).isPending : (createCommentMutation as any).isLoading;

  return (
    <div className="mt-2 pt-2 border-t border-amber-100">
      {(comments as any[]).length > 0 && (
        <div className="space-y-1.5 mb-2">
          {(comments as any[]).map((comment: any) => (
            <div key={comment.id} className="flex items-start gap-2 bg-amber-50/50 rounded-lg p-2 group">
              <div className="w-5 h-5 rounded-full bg-amber-200/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="h-2.5 w-2.5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-gray-700">{comment.authorName || "사용자"}</span>
                  <span className="text-[10px] text-gray-400">{new Date(comment.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="text-xs mt-0.5 text-gray-600 whitespace-pre-wrap break-words leading-relaxed">{comment.content}</p>
              </div>
              {currentUserId && comment.authorId === currentUserId && (
                <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  onClick={() => { if (confirm("댓글을 삭제하시겠습니까?")) deleteCommentMutation.mutate({ commentId: comment.id }); }}>
                  <X className="h-2.5 w-2.5" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <Input placeholder="댓글을 입력하세요..." value={newComment} onChange={(e: any) => setNewComment(e.target.value)}
          onKeyDown={(e: any) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (newComment.trim()) createCommentMutation.mutate({ logId, content: newComment.trim() }); }}}
          className="text-xs h-7 bg-amber-50/30 border-amber-200/60 focus:bg-white focus:border-amber-400 rounded-full px-3" />
        <Button size="sm" className="h-7 w-7 p-0 rounded-full bg-amber-500 hover:bg-amber-600 flex-shrink-0"
          onClick={() => { if (newComment.trim()) createCommentMutation.mutate({ logId, content: newComment.trim() }); }}
          disabled={!newComment.trim() || isPending}>
          <Send className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// 댓글 개수 뱃지
function CommentCountBadge({ logId }: { logId: number }) {
  const { data: comments = [] } = trpc.communicationLogs.getComments.useQuery({ logId }, { refetchOnWindowFocus: false });
  const count = (comments as any[]).length;
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// 메모 아이템 컴포넌트
function MemoItem({ log, onStatusChange, onDelete, onUpdate, isStatusLoading, currentUserId }: {
  log: any;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  onUpdate: (id: number, content: string) => void;
  isStatusLoading: boolean;
  currentUserId: number | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(log.content);
  const [showComments, setShowComments] = useState(false);

  const isAuthor = currentUserId && log.authorId === currentUserId;

  const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: any }> = {
    received: { label: "접수", color: "text-rose-600", bgColor: "bg-rose-50", borderColor: "border-l-rose-400", icon: AlertCircle },
    in_progress: { label: "진행중", color: "text-amber-600", bgColor: "bg-amber-50", borderColor: "border-l-amber-400", icon: Clock },
    completed: { label: "완료", color: "text-emerald-600", bgColor: "bg-emerald-50", borderColor: "border-l-emerald-400", icon: CheckCircle2 },
  };

  const status = statusConfig[log.status] || statusConfig.received;
  const StatusIcon = status.icon;

  return (
    <div className={`border border-stone-200/80 rounded-lg p-3 transition-all duration-200 hover:shadow-sm border-l-[3px] ${status.borderColor} ${log.status === "completed" ? "bg-stone-50/50" : "bg-white"}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-800 bg-stone-100 px-2 py-0.5 rounded-md">
            <Building2 className="h-3 w-3 text-stone-500" />
            {log.partnerName || "알 수 없음"}
          </span>
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${status.bgColor} ${status.color}`}>
            <StatusIcon className="h-2.5 w-2.5" />
            {status.label}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {log.status === "received" && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-amber-600 hover:bg-amber-50 rounded-md"
              onClick={() => onStatusChange(log.id, "in_progress")} disabled={isStatusLoading}>
              <Clock className="h-3 w-3 mr-0.5" />진행
            </Button>
          )}
          {log.status === "in_progress" && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px] text-emerald-600 hover:bg-emerald-50 rounded-md"
              onClick={() => onStatusChange(log.id, "completed")} disabled={isStatusLoading}>
              <CheckCircle2 className="h-3 w-3 mr-0.5" />완료
            </Button>
          )}
          {isAuthor && !isEditing && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-stone-400 hover:text-amber-600 hover:bg-amber-50"
              onClick={() => setIsEditing(true)}><Pencil className="h-3 w-3" /></Button>
          )}
          {isEditing && (
            <>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-emerald-500 hover:text-emerald-600"
                onClick={() => { if (editContent.trim()) { onUpdate(log.id, editContent.trim()); setIsEditing(false); } }}><Check className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-stone-400"
                onClick={() => { setEditContent(log.content); setIsEditing(false); }}><X className="h-3 w-3" /></Button>
            </>
          )}
          {isAuthor && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-stone-300 hover:text-rose-500"
              onClick={() => onDelete(log.id)}><Trash2 className="h-3 w-3" /></Button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] text-stone-500 flex items-center gap-0.5"><User className="h-2.5 w-2.5" />{log.authorName || "알 수 없음"}</span>
        <span className="text-[10px] text-stone-400">{new Date(log.createdAt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      {isEditing ? (
        <Textarea value={editContent} onChange={(e: any) => setEditContent(e.target.value)} rows={3} className="text-sm border-amber-300 focus:border-amber-500 bg-amber-50/30" autoFocus />
      ) : (
        <p className={`text-sm leading-relaxed whitespace-pre-wrap ${log.status === "completed" ? "text-stone-400 line-through decoration-stone-300" : "text-stone-700"}`}>{log.content}</p>
      )}
      <div className="mt-2 flex items-center">
        <button className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-amber-600 transition-colors py-0.5 px-1 -ml-1 rounded"
          onClick={() => setShowComments(!showComments)}>
          <MessageCircle className="h-3.5 w-3.5" /><span>댓글</span>
          <CommentCountBadge logId={log.id} />
          {showComments ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
        </button>
      </div>
      {showComments && <CommentSection logId={log.id} currentUserId={currentUserId} />}
    </div>
  );
}
