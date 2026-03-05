// templateSettings 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const templateSettingsRouter = router({
    // 사용자의 템플릿 설정 목록 조회
    getList: tenantRequiredProcedure
      .input(z.object({ templateType: z.string() }))
      .query(async ({ input, ctx }) => {
        const { getUserTemplateSettings } = await import("../../db/templateSettings.js");
        return await getUserTemplateSettings(ctx.user.id, input.templateType, ctx.user.tenantId);
      }),
    
    // 템플릿 설정 생성
    create: tenantRequiredProcedure
      .input(z.object({
        templateType: z.string(),
        templateName: z.string(),
        selectedFields: z.array(z.string())
      }))
      .mutation(async ({ input, ctx }) => {
        const { createTemplateSetting } = await import("../../db/templateSettings.js");
        return await createTemplateSetting({
          userId: ctx.user.id,
          templateType: input.templateType,
          templateName: input.templateName,
          selectedFields: input.selectedFields
        });
      }),
    
    // 템플릿 설정 조회
    get: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getTemplateSetting } = await import("../../db/templateSettings.js");
        return await getTemplateSetting(input.id, ctx.user.id, ctx.user.tenantId);
      }),
    
    // 템플릿 설정 삭제
    delete: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteTemplateSetting } = await import("../../db/templateSettings.js");
        return await deleteTemplateSetting(input.id, ctx.user.id, ctx.user.tenantId);
      })
});
