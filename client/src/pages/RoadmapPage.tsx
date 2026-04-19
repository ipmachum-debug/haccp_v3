import { motion as _motion } from "framer-motion";
const motion = _motion as any;
import { Link } from "wouter";
import { MillioMark } from "@/components/brand/MillioMark";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  Globe,
  ChefHat,
  Package,
  Factory,
  Building2,
  CakeSlice,
  Rocket,
  Target,
  Brain,
  Users,
} from "lucide-react";

type PhaseStatus = "live" | "inProgress" | "planned";

interface Phase {
  key: string;
  period: string;
  title: string;
  subtitle: string;
  status: PhaseStatus;
  highlights: string[];
  industries?: { icon: React.ComponentType<{ className?: string }>; label: string; note: string }[];
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  bgSoft: string;
}

const phases: Phase[] = [
  {
    key: "phase1",
    period: "Phase 1 · 현재",
    title: "식품 제조 HACCP 특화",
    subtitle: "식품 제조업의 A to Z를 실서비스로 운영 중",
    status: "live",
    icon: ChefHat,
    color: "text-emerald-700",
    bg: "bg-emerald-500",
    bgSoft: "bg-emerald-50 border-emerald-200",
    highlights: [
      "배치 생산관리 · 레시피 · 원가분석",
      "CCP 1B/2B/3B/4P 실시간 모니터링",
      "HACCP 기록지 · 체크리스트 · 인증 서류 자동 생성",
      "LOT 추적 + FEFO 할당 + 회수 시뮬레이션",
      "매입/매출 자동분개 · AP/AR · 재무보고서",
      "AI 비서 '하나' · 지식베이스 RAG · 이상 탐지",
      "거래처 신용관리 · 전자결재 · 변경이력 감사로그",
      "멀티테넌트 · 세션 보안 · 감사 대응",
    ],
    industries: [
      { icon: CakeSlice, label: "디저트·베이커리", note: "운영 중" },
      { icon: Package, label: "HMR·간편식", note: "운영 중" },
      { icon: ChefHat, label: "육가공·식품가공", note: "운영 중" },
    ],
  },
  {
    key: "phase2",
    period: "Phase 2 · 확장 예정",
    title: "화장품 GMP · 건강기능식품",
    subtitle: "업종코드 기반 동적 메뉴 시스템 + GMP 규정 모듈",
    status: "planned",
    icon: Sparkles,
    color: "text-amber-700",
    bg: "bg-amber-500",
    bgSoft: "bg-amber-50 border-amber-200",
    highlights: [
      "가입 시 업종코드 입력 → 메뉴/체크리스트 자동 구성",
      "화장품 GMP 원료·공정·품질 규정 반영",
      "GMP 실사 대응 기록 · 서류 자동 준비",
      "건강기능식품: HACCP + GMP 동시 적용",
      "기능성 원료 추적 · 이력 관리",
      "업종별 AI 비서 '하나' 프롬프트 커스터마이징",
    ],
    industries: [
      { icon: Sparkles, label: "화장품 제조 (GMP)", note: "개발 예정" },
      { icon: CakeSlice, label: "건강기능식품", note: "개발 예정" },
    ],
  },
  {
    key: "phase3",
    period: "Phase 3 · 로드맵",
    title: "일반 제조업 전업종 템플릿",
    subtitle: "제조기반 공통 ERP 위에 업종별 규정 모듈 확장",
    status: "planned",
    icon: Factory,
    color: "text-orange-700",
    bg: "bg-orange-500",
    bgSoft: "bg-orange-50 border-orange-200",
    highlights: [
      "의약품 · 의료기기 (공정 검증 이력 · LOT 유효기간)",
      "전자부품 · 자동차부품 (BOM · 공정 · 품질)",
      "섬유 · 의류 (생산 · 재고 · 발주 · 거래처)",
      "일반 제조 전업종 템플릿 라이브러리",
      "업종별 전용 대시보드 · 리포트",
      "외부 시스템(MES/POS/물류) API 연동",
    ],
    industries: [
      { icon: Package, label: "의약품 · 의료기기", note: "검토 중" },
      { icon: Factory, label: "전자부품 · 일반 제조", note: "로드맵" },
      { icon: Building2, label: "섬유 · 의류 · 기타", note: "로드맵" },
    ],
  },
  {
    key: "phase4",
    period: "Phase 4 · 글로벌",
    title: "해외 진출 · AI Agent 플랫폼",
    subtitle: "공장을 위한 AI 오퍼레이팅 시스템",
    status: "planned",
    icon: Globe,
    color: "text-rose-700",
    bg: "bg-rose-500",
    bgSoft: "bg-rose-50 border-rose-200",
    highlights: [
      "다국어 (영어/일본어/베트남어/태국어)",
      "국가별 회계 · 세무 · 규정 대응",
      "AI Agent — 자율 발주 · 자율 품질 관리",
      "공장간 협업 네트워크 (공급망 AI)",
      "글로벌 SaaS 인프라 (US/EU/APAC)",
      "마켓플레이스 — 업종별 검증 체크리스트 공유",
    ],
  },
];

