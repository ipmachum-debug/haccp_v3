/**
 * Food Safety Culture (식품안전문화) 라우터 — Layer 2 core-mes/quality (Phase Y-9)
 *
 * FSSC 22000 v6 §2.5.1 Food Safety and Quality Culture / GFSI.
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createCulture,
  getCultureById,
  listCulture,
  addImprovementAction,
  transitionCultureStatus,
  getCultureStats,
} from "../../../db/coreMes/quality/foodSafetyCulture";

const INDUSTRY = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);
const METHOD = z.enum(["survey", "interview", "observation", "mixed"]);
const CULTURE_STATUS = z.enum(["draft", "under_review", "approved", "archived"]);
const DIMENSION = z.enum([
  "leadership", "communication", "awareness",
  "accountability", "resources", "continuousImprovement",
]);
const score1to5 = z.number().int().min(1).max(5);
const DIMENSION_SCORES = z.object({
  leadership: score1to5,
  communication: score1to5,
  awareness: score1to5,
  accountability: score1to5,
  resources: score1to5,
  continuousImprovement: score1to5,
});

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

export const foodSafetyCultureRouter = router({
  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: CULTURE_STATUS.optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listCulture(Number(ctx.tenantId), input.industry, {
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ industry: INDUSTRY, id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const r = await getCultureById(
        Number(ctx.tenantId),
        input.industry,
        input.id,
      );
      if (!r) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Food Safety Culture 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return r;
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        title: z.string().min(1).max(255),
        assessmentPeriod: z.string().min(1).max(100),
        method: METHOD,
        participantCount: z.number().int().min(0),
        dimensionScores: DIMENSION_SCORES,
        summary: z.string().nullable().optional(),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      return createCulture({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        title: input.title,
        assessmentPeriod: input.assessmentPeriod,
        method: input.method,
        participantCount: input.participantCount,
        dimensionScores: input.dimensionScores,
        summary: input.summary ?? null,
        assessedBy: ctx.user?.id ? Number(ctx.user.id) : undefined,
        industryMetadata: input.industryMetadata ?? null,
      });
    }),

  /** 개선활동 추가. */
  addImprovementAction: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        dimension: DIMENSION,
        description: z.string().min(1),
        assigneeId: z.number().int().positive().nullable().optional(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        completed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await addImprovementAction({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          action: {
            dimension: input.dimension,
            description: input.description,
            assigneeId: input.assigneeId ?? null,
            dueDate: input.dueDate ?? null,
            completed: input.completed ?? false,
          },
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
        toStatus: CULTURE_STATUS,
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
        await transitionCultureStatus({
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
    return getCultureStats(Number(ctx.tenantId));
  }),
});
