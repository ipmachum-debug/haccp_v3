/**
 * Drizzle 스키마: h_nonconformings — 부적합 (Nonconforming) 단일 통합 테이블
 *
 * Phase Y-2-1-a — Layer 2 core-mes/quality cross-cutting 도메인.
 * 모든 industry 공통 + `industry` 컬럼 view filter.
 *
 * 기존 h_nonconforming_products (식품 위주) 와 별개:
 *   - 운영 데이터 0 건이라 신규 테이블로 시작 (마이그레이션 부담 0)
 *   - 기존 테이블은 deprecated — 라우터/UI 호환 유지 (Strangler Fig)
 *   - Y-2-1-d/e 에서 deprecated 처리 (별도 PR)
 *
 * 인덱스 정책:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code) — 코드 중복 방지
 *   - INDEX (tenant_id, industry, status) — view filter 효율
 *   - INDEX (tenant_id, detection_date DESC) — 최근 발견 조회
 *   - INDEX (tenant_id, corrective_action_id) — CAPA 연계 (Y-2-2 머지 후)
 */
import {
  bigint,
  decimal,
  date,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  uniqueIndex,
  index,
} from "drizzle-orm/mysql-core";

/** 발견 경로 ENUM — entity DetectionSource 와 동기 */
export const DETECTION_SOURCE_VALUES = [
  "incoming_inspection",
  "in_process_inspection",
  "final_inspection",
  "customer_complaint",
  "internal_audit",
  "ccp_monitoring",
  "stability_test",
  "other",
] as const;

/** 부적합 유형 ENUM */
export const NONCONFORMITY_TYPE_VALUES = [
  "physical",
  "chemical",
  "biological",
  "sensory",
  "packaging",
  "labeling",
  "specification",
  "other",
] as const;

/** 원인 카테고리 (5M) */
export const CAUSE_CATEGORY_VALUES = [
  "material",
  "process",
  "equipment",
  "human_error",
  "environment",
  "method",
  "other",
] as const;

/** 처리 방법 */
export const DISPOSAL_METHOD_VALUES = [
  "pending",
  "rework",
  "downgrade",
  "alternative_use",
  "disposal",
  "return_to_supplier",
  "customer_return",
] as const;

/** 진행 상태 — canTransition source-of-truth 와 동기 */
export const NONCONFORMING_STATUS_VALUES = [
  "detected",
  "under_investigation",
  "pending_disposal",
  "disposed",
  "closed",
  "cancelled",
] as const;

/** Industry — ADR-003 IndustryKey 와 동기 */
export const INDUSTRY_VALUES = [
  "food",
  "cosmetic",
  "pharmaceutical",
  "health-functional",
  "medical-device",
  "general-manufacturing",
] as const;

export const hNonconformings = mysqlTable(
  "h_nonconformings",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),

    tenantId: int("tenant_id").notNull(),

    /** Industry 컨텍스트 — view filter 키 */
    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    /** 부적합 코드 (NCR-YYYY-NNNN) — tenant 내 unique */
    code: varchar("code", { length: 50 }).notNull(),

    /** 발견일 */
    detectionDate: date("detection_date").notNull(),

    /** 발견 경로 */
    detectionSource: mysqlEnum("detection_source", DETECTION_SOURCE_VALUES).notNull(),

    /** 부적합 유형 */
    nonconformityType: mysqlEnum("nonconformity_type", NONCONFORMITY_TYPE_VALUES).notNull(),

    /** 부적합 상세 설명 */
    description: text("description").notNull(),

    /** 제품/원료 식별 (industry-specific 보강은 industryMetadata) */
    itemName: varchar("item_name", { length: 255 }).notNull(),
    /** LOT 번호 */
    lotNumber: varchar("lot_number", { length: 100 }),
    /** 부적합 수량 */
    quantity: decimal("quantity", { precision: 12, scale: 3 }).notNull(),
    /** 단위 */
    unit: varchar("unit", { length: 20 }).notNull(),

    /** 근본 원인 (조사 후) */
    rootCause: text("root_cause"),
    /** 원인 카테고리 (5M) */
    causeCategory: mysqlEnum("cause_category", CAUSE_CATEGORY_VALUES),

    /** 처리 방법 */
    disposalMethod: mysqlEnum("disposal_method", DISPOSAL_METHOD_VALUES)
      .notNull()
      .default("pending"),
    /** 처리일 */
    disposalDate: date("disposal_date"),
    /** 처리 상세 */
    disposalDetails: text("disposal_details"),
    /** 처리 비용 */
    disposalCost: decimal("disposal_cost", { precision: 12, scale: 2 }),

    /** 발견자 user_id */
    detectedBy: int("detected_by").notNull(),
    /** 처리 책임자 user_id */
    responsiblePerson: int("responsible_person"),
    /** 승인자 user_id */
    approvedBy: int("approved_by"),
    approvedAt: timestamp("approved_at"),

    /** 연계 시정조치 (CAPA) ID — Y-2-2 후 활성 */
    correctiveActionId: bigint("corrective_action_id", { mode: "number" }),

    /** 재발 방지 대책 */
    preventiveActions: text("preventive_actions"),

    /** 진행 상태 */
    status: mysqlEnum("status", NONCONFORMING_STATUS_VALUES)
      .notNull()
      .default("detected"),

    /** 비고 */
    notes: text("notes"),

    /** Industry-specific 확장 필드 (JSON) */
    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    /** 코드 중복 방지 (tenant 내) */
    uniqTenantCode: uniqueIndex("uniq_nonconforming_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    /** view filter 효율 (industry × status) */
    idxTenantIndustryStatus: index("idx_nonconforming_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    /** 최근 발견 조회 */
    idxTenantDetectionDate: index("idx_nonconforming_tenant_detection_date").on(
      table.tenantId,
      table.detectionDate,
    ),
    /** CAPA 연계 (Y-2-2 후 자주 사용) */
    idxTenantCAR: index("idx_nonconforming_tenant_car").on(
      table.tenantId,
      table.correctiveActionId,
    ),
  }),
);

export type DbNonconformingRow = typeof hNonconformings.$inferSelect;
export type DbNonconformingInsert = typeof hNonconformings.$inferInsert;
