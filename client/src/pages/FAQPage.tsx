import { useState } from "react";
import { motion as _motion, AnimatePresence } from "framer-motion";
const motion = _motion as any;
import {
  ChevronDown, Search, ArrowLeft,
  HelpCircle, CreditCard, Wrench, Rocket, Package, FileText, Users
} from "lucide-react";
import { Link } from "wouter";
import { MillioMark } from "@/components/brand/MillioMark";

const faqData = {
  categories: [
    { id: "all", label: "전체", icon: HelpCircle },
    { id: "getting-started", label: "시작하기", icon: Rocket },
    { id: "pricing", label: "요금", icon: CreditCard },
    { id: "features", label: "기능", icon: Package },
    { id: "technical", label: "기술", icon: Wrench },
    { id: "account", label: "계정", icon: Users },
  ],
  items: [
    { category: "getting-started", q: "도입까지 얼마나 걸리나요?", a: "초기 설정은 30분 내로 완료됩니다. 기존 엑셀 데이터가 있다면 마이그레이션도 지원해 드립니다. 대부분의 고객님이 당일 바로 사용을 시작하십니다." },
    { category: "getting-started", q: "직원들이 사용하기 어렵지 않나요?", a: "Millio AI는 별도 교육 없이도 바로 사용할 수 있도록 직관적인 UI로 설계되었습니다. 모바일에서도 동일하게 사용할 수 있습니다." },
    { category: "getting-started", q: "기존에 사용하던 엑셀 데이터는 어떻게 하나요?", a: "품목 마스터, 거래처 정보, 재고 데이터 등 기존 엑셀 데이터를 시스템으로 마이그레이션하는 것을 도와드립니다. 전담 담당자가 배정됩니다." },
    { category: "getting-started", q: "사용 교육을 제공하나요?", a: "Professional 이상 요금제에서는 1:1 온보딩 교육을 제공합니다. Starter 요금제에서도 온라인 가이드와 영상 튜토리얼을 제공합니다." },
    { category: "pricing", q: "무료 체험 기간에 제한되는 기능이 있나요?", a: "없습니다. 30일 무료 체험 기간 동안 선택하신 요금제의 모든 기능을 제한 없이 사용할 수 있습니다." },
    { category: "pricing", q: "요금제를 변경할 수 있나요?", a: "네, 언제든지 업그레이드하거나 다운그레이드할 수 있습니다. 업그레이드는 즉시 적용되며, 다운그레이드는 다음 결제일부터 적용됩니다." },
    { category: "pricing", q: "결제 방법은 무엇인가요?", a: "신용카드, 계좌이체, 무통장입금을 지원합니다. 연간 결제 시 20% 할인이 적용됩니다." },
    { category: "pricing", q: "환불 정책은 어떻게 되나요?", a: "30일 무료 체험 후 유료 전환 시, 전환일로부터 7일 이내에는 전액 환불이 가능합니다." },
    { category: "features", q: "HACCP 인증 심사에 도움이 되나요?", a: "네, Millio AI에서 기록되는 모든 HACCP 데이터와 체크리스트는 인증 심사에 필요한 형식으로 자동 출력됩니다. 심사 준비 시간이 대폭 줄어듭니다." },
    { category: "features", q: "LOT 추적은 어떻게 작동하나요?", a: "원료 입고 시 LOT 번호가 자동 부여되며, 생산 과정에서 사용된 원료의 LOT이 자동으로 추적됩니다. 문제 발생 시 원료부터 완제품까지 전체 이력을 즉시 확인할 수 있습니다." },
    { category: "features", q: "회계 연동은 어떻게 되나요?", a: "원료 매입, 제품 매출, 재고 변동이 자동으로 회계 데이터로 변환됩니다. 별도 회계 프로그램 없이도 기본적인 재무관리가 가능합니다." },
    { category: "features", q: "문서 자동 출력이 가능한가요?", a: "네, HACCP 기록지, 생산일지, 점검 체크리스트, CCP 기록 등 필요한 문서를 PDF 형태로 자동 생성하고 출력할 수 있습니다." },
    { category: "technical", q: "데이터 보안은 어떻게 관리되나요?", a: "모든 데이터는 SSL 암호화로 전송되며, AWS 클라우드에 안전하게 저장됩니다. 멀티테넌트 구조로 각 조직의 데이터가 완벽히 격리됩니다." },
    { category: "technical", q: "모바일에서 사용할 수 있나요?", a: "네, 반응형 웹으로 설계되어 스마트폰과 태블릿에서도 동일하게 사용할 수 있습니다. 별도 앱 설치가 필요 없습니다." },
    { category: "technical", q: "API 연동이 가능한가요?", a: "Enterprise 요금제에서 RESTful API를 제공합니다. 기존 ERP, POS, 물류 시스템과 연동할 수 있습니다." },
    { category: "account", q: "사용자 수를 추가할 수 있나요?", a: "각 요금제의 기본 사용자 수를 초과하는 경우, 추가 사용자당 월 10,000원(부가세 별도)이 부과됩니다." },
    { category: "account", q: "권한 설정이 가능한가요?", a: "네, 관리자, 작업자, 검수자, 열람자 등 다양한 권한 레벨을 설정할 수 있습니다. 각 사용자별로 접근 가능한 메뉴를 세밀하게 조정할 수 있습니다." },
  ],
};

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [search, setSearch] = useState("");

  const filteredItems = faqData.items.filter((item) => {
    const matchCategory = activeCategory === "all" || item.category === activeCategory;
    const matchSearch = !search || 
      item.q.toLowerCase().includes(search.toLowerCase()) || 
      item.a.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  return (
    <div className="min-h-screen" style={{ background: "#FBF8F3", fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
      `}</style>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-stone-100 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <a className="group flex items-center gap-2.5">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-300/40 to-blue-300/30 rounded-xl blur-md group-hover:blur-lg transition-all" />
                  <MillioMark className="relative w-9 h-9 group-hover:scale-105 transition-transform" />
                </div>
                <span className="text-lg font-bold text-[#1a1a2e] font-serif tracking-tight">Millio<span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent"> AI</span></span>
              </a>
            </Link>
            <span className="text-stone-300">|</span>
            <span className="text-sm font-medium text-stone-500">자주 묻는 질문</span>
          </div>
          <Link href="/">
            <a className="text-sm text-stone-400 hover:text-orange-500 transition-colors flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> 홈으로
            </a>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-16 pb-12 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#1a1a2e] tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            자주 묻는 질문
          </h1>
          <p className="mt-3 text-stone-500">Millio AI에 대해 궁금한 점을 찾아보세요</p>
        </motion.div>

        {/* Search */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }} className="mt-8 max-w-lg mx-auto px-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone-300" />
            <input
              type="text"
              placeholder="질문을 검색하세요..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3.5 bg-white rounded-2xl border border-stone-200 text-[#1a1a2e] placeholder:text-stone-300 focus:outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 transition-all"
            />
          </div>
        </motion.div>
      </section>

      {/* Categories */}
      <div className="max-w-4xl mx-auto px-5 sm:px-8 mb-8">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {faqData.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => { setActiveCategory(cat.id); setOpenIndex(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeCategory === cat.id
                  ? "bg-[#1a1a2e] text-white shadow-lg shadow-stone-900/10"
                  : "bg-white text-stone-500 border border-stone-200 hover:border-orange-200 hover:text-orange-600"
              }`}
            >
              <cat.icon className="w-4 h-4" />
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* FAQ Items */}
      <div className="max-w-4xl mx-auto px-5 sm:px-8 pb-20">
        <div className="space-y-3">
          {filteredItems.map((item, i) => (
            <motion.div
              key={`${item.q}-${i}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-white rounded-2xl border border-stone-100 overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between p-5 sm:p-6 text-left hover:bg-stone-50/50 transition-colors"
              >
                <span className="font-semibold text-[#1a1a2e] pr-4 text-[15px]">{item.q}</span>
                <ChevronDown className={`w-5 h-5 text-stone-400 flex-shrink-0 transition-transform duration-300 ${openIndex === i ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div className="px-5 sm:px-6 pb-5 sm:pb-6 text-stone-600 leading-relaxed text-[15px]">
                      {item.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-16">
            <HelpCircle className="w-12 h-12 text-stone-300 mx-auto mb-4" />
            <p className="text-stone-400">검색 결과가 없습니다</p>
          </div>
        )}

        {/* CTA */}
        <div className="mt-16 text-center bg-white rounded-3xl border border-stone-100 p-10">
          <h3 className="text-xl font-bold text-[#1a1a2e]" style={{ fontFamily: "'Playfair Display', serif" }}>찾으시는 답변이 없나요?</h3>
          <p className="mt-2 text-stone-500">직접 문의해 주시면 빠르게 답변해 드리겠습니다.</p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/support">
              <a className="px-6 py-3 bg-[#1a1a2e] text-white font-semibold rounded-full hover:bg-[#2a2a3e] transition-colors text-sm">
                문의하기
              </a>
            </Link>
            <a href="tel:032-322-9958" className="px-6 py-3 bg-white text-stone-600 font-semibold rounded-full border border-stone-200 hover:border-orange-200 transition-colors text-sm">
              전화 문의: 032-322-9958
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
