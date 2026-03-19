/**
 * AI 엔진 스키마 - 규칙엔진, 알림, 판단로그, 기준서 테이블
 * HACCP AI Assistant 기반 테이블
 */

import { tenants } from "../schema_main";
import {
  bigint,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  varchar,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// ============================================================================
// 1. AI 규칙 정의 테이블 (ai_rules)
// ============================================================================
export const aiRules = mysqlTable(
  "ai_rules",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    // 규칙 기본 정보
    code: varchar("code", { length: 100 }).notNull(), // e.g., CCP_TEMP_LOW, CHECKLIST_MISSING
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),

    // 분류
    ruleType: mysqlEnum("rule_type", [
      "threshold",   // 임계값 비교 (온도, 압력, 수율 등)
      "missing",     // 누락 탐지 (체크리스트, 점검, 기록)
      "overdue",     // 기한 초과 (검교정, 교육, 문서 갱신)
      "anomaly",     // 이상 패턴 (수율 급변, 편차 등)
      "recurrence",  // 반복 탐지 (동일 이탈 반복)
    ]).notNull(),

    entityType: mysqlEnum("entity_type", [
      "ccp",         // CCP 모니터링
      "checklist",   // 체크리스트
      "equipment",   // 설비
      "batch",       // 배치/생산
      "lot",         // LOT 추적
      "inspection",  // 검사
      "hygiene",     // 위생
      "calibration", // 검교정
      "document",    // 문서
      "training",    // 교육
    ]).notNull(),

    // 규칙 조건 (JSON)
    conditions: json("conditions").$type<{
      field?: string;           // 비교 대상 필드
      operator?: string;        // lt, gt, eq, ne, missing, overdue, drop_pct
      value?: number | string;  // 기준값
      periodDays?: number;      // 기간 (일)
      recurrenceCount?: number; // 반복 횟수
      ccpType?: string;         // CCP 유형 필터
      checklistCategory?: string; // 체크리스트 카테고리 필터
      customQuery?: string;     // 커스텀 SQL 조건 (고급)
    }>().notNull(),

    // 심각도 및 알림
    severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull().default("medium"),
    notifyRoles: json("notify_roles").$type<string[]>(), // 알림 대상 역할

    // 활성화
    isActive: tinyint("is_active").default(1).notNull(),
    isSystem: tinyint("is_system").default(0).notNull(), // 시스템 기본 규칙 여부

    createdAt: datetime("created_at").default(sql`NOW()`).notNull(),
    updatedAt: datetime("updated_at").default(sql`NOW()`).notNull(),
  },
  (table) => [
    index("idx_ai_rules_tenant").on(table.tenantId),
    index("idx_ai_rules_code").on(table.tenantId, table.code),
    index("idx_ai_rules_type").on(table.ruleType, table.entityType),
  ]
);

// ============================================================================
// 2. AI 알림/경고 테이블 (ai_alerts)
// ============================================================================
export const aiAlerts = mysqlTable(
  "ai_alerts",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    // 규칙 참조
    ruleId: bigint("rule_id", { mode: "number" }).references(() => aiRules.id),
    ruleCode: varchar("rule_code", { length: 100 }).notNull(),

    // 알림 내용
    title: varchar("title", { length: 300 }).notNull(),
    message: text("message").notNull(),
    severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).notNull(),

    // 관련 엔티티
    entityType: varchar("entity_type", { length: 50 }).notNull(),
    entityId: bigint("entity_id", { mode: "number" }),
    entityCode: varchar("entity_code", { length: 100 }), // batch_code, checklist name, etc.

    // 컨텍스트 데이터 (AI가 참조한 데이터)
    contextData: json("context_data").$type<{
      actualValue?: number | string;
      expectedValue?: number | string;
      referenceDate?: string;
      relatedBatchIds?: number[];
      relatedLotIds?: number[];
      relatedEquipmentIds?: number[];
      additionalInfo?: Record<string, any>;
    }>(),

    // 상태
    status: mysqlEnum("status", [
      "active",       // 활성 경고
      "acknowledged", // 확인됨
      "resolved",     // 해결됨
      "dismissed",    // 무시됨
    ]).notNull().default("active"),

    acknowledgedBy: int("acknowledged_by"),
    acknowledgedAt: datetime("acknowledged_at"),
    resolvedBy: int("resolved_by"),
    resolvedAt: datetime("resolved_at"),
    resolvedNote: text("resolved_note"),

    createdAt: datetime("created_at").default(sql`NOW()`).notNull(),
    expiresAt: datetime("expires_at"), // 자동 만료 시간
  },
  (table) => [
    index("idx_ai_alerts_tenant").on(table.tenantId),
    index("idx_ai_alerts_status").on(table.tenantId, table.status),
    index("idx_ai_alerts_severity").on(table.tenantId, table.severity),
    index("idx_ai_alerts_entity").on(table.entityType, table.entityId),
    index("idx_ai_alerts_date").on(table.tenantId, table.createdAt),
  ]
);

