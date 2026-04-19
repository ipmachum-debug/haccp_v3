/**
 * 기능 플래그 (Feature Flags)
 * ────────────────────────────────────────────────────────────
 * 특정 기능의 노출/비활성화를 한 곳에서 제어하기 위한 모듈.
 *
 * 사용법:
 *   import { FEATURES } from "@/lib/featureFlags";
 *
 *   {FEATURES.GOGOGOPICK_INTEGRATION && (
 *     <MenuItem>GOGOGOPICK 연동</MenuItem>
 *   )}
 *
 * 환경변수로도 오버라이드 가능 (.env):
 *   VITE_FEATURE_GOGOGOPICK=true   → 활성화
 *   VITE_FEATURE_GOGOGOPICK=false  → 비활성화 (또는 unset)
 *
 * 이력:
 *   2026-04-13: GOGOGOPICK 연동 기본 비활성화 (운영 연동 대기)
 */

const envFlag = (key: string, defaultValue: boolean): boolean => {
  const v = (import.meta as any).env?.[key];
  if (v === undefined || v === null || v === "") return defaultValue;
  return String(v).toLowerCase() === "true" || v === "1";
};

/**
 * 모듈 활성화 플래그 — 구독 패키지별 기능 제어
 *
 * 사용법:
 *   import { MODULES } from "@/lib/featureFlags";
 *   {MODULES.ERP && <TabsTrigger>회계</TabsTrigger>}
 *
 * 환경변수:
 *   VITE_MODULE_ERP=true/false
 *   VITE_MODULE_HACCP=true/false
 *
 * 기본값: 둘 다 true (통합 패키지)
 */
export const MODULES = {
  ERP: envFlag("VITE_MODULE_ERP", true),
  HACCP: envFlag("VITE_MODULE_HACCP", true),
} as const;

export type ModuleKey = keyof typeof MODULES;

export const FEATURES = {
  /**
   * GOGOGOPICK 연동 기능 (Opscore 통합)
   * - 사이드바 메뉴
   * - /admin/opscore-sync 페이지
   * - 테넌트 관리의 GOGOGOPICK 탭
   *
   * 기본값: false (연동 대기 중)
   * 활성화: .env 에 VITE_FEATURE_GOGOGOPICK=true
   */
  GOGOGOPICK_INTEGRATION: envFlag("VITE_FEATURE_GOGOGOPICK", false),

  /**
   * FSSC 22000 글로벌 모듈 (향후 추가 예정)
   */
  FSSC_22000: envFlag("VITE_FEATURE_FSSC_22000", false),
} as const;

export type FeatureKey = keyof typeof FEATURES;
