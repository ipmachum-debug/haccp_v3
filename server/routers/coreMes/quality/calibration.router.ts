/**
 * Calibration 라우터 — Layer 2 core-mes/quality (Phase Y-4)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  createCalibration,
  getCalibrationById,
  listCalibrations,
  setCalibrationActualDate,
  addCalibrationMeasurement,
  setCalibrationConclusion,
  transitionCalibrationStatus,
  getCalibrationStats,
} from "../../../db/coreMes/quality/calibration";

const INDUSTRY = z.enum([
  "food", "cosmetic", "pharmaceutical",
  "health-functional", "medical-device", "general-manufacturing",
]);
const CALIBRATION_TYPE = z.enum(["iq", "oq", "pq", "routine"]);
const CALIBRATION_STATUS = z.enum([
  "planned", "scheduled", "in_progress", "completed", "archived", "cancelled",
]);
const CALIBRATION_VENDOR_TYPE = z.enum(["internal", "external"]);

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

export const calibrationRouter = router({
  list: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        status: CALIBRATION_STATUS.optional(),
        type: CALIBRATION_TYPE.optional(),
        equipmentSerial: z.string().optional(),
        dueBefore: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return listCalibrations(Number(ctx.tenantId), input.industry, {
        status: input.status,
        type: input.type,
        equipmentSerial: input.equipmentSerial,
        dueBefore: input.dueBefore,
        limit: input.limit,
        offset: input.offset,
      });
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ industry: INDUSTRY, id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const c = await getCalibrationById(
        Number(ctx.tenantId),
        input.industry,
        input.id,
      );
      if (!c) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Calibration 미존재 또는 industry 컨텍스트 불일치",
        });
      }
      return c;
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        type: CALIBRATION_TYPE,
        equipmentName: z.string().min(1).max(255),
        equipmentSerial: z.string().min(1).max(100),
        vendor: z.string().min(1).max(255),
        vendorType: CALIBRATION_VENDOR_TYPE,
        scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        intervalMonths: z.number().int().min(1).max(120).optional(),
        industryMetadata: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      return createCalibration({
        tenantId: Number(ctx.tenantId),
        industry: input.industry,
        type: input.type,
        equipmentName: input.equipmentName,
        equipmentSerial: input.equipmentSerial,
        vendor: input.vendor,
        vendorType: input.vendorType,
        scheduledDate: input.scheduledDate,
        intervalMonths: input.intervalMonths,
        industryMetadata: input.industryMetadata ?? null,
      });
    }),

  /** 실시일 입력 + nextDueDate 자동 계산. */
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
        await setCalibrationActualDate({
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

  /** 측정값 추가 — outcome 자동 재계산. */
  addMeasurement: tenantRequiredProcedure
    .input(
      z.object({
        industry: INDUSTRY,
        id: z.number().int().positive(),
        name: z.string().min(1),
        expected: z.number(),
        measured: z.number(),
        tolerance: z.number().nonnegative(),
        unit: z.string().min(1).max(20),
        passed: z.boolean(),
        notes: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await addCalibrationMeasurement({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          measurement: {
            name: input.name,
            expected: input.expected,
            measured: input.measured,
            tolerance: input.tolerance,
            unit: input.unit,
            passed: input.passed,
            notes: input.notes ?? null,
          },
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
        conclusion: z.string().optional(),
        certificateUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireWriteRole(ctx.user?.role);
      try {
        await setCalibrationConclusion({
          tenantId: Number(ctx.tenantId),
          industry: input.industry,
          id: input.id,
          conclusion: input.conclusion,
          certificateUrl: input.certificateUrl,
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
        toStatus: CALIBRATION_STATUS,
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
        await transitionCalibrationStatus({
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
    return getCalibrationStats(Number(ctx.tenantId));
  }),
});
