/**
 * 화장품 QA 출고 라우터 (Phase 2-6)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import {
  createRelease,
  listReleases,
  getReleaseById,
  approveRelease,
  markReleased,
  recallRelease,
  deletePendingRelease,
  qaPreReleaseCheck,
} from "../../../db/industry/cosmetic/release";

const STATUS = ["pending", "approved", "released", "recalled"] as const;

export const cosmeticReleaseRouter = router({
  list: tenantRequiredProcedure
    .input(
      z
        .object({
          status: z.enum(STATUS).optional(),
          bmrId: z.number().int().positive().optional(),
          productId: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await listReleases(input, ctx.tenantId);
      return rows.map((r) => ({
        id: Number(r.id),
        releaseCode: String(r.releaseCode),
        bmrId: Number(r.bmrId),
        productId: Number(r.productId),
        labelId: r.labelId,
        releaseQuantity: Number(r.releaseQuantity),
        releaseUnit: String(r.releaseUnit),
        targetMarket: r.targetMarket,
        productBatchNumber: r.productBatchNumber,
        expiryDate: r.expiryDate,
        status: r.status as (typeof STATUS)[number],
        bmrCompletedCheck: !!r.bmrCompletedCheck,
        ipcAllPassCheck: !!r.ipcAllPassCheck,
        createdAt: r.createdAt,
      }));
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await getReleaseById(input.id, ctx.tenantId);
      if (!row) return null;
      return {
        id: Number(row.id),
        releaseCode: String(row.releaseCode),
        bmrId: Number(row.bmrId),
        productId: Number(row.productId),
        labelId: row.labelId,
        releaseQuantity: Number(row.releaseQuantity),
        releaseUnit: String(row.releaseUnit),
        targetMarket: row.targetMarket,
        productBatchNumber: row.productBatchNumber,
        expiryDate: row.expiryDate,
        status: row.status as (typeof STATUS)[number],
        bmrCompletedCheck: !!row.bmrCompletedCheck,
        ipcAllPassCheck: !!row.ipcAllPassCheck,
        qaCheckMessage: row.qaCheckMessage,
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        releasedBy: row.releasedBy,
        releasedAt: row.releasedAt,
        recalledBy: row.recalledBy,
        recalledAt: row.recalledAt,
        recallReason: row.recallReason,
        notes: row.notes,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  /**
   * BMR 의 사전 QA 검증 (release 생성 전 미리 확인).
   */
  preReleaseCheck: tenantRequiredProcedure
    .input(z.object({ bmrId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return qaPreReleaseCheck(input.bmrId, ctx.tenantId);
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        bmrId: z.number().int().positive(),
        productId: z.number().int().positive(),
        labelId: z.number().int().positive().optional(),
        releaseQuantity: z.number().positive(),
        releaseUnit: z.string().max(20).optional(),
        targetMarket: z.string().max(100).optional(),
        productBatchNumber: z.string().max(100).optional(),
        expiryDate: z.string().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createRelease(
        { ...input, createdBy: Number(ctx.user.id) },
        ctx.tenantId,
      );
    }),

  approve: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      approveRelease(input.id, Number(ctx.user.id), ctx.tenantId),
    ),

  release: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      markReleased(input.id, Number(ctx.user.id), ctx.tenantId),
    ),

  recall: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().min(1).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      recallRelease(input.id, input.reason, Number(ctx.user.id), ctx.tenantId),
    ),

  deletePending: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      deletePendingRelease(input.id, ctx.tenantId),
    ),
});
