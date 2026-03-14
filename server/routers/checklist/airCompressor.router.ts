/**
 * 2. 공기압축기 관리 (Air Compressors)
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hAirCompressors, hAirCompressorChecks } from "../../../drizzle/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId } from "./_helpers";

export const airCompressorRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      status: z.enum(["normal", "warning", "error", "inactive"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hAirCompressors.siteId, effectiveSiteId)];
      if (input.status) conditions.push(eq(hAirCompressors.status, input.status));

      const records = await db
        .select()
        .from(hAirCompressors)
        .where(and(...conditions))
        .orderBy(desc(hAirCompressors.createdAt));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      equipmentCode: z.string(),
      equipmentName: z.string(),
      location: z.string(),
      installDate: z.string().optional(),
      lastMaintenanceDate: z.string().optional(),
      nextMaintenanceDate: z.string().optional(),
      maintenanceCycle: z.number().default(90),
      status: z.enum(["normal", "warning", "error", "inactive"]).default("normal"),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hAirCompressors).values(input as any);

      return { success: true, id: Number((result as any).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      equipmentName: z.string().optional(),
      location: z.string().optional(),
      installDate: z.string().optional(),
      lastMaintenanceDate: z.string().optional(),
      nextMaintenanceDate: z.string().optional(),
      maintenanceCycle: z.number().optional(),
      status: z.enum(["normal", "warning", "error", "inactive"]).optional(),
      remarks: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const { id, ...data } = input;
      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hAirCompressors).set(data as any).where(and(eq(hAirCompressors.id, id), eq(hAirCompressors.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hAirCompressors).where(and(eq(hAirCompressors.id, input.id), eq(hAirCompressors.siteId, effectiveSiteId)));

      return { success: true };
    }),

  // 공기압축기 점검 기록
  listChecks: tenantRequiredProcedure
    .input(z.object({
      compressorId: z.number(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const conditions = [eq(hAirCompressorChecks.compressorId, input.compressorId)];
      if (input.startDate) conditions.push(sql`${hAirCompressorChecks.checkDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hAirCompressorChecks.checkDate} <= ${input.endDate}`);

      const records = await db
        .select()
        .from(hAirCompressorChecks)
        .where(and(...conditions))
        .orderBy(desc(hAirCompressorChecks.checkDate));

      return records;
    }),

  createCheck: tenantRequiredProcedure
    .input(z.object({
      compressorId: z.number(),
      checkDate: z.string(),
      pressure: z.number().optional(),
      temperature: z.number().optional(),
      oilLevel: z.enum(["normal", "low", "high"]).default("normal"),
      filterCondition: z.enum(["good", "fair", "poor"]).default("good"),
      abnormalNoise: z.number().default(0),
      leakage: z.number().default(0),
      checkResult: z.enum(["pass", "fail"]).default("pass"),
      remarks: z.string().optional(),
      inspectorId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const result = await db.insert(hAirCompressorChecks).values({
        ...input,
        pressure: input.pressure?.toString(),
        temperature: input.temperature?.toString(),
      } as any);

      return { success: true, id: Number((result as any).insertId) };
    }),
});
