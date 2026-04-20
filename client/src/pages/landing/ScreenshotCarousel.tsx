import { useState, useEffect, useCallback } from "react";
import { motion as _motion, AnimatePresence } from "framer-motion";
import { useIndustryLabel } from "@/hooks/useIndustryFeatures";
const motion = _motion as any;
import {
  ChevronLeft, ChevronRight, Factory, ShieldCheck, Package,
  BarChart3, Sparkles, CheckCircle2, TrendingUp, AlertTriangle,
  FileText, Users, Truck, Clock, Layers
} from "lucide-react";

interface ScreenSlide {
  id: string;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  color: string;
  bgGradient: string;
  icon: typeof Factory;
  content: React.ReactNode;
}

// ─── Mock screen contents ───

function DashboardScreen() {
  const L = useIndustryLabel();
  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "금일 생산", value: "2,450 kg", icon: Factory, color: "text-orange-500", bg: "bg-orange-50" },
          { label: "CCP 완료", value: "24/24", icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-50" },
          { label: "재고 품목", value: "1,230", icon: Package, color: "text-blue-500", bg: "bg-blue-50" },
          { label: "출하 대기", value: "8건", icon: Truck, color: "text-violet-500", bg: "bg-violet-50" },
        ].map((c, i) => (
          <div key={i} className="rounded-lg bg-white/80 border border-stone-100 p-2.5">
            <div className={`w-6 h-6 ${c.bg} rounded-md flex items-center justify-center mb-1.5`}>
              <c.icon className={`w-3 h-3 ${c.color}`} />
            </div>
            <div className="text-[10px] text-stone-400">{c.label}</div>
            <div className="text-sm font-bold text-stone-800">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-white/80 border border-stone-100 p-3">
          <div className="text-[10px] text-stone-400 mb-2">주간 생산량</div>
          <div className="flex items-end gap-1 h-16">
            {[45, 62, 38, 75, 55, 82, 68].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: "linear-gradient(to top, #f97316, #fbbf24)", opacity: 0.7 + i * 0.04 }} />
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-white/80 border border-stone-100 p-3">
          <div className="text-[10px] text-stone-400 mb-2">HACCP 준수율</div>
          <div className="flex items-center justify-center h-16">
            <div className="relative w-14 h-14">
              <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                <circle cx="28" cy="28" r="24" fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray={`${2 * Math.PI * 24 * 0.98} ${2 * Math.PI * 24}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-emerald-600">98%</div>
            </div>
          </div>
        </div>
      </div>
      <div className="rounded-lg bg-white/80 border border-stone-100 p-3">
        <div className="text-[10px] text-stone-400 mb-2">최근 알림</div>
        {[
          { text: "배치 #B-2403-012 생산 완료", time: "5분 전", color: "text-emerald-500" },
          { text: "CCP-01 온도 기록 완료", time: "12분 전", color: "text-blue-500" },
          { text: "원재료 재고 부족 경고", time: "30분 전", color: "text-amber-500" },
        ].map((n, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 border-b border-stone-50 last:border-0">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${n.color.replace("text-", "bg-")}`} />
              <span className="text-[10px] text-stone-600">{n.text}</span>
            </div>
            <span className="text-[9px] text-stone-300">{n.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HACCPScreen() {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs font-semibold text-stone-700">CCP 모니터링</div>
        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-medium">
          <CheckCircle2 className="w-3 h-3" /> 전체 정상
        </div>
      </div>
      {[
        { name: "CCP-01 금속검출기", temp: "정상", status: "pass", time: "14:30" },
        { name: "CCP-02 살균온도", temp: "85.2°C", status: "pass", time: "14:25" },
        { name: "CCP-03 냉각온도", temp: "4.8°C", status: "pass", time: "14:20" },
        { name: "CCP-04 X-ray 검출", temp: "정상", status: "pass", time: "14:15" },
      ].map((ccp, i) => (
        <div key={i} className="rounded-lg bg-white/80 border border-stone-100 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-700">{ccp.name}</div>
              <div className="text-[10px] text-stone-400">측정값: {ccp.temp}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-medium">적합</div>
            <div className="text-[9px] text-stone-300 mt-0.5">{ccp.time}</div>
          </div>
        </div>
      ))}
      <div className="rounded-lg bg-white/80 border border-stone-100 p-3">
        <div className="text-[10px] text-stone-400 mb-2">오늘의 체크리스트</div>
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-emerald-100 rounded-full h-2">
            <div className="bg-emerald-500 rounded-full h-2" style={{ width: "85%" }} />
          </div>
          <span className="text-[10px] font-medium text-stone-600">17/20 완료</span>
        </div>
      </div>
    </div>
  );
}

function ProductionScreen() {
  return (
    <div className="p-4 space-y-3">
      <div className="text-xs font-semibold text-stone-700 mb-1">진행 중인 배치</div>
      {[
        { code: "B-2403-012", product: "초코크림 케이크", progress: 78, status: "생산중", qty: "500개" },
        { code: "B-2403-013", product: "딸기 타르트", progress: 45, status: "혼합중", qty: "300개" },
        { code: "B-2403-014", product: "바닐라 쿠키", progress: 100, status: "완료", qty: "1,000개" },
      ].map((b, i) => (
        <div key={i} className="rounded-lg bg-white/80 border border-stone-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[11px] font-semibold text-stone-700">{b.product}</div>
              <div className="text-[10px] text-stone-400">{b.code} · 목표: {b.qty}</div>
            </div>
            <div className={`px-2 py-0.5 rounded-full text-[9px] font-medium ${
              b.progress === 100 ? "bg-emerald-50 text-emerald-600" : "bg-orange-50 text-orange-600"
            }`}>{b.status}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-stone-100 rounded-full h-1.5">
              <div className={`rounded-full h-1.5 transition-all ${b.progress === 100 ? "bg-emerald-500" : "bg-orange-400"}`} style={{ width: `${b.progress}%` }} />
            </div>
            <span className="text-[10px] font-medium text-stone-500">{b.progress}%</span>
          </div>
        </div>
      ))}
      <div className="rounded-lg bg-white/80 border border-stone-100 p-3">
        <div className="text-[10px] text-stone-400 mb-2">투입 원료 현황</div>
        <div className="space-y-1.5">
          {[
            { name: "밀가루 (1등급)", lot: "L-240301", qty: "50kg" },
            { name: "설탕 (백설탕)", lot: "L-240228", qty: "20kg" },
            { name: "버터 (무염)", lot: "L-240302", qty: "15kg" },
          ].map((m, i) => (
            <div key={i} className="flex items-center justify-between text-[10px]">
              <span className="text-stone-600">{m.name}</span>
              <div className="flex items-center gap-3">
                <span className="text-stone-400">{m.lot}</span>
                <span className="font-medium text-stone-700">{m.qty}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AccountingScreen() {
  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "이번 달 매출", value: "32,500,000", unit: "원", color: "text-blue-600", bg: "bg-blue-50" },
          { label: "이번 달 비용", value: "21,200,000", unit: "원", color: "text-rose-600", bg: "bg-rose-50" },
          { label: "순이익", value: "11,300,000", unit: "원", color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map((c, i) => (
          <div key={i} className={`rounded-lg ${c.bg} p-2.5`}>
            <div className="text-[9px] text-stone-400">{c.label}</div>
            <div className={`text-xs font-bold ${c.color} mt-0.5`}>{c.value}</div>
            <div className="text-[9px] text-stone-400">{c.unit}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-white/80 border border-stone-100 p-3">
        <div className="text-[10px] text-stone-400 mb-2">최근 전표</div>
        {[
          { date: "03/28", desc: "원재료 매입 - 밀가루", amount: "-2,500,000", type: "매입" },
          { date: "03/27", desc: "제품 매출 - 디저트류", amount: "+8,200,000", type: "매출" },
          { date: "03/27", desc: "택배 운송비", amount: "-350,000", type: "비용" },
          { date: "03/26", desc: "제품 매출 - 베이커리", amount: "+5,100,000", type: "매출" },
        ].map((t, i) => (
          <div key={i} className="flex items-center justify-between py-1.5 border-b border-stone-50 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-stone-300 w-10">{t.date}</span>
              <span className="text-[10px] text-stone-600">{t.desc}</span>
            </div>
            <span className={`text-[10px] font-semibold ${t.amount.startsWith("+") ? "text-blue-600" : "text-rose-500"}`}>{t.amount}</span>
          </div>
        ))}
      </div>
      <div className="rounded-lg bg-white/80 border border-stone-100 p-3">
        <div className="text-[10px] text-stone-400 mb-2">재무상태표 요약</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "총 자산", value: "156,800,000" },
            { label: "총 부채", value: "42,300,000" },
            { label: "자본", value: "114,500,000" },
          ].map((v, i) => (
            <div key={i}>
              <div className="text-[9px] text-stone-400">{v.label}</div>
              <div className="text-[10px] font-bold text-stone-700">{v.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AIScreen() {
  const L = useIndustryLabel();
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <div className="text-xs font-semibold text-stone-700">AI 비서 '하나'</div>
          <div className="text-[9px] text-stone-400">식품안전 AI 어시스턴트</div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-tr-md bg-[#1a1a2e] text-white px-3 py-2 text-[10px] max-w-[70%]">
            오늘 CCP 점검 현황 알려줘
          </div>
        </div>
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-tl-md bg-white border border-stone-100 px-3 py-2 text-[10px] text-stone-700 max-w-[80%] shadow-sm">
            오늘 CCP 4개 포인트 중 <span className="text-emerald-600 font-semibold">3개 완료</span>, 1개 대기 중입니다.
            <br /><br />
            <span className="text-orange-500 font-medium">CCP-03 냉각온도</span> 기록이 아직 미완료입니다. 14:00까지 기록해 주세요.
          </div>
        </div>
        <div className="flex justify-end">
          <div className="rounded-2xl rounded-tr-md bg-[#1a1a2e] text-white px-3 py-2 text-[10px] max-w-[70%]">
            이번 달 리스크 요약도 보여줘
          </div>
        </div>
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-tl-md bg-white border border-stone-100 px-3 py-2 text-[10px] text-stone-700 max-w-[80%] shadow-sm">
            이번 달 리스크 요약입니다:
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>CCP 이탈: <strong>0건</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <span>체크리스트 누락: <strong>2건</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>{L("material")} 유효기한 경고: <strong>1건</strong></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Slides Data ───

const createSlides = (lang: "ko" | "en"): ScreenSlide[] => [
  {
    id: "dashboard",
    title: "통합 대시보드",
    titleEn: "Integrated Dashboard",
    description: "생산, 재고, HACCP, 회계 데이터를 한 화면에서 확인하세요",
    descriptionEn: "View production, inventory, HACCP, and accounting data in one screen",
    color: "orange",
    bgGradient: "from-orange-50 to-amber-50",
    icon: Layers,
    content: <DashboardScreen />,
  },
  {
    id: "haccp",
    title: "HACCP 모니터링",
    titleEn: "HACCP Monitoring",
    description: "CCP 관리와 체크리스트를 디지털로 기록하고 실시간 모니터링합니다",
    descriptionEn: "Digitally record CCP management and checklists with real-time monitoring",
    color: "emerald",
    bgGradient: "from-emerald-50 to-teal-50",
    icon: ShieldCheck,
    content: <HACCPScreen />,
  },
  {
    id: "production",
    title: "배치 생산관리",
    titleEn: "Batch Production",
    description: "배치 단위 생산 관리와 원료 투입 추적을 한눈에 관리합니다",
    descriptionEn: "Manage batch production and track raw material inputs at a glance",
    color: "blue",
    bgGradient: "from-blue-50 to-indigo-50",
    icon: Factory,
    content: <ProductionScreen />,
  },
  {
    id: "accounting",
    title: "회계 자동 연동",
    titleEn: "Auto Accounting",
    description: "매입·매출 자동 분개, 재무제표, 전표 관리를 통합 제공합니다",
    descriptionEn: "Automated journal entries, financial statements, and voucher management",
    color: "violet",
    bgGradient: "from-violet-50 to-purple-50",
    icon: BarChart3,
    content: <AccountingScreen />,
  },
  {
    id: "ai",
    title: "AI 비서 '하나'",
    titleEn: "AI Assistant 'Hana'",
    description: "AI가 식품안전 리스크를 분석하고 실시간 알림을 제공합니다",
    descriptionEn: "AI analyzes food safety risks and provides real-time alerts",
    color: "purple",
    bgGradient: "from-purple-50 to-pink-50",
    icon: Sparkles,
    content: <AIScreen />,
  },
];

// ─── Main Component ───

export default function ScreenshotCarousel({ lang = "ko" }: { lang?: "ko" | "en" }) {
  const slides = createSlides(lang);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  const goTo = useCallback((idx: number) => {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  }, [current]);

  const next = useCallback(() => {
    setDirection(1);
    setCurrent((p) => (p + 1) % slides.length);
  }, [slides.length]);

  const prev = useCallback(() => {
    setDirection(-1);
    setCurrent((p) => (p - 1 + slides.length) % slides.length);
  }, [slides.length]);

  // Auto-play
  useEffect(() => {
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [next]);

  const slide = slides[current];

  const slideVariants = {
    enter: (d: number) => ({ x: d > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <div className="w-full">
      {/* Browser frame */}
      <div className="relative rounded-2xl bg-white border border-stone-200/60 shadow-2xl shadow-stone-900/8 overflow-hidden">
        {/* Browser bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-stone-50 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-300" />
              <div className="w-3 h-3 rounded-full bg-amber-300" />
              <div className="w-3 h-3 rounded-full bg-emerald-300" />
            </div>
            <div className="ml-3 bg-white rounded-md px-3 py-1 text-xs text-stone-400 border border-stone-100 min-w-[180px]">
              app.millioai.com
            </div>
          </div>
          {/* Tab indicators */}
          <div className="hidden sm:flex items-center gap-1">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => goTo(i)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
                  i === current
                    ? "bg-[#1a1a2e] text-white"
                    : "text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                }`}
              >
                {lang === "ko" ? s.title : s.titleEn}
              </button>
            ))}
          </div>
        </div>

        {/* Content area */}
        <div className="relative min-h-[360px] sm:min-h-[400px] bg-gradient-to-br from-stone-50/50 to-stone-100/30 overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={current}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute inset-0"
            >
              {slide.content}
            </motion.div>
          </AnimatePresence>

          {/* Navigation arrows */}
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 border border-stone-200 shadow-md flex items-center justify-center text-stone-500 hover:text-stone-700 hover:bg-white transition-all z-10"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 border border-stone-200 shadow-md flex items-center justify-center text-stone-500 hover:text-stone-700 hover:bg-white transition-all z-10"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Bottom description bar */}
        <div className="px-4 py-3 bg-white border-t border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${slide.bgGradient} flex items-center justify-center`}>
              <slide.icon className="w-4 h-4 text-stone-600" />
            </div>
            <div>
              <div className="text-xs font-semibold text-stone-700">{lang === "ko" ? slide.title : slide.titleEn}</div>
              <div className="text-[10px] text-stone-400">{lang === "ko" ? slide.description : slide.descriptionEn}</div>
            </div>
          </div>
          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`rounded-full transition-all ${
                  i === current ? "w-5 h-2 bg-[#1a1a2e]" : "w-2 h-2 bg-stone-300 hover:bg-stone-400"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
