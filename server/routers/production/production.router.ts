// production 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const productionRouter = router({
    // 평가 생성
    create: adminProcedure
      .input(
        z.object({
          supplierId: z.number(),
          evaluationDate: z.string(),
          qualityScore: z.number().min(1).max(5),
          deliveryScore: z.number().min(1).max(5),
          priceScore: z.number().min(1).max(5),
          serviceScore: z.number().min(1).max(5),
          responseScore: z.number().min(1).max(5),
          comments: z.string().optional(),
          strengths: z.string().optional(),
          weaknesses: z.string().optional(),
          recommendations: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createSupplierEvaluation } = await import("../../db");
        const evaluationId = await createSupplierEvaluation({
          ...input,
          evaluationDate: new Date(input.evaluationDate),
          evaluatedBy: ctx.user.id
        });
        return { success: true, evaluationId };
      }),

    // 평가 목록 조회
    list: tenantRequiredProcedure
      .input(z.object({ supplierId: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const { getSupplierEvaluations } = await import("../../db");
        return await getSupplierEvaluations(input.supplierId);
      }),

    // 평가 통계 조회
    getStats: tenantRequiredProcedure
      .input(z.object({ supplierId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getSupplierEvaluationStats } = await import("../../db");
        return await getSupplierEvaluationStats(input.supplierId);
      })
});
