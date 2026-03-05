// scheduler 라우터 - routers.ts에서 분리됨
import { adminProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, lt, or } from "drizzle-orm";
import { hSystemSettings } from "../../../drizzle/schema";
import { getDb } from "../../db";

export const schedulerRouter = router({
    // 스케줄러 실행 이력 조회
    getLogs: adminProcedure
      .input(
        z.object({
          limit: z.number().optional().default(50)
        })
      )
      .query(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

        const { hSchedulerLogs } = await import("../../../drizzle/schema");
        const logs = await db
          .select()
          .from(hSchedulerLogs)
          .orderBy(hSchedulerLogs.executionTime)
          .limit(input.limit);

        return logs;
      }),

    // 스케줄러 수동 실행
    runManually: adminProcedure.mutation(async () => {
      const executionTime = new Date();
      let status = "success";
      let resultMessage = "";
      let deletedCount = 0;

      try {
        // 설정값 로드
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not initialized" });

        const settings = await db
          .select()
          .from(hSystemSettings)
          .where(eq(hSystemSettings.settingKey, "notification_retention_days"));

        const retentionDays = settings[0]?.settingValue ? parseInt(settings[0].settingValue, 10) : 30;

        // 알림 삭제
        const { deleteOldReadNotifications } = await import("../../db");
        const result = await deleteOldReadNotifications(retentionDays);
        deletedCount = result.deletedCount;

        resultMessage = `${deletedCount}개 삭제 완료 (기준: ${retentionDays}일)`;
      } catch (error) {
        status = "error";
        resultMessage = error instanceof Error ? error.message : String(error);
      } finally {
        // 실행 이력 저장
        try {
          const db = await getDb();
          if (db) {
            const { hSchedulerLogs } = await import("../../../drizzle/schema");
            await db.insert(hSchedulerLogs).values({
              schedulerName: "notification_cleanup_manual",
              executionTime,
              status,
              resultMessage,
              deletedCount
            });
          }
        } catch (logError) {
          console.error("[스케줄러] 실행 이력 저장 실패:", logError);
        }
      }

      return {
        success: status === "success",
        deletedCount,
        message: resultMessage
      };
    })
});
