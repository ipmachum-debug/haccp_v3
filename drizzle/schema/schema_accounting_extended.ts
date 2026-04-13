import { tenants } from './schema_main';
import {mysqlTable, bigint, varchar, decimal, text, timestamp, date, mysqlEnum, index, int} from "drizzle-orm/mysql-core";
// import { users } from "./schema";
// import { partners } from "./schema_main";

/**
 * 매입 거래 테이블 (accounting_purchases)
 * 재료 입고, 외주 구매 등 모든 매입 거래 기록
 */
export const accountingPurchases = mysqlTable("accounting_purchases", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  
  // 거래 기본 정보
  transactionDate: varchar("transaction_date", { length: 10 }).notNull(), // 거래 일자 (YYYY-MM-DD)
  partnerId: bigint("partner_id", { mode: "number" }), // 공급업체 (거래처)
  
  // 품목 정보
  itemName: varchar("item_name", { length: 255 }).notNull(), // 품목명
  // ★ 2026-04-13 추가: h_materials 연결 FK (단일 소스 오브 트루스)
  //   - 매입 입력 시 MaterialCombobox 로 선택 강제
  //   - 재고/수불/육안검사/입고전표 전 시스템 자동 연동 키
  materialId: bigint("material_id", { mode: "number" }), // 원재료 FK (h_materials.id)
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(), // 수량
  unit: varchar("unit", { length: 20 }).notNull(), // 단위
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(), // 단가
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(), // 총 금액

  // 세금 정보
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00"), // 부가세
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("10.00"), // 세율 (%)

  // 증빙 정보
  evidenceType: mysqlEnum("evidence_type", ["tax_invoice", "receipt", "statement", "none"]).default("none"), // 증빙 유형
  evidenceNumber: varchar("evidence_number", { length: 100 }), // 증빙 번호 (세금계산서 번호 등)

  // HACCP 연동 정보
  sourceType: varchar("source_type", { length: 50 }), // "inventory_receipt", "manual" 등
  sourceId: bigint("source_id", { mode: "number" }), // h_inventory_transactions.id 등

  // 메모 및 상태
  notes: text("notes"), // 메모
  status: mysqlEnum("status", ["pending", "approved", "paid", "cancelled"]).default("pending"), // 상태

  // 계정 과목
  accountCategoryId: int("account_category_id"), // 계정 과목 ID

  // 확정/취소 정보
  postedAt: timestamp("posted_at"), // 확정 일시
  postedBy: bigint("posted_by", { mode: "number" }), // 확정자 ID
  canceledAt: timestamp("canceled_at"), // 취소 일시
  canceledBy: bigint("canceled_by", { mode: "number" }), // 취소자 ID

  // 감사 정보
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  transactionDateIdx: index("transaction_date_idx").on(table.transactionDate),
  partnerIdIdx: index("partner_id_idx").on(table.partnerId),
  sourceIdx: index("source_idx").on(table.sourceType, table.sourceId),
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  materialIdIdx: index("idx_purchases_material_id").on(table.materialId),
}));

/**
 * 매출 거래 테이블 (accounting_sales)
 * 제품 출고, 서비스 제공 등 모든 매출 거래 기록
 */
export const accountingSales = mysqlTable("accounting_sales", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  
  // 거래 기본 정보
  transactionDate: varchar("transaction_date", { length: 10 }).notNull(), // 거래 일자 (YYYY-MM-DD)
  partnerId: bigint("partner_id", { mode: "number" }), // 고객사 (거래처)
  
  // 품목 정보
  itemName: varchar("item_name", { length: 255 }).notNull(), // 품목명
  // category 필드 제거 - 실제 DB에 없음
  quantity: decimal("quantity", { precision: 10, scale: 3 }).notNull(), // 수량
  unit: varchar("unit", { length: 20 }).notNull(), // 단위
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(), // 단가
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull(), // 총 금액
  
  // 세금 정보
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00"), // 부가세
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("10.00"), // 세율 (%)
  
  // 증빙 정보
  evidenceType: mysqlEnum("evidence_type", ["tax_invoice", "receipt", "statement", "none"]).default("none"), // 증빙 유형
  evidenceNumber: varchar("evidence_number", { length: 100 }), // 증빙 번호 (세금계산서 번호 등)
  
  // HACCP 연동 정보
  sourceType: varchar("source_type", { length: 50 }), // "inventory_usage", "manual" 등
  sourceId: bigint("source_id", { mode: "number" }), // h_inventory_transactions.id 등
  
  // 메모 및 상태
  notes: text("notes"), // 메모
  status: mysqlEnum("status", ["pending", "approved", "received", "cancelled"]).default("pending"), // 상태

  // 확정/취소 정보
  postedAt: timestamp("posted_at"), // 확정 일시
  postedBy: bigint("posted_by", { mode: "number" }), // 확정자 ID
  canceledAt: timestamp("canceled_at"), // 취소 일시
  canceledBy: bigint("canceled_by", { mode: "number" }), // 취소자 ID

  // 감사 정보
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  transactionDateIdx: index("transaction_date_idx").on(table.transactionDate),
  partnerIdIdx: index("partner_id_idx").on(table.partnerId),
  sourceIdx: index("source_idx").on(table.sourceType, table.sourceId),
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
}));
