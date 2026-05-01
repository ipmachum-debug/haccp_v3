/**
 * Supplier (AVL) 라우터 — Layer 2 core-mes/quality (Phase Y-5)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createSupplier,
  getSupplierById,
  listSuppliers,
  setSupplierEvaluation,
  transitionSupplierStatus,
  getSupplierStats,
} from "../../../db/coreMes/quality/supplier";

const INDUSTRY = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);
const SUPPLIER_CATEGORY = z.enum([
  "raw_material", "packaging", "equipment", "service", "other",
]);
const SUPPLIER_STATUS = z.enum([
  "under_evaluation", "approved", "suspended", "disqualified", "archived",
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

export const supplierRouter = router({
  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: SUPPLIER_STATUS.optional(),
        category: SUPPLIER_CATEGORY.optional(),
        dueBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listSuppliers(Number(ctx.tenantId), input.industry, {
        status: input.status,
        category: input.category,
        dueBefore: input.dueBefore,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ industry: INDUSTRY, id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const s = await getSupplierById(
        Number(ctx.tenantId),
        input.industry,
        input.id,
      );
      if (!s) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Supplier 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return s;
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        name: z.string().min(1).max(255),
        category: SUPPLIER_CATEGORY,
        contactPerson: z.string().min(1).max(100),
        email: z.string().email().max(255),
        phone: z.string().min(1).max(50),
        bizNumber: z.string().max(50).nullable().optional(),
        address: z.string().max(500).nullable().optional(),
        reEvaluationIntervalMonths: z.number().int().min(1).max(120).optional(),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      return createSupplier({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        name: input.name,
        category: input.category,
        contactPerson: input.contactPerson,
        email: input.email,
        phone: input.phone,
        bizNumber: input.bizNumber ?? null,
        address: input.address ?? null,
        reEvaluationIntervalMonths: input.reEvaluationIntervalMonths,
        industryMetadata: input.industryMetadata ?? null,
      });
    }),

  /** 평가 점수 + 비고 입력. */
  setEvaluation: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        evaluationScore: z.number().int().min(0).max(100),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setSupplierEvaluation({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          evaluationScore: input.evaluationScore,
          notes: input.notes,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** 상태 전이 — approved 진입 시 approvedDate + nextEvaluationDate 자동. */
  transition: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        toStatus: SUPPLIER_STATUS,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role;
      if (
        input.toStatus === "approved" ||
        input.toStatus === "disqualified" ||
        input.toStatus === "archived"
      ) {
        requireApproveRole(role);
      } else {
        requireWriteRole(role);
      }
      try {
        await transitionSupplierStatus({
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

  stats: tenantRequiredProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin" && ctx.user?.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "통계 조회 권한 없음" });
    }
    return getSupplierStats(Number(ctx.tenantId));
  }),
});
