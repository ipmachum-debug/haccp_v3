import { z } from "zod";
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import * as auditDb from "../../db/haccp/internalAudit";

import { todayKST } from "../../utils/timezone";

/**
 * 내부 감사 라우터 (HACCP 원칙 6)
 */

export const internalAuditRouter = router({
  // ============================================================================
  // 내부 감사 계획
  // ============================================================================

  // 내부 감사 계획 생성
  createPlan: tenantRequiredProcedure
    .input(
      z.object({
        planYear: z.number(),
        planNumber: z.string(),
        planName: z.string(),
        auditScope: z.string().optional(),
        auditFrequency: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await auditDb.createAuditPlan({
        ...input,
        createdBy: ctx.user.id,
        tenantId: ctx.tenantId,
      });
      return { id };
    }),

  // 내부 감사 계획 목록 조회
  listPlans: tenantRequiredProcedure
    .input(
      z.object({
        planYear: z.number().optional(),
        status: z.enum(["draft", "approved", "in_progress", "completed"]).optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      return auditDb.getAuditPlans({ ...input, tenantId: ctx.tenantId });
    }),

  // 내부 감사 계획 상세 조회
  getPlanById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      return auditDb.getAuditPlanById(input.id, tenantId ?? undefined);
    }),

  // 내부 감사 계획 수정
  updatePlan: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        planName: z.string().optional(),
        auditScope: z.string().optional(),
        auditFrequency: z.string().optional(),
        status: z.enum(["draft", "approved", "in_progress", "completed"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { id, ...data } = input;
      await auditDb.updateAuditPlan(id, data, tenantId ?? undefined);
      return { success: true };
    }),

  // 내부 감사 계획 승인
  approvePlan: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.updateAuditPlan(input.id, {
        status: "approved",
        approvedBy: ctx.user.id,
        approvedDate: todayKST(),
      }, tenantId ?? undefined);
      return { success: true };
    }),

  // 내부 감사 계획 삭제
  deletePlan: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.deleteAuditPlan(input.id, tenantId ?? undefined);
      return { success: true };
    }),

  // ============================================================================
  // 내부 감사 실시
  // ============================================================================

  // 내부 감사 생성
  create: tenantRequiredProcedure
    .input(
      z.object({
        planId: z.number().optional(),
        auditNumber: z.string(),
        auditName: z.string(),
        auditType: z.enum(["scheduled", "special", "follow_up"]),
        scheduledDate: z.string(), // YYYY-MM-DD
        siteId: z.number(),
        auditScope: z.string().optional(),
        auditAreas: z.array(z.string()).optional(),
        leadAuditor: z.number(),
        auditTeam: z.array(z.number()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await auditDb.createAudit({
        ...input,
        auditAreas: input.auditAreas ? JSON.stringify(input.auditAreas) : undefined,
        auditTeam: input.auditTeam ? JSON.stringify(input.auditTeam) : undefined,
        createdBy: ctx.user.id,
        tenantId: ctx.tenantId,
      });
      return { id };
    }),

  // 내부 감사 목록 조회
  list: tenantRequiredProcedure
    .input(
      z.object({
        planId: z.number().optional(),
        siteId: z.number().optional(),
        auditType: z.enum(["scheduled", "special", "follow_up"]).optional(),
        status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      return auditDb.getAudits({ ...input, tenantId: ctx.tenantId });
    }),

  // 내부 감사 상세 조회
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      return auditDb.getAuditById(input.id, tenantId ?? undefined);
    }),

  // 내부 감사 수정
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        auditName: z.string().optional(),
        scheduledDate: z.string().optional(),
        actualStartDate: z.string().optional(),
        actualEndDate: z.string().optional(),
        auditScope: z.string().optional(),
        auditAreas: z.array(z.string()).optional(),
        auditTeam: z.array(z.number()).optional(),
        overallRating: z.enum(["excellent", "good", "acceptable", "needs_improvement", "unacceptable"]).optional(),
        executiveSummary: z.string().optional(),
        strengths: z.string().optional(),
        weaknesses: z.string().optional(),
        recommendations: z.string().optional(),
        status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { id, auditAreas, auditTeam, ...data } = input;

      await auditDb.updateAudit(id, {
        ...data,
        auditAreas: auditAreas ? JSON.stringify(auditAreas) : undefined,
        auditTeam: auditTeam ? JSON.stringify(auditTeam) : undefined,
      }, tenantId ?? undefined);

      return { success: true };
    }),

  // 내부 감사 시작
  start: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.updateAudit(input.id, {
        status: "in_progress",
        actualStartDate: todayKST(),
      }, tenantId ?? undefined);
      return { success: true };
    }),

  // 내부 감사 완료
  complete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.updateAudit(input.id, {
        status: "completed",
        actualEndDate: todayKST(),
      }, tenantId ?? undefined);
      return { success: true };
    }),

  // 내부 감사 삭제
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.deleteAudit(input.id, tenantId ?? undefined);
      return { success: true };
    }),

  // ============================================================================
  // 내부 감사 체크리스트
  // ============================================================================

  // 체크리스트 항목 추가
  addChecklistItem: tenantRequiredProcedure
    .input(
      z.object({
        auditId: z.number(),
        category: z.string(),
        subCategory: z.string().optional(),
        checkItem: z.string(),
        checkCriteria: z.string().optional(),
        checkResult: z.enum(["pass", "fail", "na"]).optional(),
        nonConformityLevel: z.enum(["critical", "major", "minor"]).optional(),
        findings: z.string().optional(),
        evidence: z.string().optional(),
        correctiveActionRequired: z.number().optional(), // 0 or 1
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const id = await auditDb.createChecklistItem({
        ...input,
        checkedBy: ctx.user.id,
        checkedAt: new Date().toISOString(),
      }, tenantId ?? undefined);

      // 체크리스트 통계 업데이트
      await auditDb.updateAuditStatistics(input.auditId, tenantId ?? undefined);

      return { id };
    }),

  // 체크리스트 목록 조회
  getChecklistItems: tenantRequiredProcedure
    .input(z.object({ auditId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      return auditDb.getChecklistItems(input.auditId, tenantId ?? undefined);
    }),

  // 체크리스트 항목 수정
  updateChecklistItem: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        category: z.string().optional(),
        subCategory: z.string().optional(),
        checkItem: z.string().optional(),
        checkCriteria: z.string().optional(),
        checkResult: z.enum(["pass", "fail", "na"]).optional(),
        nonConformityLevel: z.enum(["critical", "major", "minor"]).optional(),
        findings: z.string().optional(),
        evidence: z.string().optional(),
        correctiveActionRequired: z.number().optional(),
        correctiveActionId: z.number().optional(),
        remarks: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { id, ...data } = input;
      await auditDb.updateChecklistItem(id, data, tenantId ?? undefined);

      // 체크리스트 통계 업데이트
      const item = await auditDb.getChecklistItemById(id, tenantId ?? undefined);
      if (item) {
        await auditDb.updateAuditStatistics(item.auditId, tenantId ?? undefined);
      }

      return { success: true };
    }),

  // 체크리스트 항목 삭제
  deleteChecklistItem: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const item = await auditDb.getChecklistItemById(input.id, tenantId ?? undefined);
      await auditDb.deleteChecklistItem(input.id, tenantId ?? undefined);

      // 체크리스트 통계 업데이트
      if (item) {
        await auditDb.updateAuditStatistics(item.auditId, tenantId ?? undefined);
      }

      return { success: true };
    }),

  // ============================================================================
  // 내부 감사 발견 사항 (부적합 사항)
  // ============================================================================

  // 발견 사항 추가
  addFinding: tenantRequiredProcedure
    .input(
      z.object({
        auditId: z.number(),
        checklistItemId: z.number().optional(),
        findingNumber: z.string(),
        findingType: z.enum(["non_conformity", "observation", "opportunity"]),
        severity: z.enum(["critical", "major", "minor"]),
        category: z.string(),
        description: z.string(),
        requirement: z.string().optional(),
        evidence: z.string().optional(),
        responsiblePerson: z.number().optional(),
        responsibleDepartment: z.string().optional(),
        correctiveActionRequired: z.number().optional(), // 0 or 1
        correctiveActionDueDate: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const id = await auditDb.createFinding({
        ...input,
        createdBy: ctx.user.id,
      }, tenantId ?? undefined);
      return { id };
    }),

  // 발견 사항 목록 조회
  getFindings: tenantRequiredProcedure
    .input(
      z.object({
        auditId: z.number().optional(),
        status: z.enum(["open", "in_progress", "resolved", "verified", "closed"]).optional(),
        severity: z.enum(["critical", "major", "minor"]).optional(),
        limit: z.number().default(50),
        offset: z.number().default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      return auditDb.getFindings({ ...input, tenantId: tenantId ?? undefined });
    }),

  // 발견 사항 상세 조회
  getFindingById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      return auditDb.getFindingById(input.id, tenantId ?? undefined);
    }),

  // 발견 사항 수정
  updateFinding: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        description: z.string().optional(),
        requirement: z.string().optional(),
        evidence: z.string().optional(),
        responsiblePerson: z.number().optional(),
        responsibleDepartment: z.string().optional(),
        correctiveActionId: z.number().optional(),
        correctiveActionDueDate: z.string().optional(),
        status: z.enum(["open", "in_progress", "resolved", "verified", "closed"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { id, ...data } = input;
      await auditDb.updateFinding(id, data, tenantId ?? undefined);
      return { success: true };
    }),

  // 발견 사항 해결
  resolveFinding: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.updateFinding(input.id, {
        status: "resolved",
        resolvedDate: todayKST(),
      }, tenantId ?? undefined);
      return { success: true };
    }),

  // 발견 사항 검증
  verifyFinding: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.updateFinding(input.id, {
        status: "verified",
        verifiedBy: ctx.user.id,
        verifiedDate: todayKST(),
      }, tenantId ?? undefined);
      return { success: true };
    }),

  // 발견 사항 종결
  closeFinding: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.updateFinding(input.id, {
        status: "closed",
      }, tenantId ?? undefined);
      return { success: true };
    }),

  // 발견 사항 삭제
  deleteFinding: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.deleteFinding(input.id, tenantId ?? undefined);
      return { success: true };
    }),

  // ============================================================================
  // 첨부 파일
  // ============================================================================

  // 첨부 파일 추가
  addAttachment: tenantRequiredProcedure
    .input(
      z.object({
        auditId: z.number(),
        fileName: z.string(),
        fileUrl: z.string(),
        fileType: z.string().optional(),
        fileSize: z.number().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const id = await auditDb.createAttachment({
        ...input,
        uploadedBy: ctx.user.id,
      }, tenantId ?? undefined);
      return { id };
    }),

  // 첨부 파일 목록 조회
  getAttachments: tenantRequiredProcedure
    .input(z.object({ auditId: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      return auditDb.getAttachments(input.auditId, tenantId ?? undefined);
    }),

  // 첨부 파일 삭제
  deleteAttachment: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      await auditDb.deleteAttachment(input.id, tenantId ?? undefined);
      return { success: true };
    }),

  // ============================================================================
  // 통계 및 대시보드
  // ============================================================================

  // 감사 통계 조회
  getStatistics: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      return auditDb.getAuditStatistics({ ...input, tenantId: ctx.tenantId });
    }),

  // 예정된 감사 목록
  getUpcoming: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number().optional(),
        days: z.number().default(30), // 앞으로 N일 이내
      })
    )
    .query(async ({ input, ctx }) => {
      return auditDb.getUpcomingAudits({ ...input, tenantId: ctx.tenantId });
    }),

  // 미해결 발견 사항 통계
  getOpenFindingsStats: tenantRequiredProcedure
    .input(
      z.object({
        siteId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      return auditDb.getOpenFindingsStatistics({ ...input, tenantId: tenantId ?? undefined });
    }),
});
