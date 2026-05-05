/**
 * Partner CRM 확장 스키마 (Phase 1)
 *
 * 목적: 거래처(partners)를 중심으로 한 CRM 360 기능을 추가.
 *
 * 신규 테이블:
 *   - partner_contacts   : 거래처 담당자 (1 partner : N contacts)
 *   - partner_activities : 활동 이력 (전화/방문/이메일/미팅/노트/견적발송/계약 등)
 *   - partner_tags       : 자유 태그 (분류/세그먼트)
 *
 * 기존 자산 활용 (별도 테이블 미생성):
 *   - communication_logs : 메모/태스크 (status workflow) — 활동 timeline 에 함께 노출
 *   - quotations         : 견적
 *   - accounting_purchases / accounting_sales : 거래
 *   - ap_ledger / ar_ledger : 외상
 *   - partner_credit     : 신용/한도
 *
 * 작성: 2026-05-05 (Partner 360 Phase 1)
 */

import {
  mysqlTable,
  bigint,
  varchar,
  text,
  timestamp,
  mysqlEnum,
  int,
  tinyint,
  index,
  json,
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main";

/**
 * 거래처 담당자
 *   - 한 거래처에 여러 담당자 (구매팀 / 영업팀 / 회계팀 등)
 *   - is_primary 로 기본 연락 담당자 표시
 */
export const partnerContacts = mysqlTable(
  "partner_contacts",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    partnerId: bigint("partner_id", { mode: "number" }).notNull(),

    name: varchar("name", { length: 100 }).notNull(),
    role: varchar("role", { length: 100 }), // 직책 (구매담당 / 영업이사 등)
    department: varchar("department", { length: 100 }), // 부서
    phone: varchar("phone", { length: 50 }),
    mobile: varchar("mobile", { length: 50 }),
    email: varchar("email", { length: 320 }),

    isPrimary: tinyint("is_primary").default(0).notNull(), // 1 = 주담당
    isActive: tinyint("is_active").default(1).notNull(),

    notes: text("notes"),

    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantPartnerIdx: index("idx_pc_tenant_partner").on(table.tenantId, table.partnerId),
    primaryIdx: index("idx_pc_primary").on(table.partnerId, table.isPrimary),
  }),
);

export type PartnerContact = typeof partnerContacts.$inferSelect;
export type NewPartnerContact = typeof partnerContacts.$inferInsert;

/**
 * 거래처 활동 이력 (Activity Timeline)
 *   - CRM 표준 activity types 차용
 *   - 자동 기록 + 수동 기록 모두 가능
 *     · 자동: 견적 발송 (quote_sent), 계약 체결 (contract_signed), 매출/매입 발생
 *     · 수동: 전화 (call), 이메일 (email), 미팅 (meeting), 방문 (visit), 메모 (note)
 *   - occurred_at 은 실제 발생 시각 (created_at 과 다를 수 있음 — 사후 기록 가능)
 */
export const partnerActivities = mysqlTable(
  "partner_activities",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    partnerId: bigint("partner_id", { mode: "number" }).notNull(),

    contactId: bigint("contact_id", { mode: "number" }), // 누구와 (optional — partner_contacts.id)

    activityType: mysqlEnum("activity_type", [
      "call",
      "email",
      "meeting",
      "visit",
      "note",
      "quote_sent",
      "contract_signed",
      "payment_received",
      "payment_overdue",
      "task",
      "other",
    ]).notNull(),

    title: varchar("title", { length: 255 }).notNull(),
    body: text("body"), // 상세 본문 (markdown 허용)
    outcome: mysqlEnum("outcome", ["info", "follow_up", "won", "lost", "blocked"]),

    occurredAt: timestamp("occurred_at").notNull(), // 실제 발생 시각
    durationMinutes: int("duration_minutes"), // 통화/미팅 시간 (분)

    // 연동 참조 (자동 기록 시 source 추적)
    refType: varchar("ref_type", { length: 50 }), // 'quotation' | 'purchase' | 'sale' | 'payment'
    refId: bigint("ref_id", { mode: "number" }),

    attachmentsUrl: text("attachments_url"), // JSON 배열 string

    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantPartnerIdx: index("idx_pa_tenant_partner").on(table.tenantId, table.partnerId),
    occurredIdx: index("idx_pa_occurred").on(table.partnerId, table.occurredAt),
    typeIdx: index("idx_pa_type").on(table.partnerId, table.activityType),
    refIdx: index("idx_pa_ref").on(table.refType, table.refId),
  }),
);

