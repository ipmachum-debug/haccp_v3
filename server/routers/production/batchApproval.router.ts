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

      const batch = await getBatchById(input.batchId, ctx.tenantId);
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
          tenantId: ctx.tenantId,
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

  // 배치 승인 현황 (2026-10-13) — 실제 승인 흐름(h_approval_requests) + 공식 CCP 기록지 기준
  getApprovalOverview: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { getBatchApprovalOverview } = await import("../../db/production/batchApprovalOverview");
      return await getBatchApprovalOverview(input.batchId, ctx.tenantId);
    }),

  // 배치 승인 — 승인관리와 같은 흐름: 이 배치의 batch_production 승인 요청을 승인한다 (2026-10-13)
  //   이전: h_batch_approvals(아무도 안 읽는 테이블) 에 쓰고 배치 status 를 'approved' 로 바꿈.
  //   현재: approveRequest(요청 id) — 승인관리 대기목록의 "승인" 버튼과 동일 함수.
  approve: monitorProcedure
    .input(z.object({
      batchId: z.number(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { getBatchApprovalOverview, findPendingBatchRequestId } = await import("../../db/production/batchApprovalOverview");
      const { approveRequest, createAuditLog } = await import("../../db");

      const overview = await getBatchApprovalOverview(input.batchId, ctx.tenantId);
      if (!overview.canApprove) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: overview.blockers.join(" / ") });
      }
      const requestId = await findPendingBatchRequestId(input.batchId, ctx.tenantId);
      if (!requestId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "대기 중인 배치 승인 요청이 없습니다." });
      }
      await approveRequest(requestId, ctx.user.id, input.notes);

      await createAuditLog({
        action: "batch.approve",
        entityType: "batch",
        entityId: input.batchId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        userRole: ctx.user.role,
        description: `배치 승인: ID ${input.batchId} (승인요청 #${requestId})`,
        changes: { approved: true, requestId, notes: input.notes },
      });

      return { success: true, requestId, message: "배치 승인 요청이 승인되었습니다." };
    }),

  // 배치 반려 — 승인관리와 같은 흐름 (rejectRequest)
  reject: monitorProcedure
    .input(z.object({
      batchId: z.number(),
      rejectionReason: z.string().min(1, "반려 사유를 입력해주세요"),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { findPendingBatchRequestId } = await import("../../db/production/batchApprovalOverview");
      const { rejectRequest, createAuditLog } = await import("../../db");

      const requestId = await findPendingBatchRequestId(input.batchId, ctx.tenantId);
      if (!requestId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "대기 중인 배치 승인 요청이 없습니다." });
      }
      await rejectRequest(requestId, ctx.user.id, input.rejectionReason);

      await createAuditLog({
        action: "batch.reject",
        entityType: "batch",
        entityId: input.batchId,
        userId: ctx.user.id,
        userEmail: ctx.user.email,
        userRole: ctx.user.role,
        description: `배치 반려: ID ${input.batchId} (승인요청 #${requestId})`,
        changes: { rejected: true, requestId, reason: input.rejectionReason, notes: input.notes },
      });

      return { success: true, requestId, message: "배치 승인 요청이 반려되었습니다." };
    }),

  // 배치 승인 이력 조회
  getApprovals: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { getBatchApprovals } = await import("../../db/production/batchApprovals");
      return await getBatchApprovals(input.batchId, ctx.tenantId);
    }),

  // 배치 승인 상태 확인
  getApprovalStatus: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { getBatchApprovalStatus } = await import("../../db/production/batchApprovals");
      return await getBatchApprovalStatus(input.batchId, ctx.tenantId);
    }),
});
