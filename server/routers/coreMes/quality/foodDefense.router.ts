/**
 * Food Defense (TACCP) 라우터 — Layer 2 core-mes/quality (Phase Y-7)
 *
 * FSSC 22000 v6 §2.5.3 Food Defense / PAS 96 TACCP.
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createFoodDefense,
  getFoodDefenseById,
  listFoodDefense,
  addCountermeasure,
  setJustification,
  transitionFoodDefenseStatus,
  getFoodDefenseStats,
} from "../../../db/coreMes/quality/foodDefense";

const INDUSTRY = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);
const THREAT_CATEGORY = z.enum([
  "tampering", "intentional_contamination", "sabotage",
  "cyber", "insider", "supply_chain", "other",
]);
const FOOD_DEFENSE_STATUS = z.enum([
  "draft", "under_review", "mitigated", "accepted", "archived",
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
      message: "승인/종결 권한 없음 (admin 이상)",
    });
  }
}

export const foodDefenseRouter = router({
  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: FOOD_DEFENSE_STATUS.optional(),
        category: THREAT_CATEGORY.optional(),
        minResidualScore: z.number().int().min(1).max(25).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listFoodDefense(Number(ctx.tenantId), input.industry, {
        status: input.status,
        category: input.category,
        minResidualScore: input.minResidualScore,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ industry: INDUSTRY, id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const r = await getFoodDefenseById(
        Number(ctx.tenantId),
        input.industry,
        input.id,
      );
      if (!r) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Food Defense 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return r;
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        title: z.string().min(1).max(255),
        description: z.string().min(1),
        category: THREAT_CATEGORY,
        targetPoint: z.string().min(1).max(255),
        likelihood: z.number().int().min(1).max(5),
        impact: z.number().int().min(1).max(5),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      return createFoodDefense({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        title: input.title,
        description: input.description,
        category: input.category,
        targetPoint: input.targetPoint,
        likelihood: input.likelihood,
        impact: input.impact,
        assessedBy: ctx.user?.id ? Number(ctx.user.id) : undefined,
        industryMetadata: input.industryMetadata ?? null,
      });
    }),

  /** 대응조치 추가 — residualScore 자동 재계산. */
  addCountermeasure: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        description: z.string().min(1),
        assigneeId: z.number().int().positive().nullable().optional(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        residualLikelihood: z.number().int().min(1).max(5),
        residualImpact: z.number().int().min(1).max(5),
        correctiveActionId: z.number().int().positive().nullable().optional(),
        completed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await addCountermeasure({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          countermeasure: {
            description: input.description,
            assigneeId: input.assigneeId ?? null,
            dueDate: input.dueDate ?? null,
            residualLikelihood: input.residualLikelihood,
            residualImpact: input.residualImpact,
            correctiveActionId: input.correctiveActionId ?? null,
            completed: input.completed ?? false,
          },
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** 정당화 입력 — accepted 전이 전에 필요. */
  setJustification: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        justification: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setJustification({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          justification: input.justification,
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
        toStatus: FOOD_DEFENSE_STATUS,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role;
      if (
        input.toStatus === "mitigated" ||
        input.toStatus === "accepted" ||
        input.toStatus === "archived"
      ) {
        requireApproveRole(role);
      } else {
        requireWriteRole(role);
      }
      try {
        await transitionFoodDefenseStatus({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          toStatus: input.toStatus,
          approvedBy:
            input.toStatus === "mitigated" || input.toStatus === "accepted"
              ? Number(ctx.user?.id)
              : undefined,
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
    return getFoodDefenseStats(Number(ctx.tenantId));
  }),
});
