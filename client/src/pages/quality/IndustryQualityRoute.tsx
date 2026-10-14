/**
 * 업종 품질 공통 경로 (UI/UX 개편 2-c, 2026-10-14) — /quality/{기능}
 *
 * 이전: /dashboard/{업종}/{기능} 48개 경로가 각각 <XPage industry="업종"/> 래퍼를 그렸다.
 * 이후: 기능당 경로 1개. 업종은 테넌트 설정에서 판별해 **같은 공통 페이지**에 넘긴다 → 화면·데이터·API 는 이전과 동일.
 *
 * 업종 결정 순서
 *  1) 쿼리 ?industry= (옛 경로 리다이렉트가 붙인다) — 슈퍼관리자이거나 테넌트 업종과 같을 때만 따른다
 *  2) 테넌트 업종 (industry.getCurrentIndustry)
 *  3) 판별 불가 → 업종 선택 안내 (슈퍼관리자는 업종을 골라 볼 수 있다)
 */
import { lazy, useMemo } from "react";
import { Link, useSearch } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/_core/hooks/useAuth";
import { useIndustryFeatures } from "@/hooks/useIndustryFeatures";
import { INDUSTRY_KEYS, industryKeyOfCategory, qualityPath, type IndustryKey, type QualityFunction } from "@shared/navigation/menuRegistry";

const PAGES: Record<QualityFunction, React.LazyExoticComponent<React.ComponentType<{ industry: any }>>> = {
  "change-control": lazy(() => import("@/pages/changeControl/ChangeControlPage")),
  nonconforming: lazy(() => import("@/pages/nonconforming/NonconformingPage")),
  "corrective-action": lazy(() => import("@/pages/correctiveAction/CorrectiveActionPage")),
  audit: lazy(() => import("@/pages/audit/AuditPage")),
  training: lazy(() => import("@/pages/training/TrainingPage")),
  calibration: lazy(() => import("@/pages/calibration/CalibrationPage")),
  supplier: lazy(() => import("@/pages/supplier/SupplierPage")),
  "risk-assessment": lazy(() => import("@/pages/riskAssessment/RiskAssessmentPage")),
};

const INDUSTRY_LABEL: Record<IndustryKey, string> = {
  food: "식품", cosmetic: "화장품", pharmaceutical: "의약품", "health-functional": "건강기능식품",
  "medical-device": "의료기기", "general-manufacturing": "일반 제조",
};

/** 순수 판정 — 테스트 대상 */
export function resolveQualityIndustry(opts: { requested: string | null; tenant: IndustryKey | null; isSuperAdmin: boolean }): IndustryKey | null {
  const req = (INDUSTRY_KEYS as readonly string[]).includes(opts.requested ?? "") ? (opts.requested as IndustryKey) : null;
  if (req && (opts.isSuperAdmin || req === opts.tenant)) return req;
  return opts.tenant;
}

export default function IndustryQualityRoute({ fn }: { fn: QualityFunction }) {
  const search = useSearch();
  const { user } = useAuth();
  const { category, isLoading } = useIndustryFeatures();
  const industry = useMemo(() => resolveQualityIndustry({
    requested: new URLSearchParams(search).get("industry"),
    tenant: industryKeyOfCategory(category),
    isSuperAdmin: user?.role === "super_admin",
  }), [search, category, user?.role]);

  if (isLoading) return null;
  if (industry) {
    const Page = PAGES[fn];
    return <Page industry={industry} />;
  }

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto mt-16 rounded-2xl border bg-card p-6 space-y-3">
        <h1 className="text-lg font-semibold">업종을 확인할 수 없습니다</h1>
        <p className="text-sm text-muted-foreground">
          품질 기록은 업종별 기준(필수 항목·승인 단계·용어)을 따릅니다. 환경설정에서 회사 업종을 지정하면 이 화면이 바로 열립니다.
        </p>
        {user?.role === "super_admin" && (
          <div className="flex flex-wrap gap-2 pt-2">
            {INDUSTRY_KEYS.map((k) => (
              <Link key={k} href={`${qualityPath(fn)}?industry=${k}`} className="text-sm rounded-lg border px-3 py-1.5 hover:bg-accent">{INDUSTRY_LABEL[k]}</Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
