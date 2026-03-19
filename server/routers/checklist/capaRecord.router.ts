/**
 * 11. 개선조치(CAPA) 기록 (CAPA Records)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hCapaRecords } from "../../../drizzle/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId, getEffectiveTenantId } from "./_helpers";

export const capaRecordRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      status: z.enum(["open", "in_progress", "completed", "verified", "closed"]).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hCapaRecords.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hCapaRecords.issueDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hCapaRecords.issueDate} <= ${input.endDate}`);
      if (input.status) conditions.push(eq(hCapaRecords.status, input.status));
      if (input.priority) conditions.push(eq(hCapaRecords.priority, input.priority));

      const records = await db
        .select()
        .from(hCapaRecords)
        .where(and(...conditions))
        .orderBy(desc(hCapaRecords.issueDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      capaNumber: z.string(),
      issueDate: z.string(),
      issueSource: z.string().optional(),
      relatedRecordType: z.string().optional(),
      relatedRecordId: z.number().optional(),
      problemDescription: z.string(),
      rootCauseAnalysis: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      actionOwner: z.number().optional(),
      targetCompletionDate: z.string().optional(),
      status: z.enum(["open", "in_progress", "completed", "verified", "closed"]).default("open"),
      priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      remarks: z.string().optional(),
      createdBy: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hCapaRecords).values({
        ...input,
        issueDate: new Date(input.issueDate),
        targetCompletionDate: input.targetCompletionDate ? new Date(input.targetCompletionDate) : undefined,
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      issueDate: z.string().optional(),
      issueSource: z.string().optional(),
      problemDescription: z.string().optional(),
      rootCauseAnalysis: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      actionOwner: z.number().optional(),
      targetCompletionDate: z.string().optional(),
      actualCompletionDate: z.string().optional(),
      verificationMethod: z.string().optional(),
      verificationResult: z.enum(["effective", "ineffective", "pending"]).optional(),
      verifiedBy: z.number().optional(),
      status: z.enum(["open", "in_progress", "completed", "verified", "closed"]).optional(),
      priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      const updateData: any = { ...data };
      if (data.issueDate) updateData.issueDate = new Date(data.issueDate);
      if (data.targetCompletionDate) updateData.targetCompletionDate = new Date(data.targetCompletionDate);
      if (data.actualCompletionDate) updateData.actualCompletionDate = new Date(data.actualCompletionDate);

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hCapaRecords).set(updateData).where(and(eq(hCapaRecords.id, id), eq(hCapaRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hCapaRecords).where(and(eq(hCapaRecords.id, input.id), eq(hCapaRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  verify: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      verificationResult: z.enum(["effective", "ineffective", "pending"]),
      verifiedBy: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hCapaRecords).set({
        verificationResult: input.verificationResult,
        verifiedBy: input.verifiedBy,
        verifiedAt: new Date(),
        status: "verified",
      } as any).where(and(eq(hCapaRecords.id, input.id), eq((hCapaRecords as any).tenantId, getEffectiveTenantId(ctx))));

      return { success: true };
    }),

  close: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hCapaRecords).set({
        status: "closed",
      } as any).where(and(eq(hCapaRecords.id, input.id), eq((hCapaRecords as any).tenantId, getEffectiveTenantId(ctx))));

      return { success: true };
    }),
});
