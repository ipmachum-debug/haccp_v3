/**
 * 1. 수질 검사 기록 (Water Quality Tests)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hWaterQualityTests } from "../../../drizzle/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId } from "./_helpers";

export const waterQualityTestRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      testResult: z.enum(["pass", "fail", "pending"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hWaterQualityTests.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hWaterQualityTests.testDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hWaterQualityTests.testDate} <= ${input.endDate}`);
      if (input.testResult) conditions.push(eq(hWaterQualityTests.testResult, input.testResult));

      const records = await db
        .select()
        .from(hWaterQualityTests)
        .where(and(...conditions))
        .orderBy(desc(hWaterQualityTests.testDate));

      return records;
    }),



  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      testDate: z.string(),
      testLocation: z.string(),
      ph: z.number().optional(),
      turbidity: z.number().optional(),
      residualChlorine: z.number().optional(),
      coliformBacteria: z.string().optional(),
      testResult: z.enum(["pass", "fail", "pending"]).default("pending"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hWaterQualityTests).values({
        siteId: input.siteId,
        testDate: new Date(input.testDate),
        testLocation: input.testLocation,
        ph: input.ph?.toString(),
        turbidity: input.turbidity?.toString(),
        residualChlorine: input.residualChlorine?.toString(),
        coliformBacteria: input.coliformBacteria,
        testResult: input.testResult,
        remarks: input.remarks,
        inspectorId: input.inspectorId,
      });

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      testDate: z.string().optional(),
      testLocation: z.string().optional(),
      ph: z.number().optional(),
      turbidity: z.number().optional(),
      residualChlorine: z.number().optional(),
      coliformBacteria: z.string().optional(),
      testResult: z.enum(["pass", "fail", "pending"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = {};
      if (data.testDate) updateData.testDate = data.testDate;
      if (data.testLocation) updateData.testLocation = data.testLocation;
      if (data.ph !== undefined) updateData.ph = data.ph.toString();
      if (data.turbidity !== undefined) updateData.turbidity = data.turbidity.toString();
      if (data.residualChlorine !== undefined) updateData.residualChlorine = data.residualChlorine.toString();
      if (data.coliformBacteria) updateData.coliformBacteria = data.coliformBacteria;
      if (data.testResult) updateData.testResult = data.testResult;
      if (data.remarks !== undefined) updateData.remarks = data.remarks;

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hWaterQualityTests).set(updateData).where(and(eq(hWaterQualityTests.id, id), eq(hWaterQualityTests.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hWaterQualityTests).where(and(eq(hWaterQualityTests.id, input.id), eq(hWaterQualityTests.siteId, effectiveSiteId)));

      return { success: true };
    }),
});
