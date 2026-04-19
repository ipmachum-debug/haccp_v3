import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { motion as _motion } from "framer-motion";
const motion = _motion as any;
import { MillioMark } from "@/components/brand/MillioMark";
import {
  CheckCircle2, Shield, TrendingUp, Users, Building2,
  ShieldCheck, Factory, Calculator, Package, FileText,
  Phone, Globe, Mail, Clock, MapPin, ArrowRight
} from "lucide-react";


export default function Register() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [userType, setUserType] = useState<"client_admin" | "employee">("employee");
  const [userMemo, setUserMemo] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<number | undefined>(undefined);

  const { data: tenantsData } = trpc.tenantsPublic.getAll.useQuery();

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data: any) => {
      toast.success(data.message || "회원가입이 완료되었습니다!");
      setLocation("/login");
    },
    onError: (error: { message: string }) => {
      toast.error(error.message || "회원가입에 실패했습니다.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { toast.error("비밀번호가 일치하지 않습니다."); return; }
    if (password.length < 6) { toast.error("비밀번호는 최소 6자 이상이어야 합니다."); return; }
    if (userType === "client_admin" && !companyName.trim()) { toast.error("회사명을 입력해주세요."); return; }
    if (userType === "employee" && !selectedTenantId) { toast.error("소속 회사를 선택해주세요."); return; }

    registerMutation.mutate({
      email, password, name, userType,
      userMemo: userMemo.trim() || undefined,
      companyName: userType === "client_admin" ? companyName : undefined,
      businessNumber: userType === "client_admin" ? businessNumber : undefined,
      tenantId: userType === "employee" ? selectedTenantId : undefined,
    });
  };

  const mainFeatures = [
    { icon: ShieldCheck, title: "HACCP 관리", description: "CCP 모니터링, 체크리스트, 자동 기록", color: "text-emerald-600", bg: "bg-emerald-50" },
    { icon: Calculator, title: "회계 관리", description: "매입/매출 자동 연동, 재무제표", color: "text-violet-600", bg: "bg-violet-50" },
    { icon: Factory, title: "생산 / ERP", description: "배치 생산, LOT 추적, 재고 관리", color: "text-orange-600", bg: "bg-orange-50" },
  ];

  const quickFeatures = [
    { icon: CheckCircle2, text: "CCP 실시간 모니터링" },
    { icon: TrendingUp, text: "재무제표 자동 생성" },
    { icon: FileText, text: "배치 생산 관리" },
    { icon: Package, text: "재고 자동 연동" },
  ];

  const inputClass = "h-11 px-4 rounded-xl bg-stone-50/80 border-stone-200 text-[#1a1a2e] placeholder:text-stone-300 focus:bg-white focus:border-orange-300 focus:ring-orange-200/50 transition-all";
  const labelClass = "text-sm font-medium text-stone-600";

  return (
    <div className="min-h-screen flex relative overflow-hidden" style={{ background: "linear-gradient(135deg, #FBF8F3 0%, #FFF8F0 50%, #FEF3E2 100%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap');
      `}</style>

      {/* Animated background blobs - Gradient Blob 1 (좌상단) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360], x: [0, 50, 0], y: [0, -30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-20 -left-20 w-[600px] h-[600px] bg-gradient-to-br from-orange-300/50 to-amber-200/35 rounded-full blur-3xl"
        />
        {/* Gradient Blob 2 (우측) */}
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], rotate: [360, 180, 0], x: [0, -40, 0], y: [0, 40, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute top-1/4 -right-10 w-[550px] h-[550px] bg-gradient-to-bl from-rose-300/40 to-orange-200/30 rounded-full blur-3xl"
        />
        {/* Gradient Blob 3 (하단) */}
        <motion.div
          animate={{ scale: [1, 1.3, 1], rotate: [0, -180, -360], x: [0, 30, 0], y: [0, -40, 0] }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-10 left-1/4 w-[550px] h-[550px] bg-gradient-to-tr from-amber-300/35 to-orange-100/25 rounded-full blur-3xl"
        />
        {/* Gradient Blob 4 (중앙) */}
        <motion.div
          animate={{ scale: [1.1, 0.9, 1.1], x: [0, -50, 0], y: [0, 30, 0] }}
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

        {/* Floating Particles (15개) */}
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
              transition={{ duration: Math.random() * 6 + 6, repeat: Infinity, delay: Math.random() * 4, ease: "easeInOut" }}
              className="absolute rounded-full"
              style={{
                left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%`,
                width: `${Math.random() * 8 + 4}px`, height: `${Math.random() * 8 + 4}px`,
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
        className="hidden lg:flex lg:w-[52%] p-10 xl:p-14 flex-col justify-between relative z-10"
      >
        <div className="max-w-xl">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5 }} className="mb-10">
            <div className="flex items-center gap-3.5 mb-8">
              <MillioMark className="w-12 h-12" />
              <div>
                <h3 className="text-stone-700 text-sm font-semibold">주식회사 골든터틀컴퍼니</h3>
                <div className="flex items-center gap-3 text-stone-400 text-xs mt-0.5">
                  <div className="flex items-center gap-1"><Phone className="w-3 h-3" /><span>032-322-9958</span></div>
                  <div className="flex items-center gap-1"><Globe className="w-3 h-3" /><span>millioai.com</span></div>
                </div>
              </div>
            </div>

            <h1 className="text-[2.75rem] xl:text-5xl font-bold leading-[1.15] tracking-tight" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              <span className="text-[#1a1a2e]">제조기반 올인원 ERP</span><br />
              <span className="text-[#1a1a2e]">Millio</span>
              <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent"> AI</span>
            </h1>
            <p className="mt-4 text-lg text-stone-500" style={{ fontFamily: "'Noto Sans KR', sans-serif" }}>
              공장의 모든 데이터를 AI가 하나로 연결합니다
            </p>
          </motion.div>

          {/* Feature Cards */}
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
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.5 }} className="grid grid-cols-2 gap-2.5">
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1, duration: 0.5 }} className="mt-8 pt-6 border-t border-stone-200/60">
          <div className="grid grid-cols-2 gap-4 text-xs text-stone-400">
            <div className="space-y-1.5">
              <div className="flex items-start gap-2"><MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-stone-300" /><span>인천광역시 서구 원창로89번길 14-7<br/>(원창동) 3층 301호</span></div>
              <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" /><span>대표 전화: 010-9206-9984</span></div>
              <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" /><span>sokoorymall@naver.com</span></div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2"><FileText className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" /><span>사업자등록번호: 603-81-93743</span></div>
              <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" /><span>통신판매업: 2025-인천서구-3547</span></div>
              <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 flex-shrink-0 text-stone-300" /><span>평일 09:00~18:00 (점심 12:00~13:00)</span></div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Right Side - Register Form */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full lg:w-[48%] flex items-start lg:items-center justify-center p-4 sm:p-6 relative z-10 overflow-y-auto"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="w-full max-w-md my-4"
        >
          <div className="bg-white rounded-3xl shadow-xl shadow-stone-200/40 border border-stone-100 p-6 sm:p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
                className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white mb-4 shadow-lg shadow-blue-200/40 border border-stone-100"
              >
                <MillioMark className="w-10 h-10" />
              </motion.div>
              <h2 className="text-2xl font-bold text-[#1a1a2e]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>회원가입</h2>
              <p className="text-stone-400 text-sm mt-1">
                {userType === "client_admin"
                  ? "소속 회사 관리자 승인 후 시스템을 사용하실 수 있습니다"
                  : "소속 회사 관리자 승인 후 시스템을 사용하실 수 있습니다"}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* User Type */}
              <div className="space-y-1.5">
                <Label className={labelClass}>가입 유형 <span className="text-orange-500">*</span></Label>
                <Select value={userType} onValueChange={(value: any) => setUserType(value)}>
                  <SelectTrigger className="h-11 px-4 rounded-xl bg-stone-50/80 border-stone-200 focus:border-orange-300 focus:ring-orange-200/50 transition-all">
                    <SelectValue placeholder="가입 유형을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_admin"><div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-orange-500" /><span>클라이언트 관리자 (회사 대표)</span></div></SelectItem>
                    <SelectItem value="employee"><div className="flex items-center gap-2"><Users className="w-4 h-4 text-orange-500" /><span>직원</span></div></SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-stone-400">
                  {userType === "client_admin"
                    ? "회사를 대표하여 가입하시는 경우 선택하세요"
                    : "기존 회사에 소속된 직원으로 가입하시는 경우 선택하세요"}
                </p>
              </div>

              {/* Client Admin Fields */}
              {userType === "client_admin" && (
                <>
                  <div className="space-y-1.5">
                    <Label className={labelClass}>회사명 <span className="text-orange-500">*</span></Label>
                    <Input type="text" placeholder="예: (주)한국식품" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className={inputClass} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className={labelClass}>사업자등록번호 (선택)</Label>
                    <Input type="text" placeholder="예: 123-45-67890" value={businessNumber} onChange={(e) => setBusinessNumber(e.target.value)} className={inputClass} />
                  </div>
                </>
              )}

              {/* Employee Fields */}
              {userType === "employee" && (
                <div className="space-y-1.5">
                  <Label className={labelClass}>소속 회사 <span className="text-orange-500">*</span></Label>
                  <Select value={selectedTenantId?.toString()} onValueChange={(value) => setSelectedTenantId(parseInt(value))}>
                    <SelectTrigger className="h-11 px-4 rounded-xl bg-stone-50/80 border-stone-200 focus:border-orange-300 focus:ring-orange-200/50 transition-all">
                      <SelectValue placeholder="소속 회사를 선택하세요" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenantsData?.tenants?.map((tenant: any) => (
                        <SelectItem key={tenant.id} value={tenant.id.toString()}>{tenant.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-stone-400">* 소속 회사가 목록에 없다면 먼저 회사 관리자가 가입해야 합니다</p>
                </div>
              )}

              {/* Name */}
              <div className="space-y-1.5">
                <Label className={labelClass}>이름 <span className="text-orange-500">*</span></Label>
                <Input type="text" placeholder="홍길동" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label className={labelClass}>이메일 <span className="text-orange-500">*</span></Label>
                <Input type="email" placeholder="example@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" className={inputClass} />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <Label className={labelClass}>비밀번호 <span className="text-orange-500">*</span></Label>
                <Input type="password" placeholder="최소 6자 이상" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className={inputClass} />
              </div>

              {/* Confirm Password */}
              <div className="space-y-1.5">
                <Label className={labelClass}>비밀번호 확인 <span className="text-orange-500">*</span></Label>
                <Input type="password" placeholder="비밀번호를 다시 입력하세요" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required autoComplete="new-password" className={inputClass} />
              </div>

              {/* Memo */}
              <div className="space-y-1.5">
                <Label className={labelClass}>{userType === "client_admin" ? "추가 정보 (선택)" : "부서 및 역할 (선택)"}</Label>
                <Textarea
                  placeholder={userType === "client_admin" ? "예: 대표이사 / 품질관리 책임자 등" : "예: 생산팀 / 품질관리팀 / 연구개발팀 등"}
                  value={userMemo} onChange={(e) => setUserMemo(e.target.value)} rows={2}
                  className="px-4 py-2.5 rounded-xl bg-stone-50/80 border-stone-200 text-[#1a1a2e] placeholder:text-stone-300 focus:bg-white focus:border-orange-300 focus:ring-orange-200/50 transition-all resize-none text-sm"
                />
                <p className="text-xs text-stone-400">관리자가 승인 시 참고할 수 있도록 간단히 적어주세요</p>
              </div>

              <Button
                type="submit"
                disabled={registerMutation.isPending}
                className="w-full bg-[#1a1a2e] hover:bg-[#2a2a3e] text-white font-semibold py-6 rounded-xl shadow-lg shadow-stone-900/10 transition-all duration-300 hover:shadow-xl hover:scale-[1.01]"
              >
                {registerMutation.isPending ? (
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    가입 중...
                  </div>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    회원가입 <ArrowRight className="w-4 h-4" />
                  </span>
                )}
              </Button>
            </form>

            <div className="mt-5 text-center">
              <p className="text-stone-400 text-sm">
                이미 계정이 있으신가요?{" "}
                <Link href="/login">
                  <a className="text-orange-500 hover:text-orange-600 font-semibold transition-colors">로그인</a>
                </Link>
              </p>
            </div>
          </div>

          {/* Mobile company info */}
          <div className="lg:hidden mt-5 text-center space-y-1">
            <p className="text-xs text-stone-400 font-medium">주식회사 골든터틀컴퍼니</p>
            <p className="text-xs text-stone-300">대표: 이정언 | 032-322-9958</p>
            <p className="text-xs text-stone-300">사업자등록번호: 603-81-93743</p>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.5 }} className="mt-4 text-center text-stone-300 text-xs">
            <p>&copy; {new Date().getFullYear()} Millio AI. All rights reserved.</p>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
