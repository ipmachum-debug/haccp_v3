/**
 * SKU 별칭 (alias) — PR #298
 *
 * 사용처:
 *   - Excel 일괄 등록 매출에서 "혼합마카다미아", "마카 5종 세트", "마카다미아 혼합" 등
 *     사용자가 자유롭게 부르는 이름들을 모두 같은 SKU 로 매칭
 *   - 1 SKU 가 N 개 alias 가질 수 있음 (1:N)
 *
 * 정책:
 *   - alias 는 tenant 별 unique
 *   - case-insensitive 매칭 (lowercase 비교는 라우터에서 처리)
 *   - 공백/특수문자 트리밍은 client/server 양쪽 입력 시 정규화
 *   - is_primary: 기본 표시 alias (raporting/UI 용)
 */
import { mysqlTable, bigint, int, varchar, tinyint, timestamp, index, unique } from "drizzle-orm/mysql-core";
import { tenants } from "./schema_main";
import { productSkus } from "./schema_dual_unit";

export const skuAliases = mysqlTable(
  "sku_aliases",
  {
    id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
    tenantId: int("tenant_id")
      .notNull()
      .default(1)
      .references(() => tenants.id),
    /** 매핑할 SKU (parent 또는 단일 SKU 모두 허용) */
    skuId: bigint("sku_id", { mode: "number" })
      .notNull()
      .references(() => productSkus.id),
    /** 별칭 (예: "혼합마카다미아", "마카 5종 세트") */
    alias: varchar("alias", { length: 200 }).notNull(),
    /** 1 = 기본 표시 alias (UI/리포트). per SKU 1개만 권장 (DB 레벨 enforce 안 함) */
    isPrimary: tinyint("is_primary").notNull().default(0),
    /** 알림용 비고 (어디서 자주 사용? 거래처별?) */
    note: varchar("note", { length: 500 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull().onUpdateNow(),
  },
  (table) => ({
    /** 같은 tenant 안에서 alias 중복 금지 — Excel 매칭 일관성 */
    uqTenantAlias: unique("uk_alias_tenant_alias").on(table.tenantId, table.alias),
    skuIdx: index("idx_alias_sku").on(table.skuId),
    tenantIdx: index("idx_alias_tenant").on(table.tenantId),
  }),
);

export type SkuAlias = typeof skuAliases.$inferSelect;
export type SkuAliasInsert = typeof skuAliases.$inferInsert;
