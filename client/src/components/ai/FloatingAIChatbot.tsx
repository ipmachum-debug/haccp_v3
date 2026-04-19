import { useState, useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { X, Trash2, ChevronDown, Send, ArrowLeft, EyeOff, Loader2, Sparkles, User, Headphones } from "lucide-react";
import { openChannelTalk, closeChannelTalk } from "../ChannelTalkWidget";

declare global {
  interface Window {
    onChannelTalkHidden?: () => void;
  }
}
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Streamdown } from "streamdown";

export type Message = {
  role: "system" | "user" | "assistant";
  content: string;
};

// 카테고리별 빠른 질문
const quickQuestionCategories = [
  {
    category: "시작하기",
    icon: "📖",
    color: "#6366f1",
    questions: [
      "Millio AI는 어떤 시스템인가요?",
      "처음 사용하는데 어디서부터 시작하나요?",
      "전체 메뉴 구조를 알려주세요",
      "Today 페이지는 뭔가요?",
    ],
  },
  {
    category: "생산 파이프라인",
    icon: "🔄",
    color: "#10b981",
    questions: [
      "생산 파이프라인 9단계가 뭔가요?",
      "새 배치를 생성하려면 어떻게 하나요?",
      "배치 완료 후 자동으로 무엇이 생성되나요?",
      "파이프라인 진행 상태는 어디서 확인하나요?",
      "원료출고는 어떻게 처리하나요?",
    ],
  },
  {
    category: "생산/재고 관리",
    icon: "🏭",
    color: "#f59e0b",
    questions: [
      "품목(원재료/완제품) 등록 방법",
      "BOM(자재명세서) 등록 방법",
      "재고 조회 및 LOT 추적 방법",
      "유통기한 임박 원재료 확인 방법",
      "생산 예측 기능은 어떻게 사용하나요?",
    ],
  },
  {
    category: "HACCP 관리",
    icon: "🛡️",
    color: "#ef4444",
    questions: [
      "CCP 모니터링은 어떻게 하나요?",
      "CCP 이탈 시 어떻게 대응하나요?",
      "HACCP 일일 체크리스트 작성법",
      "HACCP 7원칙이 뭔가요?",
      "검사 관리(원재료/위생/출하) 방법",
      "부적합 제품 처리 방법",
      "회수 시뮬레이션은 어떻게 하나요?",
    ],
  },
  {
    category: "문서/승인 관리",
    icon: "📋",
    color: "#8b5cf6",
    questions: [
      "승인 요청은 어떻게 처리하나요?",
      "승인된 문서를 PDF로 출력하는 방법",
      "일일일지 출력 방법",
      "품목제조보고서 생성 방법",
    ],
  },
  {
    category: "회계 관리",
    icon: "💰",
    color: "#14b8a6",
    questions: [
      "매출/매입 전표 등록 방법",
      "은행 거래 자동 매칭 방법",
      "일일/월간 마감 방법",
      "재무제표 조회 방법",
      "계정과목 설정 방법",
    ],
  },
  {
    category: "설정/기타",
    icon: "⚙️",
    color: "#64748b",
    questions: [
      "구독 플랜은 어떤 것이 있나요?",
      "GOGOGOPICK 연동 방법",
      "모바일에서도 사용할 수 있나요?",
      "데이터를 엑셀로 내보낼 수 있나요?",
      "오류가 발생했는데 어떻게 하나요?",
    ],
  },
];

