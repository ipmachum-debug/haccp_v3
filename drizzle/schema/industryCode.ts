/**
 * 업종코드 마스터 + 업종별 피처 매핑
 * ────────────────────────────────────────────────────────────
 * KSIC(한국표준산업분류) 기반 제조업 업종코드를 관리하고,
 * 각 업종에 따라 활성화되는 모듈/기능을 정의합니다.
 *
 * 핵심 설계:
 *   tenant.industryCode → industry_codes.code
 *   industry_codes.code → industry_feature_mappings → 기능 ON/OFF
 *
 * 확장 시나리오:
 *   - 식품(C10): HACCP, CCP모니터링, 위생점검
 *   - 화장품(C20): GMP, 품질검사, LOT추적
 *   - 건기식(C10+건강): HACCP + GMP 동시
 *   - 일반제조(C기타): 생산/재고/회계 기본
 */

import {
  mysqlTable,
  varchar,
  text,
  boolean,
  int,
  json,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

// ============================================
// 1. 업종코드 마스터 (industry_codes)
// ============================================

export const industryCodes = mysqlTable("industry_codes", {
  /** 업종코드 (KSIC 기반, ex: "C10", "C1011", "C20") */
  code: varchar("code", { length: 20 }).primaryKey(),

  /** 상위 업종코드 (계층구조, ex: C1011의 parent = C10) */
  parentCode: varchar("parent_code", { length: 20 }),

  /** 업종명 (한국어) */
  nameKo: varchar("name_ko", { length: 200 }).notNull(),

  /** 업종명 (영어) */
  nameEn: varchar("name_en", { length: 200 }),

  /** 업종 설명 */
  description: text("description"),

  /** 대분류 카테고리 (식품제조, 화장품제조, 건기식, 의약품, 전자, 섬유, 일반제조) */
  category: varchar("category", { length: 50 }).notNull(),

  /** 아이콘 식별자 (lucide icon name, ex: "chef-hat", "flask", "pill") */
  icon: varchar("icon", { length: 50 }),

  /** 정렬 순서 */
  sortOrder: int("sort_order").notNull().default(0),

  /** 활성 여부 */
  isActive: boolean("is_active").notNull().default(true),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  categoryIdx: index("category_idx").on(table.category),
  parentIdx: index("parent_idx").on(table.parentCode),
}));

// ============================================
// 2. 업종별 기능 매핑 (industry_feature_mappings)
// ============================================

/**
 * 어떤 업종코드에 어떤 모듈/기능이 활성화되는지 정의
 *
 * featureKey 예시:
 *   - "module:haccp"      → HACCP 모듈 전체
 *   - "module:gmp"        → GMP 모듈 전체
 *   - "module:erp"        → ERP(회계) 모듈
 *   - "feature:ccp_monitoring"   → CCP 실시간 모니터링
 *   - "feature:hygiene_checklist" → 위생점검 체크리스트
 *   - "feature:lot_tracking"     → LOT 추적
 *   - "feature:allergen_mgmt"    → 알레르기 관리
 *   - "feature:gmp_deviation"    → GMP 일탈관리
 *   - "feature:stability_test"   → 안정성시험
 *   - "label:batch"              → UI 라벨 ("배치" vs "로트" vs "배치(Batch)")
 *   - "label:product"            → UI 라벨 ("제품" vs "완제품" vs "화장품")
 *   - "template:checklist"       → 업종별 기본 체크리스트 템플릿
 */
export const industryFeatureMappings = mysqlTable("industry_feature_mappings", {
  id: int("id").autoincrement().primaryKey(),

  /** 업종코드 (industry_codes.code) */
  industryCode: varchar("industry_code", { length: 20 }).notNull(),

  /** 기능 키 (module:xxx, feature:xxx, label:xxx, template:xxx) */
  featureKey: varchar("feature_key", { length: 100 }).notNull(),

  /** 활성 여부 */
  enabled: boolean("enabled").notNull().default(true),

  /** 추가 설정 (JSON) - 라벨 오버라이드, 템플릿 ID 등 */
  configJson: json("config_json").$type<Record<string, any>>(),

  /** 기능 설명 */
  description: text("description"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  uniqueMapping: uniqueIndex("unique_mapping").on(table.industryCode, table.featureKey),
  featureKeyIdx: index("feature_key_idx").on(table.featureKey),
}));

// ============================================
// 3. 업종별 인증 요구사항 (industry_certifications)
// ============================================

/**
 * 업종에 따라 필수/선택 인증을 정의
 * 예: 식품(C10) → HACCP 필수, ISO22000 선택
 *     화장품(C20) → cGMP 필수, ISO22716 선택
 */
export const industryCertifications = mysqlTable("industry_certifications", {
  id: int("id").autoincrement().primaryKey(),

  /** 업종코드 */
  industryCode: varchar("industry_code", { length: 20 }).notNull(),

  /** 인증 코드 (HACCP, GMP, cGMP, ISO22000, ISO22716, FSSC22000, KGMP 등) */
  certCode: varchar("cert_code", { length: 50 }).notNull(),

  /** 인증명 (한국어) */
  certNameKo: varchar("cert_name_ko", { length: 200 }).notNull(),

  /** 인증명 (영어) */
  certNameEn: varchar("cert_name_en", { length: 200 }),

  /** 필수 여부 (mandatory / recommended / optional) */
  requirement: varchar("requirement", { length: 20 }).notNull().default("optional"),

  /** 관련 법령/규정 */
  regulationRef: text("regulation_ref"),

  /** 정렬 순서 */
  sortOrder: int("sort_order").notNull().default(0),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  uniqueCert: uniqueIndex("unique_cert").on(table.industryCode, table.certCode),
  industryIdx: index("industry_idx").on(table.industryCode),
}));
