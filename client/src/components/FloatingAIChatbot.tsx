import { useState, useEffect, useRef } from "react";
import { AIChatBox, type Message } from "@/components/AIChatBox";
import { trpc } from "@/lib/trpc";
import { MessageCircle, X, Sparkles, Trash2, ChevronDown, ChevronUp, Send, Bot, ArrowLeft, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 카테고리별 빠른 질문
const quickQuestionCategories = [
  {
    category: "시작하기",
    icon: "📖",
    gradient: "from-blue-500/10 to-cyan-500/10",
    borderColor: "border-blue-500/20",
    iconBg: "bg-blue-500/10",
    questions: [
      "HACCP-ONE은 어떤 시스템인가요?",
      "처음 사용하는데 어디서부터 시작하나요?",
      "전체 메뉴 구조를 알려주세요",
      "Today 페이지는 뭔가요?",
    ],
  },
  {
    category: "생산 파이프라인",
    icon: "🔄",
    gradient: "from-emerald-500/10 to-teal-500/10",
    borderColor: "border-emerald-500/20",
    iconBg: "bg-emerald-500/10",
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
    gradient: "from-orange-500/10 to-amber-500/10",
    borderColor: "border-orange-500/20",
    iconBg: "bg-orange-500/10",
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
    gradient: "from-red-500/10 to-rose-500/10",
    borderColor: "border-red-500/20",
    iconBg: "bg-red-500/10",
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
    gradient: "from-violet-500/10 to-purple-500/10",
    borderColor: "border-violet-500/20",
    iconBg: "bg-violet-500/10",
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
    gradient: "from-yellow-500/10 to-lime-500/10",
    borderColor: "border-yellow-500/20",
    iconBg: "bg-yellow-500/10",
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
    gradient: "from-slate-500/10 to-gray-500/10",
    borderColor: "border-slate-500/20",
    iconBg: "bg-slate-500/10",
    questions: [
      "구독 플랜은 어떤 것이 있나요?",
      "GOGOGOPICK 연동 방법",
      "모바일에서도 사용할 수 있나요?",
      "데이터를 엑셀로 내보낼 수 있나요?",
      "오류가 발생했는데 어떻게 하나요?",
    ],
  },
];

// GT Company 브랜드 컬러
const BRAND = {
  navy: "#0F1B2D",
  navyLight: "#1A2A42",
  navyMid: "#152236",
  gold: "#C8A951",
  goldLight: "#D4BC6A",
  goldDark: "#B89A42",
  goldSubtle: "#C8A95120",
};

export default function FloatingAIChatbot() {
  const [isHidden, setIsHidden] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('chatbot-hidden') === 'true';
    }
    return false;
  });
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [showCategories, setShowCategories] = useState(true);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const chatMutation = trpc.ai.chat.useMutation();
  const clearHistoryMutation = trpc.ai.clearHistory.useMutation();

  useEffect(() => {
    if (messages.length > 0) {
      setShowCategories(false);
    }
  }, [messages]);

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
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleSendMessage = async (content: string) => {
    const userMessage: Message = {
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const result = await chatMutation.mutateAsync({
        message: content,
        conversationId,
      });

      if (result.conversationId && !conversationId) {
        setConversationId(result.conversationId);
      }

      const assistantMessage: Message = {
        role: "assistant",
        content: result.response,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "죄송합니다. 오류가 발생했습니다. 다시 시도해주세요.",
      };
      setMessages((prev) => [...prev, errorMessage]);
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

  const toggleCategory = (category: string) => {
    setExpandedCategory(expandedCategory === category ? null : category);
  };

  const handleQuickQuestion = (question: string) => {
    handleSendMessage(question);
  };

  return (
    <>
      <style>{`
        @keyframes softGlow {
          0%, 100% {
            filter: drop-shadow(0 0 8px rgba(200, 169, 81, 0.3)) drop-shadow(0 4px 12px rgba(0,0,0,0.15));
          }
          50% {
            filter: drop-shadow(0 0 16px rgba(200, 169, 81, 0.6)) drop-shadow(0 4px 16px rgba(0,0,0,0.2));
          }
        }
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes slideInMobile {
          from {
            opacity: 0;
            transform: translateY(100%);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .chatbot-panel-enter {
          animation: fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @media (max-width: 639px) {
          .chatbot-panel-enter {
            animation: slideInMobile 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
        }
        .chatbot-category-item {
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .chatbot-category-item:hover {
          transform: translateX(2px);
        }
        .chatbot-question-item {
          transition: all 0.15s ease;
        }
        .chatbot-question-item:hover {
          background: hsl(var(--accent) / 0.6);
          padding-left: 14px;
        }
        .chatbot-header-pattern {
          background-image: radial-gradient(circle at 20% 50%, rgba(200, 169, 81, 0.08) 0%, transparent 50%),
                            radial-gradient(circle at 80% 20%, rgba(200, 169, 81, 0.05) 0%, transparent 40%);
        }
      `}</style>

      {/* 다시보기 버튼 - 챗봇이 숨겨진 상태에서만 표시 (말풍선 모양) */}
      {isHidden && !isOpen && (
        <button
          onClick={handleShow}
          className="fixed bottom-5 right-5 sm:bottom-7 sm:right-7 z-50 flex items-center gap-2 pl-3 pr-3.5 py-2 rounded-2xl rounded-br-sm shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl active:scale-95 cursor-pointer"
          style={{
            background: `linear-gradient(135deg, ${BRAND.gold}18, ${BRAND.gold}08)`,
            border: `1.5px solid ${BRAND.gold}40`,
            boxShadow: `0 4px 16px ${BRAND.gold}15, 0 1px 3px rgba(0,0,0,0.08)`,
            backdropFilter: 'blur(12px)',
          }}
          title="AI 어시스턴트 다시보기"
        >
          <MessageCircle className="h-4 w-4" style={{ color: BRAND.gold }} />
          <span className="text-xs font-bold tracking-tight" style={{ color: BRAND.navy }}>AI 하나</span>
        </button>
      )}

      {/* 플로팅 버튼 */}
      {!isOpen && !isHidden && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-center gap-1">
          {/* 말풍선 + X 닫기 버튼 묶음 */}
          <div className="relative flex items-center gap-0">
            <div
              className="relative px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap shadow-md backdrop-blur-sm"
              style={{ 
                background: `${BRAND.navy}ee`, 
                color: BRAND.gold, 
                border: `1px solid ${BRAND.gold}30`,
                boxShadow: `0 2px 12px ${BRAND.navy}30`
              }}
            >
              무엇이든 물어보세요!
              <div
                className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
                style={{ background: `${BRAND.navy}ee` }}
              />
            </div>
            {/* X 닫기(가리기) 버튼 - 말풍선 오른쪽 상단에 붙임 */}
            <button
              onClick={(e) => { e.stopPropagation(); handleHide(); }}
              className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full transition-all hover:scale-110 active:scale-90"
              style={{
                background: `${BRAND.navy}`,
                border: `1px solid ${BRAND.gold}40`,
                boxShadow: `0 1px 4px rgba(0,0,0,0.2)`,
              }}
              title="챗봇 가리기"
            >
              <X className="h-2.5 w-2.5" style={{ color: BRAND.gold }} />
            </button>
          </div>
          {/* 캐릭터 버튼 */}
          <button
            onClick={() => setIsOpen(true)}
            className="flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group border-0 p-0 cursor-pointer"
            style={{ 
              background: "transparent",
              animation: "softGlow 3s ease-in-out infinite"
            }}
            title="AI 어시스턴트 하나"
          >
            <img 
              src="/chatbot-character-v4.png" 
              className="h-20 w-20 sm:h-24 sm:w-24 object-contain transition-transform group-hover:scale-110" 
              style={{ background: "transparent" }}
              alt="AI 어시스턴트 하나" 
            />
          </button>
        </div>
      )}

      {/* 챗봇 패널 */}
      {isOpen && (
        <div
          className={cn(
            "fixed z-50 flex flex-col shadow-2xl transition-all duration-300 overflow-hidden chatbot-panel-enter",
            // 모바일: 전체 화면 / 데스크톱: 우측 하단 팝업
            "inset-0 sm:inset-auto sm:bottom-6 sm:right-6",
            "w-full h-full sm:w-[420px] sm:h-[650px] sm:max-h-[calc(100dvh-3rem)]",
            "sm:rounded-2xl sm:border",
            "bg-background"
          )}
          style={{ 
            borderColor: "hsl(var(--border))"
          }}
        >
          {/* 헤더 - 고급스러운 그라데이션 + 패턴 */}
          <div
            className="relative flex items-center justify-between px-4 py-3 sm:py-3 text-white shrink-0 chatbot-header-pattern"
            style={{ 
              background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 50%, ${BRAND.navyLight} 100%)`,
              borderBottom: `1px solid ${BRAND.gold}15`
            }}
          >
            <div className="flex items-center gap-3">
              {/* 모바일에서 뒤로가기 버튼 */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 text-white/70 hover:text-white hover:bg-white/10 sm:hidden"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="relative">
                <img 
                  src="/chatbot-character-v4.png" 
                  className="h-9 w-9 object-contain" 
                  alt="AI 어시스턴트 하나" 
                  style={{ background: "transparent" }} 
                />
                {/* 온라인 상태 표시 */}
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2" style={{ borderColor: BRAND.navy }} />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight" style={{ color: BRAND.gold }}>
                  AI 어시스턴트 하나
                </h3>
                <p className="text-[11px] font-medium" style={{ color: `${BRAND.gold}88` }}>
                  항상 도움을 드릴 준비가 되어 있어요
                </p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearHistory}
                  className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 rounded-lg"
                  title="대화 내역 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              {/* 가리기 버튼 */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleHide}
                className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 rounded-lg"
                title="챗봇 가리기"
              >
                <EyeOff className="h-3.5 w-3.5" />
              </Button>
              {/* 데스크톱에서만 닫기 버튼 표시 */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 text-white/60 hover:text-white hover:bg-white/10 rounded-lg hidden sm:flex"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 카테고리별 빠른 질문 (메시지 없을 때) */}
          {showCategories && messages.length === 0 ? (
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {/* 인사말 영역 */}
              <div 
                className="px-5 pt-5 pb-4 text-center"
                style={{ 
                  background: `linear-gradient(180deg, ${BRAND.goldSubtle} 0%, transparent 100%)`
                }}
              >
                <img 
                  src="/chatbot-character-v4.png" 
                  className="mx-auto mb-2.5 h-16 w-16 sm:h-20 sm:w-20 object-contain" 
                  alt="AI 어시스턴트 하나"
                  style={{ background: "transparent" }}
                />
                <h4 className="text-base font-bold text-foreground tracking-tight">
                  안녕하세요! 하나입니다
                </h4>
                <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                  HACCP-ONE 사용법, HACCP 관리, 구독 결제 등
                  <br className="hidden sm:block" />
                  <span className="sm:hidden"> </span>
                  궁금한 것을 물어보세요!
                </p>
              </div>

              {/* 카테고리 목록 */}
              <div className="px-3 pb-4 space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-1 mb-2">
                  자주 묻는 질문
                </p>
                {quickQuestionCategories.map((cat) => (
                  <div 
                    key={cat.category} 
                    className={cn(
                      "rounded-xl border overflow-hidden chatbot-category-item",
                      expandedCategory === cat.category 
                        ? `bg-gradient-to-r ${cat.gradient} ${cat.borderColor}` 
                        : "bg-card border-border/50 hover:border-border"
                    )}
                  >
                    <button
                      onClick={() => toggleCategory(cat.category)}
                      className="flex w-full items-center justify-between px-3.5 py-2.5 text-sm font-medium transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={cn(
                          "text-base w-7 h-7 flex items-center justify-center rounded-lg",
                          expandedCategory === cat.category ? cat.iconBg : "bg-muted/50"
                        )}>
                          {cat.icon}
                        </span>
                        <span className="font-semibold text-[13px]">{cat.category}</span>
                      </span>
                      <ChevronDown className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform duration-200",
                        expandedCategory === cat.category && "rotate-180"
                      )} />
                    </button>
                    {expandedCategory === cat.category && (
                      <div className="px-3 pb-2.5 space-y-0.5">
                        <div className="h-px bg-border/30 mx-1 mb-1.5" />
                        {cat.questions.map((q, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleQuickQuestion(q)}
                            className="chatbot-question-item block w-full text-left px-3 py-2 text-[12.5px] rounded-lg text-muted-foreground hover:text-foreground leading-relaxed"
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 하단 안내 */}
              <div className="px-5 pb-4">
                <div 
                  className="rounded-xl px-4 py-3 text-center"
                  style={{ 
                    background: `linear-gradient(135deg, ${BRAND.navy}08, ${BRAND.gold}08)`,
                    border: `1px solid ${BRAND.gold}15`
                  }}
                >
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    위 질문을 선택하거나, 아래 입력창에 직접 질문을 입력해 보세요.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <AIChatBox
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              placeholder="HACCP-ONE에 대해 무엇이든 물어보세요..."
              emptyStateMessage="안녕하세요! HACCP-ONE AI 어시스턴트 하나입니다. 시스템 사용법이나 HACCP 관련 질문을 해주세요."
              emptyStateIcon={Sparkles}
              suggestedPrompts={[
                "품목 등록은 어떻게 하나요?",
                "CCP 모니터링 방법",
                "재무제표 조회 방법",
              ]}
            />
          )}

          {/* 카테고리 모드일 때 하단 입력창 */}
          {showCategories && messages.length === 0 && (
            <div 
              className="shrink-0 border-t px-3 py-2.5 bg-background/80 backdrop-blur-sm"
              style={{ borderColor: "hsl(var(--border))" }}
            >
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (inputValue.trim()) {
                    handleSendMessage(inputValue.trim());
                    setInputValue("");
                  }
                }}
                className="flex items-center gap-2"
              >
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    placeholder="HACCP-ONE에 대해 무엇이든 물어보세요..."
                    className="w-full rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                  />
                </div>
                <Button
                  type="submit"
                  size="icon"
                  disabled={!inputValue.trim()}
                  className="shrink-0 h-10 w-10 rounded-xl shadow-sm"
                  style={{
                    background: inputValue.trim() 
                      ? `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.navyLight})` 
                      : undefined,
                    color: inputValue.trim() ? BRAND.gold : undefined,
                  }}
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          )}
        </div>
      )}
    </>
  );
}
