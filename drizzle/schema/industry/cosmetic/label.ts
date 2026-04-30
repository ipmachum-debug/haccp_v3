/**
 * 화장품 GMP — h_cosmetic_label (라벨 / 전성분 표시)
 *
 * ============================================================================
 * Phase 2-5: KFDA 화장품 라벨 표시 의무 자동화.
 *
 * KFDA 화장품법 시행규칙 § 19 표기 의무 항목:
 *   - 제품명 (한글 + 영문)
 *   - 용량
 *   - 전성분 (INCI 명칭 — 함량 내림차순, 1% 미만은 임의)
 *   - 사용방법
 *   - 사용 시 주의사항
 *   - 보관방법
 *   - 제조번호 / 사용기한
 *   - 책임판매업자 정보
 *
 * 데이터 소스:
 *   - inci_list: 수동 입력 또는 active formula (Phase 2-4a) 자동 생성
 *   - allergen_list: KFDA 알러지 유발물질 22종 중 해당 항목
 *
 * 향후:
 *   - 라벨 인쇄 미리보기 (PDF)
 *   - 전성분 자동 정렬 (1% 초과 → descending)
 *   - INCI 표준 마스터 통합
 * ============================================================================
 */

import {
  bigint,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  index,
  varchar,
} from "drizzle-orm/mysql-core";
import { tenants } from "../../schema_main";

export const hCosmeticLabel = mysqlTable(
  "h_cosmetic_label",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    labelCode: varchar("label_code", { length: 50 }).notNull(), // LBL-YYYYMMDD-NNN
    productId: bigint("product_id", { mode: "number" }).notNull(),

    // 제품 정보
    productNameKo: varchar("product_name_ko", { length: 200 }).notNull(),
    productNameEn: varchar("product_name_en", { length: 200 }),
    capacity: varchar("capacity", { length: 50 }), // 예: "50mL", "100g"

    // 전성분 (INCI)
    inciList: text("inci_list"), // 콤마 구분 INCI 목록
    allergenList: text("allergen_list"), // KFDA 22종 알러지 유발물질

    // 사용 정보
    usageInstructions: text("usage_instructions"),
    cautions: text("cautions"),
    storageMethod: text("storage_method"),

    // 제조사 정보
    manufacturerName: varchar("manufacturer_name", { length: 200 }),
    manufacturerAddress: text("manufacturer_address"),
    responsibleParty: varchar("responsible_party", { length: 200 }), // 책임판매업자

    // 상태
    status: mysqlEnum("status", [
      "draft",
      "approved",
      "active",
      "deprecated",
    ]).notNull().default("draft"),

    approvedBy: bigint("approved_by", { mode: "number" }),
    approvedAt: timestamp("approved_at"),

    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    uniqLabelCode: uniqueIndex("uniq_cosmetic_label_code").on(
      table.tenantId,
      table.labelCode,
    ),
    idxProduct: index("idx_cosmetic_label_product").on(
      table.tenantId,
      table.productId,
    ),
  }),
);

export type CosmeticLabel = typeof hCosmeticLabel.$inferSelect;
