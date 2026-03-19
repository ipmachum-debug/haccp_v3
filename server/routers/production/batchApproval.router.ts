/**
 * batchApproval.router.ts - 배치 승인/반려/검토 서브 라우터
 * ✅ P2 리팩토링: batch.router.ts에서 분리
 */
import { monitorProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const batchApprovalRouter = router({
  // 배치 승인 요청
  requestApproval: workerProcedure
    .input(z.object({
      batchId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getBatchById, updateBatchStatus, createAuditLog, getUsersByRole, createNotification } = await import("../../db");

      const batch = await getBatchById(input.batchId, ctx.tenantId ?? undefined);
      if (!batch) {
        throw new TRPCError({ code: "NOT_FOUND", message: "배치를 찾을 수 없습니다." });
      }

      const tenantId = ctx.tenantId;
      await updateBatchStatus(input.batchId, "under_review", tenantId ?? undefined);

      await createAuditLog({
        action: "batch.requestApproval",
        entityType: "batch",
        entityId: input.batchId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        userRole: ctx.user.role,
        description: `배치 승인 요청: ID ${input.batchId}`,
        changes: { status: "under_review", notes: input.notes },
      });

      const admins = await getUsersByRole("admin", tenantId ?? undefined);
      const inspectors = await getUsersByRole("inspector", tenantId ?? undefined);
      const recipients = [...admins, ...inspectors];

      for (const recipient of recipients) {
        await createNotification({
          tenantId: ctx.tenantId!,
          userId: recipient.id,
          notificationType: "batch_approval_request",
          title: "배치 승인 요청",
          message: `${ctx.user.name}님이 배치 ${batch.batchCode}의 승인을 요청했습니다.${input.notes ? ` (참고: ${input.notes})` : ""}`,
          referenceType: "batch",
          referenceId: input.batchId,
          priority: "high",
        });
      }

      return { success: true, message: "승인 요청이 전송되었습니다." };
    }),

  // 배치 승인
  approve: monitorProcedure
    .input(z.object({
      batchId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { approveBatch } = await import("../../db/batchApprovals");
      const { updateBatchStatus, createAuditLog } = await import("../../db");

      const tenantId = ctx.tenantId;
      await approveBatch({ batchId: input.batchId, approverId: ctx.user.id, notes: input.notes }, tenantId ?? undefined);
      await updateBatchStatus(input.batchId, "approved", tenantId ?? undefined);

      await createAuditLog({
        action: "batch.approve",
        entityType: "batch",
        entityId: input.batchId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        userRole: ctx.user.role,
        description: `배치 승인: ID ${input.batchId}`,
        changes: { approved: true, notes: input.notes },
      });

      return { success: true, message: "배치가 승인되었습니다." };
    }),

  // 배치 반려
  reject: monitorProcedure
    .input(z.object({
      batchId: z.number(),
      rejectionReason: z.string().min(1, "반려 사유를 입력해주세요"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { rejectBatch } = await import("../../db/batchApprovals");
      const { updateBatchStatus, createAuditLog } = await import("../../db");

      const tenantId = ctx.tenantId;
      await rejectBatch({ batchId: input.batchId, approverId: ctx.user.id, rejectionReason: input.rejectionReason, notes: input.notes }, tenantId ?? undefined);
      await updateBatchStatus(input.batchId, "rejected", tenantId ?? undefined);

      await createAuditLog({
        action: "batch.reject",
        entityType: "batch",
        entityId: input.batchId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        userRole: ctx.user.role,
        description: `배치 반려: ID ${input.batchId}`,
        changes: { rejected: true, reason: input.rejectionReason, notes: input.notes },
      });

      return { success: true, message: "배치가 반려되었습니다." };
    }),

  // 배치 승인 이력 조회
  getApprovals: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { getBatchApprovals } = await import("../../db/batchApprovals");
      return await getBatchApprovals(input.batchId, ctx.tenantId ?? undefined);
    }),

  // 배치 승인 상태 확인
  getApprovalStatus: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { getBatchApprovalStatus } = await import("../../db/batchApprovals");
      return await getBatchApprovalStatus(input.batchId, ctx.tenantId ?? undefined);
    }),
});
