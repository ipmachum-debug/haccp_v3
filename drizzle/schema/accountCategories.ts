/**
 * account_categories — 계정 과목 그룹(상위계정) 정식 Drizzle 스키마
 *
 * ★ 2026-04-15: 이전에는 DB 에만 존재하고 Drizzle 스키마 정의가 없어
 *   server/db/accounting/accountCategories.ts 에서 raw SQL 로만 접근했음.
 *   스키마 드리프트를 없애기 위해 정식 정의 추가.
 *
 * 관계:
 *   - accounting_accounts.account_category_id → account_categories.id (FK)
 *   - major_category 는 한국어 라벨 ("자산"/"부채"/"자본"/"수익"/"비용")
 *     accounting_accounts.category 와 1:1 매핑되지만 코드상 다른 컬럼 체계 사용
 *
 * tenant_id NULL 허용:
 *   - 글로벌 카테고리 (모든 테넌트 공유) 는 tenant_id = NULL
 *   - 테넌트별 커스텀 카테고리는 tenant_id = <테넌트ID>
 */

import { bigint, int, mysqlTable, text, timestamp, tinyint, varchar, index } from "drizzle-orm/mysql-core";

export const accountCategories = mysqlTable(
  "account_categories",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    code: varchar("code", { length: 20 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    majorCategory: varchar("major_category", { length: 50 }).notNull(),
    minorCategory: varchar("minor_category", { length: 50 }),
    description: text("description"),
    isActive: tinyint("is_active").default(1).notNull(),
    // tenant_id NULL = 글로벌 카테고리 (모든 테넌트 공유)
    tenantId: int("tenant_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tenantActiveIdx: index("idx_tenant_active").on(table.tenantId, table.isActive),
    majorCategoryIdx: index("idx_major_category").on(table.majorCategory),
    codeIdx: index("idx_code").on(table.code),
  }),
);
