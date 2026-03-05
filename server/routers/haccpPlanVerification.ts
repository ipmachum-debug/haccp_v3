import { z } from "zod";
import { tenantRequiredProcedure, router } from "../_core/trpc";
import * as verificationDb from "../db/verification";

/**
 * HACCP 계획 검증 라우터 (HACCP 원칙 6)
 */

export const haccpPlanVerificationRouter = router({
  // HACCP 계획 검증 생성
  create: tenantRequiredProcedure
    .input(
      z.object({
        verificationNumber: z.string(),
        verificationDate: z.string(), // YYYY-MM-DD
        verificationPeriod: z.string().optional(),
        verificationType: z.enum(["annual", "product_change", "process_change", "incident", "regulation_change"]),
        siteId: z.number(),
        productIds: z.array(z.number()).optional(),
        verificationTeam: z.array(z.number()).optional(),
        verificationScope: z.string().optional(),
        verificationMethod: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await verificationDb.createHaccpPlanVerification({
        ...input,
        productIds: input.productIds ? JSON.stringify(input.productIds) : undefined,
        verificationTeam: input.verificationTeam ? JSON.stringify(input.verificationTeam) : undefined,
        verificationLeader: ctx.user.id,
        createdBy: ctx.user.id,
      });
      return { id };
    }),

  // HACCP 계획 검증 목록 조회
  list: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number().optional(),
        verificationType: z.enum(["annual", "product_change", "process_change", "incident", "regulation_change"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input }) => {
      return verificationDb.getHaccpPlanVerifications(input);
    }),

  // HACCP 계획 검증 상세 조회
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return verificationDb.getHaccpPlanVerificationById(input.id);
    }),

  // HACCP 계획 검증 수정
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        verificationDate: z.string().optional(),
        verificationPeriod: z.string().optional(),
        verificationType: z.enum(["annual", "product_change", "process_change", "incident", "regulation_change"]).optional(),
        siteId: z.number().optional(),
        productIds: z.array(z.number()).optional(),
        verificationTeam: z.array(z.number()).optional(),
        verificationScope: z.string().optional(),
        verificationMethod: z.string().optional(),
        hazardAnalysisAdequate: z.number().optional(), // 0 or 1
        ccpDeterminationAdequate: z.number().optional(),
        criticalLimitsAdequate: z.number().optional(),
        monitoringProceduresAdequate: z.number().optional(),
        correctiveActionsAdequate: z.number().optional(),
        recordKeepingAdequate: z.number().optional(),
        overallResult: z.enum(["adequate", "needs_improvement", "inadequate"]).optional(),
        findings: z.array(z.any()).optional(),
        recommendations: z.string().optional(),
        improvementActions: z.string().optional(),
        actionDueDate: z.string().optional(),
        actionCompletedDate: z.string().optional(),
        nextVerificationDate: z.string().optional(),
        attachments: z.array(z.any()).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, productIds, verificationTeam, findings, attachments, ...data } = input;
      
      await verificationDb.updateHaccpPlanVerification(id, {
        ...data,
        productIds: productIds ? JSON.stringify(productIds) : undefined,
        verificationTeam: verificationTeam ? JSON.stringify(verificationTeam) : undefined,
        findings: findings ? JSON.stringify(findings) : undefined,
        attachments: attachments ? JSON.stringify(attachments) : undefined,
        actionCompletedBy: data.actionCompletedDate ? ctx.user.id : undefined,
      });
      
      return { success: true };
    }),

  // HACCP 계획 검증 승인
  approve: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await verificationDb.updateHaccpPlanVerification(input.id, {
        approvedBy: ctx.user.id,
        approvedDate: new Date().toISOString().split("T")[0],
      });
      return { success: true };
    }),

  // HACCP 계획 검증 삭제
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await verificationDb.deleteHaccpPlanVerification(input.id);
      return { success: true };
    }),

  // 검증 체크리스트 추가
  addChecklistItem: tenantRequiredProcedure
    .input(
      z.object({
        verificationId: z.number(),
        category: z.string(),
        checkItem: z.string(),
        checkResult: z.enum(["pass", "fail", "na"]),
        evidence: z.string().optional(),
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await verificationDb.createVerificationChecklistItem(input);
      return { id };
    }),

  // 검증 체크리스트 목록 조회
  getChecklistItems: tenantRequiredProcedure
    .input(z.object({ verificationId: z.number() }))
    .query(async ({ input }) => {
      return verificationDb.getVerificationChecklistItems(input.verificationId);
    }),

  // 검증 체크리스트 항목 수정
  updateChecklistItem: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        category: z.string().optional(),
        checkItem: z.string().optional(),
        checkResult: z.enum(["pass", "fail", "na"]).optional(),
        evidence: z.string().optional(),
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await verificationDb.updateVerificationChecklistItem(id, data);
      return { success: true };
    }),

  // 검증 체크리스트 항목 삭제
  deleteChecklistItem: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await verificationDb.deleteVerificationChecklistItem(input.id);
      return { success: true };
    }),

  // 검증 통계 조회
  getStatistics: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      return verificationDb.getVerificationStatistics(input);
    }),

  // 다음 검증 예정 목록
  getUpcoming: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number().optional(),
        days: z.number().default(30), // 앞으로 N일 이내
      })
    )
    .query(async ({ input }) => {
      return verificationDb.getUpcomingVerifications(input);
    }),
});
