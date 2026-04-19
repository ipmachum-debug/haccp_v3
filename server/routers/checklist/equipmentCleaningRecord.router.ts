/**
 * 6. 설비 세척·소독 기록 (Equipment Cleaning Records)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hEquipmentCleaningRecords } from "../../../drizzle/schema/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId } from "./_helpers";

export const equipmentCleaningRecordRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      equipmentId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      verificationResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hEquipmentCleaningRecords.siteId, effectiveSiteId)];
      if (input.equipmentId) conditions.push(eq(hEquipmentCleaningRecords.equipmentId, input.equipmentId));
      if (input.startDate) conditions.push(sql`${hEquipmentCleaningRecords.cleaningDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hEquipmentCleaningRecords.cleaningDate} <= ${input.endDate}`);
      if (input.verificationResult) conditions.push(eq(hEquipmentCleaningRecords.verificationResult, input.verificationResult));

      const records = await db
        .select()
        .from(hEquipmentCleaningRecords)
        .where(and(...conditions))
        .orderBy(desc(hEquipmentCleaningRecords.cleaningDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      equipmentId: z.number().optional(),
      equipmentName: z.string(),
      cleaningDate: z.string(),
      cleaningTime: z.string().optional(),
      cleaningMethod: z.string().optional(),
      detergentUsed: z.string().optional(),
      sanitizerUsed: z.string().optional(),
      cleaningDuration: z.number().optional(),
      verificationMethod: z.string().optional(),
      verificationResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      cleanerId: z.number(),
      verifierId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hEquipmentCleaningRecords).values({
        ...input,
        cleaningDate: new Date(input.cleaningDate),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      equipmentName: z.string().optional(),
      cleaningDate: z.string().optional(),
      cleaningTime: z.string().optional(),
      cleaningMethod: z.string().optional(),
      detergentUsed: z.string().optional(),
      sanitizerUsed: z.string().optional(),
      cleaningDuration: z.number().optional(),
      verificationMethod: z.string().optional(),
      verificationResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
      verifierId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.cleaningDate) updateData.cleaningDate = new Date(data.cleaningDate);

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hEquipmentCleaningRecords).set(updateData).where(and(eq(hEquipmentCleaningRecords.id, id), eq(hEquipmentCleaningRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hEquipmentCleaningRecords).where(and(eq(hEquipmentCleaningRecords.id, input.id), eq(hEquipmentCleaningRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),
});
