// recipeManagement 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or } from "drizzle-orm";

export const recipeManagementRouter = router({
    // 레시피 목록 조회
    list: tenantRequiredProcedure
      .input(z.object({
        productId: z.number().optional(),
        isActive: z.boolean().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getRecipes } = await import("../../db/recipe");
        return await getRecipes({ ...input, tenantId: ctx.user.tenantId });
      }),
    
    // 레시피 상세 조회 (라인 포함)
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRecipeById } = await import("../../db/recipe");
        const recipe = await getRecipeById(input.id, ctx.user.tenantId);
        if (!recipe) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "레시피를 찾을 수 없습니다."
          });
        }
        return recipe;
      }),
    
    // 제품별 레시피 조회
    getByProduct: tenantRequiredProcedure
      .input(z.object({ productId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRecipesByProductId } = await import("../../db/recipe");
        return await getRecipesByProductId(input.productId, ctx.user.tenantId);
      }),
    
    // 레시피 생성
    create: adminProcedure
      .input(z.object({
        productId: z.number(),
        recipeName: z.string().min(1, "레시피 이름은 필수입니다"),
        version: z.string().default("1.0"),
        description: z.string().optional(),
        batchSize: z.string(),
        batchUnit: z.string().default("kg"),
        yieldRate: z.string().optional(),
        preparationTime: z.number().optional(),
        cookingTime: z.number().optional(),
        totalTime: z.number().optional(),
        lines: z.array(
          z.object({
            materialId: z.number(),
            quantity: z.string(),
            unit: z.string(),
            percentage: z.string().optional(),
            sortOrder: z.number().default(0),
            notes: z.string().optional()
          })
        )
      }))
      .mutation(async ({ input, ctx }) => {
        const { createRecipe } = await import("../../db/recipe");
        return await createRecipe({
          ...input,
          createdBy: ctx.user.id,
          tenantId: ctx.user.tenantId
        });
      }),
    
    // 레시피 수정
    update: adminProcedure
      .input(z.object({
        id: z.number(),
        recipeName: z.string().optional(),
        version: z.string().optional(),
        description: z.string().optional(),
        batchSize: z.string().optional(),
        batchUnit: z.string().optional(),
        yieldRate: z.string().optional(),
        preparationTime: z.number().optional(),
        cookingTime: z.number().optional(),
        totalTime: z.number().optional(),
        isActive: z.number().optional(),
        lines: z.array(
          z.object({
            id: z.number().optional(),
            materialId: z.number(),
            quantity: z.string(),
            unit: z.string(),
            percentage: z.string().optional(),
            sortOrder: z.number().default(0),
            notes: z.string().optional()
          })
        ).optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateRecipe, createRecipeVersion } = await import("../../db/recipe");
        const { id, lines, ...recipeData } = input;
        
        // 버전 이력 생성
        if (input.version) {
          await createRecipeVersion({
            recipeId: id,
            version: input.version,
            changeDescription: "레시피 수정",
            createdBy: ctx.user.id
          });
        }
        
        return await updateRecipe(id, recipeData, lines);
      }),
    
    // 레시피 삭제 (소프트 삭제)
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteRecipe } = await import("../../db/recipe");
        await deleteRecipe(input.id, ctx.user.tenantId);
        
        // 감사 로그 기록
        const { createAuditLog } = await import("../../db");
        await createAuditLog({
          action: "recipe.delete",
          entityType: "recipe",
          entityId: input.id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `레시피 삭제: ${input.id}`,
          changes: { deleted: true }
        });
        
        return { success: true, message: "레시피가 삭제되었습니다" };
      }),
    
    // 레시피 버전 이력 조회
    getVersions: tenantRequiredProcedure
      .input(z.object({ recipeId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getRecipeVersions } = await import("../../db/recipe");
        return await getRecipeVersions(input.recipeId);
      }),
    
    // 레시피 복제
    duplicate: adminProcedure
      .input(z.object({
        id: z.number(),
        newRecipeName: z.string().min(1, "새 레시피 이름은 필수입니다")
      }))
      .mutation(async ({ input, ctx }) => {
        const { duplicateRecipe } = await import("../../db/recipe");
        return await duplicateRecipe(input.id, input.newRecipeName, ctx.user.id, ctx.user.tenantId);
      }),
    
    // 레시피 활성화/비활성화
    toggleActive: adminProcedure
      .input(z.object({
        id: z.number(),
        isActive: z.boolean()
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateRecipe } = await import("../../db/recipe");
        await updateRecipe(input.id, { isActive: input.isActive ? 1 : 0 });
        return { success: true };
      })
});
