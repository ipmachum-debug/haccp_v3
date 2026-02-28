import { mysqlTable, int, varchar, decimal, text, timestamp, index } from "drizzle-orm/mysql-core";

// 매입 품목 테이블
export const accountingPurchaseItems = mysqlTable(
  "accounting_purchase_items",
  {
    id: int("id").primaryKey().autoincrement(),
    purchaseId: int("purchase_id").notNull(),
    itemName: varchar("item_name", { length: 255 }).notNull(),
    specification: varchar("specification", { length: 255 }),
    packagingSize: decimal("packaging_size", { precision: 15, scale: 2 }), // 포장 규격 (예: 5kg의 5)
    quantity: decimal("quantity", { precision: 15, scale: 2 }).notNull(),
    unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0"),
    memo: text("memo"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    purchaseIdIdx: index("idx_purchase_id").on(table.purchaseId),
  })
);

// 매출 품목 테이블
export const accountingSaleItems = mysqlTable(
  "accounting_sale_items",
  {
    id: int("id").primaryKey().autoincrement(),
    saleId: int("sale_id").notNull(),
    itemName: varchar("item_name", { length: 255 }).notNull(),
    specification: varchar("specification", { length: 255 }),
    packagingSize: decimal("packaging_size", { precision: 15, scale: 2 }), // 포장 규격 (예: 5kg의 5)
    quantity: decimal("quantity", { precision: 15, scale: 2 }).notNull(),
    unitPrice: decimal("unit_price", { precision: 15, scale: 2 }).notNull(),
    amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
    taxAmount: decimal("tax_amount", { precision: 15, scale: 2 }).default("0"),
    memo: text("memo"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    saleIdIdx: index("idx_sale_id").on(table.saleId),
  })
);
