/**
 * 4. 개인위생 점검표 (Personal Hygiene Checks)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hPersonalHygieneChecks } from "../../../drizzle/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId } from "./_helpers";

export const personalHygieneCheckRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      employeeId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hPersonalHygieneChecks.siteId, effectiveSiteId)];
      if (input.employeeId) conditions.push(eq(hPersonalHygieneChecks.employeeId, input.employeeId));
      if (input.startDate) conditions.push(sql`${hPersonalHygieneChecks.checkDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hPersonalHygieneChecks.checkDate} <= ${input.endDate}`);
      if (input.checkResult) conditions.push(eq(hPersonalHygieneChecks.checkResult, input.checkResult));

      const records = await db
        .select()
        .from(hPersonalHygieneChecks)
        .where(and(...conditions))
        .orderBy(desc(hPersonalHygieneChecks.checkDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      employeeId: z.number(),
      checkDate: z.string(),
      uniformCleanliness: z.enum(["good", "fair", "poor"]).default("good"),
      handWashing: z.number().default(1),
      nailTrimming: z.number().default(1),
      jewelry: z.number().default(0),
      hairnet: z.number().default(1),
      mask: z.number().default(1),
      healthCondition: z.enum(["good", "minor_issue", "sick"]).default("good"),
      checkResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hPersonalHygieneChecks).values(input as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      checkDate: z.string().optional(),
      uniformCleanliness: z.enum(["good", "fair", "poor"]).optional(),
      handWashing: z.number().optional(),
      nailTrimming: z.number().optional(),
      jewelry: z.number().optional(),
      hairnet: z.number().optional(),
      mask: z.number().optional(),
      healthCondition: z.enum(["good", "minor_issue", "sick"]).optional(),
      checkResult: z.enum(["pass", "fail"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hPersonalHygieneChecks).set(data as any).where(and(eq(hPersonalHygieneChecks.id, id), eq(hPersonalHygieneChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hPersonalHygieneChecks).where(and(eq(hPersonalHygieneChecks.id, input.id), eq(hPersonalHygieneChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),
});
