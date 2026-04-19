import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { Settings, Package, Tag, Factory, ChefHat, Sparkles, Pill, Cpu, Scissors, Syringe, Info, Shield, Award } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useIndustryFeatures, useUpdateIndustry } from "@/hooks/useIndustryFeatures";

export default function SystemSettings() {
  const [erpEnabled, setErpEnabled] = useState(false);

  // 업종 정보
  const {
    industryCode,
    category: industryCategory,
    hasHACCP,
    hasGMP,
    hasISO,
    activeModules,
    certifications,
    profile: industryProfile,
    isLoading: industryLoading,
  } = useIndustryFeatures();

  const updateIndustryMut = useUpdateIndustry();
  // onSuccess 핸들러 별도 지정 (useUpdateIndustry가 캐시 invalidate 처리)
  const handleIndustryMutate = (code: string) => {
    setPendingIndustryCode(code);
    updateIndustryMut.mutate({ industryCode: code }, {
      onSuccess: (data) => {
        toast.success(`업종이 ${data.profile.nameKo}(으)로 변경되었습니다. 메뉴가 자동 업데이트됩니다.`);
        setPendingIndustryCode(null);
      },
      onError: (error: { message: string }) => {
        toast.error(`오류: ${error.message}`);
        setPendingIndustryCode(null);
      },
    });
  };

  // 업종 코드 변경 핸들러
  const [pendingIndustryCode, setPendingIndustryCode] = useState<string | null>(null);

  const INDUSTRY_OPTIONS = [
    { code: "C10", label: "식품 제조업", category: "food", icon: ChefHat },
    { code: "C10_SUP", label: "건강기능식품 제조업", category: "supplement", icon: Pill },
    { code: "C20", label: "화장품 제조업", category: "cosmetics", icon: Sparkles },
    { code: "C21", label: "의약품 제조업", category: "pharma", icon: Syringe },
    { code: "C26", label: "전자부품·장비 제조업", category: "electronics", icon: Cpu },
    { code: "C13", label: "섬유·의복 제조업", category: "textile", icon: Scissors },
    { code: "C_GENERAL", label: "일반 제조업", category: "general", icon: Factory },
  ];

  const handleIndustryChange = (code: string) => {
    if (code === industryCode) return;
    const opt = INDUSTRY_OPTIONS.find(o => o.code === code);
    if (confirm(`업종을 '${opt?.label}'으로 변경하면 사이드바 메뉴와 기능이 변경됩니다. 계속하시겠습니까?`)) {
      handleIndustryMutate(code);
    }
  };

  const { data: settings, refetch } = trpc.system.getSettings.useQuery();
  const updateSetting = trpc.system.updateSetting.useMutation({
    onSuccess: () => {
      toast.success("설정이 저장되었습니다");
      refetch();
    },
    onError: (error: { message: string }) => {
      toast.error(`오류: ${error.message}`);
    },
  });

  useEffect(() => {
    if (settings) {
      const erpSetting = settings.find((s: any) => s.settingKey === "erp_module_enabled");
      setErpEnabled(erpSetting?.settingValue === "true");
    }
  }, [settings]);

  const handleErpToggle = (checked: boolean) => {
    setErpEnabled(checked);
    updateSetting.mutate({
      key: "erp_module_enabled",
      value: checked ? "true" : "false",
      description: "ERP 모듈 활성화 여부 (매출/출고 관리 기능)",
    });
  };

  return (
    <DashboardLayout>

    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Settings className="h-8 w-8" />
            시스템 설정
          </h1>
          <p className="text-muted-foreground">
            시스템 전역 설정을 관리합니다
          </p>
        </div>
      </div>

      {/* 업종 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            업종 설정
          </CardTitle>
          <CardDescription>
            업종에 따라 활성화되는 모듈과 기능이 달라집니다 (예: HACCP, GMP, ISO 등)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 현재 업종 표시 */}
          {industryLoading ? (
            <p className="text-sm text-muted-foreground">업종 정보 로딩 중...</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <div className="space-y-1 flex-1">
                  <Label className="text-sm font-medium">현재 업종</Label>
                  <Select
                    value={pendingIndustryCode || industryCode || "C10"}
                    onValueChange={handleIndustryChange}
                    disabled={updateIndustryMut.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="업종 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRY_OPTIONS.map(opt => {
                        const Icon = opt.icon;
                        return (
                          <SelectItem key={opt.code} value={opt.code}>
                            <span className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5" />
                              {opt.label}
                              <span className="text-xs text-muted-foreground">({opt.code})</span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* 활성 모듈 표시 */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  활성 모듈
                </Label>
                <div className="flex gap-2 flex-wrap">
                  {hasHACCP && <Badge className="bg-orange-100 text-orange-700 border-orange-200"><Shield className="h-3 w-3 mr-1" />HACCP</Badge>}
                  {hasGMP && <Badge className="bg-pink-100 text-pink-700 border-pink-200"><Award className="h-3 w-3 mr-1" />GMP</Badge>}
                  {hasISO && <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200"><Shield className="h-3 w-3 mr-1" />ISO</Badge>}
                  {activeModules.filter(m => !["haccp","gmp","iso"].includes(m)).map(mod => (
                    <Badge key={mod} variant="secondary" className="text-xs capitalize">{mod}</Badge>
                  ))}
                </div>
              </div>

              {/* 필수 인증 */}
              {certifications.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Award className="h-3.5 w-3.5" />
                    필수/권장 인증
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    {certifications.map((cert: any) => (
                      <Badge
                        key={cert.code}
                        variant={cert.requirement === "mandatory" ? "default" : cert.requirement === "recommended" ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {cert.nameKo}
                        {cert.requirement === "mandatory" && <span className="ml-1 text-[9px]">(필수)</span>}
                        {cert.requirement === "recommended" && <span className="ml-1 text-[9px]">(권장)</span>}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-muted rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  업종을 변경하면 사이드바 메뉴, 체크리스트 템플릿, UI 라벨(배치/LOT, 원재료/원료 등)이
                  자동으로 적용됩니다. 변경 시 페이지가 새로고침됩니다.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 카테고리 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            카테고리 관리
          </CardTitle>
          <CardDescription>
            원재료, 제품, 매입, 매출 카테고리를 관리합니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.href = "/category-management"}>
            카테고리 관리 페이지로 이동
          </Button>
        </CardContent>
      </Card>

      {/* ERP 모듈 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            ERP 모듈
          </CardTitle>
          <CardDescription>
            매출/출고 관리 기능을 활성화하거나 비활성화합니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="erp-enabled" className="text-base">
                ERP 모듈 활성화
              </Label>
              <div className="text-sm text-muted-foreground">
                활성화 시 재고 거래 내역 기록, 매출 관리, 출고 관리 기능이 추가됩니다
              </div>
            </div>
            <Switch
              id="erp-enabled"
              checked={erpEnabled}
              onCheckedChange={handleErpToggle}
              disabled={updateSetting.isPending}
            />
          </div>

          {erpEnabled && (
            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                ERP 모듈 활성화됨
              </h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• 재고 거래 내역 기록 (입고/출고)</li>
                <li>• 매출 관리 기능</li>
                <li>• 재고 소비 패턴 분석 (실제 데이터 기반)</li>
                <li>• 재고 예측 알고리즘 고도화</li>
              </ul>
            </div>
          )}

          {!erpEnabled && (
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                💡 ERP 모듈을 비활성화하면 HACCP 전용 시스템으로 사용할 수 있습니다.
                재고 거래 내역 기록 및 매출 관리 기능이 메뉴에서 숨겨집니다.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 추가 설정 카드 (향후 확장) */}
      <Card>
        <CardHeader>
          <CardTitle>기타 설정</CardTitle>
          <CardDescription>
            추가 시스템 설정 항목이 여기에 표시됩니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            현재 사용 가능한 추가 설정이 없습니다.
          </p>
        </CardContent>
      </Card>
    </div>
  
    </DashboardLayout>
  );
}
