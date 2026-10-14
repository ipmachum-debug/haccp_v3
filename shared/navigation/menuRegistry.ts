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
}

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
  { tab: "haccp", icon: "FileWarning", label: "부적합제품관리", path: "/dashboard/nonconforming-management", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (HACCP)", requireModule: "haccp" },
  { tab: "haccp", icon: "AlertTriangle", label: "시정조치 관리", path: "/corrective-actions", roles: ["super_admin", "admin", "inspector", "monitor", "worker"], group: "품질관리 (HACCP)", requireModule: "haccp" },
  { tab: "haccp", icon: "Activity", label: "F-3 운영 현황", path: "/dashboard/haccp/f3-dashboard", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (HACCP)", requireModule: "haccp" },
  // 2-b-2 (2026-10-14) 통합: /dashboard/haccp/f3-trends → F-3 운영 현황의 [Deviation 트렌드 →] 링크. 경로·허브 매핑은 유지
  { tab: "haccp", icon: "GitBranch", label: "변경관리", path: "/dashboard/food/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (HACCP)", requireModule: "haccp" },
  { tab: "haccp", icon: "LayoutDashboard", label: "GMP 운영 현황", path: "/dashboard/cosmetic/dashboard", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Sparkles", label: "BMR (제조기록)", path: "/dashboard/cosmetic/bmr", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "FlaskConical", label: "배합표 (Formula)", path: "/dashboard/cosmetic/formula", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Tag", label: "라벨 / 전성분", path: "/dashboard/cosmetic/label", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Truck", label: "QA 출고 (Release)", path: "/dashboard/cosmetic/release", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Thermometer", label: "안정성시험", path: "/dashboard/cosmetic/stability", roles: ["super_admin", "admin", "inspector", "monitor"], group: "화장품 GMP", requireModule: "gmp" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리", path: "/dashboard/cosmetic/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리", path: "/dashboard/cosmetic/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (Audit)", path: "/dashboard/cosmetic/audit", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (시정·예방)", path: "/dashboard/cosmetic/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 / 훈련", path: "/dashboard/cosmetic/training", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "Sliders", label: "검교정 / 설비 자격", path: "/dashboard/cosmetic/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "Building", label: "공급업체 (AVL)", path: "/dashboard/cosmetic/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험 평가 (ICH Q9)", path: "/dashboard/cosmetic/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], group: "품질관리 (GMP)", requireModule: "gmp" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리 (ISO 13485)", path: "/dashboard/medical-device/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리 (ISO 13485)", path: "/dashboard/medical-device/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (ISO 13485)", path: "/dashboard/medical-device/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (ISO 13485)", path: "/dashboard/medical-device/audit", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 (ISO 13485)", path: "/dashboard/medical-device/training", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "Sliders", label: "검교정 (ISO 13485)", path: "/dashboard/medical-device/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "Building", label: "공급업체 (ISO 13485)", path: "/dashboard/medical-device/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험관리 ISO 14971", path: "/dashboard/medical-device/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의료기기 ISO 13485" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리 (일반제조)", path: "/dashboard/general-manufacturing/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리 (일반제조)", path: "/dashboard/general-manufacturing/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (일반제조)", path: "/dashboard/general-manufacturing/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (일반제조)", path: "/dashboard/general-manufacturing/audit", roles: ["super_admin", "admin", "inspector", "monitor"], group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 (일반제조)", path: "/dashboard/general-manufacturing/training", roles: ["super_admin", "admin", "inspector", "monitor"], group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "Sliders", label: "검교정 (일반제조)", path: "/dashboard/general-manufacturing/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "Building", label: "공급업체 (일반제조)", path: "/dashboard/general-manufacturing/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험 평가 (일반제조)", path: "/dashboard/general-manufacturing/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], group: "일반제조 ISO 9001", requireModule: "quality" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리 (KGMP)", path: "/dashboard/pharmaceutical/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리 (KGMP)", path: "/dashboard/pharmaceutical/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (KGMP)", path: "/dashboard/pharmaceutical/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (KGMP)", path: "/dashboard/pharmaceutical/audit", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 / 훈련 (KGMP)", path: "/dashboard/pharmaceutical/training", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Sliders", label: "검교정 IQ/OQ/PQ (KGMP)", path: "/dashboard/pharmaceutical/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "Building", label: "공급업체 AVL (KGMP)", path: "/dashboard/pharmaceutical/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험 평가 ICH Q9 (KGMP)", path: "/dashboard/pharmaceutical/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], group: "의약품 KGMP", requireModule: "gmp" },
  { tab: "haccp", icon: "GitBranch", label: "변경관리 (건기식)", path: "/dashboard/health-functional/change-control", roles: ["super_admin", "admin", "inspector", "monitor"], group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "AlertCircle", label: "부적합 관리 (건기식)", path: "/dashboard/health-functional/nonconforming", roles: ["super_admin", "admin", "inspector", "monitor"], group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "AlertTriangle", label: "CAPA (건기식)", path: "/dashboard/health-functional/corrective-action", roles: ["super_admin", "admin", "inspector", "monitor"], group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "ClipboardCheck", label: "감사 (건기식)", path: "/dashboard/health-functional/audit", roles: ["super_admin", "admin", "inspector", "monitor"], group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "GraduationCap", label: "교육 (건기식)", path: "/dashboard/health-functional/training", roles: ["super_admin", "admin", "inspector", "monitor"], group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "Sliders", label: "검교정 (건기식)", path: "/dashboard/health-functional/calibration", roles: ["super_admin", "admin", "inspector", "monitor"], group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "Building", label: "공급업체 (건기식)", path: "/dashboard/health-functional/supplier", roles: ["super_admin", "admin", "inspector", "monitor"], group: "건강기능식품", requireModule: "haccp" },
  { tab: "haccp", icon: "AlertTriangle", label: "위험 평가 (건기식)", path: "/dashboard/health-functional/risk-assessment", roles: ["super_admin", "admin", "inspector", "monitor"], group: "건강기능식품", requireModule: "haccp" },
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
  { tab: "finance", icon: "ClipboardList", label: "발주·구매", path: "/dashboard/accounting/purchase-orders", roles: ["super_admin", "admin"], group: "매입·구매" },
  // 2-b-2 (2026-10-14) 통합: /dashboard/accounting/purchases/create → 매입 조회 화면의 [＋ 매입 등록] 버튼. 경로·허브 매핑은 유지
  { tab: "finance", icon: "FileText", label: "매입 조회", path: "/dashboard/accounting/purchases/list", roles: ["super_admin", "admin"], group: "매입·구매" },
  { tab: "finance", icon: "FileText", label: "견적서", path: "/dashboard/accounting/quotations", roles: ["super_admin", "admin"], group: "매출·판매" },
  // 2-b-2 (2026-10-14) 통합: /dashboard/accounting/sales/create → 매출 조회 화면의 [＋ 매출 등록] 버튼. 경로·허브 매핑은 유지
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

