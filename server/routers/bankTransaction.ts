import { router, protectedTenantProcedure } from "../trpc";
import { z } from "zod";
import { getDb } from "../db";
import { bankTransactions } from "../../drizzle/schema";
import { eq, and, gte, lte, like, or } from "drizzle-orm";

export const bankTransactionRouter = router({
  // 거래 내역 조회
  list: protectedTenantProcedure
    .input(
      z.object({
        bankAccountId: z.number().optional(),
        matchingStatus: z.enum(["unmatched", "matched"]).optional(),
        approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
        transactionType: z.enum(["deposit", "withdrawal"]).optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        search: z.string().optional(),
        page: z.number().default(1),
        limit: z.number().default(50),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const page = input?.page || 1;
      const limit = input?.limit || 50;
      const offset = (page - 1) * limit;

      const conditions = [eq(bankTransactions.tenantId, ctx.user.tenantId)];

      if (input?.bankAccountId) {
        conditions.push(eq(bankTransactions.bankAccountId, input.bankAccountId));
      }
      if (input?.matchingStatus) {
        conditions.push(eq(bankTransactions.matchingStatus, input.matchingStatus));
      }
      if (input?.approvalStatus) {
        conditions.push(eq(bankTransactions.approvalStatus, input.approvalStatus));
      }
      if (input?.transactionType) {
        conditions.push(eq(bankTransactions.transactionType, input.transactionType));
      }
      if (input?.startDate) {
        conditions.push(gte(bankTransactions.transactionDate, input.startDate));
      }
      if (input?.endDate) {
        conditions.push(lte(bankTransactions.transactionDate, input.endDate));
      }
      if (input?.search) {
        conditions.push(
          or(
            like(bankTransactions.description, `%${input.search}%`),
            like(bankTransactions.memo, `%${input.search}%`)
          )!
        );
      }

      const transactions = await db
        .select()
        .from(bankTransactions)
        .where(and(...conditions))
        .orderBy(bankTransactions.transactionDate)
        .limit(limit)
        .offset(offset);

      const [{ count }] = await db
        .select({ count: db.$count(bankTransactions.id) })
        .from(bankTransactions)
        .where(and(...conditions));

      return {
        items: transactions,
        total: count,
        page,
        limit,
      };
    }),

  // 거래 상세 조회
  getById: protectedTenantProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const transaction = await db
        .select()
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.id, input.id),
            eq(bankTransactions.tenantId, ctx.user.tenantId)
          )
        )
        .limit(1);

      if (!transaction || transaction.length === 0) {
        throw new Error("거래 내역을 찾을 수 없습니다.");
      }

      return transaction[0];
    }),

  // 거래 등록
  create: protectedTenantProcedure
    .input(
      z.object({
        bankAccountId: z.number(),
        transactionDate: z.string(),
        transactionType: z.enum(["deposit", "withdrawal"]),
        amount: z.number().positive(),
        balance: z.number().optional(),
        description: z.string().optional(),
        memo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const isLargeAmount = input.amount >= 5000000;

      const result = await db.insert(bankTransactions).values({
        tenantId: ctx.user.tenantId,
        bankAccountId: input.bankAccountId,
        transactionDate: input.transactionDate,
        transactionType: input.transactionType,
        amount: input.amount,
        balance: input.balance,
        description: input.description,
        memo: input.memo,
        matchingStatus: "unmatched",
        approvalStatus: "pending",
        isLargeAmount: isLargeAmount ? "Y" : "N",
      });

      return { id: Number(result.insertId), message: "거래가 등록되었습니다." };
    }),

  // 거래 수정
  update: protectedTenantProcedure
    .input(
      z.object({
        id: z.number(),
        transactionDate: z.string().optional(),
        amount: z.number().positive().optional(),
        balance: z.number().optional(),
        description: z.string().optional(),
        memo: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const { id, ...updateData } = input;

      // 금액이 변경되면 고액 거래 플래그 재설정
      if (updateData.amount) {
        (updateData as any).isLargeAmount = updateData.amount >= 5000000 ? "Y" : "N";
      }

      await db
        .update(bankTransactions)
        .set(updateData)
        .where(
          and(
            eq(bankTransactions.id, id),
            eq(bankTransactions.tenantId, ctx.user.tenantId)
          )
        );

      return { message: "거래 정보가 수정되었습니다." };
    }),

  // 거래 삭제
  delete: protectedTenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .delete(bankTransactions)
        .where(
          and(
            eq(bankTransactions.id, input.id),
            eq(bankTransactions.tenantId, ctx.user.tenantId)
          )
        );

      return { message: "거래가 삭제되었습니다." };
    }),

  // 수동 매칭
  match: protectedTenantProcedure
    .input(
      z.object({
        id: z.number(),
        accountingAccountId: z.number(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .update(bankTransactions)
        .set({
          matchingStatus: "matched",
          accountingAccountId: input.accountingAccountId,
          matchedBy: ctx.user.id,
          matchedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(bankTransactions.id, input.id),
            eq(bankTransactions.tenantId, ctx.user.tenantId)
          )
        );

      return { message: "매칭이 완료되었습니다." };
    }),

  // 매칭 해제
  unmatch: protectedTenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .update(bankTransactions)
        .set({
          matchingStatus: "unmatched",
          accountingAccountId: null,
          matchedBy: null,
          matchedAt: null,
        })
        .where(
          and(
            eq(bankTransactions.id, input.id),
            eq(bankTransactions.tenantId, ctx.user.tenantId)
          )
        );

      return { message: "매칭이 해제되었습니다." };
    }),

  // 거래 승인
  approve: protectedTenantProcedure
    .input(
      z.object({
        id: z.number(),
        confirmedAmount: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      // 고액 거래인 경우 금액 재확인 필수
      const transaction = await db
        .select()
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.id, input.id),
            eq(bankTransactions.tenantId, ctx.user.tenantId)
          )
        )
        .limit(1);

      if (!transaction || transaction.length === 0) {
        throw new Error("거래 내역을 찾을 수 없습니다.");
      }

      if (transaction[0].isLargeAmount === "Y" && !input.confirmedAmount) {
        throw new Error("고액 거래는 금액 재확인이 필요합니다.");
      }

      if (input.confirmedAmount && Math.abs(transaction[0].amount - input.confirmedAmount) > 0.01) {
        throw new Error("확인된 금액이 일치하지 않습니다.");
      }

      await db
        .update(bankTransactions)
        .set({
          approvalStatus: "approved",
        })
        .where(
          and(
            eq(bankTransactions.id, input.id),
            eq(bankTransactions.tenantId, ctx.user.tenantId)
          )
        );

      return { message: "거래가 승인되었습니다." };
    }),

  // 거래 반려
  reject: protectedTenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .update(bankTransactions)
        .set({
          approvalStatus: "rejected",
        })
        .where(
          and(
            eq(bankTransactions.id, input.id),
            eq(bankTransactions.tenantId, ctx.user.tenantId)
          )
        );

      return { message: "거래가 반려되었습니다." };
    }),
});
