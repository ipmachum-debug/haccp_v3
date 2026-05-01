/**
 * CAPA 라우터 — Layer 2 core-mes/quality (Phase Y-2-2)
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - core-mes 가 industry/* 무참조 (ADR-002)
 *   - 모든 endpoint 가 industry 컨텍스트 명시 (view filter 강제)
 *
 * 권한:
 *   - 조회: super_admin / admin / inspector / monitor
 *   - 등록 / 실행 상세 / 효과성 / 일부 전이: inspector+
 *   - closed (종결): admin+
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createCorrectiveAction,
  getCorrectiveActionById,
  listCorrectiveActions,
  setCorrectiveActionExecution,
  setCorrectiveActionEffectiveness,
  transitionCorrectiveActionStatus,
  getCorrectiveActionStats,
} from "../../../db/coreMes/quality/correctiveAction";

const INDUSTRY = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);
const CAPA_TYPE = z.enum(["corrective", "preventive"]);
const CAPA_PRIORITY = z.enum(["critical", "high", "medium", "low"]);
const CAPA_STATUS = z.enum([
  "planned", "in_progress", "effectiveness_check", "closed", "cancelled",
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
      message: "종결 권한 없음 (admin 이상)",
    });
  }
}

export const correctiveActionRouter = router({
  /** 목록 조회 — industry view filter + 다중 필터. */
  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: CAPA_STATUS.optional(),
        type: CAPA_TYPE.optional(),
        assignedTo: z.number().int().positive().optional(),
        nonconformingId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listCorrectiveActions(Number(ctx.tenantId), input.industry, {
        status: input.status,
        type: input.type,
        assignedTo: input.assignedTo,
        nonconformingId: input.nonconformingId,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /** 단건 조회 — cross-industry 차단. */
  getById: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const ca = await getCorrectiveActionById(
        Number(ctx.tenantId),
        input.industry,
        input.id,
      );
      if (!ca) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "CorrectiveAction 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return ca;
    }),

  /** 신규 등록 — status='planned' + code 자동채번. */
  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        type: CAPA_TYPE,
        priority: CAPA_PRIORITY.optional(),
        title: z.string().min(1).max(255),
        description: z.string().min(1),
        nonconformingId: z.number().int().positive().nullable().optional(),
        assignedTo: z.number().int().positive(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        actionPlan: z.string().min(1),
        effectivenessCriteria: z.string().optional(),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      return createCorrectiveAction({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        type: input.type,
        priority: input.priority,
        title: input.title,
        description: input.description,
        nonconformingId: input.nonconformingId ?? null,
        assignedTo: input.assignedTo,
        dueDate: input.dueDate,
        actionPlan: input.actionPlan,
        effectivenessCriteria: input.effectivenessCriteria ?? null,
        industryMetadata: input.industryMetadata ?? null,
      });
    }),

  /** 실행 상세 입력 (in_progress 단계). */
  setExecution: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        executionDetails: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setCorrectiveActionExecution({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          executionDetails: input.executionDetails,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** 효과성 검증 결과 입력 (effectiveness_check 단계). */
  setEffectiveness: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        effectivenessResult: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인 필요" });
      }
      try {
        await setCorrectiveActionEffectiveness({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          effectivenessResult: input.effectivenessResult,
          verifiedBy: Number(ctx.user.id),
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** 상태 전이 — closed 는 admin 권한. */
  transition: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        toStatus: CAPA_STATUS,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role;
      if (input.toStatus === "closed") {
        requireApproveRole(role);
      } else {
        requireWriteRole(role);
      }
      try {
        await transitionCorrectiveActionStatus({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          toStatus: input.toStatus,
        });
        return { ok: true, status: input.toStatus };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** Cross-industry 통계 — admin 전용. */
  stats: tenantRequiredProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin" && ctx.user?.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "통계 조회 권한 없음" });
    }
    return getCorrectiveActionStats(Number(ctx.tenantId));
  }),
});
