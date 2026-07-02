/**
 * Environmental Monitoring (환경 모니터링 EMP) 라우터 — Layer 2 core-mes/quality (Phase Y-12)
 *
 * FSSC 22000 / Codex — Zone 기반 병원균/지표균/ATP 모니터링.
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createEm,
  getEmById,
  listEm,
  setResult,
  transitionEmStatus,
  getEmStats,
} from "../../../db/coreMes/quality/environmentalMonitoring";

const INDUSTRY = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);
const ZONE = z.enum(["zone1", "zone2", "zone3", "zone4"]);
const TARGET = z.enum([
  "listeria", "salmonella", "e_coli", "coliform",
  "apc", "yeast_mold", "atp", "other",
]);
const METHOD = z.enum(["swab", "contact_plate", "air_settle", "water", "atp"]);
const RESULT = z.enum(["pass", "fail", "pending"]);
const EM_STATUS = z.enum(["draft", "under_review", "approved", "archived"]);

function requireWriteRole(role?: string) {
  if (!role || !["super_admin", "admin", "inspector"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "쓰기 권한 없음" });
  }
}
function requireApproveRole(role?: string) {
  if (!role || !["super_admin", "admin"].includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "승인/종결 권한 없음 (admin 이상)",
    });
  }
}

export const environmentalMonitoringRouter = router({
  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: EM_STATUS.optional(),
        zone: ZONE.optional(),
        target: TARGET.optional(),
        result: RESULT.optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listEm(Number(ctx.tenantId), input.industry, {
        status: input.status,
        zone: input.zone,
        target: input.target,
        result: input.result,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ industry: INDUSTRY, id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const r = await getEmById(Number(ctx.tenantId), input.industry, input.id);
      if (!r) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Environmental Monitoring 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return r;
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        samplingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        zone: ZONE,
        location: z.string().min(1).max(255),
        target: TARGET,
        method: METHOD,
        result: RESULT.optional(),
        resultValue: z.string().max(255).nullable().optional(),
        limitCriteria: z.string().max(255).nullable().optional(),
        correctiveAction: z.string().nullable().optional(),
        correctiveActionId: z.number().int().positive().nullable().optional(),
        notes: z.string().nullable().optional(),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      return createEm({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        samplingDate: input.samplingDate,
        zone: input.zone,
        location: input.location,
        target: input.target,
        method: input.method,
        result: input.result,
        resultValue: input.resultValue ?? null,
        limitCriteria: input.limitCriteria ?? null,
        correctiveAction: input.correctiveAction ?? null,
        correctiveActionId: input.correctiveActionId ?? null,
        notes: input.notes ?? null,
        assessedBy: ctx.user?.id ? Number(ctx.user.id) : undefined,
        industryMetadata: input.industryMetadata ?? null,
      });
    }),

  /** 결과/판정 입력 (배양 완료 후) + 부적합 시 시정조치. */
  setResult: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        result: RESULT,
        resultValue: z.string().max(255).nullable().optional(),
        correctiveAction: z.string().nullable().optional(),
        correctiveActionId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setResult({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          result: input.result,
          resultValue: input.resultValue,
          correctiveAction: input.correctiveAction,
          correctiveActionId: input.correctiveActionId,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  transition: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        toStatus: EM_STATUS,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role;
      if (input.toStatus === "approved" || input.toStatus === "archived") {
        requireApproveRole(role);
      } else {
        requireWriteRole(role);
      }
      try {
        await transitionEmStatus({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          toStatus: input.toStatus,
          approvedBy: input.toStatus === "approved" ? Number(ctx.user?.id) : undefined,
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
    return getEmStats(Number(ctx.tenantId));
  }),
});
