// batchSchedule 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";

export const batchScheduleRouter = router({
    // 배치 일정 생성
    create: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          scheduledDate: z.date(),
          status: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createBatchSchedule } = await import("../../db/production/batchSchedules");
        const { createAuditLog } = await import("../../db");
        
        const schedule = await createBatchSchedule({ ...input, tenantId: ctx.tenantId });
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batchSchedule.create",
          entityType: "batch_schedule",
          entityId: input.batchId,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 일정 생성: 배치 ID ${input.batchId}`,
          changes: { created: input }
        });
        
        return {
          success: true,
          schedule,
          message: "배치 일정이 생성되었습니다."
        };
      }),
    
    // 날짜 범위로 배치 일정 조회
    list: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.date(),
          endDate: z.date()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getBatchSchedulesByDateRange } = await import("../../db/production/batchSchedules");
        return await getBatchSchedulesByDateRange(ctx.tenantId, input.startDate, input.endDate);
      }),
    
    // 배치 ID로 일정 조회
    getByBatchId: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getBatchSchedulesByBatchId } = await import("../../db/production/batchSchedules");
        return await getBatchSchedulesByBatchId(ctx.tenantId, input.batchId);
      }),
    
    // 배치 일정 수정
    update: workerProcedure
      .input(
        z.object({
          id: z.number(),
          scheduledDate: z.date().optional(),
          status: z.string().optional(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateBatchSchedule } = await import("../../db/production/batchSchedules");
        const { createAuditLog } = await import("../../db");
        
        const { id, ...updateData } = input;
        await updateBatchSchedule(ctx.tenantId, id, updateData);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batchSchedule.update",
          entityType: "batch_schedule",
          entityId: id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 일정 수정: ID ${id}`,
          changes: { updated: updateData }
        });
        
        return {
          success: true,
          message: "배치 일정이 수정되었습니다."
        };
      }),
    
    // 배치 일정 삭제
    delete: workerProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteBatchSchedule } = await import("../../db/production/batchSchedules");
        const { createAuditLog } = await import("../../db");
        
        await deleteBatchSchedule(ctx.tenantId, input.id);
        
        // 감사 로그 기록
        await createAuditLog({
          action: "batchSchedule.delete",
          entityType: "batch_schedule",
          entityId: input.id,
          userId: ctx.user.id,
          userEmail: ctx.user.email,
          userRole: ctx.user.role,
          description: `배치 일정 삭제: ID ${input.id}`,
          changes: { deleted: true }
        });
        
        return {
          success: true,
          message: "배치 일정이 삭제되었습니다."
        };
      })
});
