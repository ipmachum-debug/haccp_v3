/**
 * 4. 개인위생 점검표 (Personal Hygiene Checks)
 *
 * ★ 2026-08-21 — 리네임 이전 컬럼명으로 쓰던 코드 교정 (Issue #431 조사 중 발견)
 *
 *   ⚠️ 단순 리네임이 아닌 항목이 있어 그대로 옮기지 않았다.
 *     jewelry (착용=1)  →  no_jewelry (미착용=1)   ← **의미가 반전**
 *   자동 변환을 넣으면 HACCP 기록이 조용히 뒤집힌다. 그래서 옛 필드를 없애고
 *   실제 컬럼(noJewelry)을 그대로 노출한다. 호출부가 의미를 명시하게 만드는 쪽이 안전하다.
 *
 *   그 밖의 대응:
 *     uniform_cleanliness(good/fair/poor) → uniform_clean(tinyint)  ← 척도가 다름
 *     hand_washing → hands_clean / hairnet → hair_covered
 *     health_condition(good/minor_issue/sick) → health_status(healthy/sick/recovered)
 *     remarks → notes / inspector_id → checked_by
 *
 *   저장할 컬럼이 없어진 입력(nail_trimming, mask, check_result)은 받지 않는다.
 *   받아놓고 버리면 기록이 남은 줄 알게 되는데, 위생 점검에서 그건 위험하다.
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hPersonalHygieneChecks } from "../../../drizzle/schema/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId, getEffectiveTenantId } from "./_helpers";

const HEALTH_STATUS = z.enum(["healthy", "sick", "recovered"]);
/** tinyint 체크 항목 — 0/1 */
const CHECK_FLAG = z.union([z.literal(0), z.literal(1)]);

export const personalHygieneCheckRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      employeeId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      healthStatus: HEALTH_STATUS.optional(),
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
      // 이전 구현은 (table as any).checkResult 로 없는 컬럼을 참조했다.
      // 클라이언트가 이 인자를 안 넘겨서 안 터졌을 뿐, 필터 UI 가 붙는 순간 깨진다.
      if (input.healthStatus) conditions.push(eq(hPersonalHygieneChecks.healthStatus, input.healthStatus));

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
      uniformClean: CHECK_FLAG.optional(),
      hairCovered: CHECK_FLAG.optional(),
      handsClean: CHECK_FLAG.optional(),
      /** ⚠️ 미착용이 1 이다 (옛 jewelry 와 반대) */
      noJewelry: CHECK_FLAG.optional(),
      healthStatus: HEALTH_STATUS.optional(),
      notes: z.string().optional(),
      checkedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const inserted = await db.insert(hPersonalHygieneChecks).values({
        // tenant_id 는 notNull 인데 예전 구현이 채우지 않아 INSERT 자체가 실패했다
        tenantId: getEffectiveTenantId(ctx),
        siteId: input.siteId,
        employeeId: input.employeeId,
        checkDate: new Date(input.checkDate),
        uniformClean: input.uniformClean,
        hairCovered: input.hairCovered,
        handsClean: input.handsClean,
        noJewelry: input.noJewelry,
        healthStatus: input.healthStatus,
        notes: input.notes,
        checkedBy: input.checkedBy,
      });

      return { success: true, id: Number((inserted as unknown as { insertId: number | string }).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      checkDate: z.string().optional(),
      uniformClean: CHECK_FLAG.optional(),
      hairCovered: CHECK_FLAG.optional(),
      handsClean: CHECK_FLAG.optional(),
      noJewelry: CHECK_FLAG.optional(),
      healthStatus: HEALTH_STATUS.optional(),
      notes: z.string().optional(),
      checkedBy: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const updateData: Partial<typeof hPersonalHygieneChecks.$inferInsert> = {};
      if (input.checkDate !== undefined) updateData.checkDate = new Date(input.checkDate);
      if (input.uniformClean !== undefined) updateData.uniformClean = input.uniformClean;
      if (input.hairCovered !== undefined) updateData.hairCovered = input.hairCovered;
      if (input.handsClean !== undefined) updateData.handsClean = input.handsClean;
      if (input.noJewelry !== undefined) updateData.noJewelry = input.noJewelry;
      if (input.healthStatus !== undefined) updateData.healthStatus = input.healthStatus;
      if (input.notes !== undefined) updateData.notes = input.notes;
      if (input.checkedBy !== undefined) updateData.checkedBy = input.checkedBy;

      if (Object.keys(updateData).length === 0) return { success: true };

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hPersonalHygieneChecks).set(updateData)
        .where(and(eq(hPersonalHygieneChecks.id, input.id), eq(hPersonalHygieneChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hPersonalHygieneChecks)
        .where(and(eq(hPersonalHygieneChecks.id, input.id), eq(hPersonalHygieneChecks.siteId, effectiveSiteId)));

      return { success: true };
    }),
});
