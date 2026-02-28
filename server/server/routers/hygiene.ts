import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { hygieneChecklists } from "../../drizzle/schema";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const checkItemSchema = z.enum(["yes", "no"]).optional();

export const hygieneRouter = router({
  /**
   * 일반위생관리 체크리스트 생성
   */
  create: protectedProcedure
    .input(
      z.object({
        checkDate: z.string(), // YYYY-MM-DD
        inspector: z.string().min(1, "점검자는 필수입니다"),
        confirmer: z.string().optional(),
        item1: checkItemSchema,
        item2: checkItemSchema,
        item3: checkItemSchema,
        item4: checkItemSchema,
        item5: checkItemSchema,
        item6: checkItemSchema,
        item7: checkItemSchema,
        item8: checkItemSchema,
        item9: checkItemSchema,
        item10: checkItemSchema,
        specialNotes: z.string().optional(),
        correctiveAction: z.string().optional(),
        confirmation: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });

      const [checklist] = await db.insert(hygieneChecklists).values({
        ...input,
        checkDate: new Date(input.checkDate),
        createdBy: Number(ctx.user.id),
      });

      return { success: true, id: checklist.insertId };
    }),

  /**
   * 일반위생관리 체크리스트 수정
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        checkDate: z.string().optional(),
        inspector: z.string().optional(),
        confirmer: z.string().optional(),
        item1: checkItemSchema,
        item2: checkItemSchema,
        item3: checkItemSchema,
        item4: checkItemSchema,
        item5: checkItemSchema,
        item6: checkItemSchema,
        item7: checkItemSchema,
        item8: checkItemSchema,
        item9: checkItemSchema,
        item10: checkItemSchema,
        specialNotes: z.string().optional(),
        correctiveAction: z.string().optional(),
        confirmation: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });

      const { id, checkDate, ...data } = input;
      await db.update(hygieneChecklists).set({
        ...data,
        ...(checkDate && { checkDate: new Date(checkDate) }),
      }).where(eq(hygieneChecklists.id, id));
      return { success: true };
    }),

  /**
   * 일반위생관리 체크리스트 삭제
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });

      await db.delete(hygieneChecklists).where(eq(hygieneChecklists.id, input.id));
      return { success: true };
    }),

  /**
   * 일반위생관리 체크리스트 목록 조회
   */
  list: protectedProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        approvalStatus: z.enum(["draft", "pending_review", "approved", "rejected"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const conditions = [];
      if (input.startDate) {
        conditions.push(gte(hygieneChecklists.checkDate, new Date(input.startDate)));
      }
      if (input.endDate) {
        conditions.push(lte(hygieneChecklists.checkDate, new Date(input.endDate)));
      }
      if (input.approvalStatus) {
        conditions.push(eq(hygieneChecklists.approvalStatus, input.approvalStatus));
      }

      const query = conditions.length > 0
        ? db.select().from(hygieneChecklists).where(and(...conditions))
        : db.select().from(hygieneChecklists);

      const checklists = await query.orderBy(desc(hygieneChecklists.checkDate));
      return checklists;
    }),

  /**
   * 일반위생관리 체크리스트 상세 조회
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });

      const [checklist] = await db
        .select()
        .from(hygieneChecklists)
        .where(eq(hygieneChecklists.id, input.id));

      if (!checklist) {
        throw new TRPCError({ code: "NOT_FOUND", message: "체크리스트를 찾을 수 없습니다" });
      }

      return checklist;
    }),

  /**
   * 결재 요청
   */
  submitForApproval: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });

      await db
        .update(hygieneChecklists)
        .set({ approvalStatus: "pending_review" })
        .where(eq(hygieneChecklists.id, input.id));

      return { success: true };
    }),

  /**
   * 승인
   */
  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });

      await db
        .update(hygieneChecklists)
        .set({ approvalStatus: "approved" })
        .where(eq(hygieneChecklists.id, input.id));

      return { success: true };
    }),

  /**
   * 반려
   */
  reject: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "데이터베이스 연결 실패" });

      await db
        .update(hygieneChecklists)
        .set({
          approvalStatus: "rejected",
          confirmation: input.reason,
        })
        .where(eq(hygieneChecklists.id, input.id));

      return { success: true };
    }),
});
