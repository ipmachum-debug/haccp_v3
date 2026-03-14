import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { hazardAnalysis } from "../../../drizzle/schema/ccpMonitoring";
import { eq, and } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";

export const hazardAnalysisCcpRouter = router({
  // 위해요소 분석 관리
  createHazardAnalysis: tenantRequiredProcedure
    .input(z.object({
      processName: z.string(),
      hazardCategory: z.enum(['생물학적', '화학적', '물리적']),
      hazardName: z.string(),
      cause: z.string().optional(),
      severity: z.number().min(1).max(3),
      occurrence: z.number().min(1).max(3),
      riskLevel: z.number().min(1).max(3),
      preventionMeasures: z.string().optional(),
      productCategory: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const [result] = await db.insert(hazardAnalysis).values({ ...input, tenantId });
      return { id: result.insertId };
    }),

  getHazardAnalysis: tenantRequiredProcedure
    .input(z.object({
      processName: z.string().optional(),
      hazardCategory: z.enum(['생물학적', '화학적', '물리적']).optional(),
      productCategory: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: tenantId 강제 필터
      const tenantId = getEffectiveTenantId(ctx);
      let conditions: any[] = [eq(hazardAnalysis.tenantId, tenantId)];

      if (input.processName) {
        conditions.push(eq(hazardAnalysis.processName, input.processName));
      }
      if (input.hazardCategory) {
        conditions.push(eq(hazardAnalysis.hazardCategory, input.hazardCategory));
      }
      if (input.productCategory) {
        conditions.push(eq(hazardAnalysis.productCategory, input.productCategory));
      }

      return await db
        .select()
        .from(hazardAnalysis)
        .where(and(...conditions));
    }),

  updateHazardAnalysis: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      cause: z.string().optional(),
      severity: z.number().min(1).max(3).optional(),
      occurrence: z.number().min(1).max(3).optional(),
      riskLevel: z.number().min(1).max(3).optional(),
      preventionMeasures: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;
      await db.update(hazardAnalysis).set(data).where(and(eq(hazardAnalysis.id, id), eq(hazardAnalysis.tenantId, tenantId)));
      return { success: true };
    }),

  // 위해요소 분석 삭제
  deleteHazardAnalysis: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      await db.delete(hazardAnalysis).where(and(eq(hazardAnalysis.id, input.id), eq(hazardAnalysis.tenantId, tenantId)));
      return { success: true };
    }),
});
