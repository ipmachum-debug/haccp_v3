/**
 * 10. 품질 이상 발생 기록 (Quality Issue Records)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hQualityIssueRecords } from "../../../drizzle/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId, getEffectiveTenantId } from "./_helpers";

export const qualityIssueRecordRouter = router({
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
      const conditions = [eq(hQualityIssueRecords.siteId, effectiveSiteId)];
      if (input.productId) conditions.push(eq(hQualityIssueRecords.productId, input.productId));
      if (input.batchId) conditions.push(eq(hQualityIssueRecords.batchId, input.batchId));
      if (input.startDate) conditions.push(sql`${hQualityIssueRecords.issueDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hQualityIssueRecords.issueDate} <= ${input.endDate}`);
      if (input.severity) conditions.push(eq(hQualityIssueRecords.severity, input.severity));
      if (input.status) conditions.push(eq(hQualityIssueRecords.status, input.status));

      const records = await db
        .select()
        .from(hQualityIssueRecords)
        .where(and(...conditions))
        .orderBy(desc(hQualityIssueRecords.issueDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      issueDate: z.string(),
      issueType: z.string(),
      productId: z.number().optional(),
      batchId: z.number().optional(),
      lotNumber: z.string().optional(),
      issueDescription: z.string(),
      detectionStage: z.string().optional(),
      affectedQuantity: z.number().optional(),
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

      const result = await db.insert(hQualityIssueRecords).values({
        ...input,
        issueDate: new Date(input.issueDate),
        affectedQuantity: input.affectedQuantity?.toString(),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      issueDate: z.string().optional(),
      issueType: z.string().optional(),
      lotNumber: z.string().optional(),
      issueDescription: z.string().optional(),
      detectionStage: z.string().optional(),
      affectedQuantity: z.number().optional(),
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
      if (data.issueDate) updateData.issueDate = new Date(data.issueDate);
      if (data.affectedQuantity !== undefined) updateData.affectedQuantity = data.affectedQuantity.toString();

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hQualityIssueRecords).set(updateData).where(and(eq(hQualityIssueRecords.id, id), eq(hQualityIssueRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hQualityIssueRecords).where(and(eq(hQualityIssueRecords.id, input.id), eq(hQualityIssueRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  close: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hQualityIssueRecords).set({
        status: "closed",
        closedAt: new Date(),
      } as any).where(and(eq(hQualityIssueRecords.id, input.id), eq((hQualityIssueRecords as any).tenantId, getEffectiveTenantId(ctx))));

      return { success: true };
    }),
});
