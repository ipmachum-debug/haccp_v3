import {mysqlTable, serial, varchar, bigint, timestamp, int} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * 백업 메타데이터 테이블
 * 로컬 및 S3 백업 파일의 메타데이터를 저장
 */
export const hBackups = mysqlTable("h_backups", {
  id: serial("id").primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  
  // 백업 파일 정보
  fileName: varchar("file_name", { length: 255 }).notNull(), // 예: "haccp_backup_20260121_120000.sql.gz"
  fileSize: bigint("file_size", { mode: "number" }), // 파일 크기 (bytes)
  backupType: varchar("backup_type", { length: 20 }).notNull(), // "local" | "s3" | "both"
  
  // S3 정보
  s3Url: varchar("s3_url", { length: 500 }), // S3 파일 URL (nullable, S3 백업이 아닌 경우)
  s3Key: varchar("s3_key", { length: 500 }), // S3 파일 키 (nullable)
  
  // 백업 상태
  status: varchar("status", { length: 20 }).notNull().default("completed"), // "pending" | "completed" | "failed"
  errorMessage: varchar("error_message", { length: 500 }), // 실패 시 에러 메시지
  
  // 생성 정보
  createdBy: bigint("created_by", { mode: "number" }), // 백업을 생성한 사용자 ID (nullable, 자동 백업의 경우)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type HBackup = typeof hBackups.$inferSelect;
export type NewHBackup = typeof hBackups.$inferInsert;
