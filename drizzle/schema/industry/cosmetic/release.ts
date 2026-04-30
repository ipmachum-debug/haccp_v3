/**
 * 화장품 GMP — h_cosmetic_release (QA 출고)
 *
 * ============================================================================
 * Phase 2-6: BMR 제조 완료 후 시장 출시 전 최종 QA 검증 + 출고 lifecycle.
 *
 * 화장품 GMP 의 마지막 단계:
 *   BMR (제조) → IPC (품질 검증) → Release (QA 출고) → 시장
 *
 * 자동 검증 (release.create 시점):
 *   1. BMR.status === 'completed'
 *   2. IPC 모두 pass (있는 경우)
 *   3. (향후) active 라벨 존재 + 알러지 표시 완료 (#154 머지 후)
 *   4. (향후) 안정성시험 통과 (Phase 2 후속)
 *
 * lifecycle:
 *   pending → approved (QA 승인) → released (실제 출고) → recalled (회수)
 *
 * 의존성:
 *   - h_cosmetic_bmr (FK) — 어느 BMR 의 출고?
 *   - (선택) h_cosmetic_label — 사용 라벨 (#154 머지 후 활성화)
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
  index,
  varchar,
} from "drizzle-orm/mysql-core";
import { tenants } from "../../schema_main";

export const hCosmeticRelease = mysqlTable(
  "h_cosmetic_release",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    tenantId: int("tenant_id").notNull().references(() => tenants.id),

    releaseCode: varchar("release_code", { length: 50 }).notNull(), // REL-YYYYMMDD-NNN
    bmrId: bigint("bmr_id", { mode: "number" }).notNull(), // h_cosmetic_bmr.id
    productId: bigint("product_id", { mode: "number" }).notNull(),
    labelId: bigint("label_id", { mode: "number" }), // (선택) h_cosmetic_label.id

    // 출고 정보
    releaseQuantity: decimal("release_quantity", { precision: 12, scale: 4 }).notNull(),
    releaseUnit: varchar("release_unit", { length: 20 }).notNull().default("kg"),
    targetMarket: varchar("target_market", { length: 100 }), // 국내/수출/...
    productBatchNumber: varchar("product_batch_number", { length: 100 }), // 제품 배치 번호 (라벨 인쇄용)
    expiryDate: date("expiry_date"), // 사용기한

    // lifecycle
    status: mysqlEnum("status", [
      "pending", // 출고 신청 (QA 검토 대기)
      "approved", // QA 승인 (출고 준비 완료)
      "released", // 실제 출고 완료
      "recalled", // 회수
    ]).notNull().default("pending"),

    // QA 검증 결과 (스냅샷 — 출고 시점 검증)
    bmrCompletedCheck: int("bmr_completed_check").default(0), // 1=pass, 0=pending
    ipcAllPassCheck: int("ipc_all_pass_check").default(0),
    qaCheckMessage: text("qa_check_message"), // 검증 결과 상세

    // 추적
    approvedBy: bigint("approved_by", { mode: "number" }),
    approvedAt: timestamp("approved_at"),
    releasedBy: bigint("released_by", { mode: "number" }),
    releasedAt: timestamp("released_at"),
    recalledBy: bigint("recalled_by", { mode: "number" }),
    recalledAt: timestamp("recalled_at"),
    recallReason: text("recall_reason"),

    notes: text("notes"),
    createdBy: bigint("created_by", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    uniqReleaseCode: uniqueIndex("uniq_cosmetic_release_code").on(
      table.tenantId,
      table.releaseCode,
    ),
    idxBmr: index("idx_cosmetic_release_bmr").on(table.tenantId, table.bmrId),
    idxStatus: index("idx_cosmetic_release_status").on(table.tenantId, table.status),
  }),
);

export type CosmeticRelease = typeof hCosmeticRelease.$inferSelect;
