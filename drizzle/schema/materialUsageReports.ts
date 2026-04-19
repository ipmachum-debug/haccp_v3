/**
 * 원료수불 기간 보고서 (주간/월간) 저장 스키마
 *
 * - 보고서 본문(JSON) 은 report_data 에 스냅샷으로 저장
 * - 승인 워크플로우와 연동: status 와 approval_request_id 보유
 * - 인쇄 이력 추적: printed_at, printed_by
 */
import { mysqlTable, bigint, int, varchar, decimal, text, timestamp, mysqlEnum, json, index, uniqueIndex, date } from "drizzle-orm/mysql-core";

export const materialUsageReports = mysqlTable("material_usage_reports", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull(),
  reportType: mysqlEnum("report_type", ["week", "month", "custom"]).notNull().default("week"),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  periodLabel: varchar("period_label", { length: 200 }).notNull(),
  weekNumber: int("week_number"),
  title: varchar("title", { length: 255 }).notNull(),
  reportData: json("report_data").notNull(), // 보고서 본문 스냅샷
  summaryProductionKg: decimal("summary_production_kg", { precision: 12, scale: 3 }).default("0"),
  summaryProductionKinds: int("summary_production_kinds").default(0),
  summarySalesKg: decimal("summary_sales_kg", { precision: 12, scale: 3 }).default("0"),
  summaryReceivingKg: decimal("summary_receiving_kg", { precision: 12, scale: 3 }).default("0"),
  materialCount: int("material_count").default(0),
  batchCount: int("batch_count").default(0),
  status: mysqlEnum("status", [
    "draft",
    "pending_review",
    "pending_approval",
    "approved",
    "rejected",
  ]).notNull().default("draft"),
  approvalRequestId: bigint("approval_request_id", { mode: "number" }),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  reviewedBy: bigint("reviewed_by", { mode: "number" }),
  reviewedAt: timestamp("reviewed_at"),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  rejectedBy: bigint("rejected_by", { mode: "number" }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  printedAt: timestamp("printed_at"),
  printedBy: bigint("printed_by", { mode: "number" }),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (t) => ({
  tenantIdx: index("idx_mur_tenant").on(t.tenantId),
  periodIdx: index("idx_mur_period").on(t.tenantId, t.reportType, t.periodStart),
  statusIdx: index("idx_mur_status").on(t.tenantId, t.status),
  uqPeriod: uniqueIndex("uq_mur_period").on(t.tenantId, t.reportType, t.periodStart, t.periodEnd),
}));

export type MaterialUsageReportRow = typeof materialUsageReports.$inferSelect;
export type InsertMaterialUsageReport = typeof materialUsageReports.$inferInsert;
