import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronRight, RefreshCw, Loader2, X, Send,
} from "lucide-react";
import type { Section } from "./types";

// ============================================================================
// AI 관제 센터 전용 인라인 챗봇
// ============================================================================
const INLINE_PRESET: Record<Section, Array<{ label: string; q: string }>> = {
  haccp: [
    { label: "오늘 알림 요약", q: "오늘 위험한 항목이 있어?" },
    { label: "CCP 현황", q: "이번주 CCP 모니터링 요약해줘" },
    { label: "위생점검 누락", q: "최근 위생점검 누락 현황 알려줘" },
    { label: "품질 추이", q: "최근 품질 검사 결과 추이를 분석해줘" },
  ],
  erp: [
    { label: "비용 이상", q: "최근 비용 이상 내역 알려줘" },
    { label: "현금흐름 예측", q: "현금흐름 예측 결과 알려줘" },
    { label: "AP/AR 현황", q: "미수금/미지급금 현황 요약해줘" },
    { label: "월별 손익", q: "이번 달 손익 현황 알려줘" },
  ],
  manage: [
    { label: "시스템 현황", q: "전체 시스템 현황을 요약해줘" },
    { label: "규칙 평가", q: "최근 규칙 평가 결과를 알려줘" },
    { label: "알림 통계", q: "최근 30일 알림 발생 통계 알려줘" },
    { label: "도움말", q: "AI 관제 센터 기능을 설명해줘" },
  ],
};

export function InlineChatbot({
  section,
  greeting,
  expanded,
  onToggle,
}: {
  section: Section;
  greeting: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [message, setMessage] = useState("");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const chatMutation = trpc.ai.chat.useMutation();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, chatMutation.isPending]);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || chatMutation.isPending) return;
    setMessage("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    try {
      const result = await chatMutation.mutateAsync({ message: text, conversationId });
      if (result.conversationId) setConversationId(result.conversationId);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response || "응답을 생성하지 못했습니다." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "오류가 발생했습니다. 다시 시도해주세요." },
      ]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(undefined);
  };

  const presets = INLINE_PRESET[section];

  // 축소 상태: 하나 캐릭터 + 인사말 바
  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        className="group w-full flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-gradient-to-r from-white to-slate-50/80 hover:border-indigo-300 hover:shadow-md transition-all"
      >
        <img
          src="/ai-hana-character.png"
          alt="하나"
          className="w-9 h-9 rounded-full object-cover ring-2 ring-indigo-100 shrink-0"
        />
        <div className="flex-1 text-left">
          <p className="text-[13px] font-medium text-slate-700 group-hover:text-indigo-700 transition-colors">
            {greeting}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-slate-400 group-hover:text-indigo-500 transition-colors">대화하기</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 transition-colors" />
        </div>
      </button>
    );
  }

  // 확장 상태: 인라인 채팅 패널
  return (
    <div className="w-full rounded-xl border border-indigo-200 bg-white shadow-sm overflow-hidden">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/ai-hana-character.png"
            alt="하나"
            className="w-8 h-8 rounded-full object-cover ring-2 ring-white/30"
          />
          <div>
            <p className="text-white text-[13px] font-semibold leading-tight">{greeting}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
            title="새 대화"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggle}
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition"
            title="접기"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 메시지 영역 */}
      <div ref={scrollRef} className="h-[320px] overflow-y-auto p-3 space-y-2 bg-slate-50/50">
        {messages.length === 0 && (
          <div className="flex flex-col items-center pt-6 pb-3">
            <img
              src="/ai-hana-character.png"
              alt="하나"
              className="w-16 h-16 rounded-full object-cover ring-2 ring-indigo-100 mb-3"
            />
            <p className="text-sm font-medium text-slate-700">AI 어시스턴트 하나</p>
            <p className="text-xs text-muted-foreground mt-1 text-center">
              {greeting}
            </p>
            <div className="grid grid-cols-2 gap-1.5 mt-4 w-full max-w-md">
              {presets.map((pq) => (
                <button
                  key={pq.q}
                  onClick={() => { setMessage(pq.q); }}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition text-left"
                >
                  {pq.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <img
                src="/ai-hana-character.png"
                alt="하나"
                className="w-6 h-6 rounded-full object-cover mr-1.5 mt-1 shrink-0 ring-1 ring-indigo-100"
              />
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-md"
                  : "bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm"
              }`}
            >
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
        {chatMutation.isPending && (
          <div className="flex justify-start">
            <img
              src="/ai-hana-character.png"
              alt="하나"
              className="w-6 h-6 rounded-full object-cover mr-1.5 mt-1 shrink-0 ring-1 ring-indigo-100"
            />
            <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-3.5 py-2 shadow-sm flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" />
              <span className="text-xs text-muted-foreground">분석 중...</span>
            </div>
          </div>
        )}
      </div>

      {/* 입력 영역 */}
      <div className="border-t border-slate-200 bg-white p-2.5 flex gap-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="질문을 입력하세요..."
          className="min-h-[36px] max-h-[80px] resize-none text-sm rounded-xl border-slate-200 focus:border-indigo-300"
          rows={1}
        />
        <Button
          onClick={handleSend}
          disabled={!message.trim() || chatMutation.isPending}
          size="sm"
          className="shrink-0 h-9 w-9 p-0 rounded-xl bg-indigo-600 hover:bg-indigo-700"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
