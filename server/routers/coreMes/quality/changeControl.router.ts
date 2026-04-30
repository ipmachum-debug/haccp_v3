/**
 * Change Control 라우터 — Layer 2 core-mes/quality
 *
 * ============================================================================
 * Phase Y-2-0-b — Cross-cutting 도메인의 첫 라우터 (ADR-003 view filter 패턴 정립).
 *
 * 의존성 (.dependency-cruiser.cjs):
 *   - core-mes/quality 가 industry/* 무참조 (ADR-002)
 *   - 모든 endpoint 가 industry 컨텍스트 (z.enum) 명시 — view filter 강제
 *
 * tenant 격리:
 *   - 모든 endpoint 가 tenantRequiredProcedure
 *   - DB 어댑터 (server/db/coreMes/quality/changeControl.ts) 가 (tenantId, industry)
 *     양쪽 검증 — cross-industry 접근 차단
 *
 * 권한:
 *   - super_admin, admin, inspector — 조회/등록/영향평가
 *   - super_admin, admin            — 승인 (approve) / 종결 (close)
 *   - 신청자 본인 + admin           — 취소 (cancel)
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
  createChangeControl,
  getChangeControlById,
  listChangeControls,
  transitionChangeControlStatus,
  updateChangeControlImpact,
  getChangeControlStats,
} from "../../../db/coreMes/quality/changeControl";

const INDUSTRY = z.enum([
  "food",
  "cosmetic",
  "pharmaceutical",
  "health-functional",
  "medical-device",
  "general-manufacturing",
]);

const CHANGE_TYPE = z.enum([
  "process",
  "specification",
  "formulation",
  "equipment",
  "supplier",
  "label",
  "document",
  "system",
  "other",
]);

const IMPACT = z.enum(["critical", "major", "minor"]);

const STATUS = z.enum([
  "draft",
  "submitted",
  "evaluating",
  "approved",
  "implementing",
  "verifying",
  "closed",
  "rejected",
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

export const changeControlRouter = router({
  /**
   * 목록 조회 — industry view filter 강제.
   * status 옵션 필터, 최대 50건, offset 페이징.
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
      return listChangeControls(Number(ctx.tenantId), input.industry, {
        status: input.status,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  /**
   * 단건 조회 — (tenantId, industry, id) 검증.
   * cross-industry 접근 시 null 반환.
   */
  getById: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cc = await getChangeControlById(
        Number(ctx.tenantId),
        input.industry,
        input.id,
      );
      if (!cc) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "ChangeControl 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return cc;
    }),

  /**
   * 신규 등록 — status='draft' 시작, code 자동채번 (CC-YYYY-NNNN).
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        title: z.string().min(1).max(255),
        description: z.string().min(1),
        changeType: CHANGE_TYPE,
        impact: IMPACT.optional(),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "로그인 필요" });
      }
      return createChangeControl({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        title: input.title,
        description: input.description,
        changeType: input.changeType,
        impact: input.impact,
        requestedBy: Number(ctx.user.id),
        industryMetadata: input.industryMetadata ?? null,
      });
    }),

  /**
   * 영향평가 결과 갱신 — impact 만 변경.
   * 종결 (closed/rejected/cancelled) 상태에서는 거부.
   */
  setImpact: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        impact: IMPACT,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await updateChangeControlImpact({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          impact: input.impact,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /**
   * 상태 전이 — canTransition 검증 강제.
   *   submitted (신청 완료) / evaluating (영향 평가 중) / implementing (실행) /
   *   verifying (검증) / cancelled (취소) — write role
   *   approved (승인) / closed (종결) — admin role
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
      if (input.toStatus === "approved" || input.toStatus === "closed") {
        requireApproveRole(role);
      } else {
        requireWriteRole(role);
      }
      try {
        await transitionChangeControlStatus({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          toStatus: input.toStatus,
          approvedBy:
            input.toStatus === "approved" ? Number(ctx.user?.id) : undefined,
        });
        return { ok: true, status: input.toStatus };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /**
   * Cross-industry 통계 — tenant 내 industry × status 카운트.
   *
   * 운영 대시보드 (식품 + 화장품 + 의약품 한 화면) 용.
   * admin / super_admin 전용.
   */
  stats: tenantRequiredProcedure.query(async ({ ctx }) => {
    if (
      ctx.user?.role !== "admin" &&
      ctx.user?.role !== "super_admin"
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "통계 조회 권한 없음",
      });
    }
    return getChangeControlStats(Number(ctx.tenantId));
  }),
});
