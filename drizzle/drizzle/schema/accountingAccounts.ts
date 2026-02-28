import {mysqlTable, bigint, varchar, text, timestamp, mysqlEnum, int} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * 계정 과목 관리 (5분류 체계)
 * - 자산 (Assets): 현금, 예금, 재고 등
 * - 부채 (Liabilities): 미지급금, 차입금 등
 * - 자본 (Equity): 자본금, 이익잉여금 등
 * - 수익 (Revenue): 매출, 이자수익 등
 * - 비용 (Expenses): 매입비, 인건비, 운영비, 판매비, 관리비 등
 */
export const accountingAccounts = mysqlTable("accounting_accounts", {
  id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  
  // 계정 과목 분류 (5분류)
  category: mysqlEnum("category", ["assets", "liabilities", "equity", "revenue", "expenses"]).notNull(),
  
  // 계정 과목 코드 (예: 1010, 2010, 3010, 4010, 5010)
  code: varchar("code", { length: 20 }).notNull().unique(),
  
  // 계정 과목명 (예: 현금, 미지급금, 자본금, 매출, 급여)
  name: varchar("name", { length: 100 }).notNull(),
  
  // 상위 계정 과목 ID (계층 구조 지원)
  parentId: bigint("parent_id", { mode: "number" }),
  
  // 설명
  description: text("description"),
  
  // 활성화 여부
  isActive: mysqlEnum("is_active", ["Y", "N"]).default("Y").notNull(),
  
  // 생성 정보
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  // 수정 정보
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
