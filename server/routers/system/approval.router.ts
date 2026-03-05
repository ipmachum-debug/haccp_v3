// approval 라우터 - routers.ts에서 분리됨
import { adminProcedure, monitorProcedure, tenantRequiredProcedure, router, workerProcedure } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { or } from "drizzle-orm";
import { getDb } from "../../db";

export const approvalRouter = router({
    // 승인 대시보드 - 전체 승인 대기 항목 조회
    getPendingApprovals: tenantRequiredProcedure.query(async () => {
      const { getPendingApprovals } = await import("../../db");
      return await getPendingApprovals(ctx.user.tenantId);
    }),
    
    // 범용 승인 요청 생성
    createRequest: tenantRequiredProcedure
      .input(
        z.object({
          requestType: z.string(),
          referenceType: z.string().optional(),
          referenceId: z.number().optional(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("../../db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId || 1,
          requestType: input.requestType,
          referenceType: input.referenceType,
          referenceId: input.referenceId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // 승인 요청 목록 조회
    list: tenantRequiredProcedure
      .input(
        z.object({
          status: z.string().optional(),
          requestType: z.string().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const { getApprovalRequests } = await import("../../db");
        if (!ctx.user.tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "tenantId is required" });
        }
        return await getApprovalRequests({ ...input, tenantId: ctx.user.tenantId });
      }),

    // 승인 요청 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getApprovalRequestById } = await import("../../db");
        return await getApprovalRequestById(input.id);
      }),

    // 배치 승인 요청
    requestBatchApproval: workerProcedure
      .input(
        z.object({
          batchId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("../../db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId || 1,
          requestType: "batch_approval",
          referenceType: "batch",
          referenceId: input.batchId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // CCP 검토 승인 요청
    requestCcpReview: workerProcedure
      .input(
        z.object({
          ccpInstanceId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("../../db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId || 1,
          requestType: "ccp_review",
          referenceType: "ccp_instance",
          referenceId: input.ccpInstanceId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // 승인 처리
    approve: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveRequest, getApprovalRequestById, createNotification } = await import("../../db");
        
        // 승인 처리
        const result = await approveRequest(input.requestId, ctx.user.id, input.notes);
        
        // 요청 정보 조회
        const request = await getApprovalRequestById(input.requestId);
        if (request) {
          // 요청자에게 알림 전송
          await createNotification({
            userId: request.requestedBy,
            notificationType: "approval_completed",
            title: "승인 완료",
            message: `"${request.title}" 요청이 승인되었습니다. 승인자: ${ctx.user.name}${input.notes ? ` (\n코멘트: ${input.notes})` : ""}`,
            referenceType: request.referenceType || undefined,
            referenceId: request.referenceId || undefined
          });
        }
        
        return result;
      }),

    // 일괄 승인 처리
    bulkApprove: monitorProcedure
      .input(
        z.object({
          requestIds: z.array(z.number()),
          notes: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { approveRequest, getApprovalRequestById, createNotification } = await import("../../db");
        
        const results = [];
        const errors = [];
        
        for (const requestId of input.requestIds) {
          try {
            const result = await approveRequest(requestId, ctx.user.id, input.notes);
            results.push({ requestId, success: true, result });
            
            const request = await getApprovalRequestById(requestId);
            if (request) {
              await createNotification({
                userId: request.requestedBy,
                notificationType: "approval_completed",
                title: "승인 완료",
                message: `"${request.title}" 요청이 승인되었습니다. 승인자: ${ctx.user.name}${input.notes ? ` (코멘트: ${input.notes})` : ""}`,
                referenceType: request.referenceType || undefined,
                referenceId: request.referenceId || undefined
              });
            }
          } catch (error: any) {
            errors.push({ requestId, error: error.message });
            results.push({ requestId, success: false, error: error.message });
          }
        }
        
        return {
          total: input.requestIds.length,
          succeeded: results.filter(r => r.success).length,
          failed: errors.length,
          results,
          errors
        };
      }),

    // 거부 처리
    reject: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          rejectionReason: z.string()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { rejectRequest, getApprovalRequestById, createNotification } = await import("../../db");
        
        // 거부 처리
        const result = await rejectRequest(input.requestId, ctx.user.id, input.rejectionReason);
        
        // 요청 정보 조회
        const request = await getApprovalRequestById(input.requestId);
        if (request) {
          // 요청자에게 알림 전송
          await createNotification({
            userId: request.requestedBy,
            notificationType: "approval_rejected",
            title: "승인 거부",
            message: `"${request.title}" 요청이 거부되었습니다. 거부 사유: ${input.rejectionReason}`,
            referenceType: request.referenceType || undefined,
            referenceId: request.referenceId || undefined
          });
        }
        
        return result;
      }),

    // 승인 이력 조회
    getHistory: tenantRequiredProcedure
      .input(z.object({ requestId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getApprovalHistory } = await import("../../db");
        return await getApprovalHistory(input.requestId);
      }),

    // 대기 중인 승인 요청 개수
    getPendingCount: tenantRequiredProcedure.query(async ({ ctx }) => {
      const { getPendingApprovalCount } = await import("../../db");
      return await getPendingApprovalCount(ctx.user.tenantId);
    }),

    // 재고 조정 승인 요청
    requestInventoryAdjustment: workerProcedure
      .input(
        z.object({
          adjustmentId: z.number(),
          title: z.string(),
          description: z.string().optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createApprovalRequest } = await import("../../db");
        const requestId = await createApprovalRequest({
          tenantId: ctx.user.tenantId,
          siteId: ctx.user.siteId || 1,
          requestType: "inventory_adjustment",
          referenceType: "inventory_adjustment",
          referenceId: input.adjustmentId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          requestedBy: ctx.user.id
        });
        return { success: true, requestId };
      }),

    // 승인 요청 취소
    cancelRequest: tenantRequiredProcedure
      .input(
        z.object({
          requestId: z.number(),
          reason: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { cancelApprovalRequest } = await import("../../db");
        return await cancelApprovalRequest(input.requestId, ctx.user.id, input.reason);
      }),
    // 검토 처리 (검토자 → pending_approval 단계)
    reviewRequest: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          comments: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { reviewApprovalRequest } = await import("../../lib/autoApprovalRequest");
        const result = await reviewApprovalRequest(input.requestId, ctx.user.id, input.comments);
        return result;
      }),

    // 최종 승인 처리 (승인자 → approved + 재고이동/회계연동 트리거)
    finalApprove: monitorProcedure
      .input(
        z.object({
          requestId: z.number(),
          comments: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { finalApproveRequest } = await import("../../lib/autoApprovalRequest");
        const result = await finalApproveRequest(input.requestId, ctx.user.id, input.comments);

        // 승인 완료 알림 발송
        if (result.success) {
          try {
            const { getApprovalRequestById, createNotification } = await import("../../db");
            const request = await getApprovalRequestById(input.requestId);
            if (request) {
              await createNotification({
                userId: request.requestedBy,
                notificationType: "approval_completed",
                title: "최종 승인 완료",
                message: `"${request.title}" 승인이 완료되었습니다.${result.inventoryTriggered ? " 제품재고 이동 및 회계연동이 처리되었습니다." : ""}`,
                referenceType: request.referenceType || undefined,
                referenceId: request.referenceId || undefined
              });
            }
          } catch (notifyErr) {
            console.error("[finalApprove] 알림 발송 실패:", notifyErr);
          }
        }

        return result;
      }),

});
