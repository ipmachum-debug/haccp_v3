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
import { sql, relations } from "drizzle-orm";

/**
 * 체크리스트 템플릿 테이블
 * 재사용 가능한 체크리스트 템플릿 정의
 */
export const checklistTemplates = mysqlTable(
  "checklist_templates",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),

    // ✅ P0 FIX: 테넌트 격리 - 반드시 저장/조회 시 사용
    tenantId: bigint("tenant_id", { mode: "number" }).notNull(),

    // 기본 정보
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    
    // 분류
    category: mysqlEnum("category", [
      "CCP",
      "SANITATION",
      "QUALITY",
      "SAFETY",
      "TRAINING",
      "MAINTENANCE",
    ]).notNull(),
    
    // CCP 관련 (category가 CCP인 경우)
    ccpType: varchar("ccp_type", { length: 50 }), // 예: CCP-1B, CCP-2B, CCP-4P
    
    // 우선순위 및 활성화
    priority: int("priority").default(0).notNull(),
    isActive: tinyint("is_active").default(1).notNull(),
    
    // 생성 모드 및 주기
    generationMode: mysqlEnum("generation_mode", ["manual", "auto"]).default("manual").notNull(),
    frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly", "batch_create", "batch_complete"]),
    
    // 자동 생성 규칙 (JSON)
    // 예: { "triggerOn": "batch_create", "productCategory": "떡류", "conditions": {...} }
    autoTriggerRules: json("auto_trigger_rules").$type<{
      triggerOn?: string; // batch_create, batch_complete, daily, weekly
      productCategory?: string;
      conditions?: Record<string, any>;
    }>(),
    
    // 첨부파일 필요 여부
    requiresAttachment: tinyint("requires_attachment").default(0),
    
    // 승인 필요 여부
    requiresApproval: tinyint("requires_approval").default(0),
    
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
    index("idx_checklist_template_tenant").on(table.tenantId),
    index("idx_checklist_template_tenant_active").on(table.tenantId, table.isActive),
    index("idx_checklist_template_category").on(table.category),
    index("idx_checklist_template_active").on(table.isActive),
    index("idx_checklist_template_ccp_type").on(table.ccpType),
  ]
);

/**
 * 체크리스트 템플릿 항목 테이블
 * 각 템플릿의 점검 항목 정의
 */
export const checklistTemplateItems = mysqlTable(
  "checklist_template_items",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    
    // 템플릿 참조
    templateId: bigint("template_id", { mode: "number" }).notNull(),
    
    // 항목 정보
    sortOrder: int("sort_order").notNull(),
    itemName: text("item_name").notNull(), // itemText → itemName으로 변경
    
    // 입력 타입
    itemType: mysqlEnum("item_type", [ // inputType → itemType으로 변경
      "checkbox",
      "number",
      "text",
      "textarea", // textarea 추가
      "select",
      "time",
      "date",
      "temperature",
      "pressure",
    ])
      .default("checkbox")
      .notNull(),
    
    // 설명
    description: text("description"), // 추가
    
    // 필수 여부
    required: tinyint("required").default(1).notNull(),
    
    // 검증 규칙 (JSON)
    // 예: { "min": 85, "max": 100, "unit": "℃" }
    validationRules: json("validation_rules").$type<{
      min?: number;
      max?: number;
      unit?: string;
      options?: string[]; // select 타입용
      pattern?: string; // text 타입용 정규식
    }>(),
    
    // 기본값
    defaultValue: varchar("default_value", { length: 255 }),
    
    // 도움말
    helpText: text("help_text"),
    
    // 메타데이터
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  (table) => [
    index("idx_checklist_item_template").on(table.templateId),
    index("idx_checklist_item_sort").on(table.templateId, table.sortOrder),
  ]
);

/**
 * 체크리스트 인스턴스 테이블
 * 실제 작성되는 체크리스트
 */
