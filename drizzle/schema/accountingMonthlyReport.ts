import {mysqlTable, bigint, varchar, text, decimal, date, timestamp, mysqlEnum, index, int} from "drizzle-orm/mysql-core";
import { tenants } from './schema_main';

/**
 * 월 마감 요약 테이블
 * 일일 마감 데이터를 기반으로 월간 집계 데이터 저장
 */
export const accountingMonthlySummary = mysqlTable("accounting_monthly_summary", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 기간 정보
  year: int("year").notNull(), // 연도 (예: 2026)
  month: int("month").notNull(), // 월 (1-12)
  
  // 집계 데이터
  totalDeposit: decimal("total_deposit", { precision: 15, scale: 2 }).notNull().default("0"), // 총 입금
  totalWithdrawal: decimal("total_withdrawal", { precision: 15, scale: 2 }).notNull().default("0"), // 총 출금
  netCashFlow: decimal("net_cash_flow", { precision: 15, scale: 2 }).notNull().default("0"), // 순현금흐름
  
  // 통계 데이터
  totalDays: int("total_days").notNull(), // 해당 월의 총 일수
  closedDays: int("closed_days").notNull(), // 마감 완료된 일수
  missingDays: text("missing_days"), // 마감 누락 일자 (JSON 배열: [1, 5, 15])
  
  // 고액 거래 통계
  highAmountCount: int("high_amount_count").notNull().default(0), // 고액 거래 건수
  highAmountThreshold: decimal("high_amount_threshold", { precision: 15, scale: 2 }).notNull().default("1000000"), // 고액 거래 임계값
  
  // 상태 관리
  status: mysqlEnum("status", ["draft", "confirmed", "locked"]).notNull().default("draft"),
  // draft: 초안 (수정 가능)
  // confirmed: 확정 (검토 완료, 잠금 전)
  // locked: 잠금 (수정 불가, 최종 확정)
  
  confirmedAt: timestamp("confirmed_at"), // 확정 일시
  confirmedBy: bigint("confirmed_by", { mode: "number" }), // 확정자 ID
  lockedAt: timestamp("locked_at"), // 잠금 일시
  lockedBy: bigint("locked_by", { mode: "number" }), // 잠금자 ID
  
  // 메모
  notes: text("notes"), // 특이사항 메모
  
  // 타임스탬프
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // 연도/월 복합 인덱스 (정렬 최적화)
  yearMonthIdx: index("idx_ams_year_month").on(table.year, table.month),
  // 상태 인덱스 (필터링 최적화)
  statusIdx: index("idx_ams_status").on(table.status),
}));

/**
 * 월 리포트 PDF 메타데이터 테이블
 */
export const accountingMonthlyReport = mysqlTable("accounting_monthly_report", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 연관 데이터
  summaryId: bigint("summary_id", { mode: "number" }).notNull(), // accounting_monthly_summary.id
  
  // PDF 파일 정보
  fileKey: varchar("file_key", { length: 500 }).notNull(), // S3 파일 키
  fileUrl: varchar("file_url", { length: 1000 }).notNull(), // S3 파일 URL
  fileName: varchar("file_name", { length: 255 }).notNull(), // 파일명 (예: "2026년_1월_월마감리포트.pdf")
  fileSize: bigint("file_size", { mode: "number" }), // 파일 크기 (bytes)
  
  // 생성 정보
  generatedBy: bigint("generated_by", { mode: "number" }).notNull(), // 생성자 ID
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
  
  // 버전 관리 (재생성 시 버전 증가)
  version: int("version").notNull().default(1),
});

/**
 * 고액 거래 리스트 테이블
 * 월 마감 시 임계값 이상의 거래 내역 저장
 */
