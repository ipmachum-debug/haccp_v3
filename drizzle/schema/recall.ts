/**
 * 회수 시뮬레이션 시스템 스키마
 * 제품 추적성 및 회수 효과성 평가
 */

import { mysqlTable, bigint, varchar, text, decimal, date, timestamp, mysqlEnum, int } from "drizzle-orm/mysql-core";

/**
 * 회수 시뮬레이션 계획
 */
export const h_recall_simulations = mysqlTable("h_recall_simulations", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  
  // 기본 정보
  simulationNumber: varchar("simulation_number", { length: 50 }).notNull().unique(), // 시뮬레이션 번호 (예: RS-2026-001)
  simulationDate: date("simulation_date").notNull(), // 시뮬레이션 실시일
  simulationType: mysqlEnum("simulation_type", [
    "scheduled", // 정기 훈련
    "unscheduled", // 비정기 훈련
    "actual_recall", // 실제 회수
  ]).notNull(),
  
  // 대상 제품
  productId: bigint("product_id", { mode: "number" }).notNull(),
  productName: varchar("product_name", { length: 200 }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }).notNull(), // 회수 대상 LOT
  batchId: bigint("batch_id", { mode: "number" }), // 배치 ID
  
  // 회수 사유
  recallReason: text("recall_reason").notNull(), // 회수 사유
  recallCategory: mysqlEnum("recall_category", [
    "class_1", // Class I: 생명에 위협
    "class_2", // Class II: 건강에 위해
    "class_3", // Class III: 경미한 위해
  ]).notNull(),
  
  // 회수 범위
  productionDate: date("production_date").notNull(), // 생산일
  expiryDate: date("expiry_date"), // 유통기한
  totalProducedQuantity: decimal("total_produced_quantity", { precision: 10, scale: 2 }).notNull(), // 총 생산량
  totalProducedUnit: varchar("total_produced_unit", { length: 20 }).notNull(),
  
  // 유통 현황
  distributedQuantity: decimal("distributed_quantity", { precision: 10, scale: 2 }).notNull(), // 출고량
  remainingInventory: decimal("remaining_inventory", { precision: 10, scale: 2 }).notNull(), // 재고량
  
  // 회수 목표
  targetRecallQuantity: decimal("target_recall_quantity", { precision: 10, scale: 2 }).notNull(), // 회수 목표량
  targetRecallRate: decimal("target_recall_rate", { precision: 5, scale: 2 }).notNull(), // 목표 회수율 (%)
  
  // 회수 실적
  actualRecalledQuantity: decimal("actual_recalled_quantity", { precision: 10, scale: 2 }).default("0"), // 실제 회수량
  actualRecallRate: decimal("actual_recall_rate", { precision: 5, scale: 2 }).default("0"), // 실제 회수율 (%)
  
  // 시간 측정
  startTime: timestamp("start_time").notNull(), // 시뮬레이션 시작 시간
  endTime: timestamp("end_time"), // 시뮬레이션 종료 시간
  durationMinutes: int("duration_minutes"), // 소요 시간 (분)
  
  // 효과성 평가
  traceabilityScore: int("traceability_score"), // 추적성 점수 (0-100)
  responseTimeScore: int("response_time_score"), // 대응 시간 점수 (0-100)
  recallRateScore: int("recall_rate_score"), // 회수율 점수 (0-100)
  overallScore: int("overall_score"), // 종합 점수 (0-100)
  
  // 평가 결과
  result: mysqlEnum("result", [
    "excellent", // 우수
    "good", // 양호
    "fair", // 보통
    "poor", // 미흡
    "fail", // 불합격
  ]),
  
  // 개선 사항
  findings: text("findings"), // 발견 사항
  improvements: text("improvements"), // 개선 사항
  
  // 상태
  status: mysqlEnum("status", [
    "planned", // 계획
    "in_progress", // 진행 중
    "completed", // 완료
    "cancelled", // 취소
  ]).notNull().default("planned"),
  
  // 책임자
  responsiblePerson: bigint("responsible_person", { mode: "number" }).notNull(),
  participants: text("participants"), // 참가자 목록 (JSON)
  
  // 메타 정보
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  tenantId: int("tenant_id").notNull().default(1),
});

/**
 * 회수 대상 거래처 (유통 경로 추적)
 */
