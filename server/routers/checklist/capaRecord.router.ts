/**
 * 11. 개선조치(CAPA) 기록 (CAPA Records)
 *
 * ★ 2026-08-21 — 리네임 이전 컬럼명으로 쓰던 코드 교정 (Issue #431 조사 중 발견)
 *   list 는 이미 신규명(capaDate)으로 옮겨져 있었으나 create/update/verify 가 남겨졌다.
 *     issue_date             → capa_date       (notNull, 기본값 없음)
 *     action_owner           → assigned_to
 *     target_completion_date → due_date
 *     actual_completion_date → completed_at
 *     verification_result    → effectiveness
 *
 *   특히 create 는 `...input` 스프레드로 옛 이름만 넣고 capa_date(notNull)와
 *   tenant_id(notNull)를 아예 채우지 않았다. `as any` 가 타입 검사를 막아
 *   컴파일은 통과했지만 호출하면 INSERT 가 실패한다.
 *
 *   저장할 컬럼이 없어진 입력(issue_source, related_record_type/id,
 *   verification_method, remarks)은 받지 않는다. 받아놓고 버리면
 *   기록이 남은 줄 알게 되는데, CAPA 에서 그건 위험하다.
 */

import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { hCapaRecords } from "../../../drizzle/schema/schema_main";
import { eq, and, desc, sql } from "drizzle-orm";
import { getEffectiveSiteId, getEffectiveTenantId } from "./_helpers";

const STATUS = z.enum(["open", "in_progress", "completed", "verified", "closed"]);
const PRIORITY = z.enum(["low", "medium", "high", "critical"]);
const CAPA_TYPE = z.enum(["corrective", "preventive", "both"]);
/** 컬럼명은 effectiveness — 옛 verification_result 자리다 */
const EFFECTIVENESS = z.enum(["effective", "ineffective", "pending"]);

export const capaRecordRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      status: STATUS.optional(),
      priority: PRIORITY.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 강제
      const effectiveSiteId = getEffectiveSiteId(input, ctx);
      const conditions = [eq(hCapaRecords.siteId, effectiveSiteId)];
      if (input.startDate) conditions.push(sql`${hCapaRecords.capaDate} >= ${input.startDate}`);
      if (input.endDate) conditions.push(sql`${hCapaRecords.capaDate} <= ${input.endDate}`);
      if (input.status) conditions.push(eq(hCapaRecords.status, input.status));
      if (input.priority) conditions.push(eq(hCapaRecords.priority, input.priority));

      const records = await db
        .select()
        .from(hCapaRecords)
        .where(and(...conditions))
        .orderBy(desc(hCapaRecords.capaDate));

      return records;
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      siteId: z.number(),
      capaNumber: z.string(),
      capaDate: z.string(),
      capaType: CAPA_TYPE.optional(),
      problemDescription: z.string(),
      rootCauseAnalysis: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      assignedTo: z.number().optional(),
      dueDate: z.string().optional(),
      status: STATUS.default("open"),
      priority: PRIORITY.default("medium"),
      createdBy: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      const inserted = await db.insert(hCapaRecords).values({
        // 예전 구현이 채우지 않던 두 notNull 컬럼
        tenantId: getEffectiveTenantId(ctx),
        capaDate: new Date(input.capaDate),
        siteId: input.siteId,
        capaNumber: input.capaNumber,
        capaType: input.capaType,
        problemDescription: input.problemDescription,
        rootCauseAnalysis: input.rootCauseAnalysis,
        correctiveAction: input.correctiveAction,
        preventiveAction: input.preventiveAction,
        assignedTo: input.assignedTo,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        status: input.status,
        priority: input.priority,
        createdBy: input.createdBy,
      });

      return { success: true, id: Number((inserted as unknown as { insertId: number | string }).insertId) };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      capaDate: z.string().optional(),
      capaType: CAPA_TYPE.optional(),
      problemDescription: z.string().optional(),
      rootCauseAnalysis: z.string().optional(),
      correctiveAction: z.string().optional(),
      preventiveAction: z.string().optional(),
      assignedTo: z.number().optional(),
      dueDate: z.string().optional(),
      completedAt: z.string().optional(),
      effectiveness: EFFECTIVENESS.optional(),
      verifiedBy: z.number().optional(),
      status: STATUS.optional(),
      priority: PRIORITY.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // 명시적으로 채운다 — 스프레드로 넘기면 컬럼명이 어긋나도 타입이 잡아주지 못한다
      const updateData: Partial<typeof hCapaRecords.$inferInsert> = {};
      if (input.capaDate !== undefined) updateData.capaDate = new Date(input.capaDate);
      if (input.capaType !== undefined) updateData.capaType = input.capaType;
      if (input.problemDescription !== undefined) updateData.problemDescription = input.problemDescription;
      if (input.rootCauseAnalysis !== undefined) updateData.rootCauseAnalysis = input.rootCauseAnalysis;
      if (input.correctiveAction !== undefined) updateData.correctiveAction = input.correctiveAction;
      if (input.preventiveAction !== undefined) updateData.preventiveAction = input.preventiveAction;
      if (input.assignedTo !== undefined) updateData.assignedTo = input.assignedTo;
      if (input.dueDate !== undefined) updateData.dueDate = new Date(input.dueDate);
      if (input.completedAt !== undefined) updateData.completedAt = new Date(input.completedAt);
      if (input.effectiveness !== undefined) updateData.effectiveness = input.effectiveness;
      if (input.verifiedBy !== undefined) updateData.verifiedBy = input.verifiedBy;
      if (input.status !== undefined) updateData.status = input.status;
      if (input.priority !== undefined) updateData.priority = input.priority;

      if (Object.keys(updateData).length === 0) return { success: true };

      // ✅ P0 FIX: siteId 소유권 검증 후 수정
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.update(hCapaRecords).set(updateData)
        .where(and(eq(hCapaRecords.id, input.id), eq(hCapaRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      // ✅ P0 FIX: siteId 소유권 검증 후 삭제
      const effectiveSiteId = getEffectiveSiteId({ siteId: undefined }, ctx);
      await db.delete(hCapaRecords)
        .where(and(eq(hCapaRecords.id, input.id), eq(hCapaRecords.siteId, effectiveSiteId)));

      return { success: true };
    }),

  verify: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      effectiveness: EFFECTIVENESS,
      verifiedBy: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hCapaRecords).set({
        effectiveness: input.effectiveness,   // 예전 구현은 없는 컬럼 verificationResult 를 썼다
        verifiedBy: input.verifiedBy,
        verifiedAt: new Date(),
        status: "verified",
      }).where(and(eq(hCapaRecords.id, input.id), eq(hCapaRecords.tenantId, getEffectiveTenantId(ctx))));

      return { success: true };
    }),

  close: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("데이터베이스 연결 실패");

      await db.update(hCapaRecords).set({
        status: "closed",
      }).where(and(eq(hCapaRecords.id, input.id), eq(hCapaRecords.tenantId, getEffectiveTenantId(ctx))));

      return { success: true };
    }),
});
