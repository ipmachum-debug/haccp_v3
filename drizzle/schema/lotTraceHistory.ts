import {mysqlTable, text,  timestamp, int} from "drizzle-orm/mysql-core";
import { tenants } from './schema_main';

/**
 * LOT 추적 이력 테이블
 * 사용자가 LOT 추적 기능을 사용할 때마다 이력을 저장
 */
export const lotTraceHistory = mysqlTable("lot_trace_history", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 추적 정보
  traceType: text("trace_type").notNull(), // 'forward' (정방향) 또는 'backward' (역방향)
  searchLotNumber: text("search_lot_number").notNull(), // 검색한 LOT 번호
  
  // 추적 결과 (JSON 형태로 저장)
  resultData: text("result_data").notNull(), // JSON.stringify된 추적 결과
  
  // 사용자 정보
  userId: int("user_id"), // 추적한 사용자 ID (nullable, 비로그인 사용자 대응)
  userName: text("user_name"), // 추적한 사용자 이름
  
  // 메타 정보
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * LOT 추적 통계 뷰용 타입
 */
export type LotTraceHistoryInsert = typeof lotTraceHistory.$inferInsert;
export type LotTraceHistorySelect = typeof lotTraceHistory.$inferSelect;
