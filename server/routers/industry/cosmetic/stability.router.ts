/**
 * 화장품 안정성시험 라우터 (Phase 2-8)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import {
  createStabilityTest,
  listStabilityTests,
  getStabilityTestById,
  startStabilityTest,
  completeStabilityTest,
  failStabilityTest,
  listObservationsByTest,
  addObservation,
  deleteObservation,
  summarizeStability,
} from "../../../db/industry/cosmetic/stability";

const STATUS = ["planned", "in_progress", "completed", "failed"] as const;
const TYPE = ["long_term", "accelerated", "stress"] as const;
const LIGHT = ["dark", "ambient", "direct_sunlight"] as const;
const PASS_FAIL = ["pass", "acceptable", "fail"] as const;

export const cosmeticStabilityRouter = router({
  list: tenantRequiredProcedure
    .input(
      z
        .object({
          status: z.enum(STATUS).optional(),
          productId: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await listStabilityTests(input, ctx.tenantId);
      return rows.map((r) => ({
        id: Number(r.id),
        testCode: String(r.testCode),
        productId: Number(r.productId),
        bmrId: r.bmrId,
        testType: r.testType as (typeof TYPE)[number],
        storageTempC: r.storageTempC !== null ? Number(r.storageTempC) : null,
        storageHumidity:
          r.storageHumidity !== null ? Number(r.storageHumidity) : null,
        storageLight: r.storageLight,
        plannedDurationMonths: r.plannedDurationMonths,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        status: r.status as (typeof STATUS)[number],
        createdAt: r.createdAt,
      }));
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await getStabilityTestById(input.id, ctx.tenantId);
      if (!row) return null;
      return {
        id: Number(row.id),
        testCode: String(row.testCode),
        productId: Number(row.productId),
        bmrId: row.bmrId,
        testType: row.testType as (typeof TYPE)[number],
        storageTempC: row.storageTempC !== null ? Number(row.storageTempC) : null,
        storageHumidity:
          row.storageHumidity !== null ? Number(row.storageHumidity) : null,
        storageLight: row.storageLight,
        plannedDurationMonths: row.plannedDurationMonths,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        status: row.status as (typeof STATUS)[number],
        conclusion: row.conclusion,
        approvedBy: row.approvedBy,
        approvedAt: row.approvedAt,
        createdBy: row.createdBy,
        createdAt: row.createdAt,
      };
    }),

  create: tenantRequiredProcedure
    .input(
      z.object({
        productId: z.number().int().positive(),
        bmrId: z.number().int().positive().optional(),
        testType: z.enum(TYPE),
        storageTempC: z.number().optional(),
        storageHumidity: z.number().min(0).max(100).optional(),
        storageLight: z.enum(LIGHT).optional(),
        plannedDurationMonths: z.number().int().min(1).max(60).optional(),
        startedAt: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      createStabilityTest(
        { ...input, createdBy: Number(ctx.user.id) },
        ctx.tenantId,
      ),
    ),

  start: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        startDate: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      startStabilityTest(input.id, input.startDate, ctx.tenantId),
    ),

  complete: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        conclusion: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      completeStabilityTest(
        input.id,
        input.conclusion,
        Number(ctx.user.id),
        ctx.tenantId,
      ),
    ),

  fail: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        reason: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      failStabilityTest(input.id, input.reason, ctx.tenantId),
    ),

  // Observations
  listObservations: tenantRequiredProcedure
    .input(z.object({ testId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const rows = await listObservationsByTest(input.testId, ctx.tenantId);
      return rows.map((r) => ({
        id: Number(r.id),
        testId: Number(r.testId),
        observationMonth: r.observationMonth,
        observationDate: r.observationDate,
        appearance: r.appearance,
        color: r.color,
        odor: r.odor,
        ph: r.ph !== null ? Number(r.ph) : null,
        viscosity: r.viscosity !== null ? Number(r.viscosity) : null,
        microbialCount: r.microbialCount,
        passFail: r.passFail as (typeof PASS_FAIL)[number],
        notes: r.notes,
        measuredBy: r.measuredBy,
        measuredAt: r.measuredAt,
      }));
    }),

  observationSummary: tenantRequiredProcedure
    .input(z.object({ testId: z.number().int().positive() }))
    .query(async ({ ctx, input }) =>
      summarizeStability(input.testId, ctx.tenantId),
    ),

  addObservation: tenantRequiredProcedure
    .input(
      z.object({
        testId: z.number().int().positive(),
        observationMonth: z.number().int().min(0).max(60),
        observationDate: z.string(),
        appearance: z.string().optional(),
        color: z.string().max(100).optional(),
        odor: z.string().max(100).optional(),
        ph: z.number().min(0).max(14).optional(),
        viscosity: z.number().min(0).optional(),
        microbialCount: z.number().int().min(0).optional(),
        passFail: z.enum(PASS_FAIL).optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      addObservation(
        { ...input, measuredBy: Number(ctx.user.id) },
        ctx.tenantId,
      ),
    ),

  deleteObservation: tenantRequiredProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) =>
      deleteObservation(input.id, ctx.tenantId),
    ),
});
