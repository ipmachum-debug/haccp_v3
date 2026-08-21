/**
 * 1. 수질 검사 기록 (Water Quality Tests)
 *
 * ★ 2026-08-21 — 리네임 이전 컬럼명으로 쓰던 코드 교정 (Issue #431 조사 중 발견)
 *   과거 h_water_quality_tests 의 컬럼이 리네임됐는데 update 만 옛 이름으로 남아 있었다.
 *     test_location → sample_location / residual_chlorine → chlorine
 *     test_result   → result          / remarks           → notes
 *     inspector_id  → tested_by
 *   `updateData: any` 가 타입 검사를 막아 컴파일은 통과했지만 실행하면 터진다.
 *   입력 스키마를 실제 컬럼에 맞춰, 저장할 수 없는 필드는 받지 않는다.
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hWaterQualityTests } from "../../../drizzle/schema/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId, getEffectiveTenantId } from "./_helpers";

/** 컬럼 enum 은 pass|fail 뿐이다 (예전 입력이 허용하던 pending 은 저장할 수 없다) */
const RESULT = z.enum(["pass", "fail"]);

export const waterQualityTestRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      result: RESULT.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hWaterQualityTests.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hWaterQualityTests.testDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hWaterQualityTests.testDate} <= ${input.endDate}`);
      if (input.result) conditions.push(eq(hWaterQualityTests.result, input.result));

      const records = await db
        .select()
        .from(hWaterQualityTests)
        .where(and(...conditions))
        .orderBy(desc(hWaterQualityTests.testDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      testDate: z.string(),
      sampleLocation: z.string().optional(),
      ph: z.number().optional(),
      turbidity: z.number().optional(),
      chlorine: z.number().optional(),
      coliformBacteria: z.string().optional(),
      result: RESULT.optional(),
      notes: z.string().optional(),
      testedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const inserted = await db.insert(hWaterQualityTests).values({
        // tenant_id 는 notNull 인데 예전 구현이 채우지 않아 INSERT 자체가 실패했다
        tenantId: getEffectiveTenantId(ctx),
        siteId: input.siteId,
        testDate: new Date(input.testDate),     // date 컬럼 — drizzle 스키마가 Date 를 요구한다
        sampleLocation: input.sampleLocation,
        ph: input.ph?.toString(),               // decimal 컬럼 — 정밀도 보존을 위해 문자열
        turbidity: input.turbidity?.toString(),
        chlorine: input.chlorine?.toString(),
        coliformBacteria: input.coliformBacteria,
        result: input.result,
        notes: input.notes,
        testedBy: input.testedBy,
      });

      return { success: true, id: Number((inserted as unknown as { insertId: number | string }).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      testDate: z.string().optional(),
      sampleLocation: z.string().optional(),
      ph: z.number().optional(),
      turbidity: z.number().optional(),
      chlorine: z.number().optional(),
      coliformBacteria: z.string().optional(),
      result: RESULT.optional(),
      notes: z.string().optional(),
      testedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // 명시적으로 채운다 — 스프레드로 넘기면 컬럼명이 어긋나도 타입이 잡아주지 못한다
      const updateData: Partial<typeof hWaterQualityTests.$inferInsert> = {};
      if (input.testDate !== undefined) updateData.testDate = new Date(input.testDate);
      if (input.sampleLocation !== undefined) updateData.sampleLocation = input.sampleLocation;
      if (input.ph !== undefined) updateData.ph = input.ph.toString();
      if (input.turbidity !== undefined) updateData.turbidity = input.turbidity.toString();
      if (input.chlorine !== undefined) updateData.chlorine = input.chlorine.toString();
      if (input.coliformBacteria !== undefined) updateData.coliformBacteria = input.coliformBacteria;
      if (input.result !== undefined) updateData.result = input.result;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.testedBy !== undefined) updateData.testedBy = input.testedBy;

      if (Object.keys(updateData).length === 0) return { success: true };

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hWaterQualityTests).set(updateData)
        .where(and(eq(hWaterQualityTests.id, input.id), eq(hWaterQualityTests.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hWaterQualityTests)
        .where(and(eq(hWaterQualityTests.id, input.id), eq(hWaterQualityTests.siteId, effectiveSiteId)));

      return { success: true };
    }),
});
