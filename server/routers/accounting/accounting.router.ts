// accounting 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const accountingRouter = router({
    // 계정 과목 목록 조회
    getCategories: tenantRequiredProcedure.query(async ({ ctx }) => {
      const tenantId = ctx.tenantId;
      const { getAllCategories } = await import("../../accounting");
      return await getAllCategories(tenantId);
    }),

    // 거래 등록
    createTransaction: adminProcedure
      .input(
        z.object({
          transactionDate: z.string(),
          type: z.enum(["income", "expense"]),
          amount: z.string(),
          categoryId: z.number(),
          description: z.string().optional(),
          referenceType: z.string().optional(),
          referenceId: z.number().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { createTransaction } = await import("../../accounting");
        const transactionId = await createTransaction({
          ...input,
          tenantId: tenantId ?? undefined,
          createdBy: ctx.user.id
        }, tenantId);
        return { success: true, transactionId };
      }),

    // 거래 목록 조회
    listTransactions: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          type: z.enum(["income", "expense"]).optional(),
          categoryId: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getTransactions } = await import("../../accounting");
        return await getTransactions(input, tenantId);
      }),

    // 거래 상세 조회
    getTransaction: tenantRequiredProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getTransactionById } = await import("../../accounting");
        return await getTransactionById(input.id, tenantId);
      }),

    // 거래 수정
    updateTransaction: adminProcedure
      .input(
        z.object({
          id: z.number(),
          transactionDate: z.string().optional(),
          type: z.enum(["income", "expense"]).optional(),
          amount: z.string().optional(),
          categoryId: z.number().optional(),
          description: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { updateTransaction } = await import("../../accounting");
        const { id, transactionDate, ...rest } = input;
        const data: any = { ...rest };
        if (transactionDate) {
          data.transactionDate = transactionDate;
        }
        await updateTransaction(id, data, tenantId);
        return { success: true };
      }),

    // 거래 삭제
    deleteTransaction: adminProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { deleteTransaction } = await import("../../accounting");
        await deleteTransaction(input.id, tenantId);
        return { success: true };
      }),

    // 일일 집계
    getDailySummary: tenantRequiredProcedure
      .input(z.object({ date: z.string() }))
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getDailySummary } = await import("../../accounting");
        return await getDailySummary(input.date, tenantId);
      }),
    // 월간 집계
    getMonthlySummary: tenantRequiredProcedure
      .input(
        z.object({
          year: z.number(),
          month: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getMonthlySummary } = await import("../../accounting");
        return await getMonthlySummary(input.year, input.month, tenantId);
      }),

    // 계정 과목별 분석
    getCategoryBreakdown: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string(),
          type: z.enum(["income", "expense"])
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getCategoryBreakdown } = await import("../../accounting");
        return await getCategoryBreakdown(input.startDate, input.endDate, input.type, tenantId);
      }),

    // 재무 현황 요약
    getFinancialOverview: tenantRequiredProcedure
      .input(
        z.object({
          startDate: z.string(),
          endDate: z.string()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { getFinancialOverview } = await import("../../accounting");
        return await getFinancialOverview(input.startDate, input.endDate, tenantId);
      }),

    // 기본 계정 과목 초기화
    initializeCategories: adminProcedure.mutation(async ({ ctx }) => {
      const tenantId = ctx.tenantId;
      const { initializeDefaultCategories } = await import("../../accounting");
      await initializeDefaultCategories(tenantId);
      return { success: true };
    })
});
