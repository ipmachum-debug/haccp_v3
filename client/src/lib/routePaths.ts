/**
 * 라우트 path 단일 source — drift 차단 인프라
 *
 * ============================================================================
 * 배경 (2026-04-28):
 *   2026-04-07 (d1d212a) 사이드바 컴포넌트 이동 시점에 "커뮤니케이션 로그"
 *   메뉴 항목 누락 발생. App.tsx 의 라우트는 살아있었지만 사이드바는 별도
 *   hardcoded 라 drift 발생.
 *
 *   진짜 근본 원인: path 문자열이 두 군데 hardcoded
 *     - App.tsx:454            <Route path="/dashboard/accounting/communication-log" ... />
 *     - DashboardLayout.tsx    { ..., path: "/dashboard/accounting/communication-log", ... }
 *   → 한 쪽만 변경하면 drift. 메뉴/라우트 동기화 강제 수단 없음.
 *
 * ============================================================================
 * 해결:
 *   본 파일이 path 의 단일 source. App.tsx 와 DashboardLayout.tsx 가 둘 다
 *   import 하여 사용 → TypeScript 가 컴파일 타임에 path 일치 보장.
 *
 *   const ROUTES = {
 *     ACCOUNTING_COMMUNICATION_LOG: "/dashboard/accounting/communication-log",
 *     ...
 *   } as const;
 *
 *   // App.tsx
 *   <Route path={ROUTES.ACCOUNTING_COMMUNICATION_LOG} component={...} />
 *
 *   // DashboardLayout.tsx
 *   { ..., path: ROUTES.ACCOUNTING_COMMUNICATION_LOG, ... }
 *
 *   → 한 군데(ROUTES) 만 수정하면 양쪽 자동 동기화.
 *   → 오타 시 TypeScript 가 즉시 알림 (`Property '...' does not exist`).
 *
 * ============================================================================
 * 점진 이주 (Strangler Fig):
 *   - 신규 라우트는 반드시 본 파일에 등록 후 사용
 *   - 기존 라우트는 건드릴 때 함께 이주
 *   - 본 PR 은 "기준정보" 그룹 6개만 시범 이주 — 패턴 정착
 *   - 후속 PR 들이 점진적으로 나머지 ~336개 라우트 이주
 *
 * 향후 확장 방향 (별도 PR):
 *   - 라우트 메타데이터 (component / role / module / breadcrumb) 통합
 *   - 사이드바 메뉴 메타데이터 통합 (group, label, icon)
 *   - 라우트 + 메뉴 자동 생성 (single source of truth)
 *
 * ============================================================================
 */

export const ROUTES = {
  // ── 회계 탭 / 기준정보 그룹 ──
  ACCOUNTING_PARTNERS: "/dashboard/accounting/partners",
  // PR #248 — 중간재 관리
  MANUFACTURING_INTERMEDIATES: "/dashboard/manufacturing/intermediates",
  // PR #264 — 작성자 사전 검토 페이지
  WRITER_REVIEW: "/dashboard/writer-review/:approvalId",
  // Partner CRM Phase 1 (2026-05-05) — SNS-style feed + 360 detail
  PARTNERS_FEED: "/dashboard/partners/feed",
  PARTNERS_DETAIL: "/dashboard/partners/:id",
  ACCOUNTING_COMMUNICATION_LOG: "/dashboard/accounting/communication-log",
  ACCOUNTING_PARTNER_CREDIT: "/dashboard/accounting/partner-credit",
  ACCOUNTING_PARTNER_PRICES: "/dashboard/accounting/partner-prices",
  ACCOUNTING_ACCOUNTS: "/dashboard/accounting/accounts",
  ACCOUNTING_FIXED_ASSETS: "/dashboard/accounting/fixed-assets",
} as const;

/** 모든 ROUTE path 의 union 타입 — 메뉴 path 가 ROUTES 에 등록된 것만 받도록 강제 */
export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES];
