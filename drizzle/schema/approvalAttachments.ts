/**
 * 승인 요청 첨부 파일 — PR #265
 *
 * 작성자 사전 검토 단계 (pending_writer) 에서 사진 / 문서 업로드 보조.
 * S3 업로드 → file_url 저장 → 검토자가 함께 확인.
 *
 * 작성: 2026-05-06 (PR #265)
 */
import { mysqlTable, bigint, varchar, int, timestamp, mysqlEnum, text } from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main";

export const hApprovalAttachments = mysqlTable("h_approval_attachments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  approvalRequestId: bigint("approval_request_id", { mode: "number" }).notNull(),

  /** S3 / forge URL */
  fileUrl: varchar("file_url", { length: 1000 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: varchar("mime_type", { length: 100 }),

  /** photo / document / other */
  attachmentType: mysqlEnum("attachment_type", ["photo", "document", "other"]).default("photo").notNull(),

  /** 첨부 설명 (옵션) — 작성자가 사진 설명 입력 가능 */
  caption: text("caption"),

  uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
});

export type ApprovalAttachment = typeof hApprovalAttachments.$inferSelect;
export type NewApprovalAttachment = typeof hApprovalAttachments.$inferInsert;
