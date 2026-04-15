import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import * as accountService from "../../services/bank/bankAccount.service";

export const bankAccountRouter = router({
  list: tenantRequiredProcedure
    .input(z.object({ isActive: z.enum(["Y", "N"]).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const accounts = await accountService.listAccounts(ctx.tenantId, input);
      return { accounts };
    }),

  getById: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      return accountService.getAccountById(ctx.tenantId, input.id);
    }),

  create: tenantRequiredProcedure
    .input(z.object({
      bankName: z.string().min(1, "은행명을 입력해주세요"),
      accountNo: z.string().min(1, "계좌번호를 입력해주세요"),
      accountName: z.string().optional(),
      accountType: z.enum(["checking", "savings", "investment", "other"]).default("checking"),
      currency: z.string().default("KRW"),
      defaultAccountingAccountId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const id = await accountService.createAccount(ctx.tenantId, ctx.user.id, input);
      return { id, message: "계좌가 등록되었습니다." };
    }),

  update: tenantRequiredProcedure
    .input(z.object({
      id: z.number(),
      bankName: z.string().min(1).optional(),
      accountNo: z.string().min(1).optional(),
      accountName: z.string().optional(),
      accountType: z.enum(["checking", "savings", "investment", "other"]).optional(),
      currency: z.string().optional(),
      defaultAccountingAccountId: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await accountService.updateAccount(ctx.tenantId, id, data);
      return { message: "계좌 정보가 수정되었습니다." };
    }),

  delete: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await accountService.deactivateAccount(ctx.tenantId, input.id);
      return { message: "계좌가 비활성화되었습니다." };
    }),

  getStats: tenantRequiredProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      return accountService.getAccountStats(ctx.tenantId, input.accountId);
    }),
});
