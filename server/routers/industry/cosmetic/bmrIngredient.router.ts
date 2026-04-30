/**
 * 화장품 BMR 원료 투입 기록 라우터 (Phase 2-4b)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import {
  listIngredientsByBmr,
  createBmrIngredient,
  updateBmrIngredient,
  deleteBmrIngredient,
  summarizeBmrIngredients,
} from "../../../db/industry/cosmetic/bmrIngredient";

export const cosmeticBmrIngredientRouter = router({
  listByBmr: tenantRequiredProcedure
    .input(z.object({ bmrId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const rows = await listIngredientsByBmr(input.bmrId, ctx.tenantId);
      return rows.map((r) => ({
        id: Number(r.id),
        bmrId: Number(r.bmrId),
        materialName: String(r.materialName),
        materialCode: r.materialCode,
        inciName: r.inciName,
        lotNumber: r.lotNumber,
        plannedQuantity: r.plannedQuantity !== null ? Number(r.plannedQuantity) : null,
        actualQuantity: r.actualQuantity !== null ? Number(r.actualQuantity) : null,
        unit: String(r.unit),
        inputBy: r.inputBy,
        inputAt: r.inputAt,
        notes: r.notes,
        createdAt: r.createdAt,
      }));
    }),

  summaryByBmr: tenantRequiredProcedure
    .input(z.object({ bmrId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return summarizeBmrIngredients(input.bmrId, ctx.tenantId);
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        bmrId: z.number().int().positive(),
        materialName: z.string().min(1).max(200),
        materialCode: z.string().max(100).optional(),
        inciName: z.string().max(200).optional(),
        lotNumber: z.string().max(100).optional(),
        plannedQuantity: z.number().min(0).optional(),
        actualQuantity: z.number().min(0).optional(),
        unit: z.string().max(20).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createBmrIngredient(
        {
          ...input,
          inputBy: Number(ctx.user.id),
        },
        ctx.tenantId,
      );
    }),

  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        materialName: z.string().min(1).max(200).optional(),
        materialCode: z.string().max(100).nullable().optional(),
        inciName: z.string().max(200).nullable().optional(),
        lotNumber: z.string().max(100).nullable().optional(),
        plannedQuantity: z.number().min(0).nullable().optional(),
        actualQuantity: z.number().min(0).nullable().optional(),
        unit: z.string().max(20).optional(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return updateBmrIngredient(
        id,
        {
          ...data,
          inputBy: Number(ctx.user.id),
        },
        ctx.tenantId,
      );
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return deleteBmrIngredient(input.id, ctx.tenantId);
    }),
});
