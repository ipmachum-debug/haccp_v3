/**
 * B2C 플랫폼 정산 모듈 스키마 (2026-04-22 Phase 2)
 *
 * 배경:
 *   한국 B2C 온라인 판매자는 이지어드민 등으로 매일 주문을 수집하고
 *   (재고/HACCP 관리용), 회계는 플랫폼별 분기 정산서 기반으로 인식함.
 *   이 두 데이터 흐름을 독립적으로 관리하기 위한 전용 스키마.
 *
 * 구조:
 *   partners.customer_type = 'b2c_platform' 거래처
 *     └─ b2c_sellers (한 플랫폼 내 복수 셀러 계정: sokooryceo, dduckdanji 등)
 *         └─ b2c_sales_entries (결제수단 × 연도 × 월 매출액)
 *
 * 입력 방식:
 *   1) 수기 입력 (플랫폼 + 셀러 + 결제수단 + 월 + 금액)
 *   2) 향후 엑셀 업로드 파서 (플랫폼별 어댑터)
 *
 * 회계 연동:
 *   분기 확정 시 자동 분개 생성:
 *     차) 외상매출금      총매출 (부가세 포함)
 *     (대) 제품매출        공급가액
 *     (대) 부가세예수금     부가세
 *
 *   수금은 별도 통장 매칭에서 처리 (플랫폼 정산 입금 ↔ AR 상계)
 *
 * 세무 활용:
 *   - 분기별 플랫폼/결제수단별 집계 → 국세청 부가세 신고서 서식 그대로 출력
 *   - 세무사 제출용 PDF/엑셀 자동 생성
 */

import {
  mysqlTable,
  bigint,
  int,
  varchar,
  decimal,
  text,
  timestamp,
  mysqlEnum,
  index,
  tinyint,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

/**
 * B2C 셀러 (플랫폼 내 계정)
 *
 * 한 사업자가 같은 플랫폼에 여러 스토어를 운영할 수 있음.
 * 예) 옥션 내 sokooryceo / dduckdanji (같은 사업자, 다른 브랜드)
 *     부가세는 하나로 합산 신고.
 */
export const b2cSellers = mysqlTable(
  "b2c_sellers",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey(),
    tenantId: int("tenant_id").notNull(),
    platformPartnerId: bigint("platform_partner_id", { mode: "number" }).notNull(),
    sellerCode: varchar("seller_code", { length: 100 }).notNull(),
    sellerName: varchar("seller_name", { length: 200 }),
    notes: text("notes"),
    isActive: tinyint("is_active").default(1).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqSeller: uniqueIndex("uniq_b2c_sellers").on(
      t.tenantId,
      t.platformPartnerId,
      t.sellerCode,
    ),
    platformIdx: index("idx_b2c_sellers_platform").on(
      t.tenantId,
      t.platformPartnerId,
    ),
  }),
);

/**
 * B2C 매출 항목 (분기·월별 플랫폼 정산 매출)
 *
 * 입력 단위:
 *   (플랫폼 파트너 × 셀러 × 결제수단 × 연도 × 월)
 *
 * 금액 관계:
 *   supplyAmount + vatAmount = grossAmount (총매출)
 *   grossAmount - commissionAmount - refundAmount = netAmount (실수령 예상)
 *
 *   부가세 신고 기준: grossAmount (결제수단별 집계)
 */
export const b2cSalesEntries = mysqlTable(
  "b2c_sales_entries",
  {
    id: bigint({ mode: "number" }).autoincrement().primaryKey(),
    tenantId: int("tenant_id").notNull(),
    platformPartnerId: bigint("platform_partner_id", { mode: "number" }).notNull(),
    sellerId: bigint("seller_id", { mode: "number" }).notNull(),

    // 결제수단 (자유 입력 — 플랫폼마다 다름)
    // 예: "신용카드", "현금결제", "휴대폰결제", "기타결제", "선불결제",
    //     "소득공제", "지출증빙", "현금영수증", "기타"
    paymentMethod: varchar("payment_method", { length: 50 }).notNull(),

    // 기간
    periodYear: int("period_year").notNull(),   // 2026
    periodMonth: int("period_month").notNull(), // 1~12

    // 금액 (모두 원 단위)
    grossAmount: decimal("gross_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
    supplyAmount: decimal("supply_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
    vatAmount: decimal("vat_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
    commissionAmount: decimal("commission_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
    refundAmount: decimal("refund_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),
    netAmount: decimal("net_amount", { precision: 15, scale: 2 }).notNull().default("0.00"),

    // 원본 파일 첨부 (선택)
    fileKey: varchar("file_key", { length: 500 }),
    fileName: varchar("file_name", { length: 255 }),

    // 확정 관리
    //   draft      — 입력 중, 언제든 수정 가능
    //   confirmed  — 분기 확정 후 회계 분개 생성 완료 (수정 불가)
    status: mysqlEnum("status", ["draft", "confirmed"]).default("draft").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    confirmedBy: bigint("confirmed_by", { mode: "number" }),

    // 확정 시 생성된 분개 FK (회계 추적용)
    journalEntryId: bigint("journal_entry_id", { mode: "number" }),

    notes: text("notes"),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (t) => ({
    uniqEntry: uniqueIndex("uniq_b2c_sales_entries").on(
      t.tenantId,
      t.platformPartnerId,
      t.sellerId,
      t.paymentMethod,
      t.periodYear,
      t.periodMonth,
    ),
    periodIdx: index("idx_b2c_sales_period").on(
      t.tenantId,
      t.periodYear,
      t.periodMonth,
    ),
    platformIdx: index("idx_b2c_sales_platform").on(
      t.tenantId,
      t.platformPartnerId,
    ),
    statusIdx: index("idx_b2c_sales_status").on(
      t.tenantId,
      t.status,
    ),
  }),
);

export type B2cSeller = typeof b2cSellers.$inferSelect;
export type NewB2cSeller = typeof b2cSellers.$inferInsert;
export type B2cSalesEntry = typeof b2cSalesEntries.$inferSelect;
export type NewB2cSalesEntry = typeof b2cSalesEntries.$inferInsert;
