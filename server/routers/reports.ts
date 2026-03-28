import { z } from "zod";
import { tenantRequiredProcedure, router } from "../_core/trpc";
import * as hazardAnalysisDb from "../db/hazardAnalysis";
import * as correctiveActionDb from "../db/correctiveAction";
import * as trainingDb from "../db/training";

import { todayKST } from "../utils/timezone";

/**
 * HACCP 7원칙 보고서 생성 라우터
 */

export const reportsRouter = router({
  // ============================================================================
  // 위험 분석 보고서
  // ============================================================================

  // 위험 분석 보고서 데이터 조회
  getHazardAnalysisReport: tenantRequiredProcedure
    .input(z.object({ productId: z.number() }))
    .query(async ({ input, ctx }) => {
      const hazards = await hazardAnalysisDb.getHazardAnalysisByProduct(input.productId, ctx.tenantId);
      
      // 통계 계산
      const totalHazards = hazards.length;
      const ccpCount = hazards.filter((h) => h.isCcp === 1).length;
      const highRiskCount = hazards.filter(
        (h) => h.riskLevel === "high" || h.riskLevel === "critical"
      ).length;

      return {
        hazards,
        statistics: {
          totalHazards,
          ccpCount,
          highRiskCount,
          approvedCount: hazards.filter((h) => h.status === "approved").length,
        },
      };
    }),

  // ============================================================================
  // 시정 조치 이력 보고서
  // ============================================================================

  // 시정 조치 이력 보고서 데이터 조회
  getCorrectiveActionReport: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        batchId: z.number().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // 배치별 또는 전체 시정 조치 조회
      const actions = input.batchId
        ? await correctiveActionDb.getCorrectiveActionRequestsByBatch(input.batchId, ctx.tenantId)
        : await correctiveActionDb.getCorrectiveActionRequestsByStatus("closed", ctx.tenantId);

      // 날짜 필터링
      const filteredActions = actions.filter((action: any) => {
        const occurredAt = new Date(action.occurredAt);
        const start = new Date(input.startDate);
        const end = new Date(input.endDate);
        return occurredAt >= start && occurredAt <= end;
      });

      // 통계 계산
      const totalActions = filteredActions.length;
      const effectiveActions = filteredActions.filter((a: any) => a.isEffective === 1).length;
      const avgResolutionTime = filteredActions.reduce((sum: number, action: any) => {
        if (action.actionCompletedDate && action.occurredAt) {
          const completed = new Date(action.actionCompletedDate);
          const occurred = new Date(action.occurredAt);
          return sum + (completed.getTime() - occurred.getTime()) / (1000 * 60 * 60 * 24);
        }
        return sum;
      }, 0) / totalActions;

      return {
        actions: filteredActions,
        statistics: {
          totalActions,
          effectiveActions,
          effectivenessRate: totalActions > 0 ? (effectiveActions / totalActions) * 100 : 0,
          avgResolutionTime: Math.round(avgResolutionTime * 10) / 10,
        },
      };
    }),

  // ============================================================================
  // 교육 이수 증명서
  // ============================================================================

  // 교육 이수 증명서 데이터 조회
  getTrainingCertificate: tenantRequiredProcedure
    .input(z.object({ participantId: z.number() }))
    .query(async ({ input, ctx }) => {
      const participant = await trainingDb.getTrainingParticipantById(input.participantId, ctx.tenantId);
      
      if (!participant) {
        throw new Error("참가자 정보를 찾을 수 없습니다.");
      }

      // 일정 정보 조회
      const schedule = await trainingDb.getTrainingScheduleById(participant.scheduleId, ctx.tenantId);
      
      if (!schedule) {
        throw new Error("교육 일정 정보를 찾을 수 없습니다.");
      }

      // 과정 정보 조회
      const course = await trainingDb.getTrainingCourseById(schedule.courseId, ctx.tenantId);
      
      if (!course) {
        throw new Error("교육 과정 정보를 찾을 수 없습니다.");
      }

      return {
        participant,
        schedule,
        course,
        certificateInfo: {
          certificateNumber: participant.certificateNumber,
          issuedDate: todayKST(),
          expiryDate: participant.expiryDate,
        },
      };
    }),

  // 사용자별 교육 이수 현황 보고서
  getUserTrainingReport: tenantRequiredProcedure
    .input(z.object({ userId: z.number() }))
    .query(async ({ input, ctx }) => {
      const participants = await trainingDb.getTrainingParticipantsByUser(input.userId, ctx.tenantId);

      // 통계 계산
      const totalTrainings = participants.length;
      const completedTrainings = participants.filter((p) => p.passed === 1).length;
      const upcomingTrainings = participants.filter((p) => p.attendanceStatus === "registered").length;

      // 만료 예정 교육 (30일 이내)
      const expiringTrainings = participants.filter((p) => {
        if (!p.expiryDate) return false;
        const expiryDate = new Date(p.expiryDate);
        const today = new Date();
        const daysUntilExpiry = (expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
      });

      return {
        participants,
        statistics: {
          totalTrainings,
          completedTrainings,
          upcomingTrainings,
          expiringCount: expiringTrainings.length,
          completionRate: totalTrainings > 0 ? (completedTrainings / totalTrainings) * 100 : 0,
        },
      };
    }),
});
