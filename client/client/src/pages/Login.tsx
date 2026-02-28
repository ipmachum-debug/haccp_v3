import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { getGreetingMessage } from "@/lib/greetings";
import { motion } from "framer-motion";
import { 
  CheckCircle2, 
  Shield, 
  TrendingUp, 
  Package, 
  FileText, 
  Calculator,
  Sparkles,
  Phone,
  Globe
} from "lucide-react";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const utils = trpc.useUtils();
  
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      try {
        // 로그인 성공 후 사용자 정보 무효화
        await utils.auth.me.invalidate();
        
        // 약간의 지연 후 사용자 정보 다시 가져오기
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // fetch를 사용하여 직접 사용자 정보 가져오기
        const response = await utils.client.auth.me.query();
        console.log('[Login] User fetched:', response);
        
        // 재미있는 인사 메시지 표시
        const userName = response?.name;
        const greetingMessage = getGreetingMessage(userName);
        toast.success(greetingMessage, {
          duration: 4000,
        });
        
        // role에 따라 리다이렉트
        console.log('[Login] User role:', response?.role);
        if (response?.role === 'super_admin') {
          console.log('[Login] Redirecting to super admin dashboard');
          setLocation("/dashboard/super-admin");
        } else {
          console.log('[Login] Redirecting to regular dashboard');
          setLocation("/dashboard");
        }
      } catch (error) {
        console.error('[Login] Failed to fetch user:', error);
        // 오류가 발생해도 리다이렉트 (기본값: 일반 대시보드)
        setLocation("/dashboard");
      }
    },
    onError: (error: any) => {
      console.error('[Login] Login error:', error);
      
      // 승인 대기 상태 처리
      if (error.message && error.message.includes("승인 대기")) {
        toast.warning("관리자 승인을 기다려주세요.");
        setTimeout(() => {
          setLocation("/pending-approval");
        }, 1000);
      } else {
        toast.error(error.message || "로그인에 실패했습니다.");
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[Login] Attempting login with:', { email, password: '***' });
    loginMutation.mutate({ email, password });
  };

  const mainFeatures = [
    {
      icon: Shield,
      title: "HACCP 관리",
      description: "식품 안전 관리 시스템",
      gradient: "from-blue-500 to-cyan-500"
    },
    {
      icon: Calculator,
      title: "회계 관리",
      description: "매입/매출 자동 연동",
      gradient: "from-purple-500 to-pink-500"
    },
    {
      icon: Package,
      title: "ERP 시스템",
      description: "통합 자원 관리",
      gradient: "from-orange-500 to-red-500"
    }
  ];

  const features = [
    { icon: CheckCircle2, text: "CCP 실시간 모니터링" },
    { icon: TrendingUp, text: "재무제표 자동 생성" },
    { icon: FileText, text: "배치 생산 관리" },
    { icon: Package, text: "재고 자동 연동" }
  ];

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-blue-500/30 to-cyan-500/30 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [360, 180, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute top-1/4 right-0 w-96 h-96 bg-gradient-to-br from-purple-500/30 to-pink-500/30 rounded-full blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            rotate: [0, -180, -360],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "linear"
          }}
          className="absolute bottom-0 left-1/3 w-96 h-96 bg-gradient-to-br from-orange-500/30 to-red-500/30 rounded-full blur-3xl"
        />
        
        {/* Floating particles */}
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            transition={{
              duration: Math.random() * 10 + 10,
              repeat: Infinity,
              repeatType: "reverse"
            }}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
          />
        ))}
      </div>

      {/* Left Side - Features */}
      <motion.div 
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="hidden lg:flex lg:w-1/2 p-12 flex-col justify-center relative z-10"
      >
        <div className="max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mb-12"
          >
            {/* Company Info */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/50">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-white/90 text-sm font-medium">주식회사 골든터틀컴퍼니</h3>
                <div className="flex items-center gap-3 text-white/60 text-xs mt-1">
                  <div className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    <span>032-322-9958</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    <a 
                      href="http://www.goldenturtle.co.kr" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-white/90 transition-colors"
                    >
                      goldenturtle.co.kr
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <h1 className="text-5xl font-bold text-white mb-6 leading-tight">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                통합 관리 시스템
              </span>
              <br />
              <span className="text-white/90">HACCP-ONE</span>
            </h1>
            <p className="text-xl text-white/70 mb-8">
              식품 안전부터 회계까지, 하나의 플랫폼으로
            </p>
          </motion.div>

          {/* Main Features */}
          <div className="grid gap-4 mb-8">
            {mainFeatures.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + index * 0.1, duration: 0.5 }}
                className="group relative overflow-hidden rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 p-6 hover:bg-white/10 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-1">{feature.title}</h3>
                    <p className="text-white/60 text-sm">{feature.description}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Feature List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="space-y-3"
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 + index * 0.1, duration: 0.5 }}
                className="flex items-center gap-3 text-white/80"
              >
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <feature.icon className="w-4 h-4 text-green-400" />
                </div>
                <span className="text-sm">{feature.text}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </motion.div>

      {/* Right Side - Login Form */}
      <motion.div 
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8 }}
        className="w-full lg:w-1/2 flex items-center justify-center p-8 relative z-10"
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="w-full max-w-md"
        >
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 md:p-10">
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4 shadow-lg shadow-blue-500/50"
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-2">로그인</h2>
              <p className="text-white/60">계정에 로그인하세요</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/90">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-blue-400 transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/90">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-blue-400 transition-all"
                />
              </div>

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold py-6 rounded-xl shadow-lg shadow-blue-500/50 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/60 hover:scale-[1.02]"
              >
                {loginMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    로그인 중...
                  </div>
                ) : (
                  "로그인"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-white/60 text-sm">
                계정이 없으신가요?{" "}
                <Link href="/register">
                  <a className="text-blue-400 hover:text-blue-300 font-semibold transition-colors">
                    회원가입
                  </a>
                </Link>
              </p>
            </div>
          </div>

          {/* Additional Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.6 }}
            className="mt-6 text-center text-white/50 text-sm"
          >
            <p>© 2024 HACCP-ONE. All rights reserved.</p>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
