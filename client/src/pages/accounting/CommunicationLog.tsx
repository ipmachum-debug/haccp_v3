import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";

// 커뮤니케이션 도메인 타입 (trpc proxy 가 깊은 타입을 완전히 전파하지 못해 명시 추출)
type PartnerRow = RouterOutput["partners"]["list"][number];
type CommLog = RouterOutput["communicationLogs"]["list"][number];
type LogComment = RouterOutput["communicationLogs"]["getComments"][number];
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
  Loader2,
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
      status: (statusFilter !== "all" ? statusFilter : undefined) as "received" | "in_progress" | "completed" | undefined,
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
    onError: (error: { message: string }) => {
      toast.error("메모 추가 실패: " + error.message);
    },
  });

  const updateLogMutation = trpc.communicationLogs.update.useMutation({
    onSuccess: () => {
      toast.success("메모가 수정되었습니다");
      refetchLogs();
    },
    onError: (error: { message: string }) => {
      toast.error("메모 수정 실패: " + error.message);
    },
  });

  const updateStatusMutation = trpc.communicationLogs.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("상태가 변경되었습니다");
      refetchLogs();
    },
    onError: (error: { message: string }) => {
      toast.error("상태 변경 실패: " + error.message);
    },
  });

  const deleteLogMutation = trpc.communicationLogs.delete.useMutation({
    onSuccess: () => {
      toast.success("메모가 삭제되었습니다");
      refetchLogs();
    },
    onError: (error: { message: string }) => {
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

  const logsList = logs as CommLog[];
  const filteredLogs = searchQuery
    ? logsList.filter((l) => {
        const q = searchQuery.toLowerCase();
        return (
          (l.content && l.content.toLowerCase().includes(q)) ||
          (l.authorName && l.authorName.toLowerCase().includes(q)) ||
          (l.partnerName && l.partnerName.toLowerCase().includes(q))
        );
      })
    : logsList;

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    const fieldA = sortBy === "createdAt" ? a.createdAt : a.updatedAt;
    const fieldB = sortBy === "createdAt" ? b.createdAt : b.updatedAt;
    return new Date(fieldB as string | number | Date).getTime() - new Date(fieldA as string | number | Date).getTime();
  });

  const allLogs = logsList;
  const stats = {
    total: allLogs.length,
    received: allLogs.filter((l) => l.status === "received").length,
    in_progress: allLogs.filter((l) => l.status === "in_progress").length,
    completed: allLogs.filter((l) => l.status === "completed").length,
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
                  {(partners as PartnerRow[]).map((partner) => (
                    <SelectItem key={partner.id} value={String(partner.id)}>
                      {partner.companyName || "이름 없음"}
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
                onChange={(e) => setContent(e.target.value)}
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
          <Input placeholder="메모 내용, 작성자, 거래처명 검색..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-7 bg-stone-50/50 border-stone-200/60 focus:bg-white h-7 text-xs rounded-md" />
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
          {sortedLogs.map((log) => (
            <MemoItem
              key={log.id}
              log={log}
              onStatusChange={(id, s) => updateStatusMutation.mutate({ id, status: s as CommLog["status"] })}
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


// 2026-04-20 분해: 사내 공지보드 섹션 전체를 _communicationLog/ 로 이동
import { InternalBoardTab } from "./_communicationLog/BoardSection";


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
    onError: (error: { message: string }) => { toast.error("댓글 추가 실패: " + error.message); },
  });

  const deleteCommentMutation = trpc.communicationLogs.deleteComment.useMutation({
    onSuccess: () => { toast.success("댓글이 삭제되었습니다"); refetchComments(); },
    onError: (error: { message: string }) => { toast.error("댓글 삭제 실패: " + error.message); },
  });

  const isPending = "isPending" in createCommentMutation ? (createCommentMutation as any).isPending : (createCommentMutation as any).isLoading;

  return (
    <div className="mt-2 pt-2 border-t border-amber-100">
      {(comments as LogComment[]).length > 0 && (
        <div className="space-y-1.5 mb-2">
          {(comments as LogComment[]).map((comment) => (
            <div key={comment.id} className="flex items-start gap-2 bg-amber-50/50 rounded-lg p-2 group">
              <div className="w-5 h-5 rounded-full bg-amber-200/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="h-2.5 w-2.5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-gray-700">{comment.authorName || "사용자"}</span>
                  <span className="text-[10px] text-gray-400">{new Date(comment.createdAt as string | Date).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
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
        <Input placeholder="댓글을 입력하세요..." value={newComment} onChange={(e) => setNewComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (newComment.trim()) createCommentMutation.mutate({ logId, content: newComment.trim() }); }}}
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
  const count = (comments as LogComment[]).length;
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// 메모 아이템 컴포넌트
function MemoItem({ log, onStatusChange, onDelete, onUpdate, isStatusLoading, currentUserId }: {
  log: CommLog;
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

  const statusConfig: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: React.ComponentType<{ className?: string }> }> = {
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
        <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} className="text-sm border-amber-300 focus:border-amber-500 bg-amber-50/30" autoFocus />
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
