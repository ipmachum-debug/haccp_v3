// categories 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const categoriesRouter = router({
    // 카테고리 목록 조회 (유형별)
    listByType: tenantRequiredProcedure
      .input(z.object({ type: z.enum(["material", "product", "purchase", "sale"]) }))
      .query(async ({ input, ctx }) => {
        const { getCategoriesByType } = await import("../../db/categories");
        return await getCategoriesByType(input.type, ctx.user.tenantId);
      }),

    // 모든 카테고리 조회
    listAll: tenantRequiredProcedure
      .query(async ({ ctx }) => {
        const { getAllCategories } = await import("../../db/categories");
        return await getAllCategories();
      }),

    // 카테고리 생성
    create: tenantRequiredProcedure
      .input(z.object({
        type: z.enum(["material", "product", "purchase", "sale"]),
        name: z.string().min(1),
        code: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        sortOrder: z.number().optional(),
        dateManagementType: z.enum(["none", "expiry", "production", "both"]).optional(),
        alertDays: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { createCategory } = await import("../../db/categories");
        return await createCategory(input, ctx.user.tenantId);
      }),

    // 카테고리 수정
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        name: z.string().min(1).optional(),
        code: z.string().optional(),
        description: z.string().optional(),
        color: z.string().optional(),
        icon: z.string().optional(),
        sortOrder: z.number().optional(),
        isActive: z.boolean().optional(),
        dateManagementType: z.enum(["none", "expiry", "production", "both"]).optional(),
        alertDays: z.number().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { id, ...updateData } = input;
        const { updateCategory } = await import("../../db/categories");
        return await updateCategory(id, updateData, ctx.user.tenantId);
      }),

    // 카테고리 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteCategory } = await import("../../db/categories");
        return await deleteCategory(input.id, ctx.user.tenantId);
      }),

    // 카테고리 순서 변경
    reorder: adminProcedure
      .input(z.object({
        type: z.enum(["material", "product", "purchase", "sale"]),
        categoryIds: z.array(z.number())
      }))
      .mutation(async ({ input, ctx }) => {
        const { reorderCategories } = await import("../../db/categories");
        return await reorderCategories(input.type, input.categoryIds, ctx.user.tenantId);
      }),

    // 기본 카테고리 시드
    seedDefaults: adminProcedure
      .mutation(async ({ ctx }) => {
        const { seedDefaultCategories } = await import("../../db/categories");
        return await seedDefaultCategories(ctx.user.tenantId);
      })
});
