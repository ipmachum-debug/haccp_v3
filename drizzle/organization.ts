import { mysqlTable, varchar, timestamp, boolean, bigint, int } from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * 문서 결재자 설정 테이블
 * 문서 타입별로 작성자/검토자/승인자를 지정
 * 
 * 기존 테이블 재사용:
 * - h_employees (schema_main.ts)
 * - h_departments (schema_main.ts)
 * - h_positions (schema_main.ts)
 */
export const hDocumentApprovalSettings = mysqlTable("h_document_approval_settings", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  documentType: varchar("document_type", { length: 100 }).notNull(), // daily_log, ccp, raw_material 등
  documentTypeName: varchar("document_type_name", { length: 255 }).notNull(), // 일일일지, CCP 모니터링 등
  
  // 작성자 (h_employees 테이블 참조)
  authorEmployeeId: bigint("author_employee_id", { mode: "number" }),
  
  // 검토자 (h_employees 테이블 참조)
  reviewerEmployeeId: bigint("reviewer_employee_id", { mode: "number" }),
  
  // 승인자 (h_employees 테이블 참조)
  approverEmployeeId: bigint("approver_employee_id", { mode: "number" }),
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
