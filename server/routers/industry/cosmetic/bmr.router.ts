/**
 * 화장품 GMP — BMR (Batch Manufacturing Record) 라우터
 *
 * ============================================================================
 * Phase 2 (Cosmetic GMP) — Layer 4 industry/cosmetic 첫 본격 구현.
 *
 * lifecycle:
 *   draft → approved → manufacturing → completed
 *                  ↓ (어느 단계든)
 *                  rejected
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - core / shared-kernel / industry/cosmetic 만 import 허용
 *   - food / 다른 industry cross-ref 금지 (ADR-002)
 *
 * 향후 확장 (별도 PR):
 *   - h_cosmetic_bmr_ipc      — IPC 측정값
 *   - h_cosmetic_bmr_ingredient — 처방
 *   - h_cosmetic_bmr_label     — 전성분
 *   - h_cosmetic_release       — QA 출고
 *
 * 참조:
 *   - drizzle/schema/industry/cosmetic/bmr.ts
 *   - server/db/industry/cosmetic/bmr.ts
 *   - scripts/migrate-cosmetic-bmr-table.ts
 *   - docs/architecture/00-layers.md
 * ============================================================================
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import {
  createCosmeticBmr,
  getCosmeticBmrById,
  listCosmeticBmrs,
  updateCosmeticBmrDraft,
  transitionBmrStatus,
  deleteDraftBmr,
} from "../../../db/industry/cosmetic/bmr";

const STATUS = ["draft", "approved", "manufacturing", "completed", "rejected"] as const;

export const cosmeticBmrRouter = router({
  /** BMR 목록 조회 */
  list: tenantRequiredProcedure
    .input(
      z
        .object({
          status: z.enum(STATUS).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await listCosmeticBmrs(input, ctx.tenantId);
      return {
        items: rows.map((r) => ({
          id: Number(r.id),
          bmrCode: String(r.bmrCode),
          productId: Number(r.productId),
          batchNumber: r.batchNumber ? String(r.batchNumber) : null,
          plannedQuantityKg: Number(r.plannedQuantityKg ?? 0),
          actualQuantityKg: r.actualQuantityKg ? Number(r.actualQuantityKg) : null,
          status: r.status as (typeof STATUS)[number],
          manufacturingDate: r.manufacturingDate,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        })),
        total: rows.length,
      };
    }),

  /** BMR 단건 조회 */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await getCosmeticBmrById(input.id, ctx.tenantId);
      if (!row) return null;
      return {
        id: Number(row.id),
        bmrCode: String(row.bmrCode),
        productId: Number(row.productId),
        batchNumber: row.batchNumber,
        plannedQuantityKg: Number(row.plannedQuantityKg ?? 0),
        actualQuantityKg: row.actualQuantityKg ? Number(row.actualQuantityKg) : null,
        manufacturingDate: row.manufacturingDate,
        status: row.status as (typeof STATUS)[number],
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        manufacturingStartedAt: row.manufacturingStartedAt,
        completedBy: row.completedBy,
        completedAt: row.completedAt,
        rejectedBy: row.rejectedBy,
        rejectedAt: row.rejectedAt,
        rejectReason: row.rejectReason,
        notes: row.notes,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  /** 신규 BMR 생성 (status='draft') */
  create: tenantRequiredProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        plannedQuantityKg: z.number().positive(),
        batchNumber: z.string().max(100).optional(),
        manufacturingDate: z.string().optional(), // YYYY-MM-DD
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createCosmeticBmr(
        {
          productId: input.productId,
          plannedQuantityKg: input.plannedQuantityKg,
          batchNumber: input.batchNumber,
          manufacturingDate: input.manufacturingDate,
          notes: input.notes,
          createdBy: Number(ctx.user.id),
        },
        ctx.tenantId,
      );
    }),

  /** draft 상태에서만 수정 */
  updateDraft: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        productId: z.number().int().positive().optional(),
        plannedQuantityKg: z.number().positive().optional(),
        batchNumber: z.string().max(100).nullable().optional(),
        manufacturingDate: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return updateCosmeticBmrDraft(id, data, ctx.tenantId);
    }),

  /** QA 승인 — draft → approved */
  approve: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return transitionBmrStatus(input.id, "approved", Number(ctx.user.id), ctx.tenantId);
    }),

  /** 제조 시작 — approved → manufacturing */
  startManufacturing: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return transitionBmrStatus(
        input.id,
        "manufacturing",
        Number(ctx.user.id),
        ctx.tenantId,
      );
    }),

  /** 제조 완료 — manufacturing → completed */
  markCompleted: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        actualQuantityKg: z.number().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return transitionBmrStatus(input.id, "completed", Number(ctx.user.id), ctx.tenantId, {
        actualQuantityKg: input.actualQuantityKg,
      });
    }),

  /** 거절 — 어느 단계든 → rejected */
  reject: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().min(1).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return transitionBmrStatus(input.id, "rejected", Number(ctx.user.id), ctx.tenantId, {
        rejectReason: input.reason,
      });
    }),

  /** draft 삭제 */
  deleteDraft: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return deleteDraftBmr(input.id, ctx.tenantId);
    }),
});
