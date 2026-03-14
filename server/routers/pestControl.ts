import { z } from "zod";
import { tenantRequiredProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { pestControlChecklists, pestControlItems } from "../../drizzle/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { requireTenantId } from "../helpers/tenantGuards";

const pestControlItemSchema = z.object({
  location: z.string().min(1, "위치는 필수입니다"),
  deviceType: z.enum(["trap_light", "trap_box"]),
  captureCount: z.number().int().min(0),
  notes: z.string().optional(),
});

export const pestControlRouter = router({
  /**
   * 방충방서 점검표 생성
   */
  create: tenantRequiredProcedure
    .input(
      z.object({
        checkDate: z.string(), // YYYY-MM-DD
        inspector: z.string().min(1, "점검자는 필수입니다"),
        confirmer: z.string().optional(),
        specialNotes: z.string().optional(),
        correctiveAction: z.string().optional(),
        items: z.array(pestControlItemSchema),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
      const tenantId = requireTenantId(ctx);

      const { items, ...checklistData } = input;

      // 체크리스트 생성
      const [checklist] = await db.insert(pestControlChecklists).values({
        ...checklistData,
        tenantId,
        checkDate: new Date(input.checkDate),
        createdBy: Number(ctx.user.id),
      });

      // 점검 항목 생성
      if (items.length > 0) {
        await db.insert(pestControlItems).values(
          items.map((item) => ({
            checklistId: checklist.insertId,
            ...item,
          })) as any);
      }

      return { success: true, id: checklist.insertId };
    }),

  /**
   * 방충방서 점검표 수정
   */
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        checkDate: z.string().optional(),
        inspector: z.string().optional(),
        confirmer: z.string().optional(),
        specialNotes: z.string().optional(),
        correctiveAction: z.string().optional(),
        items: z.array(pestControlItemSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
      const tenantId = requireTenantId(ctx);

      const { id, items, checkDate, ...checklistData } = input;

      // 체크리스트 수정 (테넌트 조건 추가)
      const updateData = {
        ...checklistData,
        ...(checkDate ? { checkDate: new Date(checkDate) } : {}),
      };
      await db.update(pestControlChecklists).set(updateData).where(
        and(eq(pestControlChecklists.id, id), eq(pestControlChecklists.tenantId, tenantId))
      );

      // 점검 항목 수정 (기존 삭제 후 재생성)
      if (items) {
        await db.delete(pestControlItems).where(eq(pestControlItems.checklistId, id));
        if (items.length > 0) {
          await db.insert(pestControlItems).values(
            items.map((item) => ({
              checklistId: id,
              ...item,
            })) as any);
        }
      }

      return { success: true };
    }),

  /**
   * 방충방서 점검표 삭제
   */
  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
      const tenantId = requireTenantId(ctx);

      await db.delete(pestControlChecklists).where(
        and(eq(pestControlChecklists.id, input.id), eq(pestControlChecklists.tenantId, tenantId))
      );
      return { success: true };
    }),

  /**
   * 방충방서 점검표 목록 조회
   */
  list: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        approvalStatus: z.enum(["draft", "pending_review", "approved", "rejected"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = requireTenantId(ctx);

      const conditions: any[] = [eq(pestControlChecklists.tenantId, tenantId)];
      if (input.startDate) {
        conditions.push(gte(pestControlChecklists.checkDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(pestControlChecklists.checkDate, new Date(input.endDate)));
      }
      if (input.approvalStatus) {
        conditions.push(eq(pestControlChecklists.approvalStatus, input.approvalStatus));
      }

      const checklists = await db
        .select()
        .from(pestControlChecklists)
        .where(and(...conditions))
        .orderBy(desc(pestControlChecklists.checkDate));
      return checklists;
    }),

  /**
   * 방충방서 점검표 상세 조회
   */
  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
      const tenantId = requireTenantId(ctx);

      const [checklist] = await db
        .select()
        .from(pestControlChecklists)
        .where(and(eq(pestControlChecklists.id, input.id), eq(pestControlChecklists.tenantId, tenantId)));

      if (!checklist) {
        throw new TRPCError({ code: "NOT_FOUND", message: "체크리스트를 찾을 수 없습니다" });
      }

      // 점검 항목 조회
      const items = await db
        .select()
        .from(pestControlItems)
        .where(eq(pestControlItems.checklistId, input.id));

      return { ...checklist, items };
    }),

  /**
   * 결재 요청
   */
  submitForApproval: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
      const tenantId = requireTenantId(ctx);

      await db
        .update(pestControlChecklists)
        .set({ approvalStatus: "pending_review" })
        .where(and(eq(pestControlChecklists.id, input.id), eq(pestControlChecklists.tenantId, tenantId)));

      return { success: true };
    }),

  /**
   * 승인
   */
  approve: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
      const tenantId = requireTenantId(ctx);

      await db
        .update(pestControlChecklists)
        .set({ approvalStatus: "approved" })
        .where(and(eq(pestControlChecklists.id, input.id), eq(pestControlChecklists.tenantId, tenantId)));

      return { success: true };
    }),

  /**
   * 반려
   */
  reject: tenantRequiredProcedure
    .input(z.object({ id: z.number(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });
      const tenantId = requireTenantId(ctx);

      await db
        .update(pestControlChecklists)
        .set({
          approvalStatus: "rejected",
          correctiveAction: input.reason,
        })
        .where(and(eq(pestControlChecklists.id, input.id), eq(pestControlChecklists.tenantId, tenantId)));

      return { success: true };
    }),
});
