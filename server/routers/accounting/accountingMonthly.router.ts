// accountingMonthly 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or } from "drizzle-orm";

export const accountingMonthlyRouter = router({
    // 월 마감 집계 생성
    generateSummary: adminProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12),
          highAmountThreshold: z.number().optional().default(1000000)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const summaryDb = await import("../../db/accountingMonthlySummary");

        // 1. 월간 집계 계산
        const calculated = await summaryDb.calculateMonthlySummary(input.year, input.month, ctx.tenantId ?? undefined);

        // 2. 월 마감 요약 저장/업데이트
        const summaryId = await summaryDb.upsertMonthlySummary({
          tenantId: ctx.tenantId!,
          year: input.year,
          month: input.month,
          totalDeposit: calculated.totalDeposit,
          totalWithdrawal: calculated.totalWithdrawal,
          netCashFlow: calculated.netCashFlow,
          totalDays: calculated.totalDays,
          closedDays: calculated.closedDays,
          missingDays: calculated.missingDays,
          highAmountThreshold: input.highAmountThreshold.toFixed(2),
          status: "draft"
        }, ctx.tenantId ?? undefined);

        // 3. 고액 거래 추출
        const highAmountCount = await summaryDb.extractHighAmountTransactions(
          summaryId,
          input.year,
          input.month,
          input.highAmountThreshold,
          ctx.tenantId ?? undefined
        );

        // 4. 고액 거래 건수 업데이트
        await summaryDb.upsertMonthlySummary({
          tenantId: ctx.tenantId!,
          year: input.year,
          month: input.month,
          totalDeposit: calculated.totalDeposit,
          totalWithdrawal: calculated.totalWithdrawal,
          netCashFlow: calculated.netCashFlow,
          totalDays: calculated.totalDays,
          closedDays: calculated.closedDays,
          missingDays: calculated.missingDays,
          highAmountCount,
          highAmountThreshold: input.highAmountThreshold.toFixed(2),
          status: "draft"
        }, ctx.tenantId ?? undefined);

        return {
          success: true,
          summaryId,
          totalDeposit: calculated.totalDeposit,
          totalWithdrawal: calculated.totalWithdrawal,
          netCashFlow: calculated.netCashFlow,
          closedDays: calculated.closedDays,
          totalDays: calculated.totalDays,
          missingDays: JSON.parse(calculated.missingDays),
          highAmountCount
        };
      }),
    // 월 마감 확정
    confirmClose: adminProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const summaryDb = await import("../../db/accountingMonthlySummary");

        const summary = await summaryDb.getMonthlySummary(input.year, input.month);
        if (!summary) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "월 마감 데이터가 존재하지 않습니다. 먼저 집계를 생성해주세요."
          });
        }

        if (summary.status === "locked") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "이미 잠금된 월 마감입니다."
          });
        }

        await summaryDb.updateMonthlySummaryStatus(summary.id, "confirmed", ctx.user.id, ctx.tenantId ?? undefined);

        return {
          success: true,
          message: "월 마감이 확정되었습니다."
        };
      }),
    // 월 마감 잠금
    lockClose: adminProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const summaryDb = await import("../../db/accountingMonthlySummary");

        const summary = await summaryDb.getMonthlySummary(input.year, input.month);
        if (!summary) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "월 마감 데이터가 존재하지 않습니다."
          });
        }

        if (summary.status !== "confirmed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "확정된 월 마감만 잠금할 수 있습니다."
          });
        }

        await summaryDb.updateMonthlySummaryStatus(summary.id, "locked", ctx.user.id);

        return {
          success: true,
          message: "월 마감이 잠금되었습니다. 더 이상 수정할 수 없습니다."
        };
      }),
    // 월 마감 목록 조회
    list: tenantRequiredProcedure
      .input(
        z.object({
          limit: z.number().optional().default(12)
        })
      )
      .query(async ({ input, ctx }) => {
        const summaryDb = await import("../../db/accountingMonthlySummary");
        return await summaryDb.listMonthlySummaries(input.limit, ctx.tenantId ?? undefined);
      }),

    // 월 마감 상세 조회
    getDetail: tenantRequiredProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12)
        })
      )
      .query(async ({ input, ctx }) => {
        const summaryDb = await import("../../db/accountingMonthlySummary");
        
        const summary = await summaryDb.getMonthlySummary(input.year, input.month);
        if (!summary) {
          return null;
        }

        // 고액 거래 목록 조회
        const highAmountTransactions = await summaryDb.getHighAmountTransactions(summary.id, ctx.tenantId ?? undefined);

        // 리포트 목록 조회
        const reports = await summaryDb.getMonthlyReports(summary.id, ctx.tenantId ?? undefined);

        return {
          ...summary,
          missingDays: summary.missingDays ? JSON.parse(summary.missingDays) : [],
          highAmountTransactions,
          reports
        };
      }),
    // PDF 리포트 생성 (placeholder)
    generatePDF: adminProcedure
      .input(
        z.object({
          year: z.number().int().min(2020).max(2100),
          month: z.number().int().min(1).max(12)
        })
      )
      .mutation(async ({ input, ctx }) => {
        const summaryDb = await import("../../db/accountingMonthlySummary");
        const { generatePDF, generateMonthlyReportHTML } = await import("../../_core/pdfGenerator");

        const summary = await summaryDb.getMonthlySummary(input.year, input.month);
        if (!summary) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "월 마감 데이터가 존재하지 않습니다."
          });
        }

        // 고액 거래 데이터 조회
        const highAmountTransactions = await summaryDb.getHighAmountTransactions(summary.id);

        // HTML 템플릿 생성
        const html = generateMonthlyReportHTML({
          year: input.year,
          month: input.month,
          totalIncome: parseFloat(summary.totalDeposit),
          totalExpense: parseFloat(summary.totalWithdrawal),
          netCashFlow: parseFloat(summary.netCashFlow),
          highAmountTransactions: highAmountTransactions.map(tx => ({
            date: new Date(tx.transactionDate).toLocaleDateString('ko-KR'),
            description: tx.description || '',
            amount: parseFloat(tx.amount),
            type: tx.transactionType
          })),
          missingDates: summary.missingDays ? JSON.parse(summary.missingDays) : []
        });

        // PDF 생성 및 S3 업로드
        const fileName = `${input.year}년_${input.month}월_월마감리포트`;
        const { url: fileUrl, key: fileKey } = await generatePDF({
          html,
          filename: fileName,
          format: "A4",
          landscape: false,
          tenantId: ctx.tenantId ?? undefined
        });

        // 리포트 메타데이터 저장
        const reportId = await summaryDb.saveMonthlyReport({
          tenantId: ctx.tenantId!,
          summaryId: summary.id,
          fileKey,
          fileUrl,
          fileName: `${fileName}.pdf`,
          fileSize: null, // puppeteer는 파일 크기를 반환하지 않음
          generatedBy: ctx.user.id
        }, ctx.tenantId ?? undefined);

        return {
          success: true,
          reportId,
          fileUrl,
          fileName: `${fileName}.pdf`
        };
      }),
    // 월 마감 재오픈 (stub)
    reopen: adminProcedure
      .input(z.object({ year: z.number(), month: z.number(), reason: z.string().optional() }))
      .mutation(async () => {
        return { success: true, message: '재오픈 기능은 준비중입니다.' };
      }),
});
