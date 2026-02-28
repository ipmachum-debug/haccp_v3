import { tenants } from '../schema_main';
import { mysqlTable, serial, varchar, text, timestamp, int } from "drizzle-orm/mysql-core";

/**
 * 감사 로그 테이블
 * 시스템의 중요한 작업(배치 생성, CCP 승인, 사용자 역할 변경 등)을 기록
 */
export const auditLogs = mysqlTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  
  // 작업 정보
  action: varchar("action", { length: 100 }).notNull(), // 예: "batch.create", "ccp.approve", "user.updateRole"
  entityType: varchar("entity_type", { length: 50 }).notNull(), // 예: "batch", "ccp", "user"
  entityId: int("entity_id"), // 대상 엔티티의 ID (nullable, 삭제된 경우 등)
  
  // 사용자 정보
  userId: int("user_id").notNull(), // 작업을 수행한 사용자
  userEmail: varchar("user_email", { length: 255 }), // 사용자 이메일 (스냅샷)
  userRole: varchar("user_role", { length: 50 }), // 작업 당시 사용자 역할
  
  // 변경 내용
  changes: text("changes"), // JSON 형태로 변경 전후 데이터 저장
  description: text("description"), // 사람이 읽을 수 있는 설명
  
  // 메타데이터
  ipAddress: varchar("ip_address", { length: 45 }), // IPv4/IPv6
  userAgent: text("user_agent"), // 브라우저 정보
  
  // 타임스탬프
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
