import {mysqlTable, bigint, varchar, text, timestamp, mysqlEnum, int, index} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * 커뮤니케이션 로그 테이블
 * 거래처별 메모/커뮤니케이션 추적 및 상태 관리
 * 
 * 기능:
 * - 거래처별 메모 작성 및 관리
 * - 상태 관리: 접수(received) → 진행중(in_progress) → 처리완료(completed)
 * - 작성자 기반 권한 관리 (본인 작성 메모만 수정/삭제 가능)
 * - 멘션 기능 (@username)
 * - 시간순 정렬 (최신순)
 */
export const communicationLogs = mysqlTable("communication_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 거래처 정보
  partnerId: bigint("partner_id", { mode: "number" }).notNull(), // partners.id 참조
  
  // 메모 내용
  content: text("content").notNull(), // 메모 내용
  
  // 상태 관리
  status: mysqlEnum("status", ["received", "in_progress", "completed"])
    .notNull()
    .default("received"),
  // received: 접수 (빨강)
  // in_progress: 진행중 (노랑)
  // completed: 처리완료 (초록)
  
  // 작성자 정보
  authorId: bigint("author_id", { mode: "number" }).notNull(), // users.id 참조
  
  // 멘션 정보 (JSON 배열: [userId1, userId2, ...])
  mentions: text("mentions"), // JSON 형식으로 저장
  
  // 타임스탬프
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // 거래처별 조회 최적화 인덱스
  partnerIdIdx: index("idx_cl_partner_id").on(table.partnerId),
  // 상태별 필터링 최적화 인덱스
  statusIdx: index("idx_cl_status").on(table.status),
  // 작성자별 조회 최적화 인덱스
  authorIdIdx: index("idx_cl_author_id").on(table.authorId),
  // 생성일시 정렬 최적화 인덱스
  createdAtIdx: index("idx_cl_created_at").on(table.createdAt),
  // 거래처 + 생성일시 복합 인덱스 (거래처별 시간순 조회 최적화)
  partnerCreatedIdx: index("idx_cl_partner_created").on(table.partnerId, table.createdAt),
}));

export type CommunicationLog = typeof communicationLogs.$inferSelect;
export type NewCommunicationLog = typeof communicationLogs.$inferInsert;
