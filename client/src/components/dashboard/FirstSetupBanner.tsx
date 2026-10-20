/**
 * 처음 설정 안내 — 관리자 화면 맨 위 (2026-10-20 신규 회사 시험 P1/P2).
 *   1) 업종을 아직 정하지 않았으면: 여기서 바로 고른다 (메뉴가 업종에 맞게 바뀜).
 *   2) 생산(HACCP) 업종인데 공정이 하나도 없으면: '우리 공장' 으로 바로 — 그 화면에서 첫 설비·공정을 등록한다.
 * 할 일이 없으면 아무것도 보이지 않는다. 읽기만 하고, 저장은 각 화면의 기존 경로.
 */
import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useIndustryFeatures } from "@/hooks/useIndustryFeatures";
import { ROUTES } from "@/lib/routePaths";
import IndustryPicker from "@/components/system/IndustryPicker";
import { ArrowRight, Factory, X } from "lucide-react";

const LATER_KEY = "first-setup-factory-later";

export default function FirstSetupBanner() {
  const { user } = useAuth();
  const isAdmin = String((user as any)?.role ?? "") === "admin";
  const { industryCode, hasHACCP, isLoading } = useIndustryFeatures();
  const needIndustry = isAdmin && !isLoading && !industryCode;
  const groups = trpc.ccpMonitoring.getProcessGroups.useQuery(undefined, { enabled: isAdmin && !!industryCode && hasHACCP, staleTime: 60_000 });
  const [later, setLater] = useState(() => { try { return sessionStorage.getItem(LATER_KEY) === "1"; } catch { return false; } });
  const onFactory = typeof window !== "undefined" && window.location.pathname.startsWith(ROUTES.DESIGN_FACTORY);
  const needFactory = isAdmin && !!industryCode && hasHACCP && groups.isSuccess && Array.isArray(groups.data) && groups.data.length === 0 && !later && !onFactory;

  if (needIndustry) {
    return (
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:bg-blue-500/10 dark:border-blue-500/30" data-testid="setup-industry">
        <p className="text-sm font-semibold">처음 설정 1 — 우리 회사 업종을 고르세요</p>
        <p className="text-xs text-muted-foreground mb-2">고른 업종에 맞는 메뉴(식품이면 생산·생산 설계·CCP)와 기록지가 열립니다. 관리자 설정에서 언제든 바꿀 수 있습니다.</p>
        <IndustryPicker />
      </div>
    );
  }
  if (needFactory) {
    return (
      <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 flex flex-wrap items-center gap-2 dark:bg-blue-500/10 dark:border-blue-500/30" data-testid="setup-factory">
        <Factory className="h-4 w-4 text-blue-700" />
        <span className="text-sm"><b>처음 설정 2</b> — 우리 공장의 설비와 공정(가열·금속검출 등)을 등록하세요. 생산 계획·기록지가 이것을 씁니다.</span>
        <Link href={ROUTES.DESIGN_FACTORY} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">우리 공장 등록 <ArrowRight className="h-3.5 w-3.5" /></Link>
        <button type="button" className="ml-auto text-muted-foreground hover:text-foreground" aria-label="나중에"
          onClick={() => { setLater(true); try { sessionStorage.setItem(LATER_KEY, "1"); } catch { /* 저장 못 해도 이번 화면은 닫힘 */ } }}>
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return null;
}
