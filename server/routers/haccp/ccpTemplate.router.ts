// ccpTemplate 라우터 - routers.ts에서 분리됨
// P1 FIX: publicProcedure → tenantRequiredProcedure
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { requireTenantId } from "../../helpers/tenantGuards";

export const ccpTemplateRouter = router({
    list: tenantRequiredProcedure.query(async ({ ctx }) => {
      const tenantId = requireTenantId(ctx);
      const { getAllCcpTemplates } = await import("../../db");
      return await getAllCcpTemplates(tenantId, ctx.tenantId);
    }),
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { getCcpTemplateById } = await import("../../db");
        return await getCcpTemplateById(input.id);
      }),
    create: adminProcedure
      .input(
        z.object({
          templateName: z.string().min(1),
          productNamePattern: z.string().min(1),
          ccpType: z.string().min(1),
          description: z.string().optional(),
          priority: z.number().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = requireTenantId(ctx);
        const { createCcpTemplate } = await import("../../db");
        return await createCcpTemplate({ ...input, tenantId }, ctx.tenantId);
      }),
    update: adminProcedure
      .input(
        z.object({
          id: z.number(),
          templateName: z.string().optional(),
          productNamePattern: z.string().optional(),
          ccpType: z.string().optional(),
          description: z.string().optional(),
          priority: z.number().optional(),
          isActive: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateCcpTemplate } = await import("../../db");
        const { id, ...data } = input;
        return await updateCcpTemplate(id, data);
      }),
    delete: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteCcpTemplate } = await import("../../db");
        return await deleteCcpTemplate(input.id);
      })
});
