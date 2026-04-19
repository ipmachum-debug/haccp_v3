/**
 * useIndustryFeatures - 업종코드 기반 기능 활성화 훅
 * ────────────────────────────────────────────────────────────
 * 현재 테넌트의 업종코드를 기반으로 활성 모듈/기능/라벨을 제공합니다.
 *
 * 사용법:
 *   const { isModuleActive, isFeatureActive, getLabel, profile } = useIndustryFeatures();
 *
 *   {isModuleActive("haccp") && <HACCPMenu />}
 *   {isModuleActive("gmp") && <GMPMenu />}
 *   <span>{getLabel("batch")}</span>  // "배치" or "제조번호" or "LOT"
 *
 * 데이터 흐름:
 *   1. trpc.industry.getCurrentIndustry → 서버에서 테넌트 업종코드 조회
 *   2. industryConfig.ts의 resolveIndustryProfile()로 프로필 해석
 *   3. 훅이 모듈/기능/라벨 헬퍼 함수 제공
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

// ── 타입 (서버 industryConfig.ts와 동일) ──

export type ModuleKey =
  | "erp" | "production" | "inventory" | "quality"
  | "purchasing" | "sales" | "hr"
  | "haccp" | "gmp" | "iso" | "traceability";

export type FeatureKey =
  | "ccp_monitoring" | "haccp_7principles" | "hygiene_checklist"
  | "allergen_mgmt" | "food_defense" | "recall_mgmt"
  | "gmp_deviation" | "gmp_capa" | "stability_test"
  | "gmp_validation" | "gmp_change_control"
  | "incoming_inspection" | "process_inspection" | "final_inspection"
  | "nonconforming_mgmt" | "calibration"
  | "bom_management" | "batch_production" | "continuous_production"
  | "work_order" | "equipment_mgmt"
  | "lot_tracking" | "fefo_allocation" | "expiry_mgmt" | "serial_tracking"
  | "double_entry" | "tax_invoice" | "cost_analysis" | "budget_mgmt";

export type LabelKey = "batch" | "product" | "material" | "process" | "site";

export type IndustryCategory =
  | "food" | "cosmetics" | "supplement" | "pharma"
  | "electronics" | "textile" | "chemical" | "general";

// ── 훅 ──

export function useIndustryFeatures() {
  const { data, isLoading, error } = trpc.industry.getCurrentIndustry.useQuery(
    undefined,
    {
      staleTime: 5 * 60 * 1000, // 5분 캐싱
      retry: 1,
    }
  );

  const helpers = useMemo(() => {
    const modules = data?.profile?.modules ?? {};
    const features = data?.profile?.features ?? {};
    const labels = data?.profile?.labels ?? {};

    return {
      /** 모듈 활성 여부 */
      isModuleActive: (key: ModuleKey): boolean => {
        return !!(modules as Record<string, boolean>)[key];
      },

      /** 세부 기능 활성 여부 */
      isFeatureActive: (key: FeatureKey): boolean => {
        return !!(features as Record<string, boolean>)[key];
      },

      /** 업종별 UI 라벨 조회 */
      getLabel: (key: LabelKey, fallback?: string): string => {
        return (labels as Record<string, string>)[key] ?? fallback ?? key;
      },

      /** HACCP 모듈 활성 여부 (숏컷) */
      hasHACCP: !!(modules as Record<string, boolean>).haccp,

      /** GMP 모듈 활성 여부 (숏컷) */
      hasGMP: !!(modules as Record<string, boolean>).gmp,

      /** ISO 모듈 활성 여부 (숏컷) */
      hasISO: !!(modules as Record<string, boolean>).iso,

      /** 현재 업종 카테고리 */
      category: (data?.profile?.category ?? "general") as IndustryCategory,

      /** 전체 프로필 */
      profile: data?.profile ?? null,

      /** 업종코드 */
      industryCode: data?.industryCode ?? null,

      /** 활성 모듈 목록 */
      activeModules: (data?.activeModules ?? []) as ModuleKey[],

      /** 활성 기능 목록 */
      activeFeatures: (data?.activeFeatures ?? []) as FeatureKey[],

      /** 인증 목록 */
      certifications: data?.profile?.certifications ?? [],
    };
  }, [data]);

  return {
    ...helpers,
    isLoading,
    error,
  };
}

/**
 * 업종 카테고리 목록 훅 (회원가입 시 사용)
 */
export function useIndustryCategories() {
  return trpc.industry.getCategories.useQuery(undefined, {
    staleTime: 30 * 60 * 1000, // 30분 캐싱
  });
}

/**
 * 업종코드별 프로필 조회 훅
 */
export function useIndustryProfile(code: string | null) {
  return trpc.industry.getProfile.useQuery(
    { code: code ?? "C_GENERAL" },
    {
      enabled: !!code,
      staleTime: 30 * 60 * 1000,
    }
  );
}

/**
 * useIndustryLabel — 간편 라벨 훅
 * 
 * 사용법:
 *   const L = useIndustryLabel();
 *   <h1>{L("batch")} 관리</h1>  // → "배치 관리" or "제조번호 관리" or "LOT 관리"
 */
export function useIndustryLabel() {
  const { getLabel } = useIndustryFeatures();
  return getLabel;
}

/**
 * 업종 정보 변경 훅 (관리자 전용)
 * — `updateIndustry` 성공 시 `getCurrentIndustry` 캐시를 즉시 invalidate 해서
 *   사이드바 메뉴가 5분 대기 없이 새 업종 설정을 반영하도록 한다.
 */
export function useUpdateIndustry() {
  const utils = trpc.useUtils();
  return trpc.industry.updateIndustry.useMutation({
    onSuccess: () => {
      utils.industry.getCurrentIndustry.invalidate();
    },
  });
}
