/**
 * 오늘의 5분 HACCP - Daily Micro Training 스키마
 *
 * h_training_topics: 120일치 교육 주제 (시스템 제공)
 * h_training_logs: 직원별 완료 기록
 * h_training_assignments: 날짜별 교육 배정 (배치 없는 날 이월 처리)
 */
import { int, mysqlTable, varchar, text, timestamp, mysqlEnum, tinyint, date } from "drizzle-orm/mysql-core";

// ── 교육 주제 (120일 순환) ──
export const hTrainingTopics = mysqlTable("h_training_topics", {
  id: int("id").autoincrement().primaryKey(),
  dayNo: int("day_no").notNull(),                 // 1~120
  title: varchar("title", { length: 100 }).notNull(),
  question: text("question").notNull(),            // 오늘의 질문
  content: text("content").notNull(),              // 핵심 내용
  action: text("action").notNull(),                // 오늘 행동
  category: mysqlEnum("category", [
    "BASIC", "HYGIENE", "PROCESS", "CCP", "TRACE", "RESPONSE"
  ]).notNull().default("BASIC"),
  tenantId: int("tenant_id").notNull().default(0), // 0 = 시스템 공통
  createdAt: timestamp("created_at").defaultNow(),
});

export type TrainingTopic = typeof hTrainingTopics.$inferSelect;
export type InsertTrainingTopic = typeof hTrainingTopics.$inferInsert;

// ── 직원별 교육 완료 기록 ──
export const hTrainingLogs = mysqlTable("h_training_logs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  dayNo: int("day_no").notNull(),
  assignmentDate: date("assignment_date").notNull(), // 실제 배정 날짜
  status: mysqlEnum("status", ["DONE", "SKIPPED"]).notNull().default("DONE"),
  completedAt: timestamp("completed_at").defaultNow(),
  tenantId: int("tenant_id").notNull(),
});

export type TrainingLog = typeof hTrainingLogs.$inferSelect;
export type InsertTrainingLog = typeof hTrainingLogs.$inferInsert;

// ── 날짜별 교육 배정 (휴무일 이월 처리 핵심) ──
export const hTrainingAssignments = mysqlTable("h_training_assignments", {
  id: int("id").autoincrement().primaryKey(),
  assignmentDate: date("assignment_date").notNull(), // 배정 날짜
  dayNo: int("day_no").notNull(),                    // 해당 날짜의 교육 Day
  tenantId: int("tenant_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type TrainingAssignment = typeof hTrainingAssignments.$inferSelect;
export type InsertTrainingAssignment = typeof hTrainingAssignments.$inferInsert;
