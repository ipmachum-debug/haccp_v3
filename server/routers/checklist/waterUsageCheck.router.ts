/**
 * 5. 용수 사용 점검표 (Water Usage Checks)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hWaterUsageChecks } from "../../../drizzle/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId } from "./_helpers";

export const waterUsageCheckRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hWaterUsageChecks.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hWaterUsageChecks.checkDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hWaterUsageChecks.checkDate} <= ${input.endDate}`);
      if (input.checkResult) conditions.push(eq(hWaterUsageChecks.checkResult, input.checkResult));

      const records = await db
        .select()
        .from(hWaterUsageChecks)
        .where(and(...conditions))
        .orderBy(desc(hWaterUsageChecks.checkDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      checkDate: z.string(),
      usageArea: z.string(),
      waterSource: z.string(),
      usageAmount: z.number().optional(),
      waterPressure: z.number().optional(),
      waterTemperature: z.number().optional(),
      visualInspection: z.enum(["clear", "slightly_cloudy", "cloudy"]).default("clear"),
      checkResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hWaterUsageChecks).values({
        ...input,
        checkDate: new Date(input.checkDate),
        usageAmount: input.usageAmount?.toString(),
        waterPressure: input.waterPressure?.toString(),
        waterTemperature: input.waterTemperature?.toString(),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      checkDate: z.string().optional(),
      usageArea: z.string().optional(),
      waterSource: z.string().optional(),
      usageAmount: z.number().optional(),
      waterPressure: z.number().optional(),
      waterTemperature: z.number().optional(),
      visualInspection: z.enum(["clear", "slightly_cloudy", "cloudy"]).optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = {};
      if (data.checkDate) updateData.checkDate = new Date(data.checkDate);
      if (data.usageArea) updateData.usageArea = data.usageArea;
      if (data.waterSource) updateData.waterSource = data.waterSource;
      if (data.usageAmount !== undefined) updateData.usageAmount = data.usageAmount.toString();
      if (data.waterPressure !== undefined) updateData.waterPressure = data.waterPressure.toString();
      if (data.waterTemperature !== undefined) updateData.waterTemperature = data.waterTemperature.toString();
      if (data.visualInspection) updateData.visualInspection = data.visualInspection;
      if (data.checkResult) updateData.checkResult = data.checkResult;
      if (data.remarks !== undefined) updateData.remarks = data.remarks;

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hWaterUsageChecks).set(updateData).where(and(eq(hWaterUsageChecks.id, id), eq(hWaterUsageChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hWaterUsageChecks).where(and(eq(hWaterUsageChecks.id, input.id), eq(hWaterUsageChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),
});
