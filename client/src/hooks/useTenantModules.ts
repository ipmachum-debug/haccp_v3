import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

/**
 * 구독 패키지 기반 활성 모듈 판정 훅
 *
 * useIndustryFeatures().hasHACCP는 업종코드(industry_code) 기반이라
 * 식품업체(C10)는 erp_basic 패키지여도 hasHACCP=true를 반환함.
 *
 * 이 훅은 subscription_package 기반으로 판정:
 *   erp_basic  → { erp: true, haccp: false }
 *   starter    → { erp: false, haccp: true }
 *   standard   → { erp: true, haccp: false }
 *   enterprise → { erp: true, haccp: true }
 */
export function useTenantModules() {
  const [modules, setModules] = useState<{ erp: boolean; haccp: boolean } | null>(null);
  const checkSubMut = trpc.subscriptionPublic.checkSubscriptionStatus.useMutation();

  useEffect(() => {
    checkSubMut.mutateAsync()
      .then((info: any) => {
        if (info?.modules) setModules({ erp: !!info.modules.erp, haccp: !!info.modules.haccp });
      })
      .catch(() => setModules({ erp: true, haccp: true }));
  }, []);

  return {
    modules,
    hasERP: modules?.erp ?? true,
    hasHACCP: modules?.haccp ?? true,
    isErpOnly: modules ? modules.erp && !modules.haccp : false,
    isLoading: modules === null,
  };
}
