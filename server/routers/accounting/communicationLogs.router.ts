// communicationLogs 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { lt } from "drizzle-orm";

export const communicationLogsRouter = router({
    // 커뮤니케이션 로그 생성
    create: tenantRequiredProcedure
      .input(
        z.object({
          partnerId: z.number(),
          content: z.string().min(1, "내용은 필수입니다"),
          status: z.enum(["received", "in_progress", "completed"]).default("received"),
          mentions: z.string().optional(), // JSON 문자열
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { createCommunicationLog } = await import("../communicationLog");
        const id = await createCommunicationLog({
          ...input,
          tenantId: ctx.tenantId ?? undefined,
          authorId: ctx.user.id,
        });
        return { id, success: true };
      }),

    // 커뮤니케이션 로그 목록 조회
    list: tenantRequiredProcedure
      .input(
        z.object({
          partnerId: z.number().optional(),
          status: z.enum(["received", "in_progress", "completed"]).optional(),
          authorId: z.number().optional(),
        }).optional()
      )
      .query(async ({ input, ctx }) => {
        const { getCommunicationLogs } = await import("../communicationLog");
        return await getCommunicationLogs({
          tenantId: ctx.tenantId ?? undefined,
          partnerId: input?.partnerId,
          status: input?.status,
          authorId: input?.authorId,
        });
      }),

    // 커뮤니케이션 로그 상세 조회
    getById: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCommunicationLogById } = await import("../communicationLog");
        return await getCommunicationLogById(input.id, ctx.tenantId ?? undefined);
      }),

    // 커뮤니케이션 로그 수정
    update: tenantRequiredProcedure
      .input(
        z.object({
          id: z.number(),
          content: z.string().optional(),
          status: z.enum(["received", "in_progress", "completed"]).optional(),
          mentions: z.string().optional(),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateCommunicationLog } = await import("../communicationLog");
        const { id, ...data } = input;
        await updateCommunicationLog(id, data, ctx.tenantId ?? undefined, ctx.user.id);
        return { success: true };
      }),

    // 커뮤니케이션 로그 삭제
    delete: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteCommunicationLog } = await import("../communicationLog");
        await deleteCommunicationLog(input.id, ctx.tenantId ?? undefined, ctx.user.id);
        return { success: true };
      }),

    // 커뮤니케이션 로그 상태 변경
    updateStatus: tenantRequiredProcedure
      .input(
        z.object({
          id: z.number(),
          status: z.enum(["received", "in_progress", "completed"]),
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { updateCommunicationLogStatus } = await import("../communicationLog");
        await updateCommunicationLogStatus({ id: input.id, status: input.status, tenantId: ctx.tenantId ?? undefined, userId: ctx.user.id });
        return { success: true };
      }),

    // 거래처별 통계
    stats: tenantRequiredProcedure
      .input(z.object({ partnerId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getCommunicationLogStats } = await import("../communicationLog");
        return await getCommunicationLogStats(input.partnerId, ctx.tenantId ?? undefined);
      }),
    // 댓글 생성
    createComment: tenantRequiredProcedure
      .input(z.object({ logId: z.number(), content: z.string().min(1), mentions: z.string().optional() }))
      .mutation(async ({ input, ctx }) => {
        const { createComment } = await import("../communicationLog");
        const id = await createComment({ ...input, tenantId: ctx.tenantId ?? undefined, authorId: ctx.user.id });
        return { id, success: true };
      }),
    // 댓글 목록 조회
    getComments: tenantRequiredProcedure
      .input(z.object({ logId: z.number() }))
      .query(async ({ input, ctx }) => {
        const { getComments } = await import("../communicationLog");
        return await getComments(input.logId, ctx.tenantId ?? undefined);
      }),
    // 댓글 삭제
    deleteComment: tenantRequiredProcedure
      .input(z.object({ commentId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { deleteComment } = await import("../communicationLog");
        await deleteComment(input.commentId, ctx.tenantId ?? undefined, ctx.user.id);
        return { success: true };
      }),
});
