/**
 * support.ts - 문의 게시판 (Support Tickets) 스키마
 */
import { tenants } from './schema_main';
import {
  mysqlTable, bigint, varchar, text, timestamp,
  mysqlEnum, index, int, tinyint
} from "drizzle-orm/mysql-core";

/**
 * support_tickets - 고객 문의 게시판
 */
export const supportTickets = mysqlTable("support_tickets", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  // 비회원도 작성 가능하므로 tenantId는 nullable
  tenantId: int('tenant_id').references(() => tenants.id),
  // 작성자 정보
  authorName: varchar("author_name", { length: 100 }).notNull(),
  authorEmail: varchar("author_email", { length: 200 }).notNull(),
  authorPhone: varchar("author_phone", { length: 30 }),
  companyName: varchar("company_name", { length: 200 }),
  // 문의 내용
  category: mysqlEnum("category", [
    "general",      // 일반 문의
    "pricing",      // 요금 문의
    "technical",    // 기술 문의
    "demo",         // 데모 요청
    "partnership",  // 제휴 문의
    "bug",          // 버그 신고
    "feature",      // 기능 요청
    "other",        // 기타
  ]).notNull().default("general"),
  subject: varchar("subject", { length: 300 }).notNull(),
  content: text("content").notNull(),
  // 비밀번호 (비회원용 조회/수정)
  password: varchar("password", { length: 200 }),
  // 상태
  status: mysqlEnum("status", [
    "open",         // 접수됨
    "in_progress",  // 처리중
    "resolved",     // 해결됨
    "closed",       // 종료
  ]).notNull().default("open"),
  isPublic: tinyint("is_public").notNull().default(1), // 1=공개, 0=비공개
  // 관리자 답변
  reply: text("reply"),
  repliedAt: timestamp("replied_at"),
  repliedBy: varchar("replied_by", { length: 100 }),
  // 이메일 발송 여부
  emailSent: tinyint("email_sent").notNull().default(0),
  // 조회수
  viewCount: int("view_count").notNull().default(0),
  // 타임스탬프
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  statusIdx: index("idx_support_status").on(table.status),
  categoryIdx: index("idx_support_category").on(table.category),
  emailIdx: index("idx_support_email").on(table.authorEmail),
  createdIdx: index("idx_support_created").on(table.createdAt),
}));