export const checklistInstances = mysqlTable(
  "checklist_instances",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),

    // ✅ P0 FIX: 테넌트 격리
    tenantId: bigint("tenant_id", { mode: "number" }).notNull(),

    // 템플릿 참조
    templateId: bigint("template_id", { mode: "number" }).notNull(),
    
    // 연결 정보 (배치, CCP 등)
    batchId: bigint("batch_id", { mode: "number" }),
    ccpRecordId: bigint("ccp_record_id", { mode: "number" }),
    
    // 기간 키 (YYYY-MM-DD, YYYY-Www, YYYY-MM, YYYY)
    periodKey: varchar("period_key", { length: 50 }),
    
    // 첨부파일 (JSON 배열)
    attachments: json("attachments").$type<Array<{
      url: string;
      key: string;
      fileName: string;
      mimeType: string;
      uploadedAt: string;
      uploadedBy: number;
    }>>(),
    
    // AI 자동 작성 여부
    aiGenerated: tinyint("ai_generated").default(0),
    
    // 상태 - 승인 플로우 상태 추가
    status: mysqlEnum("status", [
      "pending",
      "in_progress",
      "completed",
      "pending_review", // 승인 대기 추가
      "approved", // 승인됨 추가
      "rejected", // 반려됨 추가
      "skipped",
      "cancelled",
    ])
      .default("pending")
      .notNull(),
    
    // 일정
    targetDate: datetime("target_date", { mode: "string" }), // scheduledDate → targetDate로 변경
    scheduledDate: datetime("scheduled_date", { mode: "string" }), // 호환성 유지
    dueDate: datetime("due_date", { mode: "string" }),
    
    // 담당자
    assignedTo: bigint("assigned_to", { mode: "number" }), // 추가
    
    // 완료 정보
    completedAt: datetime("completed_at", { mode: "string", fsp: 3 }),
    completedBy: bigint("completed_by", { mode: "number" }),
    
    // 검토/승인 정보
    reviewerId: bigint("reviewer_id", { mode: "number" }), // 승인자 ID 추가
    reviewedAt: datetime("reviewed_at", { mode: "string", fsp: 3 }),
    reviewedBy: bigint("reviewed_by", { mode: "number" }),
    reviewComments: text("review_comments"), // reviewNotes → reviewComments로 변경
    reviewNotes: text("review_notes"), // 호환성 유지
    
    // 반려 사유
    rejectedReason: text("rejected_reason"),
    
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
    index("idx_checklist_instance_tenant").on(table.tenantId),
    index("idx_checklist_instance_tenant_status").on(table.tenantId, table.status),
    index("idx_checklist_instance_template").on(table.templateId),
    index("idx_checklist_instance_batch").on(table.batchId),
    index("idx_checklist_instance_status").on(table.status),
    index("idx_checklist_instance_scheduled").on(table.scheduledDate),
    index("idx_checklist_instance_target").on(table.targetDate),
  ]
);

/**
 * 체크리스트 인스턴스 항목 테이블
 * 실제 작성된 체크리스트 항목 및 값
 */
export const checklistInstanceItems = mysqlTable(
  "checklist_instance_items",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    
    // 인스턴스 및 템플릿 항목 참조
    instanceId: bigint("instance_id", { mode: "number" }).notNull(),
    templateItemId: bigint("template_item_id", { mode: "number" }).notNull(),
    
    // 항목 정보 (템플릿에서 복사)
    sortOrder: int("sort_order").notNull(),
    itemName: text("item_name").notNull(), // itemText → itemName으로 변경
    itemText: text("item_text"), // 호환성 유지
    itemType: varchar("item_type", { length: 20 }).notNull(), // inputType → itemType으로 변경
    inputType: varchar("input_type", { length: 20 }), // 호환성 유지
    description: text("description"), // 추가
    
    // 입력값
    value: text("value"),
    
    // 완료 상태
    isCompleted: tinyint("is_completed").default(0).notNull(),
    completedAt: datetime("completed_at", { mode: "string", fsp: 3 }),
    completedBy: bigint("completed_by", { mode: "number" }),
    
    // 검증 결과
    isValid: tinyint("is_valid").default(1),
    validationMessage: text("validation_message"),
    
    // 메타데이터
    createdAt: datetime("created_at", { mode: "string", fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    updatedAt: datetime("updated_at", { mode: "string", fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .$onUpdateFn(() => sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
  },
  (table) => [
    index("idx_checklist_instance_item_instance").on(table.instanceId),
    index("idx_checklist_instance_item_template").on(table.templateItemId),
  ]
);

/**
 * 체크리스트 인스턴스 항목 이력 테이블
 * 각 항목의 수정 이력을 추적
 */
export const checklistInstanceItemHistory = mysqlTable(
  "checklist_instance_item_history",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    
    // 인스턴스 항목 참조
    instanceItemId: bigint("instance_item_id", { mode: "number" }).notNull(),
    
    // 사용자 정보
    userId: bigint("user_id", { mode: "number" }).notNull(), // 추가
    
    // 변경 전/후 값
    oldValue: text("old_value"), // previousValue → oldValue로 변경
    newValue: text("new_value"),
    previousValue: text("previous_value"), // 호환성 유지
    
    // 변경 시간
    changedAt: datetime("changed_at", { mode: "string", fsp: 3 })
      .default(sql`CURRENT_TIMESTAMP(3)`)
      .notNull(),
    
    // 변경 정보 (호환성)
    changedBy: bigint("changed_by", { mode: "number" }),
    
    // 변경 사유
    changeReason: text("change_reason"),
    
    // 메타데이터
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("idx_checklist_history_item").on(table.instanceItemId),
    index("idx_checklist_history_user").on(table.userId),
    index("idx_checklist_history_changed_at").on(table.changedAt),
  ]
);

// Relations
export const checklistTemplatesRelations = relations(checklistTemplates, ({ many }) => ({
  instances: many(checklistInstances),
}));

export const checklistInstancesRelations = relations(checklistInstances, ({ one, many }) => ({
  template: one(checklistTemplates, {
    fields: [checklistInstances.templateId],
    references: [checklistTemplates.id],
  }),
  items: many(checklistInstanceItems),
}));
