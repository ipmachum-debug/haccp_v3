/**
 * domain_events — Outbox 패턴 기반 도메인 이벤트 저장소
 *
 * 배경: docs/architecture/03-event-catalog.md
 * 소유 레이어: platform/event-bus/
 *
 * 쓰기 트랜잭션과 함께 INSERT 되고, worker 가 UNPROCESSED 행을 읽어 구독자에게 전달.
 */

import {
  bigint,
  int,
  json,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const domainEvents = mysqlTable("domain_events", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
  aggregateId: bigint("aggregate_id", { mode: "number" }).notNull(),
  payload: json("payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: bigint("created_by", { mode: "number" }),
  processedAt: timestamp("processed_at"),
  processingAttempts: int("processing_attempts").default(0).notNull(),
  lastError: text("last_error"),
});

export type DomainEventRow = typeof domainEvents.$inferSelect;
export type NewDomainEvent = typeof domainEvents.$inferInsert;