/** 사이드바 active 판별용 — 페이지 내부 탭으로 접근하는 하위 경로 */
export const CHILD_ROUTES: Readonly<Record<string, readonly string[]>> = {
  "/dashboard/production-management": ["/dashboard/batch-management", "/dashboard/batch/new", "/dashboard/batch", "/dashboard/pipeline", "/dashboard/production/prediction"],
  "/dashboard/inspections": ["/dashboard/inspection/material", "/dashboard/inspection/hygiene", "/dashboard/inspection/shipping", "/dashboard/inspection/statistics"],
  "/quality/checklists": ["/dashboard/daily-logs", "/quality/templates", "/dashboard/checklist/employee-health"],
  "/dashboard/approval": ["/dashboard/approval/dashboard"],
  "/quality/ccp-monitoring": ["/dashboard/ccp"],
  "/dashboard/document-output": ["/dashboard/document-output/approved", "/dashboard/document-output/daily-log"],
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

export type HubId = "today" | "purchase" | "items" | "production" | "quality" | "sales" | "finance" | "settings" | "platform";

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
  { id: "purchase", label: "구매·입고", order: 2, icon: "ShoppingCart", requireModule: "erp", tone: "orange" },
  { id: "items", label: "품목·재고", order: 3, icon: "Boxes", tone: "green" },
  { id: "production", label: "생산관리", order: 4, icon: "Factory", tone: "violet" },
  { id: "quality", label: "품질·규정", order: 5, icon: "ShieldCheck", tone: "red" },
  { id: "sales", label: "판매·출고", order: 6, icon: "Truck", requireModule: "erp", tone: "amber" },
  { id: "finance", label: "회계·경영", order: 7, icon: "Landmark", requireModule: "erp", tone: "teal" },
  { id: "settings", label: "환경설정", order: 8, icon: "Settings", tone: "slate" },
  { id: "platform", label: "플랫폼 관리", order: 9, icon: "Crown", superAdminOnly: true, tone: "yellow" },
];

