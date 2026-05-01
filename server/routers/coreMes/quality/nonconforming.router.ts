/**
 * Nonconforming 라우터 — Layer 2 core-mes/quality
 *
 * ============================================================================
 * Phase Y-2-1-b — Cross-cutting 도메인 (Y-2-0-b Change Control 패턴 그대로).
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - core-mes/quality 가 industry/* 무참조 (ADR-002)
 *   - 모든 endpoint 가 industry 컨텍스트 (z.enum) 명시 — view filter 강제
 *
 * tenant 격리:
 *   - 모든 endpoint 가 tenantRequiredProcedure
 *   - DB 어댑터 (server/db/coreMes/quality/nonconforming.ts) 가 (tenantId, industry)
 *     양쪽 검증 — cross-industry 접근 차단
 *
 * 권한:
 *   - 조회: super_admin / admin / inspector / monitor
 *   - 등록 / 조사 / 처리 / CAPA 연계 / 전이: super_admin / admin / inspector
 *   - disposed (종결 직전 승인) / closed (최종 종결): super_admin / admin
 *
 * 상태 전이:
 *   - DB 어댑터의 canTransition() 검증 강제
 *   - 잘못된 전이 시 TRPCError BAD_REQUEST
 * ============================================================================
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createNonconforming,
  getNonconformingById,
  listNonconformings,
  setNonconformingRootCause,
  setNonconformingDisposal,
  linkNonconformingToCorrectiveAction,
  transitionNonconformingStatus,
  getNonconformingStats,
} from "../../../db/coreMes/quality/nonconforming";

const INDUSTRY = z.enum([
  "food",
  "cosmetic",
  "pharmaceutical",
  "health-functional",
  "medical-device",
  "general-manufacturing",
]);

const DETECTION_SOURCE = z.enum([
  "incoming_inspection",
  "in_process_inspection",
  "final_inspection",
  "customer_complaint",
  "internal_audit",
  "ccp_monitoring",
  "stability_test",
  "other",
]);

const NONCONFORMITY_TYPE = z.enum([
  "physical",
  "chemical",
  "biological",
  "sensory",
  "packaging",
  "labeling",
  "specification",
  "other",
]);

const CAUSE_CATEGORY = z.enum([
  "material",
  "process",
  "equipment",
  "human_error",
  "environment",
  "method",
  "other",
]);

const DISPOSAL_METHOD = z.enum([
  "pending",
  "rework",
  "downgrade",
  "alternative_use",
  "disposal",
  "return_to_supplier",
  "customer_return",
]);

const STATUS = z.enum([
  "detected",
  "under_investigation",
  "pending_disposal",
  "disposed",
  "closed",
  "cancelled",
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

export const nonconformingRouter = router({
  /**
   * 목록 조회 — industry view filter 강제.
   */
  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: STATUS.optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listNonconformings(Number(ctx.tenantId), input.industry, {
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * 단건 조회 — cross-industry 접근 시 NOT_FOUND.
   */
  getById: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const nc = await getNonconformingById(
        Number(ctx.tenantId),
        input.industry,
        input.id,
      );
      if (!nc) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Nonconforming 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return nc;
    }),

  /**
   * 신규 등록 — status='detected' 시작 + code 자동채번 (NCR-YYYY-NNNN).
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        detectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        detectionSource: DETECTION_SOURCE,
        nonconformityType: NONCONFORMITY_TYPE,
        description: z.string().min(1),
        itemName: z.string().min(1).max(255),
        lotNumber: z.string().max(100).optional(),
        quantity: z.number().nonnegative(),
        unit: z.string().min(1).max(20),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인 필요" });
      }
      return createNonconforming({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        detectionDate: input.detectionDate,
        detectionSource: input.detectionSource,
        nonconformityType: input.nonconformityType,
        description: input.description,
        itemName: input.itemName,
        lotNumber: input.lotNumber ?? null,
        quantity: input.quantity,
        unit: input.unit,
        detectedBy: Number(ctx.user.id),
        industryMetadata: input.industryMetadata ?? null,
      });
    }),

  /**
   * 근본 원인 분석 결과 입력 (조사 단계).
   * 종결 (closed/cancelled) 상태에서는 거부.
   */
  setRootCause: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        rootCause: z.string().min(1),
        causeCategory: CAUSE_CATEGORY,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setNonconformingRootCause({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          rootCause: input.rootCause,
          causeCategory: input.causeCategory,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /**
   * 처리 결정 입력 (disposal 단계).
   * disposed 직전 (pending_disposal 상태) 에서 일반적으로 호출.
   */
  setDisposal: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        disposalMethod: DISPOSAL_METHOD,
        disposalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        disposalDetails: z.string().optional(),
        disposalCost: z.number().nonnegative().optional(),
        preventiveActions: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setNonconformingDisposal({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          disposalMethod: input.disposalMethod,
          disposalDate: input.disposalDate,
          disposalDetails: input.disposalDetails,
          disposalCost: input.disposalCost,
          preventiveActions: input.preventiveActions,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /**
   * CAPA 연계 — Y-2-2 (CAPA core-mes 추출) 머지 후 활성.
   * 본 endpoint 는 단순 FK 갱신만. CAPA 존재 검증은 향후 강화.
   * correctiveActionId=null 전달 시 연계 해제.
   */
  linkCorrectiveAction: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        correctiveActionId: z.number().int().positive().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await linkNonconformingToCorrectiveAction({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          correctiveActionId: input.correctiveActionId,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /**
   * 상태 전이 — canTransition 검증 강제.
   *   under_investigation / pending_disposal / cancelled — write role
   *   disposed (승인) / closed (종결) — admin role
   */
  transition: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        toStatus: STATUS,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role;
      if (input.toStatus === "disposed" || input.toStatus === "closed") {
        requireApproveRole(role);
      } else {
        requireWriteRole(role);
      }
      try {
        await transitionNonconformingStatus({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          toStatus: input.toStatus,
          approvedBy:
            input.toStatus === "disposed" ? Number(ctx.user?.id) : undefined,
        });
        return { ok: true, status: input.toStatus };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /**
   * Cross-industry 통계 — admin / super_admin 전용.
   */
  stats: tenantRequiredProcedure.query(async ({ ctx }) => {
    if (ctx.user?.role !== "admin" && ctx.user?.role !== "super_admin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "통계 조회 권한 없음",
      });
    }
    return getNonconformingStats(Number(ctx.tenantId));
  }),
});
