import { tenants } from "./schema_main";
import {
  mysqlTable,
  bigint,
  varchar,
  decimal,
  text,
  timestamp,
  mysqlEnum,
  index,
  int,
  uniqueIndex,
  json,
  tinyint,
} from "drizzle-orm/mysql-core";

/**
 * 세금계산서 (Tax Invoice) — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 한국 세법 기준 전자세금계산서 + 일반세금계산서 통합 관리
 *
 * 발행 흐름:
 *   1. 내부 생성 (draft) — 매출 전표 / 견적서 / 수동
 *   2. 발행 (issued) — 사내 발번호 / PDF 생성 / 인쇄
 *   3. 팝빌 전송 (sent_to_popbill) — Phase C-7 어댑터로 전자 발행
 *   4. 국세청 승인 (approved) — 팝빌 콜백 또는 폴링
 *   5. 취소 (cancelled) / 거부 (rejected)
 *
 * 부가세 신고 자료 (Phase C-8) 의 핵심 데이터 원천.
 * ═══════════════════════════════════════════════════════════════
 */
export const taxInvoices = mysqlTable("tax_invoices", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1).references(() => tenants.id),

  // 세금계산서 번호 (사내 발번호) (예: TI-2026-04-0001)
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),

  // 거래 분류
  invoiceType: mysqlEnum("invoice_type", [
    "sales",      // 매출 (우리가 발행)
    "purchase",   // 매입 (받은 것)
  ]).notNull(),

  // 과세 구분
  taxCategory: mysqlEnum("tax_category", [
    "taxed",       // 과세 (10%)
    "zero_rated",  // 영세율
    "tax_free",    // 면세
  ]).notNull().default("taxed"),

  // 영수/청구 구분 (한국 세법)
  receiptType: mysqlEnum("receipt_type", [
    "invoice",   // 청구 (세금계산서)
    "receipt",   // 영수 (영수증세금계산서)
  ]).notNull().default("invoice"),

  // 거래처
  partnerId: bigint("partner_id", { mode: "number" }).notNull(),
  partnerBizNo: varchar("partner_biz_no", { length: 13 }), // 사업자번호 (snapshot)
  partnerName: varchar("partner_name", { length: 255 }),   // 상호 (snapshot)
  partnerCeo: varchar("partner_ceo", { length: 100 }),     // 대표자 (snapshot)
  partnerAddress: varchar("partner_address", { length: 500 }),

  // 발행자 (당사) snapshot — 사업자번호 변경에 대비
  issuerBizNo: varchar("issuer_biz_no", { length: 13 }),
  issuerName: varchar("issuer_name", { length: 255 }),

  // 일자
  issueDate: varchar("issue_date", { length: 10 }).notNull(), // 작성일
  supplyDate: varchar("supply_date", { length: 10 }),         // 공급일

  // 금액 (모두 원화)
  supplyAmount: decimal("supply_amount", { precision: 15, scale: 2 }).notNull().default("0.00"), // 공급가액
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),       // 세액
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),   // 합계

  // 상태
  status: mysqlEnum("status", [
    "draft",            // 작성 중 (내부)
    "issued",           // 사내 발행 완료
    "sent_to_popbill",  // 팝빌 전송 중
    "approved",         // 국세청 승인 완료
    "rejected",         // 국세청 거부
    "cancelled",        // 취소
  ]).notNull().default("draft"),

  // 출처 추적 (어떤 매출/견적에서 생성)
  sourceType: mysqlEnum("source_type", ["sale", "quotation", "purchase", "manual"]),
  sourceId: bigint("source_id", { mode: "number" }),

  // 팝빌 연동 필드
  popbillMgtKey: varchar("popbill_mgt_key", { length: 100 }), // 팝빌 관리키
  popbillIssueId: varchar("popbill_issue_id", { length: 100 }), // 팝빌 발행 ID (NTSConfirmNum)
  popbillResponse: json("popbill_response"), // 마지막 API 응답 원본

  // 메모
  notes: text("notes"),
  remark1: varchar("remark1", { length: 100 }), // 비고1 (팝빌 표준)
  remark2: varchar("remark2", { length: 100 }),
  remark3: varchar("remark3", { length: 100 }),

  // 감사
  isPrinted: tinyint("is_printed").notNull().default(0),
  issuedBy: bigint("issued_by", { mode: "number" }),
  issuedAt: timestamp("issued_at"),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),

  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantNumberIdx: uniqueIndex("uq_ti_tenant_number").on(table.tenantId, table.invoiceNumber),
  tenantTypeStatusIdx: index("idx_ti_tenant_type_status").on(table.tenantId, table.invoiceType, table.status),
  partnerIdx: index("idx_ti_partner").on(table.partnerId),
  issueDateIdx: index("idx_ti_issue_date").on(table.issueDate),
  popbillMgtKeyIdx: index("idx_ti_popbill_mgt_key").on(table.popbillMgtKey),
}));

/**
 * 세금계산서 품목 라인 (Tax Invoice Line)
 *
 * 한국 세법 표준: 1매당 최대 4개 품목 (팝빌도 동일 제한).
 * 4개 초과 시 "외 N건" 처리 또는 분할 발행 권장.
 */
export const taxInvoiceLines = mysqlTable("tax_invoice_lines", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1).references(() => tenants.id),
  taxInvoiceId: bigint("tax_invoice_id", { mode: "number" }).notNull(),
  lineNumber: int("line_number").notNull(),

  // 품목 정보
  itemName: varchar("item_name", { length: 255 }).notNull(),
  itemSpec: varchar("item_spec", { length: 100 }), // 규격
  quantity: decimal("quantity", { precision: 10, scale: 3 }),
  unit: varchar("unit", { length: 20 }),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }),

  supplyAmount: decimal("supply_amount", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00"),

  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  invoiceLineIdx: uniqueIndex("uq_til_line").on(table.taxInvoiceId, table.lineNumber),
  tenantInvoiceIdx: index("idx_til_tenant_invoice").on(table.tenantId, table.taxInvoiceId),
}));

/**
 * 팝빌 연동 설정 (Tenant 별)
 * - 1 SaaS 1 LinkID + N 테넌트 CorpNum 구조
 * - 실제 LINK_ID/SECRET_KEY 는 환경변수 (POPBILL_LINK_ID, POPBILL_SECRET_KEY)
 * - 이 테이블은 테넌트별 활성화 여부 / CorpNum / 캐시 정보 저장
 */
export const popbillSettings = mysqlTable("popbill_settings", {
  tenantId: int("tenant_id").primaryKey().references(() => tenants.id),
  corpNum: varchar("corp_num", { length: 13 }).notNull(), // 사업자번호 (10자리 + dash 호환)
  userId: varchar("user_id", { length: 50 }), // 팝빌 ID (선택)
  isEnabled: tinyint("is_enabled").notNull().default(0),
  isTestMode: tinyint("is_test_mode").notNull().default(1),
  contactName: varchar("contact_name", { length: 100 }),
  contactEmail: varchar("contact_email", { length: 100 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  // 포인트 캐시 (조회 속도 향상)
  balanceCached: decimal("balance_cached", { precision: 12, scale: 2 }).default("0.00"),
  lastBalanceCheck: timestamp("last_balance_check"),
  // 연결 상태 캐시
  isMember: tinyint("is_member").notNull().default(0),
  lastSyncAt: timestamp("last_sync_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
