/**
 * Industry-First Menu Architecture — 타입 정의 + 헬퍼 (Phase Y-3)
 *
 * ============================================================================
 * 모든 메뉴는 명시적 `scope` 필드 보유. TypeScript discriminated union 으로
 * 컴파일 보증 — 누락 시 빌드 실패. Phase 3 신규 industry 진입 시 안전.
 *
 * 결정 배경: docs/architecture/ADR-003-industry-first-menu.md
 * 마이그레이션 계획: docs/architecture/Phase-Y-roadmap.md
 * 메뉴 분류 매트릭스: docs/architecture/menu-inventory.md
 * ============================================================================
 */
import type { LucideIcon } from "lucide-react";

/**
 * 지원 industry — Phase 3 진입 시 추가.
 *
 * 추가 시 `INDUSTRY_LABELS`, `INDUSTRY_DESCRIPTIONS` 도 동시 갱신
 * (Record 타입이라 누락 시 컴파일 실패).
 */
export type IndustryKey =
  | "food"                   // 식품 HACCP
  | "cosmetic"               // 화장품 GMP
  | "pharmaceutical"         // 의약품 KGMP (Phase 3-A)
  | "health-functional"      // 건강기능식품 (Phase 3-B)
  | "medical-device"         // 의료기기 ISO 13485 (Phase 3-C)
  | "general-manufacturing"; // 일반제조 ISO 9001 (Phase 3-D)

/**
 * 메뉴 노출 범위 — discriminated union.
 *
 * 모든 메뉴는 다음 4가지 중 정확히 하나에 속해야 함:
 *   - platform : 슈퍼관리자 / 시스템 / 테넌트 관리
 *   - common   : 모든 industry 공통 (재고/알림/마스터/문서)
 *   - accounting : 회계 (cross-industry)
 *   - industry : 특정 industry 전용 (industry 필드 명시 필수)
 */
export type MenuScope =
  | { kind: "platform" }
  | { kind: "common" }
  | { kind: "accounting" }
  | { kind: "industry"; industry: IndustryKey };

/**
 * Industry 사용자 친화 라벨 — 사이드바 탭 / 안내 메시지에 사용.
 */
export const INDUSTRY_LABELS: Record<IndustryKey, string> = {
  food: "식품 HACCP",
  cosmetic: "화장품 GMP",
  pharmaceutical: "의약품 KGMP",
  "health-functional": "건강기능식품",
  "medical-device": "의료기기 GMP",
  "general-manufacturing": "일반제조",
};

/**
 * Industry 설명 — 슈퍼관리자 활성화 UI / 온보딩에 사용.
 */
export const INDUSTRY_DESCRIPTIONS: Record<IndustryKey, string> = {
  food: "HACCP / CCP 모니터링 / F-3 IoT 폐쇄 루프",
  cosmetic: "GMP / BMR / Formula / Stability / KFDA 신고",
  pharmaceutical: "KGMP / MFR / API / ICH Q1A / KAERS",
  "health-functional": "건기식 GMP / 영양기능정보 / 광고심의",
  "medical-device": "ISO 13485 / DHR / DMR / UDI",
  "general-manufacturing": "ISO 9001 / Work Order / BoM",
};

/**
 * 사이드바 탭 종류 — 사이드바 렌더링 시 분기.
 */
export type SidebarTab =
  | { id: "platform"; label: string }
  | { id: "common"; label: string }
  | { id: "accounting"; label: string }
  | { id: IndustryKey; label: string; industry: IndustryKey };

/**
 * 활성 industry 목록을 받아 사이드바 탭 자동 생성.
 *
 * @param activeIndustries 테넌트가 활성화한 industry 목록 (예: ["food", "cosmetic"])
 * @param isSuperAdmin 슈퍼관리자 여부 (true 시 platform 탭 추가)
 */
export function buildSidebarTabs(
  activeIndustries: IndustryKey[],
  isSuperAdmin: boolean,
): SidebarTab[] {
  const tabs: SidebarTab[] = [];
  if (isSuperAdmin) {
    tabs.push({ id: "platform", label: "플랫폼" });
  }
  tabs.push({ id: "common", label: "공통" });
  tabs.push({ id: "accounting", label: "회계" });
  for (const industry of activeIndustries) {
    tabs.push({
      id: industry,
      label: INDUSTRY_LABELS[industry],
      industry,
    });
  }
  return tabs;
}

/**
 * 메뉴가 특정 탭에서 노출되어야 하는지 판정.
 *
 * 매핑:
 *   platform 탭 ← scope.kind === "platform"
 *   공통 탭     ← scope.kind === "common"
 *   회계 탭     ← scope.kind === "accounting"
 *   industry 탭 ← scope.kind === "industry" && scope.industry === tab.industry
 */
export function isMenuVisibleInTab(scope: MenuScope, tab: SidebarTab): boolean {
  if (tab.id === "platform" && scope.kind === "platform") return true;
  if (tab.id === "common" && scope.kind === "common") return true;
  if (tab.id === "accounting" && scope.kind === "accounting") return true;
  if (
    scope.kind === "industry" &&
    tab.id !== "platform" &&
    tab.id !== "common" &&
    tab.id !== "accounting"
  ) {
    return scope.industry === tab.id;
  }
  return false;
}

/**
 * 레거시 `requireModule` (haccp/gmp) → `MenuScope` 변환.
 *
 * Y-3 → Y-4 호환 기간 동안 사용. Y-4 완료 후 `requireModule` 폴백 제거.
 */
export function requireModuleToScope(
  requireModule: "haccp" | "gmp" | undefined,
): MenuScope | null {
  if (requireModule === "haccp") return { kind: "industry", industry: "food" };
  if (requireModule === "gmp") return { kind: "industry", industry: "cosmetic" };
  return null;
}

/**
 * 메뉴 항목 — 사이드바 렌더링 + 라우팅 통합 모델.
 *
 * `scope` 필수 — TypeScript 가 누락 시 컴파일 에러.
 */
export type MenuItem = {
  /** 표시 라벨 */
  label: string;
  /** 이동 경로 (wouter Route path) */
  path: string;
  /** lucide-react 아이콘 컴포넌트 */
  icon: LucideIcon;
  /** 노출 권한 role 화이트리스트 */
  roles?: string[];

  /**
   * 메뉴 노출 범위 (Phase Y-3 신규 — 필수).
   * 누락 시 TypeScript 컴파일 에러.
   */
  scope: MenuScope;

  /** 강조 (예: 신규 기능) */
  highlight?: boolean;
  /** 우측 배지 텍스트 */
  badge?: string;
  /** 회계 탭 sub-group (예: "매입·구매", "매출·판매") */
  group?: string;
  /**
   * 레거시 호환 — 슈퍼관리자 work 카테고리.
   * Y-4 / Y-6 완료 후 제거 예정.
   */
  category?: string;

  /**
   * @deprecated 레거시 호환 (Y-3 → Y-4 전환 기간만 사용).
   * Y-6 사이드바 자동 탭 도입 후 제거.
   */
  requireModule?: "haccp" | "gmp";
};
