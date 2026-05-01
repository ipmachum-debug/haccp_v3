/**
 * Training 라우터 — Layer 2 core-mes/quality (Phase Y-3)
 *
 * 권한:
 *   - 조회: super_admin / admin / inspector / monitor
 *   - 등록 / 실시일 / 이수자 / 효과성 / 일부 전이: inspector+
 *   - completed (승인) / archived (종결): admin+
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createTraining,
  getTrainingById,
  listTrainings,
  setTrainingActualDate,
  upsertTrainingAttendee,
  removeTrainingAttendee,
  setTrainingEffectiveness,
  transitionTrainingStatus,
  getTrainingStats,
} from "../../../db/coreMes/quality/training";

const INDUSTRY = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);
const TRAINING_TYPE = z.enum(["internal", "external", "on_the_job", "regulatory"]);
const TRAINING_STATUS = z.enum([
  "planned", "scheduled", "in_progress", "completed", "archived", "cancelled",
]);
const TRAINER_TYPE = z.enum(["internal", "external"]);
const ATTENDANCE_STATUS = z.enum([
  "registered", "attended", "passed", "failed", "absent",
]);

function requireWriteRole(role?: string) {
  if (!role || !["super_admin", "admin", "inspector"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "쓰기 권한 없음" });
  }
}
function requireApproveRole(role?: string) {
  if (!role || !["super_admin", "admin"].includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "승인 / 종결 권한 없음 (admin 이상)",
    });
  }
}

export const trainingRouter = router({
  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: TRAINING_STATUS.optional(),
        type: TRAINING_TYPE.optional(),
        trainerUserId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listTrainings(Number(ctx.tenantId), input.industry, {
        status: input.status,
        type: input.type,
        trainerUserId: input.trainerUserId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ industry: INDUSTRY, id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const t = await getTrainingById(
        Number(ctx.tenantId),
        input.industry,
        input.id,
      );
      if (!t) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Training 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return t;
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        type: TRAINING_TYPE,
        title: z.string().min(1).max(255),
        subject: z.string().min(1).max(255),
        description: z.string().min(1),
        trainerName: z.string().min(1).max(100),
        trainerType: TRAINER_TYPE,
        trainerUserId: z.number().int().positive().nullable().optional(),
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        durationMinutes: z.number().int().min(1).max(10080).optional(),
        materials: z
          .array(
            z.object({
              title: z.string().min(1),
              url: z.string().url(),
            }),
          )
          .optional(),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      return createTraining({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        type: input.type,
        title: input.title,
        subject: input.subject,
        description: input.description,
        trainerName: input.trainerName,
        trainerType: input.trainerType,
        trainerUserId: input.trainerUserId ?? null,
        scheduledDate: input.scheduledDate,
        durationMinutes: input.durationMinutes,
        materials: input.materials,
        industryMetadata: input.industryMetadata ?? null,
      });
    }),

  setActualDate: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        actualDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setTrainingActualDate({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          actualDate: input.actualDate,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** 이수자 추가/수정 — userId 동일 시 갱신, 없으면 추가. */
  upsertAttendee: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        userId: z.number().int().positive(),
        name: z.string().min(1),
        status: ATTENDANCE_STATUS,
        score: z.number().min(0).max(100).nullable().optional(),
        certificateUrl: z.string().url().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await upsertTrainingAttendee({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          attendee: {
            userId: input.userId,
            name: input.name,
            status: input.status,
            score: input.score ?? null,
            certificateUrl: input.certificateUrl ?? null,
          },
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  removeAttendee: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        userId: z.number().int().positive(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await removeTrainingAttendee({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          userId: input.userId,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  setEffectiveness: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        effectivenessAssessment: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setTrainingEffectiveness({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          effectivenessAssessment: input.effectivenessAssessment,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** 상태 전이 — completed/archived 는 admin+. */
  transition: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        toStatus: TRAINING_STATUS,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role;
      if (input.toStatus === "completed" || input.toStatus === "archived") {
        requireApproveRole(role);
      } else {
        requireWriteRole(role);
      }
      try {
        await transitionTrainingStatus({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          toStatus: input.toStatus,
          approvedBy:
            input.toStatus === "completed" ? Number(ctx.user?.id) : undefined,
        });
        return { ok: true, status: input.toStatus };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  stats: tenantRequiredProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin" && ctx.user?.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "통계 조회 권한 없음" });
    }
    return getTrainingStats(Number(ctx.tenantId));
  }),
});