export type PartnerActivity = typeof partnerActivities.$inferSelect;
export type NewPartnerActivity = typeof partnerActivities.$inferInsert;

/**
 * 거래처 태그 (자유 분류)
 *   - VIP / 신규 / 위험 / 협력사 등 자유 태그
 *   - 색상 시각화 (frontend 가 hex 컬러 부여)
 */
export const partnerTags = mysqlTable(
  "partner_tags",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    partnerId: bigint("partner_id", { mode: "number" }).notNull(),

    tag: varchar("tag", { length: 50 }).notNull(),
    color: varchar("color", { length: 20 }), // hex (#RRGGBB) or name (red/blue/...)

    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tenantPartnerIdx: index("idx_pt_tenant_partner").on(table.tenantId, table.partnerId),
    tagIdx: index("idx_pt_tag").on(table.tenantId, table.tag),
  }),
);

export type PartnerTag = typeof partnerTags.$inferSelect;
export type NewPartnerTag = typeof partnerTags.$inferInsert;

/**
 * 거래처 서류 (Phase 2 — 발급/보관/이력 추적)
 *   - 거래처별 발급/수령 서류 관리 (계약서/세금계산서/품질보증서/증빙 등)
 *   - 발급 시점 / 수령 확인 시점 / 보관 위치(파일 URL) 추적
 *   - 만료일 알림 (계약서/인증서)
 */
export const partnerDocuments = mysqlTable(
  "partner_documents",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    partnerId: bigint("partner_id", { mode: "number" }).notNull(),

    docType: mysqlEnum("doc_type", [
      "contract",        // 계약서
      "tax_invoice",     // 세금계산서
      "estimate",        // 견적서
      "purchase_order",  // 발주서
      "delivery_note",   // 거래명세서
      "receipt",         // 영수증
      "quality_cert",    // 품질보증서 / 시험성적서
      "iso_cert",        // ISO 인증서
      "haccp_cert",      // HACCP 인증서
      "biz_license",     // 사업자등록증
      "nda",             // 기밀유지협약
      "other",
    ]).notNull(),

    title: varchar("title", { length: 255 }).notNull(), // 문서명
    docNumber: varchar("doc_number", { length: 100 }), // 문서번호 (계약 #, 인보이스 # 등)

    direction: mysqlEnum("direction", ["issued", "received"]).notNull(), // 발급(issued) vs 수령(received)
    fileUrl: text("file_url"), // S3 URL 또는 file path
    fileName: varchar("file_name", { length: 255 }),
    fileSize: int("file_size"), // bytes

    issuedAt: timestamp("issued_at"), // 발행일
    receivedAt: timestamp("received_at"), // 수령 확인 일시
    expiresAt: timestamp("expires_at"), // 만료일 (계약서/인증서)

    notes: text("notes"),

    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantPartnerIdx: index("idx_pd_tenant_partner").on(table.tenantId, table.partnerId),
    typeIdx: index("idx_pd_type").on(table.partnerId, table.docType),
    expiryIdx: index("idx_pd_expiry").on(table.tenantId, table.expiresAt),
  }),
);

export type PartnerDocument = typeof partnerDocuments.$inferSelect;
export type NewPartnerDocument = typeof partnerDocuments.$inferInsert;
