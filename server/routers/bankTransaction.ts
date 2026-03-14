import { router, protectedTenantProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { bankTransactions } from "../../drizzle/schema";
import { eq, and, gte, lte, like, or, sql, desc, inArray } from "drizzle-orm";

export const bankTransactionRouter = router({
  // 거래 내역 조회
  list: protectedTenantProcedure
    .input(
      z.object({
        bankAccountId: z.number().optional(),
        matchingStatus: z.enum(["unmatched", "partial", "matched"]).optional(),
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

      const conditions = [eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) ];

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
        conditions.push(gte(bankTransactions.transactionDate, new Date(input.startDate)));
      }
      if (input?.endDate) {
        conditions.push(lte(bankTransactions.transactionDate, new Date(input.endDate)));
      }
      if (input?.search) {
        conditions.push(
          or(
            like(bankTransactions.description, `%${input.search}%`),
            like(bankTransactions.memo, `%${input.search}%`)
          )!
        );
      }

      const whereClause = and(...conditions);

      const transactions = await db
        .select()
        .from(bankTransactions)
        .where(whereClause)
        .orderBy(desc(bankTransactions.transactionDate))
        .limit(limit)
        .offset(offset);

      // count 쿼리 - $count 대신 sql raw 사용 (호환성)
      const countResult = await db
        .select({ cnt: sql<number>`count(*)` })
        .from(bankTransactions)
        .where(whereClause);

      return {
        items: transactions,
        total: Number(countResult[0]?.cnt || 0),
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
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
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
        tenantId: ctx.tenantId ?? undefined,
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
      } as any);

      return { id: Number((result as any).insertId), message: "거래가 등록되었습니다." };
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
        .set(updateData as any)
        .where(
          and(
            eq(bankTransactions.id, id),
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
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
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
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
          matchedAt: new Date(),
        })
        .where(
          and(
            eq(bankTransactions.id, input.id),
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
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
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
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
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
          )
        )
        .limit(1);

      if (!transaction || transaction.length === 0) {
        throw new Error("거래 내역을 찾을 수 없습니다.");
      }

      if (transaction[0].isLargeAmount === "Y" && !input.confirmedAmount) {
        throw new Error("고액 거래는 금액 재확인이 필요합니다.");
      }

      if (input.confirmedAmount && Math.abs(Number(transaction[0].amount) - input.confirmedAmount) > 0.01) {
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
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
          )
        );

      return { message: "거래가 승인되었습니다." };
    }),

  // 거래 반려
  reject: protectedTenantProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .update(bankTransactions)
        .set({
          approvalStatus: "rejected",
          rejectionReason: input.reason || null,
        })
        .where(
          and(
            eq(bankTransactions.id, input.id),
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
          )
        );

      return { message: "거래가 반려되었습니다." };
    }),

  // 선택 삭제 (여러 건)
  bulkDelete: protectedTenantProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .delete(bankTransactions)
        .where(
          and(
            inArray(bankTransactions.id, input.ids),
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
          )
        );

      return { message: `${input.ids.length}건의 거래가 삭제되었습니다.`, deleted: input.ids.length };
    }),

  // 계좌별 전체 삭제
  deleteAll: protectedTenantProcedure
    .input(z.object({ bankAccountId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const result: any = await db
        .delete(bankTransactions)
        .where(
          and(
            eq(bankTransactions.bankAccountId, input.bankAccountId),
            eq(bankTransactions.tenantId, ctx.tenantId ?? undefined as any) 
          )
        );

      const affected = result?.[0]?.affectedRows ?? result?.rowCount ?? 0;
      return { message: `모든 거래가 삭제되었습니다. (${affected}건)`, deleted: affected };
    }),
});
