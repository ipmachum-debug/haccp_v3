import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import SuperAdminLayout from "@/components/dashboard/SuperAdminLayout";
import { motion as _motion, AnimatePresence } from "framer-motion";
const motion = _motion as any;
import {
  MessageCircle, Search, Eye, Lock, Unlock, Trash2, Edit3, 
  Send, X, CheckCircle2, Clock, AlertCircle, ChevronRight,
  ChevronLeft, Filter, EyeOff, Reply, RefreshCw
} from "lucide-react";

const categoryLabels: Record<string, string> = {
  general: "일반 문의",
  pricing: "요금 문의",
  technical: "기술 문의",
  demo: "데모 요청",
  partnership: "제휴 문의",
  bug: "버그 신고",
  feature: "기능 요청",
  other: "기타",
};

const statusLabels: Record<string, { label: string; color: string; bg: string; border: string }> = {
  open: { label: "접수", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  in_progress: { label: "처리중", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  resolved: { label: "답변완료", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  closed: { label: "종료", color: "text-stone-600", bg: "bg-stone-100", border: "border-stone-200" },
};

const inputCls = "w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100";

// ─── Ticket Detail/Reply Modal ───
function TicketModal({ 
  ticketId, onClose 
}: { 
  ticketId: number | null; onClose: () => void;
}) {
  const [replyText, setReplyText] = useState("");
  const [replyStatus, setReplyStatus] = useState<string>("resolved");
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editIsPublic, setEditIsPublic] = useState(false);

  const utils = trpc.useUtils();

  const { data: ticket, isLoading } = trpc.support.adminDetail.useQuery(
    { id: ticketId! },
    { enabled: !!ticketId }
  );

  const replyMutation = trpc.support.reply.useMutation({
    onSuccess: () => {
      toast.success("답변이 등록되었습니다.");
      setReplyText("");
      utils.support.adminList.invalidate();
      utils.support.adminDetail.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const updateMutation = trpc.support.adminUpdate.useMutation({
    onSuccess: () => {
      toast.success("문의가 수정되었습니다.");
      setIsEditing(false);
      utils.support.adminList.invalidate();
      utils.support.adminDetail.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = trpc.support.adminDelete.useMutation({
    onSuccess: () => {
      toast.success("문의가 삭제되었습니다.");
      onClose();
      utils.support.adminList.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const statusMutation = trpc.support.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("상태가 변경되었습니다.");
      utils.support.adminList.invalidate();
      utils.support.adminDetail.invalidate();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleReply = () => {
    if (!ticketId || !replyText.trim()) return;
    replyMutation.mutate({ 
      id: ticketId, 
      reply: replyText,
      status: replyStatus as any,
    });
  };

  const handleDelete = () => {
    if (!ticketId) return;
    if (confirm("정말 이 문의를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      deleteMutation.mutate({ id: ticketId });
    }
  };

  const handleStartEdit = () => {
    if (!ticket) return;
    setEditSubject(ticket.subject);
    setEditContent(ticket.content);
    setEditCategory(ticket.category);
    setEditIsPublic(ticket.isPublic === 1);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (!ticketId) return;
    updateMutation.mutate({
      id: ticketId,
      subject: editSubject,
      content: editContent,
      category: editCategory as any,
      isPublic: editIsPublic,
    });
  };

  if (!ticketId) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        onClick={(e: any) => e.stopPropagation()}
      >
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : ticket ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b bg-gray-50 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusLabels[ticket.status]?.bg} ${statusLabels[ticket.status]?.color} ${statusLabels[ticket.status]?.border}`}>
                    {statusLabels[ticket.status]?.label}
                  </span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{categoryLabels[ticket.category]}</span>
                  {ticket.isPublic === 0 && (
                    <span className="text-xs text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full flex items-center gap-0.5 border border-orange-200">
                      <Lock className="w-3 h-3" /> 비밀글
                    </span>
                  )}
                  {ticket.isPublic === 1 && (
                    <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-0.5 border border-green-200">
                      <Unlock className="w-3 h-3" /> 공개글
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-gray-900">{ticket.subject}</h2>
                <div className="mt-1 text-sm text-gray-500">
                  {ticket.authorName} {ticket.companyName ? `(${ticket.companyName})` : ""} · {ticket.authorEmail} · {ticket.authorPhone || "-"}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  작성: {new Date(ticket.createdAt).toLocaleString("ko-KR")} · 조회수: {ticket.viewCount}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-3">
                <button onClick={handleStartEdit} className="p-2 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors" title="수정">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={handleDelete} className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="삭제">
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <h3 className="font-semibold text-blue-800 text-sm mb-3 flex items-center gap-2">
                      <Edit3 className="w-4 h-4" /> 문의 수정
                    </h3>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">제목</label>
                        <input value={editSubject} onChange={e => setEditSubject(e.target.value)} className={inputCls} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">내용</label>
                        <textarea rows={5} value={editContent} onChange={e => setEditContent(e.target.value)} className={inputCls + " resize-none"} />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">카테고리</label>
                          <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className={inputCls}>
                            {Object.entries(categoryLabels).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">공개 여부</label>
                          <select value={editIsPublic ? "1" : "0"} onChange={e => setEditIsPublic(e.target.value === "1")} className={inputCls}>
                            <option value="0">🔒 비밀글</option>
                            <option value="1">🔓 공개글</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={handleSaveEdit} disabled={updateMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                          {updateMutation.isPending ? "저장중..." : "저장"}
                        </button>
                        <button onClick={() => setIsEditing(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200">
                          취소
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-gray-700 leading-relaxed whitespace-pre-wrap text-[15px] bg-gray-50 rounded-xl p-5">
                  {ticket.content}
                </div>
              )}

              {/* Existing Reply */}
              {ticket.reply && (
                <div className="mt-5 bg-emerald-50 rounded-xl p-5 border border-emerald-100">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span className="font-semibold text-emerald-700 text-sm">관리자 답변</span>
                    {ticket.repliedBy && <span className="text-xs text-emerald-500">({ticket.repliedBy})</span>}
                    {ticket.repliedAt && (
                      <span className="text-xs text-emerald-400">· {new Date(ticket.repliedAt).toLocaleString("ko-KR")}</span>
                    )}
                  </div>
                  <p className="text-emerald-800 leading-relaxed whitespace-pre-wrap text-[15px]">{ticket.reply}</p>
                </div>
              )}

              {/* Status Change */}
              <div className="mt-5 flex items-center gap-2 flex-wrap">
                <span className="text-sm text-gray-500 font-medium">상태 변경:</span>
                {(["open", "in_progress", "resolved", "closed"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => statusMutation.mutate({ id: ticketId!, status: s })}
                    disabled={ticket.status === s || statusMutation.isPending}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      ticket.status === s 
                        ? `${statusLabels[s].bg} ${statusLabels[s].color} ${statusLabels[s].border} ring-2 ring-offset-1 ring-purple-300` 
                        : `bg-white text-gray-500 border-gray-200 hover:${statusLabels[s].bg} hover:${statusLabels[s].color}`
                    } disabled:opacity-40`}
                  >
                    {statusLabels[s].label}
                  </button>
                ))}
              </div>

              {/* Reply Form */}
              <div className="mt-5 bg-gray-50 rounded-xl p-5 border border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
                  <Reply className="w-4 h-4" /> {ticket.reply ? "답변 수정" : "답변 작성"}
                </h3>
                <textarea
                  rows={4}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder={ticket.reply ? "기존 답변을 수정합니다..." : "답변 내용을 입력하세요..."}
                  className={inputCls + " resize-none"}
                />
                <div className="flex items-center justify-between mt-3">
                  <select
                    value={replyStatus}
                    onChange={e => setReplyStatus(e.target.value)}
                    className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm"
                  >
                    <option value="resolved">답변완료</option>
                    <option value="in_progress">처리중</option>
                    <option value="closed">종료</option>
                  </select>
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim() || replyMutation.isPending}
                    className="px-5 py-2.5 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {replyMutation.isPending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    답변 등록
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-gray-400">문의를 찾을 수 없습니다.</div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Main Page ───
export default function SupportManagePage() {
  const [selectedTicket, setSelectedTicket] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data, isLoading, refetch } = trpc.support.adminList.useQuery({
    page,
    limit: 20,
    status: statusFilter !== "all" ? statusFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    search: search || undefined,
  });

  const deleteMutation = trpc.support.adminDelete.useMutation({
    onSuccess: () => {
      toast.success("삭제되었습니다.");
      refetch();
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleQuickDelete = (id: number, subject: string) => {
    if (confirm(`"${subject}" 문의를 삭제하시겠습니까?`)) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <SuperAdminLayout>
      <div className="p-2 sm:p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <MessageCircle className="w-7 h-7 text-purple-600" />
                문의 관리
              </h1>
              <p className="text-sm text-gray-500 mt-1">고객 문의 전체 조회 · 답변 · 수정 · 삭제</p>
            </div>
            <button onClick={() => refetch()} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors" title="새로고침">
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* Stats */}
          {data && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <p className="text-xs text-blue-600 font-medium">전체</p>
                <p className="text-xl font-bold text-blue-800">{data.total}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                <p className="text-xs text-amber-600 font-medium">미답변</p>
                <p className="text-xl font-bold text-amber-800">
                  {data.items.filter((t: any) => !t.reply).length}
                </p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                <p className="text-xs text-orange-600 font-medium">비밀글</p>
                <p className="text-xl font-bold text-orange-800">
                  {data.items.filter((t: any) => t.isPublic === 0).length}
                </p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                <p className="text-xs text-emerald-600 font-medium">답변완료</p>
                <p className="text-xl font-bold text-emerald-800">
                  {data.items.filter((t: any) => t.reply).length}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
            <input
              type="text"
              placeholder="제목, 작성자, 이메일 검색..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2.5 bg-white rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2.5 bg-white rounded-xl border border-gray-200 text-sm"
          >
            <option value="all">전체 상태</option>
            <option value="open">접수</option>
            <option value="in_progress">처리중</option>
            <option value="resolved">답변완료</option>
            <option value="closed">종료</option>
          </select>
          <select
            value={categoryFilter}
            onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
            className="px-3 py-2.5 bg-white rounded-xl border border-gray-200 text-sm"
          >
            <option value="all">전체 유형</option>
            {Object.entries(categoryLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto" />
            </div>
          ) : data?.items && data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">상태</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">유형</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">제목</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">작성자</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">비밀</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">답변</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">작성일</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.items.map((ticket: any) => (
                    <tr key={ticket.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{ticket.id}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusLabels[ticket.status]?.bg} ${statusLabels[ticket.status]?.color}`}>
                          {statusLabels[ticket.status]?.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{categoryLabels[ticket.category]}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedTicket(ticket.id)} className="text-gray-900 font-medium hover:text-purple-600 transition-colors text-left truncate max-w-[200px] block">
                          {ticket.subject}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700 text-xs">{ticket.authorName}</div>
                        <div className="text-gray-400 text-[11px]">{ticket.authorEmail}</div>
                      </td>
                      <td className="px-4 py-3">
                        {ticket.isPublic === 0 ? (
                          <span className="text-orange-500"><Lock className="w-4 h-4" /></span>
                        ) : (
                          <span className="text-green-500"><Unlock className="w-4 h-4" /></span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {ticket.reply ? (
                          <span className="text-emerald-500"><CheckCircle2 className="w-4 h-4" /></span>
                        ) : (
                          <span className="text-gray-300"><Clock className="w-4 h-4" /></span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {new Date(ticket.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setSelectedTicket(ticket.id)} className="p-1.5 rounded-lg hover:bg-purple-50 text-gray-400 hover:text-purple-600" title="상세보기">
                            <Eye className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleQuickDelete(ticket.id, ticket.subject)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="삭제">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-16 text-center">
              <MessageCircle className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-400">문의가 없습니다</p>
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-gray-500">총 {data.total}건 · {page}/{data.totalPages} 페이지</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(data.totalPages, 5) }, (_, i) => {
                const start = Math.max(1, page - 2);
                const p = start + i;
                if (p > data.totalPages) return null;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium ${
                      p === page ? "bg-purple-600 text-white" : "hover:bg-gray-100 text-gray-600"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages} className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Ticket Detail Modal */}
      <AnimatePresence>
        {selectedTicket && (
          <TicketModal ticketId={selectedTicket} onClose={() => setSelectedTicket(null)} />
        )}
      </AnimatePresence>
    </SuperAdminLayout>
  );
}
