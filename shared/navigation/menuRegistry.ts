/**
 * 메뉴 레지스트리 — 사이드바 메뉴의 단일 정본 (UI/UX 개편 2-a, 2026-10-14)
 *
 * 이전: 메뉴가 다섯 곳에서 만들어졌다 — DashboardLayout 의 배열 4개(HACCP 폴백·WORK·회계·슈퍼관리자) + clientMenuEngine
 * 공통 그룹 + 업종 플러그인 6개. 같은 경로가 2곳 이상에 71개, 같은 경로·다른 이름 9개 (14-ui-ux-restructure-spec.md §1-1).
 *
 * 2-a 의 약속: **화면상 메뉴는 기존과 완전히 같다.** 이 파일은 그 배열들을 한 곳으로 옮긴 것이고, 탭별 결과가
 * 2026-10-14 스냅샷(server/__fixtures__/menu-snapshot-2026-10-14.json)과 일치하는지 테스트(server/menuRegistry.test.ts)로 고정한다.
 * 허브 8개 전환·중복 정리·역할 확대는 2-b 에서 이 파일만 바꿔서 한다.
 *
 * 규칙
 *  - shared 는 타입·상수·순수 선택 함수만. 아이콘은 이름(string)으로 두고 클라이언트(clientMenuEngine.getIcon)가 컴포넌트로 바꾼다.
 *  - path 는 문자열 리터럴. client/src/lib/routePaths.ts 의 ROUTES 와 어긋나지 않는지 테스트가 확인한다.
 *  - 업종 플러그인(server/domain/plugins/*.ts) 의 menu.groups 는 아직 그대로 — HACCP 탭에 플러그인이 있으면 공통 그룹(PLUGIN_COMMON_GROUPS) 과 합친다.
 */

export type MenuTab = "work" | "finance" | "haccp" | "superAdmin";
/** ERP 전용 모드(HACCP 모듈 없음) 에서만 / 통합 모드에서만 보이는 항목. 없으면 양쪽 모두 */
export type MenuMode = "erpOnly" | "full";
export type MenuFeatureFlag = "GOGOGOPICK_INTEGRATION";

