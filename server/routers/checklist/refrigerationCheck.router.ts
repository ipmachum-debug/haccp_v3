/**
 * 8. 냉동·냉장 설비 점검 (Refrigeration Checks)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hRefrigerationChecks } from "../../../drizzle/schema/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId, getEffectiveTenantId } from "./_helpers";
import { triggerRefrigerationAlert } from "../../db/system/temperatureAlertTrigger";

export const refrigerationCheckRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      equipmentId: z.number().optional(),
      equipmentType: z.enum(["freezer", "refrigerator", "cold_storage"]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hRefrigerationChecks.siteId, effectiveSiteId)];
      if (input.equipmentId) conditions.push(eq(hRefrigerationChecks.equipmentId, input.equipmentId));
      if (input.equipmentType) conditions.push(eq(hRefrigerationChecks.equipmentType, input.equipmentType));
      if (input.startDate) conditions.push(sql`${hRefrigerationChecks.checkDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hRefrigerationChecks.checkDate} <= ${input.endDate}`);
      if (input.checkResult) conditions.push(eq(hRefrigerationChecks.checkResult, input.checkResult));

      const records = await db
        .select()
        .from(hRefrigerationChecks)
        .where(and(...conditions))
        .orderBy(desc(hRefrigerationChecks.checkDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      equipmentId: z.number().optional(),
      equipmentName: z.string(),
      equipmentType: z.enum(["freezer", "refrigerator", "cold_storage"]),
      checkDate: z.string(),
      checkTime: z.string().optional(),
      temperature: z.number(),
      targetTemperature: z.number().optional(),
      humidity: z.number().optional(),
      doorSealCondition: z.enum(["good", "fair", "poor"]).default("good"),
      defrostCondition: z.enum(["normal", "ice_buildup", "needs_defrost"]).default("normal"),
      abnormalNoise: z.number().default(0),
      checkResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hRefrigerationChecks).values({
        ...input,
        checkDate: new Date(input.checkDate),
        temperature: input.temperature.toString(),
        targetTemperature: input.targetTemperature?.toString(),
        humidity: input.humidity?.toString(),
      } as any);

      const recordId = Number((result as any).insertId);

      // P9-4: 실시간 냉동·냉장 온도 알림 트리거 (비동기, 에러 무시)
      const tenantId = getEffectiveTenantId(ctx);
      triggerRefrigerationAlert({
        tenantId,
        recordId,
        equipmentName: input.equipmentName,
        equipmentType: input.equipmentType,
        temperature: input.temperature,
        targetTemperature: input.targetTemperature,
        checkResult: input.checkResult,
        siteId: input.siteId,
      }).catch((err) => console.error("[P9-4] Refrigeration temperature alert trigger failed:", err));

      return { success: true, id: recordId };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      equipmentName: z.string().optional(),
      equipmentType: z.enum(["freezer", "refrigerator", "cold_storage"]).optional(),
      checkDate: z.string().optional(),
      checkTime: z.string().optional(),
      temperature: z.number().optional(),
      targetTemperature: z.number().optional(),
      humidity: z.number().optional(),
      doorSealCondition: z.enum(["good", "fair", "poor"]).optional(),
      defrostCondition: z.enum(["normal", "ice_buildup", "needs_defrost"]).optional(),
      abnormalNoise: z.number().optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.checkDate) updateData.checkDate = new Date(data.checkDate);
      if (data.temperature !== undefined) updateData.temperature = data.temperature.toString();
      if (data.targetTemperature !== undefined) updateData.targetTemperature = data.targetTemperature.toString();
      if (data.humidity !== undefined) updateData.humidity = data.humidity.toString();

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hRefrigerationChecks).set(updateData).where(and(eq(hRefrigerationChecks.id, id), eq(hRefrigerationChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hRefrigerationChecks).where(and(eq(hRefrigerationChecks.id, input.id), eq(hRefrigerationChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),
});