export const accountingHighAmountTransactions = mysqlTable("accounting_high_amount_transactions", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 연관 데이터
  summaryId: bigint("summary_id", { mode: "number" }).notNull(), // accounting_monthly_summary.id
  dailyCloseId: bigint("daily_close_id", { mode: "number" }).notNull(), // accounting_daily_close.id
  
  // 거래 정보
  transactionDate: date("transaction_date").notNull(), // 거래 일자
  transactionType: mysqlEnum("transaction_type", ["deposit", "withdrawal"]).notNull(), // 입금/출금
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(), // 금액
  description: text("description"), // 거래 설명
  counterparty: varchar("counterparty", { length: 255 }), // 거래처
  
  // 타임스탬프
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 외부회계 문서함 테이블
 * 회계사/세무대리인과의 자료 교환
 */
export const accountingDocuments = mysqlTable("accounting_documents", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 문서 분류
  category: mysqlEnum("category", [
    "monthly_report", // 월마감 리포트
    "tax_invoice", // 세금계산서
    "receipt", // 증빙자료
    "journal_entry", // 기장자료
    "other" // 기타
  ]).notNull(),
  
  // 기간 정보 (선택)
  year: int("year"),
  month: int("month"),
  
  // 파일 정보
  fileKey: varchar("file_key", { length: 500 }).notNull(), // S3 파일 키
  fileUrl: varchar("file_url", { length: 1000 }).notNull(), // S3 파일 URL
  fileName: varchar("file_name", { length: 255 }).notNull(), // 원본 파일명
  fileSize: bigint("file_size", { mode: "number" }), // 파일 크기 (bytes)
  mimeType: varchar("mime_type", { length: 100 }), // MIME 타입
  
  // 문서 설명
  title: varchar("title", { length: 255 }).notNull(), // 문서 제목
  description: text("description"), // 문서 설명
  
  // 업로드 정보
  uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull(), // 업로드자 ID
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  
  // 타임스탬프
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  // 카테고리 인덱스 (필터링 최적화)
  categoryIdx: index("idx_ad_category").on(table.category),
  // 연도/월 복합 인덱스 (필터링 최적화)
  yearMonthIdx: index("idx_ad_year_month").on(table.year, table.month),
  // 업로드 날짜 인덱스 (정렬 최적화)
  uploadedAtIdx: index("idx_ad_uploaded_at").on(table.uploadedAt),
  // 복합 인덱스 (필터링 + 정렬 최적화)
  categoryUploadedAtIdx: index("idx_ad_category_uploaded_at").on(table.category, table.uploadedAt),
}));

/**
 * 외부회계 문서 워크플로우 테이블
 * 문서의 상태 변화 및 처리 이력 관리
 */
export const accountingDocumentWorkflow = mysqlTable("accounting_document_workflow", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 연관 문서
  documentId: bigint("document_id", { mode: "number" }).notNull(), // accounting_documents.id
  
  // 워크플로우 상태
  status: mysqlEnum("status", [
    "requested", // 요청됨 (회계팀 → 외부회계)
    "uploaded", // 업로드됨 (외부회계 → 회계팀)
    "reviewed", // 검토됨 (회계팀 검토 완료)
    "completed", // 완료 (처리 완료)
    "rejected" // 반려 (재작업 필요)
  ]).notNull(),
  
  // 상태 변경 정보
  changedBy: bigint("changed_by", { mode: "number" }).notNull(), // 상태 변경자 ID
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  
  // 코멘트
  comment: text("comment"), // 상태 변경 시 코멘트
  
  // 알림 발송 여부
  notificationSent: int("notification_sent").notNull().default(0), // 0: 미발송, 1: 발송완료
});

export type AccountingMonthlySummary = typeof accountingMonthlySummary.$inferSelect;
export type NewAccountingMonthlySummary = typeof accountingMonthlySummary.$inferInsert;

export type AccountingMonthlyReport = typeof accountingMonthlyReport.$inferSelect;
export type NewAccountingMonthlyReport = typeof accountingMonthlyReport.$inferInsert;

export type AccountingHighAmountTransaction = typeof accountingHighAmountTransactions.$inferSelect;
export type NewAccountingHighAmountTransaction = typeof accountingHighAmountTransactions.$inferInsert;

export type AccountingDocument = typeof accountingDocuments.$inferSelect;
export type NewAccountingDocument = typeof accountingDocuments.$inferInsert;

export type AccountingDocumentWorkflow = typeof accountingDocumentWorkflow.$inferSelect;
export type NewAccountingDocumentWorkflow = typeof accountingDocumentWorkflow.$inferInsert;
