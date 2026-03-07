import { useState, useEffect, useRef } from "react";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  Factory, ShieldCheck, Package, BarChart3, FileText, Users,
  CheckCircle2, ArrowRight, ChevronDown, Menu, X, Star,
  Zap, Lock, Globe, Clock, TrendingUp, Layers,
  CakeSlice, Beef, UtensilsCrossed, Building2, Truck, ChefHat,
  Play, Quote, ChevronLeft, ChevronRight, Sparkles, Check,
  ArrowUp, ArrowDown, Home
} from "lucide-react";

// ─── i18n ───
const translations = {
  ko: {
    nav: {
      solution: "솔루션",
      features: "기능",
      industries: "산업",
      pricing: "요금",
      company: "회사",
      login: "로그인",
      demo: "무료 체험 시작",
    },
    hero: {
      badge: "100+ 식품 제조업체가 신뢰하는 플랫폼",
      headline1: "식품 제조 관리,",
      headline2: "이제 진짜 바뀔 시간입니다",
      sub: "엑셀과 수기 HACCP 관리에서 벗어나세요. HACCPONE은 생산관리, HACCP 기록, 재고관리, LOT 추적, 회계까지 하나의 클라우드 플랫폼으로 통합합니다.",
      cta1: "무료 체험 시작하기",
      cta2: "데모 영상 보기",
      trust: "100+ 식품 제조업체가 HACCPONE으로 운영 중",
      trustRating: "4.9/5 고객 만족도",
      bullets: [
        "30분 내 초기 설정 완료",
        "검증된 HACCP 자동 기록 시스템",
        "30일 무료 체험, 언제든 해지 가능",
      ],
    },
    problem: {
      badge: "현실을 직시하세요",
      headline: "매일 같은 일을 반복하고 있진 않으신가요?",
      sub: "식품 제조업체 대표님들이 공통으로 겪는 문제들입니다.",
      quote: "생산일지를 엑셀에 입력하고, HACCP 체크리스트를 수기로 쓰고, 재고는 또 다른 파일에 기록하고... 매일 같은 일의 반복이었어요. 실수가 나도 어디서 잘못된 건지 찾기가 어려웠습니다.",
      quoteAuthor: "— 식품 제조업체 대표",
      cards: [
        { icon: "FileText", title: "엑셀 기반 생산 관리", desc: "생산 데이터가 여러 파일에 분산되어 실시간 관리가 어렵습니다." },
        { icon: "ShieldCheck", title: "수기 HACCP 기록", desc: "체크리스트와 CCP 기록을 수기로 관리하면서 누락과 오류가 발생합니다." },
        { icon: "Package", title: "재고 오류와 불일치", desc: "원료수불과 생산 기록이 분리되어 재고 불일치가 발생합니다." },
        { icon: "TrendingUp", title: "LOT 추적 불가능", desc: "문제 발생 시 제품 생산 이력과 원료 LOT을 추적하기 어렵습니다." },
      ],
    },
    solution: {
      badge: "이렇게 해결됩니다",
      headline: "HACCPONE, 3단계면 충분합니다",
      sub: "복잡한 도입 과정 없이, 오늘 바로 시작할 수 있습니다.",
      steps: [
        { num: "1", title: "시스템 설정", desc: "30분 내 초기 설정을 완료하세요. 기존 엑셀 데이터도 마이그레이션해 드립니다.", color: "amber" },
        { num: "2", title: "운영 시작", desc: "직관적인 UI로 별도 교육 없이도 바로 사용할 수 있습니다. 생산관리부터 시작하세요.", color: "orange" },
        { num: "3", title: "자동화 확인", desc: "생산-재고-HACCP-회계가 자동으로 연결되는 것을 확인하세요. 업무 시간이 50% 줄어듭니다.", color: "rose" },
      ],
    },
    features: {
      badge: "주요 기능",
      headline: "필요한 모든 것, 하나의 플랫폼에서",
      sub: "식품 제조 운영에 필요한 핵심 기능을 하나의 통합 시스템에서 제공합니다.",
      items: [
        { icon: "Factory", title: "배치 생산관리", desc: "제품 생산을 배치 단위로 관리. 투입 원료, 생산량, 생산 기록을 체계적으로 추적합니다." },
        { icon: "ShieldCheck", title: "HACCP 모니터링", desc: "CCP 관리와 HACCP 체크리스트를 디지털로 기록하고 관리합니다. 모든 기록은 자동 저장됩니다." },
        { icon: "Package", title: "LOT 기반 재고", desc: "원료 입고부터 생산, 출고까지 모든 재고 흐름을 LOT 단위로 추적합니다." },
        { icon: "BarChart3", title: "회계 자동 연동", desc: "매입, 매출, 원료 사용 데이터 기반으로 회계 데이터를 자동 생성합니다." },
        { icon: "FileText", title: "문서 자동화", desc: "HACCP 기록지, 체크리스트, 생산 기록 등을 자동 생성하고 출력합니다." },
        { icon: "Users", title: "거래처 관리", desc: "원료 공급업체와 거래처 정보, 발주와 거래 내역을 시스템에서 관리합니다." },
        { icon: "Lock", title: "전자 승인", desc: "문서 검토와 승인을 전자적으로 처리하여 업무 효율을 높입니다." },
        { icon: "Globe", title: "멀티테넌트 SaaS", desc: "조직별 독립된 데이터 관리와 사용자 권한 제어를 제공합니다." },
      ],
    },
    dashboard: {
      badge: "미리 보기",
      headline: "모든 데이터를 한 화면에서",
      sub: "생산 현황, 재고 상태, HACCP 기록, 주요 지표를 한눈에 확인할 수 있도록 설계된 대시보드입니다.",
    },
    testimonials: {
      badge: "고객 후기",
      headline: "실제 사용자의 이야기",
      items: [
        { text: "엑셀로 하던 생산 기록을 HACCPONE으로 전환한 후, 기록 누락이 거의 사라졌습니다. 감사 때도 자료를 바로 출력할 수 있어 너무 편합니다.", author: "김OO 대표", company: "디저트 제조업체", rating: 5 },
        { text: "가장 좋은 건 생산하면 재고가 자동으로 계산되는 거예요. 예전에는 매번 수기로 원료수불을 맞춰야 했는데 이제 그럴 필요가 없어요.", author: "이OO 공장장", company: "HMR 제조업체", rating: 5 },
        { text: "직원들이 별도 교육 없이도 바로 사용할 수 있었습니다. UI가 정말 직관적이에요. 도입 후 업무 시간이 확실히 줄었습니다.", author: "박OO 대표", company: "식품 가공업체", rating: 5 },
        { text: "HACCP 인증 심사 때 필요한 서류를 시스템에서 바로 출력할 수 있어서 준비 시간이 대폭 줄었습니다. 심사관도 인상적이라고 하더군요.", author: "최OO 품질관리팀장", company: "육가공 업체", rating: 5 },
        { text: "여러 시스템을 쓰다가 HACCPONE 하나로 통합했는데, 월 비용도 절약되고 데이터가 한곳에 모이니까 관리가 훨씬 수월합니다.", author: "정OO 대표", company: "프랜차이즈 본사", rating: 5 },
      ],
    },
    industries: {
      badge: "산업별 활용",
      headline: "다양한 식품 제조 산업에서 사용됩니다",
      items: [
        { icon: "CakeSlice", title: "디저트 / 베이커리 제조", desc: "디저트, 베이커리 제조업체의 생산과 HACCP 관리에 최적화되어 있습니다." },
        { icon: "UtensilsCrossed", title: "HMR 제조", desc: "가정간편식(HMR) 생산 공장의 생산 관리와 재고 관리에 활용됩니다." },
        { icon: "Beef", title: "육가공", desc: "육가공 공장의 HACCP 관리와 LOT 추적을 지원합니다." },
        { icon: "ChefHat", title: "식품 가공", desc: "다양한 식품 가공 업체에서 생산과 품질 관리를 위해 사용됩니다." },
        { icon: "Truck", title: "프랜차이즈", desc: "다점포 프랜차이즈의 중앙 식품 관리와 품질 표준화를 지원합니다." },
        { icon: "Building2", title: "클라우드 키친", desc: "공유 주방 운영의 원료 관리와 HACCP 기록을 효율적으로 관리합니다." },
      ],
    },
    pricing: {
      badge: "요금제",
      headline: "합리적인 요금으로 시작하세요",
      sub: "사업 규모에 맞는 요금제를 선택하세요. 모든 요금제에 30일 무료 체험이 포함됩니다.",
      guarantee: "30일 무료 체험 · 언제든 해지 가능 · 모든 요금 부가세 별도",
      plans: [
        {
          name: "Starter",
          price: "100,000",
          unit: "원/월 (부가세 별도)",
          desc: "소규모 제조업체를 위한 기본 플랜",
          features: ["사용자 3명", "기본 생산관리", "재고 관리", "HACCP 기록", "이메일 지원"],
          popular: false,
        },
        {
          name: "Professional",
          price: "290,000",
          unit: "원/월 (부가세 별도)",
          desc: "성장하는 제조업체를 위한 전문 플랜",
          features: ["사용자 10명", "모든 기능 포함", "문서 자동 출력", "승인 워크플로우", "LOT 추적", "우선 지원"],
          popular: true,
        },
        {
          name: "Enterprise",
          price: "맞춤",
          unit: "견적 (부가세 별도)",
          desc: "대규모 제조업체를 위한 맞춤 플랜",
          features: ["무제한 사용자", "기업 맞춤 기능", "전담 지원", "API 연동", "온프레미스 옵션", "SLA 보장"],
          popular: false,
        },
      ],
    },
    faq: {
      badge: "자주 묻는 질문",
      headline: "궁금한 점이 있으신가요?",
      items: [
        { q: "도입까지 얼마나 걸리나요?", a: "초기 설정은 30분 내로 완료됩니다. 기존 엑셀 데이터가 있다면 마이그레이션도 지원해 드립니다. 대부분의 고객님이 당일 바로 사용을 시작하십니다." },
        { q: "직원들이 사용하기 어렵지 않나요?", a: "HACCPONE은 별도 교육 없이도 바로 사용할 수 있도록 직관적인 UI로 설계되었습니다. 모바일에서도 동일하게 사용할 수 있습니다." },
        { q: "기존에 사용하던 엑셀 데이터는 어떻게 하나요?", a: "품목 마스터, 거래처 정보, 재고 데이터 등 기존 엑셀 데이터를 시스템으로 마이그레이션하는 것을 도와드립니다." },
        { q: "HACCP 인증 심사에 도움이 되나요?", a: "네, HACCPONE에서 기록되는 모든 HACCP 데이터와 체크리스트는 인증 심사에 필요한 형식으로 자동 출력됩니다." },
        { q: "무료 체험 기간에 제한되는 기능이 있나요?", a: "없습니다. 30일 무료 체험 기간 동안 선택하신 요금제의 모든 기능을 제한 없이 사용할 수 있습니다." },
      ],
    },
    cta: {
      headline: "지금 시작하면, 내일이 달라집니다",
      sub: "30일 무료 체험으로 HACCPONE을 직접 경험해 보세요. 신용카드 없이 시작할 수 있습니다.",
      btn1: "무료 체험 시작",
      btn2: "상담 요청",
    },
    footer: {
      desc: "식품 제조 운영을 위한 올인원 클라우드 플랫폼",
      product: "제품",
      productLinks: ["기능", "요금", "보안", "업데이트"],
      company: "회사",
      companyLinks: ["소개", "블로그", "채용", "연락처"],
      support: "지원",
      supportLinks: ["문서", "가이드", "FAQ", "문의"],
      legal: "법적 고지",
      legalLinks: ["이용약관", "개인정보처리방침", "환불정책", "SLA 정책", "데이터 보안", "서비스 이용 정책", "데이터 처리 계약", "보안 백서", "데이터 소유권"],
      copyright: "HACCPONE. All rights reserved.",
    },
  },
  en: {
    nav: {
      solution: "Solution",
      features: "Features",
      industries: "Industries",
      pricing: "Pricing",
      company: "Company",
      login: "Log in",
      demo: "Start Free Trial",
    },
    hero: {
      badge: "Trusted by 100+ Food Manufacturers",
      headline1: "Food Manufacturing Management",
      headline2: "That Actually Works",
      sub: "Move beyond spreadsheets and manual HACCP records. HACCPONE integrates production management, HACCP monitoring, inventory control, lot traceability, and accounting into a single cloud platform.",
      cta1: "Start Free Trial",
      cta2: "Watch Demo",
      trust: "100+ food manufacturers run on HACCPONE",
      trustRating: "4.9/5 Customer Satisfaction",
      bullets: [
        "Complete setup in 30 minutes",
        "Proven automated HACCP recording system",
        "30-day free trial, cancel anytime",
      ],
    },
    problem: {
      badge: "Face the Reality",
      headline: "Are You Stuck in the Same Routine Every Day?",
      sub: "These are the common challenges food manufacturers face daily.",
      quote: "Entering production logs in Excel, filling HACCP checklists by hand, recording inventory in yet another file... it was the same routine every day. When mistakes happened, finding what went wrong was nearly impossible.",
      quoteAuthor: "— Food Manufacturer CEO",
      cards: [
        { icon: "FileText", title: "Spreadsheet Management", desc: "Production data scattered across files makes real-time monitoring impossible." },
        { icon: "ShieldCheck", title: "Manual HACCP Records", desc: "Paper-based logs increase the risk of missing records and human errors." },
        { icon: "Package", title: "Inventory Discrepancies", desc: "Disconnected production and material tracking leads to inventory mismatches." },
        { icon: "TrendingUp", title: "No Lot Traceability", desc: "Tracing product history and raw material lots becomes impossible during incidents." },
      ],
    },
    solution: {
      badge: "Here's How It Works",
      headline: "3 Simple Steps to Transform Your Operations",
      sub: "No complex onboarding. Start today and see results immediately.",
      steps: [
        { num: "1", title: "Quick Setup", desc: "Complete initial setup in 30 minutes. We'll help migrate your existing Excel data.", color: "amber" },
        { num: "2", title: "Start Operating", desc: "Intuitive UI requires no training. Start with production management right away.", color: "orange" },
        { num: "3", title: "See Automation", desc: "Watch production, inventory, HACCP, and accounting connect automatically. Save 50% of work time.", color: "rose" },
      ],
    },
    features: {
      badge: "Core Features",
      headline: "Everything You Need, All in One",
      sub: "Core features for food manufacturing operations, delivered in a unified platform.",
      items: [
        { icon: "Factory", title: "Batch Production", desc: "Manage production by batch. Track raw material inputs, outputs, and records systematically." },
        { icon: "ShieldCheck", title: "HACCP Monitoring", desc: "Digitally manage CCP monitoring and HACCP checklists. All records auto-saved securely." },
        { icon: "Package", title: "Lot-Based Inventory", desc: "Track all inventory flow from receiving to production and shipment using lot-based management." },
        { icon: "BarChart3", title: "Accounting Integration", desc: "Auto-generate accounting data based on purchasing, production, and sales transactions." },
        { icon: "FileText", title: "Document Automation", desc: "Auto-generate HACCP reports, inspection logs, production records, and compliance docs." },
        { icon: "Users", title: "Supplier Management", desc: "Manage suppliers, partners, purchase orders, and transaction histories in one system." },
        { icon: "Lock", title: "Approval Workflow", desc: "Process document reviews and approvals electronically for improved efficiency." },
        { icon: "Globe", title: "Multi-Tenant SaaS", desc: "Independent data management and user permission controls per organization." },
      ],
    },
    dashboard: {
      badge: "Preview",
      headline: "See Everything in One Dashboard",
      sub: "Monitor production, inventory, HACCP logs, and operational data in a single unified view.",
    },
    testimonials: {
      badge: "Testimonials",
      headline: "Hear From Our Customers",
      items: [
        { text: "After switching from Excel to HACCPONE, record gaps virtually disappeared. During audits, I can print everything instantly. It's incredibly convenient.", author: "CEO Kim", company: "Dessert Manufacturer", rating: 5 },
        { text: "The best part is automatic inventory calculation when we produce. We used to manually reconcile raw materials every time. Now it's all automated.", author: "Plant Manager Lee", company: "HMR Manufacturer", rating: 5 },
        { text: "Our staff started using it immediately without any training. The UI is truly intuitive. Work hours definitely decreased after adoption.", author: "CEO Park", company: "Food Processor", rating: 5 },
        { text: "During HACCP certification audits, we can print all required documents directly from the system. Preparation time dropped dramatically. Even the auditor was impressed.", author: "QA Manager Choi", company: "Meat Processor", rating: 5 },
        { text: "We consolidated multiple systems into HACCPONE alone. Monthly costs decreased and having all data in one place makes management much easier.", author: "CEO Jung", company: "Franchise HQ", rating: 5 },
      ],
    },
    industries: {
      badge: "Industries",
      headline: "Built for Food Manufacturing Industries",
      items: [
        { icon: "CakeSlice", title: "Dessert & Bakery", desc: "Optimized for dessert, bakery, and confectionery manufacturers." },
        { icon: "UtensilsCrossed", title: "HMR / Ready Meals", desc: "Manage production and inventory for ready-to-eat meal manufacturers." },
        { icon: "Beef", title: "Meat Processing", desc: "Track HACCP compliance and lot traceability in meat processing plants." },
        { icon: "ChefHat", title: "Food Processing", desc: "Suitable for various food processing and manufacturing businesses." },
        { icon: "Truck", title: "Franchise", desc: "Centralized food management and quality standardization for multi-location franchises." },
        { icon: "Building2", title: "Cloud Kitchen", desc: "Efficient raw material and HACCP record management for shared kitchen operations." },
      ],
    },
    pricing: {
      badge: "Pricing",
      headline: "Simple, Transparent Pricing",
      sub: "Choose the plan that fits your business. All plans include a 30-day free trial.",
      guarantee: "30-day free trial · Cancel anytime · All prices exclude VAT",
      plans: [
        {
          name: "Starter",
          price: "$89",
          unit: "/month (excl. VAT)",
          desc: "For small manufacturers getting started",
          features: ["Up to 3 users", "Production management", "Inventory tracking", "HACCP records", "Email support"],
          popular: false,
        },
        {
          name: "Professional",
          price: "$249",
          unit: "/month (excl. VAT)",
          desc: "For growing manufacturers",
          features: ["Up to 10 users", "Full feature access", "Automated documentation", "Approval workflow", "Lot traceability", "Priority support"],
          popular: true,
        },
        {
          name: "Enterprise",
          price: "Custom",
          unit: "pricing (excl. VAT)",
          desc: "For large-scale operations",
          features: ["Unlimited users", "Custom integrations", "Dedicated support", "API access", "On-premise option", "SLA guarantee"],
          popular: false,
        },
      ],
    },
    faq: {
      badge: "FAQ",
      headline: "Got Questions?",
      items: [
        { q: "How long does setup take?", a: "Initial setup completes in 30 minutes. If you have existing Excel data, we'll help migrate it. Most customers start using the system the same day." },
        { q: "Is it difficult for staff to use?", a: "HACCPONE is designed with an intuitive UI that requires no training. It works the same way on mobile devices too." },
        { q: "What about our existing Excel data?", a: "We help migrate your item master, supplier info, inventory data, and other existing Excel data into the system." },
        { q: "Does it help with HACCP certification audits?", a: "Yes. All HACCP data and checklists recorded in HACCPONE are automatically formatted and printable for certification audits." },
        { q: "Are features limited during the free trial?", a: "No. During the 30-day free trial, you have unlimited access to all features in your selected plan." },
      ],
    },
    cta: {
      headline: "Start Today, See Results Tomorrow",
      sub: "Try HACCPONE free for 30 days. No credit card required.",
      btn1: "Start Free Trial",
      btn2: "Talk to Sales",
    },
    footer: {
      desc: "All-in-one cloud platform for food manufacturing operations",
      product: "Product",
      productLinks: ["Features", "Pricing", "Security", "Updates"],
      company: "Company",
      companyLinks: ["About", "Blog", "Careers", "Contact"],
      support: "Support",
      supportLinks: ["Docs", "Guides", "FAQ", "Contact"],
      legal: "Legal",
      legalLinks: ["Terms of Service", "Privacy Policy", "Refund Policy", "SLA", "Data Security", "Acceptable Use", "DPA", "Security Whitepaper", "Data Ownership"],
      copyright: "HACCPONE. All rights reserved.",
    },
  },
};