const statusBadge: Record<PhaseStatus, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  live: {
    label: "현재 운영 중",
    className: "bg-emerald-500 text-white",
    icon: CheckCircle2,
  },
  inProgress: {
    label: "개발 중",
    className: "bg-amber-500 text-white",
    icon: Clock,
  },
  planned: {
    label: "로드맵",
    className: "bg-stone-300 text-stone-700",
    icon: Target,
  },
};

const vision = [
  {
    icon: Brain,
    title: "AI 네이티브",
    desc: "규칙엔진 + LLM + 지식베이스(RAG) 삼중 구조. 데이터 질문, 이상 탐지, 자율 운영 추천까지.",
  },
  {
    icon: Rocket,
    title: "업종 확장",
    desc: "제조기반 공통 ERP 위에 업종별 규정 모듈을 플러그인처럼. 식품 → 화장품 → 일반 제조.",
  },
  {
    icon: Users,
    title: "공장 운영 파트너",
    desc: "소프트웨어가 아니라 공장 운영 파트너. AI가 매일 아침 리포트 · 이상 탐지 · 의사결정 보조.",
  },
];

export default function RoadmapPage() {
  return (
    <div
      className="min-h-screen"
      style={{ background: "#FBF8F3", fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
      `}</style>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-stone-100 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <a className="flex items-center gap-2">
                <MillioMark className="w-8 h-8" />
                <span className="text-lg font-bold text-[#1a1a2e]">
                  Millio<span className="text-orange-500"> AI</span>
                </span>
              </a>
            </Link>
            <span className="text-stone-300">|</span>
            <span className="text-sm font-medium text-stone-500">Product Roadmap</span>
          </div>
          <Link href="/">
            <a className="text-sm text-stone-400 hover:text-orange-500 transition-colors flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> 홈으로
            </a>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-20 pb-12 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-orange-100/40 via-amber-50/30 to-transparent pointer-events-none" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-3xl mx-auto px-5"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-stone-200 rounded-full mb-6 shadow-sm">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-sm font-semibold text-stone-700">Phase 1 — 식품 HACCP · 현재 운영 중</span>
          </div>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] text-[#1a1a2e]"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            공장을 위한
            <br />
            <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 bg-clip-text text-transparent">
              AI 네이티브 ERP
            </span>
          </h1>
          <p className="mt-6 text-lg text-stone-500 max-w-2xl mx-auto leading-relaxed">
            Millio AI는 식품 HACCP에서 시작해 제조업 전반을 커버하는 AI ERP로 확장합니다.
            <br className="hidden sm:inline" />
            아래는 4단계 로드맵입니다.
          </p>
        </motion.div>
      </section>

      {/* Vision */}
      <section className="pb-16 px-5 sm:px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
          {vision.map((v, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="bg-white rounded-2xl p-6 border border-stone-100 shadow-sm"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-orange-100 to-amber-100 rounded-xl flex items-center justify-center mb-4">
                <v.icon className="w-5 h-5 text-orange-600" />
              </div>
              <h3 className="text-base font-bold text-[#1a1a2e] mb-2">{v.title}</h3>
              <p className="text-sm text-stone-500 leading-relaxed">{v.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="pb-24 px-5 sm:px-8">
        <div className="max-w-5xl mx-auto relative">
          {/* Vertical line */}
          <div className="hidden md:block absolute left-8 top-10 bottom-10 w-0.5 bg-gradient-to-b from-emerald-400 via-amber-300 to-rose-300" />

          <div className="space-y-8">
            {phases.map((phase, i) => {
              const status = statusBadge[phase.status];
              const StatusIcon = status.icon;
              const PhaseIcon = phase.icon;

              return (
                <motion.div
                  key={phase.key}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ delay: i * 0.1, duration: 0.6 }}
                  className="relative md:pl-20"
                >
                  {/* Timeline dot */}
                  <div
                    className={`hidden md:flex absolute left-0 top-6 w-16 h-16 ${phase.bg} rounded-2xl items-center justify-center shadow-lg ring-4 ring-[#FBF8F3]`}
                  >
                    <PhaseIcon className="w-7 h-7 text-white" />
                  </div>

                  <div className={`rounded-3xl border-2 ${phase.bgSoft} p-6 md:p-8`}>
                    {/* Mobile icon */}
                    <div className="md:hidden mb-4">
                      <div className={`inline-flex w-12 h-12 ${phase.bg} rounded-xl items-center justify-center`}>
                        <PhaseIcon className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    {/* Header */}
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                      <div>
                        <div className={`text-xs font-bold uppercase tracking-wider ${phase.color} mb-1`}>
                          {phase.period}
                        </div>
                        <h2
                          className="text-2xl sm:text-3xl font-bold text-[#1a1a2e] tracking-tight"
                          style={{ fontFamily: "'Playfair Display', serif" }}
                        >
                          {phase.title}
                        </h2>
                        <p className="mt-2 text-base text-stone-500">{phase.subtitle}</p>
                      </div>
                      <div
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${status.className}`}
                      >
                        <StatusIcon className="w-3.5 h-3.5" />
                        {status.label}
                      </div>
                    </div>

                    {/* Highlights */}
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-6">
                      {phase.highlights.map((h, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm text-stone-600">
                          <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${phase.color}`} />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Industries */}
                    {phase.industries && (
                      <div className="mt-6 pt-5 border-t border-stone-200/60">
                        <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
                          타겟 업종
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {phase.industries.map((ind, k) => (
                            <div
                              key={k}
                              className="inline-flex items-center gap-2 px-3 py-2 bg-white/70 rounded-xl border border-stone-200"
                            >
                              <ind.icon className="w-4 h-4 text-stone-600" />
                              <span className="text-sm font-medium text-stone-700">{ind.label}</span>
                              <span className="text-xs text-stone-400">· {ind.note}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24 px-5 sm:px-8">
        <div className="max-w-4xl mx-auto bg-gradient-to-br from-[#1a1a2e] via-[#2a2040] to-[#1a1a2e] rounded-3xl p-10 md:p-14 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-amber-500/5 to-transparent pointer-events-none" />
          <div className="relative">
            <h2
              className="text-3xl md:text-4xl font-bold text-white tracking-tight"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              오늘의 Millio AI는
              <br />
              <span className="bg-gradient-to-r from-orange-400 via-amber-400 to-rose-400 bg-clip-text text-transparent">
                식품 제조의 완성형입니다
              </span>
            </h2>
            <p className="mt-6 text-base md:text-lg text-stone-300 leading-relaxed">
              Phase 1이 끝나는 게 아닙니다. 이미 실서비스로 100+ 제조업체가 운영 중이며,
              <br className="hidden sm:inline" />
              Phase 2·3·4는 그 위에 계속 쌓입니다.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
              <Link href="/">
                <a className="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#1a1a2e] rounded-full font-semibold hover:scale-105 transition-transform shadow-lg">
                  30일 무료 시작
                </a>
              </Link>
              <Link href="/support">
                <a className="inline-flex items-center gap-2 px-6 py-3 bg-white/10 text-white rounded-full font-semibold hover:bg-white/20 transition-colors border border-white/20">
                  상담 요청
                </a>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
