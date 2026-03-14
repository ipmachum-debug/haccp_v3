import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { getGreetingMessage } from "@/lib/greetings";
import { motion as _motion } from "framer-motion";
const motion = _motion as any;
import { 
  CheckCircle2, 
  Shield, 
  TrendingUp, 
  Package, 
  FileText, 
  Calculator,
  Phone,
  Globe,
  Mail,
  Clock,
  MapPin,
  Factory,
  ShieldCheck,
  BarChart3,
  ArrowRight
} from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const utils = trpc.useUtils();
  
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data: any) => {
      try {
        await utils.auth.me.invalidate();
        await new Promise(resolve => setTimeout(resolve, 300));
        const response = await utils.client.auth.me.query();
        console.log('[Login] User fetched:', response);
        
        const userName = response?.name;
        const greetingMessage = getGreetingMessage(userName);
        toast.success(greetingMessage, { duration: 4000 });
        
        console.log('[Login] User role:', response?.role);
        if (response?.role === 'super_admin') {
          setLocation("/dashboard/super-admin");
        } else if (response?.role === 'employee') {
          setLocation("/board");
        } else {
          setLocation("/dashboard");
        }
      } catch (error) {
        console.error('[Login] Failed to fetch user:', error);
        setLocation("/dashboard");
      }
    },
    onError: (error: any) => {
      console.error('[Login] Login error:', error);
      if (error.message && error.message.includes("승인 대기")) {
        toast.warning("관리자 승인을 기다려주세요.");
        setTimeout(() => { setLocation("/pending-approval"); }, 1000);
      } else {
        toast.error(error.message || "로그인에 실패했습니다.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate({ email, password });
  };

  const mainFeatures = [
    {
      icon: ShieldCheck,
      title: "HACCP 관리",
      description: "CCP 모니터링, 체크리스트, 자동 기록",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      icon: Calculator,
      title: "회계 관리",
      description: "매입/매출 자동 연동, 재무제표",
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      icon: Factory,
      title: "생산 / ERP",
      description: "배치 생산, LOT 추적, 재고 관리",
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
  ];

  const quickFeatures = [
    { icon: CheckCircle2, text: "CCP 실시간 모니터링" },
    { icon: TrendingUp, text: "재무제표 자동 생성" },
    { icon: FileText, text: "배치 생산 관리" },
    { icon: Package, text: "재고 자동 연동" },
  ];

  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: "linear-gradient(135deg, #FBF8F3 0%, #FFF8F0 50%, #FEF3E2 100%)" }}>
      {/* Global font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
      `}</style>

      {/* Animated background blobs - Gradient Blob 1 (좌상단) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
            x: [0, 50, 0],
            y: [0, -30, 0],
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-20 -left-20 w-[600px] h-[600px] bg-gradient-to-br from-orange-300/50 to-amber-200/35 rounded-full blur-3xl"
        />
        {/* Gradient Blob 2 (우측) */}
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [360, 180, 0],
            x: [0, -40, 0],
            y: [0, 40, 0],
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/4 -right-10 w-[550px] h-[550px] bg-gradient-to-bl from-rose-300/40 to-orange-200/30 rounded-full blur-3xl"
        />
        {/* Gradient Blob 3 (하단) */}
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            rotate: [0, -180, -360],
            x: [0, 30, 0],
            y: [0, -40, 0],
          }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-10 left-1/4 w-[550px] h-[550px] bg-gradient-to-tr from-amber-300/35 to-orange-100/25 rounded-full blur-3xl"
        />
        {/* Gradient Blob 4 (중앙) */}
        <motion.div
          animate={{
            scale: [1.1, 0.9, 1.1],
            x: [0, -50, 0],
            y: [0, 30, 0],
          }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-gradient-to-br from-yellow-200/30 to-rose-200/25 rounded-full blur-3xl"
        />

        {/* 둥~둥~ 떠다니는 플로팅 원형 장식 (눈에 보이는 크기) */}
        {[
          { size: 80, x: '8%', y: '15%', color: 'from-orange-300/30 to-amber-200/20', dur: 12, dx: 40, dy: -30, delay: 0 },
          { size: 60, x: '75%', y: '20%', color: 'from-rose-300/25 to-orange-200/15', dur: 15, dx: -35, dy: 45, delay: 2 },
          { size: 100, x: '50%', y: '70%', color: 'from-amber-300/20 to-yellow-200/15', dur: 18, dx: 50, dy: -40, delay: 1 },
          { size: 50, x: '20%', y: '60%', color: 'from-orange-200/35 to-rose-200/20', dur: 10, dx: -30, dy: 35, delay: 3 },
          { size: 70, x: '85%', y: '55%', color: 'from-yellow-200/25 to-amber-100/15', dur: 14, dx: -45, dy: -25, delay: 0.5 },
          { size: 45, x: '40%', y: '10%', color: 'from-rose-200/30 to-orange-100/20', dur: 11, dx: 25, dy: 40, delay: 4 },
          { size: 90, x: '65%', y: '80%', color: 'from-orange-300/20 to-amber-200/10', dur: 16, dx: -40, dy: -50, delay: 1.5 },
          { size: 55, x: '15%', y: '85%', color: 'from-amber-200/30 to-yellow-100/20', dur: 13, dx: 35, dy: -35, delay: 2.5 },
        ].map((b, i) => (
          <motion.div
            key={`float-${i}`}
            animate={{
              y: [0, b.dy, 0],
              x: [0, b.dx, 0],
              scale: [1, 1.1, 1],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{
              duration: b.dur,
              repeat: Infinity,
              ease: "easeInOut",
              delay: b.delay,
            }}
            className={`absolute rounded-full bg-gradient-to-br ${b.color} backdrop-blur-sm border border-white/20`}
            style={{
              left: b.x,
              top: b.y,
              width: b.size,
              height: b.size,
            }}
          />
        ))}

        {/* Floating Particles (15개) - 작은 점들 */}
        {[...Array(15)].map((_, i) => {
          const colors = [
            'rgba(251, 146, 60, 0.5)',
            'rgba(245, 158, 11, 0.45)',
            'rgba(251, 113, 133, 0.4)',
            'rgba(250, 204, 21, 0.45)',
            'rgba(253, 186, 116, 0.5)',
          ];
          return (
            <motion.div
              key={`particle-${i}`}
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0, 0.8, 0],
                x: [0, (Math.random() - 0.5) * 300, 0],
                y: [0, (Math.random() - 0.5) * 300, 0],
                scale: [0.5, 1.5, 0.5],
              }}
              transition={{
                duration: Math.random() * 6 + 6,
                repeat: Infinity,
                delay: Math.random() * 4,
                ease: "easeInOut",
              }}
              className="absolute rounded-full"
              style={{
                left: `${10 + Math.random() * 80}%`,
                top: `${10 + Math.random() * 80}%`,
                width: `${Math.random() * 8 + 4}px`,
                height: `${Math.random() * 8 + 4}px`,
                background: colors[i % colors.length],
                boxShadow: `0 0 ${Math.random() * 12 + 6}px ${colors[i % colors.length]}`,
              }}
            />
          );
        })}
      </div>

      {/* Left Side - Branding & Features */}
      <motion.div 
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="hidden lg:flex lg:w-[55%] p-10 xl:p-14 flex-col justify-between relative z-10"
      >
        <div className="max-w-xl">
          {/* Company Info Header */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.5 }}
            className="mb-10"
          >
            <div className="flex items-center gap-3.5 mb-8">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-orange-200/60">
                <ShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-stone-700 text-sm font-semibold">주식회사 골든터틀컴퍼니</h3>
                <div className="flex items-center gap-3 text-stone-400 text-xs mt-0.5">
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span>032-322-9958</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    <a href="http://www.goldenturtle.co.kr" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500 transition-colors">
                      goldenturtle.co.kr
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <h1 className="text-[2.75rem] xl:text-5xl font-bold leading-[1.15] tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              <span className="text-[#1a1a2e]">통합 관리 시스템</span>
              <br />
              <span className="text-[#1a1a2e]">HACCP</span>
              <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent">ONE</span>
            </h1>
            <p className="mt-4 text-lg text-stone-500" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
              식품 안전부터 회계까지, 하나의 플랫폼으로
            </p>
          </motion.div>

          {/* Main Feature Cards */}
          <div className="grid gap-3 mb-8">
            {mainFeatures.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                className="group relative overflow-hidden rounded-2xl bg-white/70 backdrop-blur-sm border border-stone-100 p-5 hover:bg-white hover:shadow-lg hover:shadow-stone-100/80 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-11 h-11 rounded-xl ${feature.bg} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className={`w-5 h-5 ${feature.color}`} />
                  </div>
                  <div>
                    <h3 className="text-[#1a1a2e] font-semibold text-base">{feature.title}</h3>
                    <p className="text-stone-400 text-sm">{feature.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Quick Feature Bullets */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5 }}
            className="grid grid-cols-2 gap-2.5"
          >
            {quickFeatures.map((feature, index) => (
              <div key={index} className="flex items-center gap-2.5 text-stone-500">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <span className="text-sm font-medium">{feature.text}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Bottom Company Details */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.5 }}
          className="mt-8 pt-6 border-t border-stone-200/60"
        >
          <div className="grid grid-cols-2 gap-4 text-xs text-stone-400">
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-stone-300" />
                <span>인천광역시 서구 원창로89번길 14-7<br/>(원창동) 3층 301호</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" />
                <span>대표 전화: 010-9206-9984</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" />
                <span>sokoorymall@naver.com</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" />
                <span>사업자등록번호: 603-81-93743</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" />
                <span>통신판매업: 2025-인천서구-3547</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" />
                <span>평일 09:00~18:00 (점심 12:00~13:00)</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Right Side - Login Form */}
      <motion.div 
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-8 relative z-10"
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Login Card */}
          <div className="bg-white rounded-3xl shadow-xl shadow-stone-200/40 border border-stone-100 p-8 md:p-10">
            {/* Header */}
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 mb-4 shadow-lg shadow-orange-200/50"
              >
                <ShieldCheck className="w-7 h-7 text-white" />
              </motion.div>
              <h2 className="text-2xl font-bold text-[#1a1a2e]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>로그인</h2>
              <p className="text-stone-400 text-sm mt-1">계정에 로그인하세요</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-stone-600 text-sm font-medium">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-stone-50/80 border-stone-200 text-[#1a1a2e] placeholder:text-stone-300 focus:bg-white focus:border-orange-300 focus:ring-orange-200/50 transition-all h-11 rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-stone-600 text-sm font-medium">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-stone-50/80 border-stone-200 text-[#1a1a2e] placeholder:text-stone-300 focus:bg-white focus:border-orange-300 focus:ring-orange-200/50 transition-all h-11 rounded-xl"
                />
              </div>

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full bg-[#1a1a2e] hover:bg-[#2a2a3e] text-white font-semibold py-6 rounded-xl shadow-lg shadow-stone-900/10 transition-all duration-300 hover:shadow-xl hover:scale-[1.01]"
              >
                {loginMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    로그인 중...
                  </div>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    로그인 <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-stone-400 text-sm">
                계정이 없으신가요?{" "}
                <Link href="/register">
                  <a className="text-orange-500 hover:text-orange-600 font-semibold transition-colors">
                    회원가입
                  </a>
                </Link>
              </p>
            </div>
          </div>

          {/* Mobile-only company info */}
          <div className="lg:hidden mt-6 text-center space-y-1">
            <p className="text-xs text-stone-400 font-medium">주식회사 골든터틀컴퍼니</p>
            <p className="text-xs text-stone-300">대표: 이정언 | 032-322-9958</p>
            <p className="text-xs text-stone-300">사업자등록번호: 603-81-93743</p>
          </div>

          {/* Copyright */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="mt-6 text-center text-stone-300 text-xs"
          >
            <p>&copy; {new Date().getFullYear()} HACCPONE. All rights reserved.</p>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
