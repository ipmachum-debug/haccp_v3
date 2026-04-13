/**
 * 7. 이물 관리 기록 (Foreign Material Records)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hForeignMaterialRecords } from "../../../drizzle/schema/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId, getEffectiveTenantId } from "./_helpers";

export const foreignMaterialRecordRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      productId: z.number().optional(),
      batchId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hForeignMaterialRecords.siteId, effectiveSiteId)];
      if (input.productId) conditions.push(eq(hForeignMaterialRecords.productId, input.productId));
      if (input.batchId) conditions.push(eq(hForeignMaterialRecords.batchId, input.batchId));
      if (input.startDate) conditions.push(sql`${hForeignMaterialRecords.detectionDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hForeignMaterialRecords.detectionDate} <= ${input.endDate}`);
      if (input.severity) conditions.push(eq(hForeignMaterialRecords.severity, input.severity));
      if (input.status) conditions.push(eq(hForeignMaterialRecords.status, input.status));

      const records = await db
        .select()
        .from(hForeignMaterialRecords)
        .where(and(...conditions))
        .orderBy(desc(hForeignMaterialRecords.detectionDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      detectionDate: z.string(),
      detectionLocation: z.string(),
      productId: z.number().optional(),
      batchId: z.number().optional(),
      materialType: z.string(),
      materialDescription: z.string().optional(),
      materialSize: z.string().optional(),
      detectionMethod: z.string().optional(),
      immediateAction: z.string().optional(),
      rootCause: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      status: z.enum(["open", "investigating", "resolved", "closed"]).default("open"),
      reportedBy: z.number(),
      investigatedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hForeignMaterialRecords).values({
        ...input,
        detectionDate: new Date(input.detectionDate),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      detectionDate: z.string().optional(),
      detectionLocation: z.string().optional(),
      materialType: z.string().optional(),
      materialDescription: z.string().optional(),
      materialSize: z.string().optional(),
      detectionMethod: z.string().optional(),
      immediateAction: z.string().optional(),
      rootCause: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      status: z.enum(["open", "investigating", "resolved", "closed"]).optional(),
      investigatedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.detectionDate) updateData.detectionDate = new Date(data.detectionDate);

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hForeignMaterialRecords).set(updateData).where(and(eq(hForeignMaterialRecords.id, id), eq(hForeignMaterialRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hForeignMaterialRecords).where(and(eq(hForeignMaterialRecords.id, input.id), eq(hForeignMaterialRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  close: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hForeignMaterialRecords).set({
        status: "closed",
        closedAt: new Date(),
      } as any).where(and(eq(hForeignMaterialRecords.id, input.id), eq((hForeignMaterialRecords as any).tenantId, getEffectiveTenantId(ctx))));

      return { success: true };
    }),
});