export interface MenuPlacement {
  tab: MenuTab;
  mode?: MenuMode;
  /** 클라이언트 feature flag 가 켜져 있을 때만 */
  feature?: MenuFeatureFlag;
  /** lucide-react 아이콘 이름 */
  icon: string;
  label: string;
  path: string;
  roles: readonly string[];
  group?: string;
  requireModule?: string;
  highlight?: boolean;
  category?: string;
  /** 업종 전용 항목 (2-c) — 경로가 업종 공통(/quality/{기능})이라 경로로 업종을 알 수 없을 때 이 값으로 업종 격리 */
  industry?: IndustryKey;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-c (2026-10-14): 업종 품질 8종 공통 경로 — /quality/{기능} 한 벌
// 화면은 이미 공통 페이지(<NonconformingPage industry=…/> 등)였다. 경로만 업종별 48개 → 공통 8개로 합치고,
// 업종은 테넌트 설정에서 판별한다. 옛 경로 48개는 LEGACY_REDIRECTS (쿼리 industry 로 업종 전달).
// ─────────────────────────────────────────────────────────────────────────────
export const INDUSTRY_KEYS = ["food", "cosmetic", "pharmaceutical", "health-functional", "medical-device", "general-manufacturing"] as const;
export type IndustryKey = (typeof INDUSTRY_KEYS)[number];
export const QUALITY_FUNCTIONS = ["change-control", "nonconforming", "corrective-action", "audit", "training", "calibration", "supplier", "risk-assessment"] as const;
export type QualityFunction = (typeof QUALITY_FUNCTIONS)[number];
export const qualityPath = (fn: QualityFunction) => `/quality/${fn}`;

/**
 * 테넌트 업종 카테고리(industryConfig) → 업종 키. 레이아웃의 메뉴 업종 격리와 같은 표에
 * 의료기기 플러그인의 임시 카테고리 electronics 를 더했다 (medical-device.ts: category "electronics").
 */
export function industryKeyOfCategory(category: string | null | undefined): IndustryKey | null {
  const map: Record<string, IndustryKey> = {
    food: "food", cosmetics: "cosmetic", pharma: "pharmaceutical", supplement: "health-functional",
    general: "general-manufacturing", electronics: "medical-device",
  };
  return category ? map[category] ?? null : null;
}

/**
 * 생산 설계 4항목 (2026-10-19, 설계 18 §13) — 기본 메뉴와 업종 플러그인 공통 그룹이 같은 정의를 쓴다.
 * 관리자용 (기준을 정하는 곳). 1단계는 읽기 전용, 수정은 기존 화면으로 안내.
 */
export const DESIGN_PLACEMENTS: readonly MenuPlacement[] = [
  { tab: "haccp", icon: "Activity", label: "설계 현황", path: "/design", roles: ["super_admin", "admin"] },
  { tab: "haccp", icon: "Factory", label: "우리 공장", path: "/design/factory", roles: ["super_admin", "admin"] },
  { tab: "haccp", icon: "FlaskConical", label: "제품 배합", path: "/design/recipes", roles: ["super_admin", "admin"] },
  { tab: "haccp", icon: "RotateCcw", label: "변경·적용 이력", path: "/design/history", roles: ["super_admin", "admin"] },
];

export const MENU_PLACEMENTS: readonly MenuPlacement[] = [
  // ── HACCP 탭 (업종 플러그인이 없을 때의 폴백 메뉴 = 기존 DashboardLayout.menuItems 그대로) ──
  { tab: "haccp", icon: "Crown", label: "슈퍼관리자 대시보드", path: "/dashboard/super-admin", roles: ["super_admin"], category: "work" },
  { tab: "haccp", icon: "UserCheck", label: "사용자 승인", path: "/dashboard/user-approval", roles: ["super_admin"], category: "work" },
  { tab: "haccp", icon: "Building", label: "테넌트 관리", path: "/dashboard/tenants", roles: ["super_admin"], category: "work" },
  { tab: "haccp", icon: "LayoutDashboard", label: "통합 대시보드", path: "/dashboard", roles: ["admin", "accountant", "monitor", "inspector", "worker"], group: "대시보드" },
  { tab: "haccp", icon: "Clock", label: "오늘의 생산", path: "/dashboard/production/today", roles: ["super_admin", "admin", "worker", "inspector", "monitor"], group: "생산", requireModule: "haccp", highlight: true },
  { tab: "haccp", icon: "Package", label: "생산관리", path: "/dashboard/production-management", roles: ["super_admin", "admin", "worker"], group: "생산", requireModule: "haccp" },
  { tab: "haccp", icon: "Calendar", label: "생산운영", path: "/dashboard/production-operations", roles: ["super_admin", "admin", "worker"], group: "생산", requireModule: "haccp" },
  { tab: "haccp", icon: "FileCode", label: "제조기준관리", path: "/dashboard/manufacturing-standards", roles: ["super_admin", "admin", "worker"], group: "생산", requireModule: "haccp" },
  // 생산 설계 허브 (2026-10-19, 설계 18 §13) — 관리자용. 업종 플러그인 회사는 PLUGIN_COMMON_GROUPS 의 같은 항목으로 보인다
  ...DESIGN_PLACEMENTS.map((p) => ({ ...p, group: "생산 설계", requireModule: "haccp" })),
  { tab: "haccp", icon: "Shield", label: "CCP 관리", path: "/quality/ccp-monitoring", roles: ["super_admin", "admin", "worker", "inspector", "monitor"], group: "품질·검사", requireModule: "haccp" },
  { tab: "haccp", icon: "ClipboardCheck", label: "검사 관리", path: "/dashboard/inspections", roles: ["super_admin", "admin", "accountant", "worker", "inspector", "monitor"], group: "품질·검사", requireModule: "haccp" },
  { tab: "haccp", icon: "ListChecks", label: "HACCP 체크리스트", path: "/quality/checklists", roles: ["super_admin", "admin", "worker", "inspector", "monitor"], group: "품질·검사", requireModule: "haccp" },
  { tab: "haccp", icon: "Warehouse", label: "재고 관리", path: "/inventory-management", roles: ["super_admin", "admin", "accountant", "worker"], group: "재고·운영" },
  { tab: "haccp", icon: "Bell", label: "알림 관리", path: "/dashboard/notifications", roles: ["admin", "accountant", "monitor", "inspector", "worker"], group: "재고·운영" },
  { tab: "haccp", icon: "CheckCircle", label: "승인 관리", path: "/dashboard/approval", roles: ["super_admin", "admin", "monitor", "inspector", "worker"], group: "재고·운영" },
  { tab: "haccp", icon: "FileText", label: "문서 출력", path: "/dashboard/document-output", roles: ["super_admin", "admin", "accountant", "monitor", "inspector"], group: "재고·운영" },
  { tab: "haccp", icon: "Database", label: "마스터 데이터", path: "/dashboard/master-data", roles: ["super_admin", "admin", "accountant"], group: "마스터" },
  { tab: "haccp", icon: "Package", label: "품목 마스터", path: "/dashboard/item-master", roles: ["super_admin", "admin", "accountant"], group: "마스터" },
  { tab: "haccp", icon: "ClipboardCheck", label: "모바일 빠른 점검", path: "/mobile-quick-check", roles: ["admin", "worker", "inspector"], group: "마스터", requireModule: "haccp" },
  { tab: "haccp", icon: "FileWarning", label: "부적합제품관리", path: "/quality/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (HACCP)", requireModule: "haccp" }, // 2026-10-14 공통 부적합으로 이전 (14c)
  { tab: "haccp", icon: "RotateCcw", label: "회수 시뮬레이션", path: "/recall-simulation", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (HACCP)", requireModule: "haccp" },
  { tab: "haccp", icon: "AlertTriangle", label: "시정조치 관리", path: "/corrective-actions", roles: ["super_admin", "admin", "inspector", "monitor", "worker"], group: "품질관리 (HACCP)", requireModule: "haccp" },
  { tab: "haccp", icon: "Activity", label: "F-3 운영 현황", path: "/dashboard/haccp/f3-dashboard", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (HACCP)", requireModule: "haccp" },
  // 2-b-2 (2026-10-14) 통합: /dashboard/haccp/f3-trends → F-3 운영 현황의 [Deviation 트렌드 →] 링크. 경로·허브 매핑은 유지
  { tab: "haccp", icon: "GitBranch", label: "변경관리", path: "/quality/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "food", group: "품질관리 (HACCP)", requireModule: "haccp" },
  { tab: "haccp", icon: "LayoutDashboard", label: "GMP 운영 현황", path: "/dashboard/cosmetic/dashboard", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Sparkles", label: "BMR (제조기록)", path: "/dashboard/cosmetic/bmr", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "FlaskConical", label: "배합표 (Formula)", path: "/dashboard/cosmetic/formula", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Tag", label: "라벨 / 전성분", path: "/dashboard/cosmetic/label", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Truck", label: "QA 출고 (Release)", path: "/dashboard/cosmetic/release", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Thermometer", label: "안정성시험", path: "/dashboard/cosmetic/stability", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리", path: "/quality/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "cosmetic", group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리", path: "/quality/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "cosmetic", group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (Audit)", path: "/quality/audit", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "cosmetic", group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (시정·예방)", path: "/quality/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "cosmetic", group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 / 훈련", path: "/quality/training", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "cosmetic", group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "Sliders", label: "검교정 / 설비 자격", path: "/quality/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "cosmetic", group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "Building", label: "공급업체 (AVL)", path: "/quality/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "cosmetic", group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험 평가 (ICH Q9)", path: "/quality/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "cosmetic", group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리 (ISO 13485)", path: "/quality/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "medical-device", group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리 (ISO 13485)", path: "/quality/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "medical-device", group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (ISO 13485)", path: "/quality/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "medical-device", group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (ISO 13485)", path: "/quality/audit", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "medical-device", group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 (ISO 13485)", path: "/quality/training", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "medical-device", group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "Sliders", label: "검교정 (ISO 13485)", path: "/quality/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "medical-device", group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "Building", label: "공급업체 (ISO 13485)", path: "/quality/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "medical-device", group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험관리 ISO 14971", path: "/quality/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "medical-device", group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리 (일반제조)", path: "/quality/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "general-manufacturing", group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리 (일반제조)", path: "/quality/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "general-manufacturing", group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (일반제조)", path: "/quality/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "general-manufacturing", group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (일반제조)", path: "/quality/audit", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "general-manufacturing", group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 (일반제조)", path: "/quality/training", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "general-manufacturing", group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "Sliders", label: "검교정 (일반제조)", path: "/quality/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "general-manufacturing", group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "Building", label: "공급업체 (일반제조)", path: "/quality/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "general-manufacturing", group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험 평가 (일반제조)", path: "/quality/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "general-manufacturing", group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리 (KGMP)", path: "/quality/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "pharmaceutical", group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리 (KGMP)", path: "/quality/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "pharmaceutical", group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (KGMP)", path: "/quality/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "pharmaceutical", group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (KGMP)", path: "/quality/audit", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "pharmaceutical", group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 / 훈련 (KGMP)", path: "/quality/training", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "pharmaceutical", group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Sliders", label: "검교정 IQ/OQ/PQ (KGMP)", path: "/quality/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "pharmaceutical", group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Building", label: "공급업체 AVL (KGMP)", path: "/quality/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "pharmaceutical", group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험 평가 ICH Q9 (KGMP)", path: "/quality/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "pharmaceutical", group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리 (건기식)", path: "/quality/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "health-functional", group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리 (건기식)", path: "/quality/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "health-functional", group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (건기식)", path: "/quality/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "health-functional", group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (건기식)", path: "/quality/audit", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "health-functional", group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 (건기식)", path: "/quality/training", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "health-functional", group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "Sliders", label: "검교정 (건기식)", path: "/quality/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "health-functional", group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "Building", label: "공급업체 (건기식)", path: "/quality/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "health-functional", group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험 평가 (건기식)", path: "/quality/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], industry: "health-functional", group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "Building2", label: "감사관리", path: "/dashboard/audit-management", roles: ["super_admin", "admin", "inspector", "monitor"], group: "감사·검증", requireModule: "haccp" },
  { tab: "haccp", icon: "ClipboardCheck", label: "HACCP 검증", path: "/dashboard/haccp-verification", roles: ["super_admin", "admin", "inspector", "monitor"], group: "감사·검증", requireModule: "haccp" },
  { tab: "haccp", icon: "Settings", label: "시스템 관리", path: "/admin/settings", roles: ["super_admin", "admin"], group: "시스템" },
  { tab: "haccp", feature: "GOGOGOPICK_INTEGRATION", icon: "ArrowLeftRight", label: "GOGOGOPICK 연동", path: "/admin/opscore-sync", roles: ["super_admin", "admin"], group: "시스템", highlight: true },

  // ── WORK 탭 — ERP 전용 모드와 통합 모드가 라벨·역할이 달라 두 벌 (2-b 에서 통합) ──
  { tab: "work", mode: "erpOnly", icon: "LayoutDashboard", label: "대시보드", path: "/dashboard", roles: ["super_admin", "admin", "worker", "inspector"] },
  { tab: "work", mode: "erpOnly", icon: "Clock", label: "Today", path: "/dashboard/today", roles: ["super_admin", "admin", "worker", "inspector"] },
  { tab: "work", mode: "erpOnly", icon: "Upload", label: "데이터 임포트", path: "/dashboard/data-import", roles: ["super_admin", "admin"] },
  { tab: "work", mode: "erpOnly", icon: "Bell", label: "알림 관리", path: "/dashboard/notifications", roles: ["admin", "worker"] },
  { tab: "work", mode: "full", icon: "LayoutDashboard", label: "통합 대시보드", path: "/dashboard", roles: ["super_admin", "admin", "worker", "inspector"] },
  { tab: "work", mode: "full", icon: "Clock", label: "Today", path: "/dashboard/today", roles: ["super_admin", "admin", "worker", "inspector"] },
  { tab: "work", mode: "full", icon: "Upload", label: "데이터 임포트", path: "/dashboard/data-import", roles: ["super_admin", "admin"] },
  { tab: "work", mode: "full", icon: "Scan", label: "스캔 체크리스트 입력", path: "/dashboard/scan-checklist", roles: ["super_admin", "admin", "inspector"] },
  { tab: "work", mode: "full", icon: "Bell", label: "사내공지관리", path: "/dashboard/accounting/notice-board", roles: ["super_admin", "admin"] },

  // ── 회계 탭 (순서는 ERP 전용 모드 기준, erpOnly 표시 항목은 통합 모드에서 제외) ──
  { tab: "finance", icon: "TrendingUp", label: "대시보드", path: "/dashboard/accounting", roles: ["super_admin", "admin"], group: "개요" },
  { tab: "finance", icon: "ClipboardList", label: "발주서", path: "/dashboard/accounting/purchase-orders", roles: ["super_admin", "admin"], group: "매입·구매" },
  { tab: "finance", icon: "PackageMinus", label: "매입 입력", path: "/dashboard/accounting/purchases/create", roles: ["super_admin", "admin"], group: "매입·구매" }, // 2026-10-14 매입·매출 허브 개편으로 메뉴 복귀 (이전 '매입 등록')
  { tab: "finance", icon: "FileText", label: "매입 조회", path: "/dashboard/accounting/purchases/list", roles: ["super_admin", "admin"], group: "매입·구매" },
  { tab: "finance", icon: "FileText", label: "견적서", path: "/dashboard/accounting/quotations", roles: ["super_admin", "admin"], group: "매출·판매" },
  { tab: "finance", icon: "PackagePlus", label: "매출 입력", path: "/dashboard/accounting/sales/create", roles: ["super_admin", "admin"], group: "매출·판매" }, // 2026-10-14 메뉴 복귀 (이전 '매출 등록')
  { tab: "finance", icon: "FileText", label: "매출 조회", path: "/dashboard/accounting/sales/list", roles: ["super_admin", "admin"], group: "매출·판매" },
  { tab: "finance", icon: "Receipt", label: "세금계산서", path: "/dashboard/accounting/tax-invoices", roles: ["super_admin", "admin"], group: "매출·판매" },
  { tab: "finance", icon: "Receipt", label: "B2C 플랫폼 정산", path: "/dashboard/accounting/b2c-platform", roles: ["super_admin", "admin"], group: "매출·판매" },
  { tab: "finance", mode: "erpOnly", icon: "Package", label: "품목 마스터", path: "/dashboard/item-master", roles: ["super_admin", "admin"], group: "품목·재고" },
  { tab: "finance", mode: "erpOnly", icon: "Database", label: "마스터 데이터", path: "/dashboard/master-data", roles: ["super_admin", "admin"], group: "품목·재고" },
  { tab: "finance", mode: "erpOnly", icon: "Warehouse", label: "재고 관리", path: "/inventory-management", roles: ["super_admin", "admin"], group: "품목·재고" },
  { tab: "finance", icon: "Wallet", label: "비용관리", path: "/dashboard/accounting/expense", roles: ["super_admin", "admin"], group: "자금·비용" },
  { tab: "finance", icon: "Landmark", label: "은행 관리", path: "/dashboard/accounting/bank-management", roles: ["super_admin", "admin"], group: "자금·비용" },
  { tab: "finance", icon: "BookOpen", label: "전표 관리", path: "/dashboard/accounting/journal-entries", roles: ["super_admin", "admin"], group: "회계·세무" },
  { tab: "finance", icon: "Receipt", label: "부가세", path: "/dashboard/accounting/vat-management", roles: ["super_admin", "admin"], group: "회계·세무" },
  { tab: "finance", icon: "BarChart3", label: "재무보고서", path: "/dashboard/accounting/financial-reports", roles: ["super_admin", "admin"], group: "회계·세무" },
  { tab: "finance", icon: "Wallet", label: "자금현황", path: "/dashboard/accounting/cash-flow", roles: ["super_admin", "admin"], group: "회계·세무" },
  { tab: "finance", icon: "DollarSign", label: "예산 관리", path: "/dashboard/accounting/budget", roles: ["super_admin", "admin"], group: "회계·세무" },
  { tab: "finance", icon: "DollarSign", label: "급여관리", path: "/dashboard/accounting/payroll", roles: ["super_admin", "admin"], group: "인사·급여" },
  { tab: "finance", icon: "Users", label: "인사관리", path: "/dashboard/accounting/hr", roles: ["super_admin", "admin"], group: "인사·급여" },
  { tab: "finance", icon: "Sparkles", label: "거래처 피드 (CRM)", path: "/dashboard/partners/feed", roles: ["super_admin", "admin"], group: "기준정보", highlight: true },
  { tab: "finance", icon: "Building2", label: "거래처", path: "/dashboard/accounting/partners", roles: ["super_admin", "admin"], group: "기준정보" },
  { tab: "finance", icon: "MessageSquare", label: "커뮤니케이션 로그", path: "/dashboard/accounting/communication-log", roles: ["super_admin", "admin"], group: "기준정보" },
  { tab: "finance", icon: "Shield", label: "신용관리", path: "/dashboard/accounting/partner-credit", roles: ["super_admin", "admin"], group: "기준정보" },
  { tab: "finance", icon: "DollarSign", label: "단가표", path: "/dashboard/accounting/partner-prices", roles: ["super_admin", "admin"], group: "기준정보" },
  { tab: "finance", icon: "BookOpen", label: "계정 과목", path: "/dashboard/accounting/accounts", roles: ["super_admin", "admin"], group: "기준정보" },
  { tab: "finance", icon: "Building2", label: "고정자산", path: "/dashboard/accounting/fixed-assets", roles: ["super_admin", "admin"], group: "기준정보" },
  { tab: "finance", icon: "RotateCcw", label: "반복 거래", path: "/dashboard/accounting/recurring", roles: ["super_admin", "admin"], group: "마감" },
  { tab: "finance", icon: "Clock", label: "마감 관리", path: "/dashboard/accounting/closing-management", roles: ["super_admin", "admin"], group: "마감" },
  { tab: "finance", icon: "FileText", label: "변경이력", path: "/dashboard/accounting/change-log", roles: ["super_admin", "admin"], group: "마감" },
  { tab: "finance", icon: "FolderOpen", label: "문서함", path: "/accounting/documents", roles: ["super_admin", "admin"], group: "마감" },
  { tab: "finance", mode: "erpOnly", icon: "Settings", label: "시스템 관리", path: "/admin/settings", roles: ["super_admin", "admin"], group: "설정" },

  // ── 슈퍼관리자 (WORK 탭에서 super_admin 에게만) ──
  { tab: "superAdmin", icon: "LayoutDashboard", label: "통합 대시보드", path: "/dashboard", roles: ["super_admin"] },
  { tab: "superAdmin", icon: "Clock", label: "Today", path: "/dashboard/today", roles: ["super_admin"] },
  { tab: "superAdmin", icon: "Activity", label: "서버 모니터링", path: "/dashboard/server-monitor", roles: ["super_admin"] },
];

/**
 * 2-b-2 통합으로 사이드바에서 빠진 항목 (경로는 살아 있음).
 * 사이드바에는 그리지 않고, 이미 즐겨찾기한 사용자의 즐겨찾기 표시에만 쓴다 — 통합 때문에 즐겨찾기가 사라지지 않게.
 */
export const CONSOLIDATED_PLACEMENTS: readonly MenuPlacement[] = [
  { tab: "haccp", icon: "TrendingUp", label: "Deviation 트렌드", path: "/dashboard/haccp/f3-trends", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (HACCP)", requireModule: "haccp" },
];

/** 사이드바 active 판별용 — 페이지 내부 탭으로 접근하는 하위 경로 */
export const CHILD_ROUTES: Readonly<Record<string, readonly string[]>> = {
  "/dashboard/production-management": ["/dashboard/batch-management", "/dashboard/batch/new", "/dashboard/batch", "/dashboard/pipeline", "/dashboard/production/prediction"],
  "/dashboard/inspections": ["/dashboard/inspection/material", "/dashboard/inspection/hygiene", "/dashboard/inspection/shipping", "/dashboard/inspection/statistics"],
  "/quality/checklists": ["/dashboard/daily-logs", "/quality/templates", "/dashboard/checklist/employee-health"],
  "/dashboard/approval": ["/dashboard/approval/dashboard"],
  "/quality/ccp-monitoring": ["/dashboard/ccp"],
  "/dashboard/document-output": ["/dashboard/document-output/approved"], // 2-b-3: 라우트 없는 /daily-log 제거
};

/** 데모 계정에 허용되는 메뉴 경로 (핵심 기능만) */
export const DEMO_ALLOWED_PATHS: readonly string[] = [
  "/dashboard",
  "/dashboard/today",
  "/dashboard/production-management",
  "/dashboard/production-operations",
  "/dashboard/manufacturing-standards",
  "/quality/ccp-monitoring",
  "/dashboard/inspections",
  "/quality/checklists",
  "/inventory-management",
  "/dashboard/notifications",
  "/dashboard/document-output",
];

/**
 * 업종 플러그인 기반 HACCP 탭의 공통 그룹 (산업 무관) — clientMenuEngine.COMMON_MENU_GROUPS 가 여기서 가져간다.
 * 플러그인 menu.groups 와 order 로 섞인다.
 */
export const PLUGIN_COMMON_GROUPS: ReadonlyArray<{ name: string; order: number; items: readonly MenuPlacement[] }> = [
  {
    name: "대시보드",
    order: 0,
    items: [
      { tab: "haccp", icon: "LayoutDashboard", label: "통합 대시보드", path: "/dashboard", roles: ["admin", "accountant", "monitor", "inspector", "worker"] },
    ],
  },
  {
    // 업종 플러그인 회사(단지 등)의 HACCP 메뉴에도 생산 설계 — 업종 무관 (2026-10-19)
    name: "생산 설계",
    order: 30,
    items: DESIGN_PLACEMENTS,
  },
  {
    name: "재고·운영",
    order: 40,
    items: [
      { tab: "haccp", icon: "Warehouse", label: "재고 관리", path: "/inventory-management", roles: ["super_admin", "admin", "accountant", "worker"] },
      { tab: "haccp", icon: "Bell", label: "알림 관리", path: "/dashboard/notifications", roles: ["admin", "accountant", "monitor", "inspector", "worker"] },
      { tab: "haccp", icon: "CheckCircle", label: "승인 관리", path: "/dashboard/approval", roles: ["super_admin", "admin", "monitor", "inspector", "worker"] },
      { tab: "haccp", icon: "FileText", label: "문서 출력", path: "/dashboard/document-output", roles: ["super_admin", "admin", "accountant", "monitor", "inspector"] },
    ],
  },
  {
    name: "마스터",
    order: 50,
    items: [
      { tab: "haccp", icon: "Database", label: "마스터 데이터", path: "/dashboard/master-data", roles: ["super_admin", "admin", "accountant"] },
      { tab: "haccp", icon: "Package", label: "품목 마스터", path: "/dashboard/item-master", roles: ["super_admin", "admin", "accountant"] },
    ],
  },
  {
    name: "시스템",
    order: 100,
    items: [
      { tab: "haccp", icon: "Settings", label: "시스템 관리", path: "/admin/settings", roles: ["super_admin", "admin"] },
    ],
  },
];

/** 플러그인 엔진용 슈퍼관리자 항목 (clientMenuEngine.SUPER_ADMIN_MENU_ITEMS) */
export const PLUGIN_SUPER_ADMIN_ITEMS: readonly MenuPlacement[] = [
  { tab: "superAdmin", icon: "Crown", label: "슈퍼관리자 대시보드", path: "/dashboard/super-admin", roles: ["super_admin"] },
  { tab: "superAdmin", icon: "UserCheck", label: "사용자 승인", path: "/dashboard/user-approval", roles: ["super_admin"] },
  { tab: "superAdmin", icon: "Building", label: "테넌트 관리", path: "/dashboard/tenants", roles: ["super_admin"] },
];

export interface SelectMenuContext {
  /** HACCP 모듈 없이 ERP 만 쓰는 테넌트 */
  isErpOnly: boolean;
  /** 켜진 feature flag */
  features?: Partial<Record<MenuFeatureFlag, boolean>>;
}

/** 탭 하나의 메뉴 항목을 기존 배열과 같은 순서로 돌려준다 (순수 함수) */
export function selectTabMenu(tab: MenuTab, ctx: SelectMenuContext): MenuPlacement[] {
  const mode: MenuMode = ctx.isErpOnly ? "erpOnly" : "full";
  return MENU_PLACEMENTS.filter((p) => {
    if (p.tab !== tab) return false;
    if (p.mode && p.mode !== mode) return false;
    if (p.feature && !ctx.features?.[p.feature]) return false;
    return true;
  });
}

/** 네 탭을 전부 합친 목록 — 즐겨찾기 해석·활성 메뉴 판별용 (기존 allMenuItems 순서: haccp → finance → work → superAdmin) */
export function selectAllMenus(ctx: SelectMenuContext): MenuPlacement[] {
  return [
    ...selectTabMenu("haccp", ctx),
    ...selectTabMenu("finance", ctx),
    ...selectTabMenu("work", ctx),
    ...selectTabMenu("superAdmin", ctx),
  ];
}

/** 현재 location 이 메뉴 경로의 하위 경로인가 */
export function isChildRouteOf(menuPath: string, location: string): boolean {
  const children = CHILD_ROUTES[menuPath];
  if (!children) return false;
  return children.some((cp) => location === cp || location.startsWith(cp + "/"));
}


// ─────────────────────────────────────────────────────────────────────────────
// 허브 (UI/UX 개편 2-b-1, 2026-10-14) — 14-ui-ux-restructure-spec.md §3
// 사이드바를 WORK/회계/HACCP 탭 대신 업무 허브 8개 + 플랫폼으로 그린다.
// 2-b-1 의 약속: 사용자가 보는 메뉴 항목의 **집합은 같고 배치만 바뀐다**. 항목 제거·통합은 2-b-2 (검증표와 함께).
// ─────────────────────────────────────────────────────────────────────────────

export type HubId = "today" | "trade" | "items" | "production" | "design" | "quality" | "finance" | "settings" | "platform";

export interface HubDef {
  id: HubId;
  label: string;
  order: number;
  /** lucide 아이콘 이름 */
  icon: string;
  /** 허브 전체가 요구하는 구독 모듈 (erp 허브는 ERP 모듈 없으면 숨김 — 이전 회계 탭 가림과 같은 효과) */
  requireModule?: "erp" | "haccp";
  /** 슈퍼관리자 전용 */
  superAdminOnly?: boolean;
  /** 허브 색 토큰 (tailwind 색 이름) — 참고 이미지(14b)의 허브별 색 */
  tone: "blue" | "orange" | "green" | "violet" | "red" | "amber" | "teal" | "slate" | "yellow";
}

export const HUBS: readonly HubDef[] = [
  { id: "today", label: "오늘 할 일", order: 1, icon: "Home", tone: "blue" },
  // 2026-10-14 대표 결정: 구매·입고 + 판매·출고 → 매입·매출 관리 (허브 안 [매입|매출] 탭). 업무 허브 8 → 7
  { id: "trade", label: "매입·매출 관리", order: 2, icon: "ArrowLeftRight", requireModule: "erp", tone: "orange" },
  { id: "items", label: "품목·재고", order: 3, icon: "Boxes", tone: "green" },
  { id: "production", label: "생산관리", order: 4, icon: "Factory", tone: "violet" },
  // 2026-10-19 대표 결정 (설계 18 §13): 생산 설계 = 무엇을, 어떤 원료와 설비로, 어떻게 만들 것인가 — 기준을 정하는 곳 (관리자).
  //   생산관리(오늘 얼마나 만들고 실제로 어떻게 됐나) 와 역할 분리
  { id: "design", label: "생산 설계", order: 4.5, icon: "Sliders", tone: "amber" },
  { id: "quality", label: "품질·규정", order: 5, icon: "ShieldCheck", tone: "red" },
  { id: "finance", label: "회계·경영", order: 7, icon: "Landmark", requireModule: "erp", tone: "teal" },
  { id: "settings", label: "환경설정", order: 8, icon: "Settings", tone: "slate" },
  { id: "platform", label: "플랫폼 관리", order: 9, icon: "Crown", superAdminOnly: true, tone: "yellow" },
];

/**
 * 허브 안 탭 — 매입·매출 관리 허브의 [매입 | 매출] (2026-10-14 대표 결정).
 * 탭은 **사이드바 탐색 단위**일 뿐이다. 발주서·견적서·매입·매출의 화면·API·데이터·권한은 각자 그대로다.
 */
export type HubTabId = "purchase" | "sales";
export const HUB_TABS: Partial<Readonly<Record<HubId, ReadonlyArray<{ id: HubTabId; label: string }>>>> = {
  trade: [{ id: "purchase", label: "매입" }, { id: "sales", label: "매출" }],
};

/**
 * 허브 안 배치 — 탭(없으면 모든 탭 공통) · 소구역 제목 · 순서.
 * 매입 탭: 발주서 → 매입 입력 → 매입 조회 / 매출 탭: 견적서 → 매출 입력 → 매출 조회 (+ 정산)
 * 거래처 소구역은 매입·매출 양쪽에서 쓰므로 탭과 무관하게 항상 보인다.
 * 화면 탐색 순서일 뿐 업무 강제 순서가 아니다 — 발주서 없이 매입, 견적서 없이 매출 입력 가능.
 */
export const HUB_ITEM_LAYOUT: Readonly<Record<string, { tab?: HubTabId; section?: string; order: number }>> = {
  "/dashboard/accounting/purchase-orders": { tab: "purchase", order: 1 },
  "/dashboard/accounting/purchases/create": { tab: "purchase", order: 2 },
  "/dashboard/accounting/purchases/list": { tab: "purchase", order: 3 },
  "/dashboard/accounting/quotations": { tab: "sales", order: 1 },
  "/dashboard/accounting/sales/create": { tab: "sales", order: 2 },
  "/dashboard/accounting/sales/list": { tab: "sales", order: 3 },
  "/dashboard/accounting/tax-invoices": { tab: "sales", section: "정산", order: 4 },
  "/dashboard/accounting/b2c-platform": { tab: "sales", section: "정산", order: 5 },
  "/dashboard/partners/feed": { section: "거래처", order: 10 },
  "/dashboard/accounting/partners": { section: "거래처", order: 11 },
  "/dashboard/accounting/communication-log": { section: "거래처", order: 12 },
  "/dashboard/accounting/partner-prices": { section: "거래처", order: 13 },
  // 플랫폼 허브 — 기존 항목 뒤에 'AI·자동화' 소구역
  "/dashboard/ai-assistant": { section: "AI·자동화", order: 5000 },
  "/dashboard/agent": { section: "AI·자동화", order: 5001 },
};

// ─────────────────────────────────────────────────────────────────────────────
// 3-b (2026-10-14): 허브 입구 화면 + 역할별 첫 화면 (명세 §3: 허브 첫 화면 = "지금 처리할 것")
// ─────────────────────────────────────────────────────────────────────────────

/** 허브 입구 화면 경로 — /hub/{허브} */
export const hubHomePath = (hub: HubId) => `/hub/${hub}`;
/** 입구 화면이 있는 허브 (환경설정·플랫폼은 메뉴 모음이라 입구 없음) */
export const HUBS_WITH_HOME: readonly HubId[] = ["today", "trade", "items", "production", "quality", "finance"];

/**
 * 로그인 직후 첫 화면 (명세 §3 역할별 첫 화면). 메뉴·권한은 바꾸지 않는다 — 처음 여는 화면만.
 * 작업자 = 오늘의 생산 / 품질 = 품질·규정 입구(오늘 쓸 기록지) / 회계 = 회계·경영 입구(받은편지함) /
 * 관리자(대표) = 통합 대시보드(경영 상황판) / 슈퍼관리자 = 슈퍼관리자 대시보드 / 일반 직원 = 공지
 */
export const HOME_PATH_BY_ROLE: Readonly<Record<string, string>> = {
  worker: "/dashboard/production/today",
  inspector: "/hub/quality",
  monitor: "/hub/quality",
  accountant: "/hub/finance",
  admin: "/dashboard",
  super_admin: "/dashboard/super-admin",
  employee: "/board",
};
export function homePathFor(role: string | null | undefined): string {
  return (role && HOME_PATH_BY_ROLE[role]) || "/dashboard";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-b-4 (2026-10-14): 모바일 하단바 — 역할별 핵심 화면 + 알림 + 메뉴(허브 사이드바 열기)
//
// 역할마다 후보 경로를 우선순위대로 두고, 그 사용자가 **메뉴에서 볼 수 있는 경로만** 앞에서부터 MOBILE_NAV_SLOTS 개 고른다
// (선택은 레이아웃이 계산한 '보이는 메뉴 경로' 기준 → 업종·모듈·데모·권한 필터가 그대로 적용, 권한 없는 화면은 하단바에 못 나온다).
// employee 는 사이드바가 없으므로 공지·알림만.
// ─────────────────────────────────────────────────────────────────────────────

export const MOBILE_NAV_SLOTS = 3;

/** 하단바에서 쓰는 짧은 이름 (5글자 안팎) */
export const MOBILE_NAV_LABELS: Readonly<Record<string, string>> = {
  "/dashboard/production/today": "오늘 생산",
  "/dashboard/today": "오늘",
  "/dashboard": "대시보드",
  "/quality/ccp-monitoring": "CCP",
  "/quality/checklists": "체크리스트",
  "/dashboard/inspections": "검사",
  "/inventory-management": "재고",
  "/dashboard/production-management": "생산",
  "/dashboard/approval": "승인",
  "/dashboard/accounting/sales/list": "매출",
  "/dashboard/accounting": "회계",
};

export const MOBILE_NAV_CANDIDATES: Readonly<Record<string, readonly string[]>> = {
  super_admin: ["/dashboard", "/dashboard/production-management", "/dashboard/accounting/sales/list", "/inventory-management"],
  admin: ["/dashboard", "/dashboard/production-management", "/dashboard/accounting/sales/list", "/inventory-management", "/quality/ccp-monitoring"],
  worker: ["/dashboard/production/today", "/quality/ccp-monitoring", "/inventory-management", "/dashboard/today"],
  inspector: ["/dashboard/today", "/quality/ccp-monitoring", "/quality/checklists", "/dashboard/inspections"],
  monitor: ["/dashboard/today", "/dashboard/approval", "/quality/ccp-monitoring", "/quality/checklists"],
  accountant: ["/dashboard", "/dashboard/accounting", "/dashboard/inspections", "/dashboard/today"],
};

export type MobileNavItem =
  | { kind: "link"; path: string; label: string; icon: string }
  | { kind: "alerts"; path: string; label: string; icon: string }
  | { kind: "menu"; label: string; icon: string };

/**
 * 역할의 하단바 항목. visiblePaths = 이 사용자에게 실제로 보이는 메뉴 경로 (레이아웃의 필터 결과).
 * iconOf = 경로 → 아이콘 이름 (레지스트리 항목의 아이콘)
 */
export function mobileNavFor(role: string, visiblePaths: ReadonlySet<string>, iconOf: (path: string) => string): MobileNavItem[] {
  if (role === "employee") {
    return [
      { kind: "link", path: "/board", label: "공지", icon: "Home" },
      { kind: "alerts", path: "/board/alerts", label: "알림", icon: "Bell" },
    ];
  }
  const picks = (MOBILE_NAV_CANDIDATES[role] ?? []).filter((p) => visiblePaths.has(p)).slice(0, MOBILE_NAV_SLOTS);
  return [
    ...picks.map((path): MobileNavItem => ({ kind: "link", path, label: MOBILE_NAV_LABELS[path] ?? path, icon: iconOf(path) })),
    { kind: "alerts", path: "/notifications", label: "알림", icon: "Bell" },
    { kind: "menu", label: "메뉴", icon: "Menu" },
  ];
}

/** 경로 → 허브. 부록 14a 의 행선지 그대로. 업종 품질(/dashboard/{업종}/{기능}) 과 화장품 GMP 는 전부 품질·규정 */
export const HUB_BY_PATH: Readonly<Record<string, HubId>> = {
  // design — 생산 설계 (2026-10-19)
  "/design": "design",
  "/design/factory": "design",
  "/design/recipes": "design",
  "/design/history": "design",
  // today
  "/dashboard": "today",
  "/dashboard/notifications": "today",
  "/dashboard/approval": "today",
  "/dashboard/today": "today",
  // trade — 매입 탭
  "/dashboard/accounting/purchase-orders": "trade",
  "/dashboard/accounting/purchases/create": "trade",
  "/dashboard/accounting/purchases/list": "trade",
  "/dashboard/partners/feed": "trade",
  "/dashboard/accounting/partners": "trade",
  "/dashboard/accounting/communication-log": "trade",
  "/dashboard/accounting/partner-prices": "trade",
  // items
  "/inventory-management": "items",
  "/dashboard/master-data": "items",
  "/dashboard/item-master": "items",
  // production
  "/dashboard/production/today": "production",
  "/dashboard/production-management": "production",
  "/dashboard/production-operations": "production",
  "/dashboard/manufacturing-standards": "production",
  // quality
  "/quality/ccp-monitoring": "quality",
  "/dashboard/inspections": "quality",
  "/quality/checklists": "quality",
  "/dashboard/document-output": "quality",
  "/mobile-quick-check": "quality",
  "/dashboard/nonconforming-management": "quality",
  "/recall-simulation": "quality",
  "/corrective-actions": "quality",
  "/dashboard/haccp/f3-dashboard": "quality",
  "/dashboard/haccp/f3-trends": "quality",
  "/dashboard/food/change-control": "quality",
  "/dashboard/cosmetic/dashboard": "quality",
  "/dashboard/cosmetic/bmr": "quality",
  "/dashboard/cosmetic/formula": "quality",
  "/dashboard/cosmetic/label": "quality",
  "/dashboard/cosmetic/release": "quality",
  "/dashboard/cosmetic/stability": "quality",
  "/dashboard/cosmetic/change-control": "quality",
  "/dashboard/cosmetic/nonconforming": "quality",
  "/dashboard/cosmetic/audit": "quality",
  "/dashboard/cosmetic/corrective-action": "quality",
  "/dashboard/cosmetic/training": "quality",
  "/dashboard/cosmetic/calibration": "quality",
  "/dashboard/cosmetic/supplier": "quality",
  "/dashboard/cosmetic/risk-assessment": "quality",
  "/dashboard/medical-device/change-control": "quality",
  "/dashboard/medical-device/nonconforming": "quality",
  "/dashboard/medical-device/corrective-action": "quality",
  "/dashboard/medical-device/audit": "quality",
  "/dashboard/medical-device/training": "quality",
  "/dashboard/medical-device/calibration": "quality",
  "/dashboard/medical-device/supplier": "quality",
  "/dashboard/medical-device/risk-assessment": "quality",
  "/dashboard/general-manufacturing/change-control": "quality",
  "/dashboard/general-manufacturing/nonconforming": "quality",
  "/dashboard/general-manufacturing/corrective-action": "quality",
  "/dashboard/general-manufacturing/audit": "quality",
  "/dashboard/general-manufacturing/training": "quality",
  "/dashboard/general-manufacturing/calibration": "quality",
  "/dashboard/general-manufacturing/supplier": "quality",
  "/dashboard/general-manufacturing/risk-assessment": "quality",
  "/dashboard/pharmaceutical/change-control": "quality",
  "/dashboard/pharmaceutical/nonconforming": "quality",
  "/dashboard/pharmaceutical/corrective-action": "quality",
  "/dashboard/pharmaceutical/audit": "quality",
  "/dashboard/pharmaceutical/training": "quality",
  "/dashboard/pharmaceutical/calibration": "quality",
  "/dashboard/pharmaceutical/supplier": "quality",
  "/dashboard/pharmaceutical/risk-assessment": "quality",
  "/dashboard/health-functional/change-control": "quality",
  "/dashboard/health-functional/nonconforming": "quality",
  "/dashboard/health-functional/corrective-action": "quality",
  "/dashboard/health-functional/audit": "quality",
  "/dashboard/health-functional/training": "quality",
  "/dashboard/health-functional/calibration": "quality",
  "/dashboard/health-functional/supplier": "quality",
  "/dashboard/health-functional/risk-assessment": "quality",
  "/dashboard/audit-management": "quality",
  "/dashboard/haccp-verification": "quality",
  "/dashboard/scan-checklist": "quality",
  "/dashboard/food/allergen": "quality",
  // 2-c 공통 품질 경로
  "/quality/change-control": "quality",
  "/quality/nonconforming": "quality",
  "/quality/corrective-action": "quality",
  "/quality/audit": "quality",
  "/quality/training": "quality",
  "/quality/calibration": "quality",
  "/quality/supplier": "quality",
  "/quality/risk-assessment": "quality",
  "/dashboard/food/environmental-monitoring": "quality",
  "/dashboard/food/food-protection": "quality",
  // trade — 매출 탭
  "/dashboard/accounting/quotations": "trade",
  "/dashboard/accounting/sales/create": "trade",
  "/dashboard/accounting/sales/list": "trade",
  "/dashboard/accounting/tax-invoices": "trade",
  "/dashboard/accounting/b2c-platform": "trade",
  // finance
  "/dashboard/accounting": "finance",
  "/dashboard/accounting/expense": "finance",
  "/dashboard/accounting/bank-management": "finance",
  "/dashboard/accounting/journal-entries": "finance",
  "/dashboard/accounting/vat-management": "finance",
  "/dashboard/accounting/financial-reports": "finance",
  "/dashboard/accounting/cash-flow": "finance",
  "/dashboard/accounting/budget": "finance",
  "/dashboard/accounting/payroll": "finance",
  "/dashboard/accounting/hr": "finance",
  "/dashboard/accounting/partner-credit": "finance",
  "/dashboard/accounting/accounts": "finance",
  "/dashboard/accounting/fixed-assets": "finance",
  "/dashboard/accounting/recurring": "finance",
  "/dashboard/accounting/closing-management": "finance",
  "/dashboard/accounting/change-log": "finance",
  "/accounting/documents": "finance",
  // settings
  "/admin/settings": "settings",
  "/admin/opscore-sync": "settings",
  "/dashboard/data-import": "settings",
  "/dashboard/accounting/notice-board": "settings",
  // platform
  "/dashboard/super-admin": "platform",
  "/dashboard/user-approval": "platform",
  "/dashboard/tenants": "platform",
  "/dashboard/server-monitor": "platform",
  "/dashboard/agent": "platform", // 사이드바 하단 → 플랫폼 허브 'AI·자동화' (2026-10-14 대표 지시). 노출은 AGENT_ALLOWED_EMAILS 그대로
  "/dashboard/ai-assistant": "platform", // 사이드바 하단 → 플랫폼 허브 'AI·자동화' (2026-10-14 대표 지시). 노출은 AI_ASSISTANT_PLACEMENT.roles 그대로
};

/**
 * AI 어시스턴트 — 기존 사이드바 하단 버튼과 같은 노출 조건: super_admin · admin · inspector, 데모 계정 제외.
 * 허브 사이드바에서는 플랫폼 허브 'AI·자동화' 소구역 (자동화 에이전트 위).
 */
export const AI_ASSISTANT_PLACEMENT = {
  icon: "Sparkles", label: "AI 어시스턴트", path: "/dashboard/ai-assistant", section: "AI·자동화",
  roles: ["super_admin", "admin", "inspector"] as readonly string[],
} as const;
export function canSeeAiAssistant(role: string | null | undefined, isDemo: boolean): boolean {
  return !!role && !isDemo && AI_ASSISTANT_PLACEMENT.roles.includes(role);
}

/**
 * 자동화 에이전트 — 역할이 아니라 **허용 이메일**로 노출한다 (기존 사이드바 하단 버튼과 같은 조건, 권한 변경 없음).
 * 허브 사이드바에서는 플랫폼 허브의 'AI·자동화' 소구역에 그린다. 허용 사용자가 admin 이어도 플랫폼 허브에 이 항목 하나만 보인다.
 */
export const AGENT_ALLOWED_EMAILS: readonly string[] = [
  "ipmachum@gmail.com", "sokoorymall@naver.com", "dduckdanji@naver.com", "danjimall@naver.com", "sokoorymall1@naver.com",
];
export const AGENT_PLACEMENT = { icon: "Bot", label: "자동화 에이전트", path: "/dashboard/agent", section: "AI·자동화" } as const;
export function canSeeAgent(email: string | null | undefined): boolean {
  return !!email && AGENT_ALLOWED_EMAILS.includes(email);
}

const INDUSTRY_QUALITY_RE = /^\/dashboard\/(food|cosmetic|pharmaceutical|health-functional|medical-device|general-manufacturing)\//;

/** 경로의 허브. 등록이 없으면 업종 경로는 품질·규정, 그 외는 환경설정(미분류를 숨기지 않기 위해) */
export function hubOf(path: string): HubId {
  const h = HUB_BY_PATH[path];
  if (h) return h;
  if (INDUSTRY_QUALITY_RE.test(path)) return "quality";
  return "settings";
}

// ─────────────────────────────────────────────────────────────────────────────
// 2-b-3 (2026-10-14): 라우트 411개 전부의 허브 귀속 + 옛 URL 리다이렉트
//
// 메뉴에 없는 화면(상세·하위·독립 화면)도 어느 허브 소속인지 데이터로 정한다.
// 메뉴 노출과는 무관하다 — 브레드크럼·허브 진입 화면(3-b)·접근 점검 리포트의 묶음 기준.
// 판정 순서: 공개 화면 → 메뉴 경로(HUB_BY_PATH) → 메뉴 하위 경로(CHILD_ROUTES) → 아래 규칙 → 메뉴 경로의 하위(접두사) → 업종 품질
// ─────────────────────────────────────────────────────────────────────────────

/** 로그인 없이 여는 화면 (허브 없음) */
export const PUBLIC_PATHS: readonly string[] = [
  "/", "/faq", "/support", "/roadmap", "/legal", "/legal/:section", "/signup",
  "/login", "/register", "/pending-approval", "/forgot-password", "/reset-password", "/verify-email", "/404",
];

/**
 * 메뉴 밖 화면의 허브 규칙. `match` 와 같거나 `match + "/"` 로 시작하면 해당 (목록 → /new → /:id 가 한 줄로 묶인다).
 * 위에서부터 처음 맞는 규칙. 구체적인 것을 위에 둔다.
 */
export const ROUTE_HUB_RULES: ReadonlyArray<{ match: string; hub: HubId }> = [
  // 오늘 할 일 — 알림·결재·공지·AI
  { match: "/dashboard/integrated", hub: "today" },
  { match: "/hub", hub: "today" }, // 허브 입구 /hub/:hubId — 각 허브 자체 소속은 화면이 경로 파라미터로 표시
  { match: "/notifications", hub: "today" },
  { match: "/notification-statistics", hub: "today" },
  { match: "/board", hub: "today" },
  { match: "/document-approval", hub: "today" },
  { match: "/dashboard/writer-review", hub: "today" },
  // 매입·매출 관리 — 매입 쪽
  { match: "/dashboard/material-receipt", hub: "trade" },
  { match: "/inventory/receipt", hub: "trade" },
  { match: "/dashboard/purchase-proposal-history", hub: "trade" },
  { match: "/dashboard/suppliers", hub: "trade" },
  { match: "/dashboard/supplier-performance", hub: "trade" },
  { match: "/dashboard/partners", hub: "trade" },
  { match: "/dashboard/accounting/purchases", hub: "trade" }, // 매입 상세 /:id (접두사로 두면 회계로 잡힌다)
  // 품목·재고
  { match: "/dashboard/inventory-management", hub: "items" },
  { match: "/dashboard/inventory-forecast", hub: "items" },
  { match: "/dashboard/inventory-forecast-new", hub: "items" },
  { match: "/dashboard/inventory-analytics", hub: "items" },
  { match: "/dashboard/inventory-trend", hub: "items" },
  { match: "/dashboard/inventory", hub: "items" },
  { match: "/dashboard/products", hub: "items" },
  { match: "/dashboard/materials", hub: "items" },
  { match: "/dashboard/intermediates", hub: "items" },
  { match: "/dashboard/manufacturing/intermediates", hub: "items" },
  { match: "/stock-alerts", hub: "items" },
  { match: "/inventory-lots", hub: "items" },
  { match: "/inventory-prediction", hub: "items" },
  { match: "/inventory-turnover-dashboard", hub: "items" },
  { match: "/category-management", hub: "items" },
  // 생산관리
  { match: "/dashboard/mf-reports", hub: "production" },
  { match: "/dashboard/mf-report", hub: "production" },
  { match: "/dashboard/haccp", hub: "production" }, // ProductionOperations 별칭. /dashboard/haccp/* 하위는 아래 품질 규칙이 먼저 잡는다
  { match: "/dashboard/cost-saving-ai", hub: "production" },
  { match: "/dashboard/batch-cost-analysis", hub: "production" },
  { match: "/dashboard/production-schedule", hub: "production" },
  { match: "/dashboard/production-efficiency", hub: "production" },
  { match: "/dashboard/production-performance", hub: "production" },
  { match: "/dashboard/recipes", hub: "production" },
  { match: "/master/recipe", hub: "production" },
  { match: "/daily-report", hub: "production" },
  { match: "/production-dashboard", hub: "production" },
  { match: "/production-monitor", hub: "production" },
  { match: "/batch-schedule", hub: "production" },
  { match: "/batch-schedule-calendar", hub: "production" },
  { match: "/batch-profitability-dashboard", hub: "production" },
  { match: "/batch", hub: "production" },
  // 매입·매출 관리 — 매출 쪽
  { match: "/inventory/release", hub: "trade" },
  { match: "/dashboard/accounting/sales", hub: "trade" }, // 매출 상세 /:id
  // 회계·경영
  { match: "/accounting-close", hub: "finance" },
  { match: "/accounting", hub: "finance" },
  { match: "/account-categories", hub: "finance" },
  { match: "/material-usage-report-print", hub: "finance" },
  // 환경설정 (품질 규칙보다 먼저 — /quality/notification-settings 등)
  { match: "/quality/notification-settings", hub: "settings" },
  { match: "/dashboard/notification-settings", hub: "settings" },
  { match: "/document-approval-settings", hub: "settings" },
  { match: "/dashboard/users", hub: "settings" },
  { match: "/dashboard/banners", hub: "settings" },
  { match: "/dashboard/audit-logs", hub: "settings" },
  { match: "/dashboard/audit-report", hub: "settings" },
  { match: "/dashboard/upload-history", hub: "settings" },
  { match: "/dashboard/excel-import", hub: "settings" },
  { match: "/dashboard/simplified-import", hub: "settings" },
  { match: "/system-settings", hub: "settings" },
  { match: "/company-settings", hub: "settings" },
  { match: "/organization", hub: "settings" },
  { match: "/admin/employee-approval", hub: "settings" },
  // 플랫폼 (슈퍼관리자)
  { match: "/dashboard/support-manage", hub: "platform" },
  { match: "/dashboard/tenant-management", hub: "platform" },
  { match: "/dashboard/system-monitoring", hub: "platform" },
  { match: "/dashboard/billing-management", hub: "platform" },
  { match: "/admin/user-approval", hub: "platform" },
  { match: "/admin/failed-tasks", hub: "platform" },
  // 품질·규정 — HACCP 기록 양식·CCP·검증·교육
  { match: "/dashboard/haccp/", hub: "quality" }, // 아래 resolve 에서 접두사로만 쓰인다
  { match: "/dashboard/ccp-records", hub: "quality" },
  { match: "/dashboard/ccp-calendar", hub: "quality" },
  { match: "/dashboard/ccp-stats", hub: "quality" },
  { match: "/dashboard/product-ccp-mapping", hub: "quality" },
  { match: "/dashboard/checklist", hub: "quality" },
  { match: "/dashboard/training-admin", hub: "quality" },
  { match: "/ccp-deviation-dashboard", hub: "quality" },
  { match: "/quality", hub: "quality" },
  { match: "/hygiene", hub: "quality" },
  { match: "/pest-control", hub: "quality" },
  { match: "/training", hub: "quality" },
  { match: "/training-log", hub: "quality" },
  { match: "/calibration", hub: "quality" },
  { match: "/checklist-instance", hub: "quality" },
  { match: "/checklist-schedule", hub: "quality" },
  { match: "/checklist-approval", hub: "quality" },
  { match: "/daily-log", hub: "quality" },
  { match: "/weekly-log", hub: "quality" },
  { match: "/monthly-log", hub: "quality" },
  { match: "/traceability", hub: "quality" },
  { match: "/nonconforming-products", hub: "quality" },
  { match: "/recall-simulation", hub: "quality" },
  { match: "/supplier-audit", hub: "quality" },
  { match: "/haccp-plan-verification", hub: "quality" },
  { match: "/internal-audit", hub: "quality" },
  { match: "/internal-audit-plan", hub: "quality" },
  { match: "/print-preview", hub: "quality" },
  // HACCP 기록 양식 (목록 · /new · /:id)
  ...[
    "/water-quality-test", "/air-compressor", "/air-compressor-maintenance", "/validity-evaluation", "/personal-hygiene-check",
    "/water-usage-check", "/equipment-cleaning-record", "/foreign-material-record", "/refrigeration-check",
    "/packaging-storage-record", "/quality-issue-record", "/capa-record", "/employee-health-check",
    "/temperature-humidity-check", "/sanitation-record", "/surface-contamination-test", "/hygiene-facility-check",
    "/workplace-hygiene-check", "/illumination-check", "/vehicle-temperature-check", "/equipment-history",
    "/equipment-inspection", "/consumer-complaint", "/weight-quality-check", "/product-test-report", "/product-test-log",
    "/finished-product-check", "/supplier-inspection", "/pest-control-checklist", "/airborne-bacteria-test",
    "/food-recall-notice", "/water-management-check", "/handover-document", "/daily-disposal-record", "/waste-management",
  ].map((match) => ({ match, hub: "quality" as HubId })),
];

export type RouteHubVia = "public" | "menu" | "child" | "rule" | "menu-prefix" | "industry";

const pathUnder = (path: string, base: string) =>
  base.endsWith("/") ? path.startsWith(base) : path === base || path.startsWith(base + "/");

/** 라우트(패턴 그대로, 예: /capa-record/:id)의 허브와 판정 근거. 어느 것에도 해당하지 않으면 null (테스트가 0건을 강제) */
export function routeHubOf(path: string): { hub: HubId | "public"; via: RouteHubVia } | null {
  if (PUBLIC_PATHS.includes(path)) return { hub: "public", via: "public" };
  if (HUB_BY_PATH[path]) return { hub: HUB_BY_PATH[path], via: "menu" };
  for (const [parent, children] of Object.entries(CHILD_ROUTES)) {
    if (children.some((c) => pathUnder(path, c)) && HUB_BY_PATH[parent]) return { hub: HUB_BY_PATH[parent], via: "child" };
  }
  // 품질 하위(/dashboard/haccp/...)는 생산 별칭(/dashboard/haccp)보다 먼저
  const rules = [...ROUTE_HUB_RULES].sort((a, b) => Number(b.match.endsWith("/")) - Number(a.match.endsWith("/")));
  const rule = rules.find((r) => pathUnder(path, r.match));
  if (rule) return { hub: rule.hub, via: "rule" };
  const menuParent = Object.keys(HUB_BY_PATH)
    .filter((m) => m !== "/dashboard" && path.startsWith(m + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (menuParent) return { hub: HUB_BY_PATH[menuParent], via: "menu-prefix" };
  if (INDUSTRY_QUALITY_RE.test(path)) return { hub: "quality", via: "industry" };
  return null;
}

/**
 * 옛 URL → 새 URL. App.tsx 가 이 목록으로 리다이렉트 라우트를 만든다 (쿼리 파라미터 보존, 전체 새로고침 없음).
 * 2-c 에서 업종 품질 경로를 공통 경로로 옮길 때 여기에 추가한다.
 */
export const LEGACY_REDIRECTS: ReadonlyArray<{ from: string; to: string; note: string }> = [
  { from: "/batch/new", to: "/dashboard/batch-management?tab=create", note: "구 배치 생성 경로 (기존 리다이렉트 이전)" },
  { from: "/dashboard/excel-import", to: "/dashboard/data-import", note: "엑셀 가져오기 → 데이터 가져오기 통합 (기존 리다이렉트 이전)" },
  { from: "/dashboard/simplified-import", to: "/dashboard/data-import", note: "간편 가져오기 → 데이터 가져오기 통합 (기존 리다이렉트 이전)" },
  // 끊긴 API 정리 (2026-10-14): 서버 연결이 없어 동작하지 않던 구형 중복 화면 → 같은 기능의 현행 메뉴 화면
  { from: "/accounting-close", to: "/dashboard/accounting/closing-management", note: "구형 회계 마감(accountingClose API 없음) → 마감 관리(일·월 마감 탭)" },
  { from: "/dashboard/accounting/bank-matching", to: "/dashboard/accounting/bank-management", note: "구형 은행 매칭(bankTransactions API 없음) → 은행 관리(계좌·거래·매칭 탭)" },
  { from: "/dashboard/intermediates", to: "/dashboard/manufacturing/intermediates", note: "구형 중간재(이름 충돌로 구성품 추가 끊김) → 중간재 관리" },
  // 2026-10-14 식품 부적합 → 공통 부적합 (14c). 회수 시뮬레이션은 독립 메뉴 /recall-simulation
  { from: "/dashboard/nonconforming-management", to: "/quality/nonconforming", note: "식품 구형 부적합제품관리 → 공통 부적합" },
  { from: "/nonconforming-products", to: "/quality/nonconforming", note: "식품 구형 부적합 단독 화면 → 공통 부적합" },
  // 2-c: 업종 품질 48개 → 공통 경로 (업종은 쿼리로 전달, 공통 화면이 테넌트 업종과 대조)
  ...INDUSTRY_KEYS.flatMap((ind) => QUALITY_FUNCTIONS.map((fn) => ({
    from: `/dashboard/${ind}/${fn}`, to: `${qualityPath(fn)}?industry=${ind}`, note: "2-c 업종 품질 공통 경로",
  }))),
];

/** 옛 경로 → 새 경로(쿼리 제외). 즐겨찾기 해석용 — 레지스트리 legacyPaths 역할 */
export function resolveLegacyPath(path: string): string {
  const r = LEGACY_REDIRECTS.find((x) => x.from === path);
  return r ? r.to.split("?")[0] : path;
}

/** 리다이렉트 목적지 + 원래 쿼리. 같은 키는 목적지 값이 우선 (예: tab=create 고정) */
export function buildRedirectTarget(to: string, search: string): string {
  const [toPath, toQuery = ""] = to.split("?");
  const merged = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  new URLSearchParams(toQuery).forEach((v, k) => merged.set(k, v));
  const q = merged.toString();
  return q ? `${toPath}?${q}` : toPath;
}

export interface HubMenuItem<I = string> {
  icon: I;
  label: string;
  path: string;
  roles: readonly string[];
  requireModule?: string;
  highlight?: boolean;
  hub: HubId;
  /** 허브 안 소구역 제목 (예: 플랫폼 허브의 'AI·자동화'). 없으면 제목 없이 이어서 그린다 */
  section?: string;
  /** 허브 안 탭 (HUB_TABS). 없으면 모든 탭에서 보인다 */
  hubTab?: HubTabId;
}

export interface HubSection<I = string> {
  hub: HubDef;
  items: HubMenuItem<I>[];
}

/**
 * 메뉴 항목(여러 탭·플러그인에서 온 것)을 허브별로 묶는다.
 *  - 같은 경로는 하나로: 라벨·아이콘은 먼저 온 것, roles 는 합집합(아무도 메뉴를 잃지 않게), requireModule 은 전부 같을 때만 유지
 *  - 허브 순서 → 입력 순서
 */
function layoutFields(path: string, section?: string): { section?: string; hubTab?: HubTabId } {
  const l = HUB_ITEM_LAYOUT[path];
  const out: { section?: string; hubTab?: HubTabId } = {};
  const sec = l?.section ?? section;
  if (sec) out.section = sec;
  if (l?.tab) out.hubTab = l.tab;
  return out;
}

/** 경로가 속한 허브 안 탭 (상세 화면 /purchases/:id 등도 목록과 같은 탭으로) */
export function hubTabOf(path: string): HubTabId | null {
  if (HUB_ITEM_LAYOUT[path]?.tab) return HUB_ITEM_LAYOUT[path].tab!;
  if (/^\/dashboard\/accounting\/(purchase-orders|purchases)(\/|$)/.test(path)) return "purchase";
  if (/^\/dashboard\/accounting\/(quotations|sales|tax-invoices|b2c-platform)(\/|$)/.test(path)) return "sales";
  return null;
}

export function buildHubMenu<I = string>(items: readonly { icon: I; label: string; path: string; roles: readonly string[]; requireModule?: string; highlight?: boolean; section?: string }[]): HubSection<I>[] {
  const byPath = new Map<string, HubMenuItem<I> & { _modules: Set<string | undefined> }>();
  for (const it of items) {
    const cur = byPath.get(it.path);
    if (!cur) {
      byPath.set(it.path, { icon: it.icon, label: it.label, path: it.path, roles: [...it.roles], requireModule: it.requireModule, highlight: !!it.highlight, hub: hubOf(it.path), ...layoutFields(it.path, it.section), _modules: new Set([it.requireModule]) });
    } else {
      for (const r of it.roles) if (!cur.roles.includes(r)) (cur.roles as string[]).push(r);
      cur.highlight = cur.highlight || !!it.highlight;
      cur._modules.add(it.requireModule);
    }
  }
  const sections = new Map<HubId, HubMenuItem<I>[]>();
  for (const v of byPath.values()) {
    const { _modules, ...item } = v;
    if (_modules.size > 1) delete (item as { requireModule?: string }).requireModule;
    if (!sections.has(item.hub)) sections.set(item.hub, []);
    sections.get(item.hub)!.push(item);
  }
  // 허브 안 순서: HUB_ITEM_LAYOUT 의 order 가 있으면 그 순서, 없으면 들어온 순서 (안정 정렬)
  const rank = (path: string, idx: number) => HUB_ITEM_LAYOUT[path]?.order ?? 1000 + idx;
  return [...HUBS].sort((a, b) => a.order - b.order)
    .map((hub) => ({ hub, items: (sections.get(hub.id) ?? []).map((it, i) => ({ it, r: rank(it.path, i) })).sort((a, b) => a.r - b.r).map((x) => x.it) }))
    .filter((s) => s.items.length > 0);
}
