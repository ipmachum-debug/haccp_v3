// notificationSettings 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const notificationSettingsRouter = router({
    get: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getNotificationSettings } = await import("../../db");
      const settings = await getNotificationSettings(ctx.user.id);
      return settings || {
        userId: ctx.user.id,
        ccpDeviationEnabled: 1,
        stockLowEnabled: 1,
        expiryWarningEnabled: 1,
        batchCompletedEnabled: 1,
        approvalRequestEnabled: 1,
        inspectionCompletedEnabled: 1,
        systemNotificationEnabled: 1,
        emailEnabled: 0,
        smsEnabled: 0,
        businessHoursOnly: 0,
        businessHoursStart: "09:00",
        businessHoursEnd: "18:00"
      };
    }),
    
    save: tenantRequiredProcedure
      .input(z.object({
        ccpDeviationEnabled: z.number().optional(),
        stockLowEnabled: z.number().optional(),
        expiryWarningEnabled: z.number().optional(),
        batchCompletedEnabled: z.number().optional(),
        approvalRequestEnabled: z.number().optional(),
        inspectionCompletedEnabled: z.number().optional(),
        systemNotificationEnabled: z.number().optional(),
        emailEnabled: z.number().optional(),
        smsEnabled: z.number().optional(),
        businessHoursOnly: z.number().optional(),
        businessHoursStart: z.string().optional(),
        businessHoursEnd: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const { saveNotificationSettings } = await import("../../db");
        const settings = await saveNotificationSettings({
          userId: ctx.user.id,
          ...input
        });
        return { success: true, settings };
       })
});
