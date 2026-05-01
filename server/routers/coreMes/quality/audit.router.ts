/**
 * Audit 라우터 — Layer 2 core-mes/quality (Phase Y-2-3)
 *
 * 권한:
 *   - 조회: super_admin / admin / inspector / monitor
 *   - 신규 / 실시일 / finding 추가 / 결론 / 일부 전이: inspector+
 *   - closed (보고서 승인): admin+
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createAudit,
  getAuditById,
  listAudits,
  setAuditActualDate,
  addAuditFinding,
  linkFindingToCorrectiveAction,
  setAuditConclusion,
  transitionAuditStatus,
  getAuditStats,
} from "../../../db/coreMes/quality/audit";

const INDUSTRY = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);
const AUDIT_TYPE = z.enum(["internal", "supplier", "external"]);
const AUDIT_STATUS = z.enum([
  "planned", "scheduled", "in_progress", "reporting", "closed", "cancelled",
]);
const FINDING_SEVERITY = z.enum(["critical", "major", "minor", "observation"]);

function requireWriteRole(role?: string) {
  if (!role || !["super_admin", "admin", "inspector"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "쓰기 권한 없음" });
  }
}
function requireApproveRole(role?: string) {
  if (!role || !["super_admin", "admin"].includes(role)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "보고서 승인 권한 없음 (admin 이상)",
    });
  }
}

export const auditRouter = router({
  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: AUDIT_STATUS.optional(),
        type: AUDIT_TYPE.optional(),
        leadAuditor: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listAudits(Number(ctx.tenantId), input.industry, {
        status: input.status,
        type: input.type,
        leadAuditor: input.leadAuditor,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ industry: INDUSTRY, id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const a = await getAuditById(Number(ctx.tenantId), input.industry, input.id);
      if (!a) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Audit 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return a;
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        type: AUDIT_TYPE,
        title: z.string().min(1).max(255),
        scope: z.string().min(1),
        criteria: z.string().min(1).max(255),
        auditee: z.string().min(1).max(255),
        plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        leadAuditor: z.number().int().positive(),
        auditors: z.array(z.number().int().positive()).optional(),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      return createAudit({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        type: input.type,
        title: input.title,
        scope: input.scope,
        criteria: input.criteria,
        auditee: input.auditee,
        plannedDate: input.plannedDate,
        leadAuditor: input.leadAuditor,
        auditors: input.auditors,
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
        await setAuditActualDate({
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

  /**
   * Finding 추가 — outcome 자동 재계산.
   *   각 finding 의 seq 는 어댑터가 자동 부여.
   */
  addFinding: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        title: z.string().min(1).max(255),
        severity: FINDING_SEVERITY,
        description: z.string().min(1),
        violatedClause: z.string().nullable().optional(),
        correctiveActionId: z.number().int().positive().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await addAuditFinding({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          finding: {
            title: input.title,
            severity: input.severity,
            description: input.description,
            violatedClause: input.violatedClause ?? null,
            correctiveActionId: input.correctiveActionId ?? null,
          },
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  /** Finding 의 CAPA 연계 (Y-2-2 후 활성). */
  linkFindingToCorrectiveAction: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        findingSeq: z.number().int().positive(),
        correctiveActionId: z.number().int().positive().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await linkFindingToCorrectiveAction({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          findingSeq: input.findingSeq,
          correctiveActionId: input.correctiveActionId,
        });
        return { ok: true };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: "BAD_REQUEST", message: msg });
      }
    }),

  setConclusion: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        conclusion: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setAuditConclusion({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          conclusion: input.conclusion,
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
        toStatus: AUDIT_STATUS,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.user?.role;
      if (input.toStatus === "closed") requireApproveRole(role);
      else requireWriteRole(role);
      try {
        await transitionAuditStatus({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          toStatus: input.toStatus,
          approvedBy:
            input.toStatus === "closed" ? Number(ctx.user?.id) : undefined,
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
    return getAuditStats(Number(ctx.tenantId));
  }),
});
