import { router, protectedProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { checklistSchedules, checklistTemplates } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * 체크리스트 스케줄 라우터
 * 주기 관리 (DAILY/WEEKLY/MONTHLY/YEARLY/INTERVAL)
 */

export const checklistScheduleRouter = router({
  /**
   * 템플릿 목록 조회 (스케줄 생성용)
   */
  getTemplates: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const templates = await db
      .select()
      .from(checklistTemplates)
      .where(eq(checklistTemplates.isActive, 1));

    return templates;
  }),

  /**
   * 스케줄 목록 조회
   */
  list: protectedProcedure
    .input(
      z.object({
        templateId: z.number().optional(),
        frequencyType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "INTERVAL"]).optional(),
        active: z.boolean().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // ✅ P0 FIX: 조건이 비면 전체조회 방지 (checklistSchedules에 tenantId 컬럼 추가 권장)
      const conditions = [];

      if (input.templateId) {
        conditions.push(eq(checklistSchedules.templateId, input.templateId));
      }

      if (input.frequencyType) {
        conditions.push(eq(checklistSchedules.frequencyType, input.frequencyType));
      }

      if (input.active !== undefined) {
        conditions.push(eq(checklistSchedules.active, input.active ? 1 : 0));
      }

      const schedules = await db
        .select()
        .from(checklistSchedules)
        .where(conditions.length > 0 ? and(...conditions) : sql`1=0`)
        .orderBy(desc(checklistSchedules.createdAt));

      // 템플릿 정보 추가
      const schedulesWithTemplate = await Promise.all(
        schedules.map(async (schedule: any) => {
          const templates = await db
            .select()
            .from(checklistTemplates)
            .where(eq(checklistTemplates.id, schedule.templateId))
            .limit(1);

          return {
            ...schedule,
            template: templates[0] || null,
          };
        })
      );

      return schedulesWithTemplate;
    }),

  /**
   * 스케줄 상세 조회
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const schedules = await db
        .select()
        .from(checklistSchedules)
        .where(eq(checklistSchedules.id, input.id))
        .limit(1);

      const schedule = schedules[0];

      if (!schedule) {
        throw new Error("스케줄을 찾을 수 없습니다.");
      }

      // 템플릿 정보 추가
      const templates = await db
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, schedule.templateId))
        .limit(1);

      return {
        ...schedule,
        template: templates[0] || null,
      };
    }),

  /**
   * 스케줄 생성
   */
  create: protectedProcedure
    .input(
      z.object({
        templateId: z.number(),
        frequencyType: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "INTERVAL"]),
        rule: z.record(z.string(), z.any()), // JSON
        dueTime: z.string().optional(), // HH:mm
        gracePeriodHours: z.number().default(0),
        autoGenerate: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 템플릿 존재 확인
      const templates = await db
        .select()
        .from(checklistTemplates)
        .where(eq(checklistTemplates.id, input.templateId))
        .limit(1);

      if (!templates[0]) {
        throw new Error("템플릿을 찾을 수 없습니다.");
      }

      // 스케줄 생성
      const result = await db.insert(checklistSchedules).values({
        templateId: input.templateId,
        frequencyType: input.frequencyType,
        rule: input.rule,
        dueTime: input.dueTime || null,
        gracePeriodHours: input.gracePeriodHours,
        autoGenerate: input.autoGenerate ? 1 : 0,
        active: 1,
        createdBy: ctx.user.id,
        // ✅ P0 TODO: tenantId 컬럼 추가 후 아래 주석 해제
        // tenantId: ctx.tenantId ?? ctx.user?.tenantId,
      });

      return {
        success: true,
        scheduleId: Number(result[0].insertId),
      };
    }),

  /**
   * 스케줄 수정
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        rule: z.record(z.string(), z.any()).optional(),
        dueTime: z.string().optional(),
        gracePeriodHours: z.number().optional(),
        autoGenerate: z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // ✅ P0 FIX: 스케줄 존재 확인 (tenantId 컬럼 추가 후 소유권 검증 추가 필요)
      const schedules = await db
        .select()
        .from(checklistSchedules)
        .where(eq(checklistSchedules.id, input.id))
        .limit(1);

      if (!schedules[0]) {
        throw new Error("스케줄을 찾을 수 없습니다.");
      }

      // 업데이트
      const updates: any = {};

      if (input.rule !== undefined) {
        updates.rule = input.rule;
      }

      if (input.dueTime !== undefined) {
        updates.dueTime = input.dueTime;
      }

      if (input.gracePeriodHours !== undefined) {
        updates.gracePeriodHours = input.gracePeriodHours;
      }

      if (input.autoGenerate !== undefined) {
        updates.autoGenerate = input.autoGenerate ? 1 : 0;
      }

      await db.update(checklistSchedules).set(updates).where(eq(checklistSchedules.id, input.id));

      return { success: true };
    }),

  /**
   * 스케줄 삭제
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 스케줄 존재 확인
      const schedules = await db
        .select()
        .from(checklistSchedules)
        .where(eq(checklistSchedules.id, input.id))
        .limit(1);

      if (!schedules[0]) {
        throw new Error("스케줄을 찾을 수 없습니다.");
      }

      await db.delete(checklistSchedules).where(eq(checklistSchedules.id, input.id));

      return { success: true };
    }),

  /**
   * 스케줄 활성화/비활성화
   */
  toggleActive: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        active: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 스케줄 존재 확인
      const schedules = await db
        .select()
        .from(checklistSchedules)
        .where(eq(checklistSchedules.id, input.id))
        .limit(1);

      if (!schedules[0]) {
        throw new Error("스케줄을 찾을 수 없습니다.");
      }

      await db
        .update(checklistSchedules)
        .set({ active: input.active ? 1 : 0 })
        .where(eq(checklistSchedules.id, input.id));

      return { success: true };
    }),
});
