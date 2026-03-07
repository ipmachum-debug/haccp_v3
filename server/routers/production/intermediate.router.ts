// intermediate 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const intermediateRouter = router({
    // 혼합재제 목록 조회
    list: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getIntermediates } = await import("../../db/intermediateAPI");
      return await getIntermediates(ctx.tenantId ?? undefined);
    }),
    
    // 혼합재제 상세 조회 (구성 포함)
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getIntermediateDetail } = await import("../../db/intermediateAPI");
        return await getIntermediateDetail(input.id, ctx.tenantId ?? undefined);
      }),
    
    // 혼합재제 생성
    create: adminProcedure
      .input(
        z.object({
          materialCode: z.string().min(1),
          materialName: z.string().min(1),
          category: z.string().optional(),
          unit: z.string().min(1),
          supplierId: z.number().optional(),
          shelfLifeDays: z.number().optional(),
          unitPrice: z.string().optional(),
          description: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createIntermediate } = await import("../../db/intermediateAPI");
        return await createIntermediate(input);
      }),
    
    // 혼합재제 수정
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          materialName: z.string().optional(),
          category: z.string().optional(),
          unit: z.string().optional(),
          supplierId: z.number().optional(),
          shelfLifeDays: z.number().optional(),
          unitPrice: z.string().optional(),
          description: z.string().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateIntermediate } = await import("../../db/intermediateAPI");
        const { id, ...data } = input;
        return await updateIntermediate(id, data);
      }),
    
    // 혼합재제 삭제
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteIntermediate } = await import("../../db/intermediateAPI");
        return await deleteIntermediate(input.id, ctx.tenantId ?? undefined);
      }),
    
    // 혼합재제 구성 추가
    addComponent: adminProcedure
      .input(
        z.object({
          intermediateMaterialId: z.number(),
          componentMaterialId: z.number(),
          ratioPercent: z.string().optional(),
          gramsPerKg: z.string().optional(),
          note: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { addIntermediateComponent } = await import("../../db/intermediateAPI");
        return await addIntermediateComponent(input);
      }),
    
    // 혼합재제 구성 수정
    updateComponent: adminProcedure
      .input(
        z.object({
          id: z.number(),
          ratioPercent: z.string().optional(),
          gramsPerKg: z.string().optional(),
          note: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateIntermediateComponent } = await import("../../db/intermediateAPI");
        const { id, ...data } = input;
        return await updateIntermediateComponent(id, data);
      }),
    
    // 혼합재제 구성 삭제
    deleteComponent: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteIntermediateComponent } = await import("../../db/intermediateAPI");
        return await deleteIntermediateComponent(input.id, ctx.tenantId ?? undefined);
      })
});
