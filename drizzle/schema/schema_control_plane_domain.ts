import { tenants } from './schema_main';
/**
 * Control Plane Schema - Domain Specific (HACCP/ERP)
 * HACCP & ERP 특화 운영 테이블
 */

import { mysqlTable, varchar, text, timestamp, int, decimal, json, index } from "drizzle-orm/mysql-core";
import { tenants } from "./schema_control_plane";

// ============================================
// 9. HACCP/ERP 특화 운영 테이블
// ============================================

/**
 * 테넌트별 일일 KPI
 * 슈퍼관리자가 고객사의 운영 상태를 모니터링
 */
export const tenantKpiDaily = mysqlTable("tenant_kpi_daily", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  
  // HACCP 지표
  ccpMissingRate: decimal("ccp_missing_rate", { precision: 5, scale: 2 }), // CCP 미입력률 (%)
  approvalBacklog: int("approval_backlog").default(0), // 승인 대기 건수
  
  // 시스템 지표
  failedJobs: int("failed_jobs").default(0), // 실패한 작업 수
  activeUsers: int("active_users").default(0), // 활성 사용자 수
  
  // ERP 지표
  batchesCreated: int("batches_created").default(0), // 생성된 배치 수
  inventoryTransactions: int("inventory_transactions").default(0), // 재고 거래 수
  accountingTransactions: int("accounting_transactions").default(0), // 회계 거래 수
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantDateIdx: index("tenant_date_idx").on(table.tenantId, table.date),
}));

/**
 * 고객 지원 티켓
 * 테넌트의 문의/요청 관리
 */
export const supportTickets = mysqlTable("support_tickets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  channel: varchar("channel", { length: 20 }).notNull(), // inapp/email/phone
  status: varchar("status", { length: 20 }).notNull().default("open"), // open/in_progress/resolved/closed
  priority: varchar("priority", { length: 20 }).notNull().default("normal"), // low/normal/high/urgent
  
  subject: varchar("subject", { length: 255 }).notNull(),
  description: text("description"),
  
  // 요청자 정보
  requesterName: varchar("requester_name", { length: 100 }),
  requesterEmail: varchar("requester_email", { length: 255 }),
  requesterPhone: varchar("requester_phone", { length: 50 }),
  
  // 담당자 정보
  assignedToId: varchar("assigned_to_id", { length: 36 }), // super_admin_users.id
  
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  statusIdx: index("status_idx").on(table.status),
  assignedToIdx: index("assigned_to_idx").on(table.assignedToId),
}));

/**
 * 지원 티켓 댓글
 */
export const supportTicketComments = mysqlTable("support_ticket_comments", {
  id: varchar("id", { length: 36 }).primaryKey(),
  ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => supportTickets.id, { onDelete: "cascade" }),
  
  authorType: varchar("author_type", { length: 20 }).notNull(), // super_admin/tenant_user
  authorId: varchar("author_id", { length: 36 }).notNull(),
  authorName: varchar("author_name", { length: 100 }).notNull(),
  
  message: text("message").notNull(),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  ticketIdIdx: index("ticket_id_idx").on(table.ticketId),
}));

/**
 * 데이터 임포트 실행 기록
 * 엑셀 일괄 업로드/캘리브레이션 추적
 */
export const dataImportRuns = mysqlTable("data_import_runs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),
  
  type: varchar("type", { length: 50 }).notNull(), // materials/ccp_limits/inventory/products/partners
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending/processing/success/failed
  
  rowsTotal: int("rows_total").default(0),
  rowsSuccess: int("rows_success").default(0),
  rowsFailed: int("rows_failed").default(0),
  
  // 파일 정보
  fileName: varchar("file_name", { length: 255 }),
  fileSize: int("file_size"), // bytes
  fileUri: text("file_uri"), // S3 URI
  
  // 에러 리포트
  errorReportUri: text("error_report_uri"), // S3 URI for error CSV
  errorSummaryJson: json("error_summary_json").$type<Array<{
    row: number;
    error: string;
  }>>(),
  
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  tenantIdIdx: index("tenant_id_idx").on(table.tenantId),
  statusIdx: index("status_idx").on(table.status),
  typeIdx: index("type_idx").on(table.type),
}));

/**
 * 테넌트 온보딩 진행 상태
 * 고객사의 초기 설정 완료 추적
 */
export const tenantOnboarding = mysqlTable("tenant_onboarding", {
  tenantId: varchar("tenant_id", { length: 36 }).primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  
  // 온보딩 단계 체크리스트
  stepsJson: json("steps_json").$type<{
    companyInfoCompleted?: boolean;
    usersInvited?: boolean;
    materialsImported?: boolean;
    productsImported?: boolean;
    sitesConfigured?: boolean;
    firstBatchCreated?: boolean;
    firstCcpRecorded?: boolean;
  }>(),
  
  completedAt: timestamp("completed_at"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});

/**
 * 테넌트 알림 설정
 * 고객사별 알림 채널 및 설정
 */
export const tenantNotificationSettings = mysqlTable("tenant_notification_settings", {
  tenantId: varchar("tenant_id", { length: 36 }).primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  
  // 알림 채널
  emailEnabled: boolean("email_enabled").default(true),
  smsEnabled: boolean("sms_enabled").default(false),
  slackWebhookUrl: varchar("slack_webhook_url", { length: 255 }),
  
  // 알림 수신 이메일 목록
  notificationEmails: json("notification_emails").$type<string[]>(),
  
  // 알림 유형별 설정
  alertsJson: json("alerts_json").$type<{
    ccpOutOfRange?: boolean;
    approvalRequired?: boolean;
    batchCompleted?: boolean;
    lowInventory?: boolean;
    systemError?: boolean;
  }>(),
  
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
