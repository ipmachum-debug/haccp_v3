/**
 * IndustryPlugin — 도메인 플러그인 인터페이스 (근본 도메인 분리 아키텍처)
 *
 * 작성: 2026-05-01 — Phase Plugin-1
 *
 * 목적:
 *   여러 산업 (food / cosmetic / pharma / medical-device / health-functional /
 *   general-manufacturing) 의 cross-cutting 인프라 (메뉴 / 알림 / 승인 / 문서 /
 *   대시보드 / 마스터 카테고리) 가 각 산업별로 독립 운영 가능하도록 단일
 *   plugin 객체로 정의.
 *
 * 핵심 원칙:
 *   1. 신규 산업 진입 비용 = plugin 파일 1개 정의 (~300 lines)
 *   2. cross-cutting 인프라 (engines) 는 plugin registry 만 참조
 *   3. 산업별 if-else 분기 0
 *   4. ENUM ALTER 0 (plugin 의 string code 가 type 역할)
 *
 * 사용처:
 *   - server/domain/registry.ts → getPlugin(industryKey)
 *   - server/domain/engines/* → plugin 참조하여 동적 동작
 *   - client/src/domain/clientRegistry.ts → client-safe 부분만 노출
 *
 * 마이그레이션 정책 (Strangler Fig):
 *   - 기존 server/lib/industry/industryConfig.ts 는 호환성 유지
 *   - 신규 plugin 이 industryConfig 를 흡수, 점진적 deprecation
 *
 * ADR:
 *   - ADR-002 (No core-to-industry import) 와 일치 — engine 은 plugin 만 참조
 *   - ADR-003 (Industry-First Menu) 의 industry view filter 패턴 확장
 */

import type { IndustryKey } from "./types";

// ─────────────────────────────────────────────────────────
// 1. 라벨 매핑 (batch → 제조번호 vs LOT vs Batch)
// ─────────────────────────────────────────────────────────

export type LabelKey =
  | "batch"     // 식품: 배치 / 화장품: 제조번호 / 의약품: Batch
  | "product"   // 식품: 제품 / 화장품: 화장품 / 의약품: 의약품
  | "material"  // 식품: 원재료 / 화장품: 원료 / 의약품: 원료의약품
  | "process"   // 제조공정 (대부분 동일)
  | "site";     // 식품: 공장 / 화장품: 제조소 / 의약품: 제조소

export type LabelMap = Record<LabelKey, string>;

// ─────────────────────────────────────────────────────────
// 2. 모듈 / 기능 활성화
// ─────────────────────────────────────────────────────────

export type ModuleKey =
  | "erp" | "production" | "inventory" | "quality"
  | "purchasing" | "sales" | "hr"
  | "haccp" | "gmp" | "iso" | "traceability";

export type ModuleSet = Partial<Record<ModuleKey, boolean>>;

export type FeatureKey =
  // 식품 HACCP 전용
  | "ccp_monitoring" | "haccp_7principles" | "hygiene_checklist"
  | "allergen_mgmt" | "food_defense" | "recall_mgmt"
  // 화장품 / 의약품 GMP
  | "gmp_deviation" | "gmp_capa" | "stability_test"
  | "gmp_validation" | "gmp_change_control"
  // 공통 품질
  | "incoming_inspection" | "process_inspection" | "final_inspection"
  | "nonconforming_mgmt" | "calibration"
  // 생산
  | "bom_management" | "batch_production" | "continuous_production"
  | "work_order" | "equipment_mgmt"
  // 재고 / 추적
  | "lot_tracking" | "fefo_allocation" | "expiry_mgmt" | "serial_tracking"
  // ERP
  | "double_entry" | "tax_invoice" | "cost_analysis" | "budget_mgmt";

export type FeatureSet = Partial<Record<FeatureKey, boolean>>;

// ─────────────────────────────────────────────────────────
// 3. 사이드바 메뉴 contributions
// ─────────────────────────────────────────────────────────

export interface MenuItemDef {
  /** lucide-react 아이콘 이름 (string으로 직렬화 가능) */
  icon: string;
  label: string;
  path: string;
  /** 접근 가능한 role 목록 */
  roles: readonly string[];
  /** 추가 module 요구사항 (legacy requireModule) — 신규 plugin 은 보통 미사용 */
  requireModule?: ModuleKey;
  /** highlight (강조 표시) */
  highlight?: boolean;
}

export interface MenuGroupDef {
  /** 그룹 헤더 라벨 */
  name: string;
  /** 표시 순서 (낮을수록 위에) */
  order: number;
  items: MenuItemDef[];
}

// ─────────────────────────────────────────────────────────
// 4. 알림 type 카탈로그 + 자동 발행 룰
// ─────────────────────────────────────────────────────────

export type NotificationPriority = "low" | "medium" | "high" | "critical";

export interface NotificationTypeDef {
  /** 알림 type code (h_notifications.type 컬럼 값) */
  code: string;
  /** 표시 라벨 */
  label: string;
  /** 우선순위 */
  priority: NotificationPriority;
  /** 카테고리 (필터 그룹용) */
  category: string;
  /** 설명 (관리자 UI 용) */
  description?: string;
}

export interface NotificationRuleDef {
  /** rule code */
  code: string;
  /** 룰 설명 */
  description: string;
  /** 발행 trigger 표현식 (예: SQL 또는 함수 reference) */
  trigger: string;
  /** 발행할 notification type code */
  notificationType: string;
  /** 발행 빈도 제한 (분 단위, 0=무제한) */
  cooldownMinutes?: number;
}

// ─────────────────────────────────────────────────────────
// 5. 승인 entity + workflow
// ─────────────────────────────────────────────────────────

