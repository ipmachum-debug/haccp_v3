import {mysqlTable, bigint, varchar, text, timestamp, mysqlEnum, int, index} from "drizzle-orm/mysql-core";
import { tenants } from './schema_main';

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
  code: varchar("code", { length: 20 }).notNull(),
  
  // 시스템 코드 (자동분개용 고정 키: CASH, BANK_DEPOSIT, VAT_INPUT, ACCOUNTS_PAYABLE 등)
  // tenant별로 코드/이름이 달라도 system_code로 역할 식별 가능
  systemCode: varchar("system_code", { length: 50 }),
  
  // 계정 과목명 (예: 현금, 미지급금, 자본금, 매출, 급여)
  name: varchar("name", { length: 100 }).notNull(),
  
  // 상위 계정 과목 ID (계층 구조 지원 — 같은 테이블 내 자기참조)
  parentId: bigint("parent_id", { mode: "number" }),
  
  // 소속 그룹 ID (account_categories 테이블 참조 — 5분류 구조의 상위계정 그룹)
  // P5-1: 하위계정 매핑 버그 수정 — FK 기반 정확한 그룹 연결
  accountCategoryId: bigint("account_category_id", { mode: "number" }),
  
  // 설명
  description: text("description"),
  
  // 활성화 여부
  isActive: mysqlEnum("is_active", ["Y", "N"]).default("Y").notNull(),
  
  // 생성 정보
  createdBy: bigint("created_by", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  
  // 수정 정보
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, (table) => ({
  tenantCategoryIdx: index("idx_tenant_category").on(table.tenantId, table.category),
  systemCodeIdx: index("idx_system_code").on(table.tenantId, table.systemCode),
}));

/**
 * 시스템 계정 코드 상수 (system_code 값)
 * 자동분개/보고서에서 계정을 역할로 식별할 때 사용
 */
export const SYSTEM_ACCOUNTS = {
  // 자산 (Assets)
  CASH: "CASH",                           // 현금
  BANK_DEPOSIT: "BANK_DEPOSIT",           // 보통예금
  ACCOUNTS_RECEIVABLE: "ACCOUNTS_RECEIVABLE", // 외상매출금
  VAT_INPUT: "VAT_INPUT",                 // 부가세대급금 (매입세액)
  INVENTORY_RAW: "INVENTORY_RAW",         // 원재료 (1410)
  INVENTORY_GOODS: "INVENTORY_GOODS",     // 상품 (1420) — 외부 매입 재판매 품목
  INVENTORY_FINISHED: "INVENTORY_FINISHED", // 제품 (1430) — 자사 생산 완제품 (2026-10-12 신설)
  
  // 부채 (Liabilities)
  ACCOUNTS_PAYABLE: "ACCOUNTS_PAYABLE",   // 외상매입금 (미지급금)
  ACCOUNTS_PAYABLE_CARD: "ACCOUNTS_PAYABLE_CARD", // 미지급금-카드
  VAT_OUTPUT: "VAT_OUTPUT",               // 부가세예수금 (매출세액)
  
  // 자본 (Equity)
  CAPITAL: "CAPITAL",                     // 자본금
  RETAINED_EARNINGS: "RETAINED_EARNINGS", // 이익잉여금
  
  // 수익 (Revenue)
  SALES_REVENUE: "SALES_REVENUE",         // 상품매출
  SERVICE_REVENUE: "SERVICE_REVENUE",     // 서비스매출
  
  // 비용 (Expenses) - 세부는 사용자 정의
  COST_OF_GOODS: "COST_OF_GOODS",   // 매출원가
  WIP: "WIP",                       // 재공품 (1440, 제조 중간 재고, 월말 평가용 — 현재 자동분개 미사용)
  PRODUCTION_LOSS: "PRODUCTION_LOSS", // 제조손실 (CCP 이탈 / 부적합품 폐기 등 — 식품 HACCP F-3)
} as const;

export type SystemAccountCode = typeof SYSTEM_ACCOUNTS[keyof typeof SYSTEM_ACCOUNTS];

/**
 * 시스템 계정 역할별 5분류 (2026-10-15)
 * 자동분개가 계정을 고를 때 분류가 다르면 거부한다 — 재고(자산) 자리에 매출(수익)이 들어가는 사고 차단
 * (단지: '제품' 이름 폴백이 '제품매출' 을 골라 생산완료 4건·매출원가 33건이 매출 계정으로 전기됨).
 */
export const SYSTEM_ACCOUNT_CATEGORY: Record<SystemAccountCode, "assets" | "liabilities" | "equity" | "revenue" | "expenses"> = {
  CASH: "assets", BANK_DEPOSIT: "assets", ACCOUNTS_RECEIVABLE: "assets", VAT_INPUT: "assets",
  INVENTORY_RAW: "assets", INVENTORY_GOODS: "assets", INVENTORY_FINISHED: "assets", WIP: "assets",
  ACCOUNTS_PAYABLE: "liabilities", ACCOUNTS_PAYABLE_CARD: "liabilities", VAT_OUTPUT: "liabilities",
  CAPITAL: "equity", RETAINED_EARNINGS: "equity",
  SALES_REVENUE: "revenue", SERVICE_REVENUE: "revenue",
  COST_OF_GOODS: "expenses", PRODUCTION_LOSS: "expenses",
};
