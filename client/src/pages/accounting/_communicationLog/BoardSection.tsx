/**
 * CommunicationLog 분해 — 사내 공지보드 섹션 전체.
 *  - InternalBoardTab     메인 탭
 *  - BoardItemCard        공지 카드
 *  - BoardCommentSection  공지 댓글
 *  - BoardCommentCountBadge  댓글 수 배지
 *  - getBoardGreeting     시간대별 인사 헬퍼
 *  - typeConfig           타입별 스타일 설정
 */
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { RouterOutput } from "@/lib/trpcTypes";
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
  Plus, Trash2, Pencil, X, Check, MessageCircle, Send, ChevronDown, ChevronUp,
  User, Megaphone, ClipboardList, Pin, Loader2, RefreshCw, CheckCircle2,
} from "lucide-react";

type BoardItem = RouterOutput["board"]["getBoardItems"][number];
type BoardComment = RouterOutput["board"]["getBoardComments"][number];

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

export function InternalBoardTab() {
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
    { type: selectedType as "all" | "notice" | "work" | "handover" },
    { refetchInterval: 30000 }
  );

  const { data: boardStats, refetch: refetchStats } = trpc.board.getBoardStats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const ackMutation = trpc.board.ackLog.useMutation({
    onSuccess: (result: { alreadyAcked?: boolean }) => {
      toast[result.alreadyAcked ? "info" : "success"](result.alreadyAcked ? "이미 확인한 항목입니다" : "확인 완료!");
      refetch();
    },
    onError: (error: { message: string }) => toast.error("확인 처리 실패: " + error.message),
  });

  const createNoticeMutation = trpc.board.createNotice.useMutation({
    onSuccess: () => {
      toast.success("등록 완료! 직원들에게 알림이 전송됩니다.");
      setNoticeContent(""); setNoticeTitle(""); setNoticeType("notice"); setShowNoticeForm(false);
      refetch(); refetchStats();
    },
    onError: (error: { message: string }) => toast.error("등록 실패: " + error.message),
  });

  const updateNoticeMutation = trpc.board.updateNotice.useMutation({
    onSuccess: () => {
      toast.success("수정 완료!");
      setEditingId(null); refetch(); refetchStats();
    },
    onError: (error: { message: string }) => toast.error("수정 실패: " + error.message),
  });

  const deleteNoticeMutation = trpc.board.deleteNotice.useMutation({
    onSuccess: () => {
      toast.success("삭제 완료!");
      refetch(); refetchStats();
    },
    onError: (error: { message: string }) => toast.error("삭제 실패: " + error.message),
  });

  const updateStatusMutation = trpc.board.updateBoardStatus.useMutation({
    onSuccess: () => {
      toast.success("완료 처리되었습니다");
      refetch(); refetchStats();
    },
    onError: (error: { message: string }) => toast.error("상태 변경 실패: " + error.message),
  });

  const isCreatePending = "isPending" in createNoticeMutation ? (createNoticeMutation as any).isPending : (createNoticeMutation as any).isLoading;

  const allItems = items as BoardItem[];
  // 접수/진행중 (상단 카드), 완료 (하단 리스트)
  const activeItems = allItems.filter((item) => item.status !== "completed");
  const completedItems = allItems.filter((item) => item.status === "completed");
  // 완료 목록 페이지네이션
  const completedTotalPages = Math.max(1, Math.ceil(completedItems.length / COMPLETED_PER_PAGE));
  const completedPageItems = completedItems.slice((completedPage - 1) * COMPLETED_PER_PAGE, completedPage * COMPLETED_PER_PAGE);

  const stats = boardStats || { total: 0, notice: 0, work: 0, handover: 0, received: 0, inProgress: 0, completed: 0 };

  const startEdit = (item: BoardItem) => {
    setEditingId(item.id);
    setEditType(item.logType || "notice");
    setEditTitle(item.title || "");
    setEditContent(item.content || "");
  };

  const submitEdit = () => {
    if (!editingId || !editContent.trim()) return;
    updateNoticeMutation.mutate({
      id: editingId,
      type: editType as "notice" | "work" | "handover",
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
              <Input value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} placeholder="제목을 입력하세요" className="bg-white border-blue-200/60 h-9 text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-stone-500">내용 *</Label>
            <Textarea value={noticeContent} onChange={(e) => setNoticeContent(e.target.value)} placeholder="공지/작업/전달 내용을 입력하세요..." rows={3} className="bg-white border-blue-200/60 resize-none text-sm" />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setNoticeContent(""); setNoticeTitle(""); setNoticeType("notice"); }} className="h-8 px-3 text-xs text-stone-500">초기화</Button>
            <Button size="sm" onClick={() => {
              if (!noticeContent.trim()) { toast.error("내용을 입력해주세요"); return; }
              createNoticeMutation.mutate({ type: noticeType as "notice" | "work" | "handover", content: noticeContent.trim(), title: noticeTitle.trim() || undefined });
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
              {activeItems.map((item) => {
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
                        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="제목" className="bg-white border-blue-200/60 h-8 text-xs" />
                      </div>
                    </div>
                    <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} className="bg-white border-blue-200/60 resize-none text-sm" />
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
                {completedPageItems.map((item) => {
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
    onError: (error: { message: string }) => { toast.error("댓글 추가 실패: " + error.message); },
  });

  const deleteCommentMutation = trpc.board.deleteBoardComment.useMutation({
    onSuccess: () => { toast.success("댓글이 삭제되었습니다"); refetchComments(); },
    onError: (error: { message: string }) => { toast.error("댓글 삭제 실패: " + error.message); },
  });

  const isPending = "isPending" in createCommentMutation ? (createCommentMutation as any).isPending : (createCommentMutation as any).isLoading;

  return (
    <div className="mt-2.5 pt-2.5 border-t border-blue-100">
      {(comments as BoardComment[]).length > 0 && (
        <div className="space-y-1.5 mb-2">
          {(comments as BoardComment[]).map((comment) => (
            <div key={comment.id} className="flex items-start gap-2 bg-blue-50/50 rounded-lg p-2 group">
              <div className="w-5 h-5 rounded-full bg-blue-200/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="h-2.5 w-2.5 text-blue-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-gray-700">{comment.authorName || "사용자"}</span>
                  <span className="text-[10px] text-gray-400">{new Date(comment.createdAt as string | Date).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
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
          <Input placeholder="댓글을 입력하세요..." value={newComment} onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (newComment.trim()) createCommentMutation.mutate({ logId, content: newComment.trim() }); }}}
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
  const count = (data as { count?: number } | undefined)?.count || 0;
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
  item: BoardItem;
  onAck: (id: number) => void;
  onEdit?: (item: BoardItem) => void;
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
