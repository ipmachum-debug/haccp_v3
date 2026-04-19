import { useState, useEffect, useRef } from "react";
import { motion as _motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
const motion = _motion as any;
import {
  Factory, ShieldCheck, Package, BarChart3, FileText, Users,
  CheckCircle2, ArrowRight, ChevronDown, Menu, X, Star,
  Zap, Lock, Globe, Clock, TrendingUp, Layers,
  CakeSlice, Beef, UtensilsCrossed, Building2, Truck, ChefHat,
  Play, Quote, ChevronLeft, ChevronRight, Sparkles, Check,
  ArrowUp, ArrowDown, Home
} from "lucide-react";
import { MillioMark } from "@/components/brand/MillioMark";
import ScreenshotCarousel from "./ScreenshotCarousel";


// ─── i18n ───
import { translations } from "./_landing/translations";
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
            <a
              href="/"
              onClick={(e) => { e.preventDefault(); scrollToTop(); }}
              className="group flex items-center gap-2.5 cursor-pointer"
            >
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-orange-300/40 via-amber-200/30 to-blue-200/30 rounded-2xl blur-md group-hover:blur-lg transition-all" />
                <MillioMark className="relative w-11 h-11 group-hover:scale-105 transition-transform" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[22px] font-bold tracking-tight text-[#1a1a2e] font-serif">
                  Millio<span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent"> AI</span>
                </span>
                <span className="text-[10px] text-stone-400 font-semibold tracking-[0.2em] uppercase -mt-0.5">
                  Manufacturing · AI
                </span>
              </div>
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
              <a href="/register" className="text-sm font-semibold px-6 py-2.5 bg-[#1a1a2e] text-white rounded-full hover:bg-[#2a2a3e] transition-all shadow-lg shadow-stone-900/10">
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

              {/* Tagline — emotional anchor */}
              {t.hero.tagline && (
                <motion.p
                  variants={fadeUp}
                  className="mt-5 text-base sm:text-lg font-serif italic text-stone-700"
                >
                  &ldquo;{t.hero.tagline}&rdquo;
                </motion.p>
              )}

              {/* Sub */}
              <motion.p variants={fadeUp} className="mt-5 text-base sm:text-lg text-stone-500 leading-relaxed max-w-lg">
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
                <a href="/login?demo=true" className="w-full sm:w-auto px-7 py-3.5 bg-gradient-to-r from-orange-400 to-amber-500 text-white font-semibold rounded-full hover:from-orange-500 hover:to-amber-600 transition-all shadow-lg shadow-orange-200/40 flex items-center justify-center gap-2 text-[15px]">
                  <Play className="w-4 h-4" /> {lang === "ko" ? "데모 체험하기" : "Try Demo"}
                </a>
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

            {/* Right: Screenshot Carousel */}
            <motion.div initial={{ opacity: 0, y: 30, rotate: 1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} transition={{ delay: 0.3, duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}>
              <div className="relative">
                {/* Glow behind card */}
                <div className="absolute -inset-4 bg-gradient-to-br from-orange-200/40 via-amber-100/30 to-rose-100/20 rounded-3xl blur-2xl" />
                <div className="relative">
                  <ScreenshotCarousel lang={lang} />
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════ STATS (우와 임팩트) ══════ */}
      <section className="py-12 lg:py-16 bg-gradient-to-b from-[#FBF8F3] to-white border-y border-stone-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={stagger}
            className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-10"
          >
            {t.stats.items.map((stat, i) => (
              <motion.div key={i} variants={fadeUp} className="text-center">
                <div className="text-4xl lg:text-6xl font-serif font-bold bg-gradient-to-br from-orange-500 via-amber-500 to-rose-500 bg-clip-text text-transparent tracking-tight">
                  {stat.value}
                </div>
                <div className="mt-2 text-sm lg:text-base font-medium text-stone-500">
                  {stat.label}
                </div>
              </motion.div>
            ))}
          </motion.div>
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
                  app.millioai.com/dashboard
                </div>
              </div>
              <div className="rounded-xl bg-white overflow-hidden">
                {/* Sidebar + Content */}
                <div className="flex h-[500px]">
                  {/* Sidebar */}
                  <div className="w-52 bg-[#1a1a2e] p-4 hidden md:block">
                    <div className="flex items-center gap-2 mb-8">
                      <MillioMark className="w-7 h-7" />
                      <span className="text-sm font-bold text-white">Millio AI</span>
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
            {t.industries.sub && (
              <motion.p variants={fadeUp} className="mt-4 text-lg text-stone-500 max-w-3xl mx-auto">
                {t.industries.sub}
              </motion.p>
            )}
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

          {t.industries.note && (
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="mt-12 text-center"
            >
              <div className="inline-block max-w-3xl px-6 py-4 bg-white border border-amber-100 rounded-2xl">
                <p className="text-sm text-stone-500 leading-relaxed">
                  <span className="font-semibold text-amber-600">🗺️ Roadmap</span>
                  <span className="mx-2 text-stone-300">|</span>
                  {t.industries.note}
                </p>
              </div>
              <div className="mt-5">
                <a
                  href="/roadmap"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1a1a2e] text-white rounded-full font-semibold text-sm hover:bg-[#2a2a3e] transition-all shadow-lg"
                >
                  {lang === "ko" ? "전체 로드맵 보기" : "View Full Roadmap"}
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </motion.div>
          )}
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
                <a href="/register" className={`mt-8 w-full py-3.5 rounded-full font-semibold text-sm transition-all duration-300 block text-center ${
                  plan.popular
                    ? "bg-gradient-to-r from-orange-400 to-amber-500 text-white hover:from-orange-500 hover:to-amber-600 shadow-lg shadow-orange-500/20"
                    : "bg-[#1a1a2e] text-white hover:bg-[#2a2a3e]"
                }`}>
                  {lang === "ko" ? "시작하기" : "Get Started"}
                </a>
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
                <a href="/login?demo=true" className="w-full sm:w-auto px-8 py-4 bg-white/10 text-white font-semibold rounded-full border border-orange-400/40 hover:bg-white/15 hover:border-orange-400/60 transition-all flex items-center justify-center gap-2 text-[15px]">
                  <Play className="w-4 h-4" /> {lang === "ko" ? "데모 체험하기" : "Try Demo"}
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
              <div className="flex items-center gap-3 mb-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-400/30 to-blue-400/20 rounded-2xl blur-md" />
                  <MillioMark className="relative w-11 h-11" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-xl font-bold text-white font-serif tracking-tight">
                    Millio<span className="text-orange-400"> AI</span>
                  </span>
                  <span className="text-[10px] text-stone-500 font-semibold tracking-[0.2em] uppercase -mt-0.5">
                    Manufacturing · AI
                  </span>
                </div>
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
                { title: t.footer.product, links: t.footer.productLinks, hrefs: ["#features", "#pricing", "/roadmap", "#testimonials"] },
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
