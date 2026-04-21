import { tenants } from './schema_main';
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
} from "drizzle-orm/mysql-core";

/**
 * 견적서 (Quotation) — Phase C (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 제조 ERP 의 "영업 관리" 출발점.
 *
 * 워크플로우:
 *   1. 견적서 생성 (draft)
 *   2. 발송 (sent) — 고객에게 전달 (PDF 출력/이메일)
 *   3. 고객 수락 (accepted) → 매출 전표 or 발주서로 변환 가능
 *   4. 고객 거절 (rejected)
 *   5. 유효기간 초과 (expired) — 스케줄러로 자동 전환
 *   6. 변환 (converted) — 매출/PO 로 변환 완료
 *
 * Phase B (거래처별 단가) 연동:
 *   - 고객 선택 시 resolvePrice 호출로 단가 자동 채움
 *
 * Phase C 이후 확장:
 *   - 세금계산서 생성 (tax_invoices)
 *   - 팝빌 연동 전자 발행
 * ═══════════════════════════════════════════════════════════════
 */
export const quotations = mysqlTable("quotations", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1).references(() => tenants.id),

  // 견적서 번호 (예: QUO-2026-0001)
  quotationNumber: varchar("quotation_number", { length: 50 }).notNull(),

  // 거래 기본 정보
  partnerId: bigint("partner_id", { mode: "number" }).notNull(), // 고객 FK
  quoteDate: varchar("quote_date", { length: 10 }).notNull(), // 견적일 (YYYY-MM-DD)
  validUntil: varchar("valid_until", { length: 10 }), // 유효기간 (YYYY-MM-DD)

  // 프로젝트/제목
  title: varchar("title", { length: 255 }), // 견적 제목 (예: "2026년 1분기 식품 공급")

  // 금액 정보
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0.00"), // 공급가
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).notNull().default("0.00"), // 부가세
  grandTotal: decimal("grand_total", { precision: 15, scale: 2 }).notNull().default("0.00"), // 총액
  discountAmount: decimal("discount_amount", { precision: 15, scale: 2 }).default("0.00"), // 총 할인

  // 상태
  status: mysqlEnum("status", [
    "draft",      // 작성 중
    "sent",       // 발송됨 (고객에게 전달)
    "accepted",   // 고객 수락
    "rejected",   // 고객 거절
    "expired",    // 유효기간 초과
    "converted",  // 매출/PO 로 변환 완료
    "cancelled",  // 내부 취소
  ]).notNull().default("draft"),

  // 변환 추적
  convertedSaleId: bigint("converted_sale_id", { mode: "number" }), // accounting_sales.id
  convertedPoId: bigint("converted_po_id", { mode: "number" }),     // purchase_orders.id (드물게 역주문)
  convertedAt: timestamp("converted_at"),

  // 발송/승인 정보
  sentAt: timestamp("sent_at"),
  sentBy: bigint("sent_by", { mode: "number" }),
  acceptedAt: timestamp("accepted_at"),
  rejectedAt: timestamp("rejected_at"),
  rejectReason: text("reject_reason"),

  // 결제/배송 조건
  paymentTerms: varchar("payment_terms", { length: 255 }), // 예: "월말 결제 30일"
  deliveryTerms: varchar("delivery_terms", { length: 255 }), // 예: "본사 창고 인도"

  // 메모
  notes: text("notes"),

  // 감사 정보
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantQuoteNumberIdx: uniqueIndex("uq_quo_tenant_number").on(table.tenantId, table.quotationNumber),
  tenantStatusIdx: index("idx_quo_tenant_status").on(table.tenantId, table.status),
  partnerIdx: index("idx_quo_partner").on(table.partnerId),
  quoteDateIdx: index("idx_quo_quote_date").on(table.quoteDate),
}));

/**
 * 견적서 품목 라인 (Quotation Line)
 */
export const quotationLines = mysqlTable("quotation_lines", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1).references(() => tenants.id),
  quotationId: bigint("quotation_id", { mode: "number" }).notNull(),
  lineNumber: int("line_number").notNull(),

  // 품목 정보 (material 또는 product)
  targetType: mysqlEnum("target_type", ["material", "product", "service"]).notNull().default("product"),
  materialId: bigint("material_id", { mode: "number" }),
  productId: bigint("product_id", { mode: "number" }),
  itemName: varchar("item_name", { length: 255 }).notNull(),
  itemCode: varchar("item_code", { length: 100 }),
  description: text("description"), // 상세 설명 (스펙 등)

  // 수량/단가
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull().default("EA"),
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  discountRate: decimal("discount_rate", { precision: 5, scale: 2 }).default("0.00"), // 라인 할인율 %

  // 금액 (자동 계산: quantity * unitPrice * (1 - discountRate/100))
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00"),

  // 메모
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  quoteLineIdx: uniqueIndex("uq_quo_line").on(table.quotationId, table.lineNumber),
  productIdx: index("idx_qol_product").on(table.productId),
  materialIdx: index("idx_qol_material").on(table.materialId),
  tenantQuoIdx: index("idx_qol_tenant_quo").on(table.tenantId, table.quotationId),
}));
