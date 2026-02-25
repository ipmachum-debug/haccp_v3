import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { CheckCircle2, Shield, TrendingUp, Users, Building2 } from "lucide-react";

export default function Register() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [userType, setUserType] = useState<"client_admin" | "employee">("employee");
  const [userMemo, setUserMemo] = useState("");
  
  // 클라이언트 관리자 전용 필드
  const [companyName, setCompanyName] = useState("");
  const [businessNumber, setBusinessNumber] = useState("");
  
  // 직원 전용 필드
  const [selectedTenantId, setSelectedTenantId] = useState<number | undefined>(undefined);

  // 테넌트 목록 조회
  const { data: tenantsData } = trpc.tenantsPublic.getAll.useQuery();

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      toast.success(data.message || "회원가입이 완료되었습니다!");
      setLocation("/login");
    },
    onError: (error) => {
      console.error('[Register] Registration error:', error);
      toast.error(error.message || "회원가입에 실패했습니다.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("비밀번호가 일치하지 않습니다.");
      return;
    }
    
    if (password.length < 6) {
      toast.error("비밀번호는 최소 6자 이상이어야 합니다.");
      return;
    }

    // 클라이언트 관리자 유효성 검사
    if (userType === "client_admin" && !companyName.trim()) {
      toast.error("회사명을 입력해주세요.");
      return;
    }

    // 직원 유효성 검사
    if (userType === "employee" && !selectedTenantId) {
      toast.error("소속 회사를 선택해주세요.");
      return;
    }
    
    console.log('[Register] Attempting registration with:', { 
      email, 
      name, 
      userType,
      companyName: userType === "client_admin" ? companyName : undefined,
      tenantId: userType === "employee" ? selectedTenantId : undefined
    });

    registerMutation.mutate({ 
      email, 
      password, 
      name, 
      userType,
      userMemo: userMemo.trim() || undefined,
      companyName: userType === "client_admin" ? companyName : undefined,
      businessNumber: userType === "client_admin" ? businessNumber : undefined,
      tenantId: userType === "employee" ? selectedTenantId : undefined
    });
  };

  const features = [
    {
      icon: Shield,
      title: "식품 안전 관리",
      description: "HACCP 기준에 따른 체계적인 식품 안전 관리 시스템"
    },
    {
      icon: CheckCircle2,
      title: "실시간 모니터링",
      description: "CCP 점검 및 배치 생산 현황을 실시간으로 모니터링"
    },
    {
      icon: TrendingUp,
      title: "데이터 분석",
      description: "생산 데이터 분석을 통한 품질 개선 및 효율성 향상"
    },
    {
      icon: Users,
      title: "팀 협업",
      description: "역할 기반 접근 제어로 안전한 팀 협업 환경 제공"
    }
  ];

  const userTypeLabels = {
    client_admin: "클라이언트 관리자 (회사 대표)",
    employee: "직원"
  };

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* 모바일 배경 그라데이션 */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 lg:hidden"></div>
      <div className="absolute top-0 right-0 w-72 h-72 bg-blue-200 rounded-full opacity-30 blur-3xl lg:hidden"></div>
      <div className="absolute bottom-0 left-0 w-72 h-72 bg-purple-200 rounded-full opacity-30 blur-3xl lg:hidden"></div>
      
      {/* 왼쪽: 홍보 섹션 */}
      <motion.div 
        initial={{ opacity: 0, x: -50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 p-12 flex-col justify-center relative overflow-hidden"
      >
        {/* 배경 장식 */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-200 rounded-full opacity-20 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-purple-200 rounded-full opacity-20 blur-3xl"></div>
        
        <div className="relative z-10 max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
              식품 안전 관리의
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                새로운 기준
              </span>
            </h1>
            <p className="text-xl text-gray-600 mb-12 leading-relaxed">
              HACCP 시스템으로 배치 관리, CCP 점검, 재고 관리를 한 곳에서 효율적으로 관리하세요.
            </p>
          </motion.div>

          <motion.div 
            className="space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + index * 0.1, duration: 0.5 }}
                className="flex items-start space-x-4 bg-white/60 backdrop-blur-sm p-4 rounded-2xl hover:bg-white/80 transition-all duration-300 hover:shadow-lg"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <feature.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                  <p className="text-sm text-gray-600">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1, duration: 0.6 }}
            className="mt-12 pt-8 border-t border-gray-200"
          >
            <p className="text-sm text-gray-500">
              500+ 식품 제조업체가 신뢰하는 HACCP 관리 솔루션
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* 오른쪽: 회원가입 폼 */}
      <motion.div 
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 bg-transparent lg:bg-gradient-to-br lg:from-gray-50 lg:via-blue-50/30 lg:to-purple-50/30 relative z-10 overflow-hidden"
      >
        {/* 데스크톱 배경 장식 */}
        <div className="hidden lg:block absolute top-10 right-10 w-64 h-64 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-full blur-3xl"></div>
        <div className="hidden lg:block absolute bottom-10 left-10 w-64 h-64 bg-gradient-to-br from-purple-400/20 to-cyan-400/20 rounded-full blur-3xl"></div>
        <div className="hidden lg:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-to-br from-blue-300/10 to-purple-300/10 rounded-full blur-3xl"></div>
        
        <div className="w-full max-w-md bg-white/90 backdrop-blur-2xl lg:bg-white/70 lg:backdrop-blur-xl rounded-3xl shadow-2xl lg:shadow-xl p-6 sm:p-8 lg:p-10 border border-white/40 lg:border-white/60 relative overflow-hidden max-h-[90vh] overflow-y-auto">
          {/* 폼 내부 장식 */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-blue-200/30 to-purple-200/30 rounded-full blur-2xl"></div>
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-gradient-to-br from-purple-200/30 to-cyan-200/30 rounded-full blur-2xl"></div>
          
          {/* 모바일 전용 프로젝트 소개 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="lg:hidden mb-8 text-center relative z-10"
          >
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              회원가입
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              HACCP 시스템을 사용하려면 먼저 회원가입을 해주세요
            </p>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="mb-8 relative z-10"
          >
            <div className="text-center lg:text-left mb-2">
              <div className="hidden lg:flex w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-white" />
              </div>
              <h2 className="hidden lg:block text-3xl font-bold text-gray-900 mb-2">회원가입</h2>
              <p className="hidden lg:block text-sm text-gray-600">
                {userType === "client_admin" 
                  ? "슈퍼관리자 승인 후 시스템을 사용하실 수 있습니다"
                  : "소속 회사 관리자 승인 후 시스템을 사용하실 수 있습니다"}
              </p>
            </div>
          </motion.div>

          <motion.form 
            onSubmit={handleSubmit} 
            className="space-y-5 relative z-10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            {/* 사용자 유형 선택 */}
            <div className="space-y-2">
              <Label htmlFor="userType" className="text-sm font-medium text-gray-700">
                가입 유형 <span className="text-red-500">*</span>
              </Label>
              <Select value={userType} onValueChange={(value: any) => setUserType(value)}>
                <SelectTrigger className="h-11 px-4 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all">
                  <SelectValue placeholder="가입 유형을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client_admin">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      <span>{userTypeLabels.client_admin}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="employee">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      <span>{userTypeLabels.employee}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                {userType === "client_admin" 
                  ? "회사를 대표하여 가입하시는 경우 선택하세요"
                  : "기존 회사에 소속된 직원으로 가입하시는 경우 선택하세요"}
              </p>
            </div>

            {/* 클라이언트 관리자 전용 필드 */}
            {userType === "client_admin" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="companyName" className="text-sm font-medium text-gray-700">
                    회사명 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="companyName"
                    type="text"
                    placeholder="예: (주)한국식품"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    className="h-11 px-4 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="businessNumber" className="text-sm font-medium text-gray-700">
                    사업자등록번호 (선택)
                  </Label>
                  <Input
                    id="businessNumber"
                    type="text"
                    placeholder="예: 123-45-67890"
                    value={businessNumber}
                    onChange={(e) => setBusinessNumber(e.target.value)}
                    className="h-11 px-4 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
                  />
                </div>
              </>
            )}

            {/* 직원 전용 필드 */}
            {userType === "employee" && (
              <div className="space-y-2">
                <Label htmlFor="tenantId" className="text-sm font-medium text-gray-700">
                  소속 회사 <span className="text-red-500">*</span>
                </Label>
                <Select 
                  value={selectedTenantId?.toString()} 
                  onValueChange={(value) => setSelectedTenantId(parseInt(value))}
                >
                  <SelectTrigger className="h-11 px-4 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all">
                    <SelectValue placeholder="소속 회사를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenantsData?.tenants?.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id.toString()}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  소속 회사가 목록에 없다면 먼저 회사 관리자가 가입해야 합니다
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                이름 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                type="text"
                placeholder="홍길동"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-11 px-4 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                이메일 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="example@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-11 px-4 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                비밀번호 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="최소 6자 이상"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="h-11 px-4 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                비밀번호 확인 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="비밀번호를 다시 입력하세요"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="h-11 px-4 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="userMemo" className="text-sm font-medium text-gray-700">
                {userType === "client_admin" ? "추가 정보 (선택)" : "부서 및 역할 (선택)"}
              </Label>
              <Textarea
                id="userMemo"
                placeholder={userType === "client_admin" 
                  ? "예: 대표이사 / 품질관리 책임자 등" 
                  : "예: 생산팀 / 품질관리팀 / 연구개발팀 등"}
                value={userMemo}
                onChange={(e) => setUserMemo(e.target.value)}
                rows={3}
                className="px-4 py-3 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-500 transition-all resize-none"
              />
              <p className="text-xs text-gray-500">
                관리자가 승인 시 참고할 수 있도록 간단히 적어주세요
              </p>
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-xl font-medium transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/50 hover:scale-[1.02] relative z-10" 
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? "가입 중..." : "회원가입"}
            </Button>
          </motion.form>

          <motion.div 
            className="mt-6 relative z-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
          >
            <div className="text-center text-sm text-gray-600">
              이미 계정이 있으신가요?{" "}
              <Link href="/login" className="text-blue-600 hover:text-blue-700 font-medium hover:underline transition-colors">
                로그인
              </Link>
            </div>
          </motion.div>

          {/* 모바일에서만 보이는 간단한 기능 소개 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mt-8 lg:hidden pt-6 border-t border-gray-200"
          >
            <p className="text-sm text-gray-500 text-center">
              500+ 식품 제조업체가 신뢰하는 HACCP 관리 솔루션
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
