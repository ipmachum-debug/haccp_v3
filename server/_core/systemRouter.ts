import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  // 상세 헬스체크 (DB 연결 + 에러율 + 메모리) - admin 전용
  healthDetailed: adminProcedure
    .query(async () => {
      const { getDetailedHealth } = await import("../utils/operationMonitor");
      return await getDetailedHealth();
    }),

  // 최근 에러 목록 조회 - admin 전용
  getRecentErrors: adminProcedure
    .query(async () => {
      const { getRecentErrors, getErrorRate } = await import("../utils/operationMonitor");
      return {
        errors: getRecentErrors(),
        stats: getErrorRate(),
      };
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
  
  // 모든 시스템 설정 조회 (테넌트 격리)
  getSettings: adminProcedure
    .query(async ({ ctx }) => {
      const { getSystemSettings } = await import("../db");
      return await getSystemSettings(ctx.tenantId);
    }),

  // 특정 설정 값 조회 (테넌트 격리)
  getSetting: adminProcedure
    .input(z.object({ key: z.string() }))
    .query(async ({ input, ctx }) => {
      const { getSystemSetting } = await import("../db");
      return await getSystemSetting(input.key, ctx.tenantId);
    }),

  // 시스템 설정 업데이트 (테넌트 격리)
  updateSetting: adminProcedure
    .input(
      z.object({
        key: z.string(),
        value: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { upsertSystemSetting } = await import("../db");
      return await upsertSystemSetting(
        input.key,
        input.value,
        input.description || "",
        ctx.user.id,
        ctx.tenantId
      );
    }),
  
  // 배치 완료 재시도 작업 목록 조회 (실패한 작업만)
  getFailedBatchCompletionRetries: adminProcedure
    .query(async () => {
      const { getFailedRetryTasks } = await import("../db/production/batchCompletionRetries");
      return await getFailedRetryTasks();
    }),
  
  // 배치 완료 재시도 작업 수동 재시도
  retryBatchCompletionTask: adminProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ input }) => {
      const { getPendingRetryTasks, updateRetryTaskStatus } = await import("../db/production/batchCompletionRetries");
      const { notifyOwner } = await import("./notification");
      
      // 작업 조회
      const tasks = await getPendingRetryTasks();
      const task = tasks.find(t => t.id === input.taskId);
      
      if (!task) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "재시도 작업을 찾을 수 없습니다.",
        });
      }
      
      try {
        // 재시도 상태로 변경
        await updateRetryTaskStatus(task.id, "retrying");
        
        // 작업 유형에 따라 재시도
        if (task.taskType === "pdf_generation") {
          const { generateHaccpReportPdf } = await import("../lib/generateHaccpReport");
          await generateHaccpReportPdf(task.batchId);
        } else if (task.taskType === "notification") {
          await notifyOwner({
            title: "배치 생산 완료",
            content: `배치 ID ${task.batchId}가 완료되었습니다. (수동 재시도)`,
          });
        }
        
        // 성공 시 상태 업데이트
        await updateRetryTaskStatus(task.id, "success");
        
        return {
          success: true,
          message: "재시도가 성공적으로 완료되었습니다.",
        };
      } catch (error) {
        // 실패 시 상태 업데이트
        await updateRetryTaskStatus(
          task.id,
          "failed",
          error instanceof Error ? error.message : "재시도 실패"
        );
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "재시도 중 오류가 발생했습니다.",
        });
      }
    }),
  
  // 배치 완료 재시도 작업 삭제
  deleteBatchCompletionRetry: adminProcedure
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ input }) => {
      const { deleteRetryTask } = await import("../db/production/batchCompletionRetries");
      await deleteRetryTask(input.taskId);
      return {
        success: true,
        message: "재시도 작업이 삭제되었습니다.",
      };
    }),
});
