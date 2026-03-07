// accountingDaily 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { lt, or } from "drizzle-orm";

export const accountingDailyRouter = router({
    // 일일 마감 실행
    execute: adminProcedure
      .input(
        z.object({
          closeDate: z.date(),
          largeAmountChecked: z.boolean().default(false)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { executeDailyClose } = await import("../../db/accountingDailyClose");
        const dailyCloseResult = await executeDailyClose({
          closeDate: input.closeDate,
          largeAmountChecked: input.largeAmountChecked,
          userId: ctx.user.id
        }, ctx.tenantId ?? undefined);
        
        // === 원료수불부 일일 마감 연동 ===
        try {
          const { autoUpdateFromDailyClose } = await import("../../db/materialLedger");
          await autoUpdateFromDailyClose(input.closeDate, ctx.tenantId ?? undefined);
          console.log("[원료수불부] 일일 마감 자동 업데이트 완료:", input.closeDate);
        } catch (ledgerError) {
          console.error("[원료수불부] 일일 마감 연동 실패:", ledgerError);
        }
        
        return dailyCloseResult;
      }),

    // 일일 마감 통계 조회
    getStats: tenantRequiredProcedure
      .input(z.object({ targetDate: z.date() }))
      .query(async ({ input, ctx }) => {
        const { getDailyCloseStats } = await import("../../db/accountingDailyClose");
        return await getDailyCloseStats(input.targetDate, ctx.tenantId ?? undefined);
      }),

    // 마감 이력 조회
    getHistory: tenantRequiredProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ input, ctx }) => {
        const { getDailyCloseHistory } = await import("../../db/accountingDailyClose");
        return await getDailyCloseHistory(input.limit, ctx.tenantId ?? undefined);
      }),

    // 특정 날짜 마감 여부 확인
    isClosed: tenantRequiredProcedure
      .input(z.object({ targetDate: z.date() }))
      .query(async ({ input, ctx }) => {
        const { isDayClosed } = await import("../../db/accountingDailyClose");
        return await isDayClosed(input.targetDate, ctx.tenantId ?? undefined);
      })
});
