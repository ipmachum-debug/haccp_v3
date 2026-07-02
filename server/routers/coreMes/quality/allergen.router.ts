/**
 * Allergen Management (알레르겐 관리) 라우터 — Layer 2 core-mes/quality (Phase Y-11)
 *
 * 식약처 알레르기 유발물질 표시기준 / FSSC 22000 / Codex CXC 80-2020.
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createAllergen,
  getAllergenById,
  listAllergen,
  updateAllergens,
  addControlMeasure,
  transitionAllergenStatus,
  getAllergenStats,
} from "../../../db/coreMes/quality/allergen";
import { KOREAN_ALLERGENS, buildLabelingStatement } from "../../../core-mes/quality/allergen";

const INDUSTRY = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);
const SUBJECT_TYPE = z.enum(["product", "material"]);
const ALLERGEN_STATUS = z.enum(["draft", "under_review", "approved", "archived"]);

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

export const allergenRouter = router({
  /** 알레르겐 기준 카탈로그 (식약처 표시대상) — 단일 source. */
  catalog: tenantRequiredProcedure.query(() => {
    return KOREAN_ALLERGENS.map((a) => ({ code: a.code, label: a.label }));
  }),

  /** 표시문구 미리보기 (저장 없이 생성). */
  previewLabeling: tenantRequiredProcedure
    .input(
      z.object({
        presentAllergens: z.array(z.string()).default([]),
        crossContactAllergens: z.array(z.string()).default([]),
      }),
    )
    .query(({ input }) => {
      return { statement: buildLabelingStatement(input.presentAllergens, input.crossContactAllergens) };
    }),

  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: ALLERGEN_STATUS.optional(),
        subjectType: SUBJECT_TYPE.optional(),
        allergenCode: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listAllergen(Number(ctx.tenantId), input.industry, {
        status: input.status,
        subjectType: input.subjectType,
        allergenCode: input.allergenCode,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ industry: INDUSTRY, id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const r = await getAllergenById(
        Number(ctx.tenantId),
        input.industry,
        input.id,
      );
      if (!r) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Allergen 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return r;
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        title: z.string().min(1).max(255),
        subjectType: SUBJECT_TYPE,
        subjectName: z.string().min(1).max(255),
        presentAllergens: z.array(z.string()).default([]),
        crossContactAllergens: z.array(z.string()).default([]),
        labelingStatement: z.string().nullable().optional(),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        return await createAllergen({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          title: input.title,
          subjectType: input.subjectType,
          subjectName: input.subjectName,
          presentAllergens: input.presentAllergens,
          crossContactAllergens: input.crossContactAllergens,
          labelingStatement: input.labelingStatement ?? null,
          assessedBy: ctx.user?.id ? Number(ctx.user.id) : undefined,
          industryMetadata: input.industryMetadata ?? null,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** 알레르겐 목록/표시문구 수정. */
  updateAllergens: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        presentAllergens: z.array(z.string()).optional(),
        crossContactAllergens: z.array(z.string()).optional(),
        labelingStatement: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await updateAllergens({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          presentAllergens: input.presentAllergens,
          crossContactAllergens: input.crossContactAllergens,
          labelingStatement: input.labelingStatement,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** 교차오염 통제수단 추가. */
  addControlMeasure: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        description: z.string().min(1),
        assigneeId: z.number().int().positive().nullable().optional(),
        dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        completed: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await addControlMeasure({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          controlMeasure: {
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
        toStatus: ALLERGEN_STATUS,
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
        await transitionAllergenStatus({
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
    return getAllergenStats(Number(ctx.tenantId));
  }),
});
