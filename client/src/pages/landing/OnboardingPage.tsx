/**
 * SaaS 셀프 온보딩 페이지
 * 회원가입 → 플랜 선택 → 완료 (3단계 스텝)
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Check, Crown, Zap, Building2, ArrowRight, ArrowLeft,
  Loader2, Mail, Lock, User, Building, Phone, Briefcase,
  CheckCircle2, Rocket, X
} from "lucide-react";

const PLAN_ICONS: Record<string, any> = {
  starter: Zap,
  standard: Crown,
  enterprise: Building2,
};

const PLAN_COLORS: Record<string, string> = {
  starter: "border-blue-300 hover:border-blue-500",
  standard: "border-purple-300 hover:border-purple-500",
  enterprise: "border-amber-300 hover:border-amber-500",
};

const PLAN_SELECTED: Record<string, string> = {
  starter: "border-blue-500 bg-blue-50 ring-2 ring-blue-200",
  standard: "border-purple-500 bg-purple-50 ring-2 ring-purple-200",
  enterprise: "border-amber-500 bg-amber-50 ring-2 ring-amber-200",
};

const FEATURE_LABELS: Record<string, string> = {
  accounting: "회계 모듈",
  aiAssistant: "AI 비서",
  documentPdf: "PDF 출력",
  customPdf: "커스텀 PDF",
  apiIntegration: "API 연동",
  excelExport: "엑셀 내보내기",
  financialReports: "재무보고서",
  autoBackup: "자동 백업",
};

function formatPrice(price: number): string {
  if (price === 0) return "무료";
  return new Intl.NumberFormat("ko-KR").format(price) + "원";
}

type Step = 1 | 2 | 3;

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    companyName: "",
    businessNumber: "",
    phone: "",
    plan: "starter" as "starter" | "standard" | "enterprise",
    industryCode: "",
  });
  const [result, setResult] = useState<{
    tenantId: number;
    slug: string;
    trialEndDate: string;
    message: string;
  } | null>(null);

  const { data: plans } = trpc.onboarding.getPlans.useQuery();

  const registerMutation = trpc.onboarding.register.useMutation({
    onSuccess: (data: any) => {
      setResult(data as any);
      setStep(3);
      toast.success(data.message);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const validate = (): string | null => {
    if (!form.email) return "이메일을 입력해주세요";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "유효한 이메일을 입력해주세요";
    if (form.password.length < 8) return "비밀번호는 최소 8자 이상이어야 합니다";
    if (form.password !== form.passwordConfirm) return "비밀번호가 일치하지 않습니다";
    if (!form.name) return "이름을 입력해주세요";
    if (!form.companyName) return "회사명을 입력해주세요";
    return null;
  };

  const handleNext = () => {
    if (step === 1) {
      const error = validate();
      if (error) { toast.error(error); return; }
      setStep(2);
    }
  };

  const handleSubmit = () => {
    registerMutation.mutate({
      email: form.email,
      password: form.password,
      name: form.name,
      companyName: form.companyName,
      businessNumber: form.businessNumber || undefined,
      phone: form.phone || undefined,
      plan: form.plan,
      industryCode: form.industryCode || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-white font-bold text-sm">M</div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">Millio AI</span>
          </a>
          <a href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            이미 계정이 있으신가요? <span className="text-blue-600 font-medium">로그인</span>
          </a>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Step indicator */}
        <div className="flex items-center justify-center mb-8 gap-4">
          {[
            { num: 1, label: "회원정보" },
            { num: 2, label: "플랜 선택" },
            { num: 3, label: "완료" },
          ].map(({ num, label }, i) => (
            <div key={num} className="flex items-center gap-2">
              {i > 0 && <div className={`w-12 h-0.5 ${step >= num ? "bg-blue-500" : "bg-gray-200"}`} />}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                step === num ? "bg-blue-600 text-white" : step > num ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-400"
              }`}>
                {step > num ? <Check className="h-4 w-4" /> : <span>{num}</span>}
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Registration form */}
        {step === 1 && (
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">무료 체험 시작하기</CardTitle>
              <CardDescription>14일 무료 체험 후 원하는 플랜을 선택하세요</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-1.5"><Mail className="h-4 w-4" /> 이메일 *</Label>
                <Input id="email" type="email" placeholder="email@company.com"
                  value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="password" className="flex items-center gap-1.5"><Lock className="h-4 w-4" /> 비밀번호 *</Label>
                  <Input id="password" type="password" placeholder="8자 이상"
                    value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="passwordConfirm">비밀번호 확인 *</Label>
                  <Input id="passwordConfirm" type="password" placeholder="비밀번호 재입력"
                    value={form.passwordConfirm} onChange={(e) => setForm({ ...form, passwordConfirm: e.target.value })} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name" className="flex items-center gap-1.5"><User className="h-4 w-4" /> 이름 *</Label>
                <Input id="name" placeholder="홍길동"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName" className="flex items-center gap-1.5"><Building className="h-4 w-4" /> 회사명 *</Label>
                <Input id="companyName" placeholder="(주)식품회사"
                  value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="businessNumber" className="flex items-center gap-1.5"><Briefcase className="h-4 w-4" /> 사업자번호</Label>
                  <Input id="businessNumber" placeholder="000-00-00000"
                    value={form.businessNumber} onChange={(e) => setForm({ ...form, businessNumber: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone" className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> 연락처</Label>
                  <Input id="phone" placeholder="010-0000-0000"
                    value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>

              <Button className="w-full mt-4" size="lg" onClick={handleNext}>
                다음: 플랜 선택 <ArrowRight className="h-4 w-4 ml-1" />
              </Button>

              <p className="text-xs text-center text-muted-foreground mt-2">
                가입 시 <a href="/legal?tab=terms" className="text-blue-600 hover:underline">이용약관</a>과{" "}
                <a href="/legal?tab=privacy" className="text-blue-600 hover:underline">개인정보처리방침</a>에 동의합니다
              </p>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Plan selection */}
        {step === 2 && plans && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold">플랜을 선택하세요</h2>
              <p className="text-muted-foreground mt-1">모든 플랜 14일 무료 체험 포함 / 부가세 별도</p>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {plans.map((plan: any) => {
                const isSelected = form.plan === plan.id;
                const PIcon = PLAN_ICONS[plan.id] || Zap;
                return (
                  <div
                    key={plan.id}
                    onClick={() => setForm({ ...form, plan: plan.id })}
                    className={`rounded-xl border-2 p-6 space-y-4 cursor-pointer transition-all ${
                      isSelected ? PLAN_SELECTED[plan.id] : PLAN_COLORS[plan.id]
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PIcon className="h-5 w-5" />
                        <h3 className="font-bold text-lg">{plan.name}</h3>
                      </div>
                      {isSelected && (
                        <Badge className="bg-blue-600 text-white">
                          <Check className="h-3 w-3 mr-1" /> 선택됨
                        </Badge>
                      )}
                    </div>

                    <div>
                      <span className="text-3xl font-bold">{formatPrice(plan.monthlyPrice)}</span>
                      <span className="text-sm text-muted-foreground"> /월</span>
                    </div>

                    <div className="space-y-1 text-sm text-muted-foreground">
                      <div>사용자: {plan.maxUsers}</div>
                      <div>제품: {plan.maxProducts}</div>
                      <div>배치: {plan.maxBatchesPerMonth}/월</div>
                      <div>사이트: {plan.maxSites}</div>
                    </div>

                    <div className="pt-2 space-y-1 border-t">
                      {Object.entries(plan.features as Record<string, boolean>).map(([key, enabled]) => (
                        <div key={key} className={`text-xs flex items-center gap-1 ${enabled ? "text-green-600" : "text-gray-300"}`}>
                          {enabled ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                          {FEATURE_LABELS[key] || key}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center max-w-lg mx-auto pt-4">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> 이전
              </Button>
              <Button size="lg" onClick={handleSubmit} disabled={registerMutation.isPending}>
                {registerMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> 생성 중...</>
                ) : (
                  <>무료 체험 시작 <Rocket className="h-4 w-4 ml-1" /></>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Completion */}
        {step === 3 && result && (
          <Card className="max-w-lg mx-auto text-center">
            <CardContent className="pt-10 pb-8 space-y-6">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              </div>

              <div>
                <h2 className="text-2xl font-bold">가입 완료!</h2>
                <p className="text-muted-foreground mt-2">{result.message}</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">회사명</span>
                  <span className="font-medium">{form.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">플랜</span>
                  <Badge variant="outline">{PLAN_CONFIG_NAMES[form.plan]}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">무료 체험 종료</span>
                  <span className="font-medium">{result.trialEndDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">이메일</span>
                  <span className="font-medium">{form.email}</span>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Button className="w-full" size="lg" onClick={() => window.location.href = "/login"}>
                  로그인하고 시작하기 <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
                <p className="text-xs text-muted-foreground">
                  카드 등록은 로그인 후 시스템 설정 &gt; 구독 관리에서 할 수 있습니다
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

const PLAN_CONFIG_NAMES: Record<string, string> = {
  starter: "Starter",
  standard: "Standard",
  enterprise: "Enterprise",
};
