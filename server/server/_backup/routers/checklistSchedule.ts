import { router, tenantRequiredProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getDb } from "../db";
import { checklistSchedules, checklistTemplates } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * 체크리스트 스케줄 라우터
 * 주기 관리 (DAILY/WEEKLY/MONTHLY/YEARLY/INTERVAL)
 *
 * ✅ P0 SECURITY FIX:
 * - protectedProcedure → tenantRequiredProcedure 전환
 *   (슈퍼관리자도 actingTenantId 없으면 403)
 * - 모든 조회/수정/삭제에 tenantId 필터 강제
 * - 소유권 검증: schedule/template 접근 시 tenantId 교차 확인
 */

// ─────────────────────────────────────────────
// 내부 헬퍼: 스케줄 소유권 검증 (tenantId 교차 확인)
// ─────────────────────────────────────────────
async function assertScheduleOwnership(
  db: any,
  scheduleId: number,
  tenantId: number
) {
  const rows = await db
    .select()
    .from(checklistSchedules)
    .where(
      and(
        eq(checklistSchedules.id, scheduleId),
        eq(checklistSchedules.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!rows[0]) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "스케줄을 찾을 수 없거나 접근 권한이 없습니다.",
    });
  }
  return rows[0];
}

// ─────────────────────────────────────────────
// 내부 헬퍼: 템플릿 소유권 검증 (tenantId 교차 확인)
// ─────────────────────────────────────────────
async function assertTemplateOwnership(
  db: any,
  templateId: number,
  tenantId: number
) {
  const rows = await db
    .select()
    .from(checklistTemplates)
    .where(
      and(
        eq(checklistTemplates.id, templateId),
        eq(checklistTemplates.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!rows[0]) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "템플릿을 찾을 수 없거나 접근 권한이 없습니다.",
    });
  }
  return rows[0];
}

export const checklistScheduleRouter = router({
  /**
   * 템플릿 목록 조회 (스케줄 생성용)
   * ✅ tenantId 필터 강제 - 내 테넌트 소유 템플릿만 반환
   */
  getTemplates: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const tenantId = ctx.tenantId!;

    const templates = await db
      .select()
      .from(checklistTemplates)
      .where(
        and(
          eq(checklistTemplates.tenantId, tenantId),
          eq(checklistTemplates.isActive, 1)
        )
      );

    return templates;
  }),

  /**
   * 스케줄 목록 조회
   * ✅ tenantId 필터 필수 - 내 테넌트 스케줄만 조회
   */
  list: tenantRequiredProcedure
    .input(
      z.object({
        templateId: z.number().optional(),
        frequencyType: z
          .enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "INTERVAL"])
          .optional(),
        active: z.boolean().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenantId = ctx.tenantId!;

      // ✅ tenantId 기본 조건 필수
      const conditions: any[] = [eq(checklistSchedules.tenantId, tenantId)];

      if (input.templateId !== undefined) {
        conditions.push(eq(checklistSchedules.templateId, input.templateId));
      }

      if (input.frequencyType) {
        conditions.push(
          eq(checklistSchedules.frequencyType, input.frequencyType)
        );
      }

      if (input.active !== undefined) {
        conditions.push(
          eq(checklistSchedules.active, input.active ? 1 : 0)
        );
      }

      const schedules = await db
        .select()
        .from(checklistSchedules)
        .where(and(...conditions))
        .orderBy(desc(checklistSchedules.createdAt));

      // 템플릿 정보 추가 (같은 테넌트 소유 템플릿만)
      const schedulesWithTemplate = await Promise.all(
        schedules.map(async (schedule: any) => {
          const templates = await db
            .select()
            .from(checklistTemplates)
            .where(
              and(
                eq(checklistTemplates.id, schedule.templateId),
                eq(checklistTemplates.tenantId, tenantId)
              )
            )
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
   * ✅ tenantId 교차 검증 - 타 테넌트 접근 차단
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenantId = ctx.tenantId!;

      // ✅ 소유권 검증 포함 조회
      const schedule = await assertScheduleOwnership(db, input.id, tenantId);

      // 템플릿 정보 추가 (같은 테넌트 소유 확인)
      const templates = await db
        .select()
        .from(checklistTemplates)
        .where(
          and(
            eq(checklistTemplates.id, schedule.templateId),
            eq(checklistTemplates.tenantId, tenantId)
          )
        )
        .limit(1);

      return {
        ...schedule,
        template: templates[0] || null,
      };
    }),

  /**
   * 스케줄 생성
   * ✅ tenantId 저장 + 템플릿 소유권 검증
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        templateId: z.number(),
        frequencyType: z.enum([
          "DAILY",
          "WEEKLY",
          "MONTHLY",
          "YEARLY",
          "INTERVAL",
        ]),
        rule: z.record(z.string(), z.any()), // JSON
        dueTime: z.string().optional(), // HH:mm
        gracePeriodHours: z.number().default(0),
        autoGenerate: z.boolean().default(true),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenantId = ctx.tenantId!;

      // ✅ 템플릿이 내 테넌트 소유인지 검증
      await assertTemplateOwnership(db, input.templateId, tenantId);

      // 스케줄 생성 - tenantId 저장
      const result = await db.insert(checklistSchedules).values({
        tenantId,                         // ✅ P0 FIX: 테넌트 격리 컬럼 저장
        templateId: input.templateId,
        frequencyType: input.frequencyType,
        rule: input.rule,
        dueTime: input.dueTime || null,
        gracePeriodHours: input.gracePeriodHours,
        autoGenerate: input.autoGenerate ? 1 : 0,
        active: 1,
        createdBy: ctx.user.id,
      });

      return {
        success: true,
        scheduleId: Number(result[0].insertId),
      };
    }),

  /**
   * 스케줄 수정
   * ✅ tenantId 교차 검증 후 수정
   */
  update: tenantRequiredProcedure
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

      const tenantId = ctx.tenantId!;

      // ✅ 소유권 검증
      await assertScheduleOwnership(db, input.id, tenantId);

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

      // ✅ WHERE 절에 tenantId 추가 (이중 보호)
      await db
        .update(checklistSchedules)
        .set(updates)
        .where(
          and(
            eq(checklistSchedules.id, input.id),
            eq(checklistSchedules.tenantId, tenantId)
          )
        );

      return { success: true };
    }),

  /**
   * 스케줄 삭제
   * ✅ tenantId 교차 검증 후 삭제
   */
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenantId = ctx.tenantId!;

      // ✅ 소유권 검증
      await assertScheduleOwnership(db, input.id, tenantId);

      // ✅ WHERE 절에 tenantId 추가 (이중 보호)
      await db
        .delete(checklistSchedules)
        .where(
          and(
            eq(checklistSchedules.id, input.id),
            eq(checklistSchedules.tenantId, tenantId)
          )
        );

      return { success: true };
    }),

  /**
   * 스케줄 활성화/비활성화
   * ✅ tenantId 교차 검증 후 토글
   */
  toggleActive: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        active: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenantId = ctx.tenantId!;

      // ✅ 소유권 검증
      await assertScheduleOwnership(db, input.id, tenantId);

      // ✅ WHERE 절에 tenantId 추가 (이중 보호)
      await db
        .update(checklistSchedules)
        .set({ active: input.active ? 1 : 0 })
        .where(
          and(
            eq(checklistSchedules.id, input.id),
            eq(checklistSchedules.tenantId, tenantId)
          )
        );

      return { success: true };
    }),
});
