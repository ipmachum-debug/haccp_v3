/**
 * 화장품 GMP — h_cosmetic_bmr (Batch Manufacturing Record)
 *
 * ============================================================================
 * Phase 2 (Cosmetic GMP) — Layer 4 industry/cosmetic 첫 entity.
 *
 * 식품 HACCP 의 batch (`h_batches`) 와는 별개:
 *   - food: CCP 모니터링 + 단순 배치 정보
 *   - cosmetic: BMR (Batch Manufacturing Record) 문서 — 처방, 공정, 승인,
 *     QA 출고 (release) 의 전체 lifecycle 기록
 *
 * 향후 확장 (별도 PR):
 *   - h_cosmetic_bmr_ipc      — IPC (In-Process Control) 측정값
 *   - h_cosmetic_bmr_ingredient — 처방/투입량
 *   - h_cosmetic_bmr_label     — 전성분/라벨
 *   - h_cosmetic_release       — QA 출고 승인
 *
 * 의존성 규칙 (.dependency-cruiser.cjs):
 *   - 본 파일은 shared-kernel (tenants) 만 import 허용
 *   - core 가 industry/cosmetic 참조 금지 (ADR-002)
 * ============================================================================
 */

import {
  bigint,
  date,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { tenants } from "../../schema_main";

/**
 * h_cosmetic_bmr — 화장품 배치 제조 기록
 *
 * lifecycle:
 *   draft → approved (QA 승인) → manufacturing (제조 시작) → completed (제조 완료)
 *   ※ rejected: 어느 단계에서든 거절 가능 (별도 사유 기록)
 */
export const hCosmeticBmr = mysqlTable(
  "h_cosmetic_bmr",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    // 식별
    bmrCode: varchar("bmr_code", { length: 50 }).notNull(), // BMR-YYYYMMDD-NNN
    productId: bigint("product_id", { mode: "number" }).notNull(), // h_products FK
    batchNumber: varchar("batch_number", { length: 100 }), // 운영자 지정 배치 번호 (선택)

    // 제조 정보
    plannedQuantityKg: decimal("planned_quantity_kg", { precision: 12, scale: 3 }).notNull(),
    actualQuantityKg: decimal("actual_quantity_kg", { precision: 12, scale: 3 }),
    manufacturingDate: date("manufacturing_date"),

    // 상태
    status: mysqlEnum("status", [
      "draft",          // 작성 중
      "approved",       // QA 승인 (제조 가능)
      "manufacturing",  // 제조 중
      "completed",      // 제조 완료 (출고 대기)
      "rejected",       // 거절
    ]).notNull().default("draft"),

    // 승인 / 진행 / 완료 추적
    approvedBy: bigint("approved_by", { mode: "number" }),
    approvedAt: timestamp("approved_at"),
    manufacturingStartedAt: timestamp("manufacturing_started_at"),
    completedBy: bigint("completed_by", { mode: "number" }),
    completedAt: timestamp("completed_at"),
    rejectedBy: bigint("rejected_by", { mode: "number" }),
    rejectedAt: timestamp("rejected_at"),
    rejectReason: text("reject_reason"),

    // 메모
    notes: text("notes"),

    // 메타
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    // bmr_code 는 tenant 내부에서만 unique (cross-tenant 같은 코드 가능)
    uniqBmrCode: uniqueIndex("uniq_cosmetic_bmr_code").on(table.tenantId, table.bmrCode),
  }),
);

export type CosmeticBmr = typeof hCosmeticBmr.$inferSelect;
export type CosmeticBmrInsert = typeof hCosmeticBmr.$inferInsert;
