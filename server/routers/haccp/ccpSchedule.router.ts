// ccpSchedule 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const ccpScheduleRouter = router({
    // 점검 일정 조회
    list: tenantRequiredProcedure
      .input(z.object({
        ccpInstanceId: z.number().optional(),
        status: z.enum(["pending", "completed", "skipped"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional()
      }))
      .query(async ({ input, ctx }) => {
        const { getCcpSchedules } = await import("../../db");
        return await getCcpSchedules({
          tenantId: ctx.user.tenantId,
          ccpInstanceId: input.ccpInstanceId,
          status: input.status,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined
        });
      }),
    
    // 점검 완료 처리
    complete: tenantRequiredProcedure
      .input(z.object({
        scheduleId: z.number(),
        note: z.string().optional()
      }))
      .mutation(async ({ input, ctx }) => {
        const { completeCcpSchedule } = await import("../../db");
        await completeCcpSchedule(
          input.scheduleId,
          ctx.user?.id || 0,
          input.note
        );
        return { success: true, message: "점검이 완료되었습니다." };
      }),
    
    // 점검 일정 날짜 변경
    updateDate: tenantRequiredProcedure
      .input(z.object({
        scheduleId: z.number(),
        newDate: z.string()
      }))
      .mutation(async ({ input, ctx }) => {
        const { updateCcpScheduleDate } = await import("../../db");
        await updateCcpScheduleDate(
          input.scheduleId,
          new Date(input.newDate)
        );
        return { success: true, message: "일정이 변경되었습니다." };
      })
});
