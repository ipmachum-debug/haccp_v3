/**
 * 부적합 제품 관리 시스템 스키마
 * HACCP 실무 필수 기능
 */

import { mysqlTable, bigint, varchar, text, decimal, date, timestamp, mysqlEnum, int } from "drizzle-orm/mysql-core";

/**
 * 부적합 제품 등록
 */
export const h_nonconforming_products = mysqlTable("h_nonconforming_products", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  
  // 기본 정보
  ncpNumber: varchar("ncp_number", { length: 50 }).notNull().unique(), // 부적합 제품 번호 (예: NCP-2026-001)
  detectionDate: date("detection_date").notNull(), // 발견일
  detectionSource: mysqlEnum("detection_source", [
    "incoming_inspection", // 입고 검사
    "in_process_inspection", // 공정 검사
    "final_inspection", // 출하 검사
    "customer_complaint", // 고객 불만
    "internal_audit", // 내부 감사
    "ccp_monitoring", // CCP 모니터링
    "other", // 기타
  ]).notNull(),
  
  // 제품 정보
  productId: bigint("product_id", { mode: "number" }), // 제품 ID
  productName: varchar("product_name", { length: 200 }).notNull(),
  lotNumber: varchar("lot_number", { length: 100 }), // LOT 번호
  batchId: bigint("batch_id", { mode: "number" }), // 배치 ID
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(), // 부적합 수량
  unit: varchar("unit", { length: 20 }).notNull(), // 단위
  
  // 부적합 내용
  nonconformityType: mysqlEnum("nonconformity_type", [
    "physical", // 물리적 (이물질 등)
    "chemical", // 화학적 (잔류 농약 등)
    "biological", // 생물학적 (미생물 등)
    "sensory", // 관능적 (색, 맛, 냄새 등)
    "packaging", // 포장 불량
    "labeling", // 표시 불량
    "specification", // 규격 미달
    "other", // 기타
  ]).notNull(),
  nonconformityDescription: text("nonconformity_description").notNull(), // 부적합 상세 설명
  
  // 원인 분석
  rootCause: text("root_cause"), // 근본 원인
  causeCategory: mysqlEnum("cause_category", [
    "material", // 원재료
    "process", // 공정
    "equipment", // 장비
    "human_error", // 인적 오류
    "environment", // 환경
    "method", // 방법
    "other", // 기타
  ]),
  
  // 처리 방법
  disposalMethod: mysqlEnum("disposal_method", [
    "pending", // 처리 대기
    "rework", // 재작업
    "downgrade", // 등급 하향
    "alternative_use", // 용도 변경
    "disposal", // 폐기
    "return_to_supplier", // 공급업체 반품
    "customer_return", // 고객 반품
  ]).notNull().default("pending"),
  disposalDate: date("disposal_date"), // 처리일
  disposalDetails: text("disposal_details"), // 처리 상세 내용
  disposalCost: decimal("disposal_cost", { precision: 10, scale: 2 }), // 처리 비용
  
  // 책임자 및 승인
  detectedBy: bigint("detected_by", { mode: "number" }).notNull(), // 발견자
  responsiblePerson: bigint("responsible_person", { mode: "number" }), // 처리 책임자
  approvedBy: bigint("approved_by", { mode: "number" }), // 승인자
  approvedAt: timestamp("approved_at"),
  
  // 시정 조치 연계
  correctiveActionId: bigint("corrective_action_id", { mode: "number" }), // 시정 조치 ID (h_corrective_action_requests)
  
  // 재발 방지
  preventiveActions: text("preventive_actions"), // 재발 방지 대책
  
  // 상태
  status: mysqlEnum("status", [
    "detected", // 발견
    "under_investigation", // 조사 중
    "pending_disposal", // 처리 대기
    "disposed", // 처리 완료
    "closed", // 종결
  ]).notNull().default("detected"),
  
  // 메타 정보
  notes: text("notes"),
  createdBy: bigint("created_by", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  tenantId: int("tenant_id").notNull().default(1),
});

/**
 * 부적합 제품 첨부 파일
 */
export const h_nonconforming_product_attachments = mysqlTable("h_nonconforming_product_attachments", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  ncpId: bigint("ncp_id", { mode: "number" }).notNull(), // 부적합 제품 ID
  
  fileName: varchar("file_name", { length: 255 }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileSize: bigint("file_size", { mode: "number" }),
  mimeType: varchar("mime_type", { length: 100 }),
  attachmentType: mysqlEnum("attachment_type", [
    "photo", // 사진
    "document", // 문서
    "test_report", // 검사 성적서
    "other", // 기타
  ]).notNull().default("photo"),
  description: text("description"),
  
  uploadedBy: bigint("uploaded_by", { mode: "number" }).notNull(),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
  tenantId: int("tenant_id").notNull().default(1),
});

/**
 * 부적합 제품 통계 (월별)
 */
export const h_nonconforming_product_stats = mysqlTable("h_nonconforming_product_stats", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  
  year: int("year").notNull(),
  month: int("month").notNull(),
  
  // 발견 경로별 통계
  incomingInspectionCount: int("incoming_inspection_count").notNull().default(0),
  inProcessInspectionCount: int("in_process_inspection_count").notNull().default(0),
  finalInspectionCount: int("final_inspection_count").notNull().default(0),
  customerComplaintCount: int("customer_complaint_count").notNull().default(0),
  
  // 부적합 유형별 통계
  physicalCount: int("physical_count").notNull().default(0),
  chemicalCount: int("chemical_count").notNull().default(0),
  biologicalCount: int("biological_count").notNull().default(0),
  sensoryCount: int("sensory_count").notNull().default(0),
  packagingCount: int("packaging_count").notNull().default(0),
  
  // 처리 방법별 통계
  reworkCount: int("rework_count").notNull().default(0),
  disposalCount: int("disposal_count").notNull().default(0),
  returnCount: int("return_count").notNull().default(0),
  
  // 총계
  totalCount: int("total_count").notNull().default(0),
  totalQuantity: decimal("total_quantity", { precision: 10, scale: 2 }).notNull().default("0"),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }).notNull().default("0"),
  
  // 부적합률 (%)
  nonconformityRate: decimal("nonconformity_rate", { precision: 5, scale: 2 }),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  tenantId: int("tenant_id").notNull().default(1),
});
