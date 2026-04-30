/**
 * Drizzle 스키마: h_change_controls — 변경관리 (Change Control)
 *
 * Layer 2 core-mes/quality cross-cutting 도메인.
 * 모든 industry 공통 단일 테이블 + `industry` 컬럼 view filter.
 *
 * Phase Y-2-0-a (ADR-003 / Phase Y 로드맵 준수):
 *   - 본 PR: 스키마 + 마이그레이션 (동작 변경 0)
 *   - Y-2-0-b: 라우터 + DB 어댑터
 *   - Y-2-0-c: 클라이언트 페이지
 *
 * 의존성:
 *   - core-mes 가 industry/* 무참조 (ADR-002)
 *   - industry 컬럼은 Phase 3 진입 시 ENUM 확장 (ALTER TABLE MODIFY)
 *
 * 인덱스 정책:
 *   - PRIMARY KEY (id)
 *   - UNIQUE (tenant_id, code) — 코드 중복 방지
 *   - INDEX (tenant_id, industry, status) — view filter 효율
 *   - INDEX (tenant_id, requested_at DESC) — 최근 변경 조회
 *   - INDEX (tenant_id, approved_at DESC)
 */
import {
  bigint,
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

/**
 * 변경 유형 ENUM — server/core-mes/quality/changeControl.ts ChangeType 과 동기.
 */
export const CHANGE_TYPE_VALUES = [
  "process",
  "specification",
  "formulation",
  "equipment",
  "supplier",
  "label",
  "document",
  "system",
  "other",
] as const;

/**
 * 영향도 ENUM.
 */
export const CHANGE_IMPACT_VALUES = ["critical", "major", "minor"] as const;

/**
 * 진행 상태 ENUM — canTransition() 의 source-of-truth 와 동기.
 */
export const CHANGE_STATUS_VALUES = [
  "draft",
  "submitted",
  "evaluating",
  "approved",
  "implementing",
  "verifying",
  "closed",
  "rejected",
  "cancelled",
] as const;

/**
 * Industry 컨텍스트 ENUM — ADR-003 IndustryKey 와 동기.
 *
 * Phase 3 신규 industry 진입 시 마이그레이션:
 *   ALTER TABLE h_change_controls
 *     MODIFY industry ENUM('food','cosmetic','pharmaceutical',
 *                          'health-functional','medical-device',
 *                          'general-manufacturing','신규') NOT NULL;
 */
export const INDUSTRY_VALUES = [
  "food",
  "cosmetic",
  "pharmaceutical",
  "health-functional",
  "medical-device",
  "general-manufacturing",
] as const;

export const hChangeControls = mysqlTable(
  "h_change_controls",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),

    tenantId: int("tenant_id").notNull(),

    /**
     * Industry 컨텍스트 — view filter 키.
     * 모든 industry 페이지가 WHERE industry = ? 로 필터링.
     */
    industry: mysqlEnum("industry", INDUSTRY_VALUES).notNull(),

    /** 변경 코드 (CC-YYYY-NNNN 자동채번) — tenant 내 unique */
    code: varchar("code", { length: 50 }).notNull(),

    /** 변경 제목 */
    title: varchar("title", { length: 255 }).notNull(),

    /** 변경 사유 / 배경 */
    description: text("description").notNull(),

    /** 변경 유형 */
    changeType: mysqlEnum("change_type", CHANGE_TYPE_VALUES).notNull(),

    /** 영향도 (영향평가 후 갱신) */
    impact: mysqlEnum("impact", CHANGE_IMPACT_VALUES).notNull().default("minor"),

    /** 진행 상태 */
    status: mysqlEnum("status", CHANGE_STATUS_VALUES).notNull().default("draft"),

    /** 신청자 user_id */
    requestedBy: int("requested_by").notNull(),

    /** 신청일 (DEFAULT CURRENT_TIMESTAMP) */
    requestedAt: timestamp("requested_at").notNull().defaultNow(),

    /** 승인자 user_id */
    approvedBy: int("approved_by"),

    /** 승인일 */
    approvedAt: timestamp("approved_at"),

    /** 실행 완료일 (status=closed 시 채워짐) */
    closedAt: timestamp("closed_at"),

    /**
     * Industry-specific 확장 필드 (JSON).
     * core-mes 는 해석 X — industry 어댑터가 사용.
     */
    industryMetadata: json("industry_metadata"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    /** 코드 중복 방지 (tenant 내) */
    uniqTenantCode: uniqueIndex("uniq_change_control_tenant_code").on(
      table.tenantId,
      table.code,
    ),
    /** view filter 효율 (industry 별 status 별 조회) */
    idxTenantIndustryStatus: index("idx_change_control_tenant_industry_status").on(
      table.tenantId,
      table.industry,
      table.status,
    ),
    /** 최근 신청 조회 */
    idxTenantRequestedAt: index("idx_change_control_tenant_requested_at").on(
      table.tenantId,
      table.requestedAt,
    ),
    /** 승인일 기반 조회 */
    idxTenantApprovedAt: index("idx_change_control_tenant_approved_at").on(
      table.tenantId,
      table.approvedAt,
    ),
  }),
);

export type DbChangeControlRow = typeof hChangeControls.$inferSelect;
export type DbChangeControlInsert = typeof hChangeControls.$inferInsert;