export const h_recall_distribution_tracking = mysqlTable("h_recall_distribution_tracking", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  simulationId: bigint("simulation_id", { mode: "number" }).notNull(),
  
  // 거래처 정보
  customerId: bigint("customer_id", { mode: "number" }).notNull(),
  customerName: varchar("customer_name", { length: 200 }).notNull(),
  customerType: mysqlEnum("customer_type", [
    "wholesaler", // 도매업체
    "retailer", // 소매업체
    "restaurant", // 음식점
    "institution", // 단체급식
    "other", // 기타
  ]).notNull(),
  
  // 출고 정보
  shipmentId: bigint("shipment_id", { mode: "number" }), // 출고 ID
  shipmentDate: date("shipment_date").notNull(),
  shippedQuantity: decimal("shipped_quantity", { precision: 10, scale: 2 }).notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  
  // 회수 정보
  notificationDate: date("notification_date"), // 회수 통지일
  notificationMethod: mysqlEnum("notification_method", [
    "phone", // 전화
    "email", // 이메일
    "fax", // 팩스
    "visit", // 방문
    "other", // 기타
  ]),
  
  recalledQuantity: decimal("recalled_quantity", { precision: 10, scale: 2 }).default("0"), // 회수량
  recallDate: date("recall_date"), // 회수일
  recallRate: decimal("recall_rate", { precision: 5, scale: 2 }).default("0"), // 회수율 (%)
  
  // 회수 상태
  recallStatus: mysqlEnum("recall_status", [
    "pending", // 회수 대기
    "notified", // 통지 완료
    "in_progress", // 회수 중
    "completed", // 회수 완료
    "failed", // 회수 실패
  ]).notNull().default("pending"),
  
  // 비고
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  tenantId: int("tenant_id").notNull().default(1),
});

/**
 * 회수 시뮬레이션 체크리스트
 */
export const h_recall_checklist = mysqlTable("h_recall_checklist", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  simulationId: bigint("simulation_id", { mode: "number" }).notNull(),
  
  // 체크리스트 항목
  category: mysqlEnum("category", [
    "preparation", // 준비 단계
    "identification", // 대상 식별
    "notification", // 통지
    "retrieval", // 회수
    "disposal", // 처리
    "documentation", // 문서화
    "evaluation", // 평가
  ]).notNull(),
  
  checkItem: varchar("check_item", { length: 500 }).notNull(),
  isCompleted: int("is_completed").notNull().default(0), // 0: 미완료, 1: 완료
  completedAt: timestamp("completed_at"),
  completedBy: bigint("completed_by", { mode: "number" }),
  
  // 소요 시간 (분)
  durationMinutes: int("duration_minutes"),
  
  // 비고
  notes: text("notes"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  tenantId: int("tenant_id").notNull().default(1),
});

/**
 * 회수 시뮬레이션 첨부 파일
 */
export const h_recall_attachments = mysqlTable("h_recall_attachments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  simulationId: bigint("simulation_id", { mode: "number" }).notNull(),
  
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: varchar("mime_type", { length: 100 }),
  attachmentType: mysqlEnum("attachment_type", [
    "photo", // 사진
    "document", // 문서
    "report", // 보고서
    "notification", // 통지서
    "other", // 기타
  ]).notNull().default("document"),
  description: text("description"),
  
  uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  tenantId: int("tenant_id").notNull().default(1),
});

/**
 * 회수 시뮬레이션 통계
 */
export const h_recall_stats = mysqlTable("h_recall_stats", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  
  year: int("year").notNull(),
  quarter: int("quarter"), // 분기 (1-4)
  
  // 시뮬레이션 통계
  totalSimulations: int("total_simulations").notNull().default(0),
  scheduledSimulations: int("scheduled_simulations").notNull().default(0),
  actualRecalls: int("actual_recalls").notNull().default(0),
  
  // 효과성 통계
  avgTraceabilityScore: decimal("avg_traceability_score", { precision: 5, scale: 2 }),
  avgResponseTimeScore: decimal("avg_response_time_score", { precision: 5, scale: 2 }),
  avgRecallRateScore: decimal("avg_recall_rate_score", { precision: 5, scale: 2 }),
  avgOverallScore: decimal("avg_overall_score", { precision: 5, scale: 2 }),
  
  // 평가 결과 분포
  excellentCount: int("excellent_count").notNull().default(0),
  goodCount: int("good_count").notNull().default(0),
  fairCount: int("fair_count").notNull().default(0),
  poorCount: int("poor_count").notNull().default(0),
  failCount: int("fail_count").notNull().default(0),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  tenantId: int("tenant_id").notNull().default(1),
});
