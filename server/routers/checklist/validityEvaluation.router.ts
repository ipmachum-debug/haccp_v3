/**
 * 3. 유효성 평가 기록 (Validity Evaluations)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hValidityEvaluations } from "../../../drizzle/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId } from "./_helpers";

export const validityEvaluationRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      evaluationResult: z.enum(["effective", "partially_effective", "ineffective"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hValidityEvaluations.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hValidityEvaluations.evaluationDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hValidityEvaluations.evaluationDate} <= ${input.endDate}`);
      if (input.evaluationResult) conditions.push(eq(hValidityEvaluations.evaluationResult, input.evaluationResult));

      const records = await db
        .select()
        .from(hValidityEvaluations)
        .where(and(...conditions))
        .orderBy(desc(hValidityEvaluations.evaluationDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      evaluationDate: z.string(),
      evaluationType: z.string(),
      evaluationScope: z.string().optional(),
      evaluationMethod: z.string().optional(),
      findings: z.string().optional(),
      recommendations: z.string().optional(),
      evaluationResult: z.enum(["effective", "partially_effective", "ineffective"]).default("effective"),
      evaluatorId: z.number(),
      approvedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hValidityEvaluations).values(input as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      evaluationDate: z.string().optional(),
      evaluationType: z.string().optional(),
      evaluationScope: z.string().optional(),
      evaluationMethod: z.string().optional(),
      findings: z.string().optional(),
      recommendations: z.string().optional(),
      evaluationResult: z.enum(["effective", "partially_effective", "ineffective"]).optional(),
      approvedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hValidityEvaluations).set(data as any).where(and(eq(hValidityEvaluations.id, id), eq(hValidityEvaluations.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hValidityEvaluations).where(and(eq(hValidityEvaluations.id, input.id), eq(hValidityEvaluations.siteId, effectiveSiteId)));

      return { success: true };
    }),
});