// ============================================================================
// 3. AI 판단 로그 테이블 (ai_audit_logs)
// ============================================================================
export const aiAuditLogs = mysqlTable(
  "ai_audit_logs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    // 요청 정보
    actionType: mysqlEnum("action_type", [
      "rule_evaluation",      // 규칙 평가
      "summary_generation",   // 요약 생성
      "document_draft",       // 문서 초안 생성
      "checklist_generation", // 체크리스트 생성
      "inspection_analysis",  // 검사 분석
      "cause_analysis",       // 원인 분석
      "chat_response",        // 챗봇 응답
    ]).notNull(),

    // 입력 데이터 (AI가 받은 것)
    inputData: json("input_data").$type<Record<string, any>>(),

    // 참조 데이터 (AI가 참고한 것)
    referenceData: json("reference_data").$type<{
      tables?: string[];        // 참조한 테이블
      batchIds?: number[];      // 참조 배치
      lotIds?: number[];        // 참조 LOT
      documentIds?: number[];   // 참조 문서
      ruleIds?: number[];       // 적용된 규칙
      standardIds?: number[];   // 참조 기준서
    }>(),

    // 출력 데이터 (AI가 생성한 것)
    outputData: json("output_data").$type<Record<string, any>>(),
    outputText: text("output_text"), // LLM 텍스트 출력

    // 사용자 수정 (Human-in-the-loop)
    userModified: tinyint("user_modified").default(0),
    userModifiedData: json("user_modified_data").$type<Record<string, any>>(),
    approvedBy: int("approved_by"),
    approvedAt: datetime("approved_at"),

    // 메타
    modelUsed: varchar("model_used", { length: 100 }),
    tokensUsed: int("tokens_used"),
    latencyMs: int("latency_ms"),
    userId: int("user_id"),

    createdAt: datetime("created_at").default(sql`NOW()`).notNull(),
  },
  (table) => [
    index("idx_ai_audit_tenant").on(table.tenantId),
    index("idx_ai_audit_action").on(table.actionType),
    index("idx_ai_audit_date").on(table.tenantId, table.createdAt),
  ]
);