// ─── Icon Map ───
const iconMap: Record<string, React.ComponentType<any>> = {
  Factory, ShieldCheck, Package, BarChart3, FileText, Users,
  Lock, Globe, TrendingUp, CakeSlice, Beef, UtensilsCrossed,
  Building2, Truck, ChefHat,
};

// ─── Animation variants ───
const fadeUp: Record<string, any> = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] } },
};
const fadeIn: Record<string, any> = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};
const stagger: Record<string, any> = {
  visible: { transition: { staggerChildren: 0.12 } },
};
const scaleIn: Record<string, any> = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
};

type Lang = "ko" | "en";

// ─── Testimonial Carousel ───
function TestimonialCarousel({ items, lang }: { items: any[]; lang: Lang }) {
  const [active, setActive] = useState(0);
  const total = items.length;

  useEffect(() => {
    const timer = setInterval(() => setActive((p) => (p + 1) % total), 6000);
    return () => clearInterval(timer);
  }, [total]);

  return (
    <div className="relative">
      <div className="overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-3xl p-8 md:p-12 shadow-sm border border-stone-100"
          >
            {/* Stars */}
            <div className="flex gap-1 mb-6">
              {Array.from({ length: items[active].rating }).map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
              ))}
            </div>
            <p className="text-lg md:text-xl leading-relaxed text-stone-700 font-serif italic">
              "{items[active].text}"
            </p>
            <div className="mt-8 flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-200 to-orange-300 flex items-center justify-center text-white font-bold text-lg">
                {items[active].author.charAt(0)}
              </div>
              <div>
                <div className="font-semibold text-stone-800">{items[active].author}</div>
                <div className="text-sm text-stone-500">{items[active].company}</div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {/* Navigation dots */}
      <div className="flex items-center justify-center gap-2 mt-8">
        <button onClick={() => setActive((active - 1 + total) % total)} className="p-2 rounded-full hover:bg-stone-100 transition-colors text-stone-400 hover:text-stone-600">
          <ChevronLeft className="w-5 h-5" />
        </button>
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i === active ? "bg-orange-500 w-8" : "bg-stone-300 hover:bg-stone-400"}`}
          />
        ))}
        <button onClick={() => setActive((active + 1) % total)} className="p-2 rounded-full hover:bg-stone-100 transition-colors text-stone-400 hover:text-stone-600">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ─── FAQ Accordion ───
function FAQAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="bg-white rounded-2xl border border-stone-100 overflow-hidden transition-all">
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between p-6 text-left hover:bg-stone-50/50 transition-colors"
          >
            <span className="font-semibold text-stone-800 pr-4">{item.q}</span>
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
                <div className="px-6 pb-6 text-stone-600 leading-relaxed">
                  {item.a}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("ko");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showFloating, setShowFloating] = useState(false);
  const t = translations[lang];

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 20);
      setShowFloating(window.scrollY > 300);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const scrollToBottom = () => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen antialiased" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      {/* ══════ GLOBAL STYLES ══════ */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
        .font-serif { font-family: 'Playfair Display', Georgia, 'Times New Roman', serif; }
        .bg-cream { background-color: #FBF8F3; }
        .bg-cream-dark { background-color: #F5F0E8; }
        .text-warm-black { color: #1a1a2e; }
        .text-warm-gray { color: #6b6b7b; }
        .accent-orange { color: #E8913A; }
        .bg-accent-orange { background-color: #E8913A; }
        .border-cream { border-color: #EDE8DE; }

        /* Smooth scroll */
        html { scroll-behavior: smooth; }

        /* Selection color */
        ::selection {
          background-color: #E8913A;
          color: white;
        }
      `}</style>

      {/* ══════ NAV ══════ */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled ? "bg-[#FBF8F3]/90 backdrop-blur-xl shadow-[0_1px_0_0_#EDE8DE]" : "bg-transparent"}`}>
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo - links to home */}
            <a href="/" onClick={(e) => { e.preventDefault(); scrollToTop(); }} className="flex items-center gap-2.5 hover:opacity-80 transition-opacity cursor-pointer">
              <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200/50">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold tracking-tight text-[#1a1a2e]">
                HACCP<span className="text-orange-500">ONE</span>
              </span>
            </a>

            {/* Desktop nav */}
            <div className="hidden lg:flex items-center gap-8">
              {[
                { label: t.nav.solution, id: "solution" },
                { label: t.nav.features, id: "features" },
                { label: t.nav.industries, id: "industries" },
                { label: t.nav.pricing, id: "pricing" },
              ].map((item) => (
                <button key={item.id} onClick={() => scrollTo(item.id)} className="text-[15px] font-medium text-stone-500 hover:text-[#1a1a2e] transition-colors duration-200">
                  {item.label}
                </button>
              ))}
            </div>

            {/* Right */}
            <div className="hidden lg:flex items-center gap-3">
              <button onClick={() => setLang(lang === "ko" ? "en" : "ko")} className="group flex items-center gap-1.5 text-sm font-semibold pl-3 pr-4 py-2 rounded-full bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/60 text-stone-600 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 hover:text-orange-700 hover:shadow-md hover:shadow-orange-100/50 transition-all duration-300">
                <Globe className="w-4 h-4 text-orange-400 group-hover:text-orange-500 transition-colors" />
                {lang === "ko" ? "English" : "한국어"}
              </button>
              <a href="/login" className="text-[15px] font-medium text-stone-500 hover:text-[#1a1a2e] transition-colors px-4 py-2">
                {t.nav.login}
              </a>
              <a href="#cta" onClick={(e) => { e.preventDefault(); scrollTo("cta"); }} className="text-sm font-semibold px-6 py-2.5 bg-[#1a1a2e] text-white rounded-full hover:bg-[#2a2a3e] transition-all shadow-lg shadow-stone-900/10">
                {t.nav.demo}
              </a>
            </div>

            {/* Mobile menu btn */}
            <button className="lg:hidden p-2 text-stone-600" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="lg:hidden bg-[#FBF8F3] border-b border-[#EDE8DE]">
              <div className="px-5 py-6 space-y-3">
                {["solution", "features", "industries", "pricing"].map((id) => (
                  <button key={id} onClick={() => scrollTo(id)} className="block w-full text-left text-base font-medium text-stone-600 hover:text-orange-600 py-2">
                    {(t.nav as any)[id]}
                  </button>
                ))}
                <div className="pt-4 border-t border-[#EDE8DE] flex items-center gap-3">
                  <button onClick={() => { setLang(lang === "ko" ? "en" : "ko"); setMobileMenuOpen(false); }} className="flex items-center gap-1.5 text-sm font-semibold pl-3 pr-4 py-2 rounded-full bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/60 text-stone-600 hover:from-orange-100 hover:to-amber-100 hover:border-orange-300 hover:text-orange-700 transition-all">
                    <Globe className="w-4 h-4 text-orange-400" />
                    {lang === "ko" ? "English" : "한국어"}
                  </button>
                  <a href="/login" className="text-sm font-medium text-stone-500">{t.nav.login}</a>
                  <a href="#cta" className="text-sm font-semibold px-5 py-2 bg-[#1a1a2e] text-white rounded-full">{t.nav.demo}</a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* ══════ HERO ══════ */}
      <section className="relative pt-28 pb-16 lg:pt-36 lg:pb-28 bg-cream overflow-hidden">
        {/* Warm gradient blobs */}
        <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-gradient-to-bl from-orange-100/60 via-amber-50/40 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-rose-50/40 via-orange-50/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] bg-gradient-to-r from-amber-50/20 to-orange-50/20 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Text content */}
            <motion.div initial="hidden" animate="visible" variants={stagger}>
              {/* Trust badge */}
              <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur border border-stone-200/60 rounded-full mb-8 shadow-sm">
                <div className="flex -space-x-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <span className="text-sm font-medium text-stone-600">{t.hero.badge}</span>
              </motion.div>

              {/* Headline */}
              <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl lg:text-[3.5rem] xl:text-6xl font-serif font-bold leading-[1.15] text-[#1a1a2e] tracking-tight">
                {t.hero.headline1}
                <br />
                <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 bg-clip-text text-transparent">
                  {t.hero.headline2}
                </span>
              </motion.h1>

              {/* Sub */}
              <motion.p variants={fadeUp} className="mt-6 text-base sm:text-lg text-stone-500 leading-relaxed max-w-lg">
                {t.hero.sub}
              </motion.p>

              {/* Bullet points */}
              <motion.div variants={fadeUp} className="mt-6 space-y-2.5">
                {t.hero.bullets.map((bullet, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="text-sm font-medium text-stone-600">{bullet}</span>
                  </div>
                ))}
              </motion.div>

              {/* CTAs */}
              <motion.div variants={fadeUp} className="mt-8 flex flex-col sm:flex-row items-start gap-3">
                <a href="/register" className="w-full sm:w-auto px-7 py-3.5 bg-[#1a1a2e] text-white font-semibold rounded-full hover:bg-[#2a2a3e] transition-all shadow-xl shadow-stone-900/10 hover:shadow-2xl flex items-center justify-center gap-2 text-[15px]">
                  {t.hero.cta1} <ArrowRight className="w-4 h-4" />
                </a>
                <button onClick={() => scrollTo("dashboard")} className="w-full sm:w-auto px-7 py-3.5 bg-white text-stone-700 font-semibold rounded-full border border-stone-200 hover:border-orange-300 hover:text-orange-600 transition-all flex items-center justify-center gap-2 text-[15px]">
                  <Play className="w-4 h-4" /> {t.hero.cta2}
                </button>
              </motion.div>

              {/* Trust line */}
              <motion.div variants={fadeUp} className="mt-8 flex items-center gap-3">
                <div className="flex -space-x-2">
                  {["bg-orange-300", "bg-amber-300", "bg-rose-300", "bg-emerald-300"].map((bg, i) => (
                    <div key={i} className={`w-8 h-8 rounded-full ${bg} border-2 border-[#FBF8F3] flex items-center justify-center text-white text-xs font-bold`}>
                      {String.fromCharCode(65 + i)}
                    </div>
                  ))}
                </div>
                <p className="text-sm text-stone-500">
                  <span className="font-semibold text-stone-700">{t.hero.trustRating}</span>
                </p>
              </motion.div>
            </motion.div>

            {/* Right: Dashboard preview card */}
            <motion.div initial={{ opacity: 0, y: 30, rotate: 1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.3, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}>
              <div className="relative">
                {/* Glow behind card */}
                <div className="absolute -inset-4 bg-gradient-to-br from-orange-200/40 via-amber-100/30 to-rose-100/20 rounded-3xl blur-2xl" />
                <div className="relative rounded-2xl bg-white border border-stone-200/60 shadow-2xl shadow-stone-900/5 overflow-hidden">
                  {/* Browser bar */}
                  <div className="flex items-center gap-2 px-4 py-3 bg-stone-50 border-b border-stone-100">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-300" />
                      <div className="w-3 h-3 rounded-full bg-amber-300" />
                      <div className="w-3 h-3 rounded-full bg-emerald-300" />
                    </div>
                    <div className="ml-3 flex-1 bg-white rounded-md px-3 py-1 text-xs text-stone-400 border border-stone-100">
                      app.haccpone.com
                    </div>
                  </div>
                  {/* Mock dashboard content */}
                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {[
                        { label: lang === "ko" ? "금일 생산" : "Today's Production", value: "2,450 kg", icon: Factory, color: "text-orange-500", bg: "bg-orange-50" },
                        { label: lang === "ko" ? "CCP 완료" : "CCP Complete", value: "24/24", icon: ShieldCheck, color: "text-emerald-500", bg: "bg-emerald-50" },
                        { label: lang === "ko" ? "재고 품목" : "Inventory Items", value: "1,230", icon: Package, color: "text-blue-500", bg: "bg-blue-50" },
                        { label: lang === "ko" ? "출하 대기" : "Pending Shipment", value: "8", icon: Truck, color: "text-violet-500", bg: "bg-violet-50" },
                      ].map((card, i) => (
                        <div key={i} className="rounded-xl bg-stone-50/80 border border-stone-100 p-3.5">
                          <div className={`w-8 h-8 ${card.bg} rounded-lg flex items-center justify-center mb-2`}>
                            <card.icon className={`w-4 h-4 ${card.color}`} />
                          </div>
                          <div className="text-xs text-stone-400 mb-0.5">{card.label}</div>
                          <div className="text-lg font-bold text-[#1a1a2e]">{card.value}</div>
                        </div>
                      ))}
                    </div>
                    {/* Chart mockup */}
                    <div className="rounded-xl bg-stone-50/80 border border-stone-100 p-4 h-36 flex items-end gap-1.5">
                      {[35, 55, 40, 72, 50, 85, 62, 78, 55, 90, 68, 82].map((h, i) => (
                        <div key={i} className="flex-1 rounded-t-sm transition-all" style={{ height: `${h}%`, background: `linear-gradient(to top, #f97316, #fbbf24)`, opacity: 0.75 + (i * 0.02) }} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════ PROBLEM ══════ */}
      <section className="py-20 lg:py-28 bg-white" id="problem">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="text-center mb-16">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-100 rounded-full mb-6">
              <span className="text-sm font-semibold text-red-500">{t.problem.badge}</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-bold text-[#1a1a2e] tracking-tight leading-tight">
              {t.problem.headline}
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-lg text-stone-500 max-w-2xl mx-auto">
              {t.problem.sub}
            </motion.p>
          </motion.div>

          {/* Quote */}
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="max-w-3xl mx-auto mb-16">
            <div className="relative bg-[#FBF8F3] rounded-3xl p-8 md:p-12 border border-stone-100">
              <Quote className="w-10 h-10 text-orange-300 mb-4" />
              <p className="text-lg md:text-xl text-stone-600 leading-relaxed font-serif italic">
                {t.problem.quote}
              </p>
              <p className="mt-6 text-sm font-semibold text-stone-400">{t.problem.quoteAuthor}</p>
            </div>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {t.problem.cards.map((card, i) => {
              const Icon = iconMap[card.icon] || FileText;
              return (
                <motion.div key={i} variants={fadeUp} className="bg-[#FBF8F3] rounded-2xl p-6 border border-stone-100 hover:border-red-200 hover:shadow-xl hover:shadow-red-50 transition-all duration-300 group">
                  <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-red-100 transition-colors">
                    <Icon className="w-6 h-6 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1a1a2e] mb-2">{card.title}</h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{card.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ══════ SOLUTION (3 Steps) ══════ */}
      <section className="py-20 lg:py-28 bg-cream" id="solution">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="text-center mb-16">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-100 rounded-full mb-6">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-600">{t.solution.badge}</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-bold text-[#1a1a2e] tracking-tight leading-tight">
              {t.solution.headline}
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-lg text-stone-500 max-w-2xl mx-auto">
              {t.solution.sub}
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {t.solution.steps.map((step, i) => {
              const colors: Record<string, { ring: string; bg: string; num: string }> = {
                amber: { ring: "ring-amber-200", bg: "bg-amber-50", num: "bg-gradient-to-br from-amber-400 to-orange-500" },
                orange: { ring: "ring-orange-200", bg: "bg-orange-50", num: "bg-gradient-to-br from-orange-400 to-rose-500" },
                rose: { ring: "ring-rose-200", bg: "bg-rose-50", num: "bg-gradient-to-br from-rose-400 to-pink-500" },
              };
              const c = colors[step.color] || colors.amber;
              return (
                <motion.div key={i} variants={fadeUp} className={`relative bg-white rounded-3xl p-8 border border-stone-100 hover:shadow-xl transition-all duration-300`}>
                  {/* Step number */}
                  <div className={`w-14 h-14 ${c.num} rounded-2xl flex items-center justify-center text-white font-serif font-bold text-2xl shadow-lg mb-6`}>
                    {step.num}
                  </div>
                  <h3 className="text-xl font-bold text-[#1a1a2e] mb-3">{step.title}</h3>
                  <p className="text-stone-500 leading-relaxed">{step.desc}</p>
                  {/* Decorative connector line (not on last) */}
                  {i < 2 && (
                    <div className="hidden md:block absolute top-10 -right-4 lg:-right-5 w-8 lg:w-10">
                      <ArrowRight className="w-6 h-6 text-stone-300" />
                    </div>
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ══════ FEATURES ══════ */}
      <section className="py-20 lg:py-28 bg-white" id="features">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="text-center mb-16">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-100 rounded-full mb-6">
              <Layers className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-semibold text-orange-600">{t.features.badge}</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-bold text-[#1a1a2e] tracking-tight leading-tight">
              {t.features.headline}
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-lg text-stone-500 max-w-2xl mx-auto">
              {t.features.sub}
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {t.features.items.map((item, i) => {
              const Icon = iconMap[item.icon] || Layers;
              const accentColors = [
                { icon: "text-orange-500", bg: "bg-orange-50", hover: "hover:border-orange-200" },
                { icon: "text-emerald-500", bg: "bg-emerald-50", hover: "hover:border-emerald-200" },
                { icon: "text-blue-500", bg: "bg-blue-50", hover: "hover:border-blue-200" },
                { icon: "text-violet-500", bg: "bg-violet-50", hover: "hover:border-violet-200" },
                { icon: "text-rose-500", bg: "bg-rose-50", hover: "hover:border-rose-200" },
                { icon: "text-amber-500", bg: "bg-amber-50", hover: "hover:border-amber-200" },
                { icon: "text-indigo-500", bg: "bg-indigo-50", hover: "hover:border-indigo-200" },
                { icon: "text-teal-500", bg: "bg-teal-50", hover: "hover:border-teal-200" },
              ];
              const ac = accentColors[i % accentColors.length];
              return (
                <motion.div key={i} variants={fadeUp} className={`bg-[#FBF8F3] rounded-2xl p-6 border border-stone-100 ${ac.hover} hover:shadow-xl transition-all duration-300 group cursor-default`}>
                  <div className={`w-12 h-12 ${ac.bg} rounded-2xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className={`w-6 h-6 ${ac.icon}`} />
                  </div>
                  <h3 className="text-[17px] font-bold text-[#1a1a2e] mb-2">{item.title}</h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{item.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ══════ DASHBOARD PREVIEW ══════ */}
      <section className="py-20 lg:py-28 bg-cream" id="dashboard">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="text-center mb-16">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-violet-50 border border-violet-100 rounded-full mb-6">
              <span className="text-sm font-semibold text-violet-600">{t.dashboard.badge}</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-bold text-[#1a1a2e] tracking-tight leading-tight">
              {t.dashboard.headline}
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-lg text-stone-500 max-w-2xl mx-auto">
              {t.dashboard.sub}
            </motion.p>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }} className="relative">
            {/* Glow */}
            <div className="absolute -inset-6 bg-gradient-to-r from-orange-100/50 via-amber-100/30 to-rose-100/40 rounded-[2rem] blur-3xl" />
            <div className="relative rounded-2xl bg-[#1a1a2e] p-2 shadow-2xl shadow-stone-900/20">
              <div className="flex items-center gap-2 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="ml-3 flex-1 bg-white/10 rounded-md px-3 py-1 text-xs text-stone-400">
                  app.haccpone.com/dashboard
                </div>
              </div>
              <div className="rounded-xl bg-white overflow-hidden">
                {/* Sidebar + Content */}
                <div className="flex h-[500px]">
                  {/* Sidebar */}
                  <div className="w-52 bg-[#1a1a2e] p-4 hidden md:block">
                    <div className="flex items-center gap-2 mb-8">
                      <div className="w-7 h-7 bg-gradient-to-br from-orange-400 to-amber-500 rounded-lg flex items-center justify-center">
                        <ShieldCheck className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-sm font-bold text-white">HACCPONE</span>
                    </div>
                    {[
                      { icon: BarChart3, label: lang === "ko" ? "대시보드" : "Dashboard", active: true },
                      { icon: Factory, label: lang === "ko" ? "생산관리" : "Production", active: false },
                      { icon: ShieldCheck, label: "HACCP", active: false },
                      { icon: Package, label: lang === "ko" ? "재고관리" : "Inventory", active: false },
                      { icon: BarChart3, label: lang === "ko" ? "회계" : "Accounting", active: false },
                      { icon: FileText, label: lang === "ko" ? "문서" : "Documents", active: false },
                      { icon: Users, label: lang === "ko" ? "거래처" : "Suppliers", active: false },
                    ].map((item, i) => (
                      <div key={i} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 transition-colors ${item.active ? "bg-orange-500/15 text-orange-300" : "text-stone-400 hover:text-stone-300"}`}>
                        <item.icon className="w-4 h-4" />
                        <span className="text-xs font-medium">{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Main */}
                  <div className="flex-1 p-5 bg-stone-50/80">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                      {[
                        { label: lang === "ko" ? "금일 생산" : "Today", val: "2,450 kg", change: "+12%", up: true },
                        { label: lang === "ko" ? "CCP 완료" : "CCP Done", val: "24/24", change: "100%", up: true },
                        { label: lang === "ko" ? "재고 품목" : "Items", val: "1,230", change: "-3", up: false },
                        { label: lang === "ko" ? "출하 대기" : "Pending", val: "8", change: "+2", up: true },
                      ].map((c, i) => (
                        <div key={i} className="bg-white rounded-xl p-4 border border-stone-100">
                          <div className="text-xs text-stone-400 mb-1">{c.label}</div>
                          <div className="text-xl font-bold text-[#1a1a2e]">{c.val}</div>
                          <div className={`text-xs mt-1 font-medium ${c.up ? "text-emerald-500" : "text-red-400"}`}>{c.change}</div>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="bg-white rounded-xl border border-stone-100 p-4">
                        <div className="text-sm font-semibold text-[#1a1a2e] mb-4">{lang === "ko" ? "주간 생산량" : "Weekly Production"}</div>
                        <div className="flex items-end gap-2 h-32">
                          {[60, 45, 80, 55, 90, 70, 85].map((h, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                              <div className="w-full rounded-t-sm" style={{ height: `${h}%`, background: "linear-gradient(to top, #f97316, #fbbf24)" }} />
                              <span className="text-[10px] text-stone-400">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-white rounded-xl border border-stone-100 p-4">
                        <div className="text-sm font-semibold text-[#1a1a2e] mb-4">{lang === "ko" ? "HACCP 점검 현황" : "HACCP Status"}</div>
                        <div className="space-y-3">
                          {[
                            { label: lang === "ko" ? "금속검출" : "Metal Detection", pct: 100, color: "bg-emerald-500" },
                            { label: lang === "ko" ? "온도관리" : "Temperature", pct: 96, color: "bg-orange-500" },
                            { label: lang === "ko" ? "위생점검" : "Hygiene", pct: 92, color: "bg-amber-500" },
                            { label: lang === "ko" ? "살균공정" : "Sterilization", pct: 100, color: "bg-emerald-500" },
                          ].map((item, i) => (
                            <div key={i}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-stone-500">{item.label}</span>
                                <span className="font-semibold text-stone-700">{item.pct}%</span>
                              </div>
                              <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${item.pct}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══════ TESTIMONIALS ══════ */}
      <section className="py-20 lg:py-28 bg-white" id="testimonials">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="text-center mb-16">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-100 rounded-full mb-6">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-sm font-semibold text-amber-600">{t.testimonials.badge}</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-bold text-[#1a1a2e] tracking-tight leading-tight">
              {t.testimonials.headline}
            </motion.h2>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp} className="max-w-3xl mx-auto">
            <TestimonialCarousel items={t.testimonials.items} lang={lang} />
          </motion.div>
        </div>
      </section>

      {/* ══════ INDUSTRIES ══════ */}
      <section className="py-20 lg:py-28 bg-cream" id="industries">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="text-center mb-16">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-100 rounded-full mb-6">
              <span className="text-sm font-semibold text-amber-600">{t.industries.badge}</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-bold text-[#1a1a2e] tracking-tight leading-tight">
              {t.industries.headline}
            </motion.h2>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {t.industries.items.map((item, i) => {
              const Icon = iconMap[item.icon] || Building2;
              return (
                <motion.div key={i} variants={fadeUp} className="bg-white rounded-2xl p-6 border border-stone-100 hover:border-amber-200 hover:shadow-xl hover:shadow-amber-50 transition-all duration-300 group">
                  <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-amber-100 group-hover:scale-110 transition-all duration-300">
                    <Icon className="w-6 h-6 text-amber-600" />
                  </div>
                  <h3 className="text-lg font-bold text-[#1a1a2e] mb-2">{item.title}</h3>
                  <p className="text-sm text-stone-500 leading-relaxed">{item.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ══════ PRICING ══════ */}
      <section className="py-20 lg:py-28 bg-white" id="pricing">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="text-center mb-16">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-100 rounded-full mb-6">
              <span className="text-sm font-semibold text-orange-600">{t.pricing.badge}</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-bold text-[#1a1a2e] tracking-tight leading-tight">
              {t.pricing.headline}
            </motion.h2>
            <motion.p variants={fadeUp} className="mt-4 text-lg text-stone-500 max-w-2xl mx-auto">
              {t.pricing.sub}
            </motion.p>
            <motion.p variants={fadeUp} className="mt-3 text-sm font-medium text-emerald-600">
              {t.pricing.guarantee}
            </motion.p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {t.pricing.plans.map((plan, i) => (
              <motion.div key={i} variants={fadeUp} className={`relative rounded-3xl p-8 transition-all duration-300 ${
                plan.popular 
                  ? "bg-[#1a1a2e] text-white shadow-2xl shadow-stone-900/20 scale-[1.03] border-2 border-orange-400/30" 
                  : "bg-[#FBF8F3] border border-stone-200 hover:border-orange-200 hover:shadow-xl"
              }`}>
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-5 py-1 bg-gradient-to-r from-orange-400 to-amber-500 text-white text-xs font-bold rounded-full shadow-lg">
                    {lang === "ko" ? "가장 인기" : "Most Popular"}
                  </div>
                )}
                <h3 className={`text-lg font-bold ${plan.popular ? "text-orange-300" : "text-stone-500"}`}>{plan.name}</h3>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-serif font-bold">{plan.price}</span>
                  <span className={`text-sm ${plan.popular ? "text-stone-400" : "text-stone-400"}`}>{plan.unit}</span>
                </div>
                <p className={`mt-2 text-sm ${plan.popular ? "text-stone-400" : "text-stone-400"}`}>{plan.desc}</p>
                <ul className="mt-8 space-y-3">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-3 text-sm">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${plan.popular ? "bg-orange-500/20" : "bg-emerald-50"}`}>
                        <Check className={`w-3 h-3 ${plan.popular ? "text-orange-300" : "text-emerald-500"}`} />
                      </div>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button className={`mt-8 w-full py-3.5 rounded-full font-semibold text-sm transition-all duration-300 ${
                  plan.popular 
                    ? "bg-gradient-to-r from-orange-400 to-amber-500 text-white hover:from-orange-500 hover:to-amber-600 shadow-lg shadow-orange-500/20" 
                    : "bg-[#1a1a2e] text-white hover:bg-[#2a2a3e]"
                }`}>
                  {lang === "ko" ? "시작하기" : "Get Started"}
                </button>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════ FAQ ══════ */}
      <section className="py-20 lg:py-28 bg-cream" id="faq">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={stagger} className="text-center mb-16">
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-2 bg-stone-100 border border-stone-200 rounded-full mb-6">
              <span className="text-sm font-semibold text-stone-600">{t.faq.badge}</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-[2.75rem] font-serif font-bold text-[#1a1a2e] tracking-tight leading-tight">
              {t.faq.headline}
            </motion.h2>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-80px" }} variants={fadeUp}>
            <FAQAccordion items={t.faq.items} />
          </motion.div>
        </div>
      </section>

      {/* ══════ CTA ══════ */}
      <section className="py-20 lg:py-28 bg-white" id="cta">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }} className="relative rounded-[2rem] bg-[#1a1a2e] p-12 lg:p-20 text-center overflow-hidden">
            {/* Decorative warm shapes */}
            <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-gradient-to-br from-orange-500/15 to-transparent rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-gradient-to-tl from-amber-500/10 to-transparent rounded-full blur-3xl" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-orange-500/5 to-rose-500/5 rounded-full blur-3xl" />

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-white tracking-tight leading-tight">
                {t.cta.headline}
              </h2>
              <p className="mt-5 text-lg text-stone-400 max-w-xl mx-auto leading-relaxed">
                {t.cta.sub}
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href="/register" className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-orange-400 to-amber-500 text-white font-semibold rounded-full hover:from-orange-500 hover:to-amber-600 transition-all shadow-xl shadow-orange-500/20 flex items-center justify-center gap-2 text-[15px]">
                  {t.cta.btn1} <ArrowRight className="w-4 h-4" />
                </a>
                <a href="/support" className="w-full sm:w-auto px-8 py-4 bg-white/5 text-white font-semibold rounded-full border border-white/15 hover:bg-white/10 transition-all flex items-center justify-center text-[15px]">
                  {t.cta.btn2}
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ══════ FOOTER ══════ */}
      <footer className="bg-[#1a1a2e] text-stone-400 py-16">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
            {/* Brand + Company Info */}
            <div className="md:col-span-5">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-9 h-9 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold text-white">
                  HACCP<span className="text-orange-400">ONE</span>
                </span>
              </div>
              <p className="text-sm leading-relaxed mb-6">{t.footer.desc}</p>
              
              {/* Company Details */}
              <div className="space-y-2 text-xs text-stone-500">
                <p className="text-stone-300 font-semibold text-sm">주식회사 골든터틀컴퍼니</p>
                <p>대표자: 이정언</p>
                <p>인천광역시 서구 원창로89번길 14-7 (원창동) 3층 301호</p>
                <p>사업자등록번호: 603-81-93743</p>
                <p>통신판매업 신고번호: 2025-인천서구-3547</p>
                <div className="pt-2 space-y-1">
                  <p>상담/주문 전화: <a href="tel:032-322-9958" className="text-stone-400 hover:text-orange-300 transition-colors">032-322-9958</a></p>
                  <p>이메일: <a href="mailto:sokoorymall@naver.com" className="text-stone-400 hover:text-orange-300 transition-colors">sokoorymall@naver.com</a></p>
                  <p>고객센터: 평일 09:00~18:00 (점심 12:00~13:00) / 토·일·공휴일 휴무</p>
                </div>
              </div>
            </div>

            {/* Links */}
            <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-6">
              {[
                { title: t.footer.product, links: t.footer.productLinks, hrefs: ["#features", "#pricing", "#industries", "#testimonials"] },
                { title: t.footer.company, links: t.footer.companyLinks, hrefs: ["#", "#", "#", "#"] },
                { title: t.footer.support, links: t.footer.supportLinks, hrefs: ["#", "#", "/faq", "/support"] },
                { title: t.footer.legal, links: t.footer.legalLinks, hrefs: ["/legal/terms", "/legal/privacy", "/legal/refund", "/legal/sla", "/legal/security", "/legal/aup", "/legal/dpa", "/legal/security-whitepaper", "/legal/data-ownership"] },
              ].map((col, i) => (
                <div key={i}>
                  <h4 className="text-sm font-semibold text-white mb-4">{col.title}</h4>
                  <ul className="space-y-2.5">
                    {col.links.map((link, j) => (
                      <li key={j}>
                        <a href={col.hrefs?.[j] || "#"} className="text-sm hover:text-orange-300 transition-colors duration-200">{link}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-stone-500">&copy; {new Date().getFullYear()} {t.footer.copyright}</p>
            <div className="flex items-center gap-4">
              <p className="text-xs text-stone-600">개인정보보호책임자: 주식회사 골든터틀컴퍼니</p>
              <button onClick={() => setLang(lang === "ko" ? "en" : "ko")} className="group flex items-center gap-1.5 text-sm font-semibold pl-3 pr-4 py-2 rounded-full bg-white/5 border border-white/15 text-stone-400 hover:bg-orange-500/10 hover:border-orange-400/30 hover:text-orange-300 transition-all duration-300">
                <Globe className="w-4 h-4 text-stone-500 group-hover:text-orange-400 transition-colors" />
                {lang === "ko" ? "English" : "한국어"}
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* ══════ FLOATING BUTTONS ══════ */}
      <AnimatePresence>
        {showFloating && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-6 right-6 z-50 flex flex-col gap-2.5"
          >
            {/* Scroll to top */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={scrollToTop}
              className="w-11 h-11 bg-white/90 backdrop-blur-md border border-stone-200 rounded-full shadow-lg shadow-stone-200/40 flex items-center justify-center text-stone-500 hover:text-orange-500 hover:border-orange-200 hover:shadow-orange-100/40 transition-all duration-200"
              title="맨 위로"
            >
              <ArrowUp className="w-5 h-5" />
            </motion.button>

            {/* Home */}
            <motion.a
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              href="/"
              className="w-11 h-11 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full shadow-lg shadow-orange-200/50 flex items-center justify-center text-white hover:from-orange-500 hover:to-amber-600 transition-all duration-200"
              title="홈으로"
            >
              <Home className="w-5 h-5" />
            </motion.a>

            {/* Scroll to bottom */}
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={scrollToBottom}
              className="w-11 h-11 bg-white/90 backdrop-blur-md border border-stone-200 rounded-full shadow-lg shadow-stone-200/40 flex items-center justify-center text-stone-500 hover:text-orange-500 hover:border-orange-200 hover:shadow-orange-100/40 transition-all duration-200"
              title="맨 아래로"
            >
              <ArrowDown className="w-5 h-5" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
