import { z } from "zod";
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import * as correctiveActionDb from "../../db/haccp/correctiveAction";

/**
 * 시정 조치 관리 시스템 라우터
 */

export const correctiveActionRouter = router({
  // 시정 조치 요청 생성
  create: tenantRequiredProcedure
    .input(
      z.object({
        sourceType: z.enum(["ccp_deviation", "inspection_failure", "customer_complaint", "internal_audit", "other"]),
        sourceId: z.number().optional(),
        batchId: z.number().optional(),
        ccpInstanceId: z.number().optional(),
        problemDescription: z.string(),
        occurredAt: z.string(), // ISO 8601 format
        immediateAction: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await correctiveActionDb.createCorrectiveActionRequest({
        ...input,
        occurredAt: new Date(input.occurredAt),
        detectedBy: ctx.user.id,
      }, ctx.tenantId);
      return { id };
    }),

  // CCP 이탈 시 자동 시정 조치 생성
  createFromCcpDeviation: tenantRequiredProcedure
    .input(
      z.object({
        ccpInstanceId: z.number(),
        batchId: z.number(),
        problemDescription: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await correctiveActionDb.createCorrectiveActionFromCcpDeviation({
        ...input,
        detectedBy: ctx.user.id,
      }, ctx.tenantId);
      return { id };
    }),

  // 시정 조치 요청 상세 조회
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      return correctiveActionDb.getCorrectiveActionRequestById(input.id, ctx.tenantId);
    }),

  // 배치별 시정 조치 목록
  listByBatch: tenantRequiredProcedure
    .input(z.object({ batchId: z.number() }))
    .query(async ({ input, ctx }) => {
      return correctiveActionDb.getCorrectiveActionRequestsByBatch(input.batchId, ctx.tenantId);
    }),

  // 상태별 시정 조치 목록
  listByStatus: tenantRequiredProcedure
    .input(z.object({ 
      status: z.enum(["open", "investigating", "action_taken", "verifying", "closed", "reopened"]) 
    }))
    .query(async ({ input, ctx }) => {
      return correctiveActionDb.getCorrectiveActionRequestsByStatus(input.status, ctx.tenantId);
    }),

  // 전체 시정 조치 목록
  list: tenantRequiredProcedure
    .query(async ({ ctx }) => {
      return correctiveActionDb.getAllCorrectiveActionRequests(ctx.tenantId);
    }),

  // 즉시 조치 등록
  recordImmediateAction: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        immediateAction: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await correctiveActionDb.updateCorrectiveActionRequest(input.id, {
        immediateAction: input.immediateAction,
        immediateActionBy: ctx.user.id,
        immediateActionAt: new Date(),
        status: "investigating",
      }, ctx.tenantId);
      return { success: true };
    }),

  // 근본 원인 분석 등록
  recordRootCause: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        rootCauseAnalysis: z.string(),
        rootCauseCategory: z.enum([
          "human_error",
          "equipment_failure",
          "material_defect",
          "process_issue",
          "environmental",
          "other",
        ]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await correctiveActionDb.updateCorrectiveActionRequest(input.id, {
        rootCauseAnalysis: input.rootCauseAnalysis,
        rootCauseCategory: input.rootCauseCategory,
      }, ctx.tenantId);
      return { success: true };
    }),

  // 시정 조치 등록
  recordCorrectiveAction: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        correctiveAction: z.string(),
        actionStartDate: z.string(),
        actionDueDate: z.string(),
        preventiveAction: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await correctiveActionDb.updateCorrectiveActionRequest(input.id, {
        correctiveAction: input.correctiveAction,
        actionBy: ctx.user.id,
        actionStartDate: input.actionStartDate,
        actionDueDate: input.actionDueDate,
        preventiveAction: input.preventiveAction,
        status: "action_taken",
      }, ctx.tenantId);
      return { success: true };
    }),

  // 조치 완료 처리
  completeAction: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        actionCompletedDate: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await correctiveActionDb.updateCorrectiveActionRequest(input.id, {
        actionCompletedDate: input.actionCompletedDate,
        status: "verifying",
      }, ctx.tenantId);
      return { success: true };
    }),

  // 효과 검증
  verifyEffectiveness: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        verificationMethod: z.string(),
        verificationResult: z.string(),
        isEffective: z.number(), // 1: 효과적, 0: 비효과적
        verifiedDate: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await correctiveActionDb.updateCorrectiveActionRequest(input.id, {
        verificationMethod: input.verificationMethod,
        verificationResult: input.verificationResult,
        isEffective: input.isEffective,
        verifiedBy: ctx.user.id,
        verifiedDate: input.verifiedDate,
        status: input.isEffective === 1 ? "closed" : "reopened",
      }, ctx.tenantId);
      return { success: true };
    }),

  // 상태 변경
  updateStatus: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        status: z.enum(["open", "investigating", "action_taken", "verifying", "closed", "reopened"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await correctiveActionDb.updateCorrectiveActionRequest(input.id, {
        status: input.status,
      }, ctx.tenantId);
      return { success: true };
    }),

  // 우선순위 변경
  updatePriority: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        priority: z.enum(["low", "medium", "high", "critical"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await correctiveActionDb.updateCorrectiveActionRequest(input.id, {
        priority: input.priority,
      }, ctx.tenantId);
      return { success: true };
    }),

  // 시정 조치 삭제
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await correctiveActionDb.deleteCorrectiveActionRequest(input.id, ctx.tenantId);
      return { success: true };
    }),

  // 첨부 파일 추가
  addAttachment: tenantRequiredProcedure
    .input(
      z.object({
        requestId: z.number(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileType: z.string().optional(),
        fileSize: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await correctiveActionDb.addCorrectiveActionAttachment({
        ...input,
        uploadedBy: ctx.user.id,
      }, ctx.tenantId);
      return { id };
    }),

  // 첨부 파일 목록 조회
  listAttachments: tenantRequiredProcedure
    .input(z.object({ requestId: z.number() }))
    .query(async ({ input, ctx }) => {
      return correctiveActionDb.getCorrectiveActionAttachments(input.requestId, ctx.tenantId);
    }),

  // 첨부 파일 삭제
  deleteAttachment: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await correctiveActionDb.deleteCorrectiveActionAttachment(input.id, ctx.tenantId);
      return { success: true };
    }),
});
