/**
 * 9. 포장재 보관 관리 (Packaging Storage Records)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hPackagingStorageRecords } from "../../../drizzle/schema/schema_main";
import { eq, and, desc, like } from "drizzle-orm";
import { getEffectiveSiteId } from "./_helpers";

export const packagingStorageRecordRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      materialId: z.number().optional(),
      materialType: z.string().optional(),
      storageLocation: z.string().optional(),
      inspectionResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hPackagingStorageRecords.siteId, effectiveSiteId)];
      if (input.materialId) conditions.push(eq(hPackagingStorageRecords.materialId, input.materialId));
      if (input.materialType) conditions.push(eq(hPackagingStorageRecords.materialType, input.materialType));
      if (input.storageLocation) conditions.push(like(hPackagingStorageRecords.storageLocation, `%${input.storageLocation}%`));
      if (input.inspectionResult) conditions.push(eq(hPackagingStorageRecords.inspectionResult, input.inspectionResult));

      const records = await db
        .select()
        .from(hPackagingStorageRecords)
        .where(and(...conditions))
        .orderBy(desc(hPackagingStorageRecords.receivedDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      materialId: z.number().optional(),
      materialName: z.string(),
      materialType: z.string(),
      storageLocation: z.string(),
      receivedDate: z.string(),
      lotNumber: z.string().optional(),
      quantity: z.number(),
      uom: z.string(),
      storageCondition: z.enum(["good", "fair", "poor"]).default("good"),
      temperatureControlled: z.number().default(0),
      humidityControlled: z.number().default(0),
      expiryDate: z.string().optional(),
      inspectionResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hPackagingStorageRecords).values({
        ...input,
        receivedDate: new Date(input.receivedDate),
        expiryDate: input.expiryDate ? new Date(input.expiryDate) : undefined,
        quantity: input.quantity.toString(),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      materialName: z.string().optional(),
      materialType: z.string().optional(),
      storageLocation: z.string().optional(),
      receivedDate: z.string().optional(),
      lotNumber: z.string().optional(),
      quantity: z.number().optional(),
      uom: z.string().optional(),
      storageCondition: z.enum(["good", "fair", "poor"]).optional(),
      temperatureControlled: z.number().optional(),
      humidityControlled: z.number().optional(),
      expiryDate: z.string().optional(),
      inspectionResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.receivedDate) updateData.receivedDate = new Date(data.receivedDate);
      if (data.expiryDate) updateData.expiryDate = new Date(data.expiryDate);
      if (data.quantity !== undefined) updateData.quantity = data.quantity.toString();

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hPackagingStorageRecords).set(updateData).where(and(eq(hPackagingStorageRecords.id, id), eq(hPackagingStorageRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hPackagingStorageRecords).where(and(eq(hPackagingStorageRecords.id, input.id), eq(hPackagingStorageRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),
});
