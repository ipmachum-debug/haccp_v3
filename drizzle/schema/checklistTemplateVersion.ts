import { tenants } from './schema_main';
import {
  bigint,
  datetime,
  index,
  int,
  json,
  mysqlTable,
  text,
  varchar,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { checklistTemplates } from "./checklist";

/**
 * 체크리스트 템플릿 버전 테이블
 * 템플릿 수정 이력 추적 및 롤백 기능 지원
 */
export const checklistTemplateVersions = mysqlTable(
  "checklist_template_versions",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
    
    // 템플릿 참조
    templateId: bigint("template_id", { mode: "number" }).notNull(),
    
    // 버전 정보
    version: varchar("version", { length: 50 }).notNull(), // 예: "1.0.0", "1.1.0"
    changeDescription: text("change_description"), // 변경 내용 설명
    
    // 템플릿 스냅샷 (JSON)
    templateSnapshot: json("template_snapshot").notNull(), // 템플릿 전체 데이터 스냅샷
    
    // 메타데이터
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: datetime("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    templateIdIdx: index("template_id_idx").on(table.templateId),
    createdAtIdx: index("created_at_idx").on(table.createdAt),
  })
);
