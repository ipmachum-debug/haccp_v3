import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import * as txService from "../../services/bank/bankTransaction.service";

export const bankTransactionRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({
      bankAccountId: z.number().optional(),
      matchingStatus: z.enum(["unmatched", "partial", "matched"]).optional(),
      approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
      transactionType: z.enum(["deposit", "withdrawal"]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      search: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      return txService.listTransactions(ctx.tenantId, input);
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return txService.getTransactionById(ctx.tenantId, input.id);
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      bankAccountId: z.number(),
      transactionDate: z.string(),
      transactionType: z.enum(["deposit", "withdrawal"]),
      amount: z.number().positive(),
      balance: z.number().optional(),
      description: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await txService.createTransaction(ctx.tenantId, input);
      return { id, message: "거래가 등록되었습니다." };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      transactionDate: z.string().optional(),
      amount: z.number().positive().optional(),
      balance: z.number().optional(),
      description: z.string().optional(),
      memo: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await txService.updateTransaction(ctx.tenantId, id, data);
      return { message: "거래 정보가 수정되었습니다." };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await txService.deleteTransaction(ctx.tenantId, input.id);
      return { message: "거래가 삭제되었습니다." };
    }),

  match: tenantRequiredProcedure
    .input(z.object({ id: z.number(), accountingAccountId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await txService.matchTransaction(ctx.tenantId, input.id, input.accountingAccountId, ctx.user.id);
      return { message: "매칭이 완료되었습니다." };
    }),

  unmatch: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await txService.unmatchTransaction(ctx.tenantId, input.id);
      return { message: "매칭이 해제되었습니다." };
    }),

  approve: tenantRequiredProcedure
    .input(z.object({ id: z.number(), confirmedAmount: z.number().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      await txService.approveTransaction(ctx.tenantId, input.id, input.confirmedAmount);
      return { message: "거래가 승인되었습니다." };
    }),

  reject: tenantRequiredProcedure
    .input(z.object({ id: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await txService.rejectTransaction(ctx.tenantId, input.id, input.reason);
      return { message: "거래가 반려되었습니다." };
    }),

  bulkDelete: tenantRequiredProcedure
    .input(z.object({ ids: z.array(z.number()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await txService.bulkDeleteTransactions(ctx.tenantId, input.ids);
      return { message: `${deleted}건의 거래가 삭제되었습니다.`, deleted };
    }),

  deleteAll: tenantRequiredProcedure
    .input(z.object({ bankAccountId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const affected = await txService.deleteAllByAccount(ctx.tenantId, input.bankAccountId);
      return { message: `모든 거래가 삭제되었습니다. (${affected}건)`, deleted: affected };
    }),
});
