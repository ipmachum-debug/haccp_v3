import { useState } from "react";
import { motion as _motion, AnimatePresence } from "framer-motion";
const motion = _motion as any;
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  ShieldCheck, ArrowLeft, Search, MessageCircle, Clock,
  CheckCircle2, Send, X, ChevronRight, Eye, AlertCircle,
  Phone, Mail, MapPin, Lock, Unlock, Edit3, KeyRound, EyeOff
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

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  open: { label: "접수", color: "text-blue-600", bg: "bg-blue-50" },
  in_progress: { label: "처리중", color: "text-amber-600", bg: "bg-amber-50" },
  resolved: { label: "답변완료", color: "text-emerald-600", bg: "bg-emerald-50" },
  closed: { label: "종료", color: "text-stone-500", bg: "bg-stone-100" },
};

const inputCls = "w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-sm focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100";
const labelCls = "block text-sm font-medium text-stone-600 mb-1.5";

// ─── Password Input Modal ───
function PasswordModal({ 
  open, onClose, onVerify, title, description 
}: { 
  open: boolean; onClose: () => void; onVerify: (pw: string) => void;
  title?: string; description?: string;
}) {
  const [pw, setPw] = useState("");

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h3 className="font-bold text-[#1a1a2e]">{title || "비밀번호 확인"}</h3>
                <p className="text-xs text-stone-400">{description || "비밀글을 확인하려면 비밀번호를 입력하세요"}</p>
              </div>
            </div>
            <form onSubmit={e => { e.preventDefault(); onVerify(pw); setPw(""); }}>
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder="비밀번호 입력"
                autoFocus
                className={inputCls}
              />
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 bg-stone-100 text-stone-500 font-medium rounded-xl hover:bg-stone-200 transition-colors text-sm"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={!pw}
                  className="flex-1 py-2.5 bg-[#1a1a2e] text-white font-medium rounded-xl hover:bg-[#2a2a3e] transition-colors text-sm disabled:opacity-40"
                >
                  확인
                </button>
              </div>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Contact Modal (문의 작성 / 수정) ───
function ContactModal({ 
  open, onClose, editData 
}: { 
  open: boolean; onClose: () => void;
  editData?: { id: number; subject: string; content: string; category: string; isPublic: number; password?: string } | null;
}) {
  const [form, setForm] = useState({
    authorName: "",
    authorEmail: "",
    authorPhone: "",
    companyName: "",
    category: "general" as string,
    subject: editData?.subject ?? "",
    content: editData?.content ?? "",
    isPublic: editData ? editData.isPublic === 1 : false,
    password: "",
    editPassword: editData?.password ?? "",
  });

  // Reset form when editData or open changes
  const isEdit = !!editData;

  const utils = trpc.useUtils();

  const createMutation = trpc.support.create.useMutation({
    onSuccess: () => {
      toast.success("문의가 등록되었습니다. 빠르게 답변 드리겠습니다.");
      onClose();
      utils.support.list.invalidate();
      setForm({ authorName: "", authorEmail: "", authorPhone: "", companyName: "", category: "general", subject: "", content: "", isPublic: false, password: "", editPassword: "" });
    },
    onError: (err: { message: string }) => {
      toast.error(err.message || "문의 등록에 실패했습니다.");
    },
  });

  const updateMutation = trpc.support.update.useMutation({
    onSuccess: () => {
      toast.success("문의가 수정되었습니다.");
      onClose();
      utils.support.list.invalidate();
    },
    onError: (err: { message: string }) => {
      toast.error(err.message || "문의 수정에 실패했습니다.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      updateMutation.mutate({
        id: editData!.id,
        password: form.editPassword,
        subject: form.subject,
        content: form.content,
        category: form.category as any,
        isPublic: form.isPublic,
        newPassword: form.password || undefined,
      });
    } else {
      if (!form.isPublic && !form.password) {
        toast.error("비밀글 작성 시 비밀번호를 입력해주세요.");
        return;
      }
      createMutation.mutate({
        ...form,
        category: form.category as any,
        password: form.password || undefined,
      });
    }
  };

  const handleEmailFallback = () => {
    const subject = encodeURIComponent(form.subject || "HACCPONE 문의");
    const body = encodeURIComponent(
      `이름: ${form.authorName}\n회사: ${form.companyName}\n연락처: ${form.authorPhone}\n\n${form.content}`
    );
    window.open(`mailto:sokoorymall@naver.com?subject=${subject}&body=${body}`, "_blank");
  };

  if (!open) return null;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[#1a1a2e] flex items-center gap-2">
                {isEdit ? <Edit3 className="w-5 h-5 text-orange-500" /> : <MessageCircle className="w-5 h-5 text-orange-500" />}
                {isEdit ? "문의 수정" : "문의하기"}
              </h2>
              <p className="text-sm text-stone-400 mt-0.5">
                {isEdit ? "작성한 문의를 수정합니다" : "게시판 등록 또는 이메일로 보내실 수 있습니다"}
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-stone-100 transition-colors">
              <X className="w-5 h-5 text-stone-400" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* 작성자 정보 - 새 글 작성 시만 */}
            {!isEdit && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>이름 *</label>
                    <input required value={form.authorName} onChange={(e) => setForm({ ...form, authorName: e.target.value })} className={inputCls} placeholder="홍길동" />
                  </div>
                  <div>
                    <label className={labelCls}>회사명</label>
                    <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} className={inputCls} placeholder="(주)회사명" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>이메일 *</label>
                    <input required type="email" value={form.authorEmail} onChange={(e) => setForm({ ...form, authorEmail: e.target.value })} className={inputCls} placeholder="email@example.com" />
                  </div>
                  <div>
                    <label className={labelCls}>연락처</label>
                    <input value={form.authorPhone} onChange={(e) => setForm({ ...form, authorPhone: e.target.value })} className={inputCls} placeholder="010-0000-0000" />
                  </div>
                </div>
              </>
            )}

            <div>
              <label className={labelCls}>문의 유형 *</label>
              <select
                value={isEdit ? (editData?.category || form.category) : form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className={inputCls}
              >
                {Object.entries(categoryLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>제목 *</label>
              <input
                required
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className={inputCls}
                placeholder="문의 제목을 입력하세요"
              />
            </div>
            <div>
              <label className={labelCls}>내용 *</label>
              <textarea
                required
                rows={5}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className={inputCls + " resize-none"}
                placeholder="문의 내용을 자세히 입력해주세요"
              />
            </div>

            {/* 비밀글 토글 */}
            <div className="bg-stone-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {form.isPublic ? (
                    <Unlock className="w-4 h-4 text-stone-400" />
                  ) : (
                    <Lock className="w-4 h-4 text-orange-500" />
                  )}
                  <span className="text-sm font-medium text-stone-700">
                    {form.isPublic ? "공개글" : "비밀글"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, isPublic: !form.isPublic })}
                  className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
                    form.isPublic ? "bg-stone-300" : "bg-orange-500"
                  }`}
                >
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                    form.isPublic ? "left-0.5" : "left-[26px]"
                  }`} />
                </button>
              </div>
              <p className="text-xs text-stone-400">
                {form.isPublic 
                  ? "누구나 문의 내용을 확인할 수 있습니다" 
                  : "관리자와 비밀번호를 아는 사람만 확인할 수 있습니다"
                }
              </p>
              {/* 비밀번호 입력 */}
              {!form.isPublic && (
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-1">
                    {isEdit ? "새 비밀번호 (변경 시에만 입력)" : "비밀번호 *"}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className={inputCls}
                    placeholder={isEdit ? "변경할 비밀번호 입력" : "4자 이상 비밀번호 입력"}
                    required={!form.isPublic && !isEdit}
                    minLength={4}
                  />
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 py-3 bg-[#1a1a2e] text-white font-semibold rounded-xl hover:bg-[#2a2a3e] transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              >
                {isPending ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    {isEdit ? <Edit3 className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                    {isEdit ? "수정하기" : "게시판에 등록"}
                  </>
                )}
              </button>
              {!isEdit && (
                <button
                  type="button"
                  onClick={handleEmailFallback}
                  className="flex-1 py-3 bg-white text-stone-600 font-semibold rounded-xl border border-stone-200 hover:border-orange-200 hover:text-orange-600 transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <Mail className="w-4 h-4" /> 이메일로 보내기
                </button>
              )}
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Ticket Detail Modal ───
function TicketDetailModal({ 
  ticketId, onClose, onEdit, password 
}: { 
  ticketId: number | null; onClose: () => void; 
  onEdit?: (ticket: any, password: string) => void;
  password?: string;
}) {
  const { data: ticket, isLoading, error } = trpc.support.detail.useQuery(
    { id: ticketId!, password: password || undefined },
    { enabled: !!ticketId, retry: false }
  );

  if (!ticketId) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {isLoading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto" />
          </div>
        ) : error ? (
          <div className="p-12 text-center">
            <Lock className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-500">{(error as any)?.message || "조회할 수 없습니다."}</p>
          </div>
        ) : ticket ? (
          <>
            <div className="px-6 py-5 border-b border-stone-100 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusLabels[ticket.status]?.bg} ${statusLabels[ticket.status]?.color}`}>
                    {statusLabels[ticket.status]?.label}
                  </span>
                  <span className="text-xs text-stone-400">
                    {categoryLabels[ticket.category]}
                  </span>
                  {ticket.isPublic === 0 && (
                    <span className="text-xs text-orange-500 flex items-center gap-0.5">
                      <Lock className="w-3 h-3" /> 비밀글
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-[#1a1a2e]">{ticket.subject}</h2>
                <div className="mt-1 text-sm text-stone-400">
                  {ticket.authorName} {ticket.companyName ? `(${ticket.companyName})` : ""} · {new Date(ticket.createdAt).toLocaleDateString("ko-KR")}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* 수정 버튼 (비밀번호가 있는 경우에만) */}
                {password && onEdit && (
                  <button
                    onClick={() => onEdit(ticket, password)}
                    className="p-2 rounded-full hover:bg-orange-50 text-stone-400 hover:text-orange-500 transition-colors"
                    title="수정하기"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={onClose} className="p-2 rounded-full hover:bg-stone-100">
                  <X className="w-5 h-5 text-stone-400" />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="text-stone-700 leading-relaxed whitespace-pre-wrap text-[15px]">
                {ticket.content}
              </div>

              {/* Reply */}
              {ticket.reply && (
                <div className="mt-6 bg-emerald-50 rounded-2xl p-5 border border-emerald-100">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span className="font-semibold text-emerald-700 text-sm">관리자 답변</span>
                    {ticket.repliedAt && (
                      <span className="text-xs text-emerald-500">
                        · {new Date(ticket.repliedAt).toLocaleDateString("ko-KR")}
                      </span>
                    )}
                  </div>
                  <p className="text-emerald-800 leading-relaxed whitespace-pre-wrap text-[15px]">
                    {ticket.reply}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-stone-400">문의를 찾을 수 없습니다.</div>
        )}
      </motion.div>
    </motion.div>
  );
}

// ─── Main Support Page ───
export default function SupportPage() {
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<number | null>(null);
  const [selectedTicketPassword, setSelectedTicketPassword] = useState<string>("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  
  // 비밀번호 모달 상태
  const [passwordModal, setPasswordModal] = useState<{
    open: boolean;
    ticketId: number | null;
    purpose: "view" | "edit";
  }>({ open: false, ticketId: null, purpose: "view" });

  // 수정 모달 상태
  const [editData, setEditData] = useState<any>(null);

  const { data, isLoading } = trpc.support.list.useQuery({
    page,
    limit: 10,
    category: category !== "all" ? category : undefined,
    search: search || undefined,
  });

  const verifyMutation = trpc.support.verifyPassword.useMutation();

  const handleTicketClick = (ticket: any) => {
    if (ticket.isPublic === 0) {
      // 비밀글: 비밀번호 모달 열기
      setPasswordModal({ open: true, ticketId: ticket.id, purpose: "view" });
    } else {
      // 공개글: 바로 상세 보기
      setSelectedTicket(ticket.id);
      setSelectedTicketPassword("");
    }
  };

  const handlePasswordVerify = async (pw: string) => {
    const ticketId = passwordModal.ticketId;
    if (!ticketId) return;

    try {
      await verifyMutation.mutateAsync({ id: ticketId, password: pw });
      setPasswordModal({ open: false, ticketId: null, purpose: "view" });

      if (passwordModal.purpose === "view") {
        setSelectedTicket(ticketId);
        setSelectedTicketPassword(pw);
      } else if (passwordModal.purpose === "edit") {
        // 수정 시: 해당 글 데이터를 가져와서 수정 모달 열기
        // detail 쿼리로 데이터를 가져온 후 수정 모달로 전달
        setSelectedTicket(ticketId);
        setSelectedTicketPassword(pw);
      }
    } catch (err: any) {
      toast.error(err.message || "비밀번호가 일치하지 않습니다.");
    }
  };

  const handleEdit = (ticket: any, password: string) => {
    setSelectedTicket(null);
    setEditData({
      id: ticket.id,
      subject: ticket.subject,
      content: ticket.content,
      category: ticket.category,
      isPublic: ticket.isPublic,
      password: password,
    });
    setContactOpen(true);
  };

  const handleEditFromList = (ticketId: number, isPublic: number) => {
    if (isPublic === 0) {
      setPasswordModal({ open: true, ticketId, purpose: "edit" });
    } else {
      // 공개글은 비밀번호가 없으므로 수정 불가 안내
      toast.error("공개글은 비밀번호가 설정되지 않아 수정할 수 없습니다. 비밀글로 작성 시 수정이 가능합니다.");
    }
  };

  const handleCloseContact = () => {
    setContactOpen(false);
    setEditData(null);
  };

  return (
    <div className="min-h-screen" style={{ background: "#FBF8F3", fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
      `}</style>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-stone-100 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <a className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <span className="text-lg font-bold text-[#1a1a2e]">HACCP<span className="text-orange-500">ONE</span></span>
              </a>
            </Link>
            <span className="text-stone-300">|</span>
            <span className="text-sm font-medium text-stone-500">고객 지원</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/faq">
              <a className="text-sm text-stone-400 hover:text-orange-500 transition-colors">FAQ</a>
            </Link>
            <Link href="/">
              <a className="text-sm text-stone-400 hover:text-orange-500 transition-colors flex items-center gap-1">
                <ArrowLeft className="w-4 h-4" /> 홈
              </a>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-[#1a1a2e] tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            고객 지원
          </h1>
          <p className="mt-3 text-stone-500">문의사항을 남겨주시면 빠르게 답변 드리겠습니다</p>
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 rounded-full border border-orange-100">
              <Lock className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-xs text-orange-600 font-medium">비밀글 기본 적용</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-emerald-600 font-medium">관리자만 전체 열람</span>
            </div>
          </div>
          <div className="mt-6">
            <button
              onClick={() => { setEditData(null); setContactOpen(true); }}
              className="px-7 py-3.5 bg-[#1a1a2e] text-white font-semibold rounded-full hover:bg-[#2a2a3e] transition-all shadow-lg shadow-stone-900/10 text-sm inline-flex items-center gap-2"
            >
              <MessageCircle className="w-4 h-4" /> 문의하기
            </button>
          </div>
        </motion.div>

        {/* Contact Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { icon: Phone, title: "전화 문의", info: "032-322-9958", sub: "평일 09:00~18:00" },
            { icon: Mail, title: "이메일", info: "sokoorymall@naver.com", sub: "24시간 접수 가능" },
            { icon: MapPin, title: "방문 상담", info: "인천 서구 원창로89번길 14-7", sub: "사전 예약 필요" },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.1 }}
              className="bg-white rounded-2xl p-5 border border-stone-100 text-center"
            >
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mx-auto mb-3">
                <item.icon className="w-5 h-5 text-orange-500" />
              </div>
              <h3 className="font-semibold text-[#1a1a2e] text-sm">{item.title}</h3>
              <p className="text-sm text-stone-600 mt-1">{item.info}</p>
              <p className="text-xs text-stone-400 mt-0.5">{item.sub}</p>
            </motion.div>
          ))}
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-300" />
            <input
              type="text"
              placeholder="문의 검색..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-11 pr-4 py-3 bg-white rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
            />
          </div>
          <select
            value={category}
            onChange={(e) => { setCategory(e.target.value); setPage(1); }}
            className="px-4 py-3 bg-white rounded-xl border border-stone-200 text-sm focus:outline-none focus:border-orange-300 text-stone-600"
          >
            <option value="all">전체 유형</option>
            {Object.entries(categoryLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* Ticket List */}
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-2 border-orange-200 border-t-orange-500 rounded-full animate-spin mx-auto" />
            </div>
          ) : data?.items && data.items.length > 0 ? (
            <div className="divide-y divide-stone-50">
              {data.items.map((ticket: any) => (
                <div
                  key={ticket.id}
                  className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-stone-50/50 transition-colors group"
                >
                  {/* 비밀글 아이콘 */}
                  <div className="flex-shrink-0">
                    {ticket.isPublic === 0 ? (
                      <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center">
                        <Lock className="w-4 h-4 text-orange-500" />
                      </div>
                    ) : (
                      <div className="w-9 h-9 bg-stone-50 rounded-xl flex items-center justify-center">
                        <MessageCircle className="w-4 h-4 text-stone-400" />
                      </div>
                    )}
                  </div>
                  {/* 내용 */}
                  <button 
                    onClick={() => handleTicketClick(ticket)} 
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${statusLabels[ticket.status]?.bg} ${statusLabels[ticket.status]?.color}`}>
                        {statusLabels[ticket.status]?.label}
                      </span>
                      <span className="text-[11px] text-stone-400">{categoryLabels[ticket.category]}</span>
                      {ticket.isPublic === 0 && (
                        <span className="text-[11px] text-orange-500 flex items-center gap-0.5">
                          <EyeOff className="w-3 h-3" /> 비밀글
                        </span>
                      )}
                      {ticket.hasReply === 1 && (
                        <span className="text-[11px] text-emerald-500 flex items-center gap-0.5">
                          <CheckCircle2 className="w-3 h-3" /> 답변완료
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-[#1a1a2e] text-sm truncate">{ticket.subject}</h3>
                    <div className="text-xs text-stone-400 mt-1">
                      {ticket.authorName} {ticket.companyName ? `· ${ticket.companyName}` : ""} · {new Date(ticket.createdAt).toLocaleDateString("ko-KR")}
                    </div>
                  </button>
                  {/* 오른쪽 액션 */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* 수정 버튼 */}
                    {ticket.isPublic === 0 && (
                      <button
                        onClick={() => handleEditFromList(ticket.id, ticket.isPublic)}
                        className="p-1.5 rounded-lg hover:bg-orange-50 text-stone-300 hover:text-orange-500 transition-colors"
                        title="수정하기"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <div className="flex items-center gap-1 text-xs text-stone-400">
                      <Eye className="w-3.5 h-3.5" /> {ticket.viewCount}
                    </div>
                    <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-orange-500 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-16 text-center">
              <MessageCircle className="w-12 h-12 text-stone-200 mx-auto mb-4" />
              <p className="text-stone-400">등록된 문의가 없습니다</p>
              <button
                onClick={() => { setEditData(null); setContactOpen(true); }}
                className="mt-4 text-sm text-orange-500 font-medium hover:text-orange-600 transition-colors"
              >
                첫 번째 문의를 작성해보세요
              </button>
            </div>
          )}
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-2">
            {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                  p === page ? "bg-[#1a1a2e] text-white" : "bg-white text-stone-500 border border-stone-200 hover:border-orange-200"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Info Box */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="mt-8 bg-orange-50/50 rounded-2xl p-5 border border-orange-100"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-stone-600 space-y-1">
              <p className="font-medium text-stone-700">문의 게시판 안내</p>
              <p>• 문의는 기본적으로 <strong className="text-orange-600">비밀글</strong>로 작성됩니다 (비밀번호 설정 필수)</p>
              <p>• 비밀글은 <strong className="text-orange-600">비밀번호를 아는 분</strong>과 <strong className="text-orange-600">관리자</strong>만 열람할 수 있습니다</p>
              <p>• 비밀번호를 입력하면 문의글 <strong className="text-orange-600">수정</strong>이 가능합니다</p>
              <p>• 공개글로 전환하면 누구나 확인할 수 있습니다</p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Contact / Edit Modal */}
      <ContactModal open={contactOpen} onClose={handleCloseContact} editData={editData} />

      {/* Ticket Detail Modal */}
      <AnimatePresence>
        {selectedTicket && (
          <TicketDetailModal 
            ticketId={selectedTicket} 
            onClose={() => { setSelectedTicket(null); setSelectedTicketPassword(""); }}
            onEdit={handleEdit}
            password={selectedTicketPassword}
          />
        )}
      </AnimatePresence>

      {/* Password Modal */}
      <PasswordModal
        open={passwordModal.open}
        onClose={() => setPasswordModal({ open: false, ticketId: null, purpose: "view" })}
        onVerify={handlePasswordVerify}
        title={passwordModal.purpose === "edit" ? "수정 비밀번호 확인" : "비밀글 확인"}
        description={passwordModal.purpose === "edit" ? "글을 수정하려면 비밀번호를 입력하세요" : "비밀글을 확인하려면 비밀번호를 입력하세요"}
      />
    </div>
  );
}
