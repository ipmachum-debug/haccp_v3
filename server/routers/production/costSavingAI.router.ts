// costSavingAI 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

/**
 * 원료 번호 + 종류 — 화면은 품목 선택창(품목 번호)에서 고른다. 분석 함수는 재고 원료 번호(h_materials)로 읽는다 (번호 체계 2d).
 *   연결 없는 품목은 분석하지 않고 이유를 알린다 (숫자로 다른 원료를 분석하지 않음).
 */
const materialRefInput = {
  itemMasterId: z.number().int().positive().optional(),
  inventoryMaterialId: z.number().int().positive().optional(),
};
async function inventoryMaterialIdOf(input: { itemMasterId?: number; inventoryMaterialId?: number }, tenantId: number): Promise<number> {
  const { inventoryMaterialIdOfRef, materialRefOf } = await import("../../lib/identity/itemIdentityService");
  return Number(await inventoryMaterialIdOfRef(materialRefOf(input), tenantId));
}

export const costSavingAIRouter = router({
    // 원재료 가격 변동 추이 분석
    analyzePriceTrend: tenantRequiredProcedure
      .input(
        z.object({
          ...materialRefInput,
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const { analyzePriceTrend } = await import("../../db/production/costSavingAI");
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        const tenantId = ctx.tenantId;
        return await analyzePriceTrend(tenantId, await inventoryMaterialIdOf(input, tenantId), startDate, endDate);
      }),

    // 최적 구매 시점 추천 — 함수 인자 순서 (회사, 원료) (이전: 원료·회사를 바꿔 넘겼다)
    recommendPurchaseTiming: tenantRequiredProcedure
      .input(z.object(materialRefInput))
      .query(async ({ input, ctx }) => {
        const { recommendPurchaseTiming } = await import("../../db/production/costSavingAI");
        return await recommendPurchaseTiming(ctx.tenantId, await inventoryMaterialIdOf(input, ctx.tenantId));
      }),

    // 대체 공급업체 추천
    recommendAlternativeSuppliers: tenantRequiredProcedure
      .input(z.object(materialRefInput))
      .query(async ({ input, ctx }) => {
        const { recommendAlternativeSuppliers } = await import("../../db/production/costSavingAI");
        return await recommendAlternativeSuppliers(ctx.tenantId, await inventoryMaterialIdOf(input, ctx.tenantId));
      }),

    // AI 기반 원가 절감 제안 생성
    generateProposal: tenantRequiredProcedure
      .input(z.object(materialRefInput))
      .query(async ({ input, ctx }) => {
        const { generateCostSavingProposal } = await import("../../db/production/costSavingAI");
        return await generateCostSavingProposal(ctx.tenantId, await inventoryMaterialIdOf(input, ctx.tenantId));
      })
});
