import { tenants } from './schema_main';
import {
  mysqlTable,
  bigint,
  varchar,
  decimal,
  text,
  timestamp,
  date,
  mysqlEnum,
  index,
  int,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * 발주서 (Purchase Order) — Phase A (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * 제조 ERP 의 "구매 관리" 출발점.
 *
 * 워크플로우:
 *   1. 발주서 생성 (draft)
 *   2. 승인 (approved) — 단순 1단계 승인
 *   3. 실제 입고 시점에 "입고 처리" 버튼 → accounting_purchases 자동 생성
 *      - 부분 입고 지원 (partial_received)
 *      - 전량 입고 시 status = 'received'
 *   4. 필요 시 취소 (cancelled) — draft/approved 에서만 가능
 *
 * 관련 테이블:
 *   - purchase_orders: 헤더 (거래처/일자/총액/상태)
 *   - purchase_order_lines: 품목 라인 (material_id, 수량, 단가)
 *   - accounting_purchases: 입고 처리 시 sourceType='PO', sourceId=poId
 * ═══════════════════════════════════════════════════════════════
 */
export const purchaseOrders = mysqlTable("purchase_orders", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1).references(() => tenants.id),

  // 발주서 번호 (예: PO-2026-0001)
  poNumber: varchar("po_number", { length: 50 }).notNull(),

  // 거래 기본 정보
  partnerId: bigint("partner_id", { mode: "number" }).notNull(), // 공급업체 FK
  orderDate: varchar("order_date", { length: 10 }).notNull(), // 발주일 (YYYY-MM-DD)
  expectedDeliveryDate: varchar("expected_delivery_date", { length: 10 }), // 납기 예정일
  deliveryAddress: varchar("delivery_address", { length: 500 }), // 납품 장소

  // 금액 정보
  totalAmount: decimal("total_amount", { precision: 15, scale: 2 }).notNull().default("0.00"), // 공급가
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).notNull().default("0.00"), // 부가세
  grandTotal: decimal("grand_total", { precision: 15, scale: 2 }).notNull().default("0.00"), // 총액

  // 상태
  status: mysqlEnum("status", [
    "draft",              // 작성 중
    "approved",           // 승인됨 (발주 확정, 입고 대기)
    "partial_received",   // 일부 입고
    "received",           // 전량 입고
    "cancelled",          // 취소됨
  ]).notNull().default("draft"),

  // 승인 정보
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),

  // 취소 정보
  cancelledBy: bigint("cancelled_by", { mode: "number" }),
  cancelledAt: timestamp("cancelled_at"),
  cancelReason: text("cancel_reason"),

  // 메모
  notes: text("notes"),

  // 감사 정보
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantPoNumberIdx: uniqueIndex("uq_po_tenant_number").on(table.tenantId, table.poNumber),
  tenantStatusIdx: index("idx_po_tenant_status").on(table.tenantId, table.status),
  partnerIdx: index("idx_po_partner").on(table.partnerId),
  orderDateIdx: index("idx_po_order_date").on(table.orderDate),
}));

/**
 * 발주서 품목 라인 (Purchase Order Line)
 *
 * 각 라인이 h_materials 의 한 원재료에 대응.
 * received_qty 로 부분 입고 추적 (ordered_qty - received_qty = 미입고 잔량).
 */
export const purchaseOrderLines = mysqlTable("purchase_order_lines", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().default(1).references(() => tenants.id),
  poId: bigint("po_id", { mode: "number" }).notNull(),
  lineNumber: int("line_number").notNull(),

  // 품목 정보
  materialId: bigint("material_id", { mode: "number" }), // h_materials FK (optional — 비마스터 품목 가능)
  itemName: varchar("item_name", { length: 255 }).notNull(), // 품목명 (snapshot)
  itemCode: varchar("item_code", { length: 100 }), // 품목 코드 (snapshot)

  // 수량 정보
  orderedQty: decimal("ordered_qty", { precision: 10, scale: 3 }).notNull(), // 발주 수량
  receivedQty: decimal("received_qty", { precision: 10, scale: 3 }).notNull().default("0.000"), // 누적 입고 수량
  unit: varchar("unit", { length: 20 }).notNull(),

  // 금액
  unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // ordered_qty * unit_price
  taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0.00"),

  // 부가
  expectedDeliveryDate: varchar("expected_delivery_date", { length: 10 }),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  poLineIdx: uniqueIndex("uq_po_line").on(table.poId, table.lineNumber),
  materialIdx: index("idx_pol_material").on(table.materialId),
  tenantPoIdx: index("idx_pol_tenant_po").on(table.tenantId, table.poId),
}));