// ============================================================================
// 4. HACCP 기준서 테이블 (ai_standards)
// ============================================================================
export const aiStandards = mysqlTable(
  "ai_standards",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    // 기준서 기본 정보
    name: varchar("name", { length: 300 }).notNull(),
    description: text("description"),

    // 분류
    standardType: mysqlEnum("standard_type", [
      "haccp_plan",          // HACCP 관리계획
      "prerequisite",        // 선행요건 (PRP)
      "operational_prp",     // 운영선행요건 (OPRP)
      "ccp_standard",        // CCP 기준
      "sanitation",          // 위생관리기준
      "quality_standard",    // 품질기준
      "facility_standard",   // 시설기준
      "training_standard",   // 교육훈련기준
      "recall_plan",         // 리콜 계획
      "custom",              // 사용자 정의
    ]).notNull(),

    // 기준서 원문 내용
    content: text("content").notNull(), // 기준서 원문 텍스트 (붙여넣기 or OCR)

    // AI 파싱 결과
    parsedItems: json("parsed_items").$type<ParsedStandardItem[]>(),

    // 생성된 체크리스트 템플릿 ID (연결)
    generatedTemplateId: bigint("generated_template_id", { mode: "number" }),

    // 상태
    status: mysqlEnum("status", [
      "uploaded",   // 업로드됨
      "parsed",     // AI 파싱 완료
      "reviewed",   // 사용자 검토 완료
      "applied",    // 체크리스트 생성 적용됨
    ]).notNull().default("uploaded"),

    // 메타
    version: varchar("version", { length: 50 }),
    effectiveDate: datetime("effective_date"),
    isActive: tinyint("is_active").default(1).notNull(),
    createdBy: int("created_by"),
    createdAt: datetime("created_at").default(sql`NOW()`).notNull(),
    updatedAt: datetime("updated_at").default(sql`NOW()`).notNull(),
  },
  (table) => [
    index("idx_ai_standards_tenant").on(table.tenantId),
    index("idx_ai_standards_type").on(table.tenantId, table.standardType),
  ]
);

// ============================================================================
// 5. AI 배치 요약 테이블 (ai_batch_summaries) - AI Read Model
// ============================================================================
export const aiBatchSummaries = mysqlTable(
  "ai_batch_summaries",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    batchId: bigint("batch_id", { mode: "number" }).notNull(),
    batchCode: varchar("batch_code", { length: 100 }),
    summaryDate: datetime("summary_date").notNull(),

    // 핵심 지표
    yieldRate: int("yield_rate"),                  // 수율 (%)
    defectRate: int("defect_rate"),                // 불량률 (%)
    ccpDeviationCount: int("ccp_deviation_count"), // CCP 이탈 횟수
    checklistMissingCount: int("checklist_missing_count"), // 체크리스트 누락
    inspectionFailCount: int("inspection_fail_count"),     // 검사 불합격

    // AI 리스크 평가
    riskScore: int("risk_score"),                  // 0~100
    riskLevel: mysqlEnum("risk_level", ["low", "medium", "high", "critical"]),

    // AI 생성 요약
    summary: text("summary"),                      // AI 텍스트 요약
    anomalies: json("anomalies").$type<string[]>(), // 이상 징후 목록
    recommendations: json("recommendations").$type<string[]>(), // 추천 조치

    // 관련 알림
    alertIds: json("alert_ids").$type<number[]>(),

    createdAt: datetime("created_at").default(sql`NOW()`).notNull(),
    updatedAt: datetime("updated_at").default(sql`NOW()`).notNull(),
  },
  (table) => [
    index("idx_ai_batch_summary_tenant").on(table.tenantId),
    index("idx_ai_batch_summary_batch").on(table.batchId),
    index("idx_ai_batch_summary_date").on(table.tenantId, table.summaryDate),
    index("idx_ai_batch_summary_risk").on(table.tenantId, table.riskLevel),
  ]
);

// ============================================================================
// 타입 정의
// ============================================================================

/** 기준서 파싱 결과 항목 */
export type ParsedStandardItem = {
  id: string;              // 고유 식별자 (AI 생성)
  category: string;        // 분류 (위생, CCP, 설비 등)
  checkItem: string;       // 점검 항목
  standard: string;        // 기준/판정기준
  frequency: string;       // 점검 주기 (매일, 매주, 매월 등)
  method?: string;         // 점검 방법
  responsibleRole?: string;// 담당자 역할
  itemType?: string;       // checkbox, number, text, temperature, etc.
  validationRules?: {      // 유효성 규칙
    min?: number;
    max?: number;
    options?: string[];
  };
  importance?: "required" | "recommended" | "optional";
};

/** 규칙 평가 결과 */
export type RuleEvaluationResult = {
  ruleId: number;
  ruleCode: string;
  triggered: boolean;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  entityType: string;
  entityId?: number;
  entityCode?: string;
  contextData?: Record<string, any>;
};