export default function FloatingAIChatbot() {
  const [isHidden, setIsHidden] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatbot-hidden') === 'true';
    }
    return false;
  });
  const [isOpen, setIsOpen] = useState(false);
  const [hiddenByChannelTalk, setHiddenByChannelTalk] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  // 채널톡과 연동 — 채널톡 닫히면 하나 복원
  useEffect(() => {
    window.onChannelTalkHidden = () => setHiddenByChannelTalk(false);
    return () => { window.onChannelTalkHidden = undefined; };
  }, []);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [showCategories, setShowCategories] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [showBubble, setShowBubble] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatbot-bubble-dismissed') !== 'true';
    }
    return true;
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatMutation = trpc.ai.chat.useMutation();
  const clearHistoryMutation = trpc.ai.clearHistory.useMutation();

  useEffect(() => {
    if (messages.length > 0) {
      setShowCategories(false);
    }
  }, [messages]);

  // 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLDivElement;
      if (viewport) {
        requestAnimationFrame(() => {
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
        });
      }
    }
  }, [messages, isLoading]);

  // 모바일에서 챗봇 열릴 때 body 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        document.body.style.overflow = "hidden";
      }
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  const handleSendMessage = async (content: string) => {
    setMessages((prev) => [...prev, { role: "user", content }]);
    setIsLoading(true);
    try {
      const result = await chatMutation.mutateAsync({ message: content, conversationId });
      if (result.conversationId && !conversationId) setConversationId(result.conversationId);
      setMessages((prev) => [...prev, { role: "assistant", content: result.response }]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [...prev, { role: "assistant", content: "죄송합니다. 오류가 발생했습니다. 다시 시도해주세요." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (!conversationId) return;
    try {
      await clearHistoryMutation.mutateAsync({ conversationId });
      setMessages([]);
      setConversationId(undefined);
      setShowCategories(true);
      setExpandedCategory(null);
    } catch (error) {
      console.error("Clear history error:", error);
    }
  };

  const handleHide = () => {
    setIsOpen(false);
    setIsHidden(true);
    localStorage.setItem('chatbot-hidden', 'true');
  };

  const handleShow = () => {
    setIsHidden(false);
    localStorage.removeItem('chatbot-hidden');
  };

  const displayMessages = messages.filter((m) => m.role !== "system");

  return (
    <>
      <style>{`
        @keyframes hanaFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @keyframes hanaPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          50% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(16px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes slideInMobile {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes bubbleIn {
          from { opacity: 0; transform: scale(0.8) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-4px); }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .hana-panel-enter {
          animation: fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (max-width: 639px) {
          .hana-panel-enter {
            animation: slideInMobile 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          }
        }
        .hana-bubble-enter {
          animation: bubbleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .hana-category-card {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .hana-category-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.06);
        }
        .hana-question-btn {
          transition: all 0.15s ease;
        }
        .hana-question-btn:hover {
          padding-left: 16px;
          color: hsl(var(--foreground));
        }
        .hana-msg-assistant {
          animation: bubbleIn 0.3s ease-out;
        }
        .hana-msg-user {
          animation: bubbleIn 0.2s ease-out;
        }
        .hana-typing-dot { animation: typingDot 1.4s infinite; }
        .hana-typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .hana-typing-dot:nth-child(3) { animation-delay: 0.4s; }
      `}</style>

      {/* ===== 다시보기 미니 버튼 (숨긴 후) ===== */}
      {isHidden && !isOpen && (
        <button
          onClick={handleShow}
          className="fixed bottom-20 right-5 sm:bottom-24 sm:right-7 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl active:scale-95 cursor-pointer bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
        >
          <img src="/ai-hana-character.png" alt="하나" className="h-6 w-6 object-contain" />
          <span className="text-xs font-bold text-gray-700 dark:text-gray-200">AI 하나</span>
        </button>
      )}

      {/* ===== 플로팅 버튼 ===== */}
      {!isOpen && !isHidden && !hiddenByChannelTalk && (
        <div className="fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-50 flex flex-col items-end gap-2">
          {/* 말풍선 */}
          {showBubble && (
            <div className="hana-bubble-enter relative flex items-center">
              <div className="relative bg-white dark:bg-gray-800 rounded-2xl rounded-br-sm px-4 py-2.5 shadow-lg border border-gray-100 dark:border-gray-700 max-w-[200px]">
                <p className="text-[13px] font-medium text-gray-700 dark:text-gray-200 leading-snug">
                  안녕하세요! 
                  <span className="text-indigo-500 font-bold"> 하나</span>예요 👋
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">무엇이든 물어보세요!</p>
                {/* 말풍선 닫기 */}
                <button
                  onClick={(e) => { e.stopPropagation(); setShowBubble(false); localStorage.setItem('chatbot-bubble-dismissed', 'true'); }}
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center shadow-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <X className="h-3 w-3 text-gray-400" />
                </button>
              </div>
            </div>
          )}
          {/* 캐릭터 버튼 */}
          <button
            onClick={() => setIsOpen(true)}
            className="relative group cursor-pointer"
            style={{ animation: "hanaFloat 3s ease-in-out infinite" }}
            title="AI 어시스턴트 하나"
          >
            {/* 배경 글로우 */}
            <div 
              className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              style={{ 
                background: "radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)",
                transform: "scale(1.5)",
              }} 
            />
            <div className="relative w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-full bg-white dark:bg-gray-800 shadow-xl border-2 border-white dark:border-gray-700 overflow-hidden flex items-center justify-center group-hover:scale-105 group-active:scale-95 transition-transform duration-200"
              style={{ animation: "hanaPulse 3s ease-in-out infinite" }}
            >
              <img 
                src="/ai-hana-character.png" 
                className="h-14 w-14 sm:h-16 sm:w-16 object-cover object-top" 
                alt="AI 하나" 
              />
            </div>
            {/* 숨기기 뱃지 */}
            <button
              onClick={(e) => { e.stopPropagation(); handleHide(); }}
              className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center shadow-sm hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors opacity-0 group-hover:opacity-100"
              title="챗봇 가리기"
            >
              <EyeOff className="h-3 w-3 text-gray-500 dark:text-gray-400" />
            </button>
            {/* 온라인 뱃지 */}
            <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-emerald-400 border-2 border-white dark:border-gray-800" />
          </button>
        </div>
      )}

      {/* ===== 채팅 패널 ===== */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden hana-panel-enter",
            "inset-0 sm:inset-auto sm:bottom-6 sm:right-6",
            "w-full h-full sm:w-[420px] sm:h-[660px] sm:max-h-[calc(100dvh-3rem)]",
            "sm:rounded-2xl bg-white dark:bg-gray-900",
            "shadow-2xl sm:border border-gray-200 dark:border-gray-700/80"
          )}
        >
          {/* ===== 헤더 ===== */}
          <div className="relative shrink-0 overflow-hidden">
            {/* 배경 그라데이션 */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-400" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
            
            <div className="relative px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* 모바일 뒤로가기 */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/15 sm:hidden rounded-full"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                {/* 아바타 */}
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 overflow-hidden flex items-center justify-center">
                    <img src="/ai-hana-character.png" className="h-9 w-9 object-cover object-top" alt="하나" />
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-indigo-500" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-white tracking-tight flex items-center gap-1.5">
                    AI 하나
                    <span className="text-[10px] font-medium bg-white/20 backdrop-blur-sm px-1.5 py-0.5 rounded-full text-white/90">온라인</span>
                  </h3>
                  <p className="text-[11px] text-white/70 font-medium">Millio AI 전문 어시스턴트</p>
                </div>
              </div>
              <div className="flex items-center gap-0.5">
                {messages.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClearHistory}
                    className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/15 rounded-full"
                    title="대화 초기화"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleHide}
                  className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/15 rounded-full"
                  title="챗봇 숨기기"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                  className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/15 rounded-full hidden sm:flex"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* ===== 컨텐츠 영역 ===== */}
          {showCategories && messages.length === 0 ? (
            /* ===== 환영 + 카테고리 ===== */
            <div className="flex-1 overflow-y-auto overscroll-contain bg-gray-50/50 dark:bg-gray-900">
              {/* 캐릭터 인사 */}
              <div className="px-5 pt-6 pb-4 text-center">
                <div className="relative inline-block mb-3">
                  <div className="w-20 h-20 sm:w-24 sm:h-24 mx-auto rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center shadow-lg shadow-indigo-500/10">
                    <img 
                      src="/ai-hana-character.png" 
                      className="h-16 w-16 sm:h-20 sm:w-20 object-contain"
                      alt="AI 하나" 
                    />
                  </div>
                  {/* 스파클 */}
                  <div className="absolute -top-1 -right-1 text-lg">✨</div>
                </div>
                <h4 className="text-lg font-bold text-gray-800 dark:text-gray-100">
                  안녕하세요! <span className="text-indigo-500">하나</span>입니다
                </h4>
                <p className="text-[13px] text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                  Millio AI 사용법, HACCP 관리, 구독 결제 등
                  <br />
                  궁금한 것을 물어보세요!
                </p>
              </div>

              {/* 카테고리 */}
              <div className="px-3 pb-3 space-y-1.5">
                <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider px-2 mb-2">
                  자주 묻는 질문
                </p>
                {quickQuestionCategories.map((cat) => (
                  <div 
                    key={cat.category}
                    className={cn(
                      "rounded-xl overflow-hidden hana-category-card",
                      expandedCategory === cat.category
                        ? "bg-white dark:bg-gray-800 shadow-md border border-gray-100 dark:border-gray-700"
                        : "bg-white dark:bg-gray-800/60 border border-transparent hover:border-gray-100 dark:hover:border-gray-700"
                    )}
                  >
                    <button
                      onClick={() => setExpandedCategory(expandedCategory === cat.category ? null : cat.category)}
                      className="flex w-full items-center justify-between px-3.5 py-3 text-sm"
                    >
                      <span className="flex items-center gap-3">
                        <span 
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-base"
                          style={{ background: `${cat.color}12` }}
                        >
                          {cat.icon}
                        </span>
                        <span className="font-semibold text-[13px] text-gray-700 dark:text-gray-200">{cat.category}</span>
                      </span>
                      <ChevronDown className={cn(
                        "h-4 w-4 text-gray-400 transition-transform duration-200",
                        expandedCategory === cat.category && "rotate-180"
                      )} />
                    </button>
                    {expandedCategory === cat.category && (
                      <div className="px-3 pb-3 space-y-0.5">
                        <div className="h-px bg-gray-100 dark:bg-gray-700 mx-2 mb-2" />
                        {cat.questions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleSendMessage(q)}
                            className="hana-question-btn block w-full text-left px-3 py-2 text-[12.5px] rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 leading-relaxed"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 하단 팁 */}
              <div className="px-4 pb-4">
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 rounded-xl px-4 py-3 text-center border border-indigo-100/50 dark:border-indigo-800/30">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                    💡 위 질문을 선택하거나, 아래 입력창에 직접 질문해 보세요!
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* ===== 채팅 메시지 영역 ===== */
            <div ref={scrollRef} className="flex-1 min-h-0 bg-gray-50/50 dark:bg-gray-900">
              <ScrollArea className="h-full">
                <div className="flex flex-col gap-4 p-4">
                  {displayMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "flex gap-2.5",
                        msg.role === "user" ? "justify-end hana-msg-user" : "justify-start hana-msg-assistant"
                      )}
                    >
                      {/* 하나 아바타 */}
                      {msg.role === "assistant" && (
                        <div className="shrink-0 mt-1">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 overflow-hidden flex items-center justify-center border border-indigo-200/50 dark:border-indigo-700/50">
                            <img src="/ai-hana-character.png" className="h-7 w-7 object-cover object-top" alt="하나" />
                          </div>
                        </div>
                      )}

                      {/* 메시지 말풍선 */}
                      <div className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
                        msg.role === "user" 
                          ? "bg-gradient-to-br from-indigo-500 to-purple-500 text-white rounded-br-md shadow-md shadow-indigo-500/10"
                          : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-bl-md shadow-sm border border-gray-100 dark:border-gray-700"
                      )}>
                        {msg.role === "assistant" ? (
                          <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5">
                            <Streamdown>{msg.content}</Streamdown>
                          </div>
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                      </div>

                      {/* 유저 아바타 */}
                      {msg.role === "user" && (
                        <div className="shrink-0 mt-1">
                          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                            <User className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 로딩 타이핑 인디케이터 */}
                  {isLoading && (
                    <div className="flex gap-2.5 justify-start hana-msg-assistant">
                      <div className="shrink-0 mt-1">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/50 dark:to-purple-900/50 overflow-hidden flex items-center justify-center border border-indigo-200/50 dark:border-indigo-700/50">
                          <img src="/ai-hana-character.png" className="h-7 w-7 object-cover object-top" alt="하나" />
                        </div>
                      </div>
                      <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3.5 shadow-sm border border-gray-100 dark:border-gray-700">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-indigo-400 hana-typing-dot" />
                          <div className="w-2 h-2 rounded-full bg-purple-400 hana-typing-dot" />
                          <div className="w-2 h-2 rounded-full bg-pink-400 hana-typing-dot" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* ===== 상담원 연결 + 입력창 ===== */}
          <div className="shrink-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 px-3 py-2.5">
            {/* 상담원 연결 버튼 */}
            <button
              onClick={() => { setIsOpen(false); setHiddenByChannelTalk(true); openChannelTalk(); }}
              className="w-full flex items-center justify-center gap-2 mb-2 py-2 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-100 dark:border-indigo-800/50"
            >
              <Headphones className="h-3.5 w-3.5" />
              AI로 해결이 안 되나요? 상담원에게 연결하기
            </button>
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const val = inputValue.trim();
                if (val && !isLoading) {
                  handleSendMessage(val);
                  setInputValue("");
                }
              }}
              className="flex items-end gap-2"
            >
              <div className="flex-1 relative">
                <textarea
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      const val = inputValue.trim();
                      if (val && !isLoading) {
                        handleSendMessage(val);
                        setInputValue("");
                      }
                    }
                  }}
                  placeholder="Millio AI에 대해 물어보세요..."
                  rows={1}
                  className="w-full rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:bg-white dark:focus:bg-gray-800 border border-gray-200 dark:border-gray-700 resize-none max-h-24 transition-all text-gray-700 dark:text-gray-200"
                />
              </div>
              <button
                type="submit"
                disabled={!inputValue.trim() || isLoading}
                className={cn(
                  "shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-200",
                  inputValue.trim() && !isLoading
                    ? "bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-md shadow-indigo-500/25 hover:shadow-lg hover:shadow-indigo-500/30 active:scale-95"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
            {/* 브랜딩 */}
            <p className="text-center text-[10px] text-gray-300 dark:text-gray-600 mt-1.5">
              Powered by Millio AI AI
            </p>
          </div>
        </div>
      )}
    </>
  );
}
