/**
 * 화장품 라벨 라우터 (Phase 2-5)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import {
  createLabel,
  listLabels,
  getLabelById,
  updateLabelDraft,
  transitionLabelStatus,
  deleteDraftLabel,
  buildInciList,
  extractAllergens,
  KFDA_ALLERGENS,
} from "../../../db/industry/cosmetic/label";

const STATUS = ["draft", "approved", "active", "deprecated"] as const;

const labelInput = z.object({
  productId: z.number().int().positive(),
  productNameKo: z.string().min(1).max(200),
  productNameEn: z.string().max(200).optional(),
  capacity: z.string().max(50).optional(),
  inciList: z.string().optional(),
  allergenList: z.string().optional(),
  usageInstructions: z.string().optional(),
  cautions: z.string().optional(),
  storageMethod: z.string().optional(),
  manufacturerName: z.string().max(200).optional(),
  manufacturerAddress: z.string().optional(),
  responsibleParty: z.string().max(200).optional(),
});

export const cosmeticLabelRouter = router({
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
      const rows = await listLabels(input, ctx.tenantId);
      return rows.map((r) => ({
        id: Number(r.id),
        labelCode: String(r.labelCode),
        productId: Number(r.productId),
        productNameKo: String(r.productNameKo),
        productNameEn: r.productNameEn,
        capacity: r.capacity,
        status: r.status as (typeof STATUS)[number],
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await getLabelById(input.id, ctx.tenantId);
      if (!row) return null;
      return {
        id: Number(row.id),
        labelCode: String(row.labelCode),
        productId: Number(row.productId),
        productNameKo: row.productNameKo,
        productNameEn: row.productNameEn,
        capacity: row.capacity,
        inciList: row.inciList,
        allergenList: row.allergenList,
        usageInstructions: row.usageInstructions,
        cautions: row.cautions,
        storageMethod: row.storageMethod,
        manufacturerName: row.manufacturerName,
        manufacturerAddress: row.manufacturerAddress,
        responsibleParty: row.responsibleParty,
        status: row.status as (typeof STATUS)[number],
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  create: tenantRequiredProcedure.input(labelInput).mutation(async ({ ctx, input }) => {
    return createLabel(
      { ...input, createdBy: Number(ctx.user.id) },
      ctx.tenantId,
    );
  }),

  updateDraft: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        productId: z.number().int().positive().optional(),
        productNameKo: z.string().min(1).max(200).optional(),
        productNameEn: z.string().max(200).nullable().optional(),
        capacity: z.string().max(50).nullable().optional(),
        inciList: z.string().nullable().optional(),
        allergenList: z.string().nullable().optional(),
        usageInstructions: z.string().nullable().optional(),
        cautions: z.string().nullable().optional(),
        storageMethod: z.string().nullable().optional(),
        manufacturerName: z.string().max(200).nullable().optional(),
        manufacturerAddress: z.string().nullable().optional(),
        responsibleParty: z.string().max(200).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return updateLabelDraft(id, data, ctx.tenantId);
    }),

  approve: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      transitionLabelStatus(input.id, "approved", Number(ctx.user.id), ctx.tenantId),
    ),

  activate: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      transitionLabelStatus(input.id, "active", Number(ctx.user.id), ctx.tenantId),
    ),

  deprecate: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      transitionLabelStatus(input.id, "deprecated", Number(ctx.user.id), ctx.tenantId),
    ),

  deleteDraft: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => deleteDraftLabel(input.id, ctx.tenantId)),

  /**
   * 헬퍼: INCI 텍스트에서 KFDA 알러지 유발물질 22종 추출.
   * 클라이언트가 inciList 입력 후 자동 검출 — 알러지 표시 의무.
   */
  detectAllergens: tenantRequiredProcedure
    .input(z.object({ inciText: z.string() }))
    .query(async ({ input }) => {
      return {
        detected: extractAllergens(input.inciText),
        allKfdaAllergens: KFDA_ALLERGENS,
      };
    }),

  /**
   * 헬퍼: ingredient 배열에서 INCI list 자동 정렬.
   * 클라이언트가 active formula 의 ingredient 를 가져와 호출.
   * Phase 2-4a (formula) 미머지여도 동작 — 입력 그대로 받음.
   */
  buildInciList: tenantRequiredProcedure
    .input(
      z.object({
        ingredients: z.array(
          z.object({
            name: z.string().min(1),
            percentage: z.number().min(0).max(100),
          }),
        ),
      }),
    )
    .query(async ({ input }) => {
      return { inciList: buildInciList(input.ingredients) };
    }),
});