export type ApprovalStep = "draft" | "review" | "approve" | "released" | "rejected";

export interface ApprovalWorkflowDef {
  /** workflow code */
  code: string;
  /** 라벨 */
  label: string;
  /** 단계 순서 (e.g. draft → review → approve → released) */
  steps: ApprovalStep[];
  /** 단계별 권한 role */
  stepRoles: Record<ApprovalStep, readonly string[]>;
}

export interface ApprovalEntityTypeDef {
  /** entity_type code (h_approvals.entity_type 컬럼 값) */
  code: string;
  /** 라벨 */
  label: string;
  /** 사용할 workflow code (위 ApprovalWorkflowDef.code) */
  workflow: string;
  /** 카테고리 (탭 그룹) */
  category: string;
  /** 연결된 entity table (예: 'h_cosmetic_bmrs') */
  entityTable?: string;
}

// ─────────────────────────────────────────────────────────
// 6. 문서 templates (PDF / form)
// ─────────────────────────────────────────────────────────

export interface DocumentFormTypeDef {
  /** form type code (h_document_approval_settings.document_type 값) */
  code: string;
  /** 표시 라벨 */
  name: string;
  /** 카테고리 (UI 그룹) */
  category: string;
  /** 출력용 PDF template code (선택) */
  pdfTemplate?: string;
}

export interface PdfTemplateDef {
  /** template code */
  code: string;
  /** 템플릿 이름 */
  name: string;
  /** 규제 참조 (예: "화장품법 §6", "식품안전관리법 §31") */
  regulation?: string;
  /** 템플릿 파일 경로 또는 generator 함수 reference */
  template: string;
}

// ─────────────────────────────────────────────────────────
// 7. 대시보드 위젯
// ─────────────────────────────────────────────────────────

export type WidgetSize = "small" | "medium" | "large" | "full";

export interface DashboardWidgetDef {
  /** widget code */
  code: string;
  /** 표시 라벨 */
  label: string;
  /** 크기 */
  size: WidgetSize;
  /** 표시 순서 */
  order: number;
  /** 데이터 소스 query (tRPC procedure path 또는 SQL) */
  dataSource: string;
  /** 차트 type */
  chartType?: "card" | "line" | "bar" | "pie" | "table" | "gauge";
}

// ─────────────────────────────────────────────────────────
// 8. 마스터 카테고리
// ─────────────────────────────────────────────────────────

export interface CategoryDef {
  code: string;
  label: string;
  /** 부모 카테고리 (계층 구조) */
  parentCode?: string;
  /** 표시 순서 */
  order?: number;
}

// ─────────────────────────────────────────────────────────
// 9. 인증 / 규제
// ─────────────────────────────────────────────────────────

export interface CertificationDef {
  code: string;
  nameKo: string;
  nameEn?: string;
  /** 필수 / 권장 / 선택 */
  requirement: "mandatory" | "recommended" | "optional";
  /** 인증 기관 */
  authority?: string;
}

// ─────────────────────────────────────────────────────────
// 10. Y-시리즈 활성화 (cross-cutting entity 사용 여부)
// ─────────────────────────────────────────────────────────

export interface YSeriesFlags {
  changeControl: boolean;
  nonconforming: boolean;
  capa: boolean;
  audit: boolean;
  training: boolean;
  calibration: boolean;
  qualitySupplier: boolean;
  riskAssessment: boolean;
}

// ─────────────────────────────────────────────────────────
// 11. 메인 Plugin 인터페이스 — 모든 산업이 이 형태로 정의
// ─────────────────────────────────────────────────────────

export interface IndustryPlugin {
  /** 산업 키 (drizzle ENUM 과 동기) */
  readonly key: IndustryKey;

  /** 한글 라벨 */
  readonly labelKo: string;

  /** 영문 라벨 (옵션) */
  readonly labelEn?: string;

  /** 산업 카테고리 (server IndustryCategory 와 매핑) */
  readonly category: string;

  /** KSIC 산업코드 목록 (한국표준산업분류) */
  readonly industryCodes: readonly string[];

  /** 설명 */
  readonly description?: string;

  /** UI 아이콘 (lucide-react 이름) */
  readonly icon?: string;

  // ─── 라벨 변환 ───
  readonly labels: LabelMap;

  // ─── 모듈/기능 활성화 ───
  readonly modules: ModuleSet;
  readonly features: FeatureSet;

  // ─── 사이드바 메뉴 ───
  readonly menu: {
    groups: readonly MenuGroupDef[];
  };

  // ─── 알림 type 카탈로그 + 자동 룰 ───
  readonly notifications: {
    types: readonly NotificationTypeDef[];
    rules: readonly NotificationRuleDef[];
  };

  // ─── 승인 entity + workflow ───
  readonly approvals: {
    workflows: readonly ApprovalWorkflowDef[];
    entityTypes: readonly ApprovalEntityTypeDef[];
  };

  // ─── 문서 templates ───
  readonly documents: {
    formTypes: readonly DocumentFormTypeDef[];
    pdfTemplates: readonly PdfTemplateDef[];
  };

  // ─── 대시보드 위젯 ───
  readonly dashboardWidgets: readonly DashboardWidgetDef[];

  // ─── 마스터 카테고리 ───
  readonly masterCategories: {
    materials: readonly CategoryDef[];
    products: readonly CategoryDef[];
    suppliers?: readonly CategoryDef[];
  };

  // ─── 인증 / 규제 ───
  readonly certifications: readonly CertificationDef[];

  // ─── Y-시리즈 cross-cutting 활성화 ───
  readonly ySeriesEnabled: YSeriesFlags;
}