// ============================================================================
// 6. AI 지식베이스 문서 테이블 (ai_knowledge_documents)
// ============================================================================
export const aiKnowledgeDocuments = mysqlTable(
  "ai_knowledge_documents",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    // 문서 기본 정보
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),

    // 분류
    docType: mysqlEnum("doc_type", [
      "regulation",        // 법규/규정 (식품위생법, HACCP 기준원 고시 등)
      "standard",          // 기준서/표준 (CODEX, ISO 22000 등)
      "sop",               // 표준작업절차서
      "manual",            // 매뉴얼/지침서
      "guideline",         // 가이드라인
      "training",          // 교육 자료
      "template",          // 양식/서식
      "faq",               // FAQ/Q&A
      "internal",          // 사내 문서
      "custom",            // 기타
    ]).notNull(),

    // 원본 콘텐츠
    content: text("content").notNull(),     // 원문 전문
    sourceUrl: varchar("source_url", { length: 1000 }),
    sourceFile: varchar("source_file", { length: 500 }),

    // 메타
    chunkCount: int("chunk_count").default(0),
    totalTokens: int("total_tokens").default(0),
    language: varchar("language", { length: 10 }).default("ko"),

    // 상태
    status: mysqlEnum("status", [
      "uploaded",     // 업로드됨
      "chunking",     // 청크 분할 중
      "embedding",    // 임베딩 생성 중
      "ready",        // 검색 가능
      "error",        // 오류
    ]).notNull().default("uploaded"),

    isActive: tinyint("is_active").default(1).notNull(),
    isGlobal: tinyint("is_global").default(0).notNull(), // 모든 테넌트 공유

    createdBy: int("created_by"),
    createdAt: datetime("created_at").default(sql`NOW()`).notNull(),
    updatedAt: datetime("updated_at").default(sql`NOW()`).notNull(),
  },
  (table) => [
    index("idx_ai_kb_docs_tenant").on(table.tenantId),
    index("idx_ai_kb_docs_type").on(table.tenantId, table.docType),
    index("idx_ai_kb_docs_status").on(table.status),
  ]
);

// ============================================================================
// 7. AI 지식베이스 청크 테이블 (ai_knowledge_chunks) - 임베딩 벡터 저장
// ============================================================================
export const aiKnowledgeChunks = mysqlTable(
  "ai_knowledge_chunks",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),
    documentId: bigint("document_id", { mode: "number" }).notNull().references(() => aiKnowledgeDocuments.id),

    // 청크 내용
    chunkIndex: int("chunk_index").notNull(),          // 문서 내 순서
    content: text("content").notNull(),                // 청크 텍스트
    tokenCount: int("token_count").default(0),

    // 임베딩 벡터 (JSON 배열로 저장 - MySQL에는 vector 타입 없음)
    embedding: json("embedding").$type<number[]>(),    // float[] (1536 dim for text-embedding-3-small)

    // 메타데이터 (검색 필터용)
    metadata: json("metadata").$type<{
      section?: string;       // 섹션/장 제목
      pageNumber?: number;    // 페이지 번호
      keywords?: string[];    // 핵심 키워드
      category?: string;      // 세부 카테고리
    }>(),

    createdAt: datetime("created_at").default(sql`NOW()`).notNull(),
  },
  (table) => [
    index("idx_ai_kb_chunks_tenant").on(table.tenantId),
    index("idx_ai_kb_chunks_doc").on(table.documentId),
    index("idx_ai_kb_chunks_idx").on(table.documentId, table.chunkIndex),
  ]
);

/** AI 대시보드 요약 */
export type AIDashboardSummary = {
  date: string;
  activeAlerts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    total: number;
  };
  missingDocuments: number;
  ccpDeviations: number;
  overdueCalibrations: number;
  batchRiskSummary: {
    high: number;
    medium: number;
    low: number;
  };
  recentAlerts: Array<{
    id: number;
    title: string;
    severity: string;
    createdAt: string;
  }>;
};
