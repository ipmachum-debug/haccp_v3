import {mysqlTable, varchar, text, timestamp,  bigint, int} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * 스케줄러 실행 로그 테이블
 * 스케줄러의 실행 이력을 기록하여 모니터링 및 디버깅에 활용
 */
export const hSchedulerLogs = mysqlTable("h_scheduler_logs", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  schedulerName: varchar("scheduler_name", { length: 100 }).notNull(), // 스케줄러 이름 (예: "notification_cleanup")
  executionTime: timestamp("execution_time").notNull(), // 실행 시간
  status: varchar("status", { length: 20 }).notNull(), // 실행 상태 (success, error)
  resultMessage: text("result_message"), // 실행 결과 메시지
  deletedCount: int("deleted_count").default(0), // 삭제된 레코드 수 (알림 정리 스케줄러의 경우)
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// hBatchCompletionRetries 테이블은 schema_main.ts에 이미 정의되어 있음
// hSystemSettings 테이블은 part2.ts에 이미 정의되어 있음
