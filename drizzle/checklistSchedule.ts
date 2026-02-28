import {
  bigint,
  datetime,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  tinyint,
  varchar,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

/**
 * 체크리스트 스케줄 테이블
 * 템플릿을 언제, 얼마나 자주 생성할지 정의
 */
export const checklistSchedules = mysqlTable(
  "checklist_schedules",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),

    // ✅ P0 FIX: 테넌트 격리 - 반드시 저장/조회 시 사용
    tenantId: bigint("tenant_id", { mode: "number" }).notNull().default(1),

    // 템플릿 참조
    templateId: bigint("template_id", { mode: "number" }).notNull(),
    
    // 주기 유형
    frequencyType: mysqlEnum("frequency_type", [
      "DAILY",      // 매일
      "WEEKLY",     // 매주
      "MONTHLY",    // 매월
      "YEARLY",     // 매년
      "INTERVAL",   // 특정 간격 (예: 90일마다)
    ]).notNull(),
    
    /**
     * 주기 규칙 (JSON)
     * 
     * DAILY: { workdaysOnly: boolean }
     * - workdaysOnly: true면 평일만, false면 매일
     * 
     * WEEKLY: { weekday: "MON"|"TUE"|"WED"|"THU"|"FRI"|"SAT"|"SUN", time: "09:00" }
     * - weekday: 요일
     * - time: 생성 시간
     * 
     * MONTHLY: { byWeekOfMonth: 1|2|3|4|"last", weekday: "MON", time: "09:00" }
     * - byWeekOfMonth: 몇 번째 주 (1=첫째주, 2=둘째주, 3=셋째주, 4=넷째주, "last"=마지막주)
     * - weekday: 요일
     * - time: 생성 시간
     * 
     * YEARLY: { month: 1-12, day: 1-31, time: "09:00" }
     * - month: 월 (1-12)
     * - day: 일 (1-31)
     * - time: 생성 시간
     * 
     * INTERVAL: { intervalDays: 90, rolling: boolean }
     * - intervalDays: 간격 (일 단위)
     * - rolling: true면 완료일 기준, false면 고정 주기
     */
    rule: json("rule").$type<{
      // DAILY
      workdaysOnly?: boolean;
      
      // WEEKLY
      weekday?: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";
      
      // MONTHLY
      byWeekOfMonth?: 1 | 2 | 3 | 4 | "last";
      
      // YEARLY
      month?: number;
      day?: number;
      
      // INTERVAL
      intervalDays?: number;
      rolling?: boolean;
      
      // 공통
      time?: string; // "HH:MM" 형식
    }>().notNull(),
    
    // 마감 시간 (예: "18:00")
    dueTime: varchar("due_time", { length: 5 }),
    
    // 유예 시간 (시간 단위)
    gracePeriodHours: bigint("grace_period_hours", { mode: "number" }).default(0),
    
    // 자동 생성 여부
    autoGenerate: tinyint("auto_generate").default(1).notNull(),
    
    // 활성화 여부
    active: tinyint("active").default(1).notNull(),
    
    // 마지막 생성일 (INTERVAL 타입에서 사용)
    lastGeneratedAt: datetime("last_generated_at", { mode: "string", fsp: 3 }),
    
    // 다음 생성 예정일 (INTERVAL 타입에서 사용)
    nextGenerateAt: datetime("next_generate_at", { mode: "string", fsp: 3 }),
    
    // 메타데이터
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  (table) => [
    index("idx_schedule_tenant").on(table.tenantId),
    index("idx_schedule_tenant_active").on(table.tenantId, table.active),
    index("idx_schedule_tenant_template").on(table.tenantId, table.templateId),
    index("idx_schedule_template").on(table.templateId),
    index("idx_schedule_active").on(table.active),
    index("idx_schedule_frequency").on(table.frequencyType),
    index("idx_schedule_next_generate").on(table.nextGenerateAt),
  ]
);

/**
 * 체크리스트 승인 이력 테이블
 */
export const checklistApprovals = mysqlTable(
  "checklist_approvals",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    
    // 인스턴스 참조
    instanceId: bigint("instance_id", { mode: "number" }).notNull(),
    
    // 승인자
    approverId: bigint("approver_id", { mode: "number" }).notNull(),
    
    // 액션
    action: mysqlEnum("action", [
      "APPROVE",          // 승인
      "REJECT",           // 반려
      "REQUEST_CHANGE",   // 수정 요청
    ]).notNull(),
    
    // 코멘트
    comment: varchar("comment", { length: 1000 }),
    
    // 생성 시간
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  (table) => [
    index("idx_approval_instance").on(table.instanceId),
    index("idx_approval_approver").on(table.approverId),
    index("idx_approval_created").on(table.createdAt),
  ]
);

// Relations
import { relations } from "drizzle-orm";
import { checklistTemplates, checklistInstances } from "./checklist";

export const checklistSchedulesRelations = relations(checklistSchedules, ({ one }) => ({
  template: one(checklistTemplates, {
    fields: [checklistSchedules.templateId],
    references: [checklistTemplates.id],
  }),
}));

export const checklistApprovalsRelations = relations(checklistApprovals, ({ one }) => ({
  instance: one(checklistInstances, {
    fields: [checklistApprovals.instanceId],
    references: [checklistInstances.id],
  }),
}));
