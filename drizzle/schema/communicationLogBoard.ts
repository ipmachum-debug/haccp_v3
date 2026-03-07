import { mysqlTable, bigint, int, timestamp, boolean, index, foreignKey, uniqueIndex } from "drizzle-orm/mysql-core";
import { tenants } from "../schema_main";
import { communicationLogs } from "./communicationLog";

/**
 * 커뮤니케이션 로그 확인(ACK) 테이블
 * 일반직원이 공지보드에서 '확인' 버튼을 눌렀을 때 기록
 */
export const communicationLogAcks = mysqlTable(
  "communication_log_acks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull(),
    logId: bigint("log_id", { mode: "number" }).notNull(),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    checkedAt: timestamp("checked_at").notNull().defaultNow(),
  },
  (table) => ({
    tenantFk: foreignKey({
      columns: [table.tenantId],
      foreignColumns: [tenants.id],
    }).onDelete("cascade"),
    logFk: foreignKey({
      columns: [table.logId],
      foreignColumns: [communicationLogs.id],
    }).onDelete("cascade"),
    logIdIdx: index("idx_cla_log_id").on(table.logId),
    userIdIdx: index("idx_cla_user_id").on(table.userId),
    // 한 유저가 같은 로그에 중복 확인 방지
    uniqueAck: uniqueIndex("idx_cla_unique_ack").on(table.logId, table.userId),
  })
);

export type CommunicationLogAck = typeof communicationLogAcks.$inferSelect;
export type NewCommunicationLogAck = typeof communicationLogAcks.$inferInsert;
