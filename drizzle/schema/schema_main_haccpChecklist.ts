/**
 * schema_main 분할: HACCP 체크리스트
 */
import {
  bigint, boolean, date, decimal, int, json,
  mysqlEnum, mysqlTable, text, timestamp, tinyint, varchar
} from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main_core";

/**
 * 2. 공기압축기 관리
 */

export const hAirCompressors = mysqlTable("h_air_compressors", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  equipmentCode: varchar("equipment_code", { length: 100 }).notNull().unique(), // 장비 코드
  equipmentName: varchar("equipment_name", { length: 200 }).notNull(),
  location: varchar("location", { length: 200 }).notNull(),
  installDate: date("install_date"),
  lastMaintenanceDate: date("last_maintenance_date"),
  nextMaintenanceDate: date("next_maintenance_date"),
  maintenanceCycle: int("maintenance_cycle").default(90), // 유지보수 주기 (일)
  status: mysqlEnum("status", ["normal", "warning", "error", "inactive"]).default("normal").notNull(),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 3. 공기압축기 점검 기록
 */

export const hAirCompressorChecks = mysqlTable("h_air_compressor_checks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  compressorId: bigint("compressor_id", { mode: "number" }).notNull(),
  checkDate: date("check_date").notNull(),
  pressure: decimal("pressure", { precision: 10, scale: 2 }), // 압력 (bar)
  temperature: decimal("temperature", { precision: 5, scale: 2 }), // 온도 (°C)
  oilLevel: mysqlEnum("oil_level", ["normal", "low", "high"]).default("normal"),
  filterCondition: mysqlEnum("filter_condition", ["good", "fair", "poor"]).default("good"),
  abnormalNoise: tinyint("abnormal_noise").default(0), // 이상 소음 여부
  leakage: tinyint("leakage").default(0), // 누출 여부
  checkResult: mysqlEnum("check_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 4. 유효성 평가 기록
 */

export const hValidityEvaluations = mysqlTable("h_validity_evaluations", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  evaluationDate: date("evaluation_date").notNull(),
  evaluationType: varchar("evaluation_type", { length: 100 }).notNull(), // 평가 유형 (예: HACCP 계획, CCP 모니터링)
  evaluationScope: text("evaluation_scope"), // 평가 범위
  evaluationMethod: text("evaluation_method"), // 평가 방법
  findings: text("findings"), // 발견 사항
  recommendations: text("recommendations"), // 권고 사항
  evaluationResult: mysqlEnum("evaluation_result", ["effective", "partially_effective", "ineffective"]).default("effective").notNull(),
  evaluatorId: bigint("evaluator_id", { mode: "number" }).notNull(),
  approvedBy: bigint("approved_by", { mode: "number" }),
  approvedAt: timestamp("approved_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 5. 개인위생 점검표
 */

/**
 * 6. 용수 사용 점검표
 */

export const hWaterUsageChecks = mysqlTable("h_water_usage_checks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  checkDate: date("check_date").notNull(),
  usageArea: varchar("usage_area", { length: 200 }).notNull(), // 사용 구역
  waterSource: varchar("water_source", { length: 100 }).notNull(), // 수원 (상수도, 지하수 등)
  usageAmount: decimal("usage_amount", { precision: 10, scale: 2 }), // 사용량 (톤)
  waterPressure: decimal("water_pressure", { precision: 10, scale: 2 }), // 수압 (bar)
  waterTemperature: decimal("water_temperature", { precision: 5, scale: 2 }), // 수온 (°C)
  visualInspection: mysqlEnum("visual_inspection", ["clear", "slightly_cloudy", "cloudy"]).default("clear"), // 육안 검사
  checkResult: mysqlEnum("check_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 7. 설비 세척·소독 기록
 */

export const hEquipmentCleaningRecords = mysqlTable("h_equipment_cleaning_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  equipmentId: bigint("equipment_id", { mode: "number" }),
  equipmentName: varchar("equipment_name", { length: 200 }).notNull(),
  cleaningDate: date("cleaning_date").notNull(),
  cleaningTime: varchar("cleaning_time", { length: 50 }), // 세척 시간
  cleaningMethod: varchar("cleaning_method", { length: 200 }), // 세척 방법
  detergentUsed: varchar("detergent_used", { length: 200 }), // 사용 세제
  sanitizerUsed: varchar("sanitizer_used", { length: 200 }), // 사용 소독제
  cleaningDuration: int("cleaning_duration"), // 세척 소요 시간 (분)
  verificationMethod: varchar("verification_method", { length: 200 }), // 검증 방법
  verificationResult: mysqlEnum("verification_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  cleanerId: bigint("cleaner_id", { mode: "number" }).notNull(),
  verifierId: bigint("verifier_id", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 8. 이물 관리 기록
 */

export const hForeignMaterialRecords = mysqlTable("h_foreign_material_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  detectionDate: date("detection_date").notNull(),
  detectionLocation: varchar("detection_location", { length: 200 }).notNull(), // 발견 위치
  productId: bigint("product_id", { mode: "number" }),
  batchId: bigint("batch_id", { mode: "number" }),
  materialType: varchar("material_type", { length: 100 }).notNull(), // 이물 종류 (금속, 플라스틱, 유리 등)
  materialDescription: text("material_description"), // 이물 상세 설명
  materialSize: varchar("material_size", { length: 100 }), // 이물 크기
  detectionMethod: varchar("detection_method", { length: 200 }), // 발견 방법 (육안, 금속검출기 등)
  immediateAction: text("immediate_action"), // 즉시 조치 사항
  rootCause: text("root_cause"), // 근본 원인
  correctiveAction: text("corrective_action"), // 시정 조치
  preventiveAction: text("preventive_action"), // 예방 조치
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "investigating", "resolved", "closed"]).default("open").notNull(),
  reportedBy: bigint("reported_by", { mode: "number" }).notNull(),
  investigatedBy: bigint("investigated_by", { mode: "number" }),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 9. 냉동·냉장 설비 점검
 */

export const hRefrigerationChecks = mysqlTable("h_refrigeration_checks", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  equipmentId: bigint("equipment_id", { mode: "number" }),
  equipmentName: varchar("equipment_name", { length: 200 }).notNull(),
  equipmentType: mysqlEnum("equipment_type", ["freezer", "refrigerator", "cold_storage"]).notNull(), // 설비 유형
  checkDate: date("check_date").notNull(),
  checkTime: varchar("check_time", { length: 50 }), // 점검 시간
  temperature: decimal("temperature", { precision: 5, scale: 2 }).notNull(), // 온도 (°C)
  targetTemperature: decimal("target_temperature", { precision: 5, scale: 2 }), // 목표 온도 (°C)
  humidity: decimal("humidity", { precision: 5, scale: 2 }), // 습도 (%)
  doorSealCondition: mysqlEnum("door_seal_condition", ["good", "fair", "poor"]).default("good"), // 문 밀폐 상태
  defrostCondition: mysqlEnum("defrost_condition", ["normal", "ice_buildup", "needs_defrost"]).default("normal"), // 제상 상태
  abnormalNoise: tinyint("abnormal_noise").default(0), // 이상 소음 여부
  checkResult: mysqlEnum("check_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * 10. 포장재 보관 관리
 */

export const hPackagingStorageRecords = mysqlTable("h_packaging_storage_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  materialId: bigint("material_id", { mode: "number" }),
  materialName: varchar("material_name", { length: 200 }).notNull(),
  materialType: varchar("material_type", { length: 100 }).notNull(), // 포장재 종류 (박스, 필름, 라벨 등)
  storageLocation: varchar("storage_location", { length: 200 }).notNull(), // 보관 위치
  receivedDate: date("received_date").notNull(), // 입고일
  lotNumber: varchar("lot_number", { length: 100 }),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  uom: varchar("uom", { length: 20 }).notNull(), // 단위
  storageCondition: mysqlEnum("storage_condition", ["good", "fair", "poor"]).default("good"), // 보관 상태
  temperatureControlled: tinyint("temperature_controlled").default(0), // 온도 관리 여부
  humidityControlled: tinyint("humidity_controlled").default(0), // 습도 관리 여부
  expiryDate: date("expiry_date"), // 유효기한
  inspectionResult: mysqlEnum("inspection_result", ["pass", "fail"]).default("pass").notNull(),
  remarks: text("remarks"),
  inspectorId: bigint("inspector_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 11. 품질 이상 발생 기록
 */

export const hQualityIssueRecords = mysqlTable("h_quality_issue_records", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().default(1).references(() => tenants.id),
  siteId: bigint("site_id", { mode: "number" }).notNull(),
  issueDate: date("issue_date").notNull(),
  issueType: varchar("issue_type", { length: 100 }).notNull(), // 이상 유형 (색상, 맛, 냄새, 포장 등)
  productId: bigint("product_id", { mode: "number" }),
  batchId: bigint("batch_id", { mode: "number" }),
  lotNumber: varchar("lot_number", { length: 100 }),
  issueDescription: text("issue_description").notNull(), // 이상 내용
  detectionStage: varchar("detection_stage", { length: 100 }), // 발견 단계 (원료, 공정, 완제품 등)
  affectedQuantity: decimal("affected_quantity", { precision: 10, scale: 2 }), // 영향 받은 수량
  immediateAction: text("immediate_action"), // 즉시 조치
  rootCause: text("root_cause"), // 근본 원인
  correctiveAction: text("corrective_action"), // 시정 조치
  preventiveAction: text("preventive_action"), // 예방 조치
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "investigating", "resolved", "closed"]).default("open").notNull(),
  reportedBy: bigint("reported_by", { mode: "number" }).notNull(),
  investigatedBy: bigint("investigated_by", { mode: "number" }),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 12. 개선조치(CAPA) 기록
 */

// ============================================================================
// 타입 정의 (11개 체크리스트)
// ============================================================================

export type AirCompressor = typeof hAirCompressors.$inferSelect;
export type InsertAirCompressor = typeof hAirCompressors.$inferInsert;

export type AirCompressorCheck = typeof hAirCompressorChecks.$inferSelect;
export type InsertAirCompressorCheck = typeof hAirCompressorChecks.$inferInsert;

export type ValidityEvaluation = typeof hValidityEvaluations.$inferSelect;
export type InsertValidityEvaluation = typeof hValidityEvaluations.$inferInsert;

export type WaterUsageCheck = typeof hWaterUsageChecks.$inferSelect;
export type InsertWaterUsageCheck = typeof hWaterUsageChecks.$inferInsert;

export type EquipmentCleaningRecord = typeof hEquipmentCleaningRecords.$inferSelect;
export type InsertEquipmentCleaningRecord = typeof hEquipmentCleaningRecords.$inferInsert;

export type ForeignMaterialRecord = typeof hForeignMaterialRecords.$inferSelect;
export type InsertForeignMaterialRecord = typeof hForeignMaterialRecords.$inferInsert;

export type RefrigerationCheck = typeof hRefrigerationChecks.$inferSelect;
export type InsertRefrigerationCheck = typeof hRefrigerationChecks.$inferInsert;

export type PackagingStorageRecord = typeof hPackagingStorageRecords.$inferSelect;
export type InsertPackagingStorageRecord = typeof hPackagingStorageRecords.$inferInsert;

export type QualityIssueRecord = typeof hQualityIssueRecords.$inferSelect;
export type InsertQualityIssueRecord = typeof hQualityIssueRecords.$inferInsert;

// ==================== 업로드 이력 ====================

export const hGenericChecklistRecords = mysqlTable("h_generic_checklist_records", {
  id: int("id").autoincrement().primaryKey(),
  siteId: int("site_id").notNull(),
  tenantId: int("tenant_id").notNull().default(1),
  formType: varchar("form_type", { length: 100 }).notNull(), // 폼 유형 식별자
  tenantSeq: int("tenant_seq"),
  formDate: varchar("form_date", { length: 20 }).notNull(), // 작성일 (YYYY-MM-DD)
  title: varchar("title", { length: 500 }), // 제목
  formData: json("form_data"), // 폼 데이터 (JSON)
  status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected"]).default("draft"),
  createdBy: int("created_by"),
  updatedBy: int("updated_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GenericChecklistRecord = typeof hGenericChecklistRecords.$inferSelect;
export type InsertGenericChecklistRecord = typeof hGenericChecklistRecords.$inferInsert;

// ============================================================================
// CCP 모니터링 기록지 (CCP Monitoring Form Records)
// CCP-2B: 가열(굽기), CCP-1B: 가열(증숙), CCP-4P: 금속검출
// ============================================================================

// Type exports
