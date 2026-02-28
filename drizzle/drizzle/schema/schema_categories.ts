import {
  bigint,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar
} from "drizzle-orm/mysql-core";
import { tenants } from '../schema_main';

/**
 * 카테고리 관리 시스템
 * 회사별로 원재료, 제품, 매입, 매출 카테고리를 자유롭게 설정
 */

/**
 * 카테고리 유형
 * - material: 원재료 카테고리 (육류, 채소, 수산물 등)
 * - product: 제품 카테고리 (완제품, 반제품 등)
 * - purchase: 매입 카테고리 (원재료, 부재료, 포장재, 소모품 등)
 * - sale: 매출 카테고리 (완제품, 반제품 등)
 */
export const categories = mysqlTable("categories", {
  id: bigint("id", { mode: "number" }).autoincrement().primaryKey(),
  tenantId: int('tenant_id').notNull().references(() => tenants.id),
  type: mysqlEnum("type", ["material", "product", "purchase", "sale"]).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  code: varchar("code", { length: 50 }), // 선택적 코드 (예: MAT-MEAT, PRD-FINISHED)
  description: text("description"), // 카테고리 설명
  color: varchar("color", { length: 20 }), // UI 표시용 색상 (예: #3B82F6)
  icon: varchar("icon", { length: 50 }), // UI 표시용 아이콘 이름
  sortOrder: int("sort_order").default(0).notNull(), // 정렬 순서
  isActive: int("is_active").default(1).notNull(), // 활성 상태 (1: 활성, 0: 비활성)
  isDefault: int("is_default").default(0).notNull(), // 기본 카테고리 여부 (삭제 불가)
  
  // 날짜 관리 유형 (원재료/제품 카테고리에만 적용)
  // - none: 날짜 관리 안 함
  // - expiry: 소비기한만 관리
  // - production: 생산일자만 관리
  // - both: 소비기한 + 생산일자 모두 관리
  dateManagementType: mysqlEnum("date_management_type", ["none", "expiry", "production", "both"]).default("none").notNull(),
  
  // 알람 설정 (날짜 관리 시 사용)
  // - 0: 알람 없음 (날짜만 기록)
  // - N: 소비기한 N일 전 또는 생산일자 N일 후 알람
  alertDays: int("alert_days").default(0).notNull(),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * 기본 카테고리 데이터 (시드 데이터)
 * 
 * 원재료 카테고리:
 * - 육류 (MEAT)
 * - 채소 (VEGETABLE)
 * - 수산물 (SEAFOOD)
 * - 유제품 (DAIRY)
 * - 곡물 (GRAIN)
 * - 조미료 (SEASONING)
 * - 기타 (OTHER)
 * 
 * 제품 카테고리:
 * - 완제품 (FINISHED)
 * - 반제품 (SEMI_FINISHED)
 * - 기타 (OTHER)
 * 
 * 매입 카테고리:
 * - 원재료 (RAW_MATERIAL)
 * - 부재료 (SUB_MATERIAL)
 * - 포장재 (PACKAGING)
 * - 소모품 (CONSUMABLE)
 * - 기타 (OTHER)
 * 
 * 매출 카테고리:
 * - 완제품 (FINISHED)
 * - 반제품 (SEMI_FINISHED)
 * - 기타 (OTHER)
 */