/** 경로 → 허브. 부록 14a 의 행선지 그대로. 업종 품질(/dashboard/{업종}/{기능}) 과 화장품 GMP 는 전부 품질·규정 */
export const HUB_BY_PATH: Readonly<Record<string, HubId>> = {
  // today
  "/dashboard": "today",
  "/dashboard/notifications": "today",
  "/dashboard/approval": "today",
  "/dashboard/today": "today",
  // purchase
  "/dashboard/accounting/purchase-orders": "purchase",
  "/dashboard/accounting/purchases/create": "purchase",
  "/dashboard/accounting/purchases/list": "purchase",
  "/dashboard/partners/feed": "purchase",
  "/dashboard/accounting/partners": "purchase",
  "/dashboard/accounting/communication-log": "purchase",
  "/dashboard/accounting/partner-prices": "purchase",
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
  "/dashboard/food/environmental-monitoring": "quality",
  "/dashboard/food/food-protection": "quality",
  // sales
  "/dashboard/accounting/quotations": "sales",
  "/dashboard/accounting/sales/create": "sales",
  "/dashboard/accounting/sales/list": "sales",
  "/dashboard/accounting/tax-invoices": "sales",
  "/dashboard/accounting/b2c-platform": "sales",
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
};

const INDUSTRY_QUALITY_RE = /^\/dashboard\/(food|cosmetic|pharmaceutical|health-functional|medical-device|general-manufacturing)\//;

/** 경로의 허브. 등록이 없으면 업종 경로는 품질·규정, 그 외는 환경설정(미분류를 숨기지 않기 위해) */
export function hubOf(path: string): HubId {
  const h = HUB_BY_PATH[path];
  if (h) return h;
  if (INDUSTRY_QUALITY_RE.test(path)) return "quality";
  return "settings";
}

export interface HubMenuItem<I = string> {
  icon: I;
  label: string;
  path: string;
  roles: readonly string[];
  requireModule?: string;
  highlight?: boolean;
  hub: HubId;
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
export function buildHubMenu<I = string>(items: readonly { icon: I; label: string; path: string; roles: readonly string[]; requireModule?: string; highlight?: boolean }[]): HubSection<I>[] {
  const byPath = new Map<string, HubMenuItem<I> & { _modules: Set<string | undefined> }>();
  for (const it of items) {
    const cur = byPath.get(it.path);
    if (!cur) {
      byPath.set(it.path, { icon: it.icon, label: it.label, path: it.path, roles: [...it.roles], requireModule: it.requireModule, highlight: !!it.highlight, hub: hubOf(it.path), _modules: new Set([it.requireModule]) });
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
  return [...HUBS].sort((a, b) => a.order - b.order)
    .map((hub) => ({ hub, items: sections.get(hub.id) ?? [] }))
    .filter((s) => s.items.length > 0);
}
