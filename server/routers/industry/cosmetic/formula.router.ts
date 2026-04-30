/**
 * 화장품 배합표 라우터 (Phase 2-4a)
 *
 * 마스터 배합표 + 배합 항목 CRUD + 상태 전이.
 *
 * lifecycle:
 *   draft → approved → active → deprecated
 *
 * draft 상태에서만 ingredient 추가/삭제 가능.
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import {
  createFormula,
  listFormulas,
  getFormulaById,
  updateFormulaDraft,
  transitionFormulaStatus,
  deleteDraftFormula,
  listIngredientsByFormula,
  addIngredient,
  deleteIngredient,
  summarizeIngredients,
} from "../../../db/industry/cosmetic/formula";

const STATUS = ["draft", "approved", "active", "deprecated"] as const;

export const cosmeticFormulaRouter = router({
  // ── 배합표 헤더 ──

  list: tenantRequiredProcedure
    .input(
      z
        .object({
          status: z.enum(STATUS).optional(),
          productId: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await listFormulas(input, ctx.tenantId);
      return rows.map((r) => ({
        id: Number(r.id),
        formulaCode: String(r.formulaCode),
        productId: Number(r.productId),
        name: String(r.name),
        version: String(r.version),
        description: r.description,
        status: r.status as (typeof STATUS)[number],
        approvedBy: r.approvedBy,
        approvedAt: r.approvedAt,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await getFormulaById(input.id, ctx.tenantId);
      if (!row) return null;
      return {
        id: Number(row.id),
        formulaCode: String(row.formulaCode),
        productId: Number(row.productId),
        name: String(row.name),
        version: String(row.version),
        description: row.description,
        status: row.status as (typeof STATUS)[number],
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        name: z.string().min(1).max(200),
        version: z.string().max(20).optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createFormula(
        {
          ...input,
          createdBy: Number(ctx.user.id),
        },
        ctx.tenantId,
      );
    }),

  updateDraft: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(200).optional(),
        version: z.string().max(20).optional(),
        description: z.string().nullable().optional(),
        productId: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return updateFormulaDraft(id, data, ctx.tenantId);
    }),

  approve: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return transitionFormulaStatus(
        input.id,
        "approved",
        Number(ctx.user.id),
        ctx.tenantId,
      );
    }),

  activate: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return transitionFormulaStatus(
        input.id,
        "active",
        Number(ctx.user.id),
        ctx.tenantId,
      );
    }),

  deprecate: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return transitionFormulaStatus(
        input.id,
        "deprecated",
        Number(ctx.user.id),
        ctx.tenantId,
      );
    }),

  deleteDraft: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return deleteDraftFormula(input.id, ctx.tenantId);
    }),

  // ── 배합 항목 (ingredient) ──

  listIngredients: tenantRequiredProcedure
    .input(z.object({ formulaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const rows = await listIngredientsByFormula(input.formulaId, ctx.tenantId);
      return rows.map((r) => ({
        id: Number(r.id),
        formulaId: Number(r.formulaId),
        materialName: String(r.materialName),
        materialCode: r.materialCode,
        inciName: r.inciName,
        percentage: Number(r.percentage),
        role: r.role,
        sortOrder: Number(r.sortOrder),
        notes: r.notes,
      }));
    }),

  ingredientSummary: tenantRequiredProcedure
    .input(z.object({ formulaId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return summarizeIngredients(input.formulaId, ctx.tenantId);
    }),

  addIngredient: tenantRequiredProcedure
    .input(
      z.object({
        formulaId: z.number().int().positive(),
        materialName: z.string().min(1).max(200),
        materialCode: z.string().max(100).optional(),
        inciName: z.string().max(200).optional(),
        percentage: z.number().min(0.0001).max(100),
        role: z.string().max(50).optional(),
        sortOrder: z.number().int().min(0).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return addIngredient(input, ctx.tenantId);
    }),

  deleteIngredient: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return deleteIngredient(input.id, ctx.tenantId);
    }),
});
