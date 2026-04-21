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
    .input(z.object({
      id: z.number(),
      accountingAccountId: z.number(),
      learnRule: z.boolean().optional().default(true), // ★ 2026-04-14: 규칙 자동 학습 (기본 ON)
    }))
    .mutation(async ({ ctx, input }) => {
      const result = await txService.matchTransaction(
        ctx.tenantId,
        input.id,
        input.accountingAccountId,
        ctx.user.id,
        { learnRule: input.learnRule },
      );
      const learnedMsg = result?.learnedRule?.created
        ? ` (규칙 학습: "${result.learnedRule.keyword}")`
        : "";
      return { message: `매칭이 완료되었습니다.${learnedMsg}`, learnedRule: result?.learnedRule };
    }),

  unmatch: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await txService.unmatchTransaction(ctx.tenantId, input.id);
      return { message: "매칭이 해제되었습니다." };
    }),

  /**
   * ★ 2026-04-14: 거래처 미수 AR 목록 조회 (입금 매칭용)
   */
  listOpenArByPartner: tenantRequiredProcedure
    .input(z.object({ partnerId: z.number() }))
    .query(async ({ ctx, input }) => {
      return txService.listOpenArByPartner(ctx.tenantId, input.partnerId);
    }),

  /**
   * ★ 2026-04-14: 입금 거래를 AR 회수로 매칭
   * 하나의 입금을 여러 미수 AR 에 분할 할당 가능
   */
  matchAsArRecovery: tenantRequiredProcedure
    .input(
      z.object({
        transactionId: z.number(),
        partnerId: z.number(),
        arAllocations: z
          .array(
            z.object({
              arLedgerId: z.number(),
              amount: z.number().positive(),
            }),
          )
          .min(1, "AR 할당이 최소 1개 필요"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return await txService.matchTransactionAsArRecovery(
        ctx.tenantId,
        input.transactionId,
        input.partnerId,
        input.arAllocations,
        ctx.user.id,
      );
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

  /**
   * AI 자동분류 — 미매칭 거래에 계정과목 추천
   */
  aiClassify: tenantRequiredProcedure
    .input(z.object({
      transactionId: z.number().optional(),
      limit: z.number().default(10),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      try {
        if (input?.transactionId) {
          // 개별 거래 분류
          const { getPool } = await import("../../db/pool");
          const pool = getPool();
          const [rows]: any = await pool.execute(
            `SELECT description, amount, transaction_type FROM bank_transactions WHERE id = ? AND tenant_id = ?`,
            [input.transactionId, ctx.tenantId],
          );
          if (!rows[0]) throw new Error("거래를 찾을 수 없습니다.");

          const { classifyBankTransaction } = await import("../../services/bank/aiClassify.service");
          const result = await classifyBankTransaction(
            ctx.tenantId, rows[0].description, Number(rows[0].amount), rows[0].transaction_type,
          );
          return { results: [{ transactionId: input.transactionId, description: rows[0].description, result }] };
        } else {
          // 미매칭 일괄 분류
          const { classifyUnmatchedTransactions } = await import("../../services/bank/aiClassify.service");
          const results = await classifyUnmatchedTransactions(ctx.tenantId, input?.limit || 10);
          return { results };
        }
      } catch (err: any) {
        return { results: [], error: err.message };
      }
    }),

  /**
   * AI 추천 적용 — 분류 결과를 실제 매칭으로 확정
   */
  applyAiClassification: tenantRequiredProcedure
    .input(z.object({
      transactionId: z.number(),
      accountId: z.number(),
      learnRule: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      return await txService.matchTransaction(
        ctx.tenantId,
        input.transactionId,
        input.accountId,
        ctx.user.id,
        { learnRule: input.learnRule },
      );
    }),
});
