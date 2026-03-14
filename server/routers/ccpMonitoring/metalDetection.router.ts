import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { metalDetectionTests, metalDetectionStandards } from "../../../drizzle/schema/ccpMonitoring";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getEffectiveTenantId } from "./_helpers";

export const metalDetectionRouter = router({
  // 금속검출 테스트 기록 관리
  createMetalDetectionTest: tenantRequiredProcedure
    .input(z.object({
      testDate: z.date(),
      productCategory: z.string(),
      metalType: z.enum(['Fe', 'STS']),
      sizeMm: z.string(),
      position: z.enum(['좌상', '좌하', '중상', '중하', '우상', '우하']),
      testResults: z.string(), // JSON string
      detectionRate: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const [result] = await db.insert(metalDetectionTests).values({
        ...input,
        tenantId,
        testerId: ctx.user.id,
      });
      return { id: result.insertId };
    }),

  getMetalDetectionTests: tenantRequiredProcedure
    .input(z.object({
      productCategory: z.string().optional(),
      metalType: z.enum(['Fe', 'STS']).optional(),
      startDate: z.date().optional(),
      endDate: z.date().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      let conditions: any[] = [eq(metalDetectionTests.tenantId, tenantId)];

      if (input.productCategory) {
        conditions.push(eq(metalDetectionTests.productCategory, input.productCategory));
      }
      if (input.metalType) {
        conditions.push(eq(metalDetectionTests.metalType, input.metalType));
      }
      if (input.startDate) {
        conditions.push(gte(metalDetectionTests.testDate, input.startDate));
      }
      if (input.endDate) {
        conditions.push(lte(metalDetectionTests.testDate, input.endDate));
      }

      return await db
        .select()
        .from(metalDetectionTests)
        .where(and(...conditions))
        .orderBy(desc(metalDetectionTests.testDate))
        .limit(50);
    }),

  // 금속검출 기준 관리
  createMetalDetectionStandard: tenantRequiredProcedure
    .input(z.object({
      productCategory: z.string(),
      metalType: z.enum(['Fe', 'STS']),
      sizeMm: z.string(),
      detectionRate: z.number(),
      sensitivitySetting: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      const [result] = await db.insert(metalDetectionStandards).values({ ...input, tenantId });
      return { id: result.insertId };
    }),

  getMetalDetectionStandards: tenantRequiredProcedure
    .input(z.object({
      productCategory: z.string().optional(),
      metalType: z.enum(['Fe', 'STS']).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error('Database not available');
      const tenantId = getEffectiveTenantId(ctx);
      let conditions: any[] = [eq(metalDetectionStandards.tenantId, tenantId)];

      if (input.productCategory) {
        conditions.push(eq(metalDetectionStandards.productCategory, input.productCategory));
      }
      if (input.metalType) {
        conditions.push(eq(metalDetectionStandards.metalType, input.metalType));
      }

      return await db
        .select()
        .from(metalDetectionStandards)
        .where(and(...conditions));
    }),
});
