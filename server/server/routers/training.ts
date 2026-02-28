import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import * as trainingDb from "../db/training";

/**
 * 교육 훈련 관리 시스템 라우터
 */

export const trainingRouter = router({
  // ============================================================================
  // 교육 과정 관리
  // ============================================================================

  // 교육 과정 생성
  createCourse: protectedProcedure
    .input(
      z.object({
        courseCode: z.string(),
        courseName: z.string(),
        category: z.enum([
          "haccp_basic",
          "haccp_advanced",
          "hygiene",
          "safety",
          "quality",
          "equipment",
          "regulation",
          "other",
        ]),
        description: z.string().optional(),
        objectives: z.string().optional(),
        duration: z.number(),
        isMandatory: z.number().optional(),
        targetRoles: z.string().optional(),
        validityPeriod: z.number().optional(),
        materials: z.string().optional(),
        hasAssessment: z.number().optional(),
        passingScore: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await trainingDb.createTrainingCourse({
        ...input,
        createdBy: ctx.user.id,
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  // 교육 과정 상세 조회
  getCourse: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return trainingDb.getTrainingCourseById(input.id);
    }),

  // 전체 교육 과정 목록
  listCourses: protectedProcedure.query(async ({ ctx }) => {
    return trainingDb.getAllTrainingCourses(ctx.user.tenantId);
  }),

  // 카테고리별 교육 과정 목록
  listCoursesByCategory: protectedProcedure
    .input(
      z.object({
        category: z.enum([
          "haccp_basic",
          "haccp_advanced",
          "hygiene",
          "safety",
          "quality",
          "equipment",
          "regulation",
          "other",
        ]),
      })
    )
    .query(async ({ input, ctx }) => {
      return trainingDb.getTrainingCoursesByCategory(input.category, ctx.user.tenantId);
    }),

  // 필수 교육 과정 목록
  listMandatoryCourses: protectedProcedure.query(async ({ ctx }) => {
    return trainingDb.getMandatoryTrainingCourses(ctx.user.tenantId);
  }),

  // 교육 과정 수정
  updateCourse: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        courseName: z.string().optional(),
        category: z
          .enum([
            "haccp_basic",
            "haccp_advanced",
            "hygiene",
            "safety",
            "quality",
            "equipment",
            "regulation",
            "other",
          ])
          .optional(),
        description: z.string().optional(),
        objectives: z.string().optional(),
        duration: z.number().optional(),
        isMandatory: z.number().optional(),
        targetRoles: z.string().optional(),
        validityPeriod: z.number().optional(),
        materials: z.string().optional(),
        hasAssessment: z.number().optional(),
        passingScore: z.string().optional(),
        status: z.enum(["active", "inactive", "archived"]).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await trainingDb.updateTrainingCourse(id, data);
      return { success: true };
    }),

  // 교육 과정 삭제 (아카이브)
  deleteCourse: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await trainingDb.deleteTrainingCourse(input.id);
      return { success: true };
    }),

  // ============================================================================
  // 교육 일정 관리
  // ============================================================================

  // 교육 일정 생성
  createSchedule: protectedProcedure
    .input(
      z.object({
        courseId: z.number(),
        siteId: z.number(),
        scheduledDate: z.string(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        location: z.string().optional(),
        trainerId: z.number().optional(),
        trainerName: z.string().optional(),
        maxParticipants: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await trainingDb.createTrainingSchedule({
        ...input,
        createdBy: ctx.user.id,
        tenantId: ctx.user.tenantId,
      });
      return { id };
    }),

  // 교육 일정 상세 조회
  getSchedule: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return trainingDb.getTrainingScheduleById(input.id);
    }),

  // 과정별 교육 일정 목록
  listSchedulesByCourse: protectedProcedure
    .input(z.object({ courseId: z.number() }))
    .query(async ({ input }) => {
      return trainingDb.getTrainingSchedulesByCourse(input.courseId);
    }),

  // 예정된 교육 일정 목록
  listUpcomingSchedules: protectedProcedure
    .input(z.object({ siteId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      return trainingDb.getUpcomingTrainingSchedules(input.siteId, ctx.user.tenantId);
    }),

  // 교육 일정 수정
  updateSchedule: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        scheduledDate: z.string().optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        location: z.string().optional(),
        trainerId: z.number().optional(),
        trainerName: z.string().optional(),
        maxParticipants: z.number().optional(),
        registeredCount: z.number().optional(),
        status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await trainingDb.updateTrainingSchedule(id, data);
      return { success: true };
    }),

  // 교육 일정 삭제
  deleteSchedule: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await trainingDb.deleteTrainingSchedule(input.id);
      return { success: true };
    }),

  // ============================================================================
  // 교육 참가자 관리
  // ============================================================================

  // 교육 참가 등록
  registerParticipant: protectedProcedure
    .input(
      z.object({
        scheduleId: z.number(),
        userId: z.number().optional(), // 없으면 현재 사용자
      })
    )
    .mutation(async ({ input, ctx }) => {
      const id = await trainingDb.registerTrainingParticipant({
        scheduleId: input.scheduleId,
        userId: input.userId || ctx.user.id,
      });
      return { id };
    }),

  // 참가자 정보 조회
  getParticipant: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      return trainingDb.getTrainingParticipantById(input.id);
    }),

  // 일정별 참가자 목록
  listParticipantsBySchedule: protectedProcedure
    .input(z.object({ scheduleId: z.number() }))
    .query(async ({ input }) => {
      return trainingDb.getTrainingParticipantsBySchedule(input.scheduleId);
    }),

  // 사용자별 교육 이력
  listParticipantsByUser: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      return trainingDb.getTrainingParticipantsByUser(input.userId || ctx.user.id);
    }),

  // 출석 처리
  recordAttendance: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        attendanceStatus: z.enum(["registered", "attended", "absent", "excused"]),
      })
    )
    .mutation(async ({ input }) => {
      await trainingDb.updateTrainingParticipant(input.id, {
        attendanceStatus: input.attendanceStatus,
      });
      return { success: true };
    }),

  // 평가 점수 등록
  recordAssessment: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        assessmentScore: z.number(),
        passed: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await trainingDb.updateTrainingParticipant(input.id, {
        assessmentScore: input.assessmentScore,
        passed: input.passed,
      });
      return { success: true };
    }),

  // 수료증 발급
  issueCertificate: protectedProcedure
    .input(
      z.object({
        participantId: z.number(),
        certificateUrl: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await trainingDb.issueCertificate(
        input.participantId,
        input.certificateUrl
      );
      return result;
    }),

  // 참가자 정보 수정
  updateParticipant: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        attendanceStatus: z.enum(["registered", "attended", "absent", "excused"]).optional(),
        assessmentScore: z.number().optional(),
        passed: z.number().optional(),
        certificateIssued: z.number().optional(),
        certificateNumber: z.string().optional(),
        certificateUrl: z.string().optional(),
        expiryDate: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await trainingDb.updateTrainingParticipant(id, data);
      return { success: true };
    }),

  // 참가 취소
  cancelParticipant: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await trainingDb.deleteTrainingParticipant(input.id);
      return { success: true };
    }),

  // ============================================================================
  // 교육 만료 알림
  // ============================================================================

  // 사용자별 알림 목록
  listRemindersByUser: protectedProcedure
    .input(z.object({ userId: z.number().optional() }))
    .query(async ({ input, ctx }) => {
      return trainingDb.getTrainingRemindersByUser(input.userId || ctx.user.id);
    }),

  // 발송 대기 중인 알림 목록
  listPendingReminders: protectedProcedure.query(async ({ ctx }) => {
    return trainingDb.getPendingTrainingReminders(ctx.user.tenantId);
  }),

  // 알림 발송 완료 처리
  markReminderAsSent: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await trainingDb.markTrainingReminderAsSent(input.id);
      return { success: true };
    }),
});
