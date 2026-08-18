import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

const CACHE_KEY = "tenant-modules-cache";

function getCached(): { erp: boolean; haccp: boolean } | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

/**
 * 구독 패키지 기반 활성 모듈 판정 훅
 *
 * subscription_package 기반 판정 (업종코드가 아님):
 *   erp_basic  → { erp: true, haccp: false }
 *   starter    → { erp: false, haccp: true }
 *   standard   → { erp: true, haccp: false }
 *   enterprise → { erp: true, haccp: true }
 *
 * sessionStorage 캐시로 깜빡임 방지 + DashboardLayout과 일관성 유지.
 */
export function useTenantModules() {
  const cached = getCached();
  const [modules, setModules] = useState<{ erp: boolean; haccp: boolean }>(
    cached || { erp: true, haccp: true }
  );
  const [loaded, setLoaded] = useState(!!cached);
  const checkSubMut = trpc.subscriptionPublic.checkSubscriptionStatus.useMutation();

  useEffect(() => {
    checkSubMut.mutateAsync()
      .then((info: any) => {
        if (info?.modules) {
          const m = { erp: !!info.modules.erp, haccp: !!info.modules.haccp };
          setModules(m);
          try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(m)); } catch {}
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  return {
    modules,
    hasERP: modules.erp,
    hasHACCP: modules.haccp,
    isErpOnly: modules.erp && !modules.haccp,
    isLoading: !loaded,
  };
}
