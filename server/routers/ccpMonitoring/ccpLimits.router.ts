import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { ccpLimits } from "../../../drizzle/schema/ccpMonitoring";
import { eq, and } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";

export const ccpLimitsRouter = router({
  // CCP 한계기준 관리
  createCcpLimit: tenantRequiredProcedure
    .input(z.object({
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']),
      productName: z.string(),
      heatingTimeMinMin: z.number().optional(),
      heatingTimeMinMax: z.number().optional(),
      pressureMpaMin: z.string().optional(),
      temperatureCMin: z.string().optional(),
      monitoringFrequency: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: tenantId 강제 주입
      const tenantId = getEffectiveTenantId(ctx);
      const [result] = await db.insert(ccpLimits).values({ ...input, tenantId });
      return { id: result.insertId };
    }),

  getCcpLimits: tenantRequiredProcedure
    .input(z.object({
      ccpType: z.enum(['CCP-1B', 'CCP-2B', 'CCP-3B', 'CCP-4P']).optional(),
      productName: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: tenantId 강제 필터
      const tenantId = getEffectiveTenantId(ctx);
      const conditions = [eq(ccpLimits.tenantId, tenantId)];

      if (input.ccpType) {
        conditions.push(eq(ccpLimits.ccpType, input.ccpType));
      }
      if (input.productName) {
        conditions.push(eq(ccpLimits.productName, input.productName));
      }

      return await db.select().from(ccpLimits).where(and(...conditions));
    }),

  updateCcpLimit: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      heatingTimeMinMin: z.number().optional(),
      heatingTimeMinMax: z.number().optional(),
      pressureMpaMin: z.string().optional(),
      temperatureCMin: z.string().optional(),
      monitoringFrequency: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: tenantId 소유권 검증
      const tenantId = getEffectiveTenantId(ctx);
      const { id, ...data } = input;
      await db.update(ccpLimits).set(data).where(and(eq(ccpLimits.id, id), eq(ccpLimits.tenantId, tenantId)));
      return { success: true };
    }),

  deleteCcpLimit: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      // ✅ P0 FIX: tenantId 소유권 검증
      const tenantId = getEffectiveTenantId(ctx);
      await db.delete(ccpLimits).where(and(eq(ccpLimits.id, input.id), eq(ccpLimits.tenantId, tenantId)));
      return { success: true };
    }),
});
