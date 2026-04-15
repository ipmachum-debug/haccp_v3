import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { bulkUploadFromExcel } from "../../services/bank/bankImport.service";
import { runAutoMatch } from "../../services/bank/bankAutoMatch.service";

export const bankTransactionBulkRouter = router({
  bulkUploadFromExcel: tenantRequiredProcedure
    .input(z.object({
      bankAccountId: z.number(),
      transactions: z.array(z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const results = await bulkUploadFromExcel(
        ctx.tenantId,
        ctx.user.id,
        input.bankAccountId,
        input.transactions
      );

      return {
        ...results,
        message: `업로드 완료: 성공 ${results.success}건, 실패 ${results.failed}건, 중복 ${results.duplicate}건, 자동매칭 ${results.autoMatched}건`,
      };
    }),

  runAutoMatch: tenantRequiredProcedure
    .input(
      z.object({
        bankAccountId: z.number().optional(),
        // ★ 2026-04-14: Preview 모드 지원
        dryRun: z.boolean().optional().default(false),
        onlyTxIds: z.array(z.number()).optional(), // 사용자가 체크한 거래만 실행
      }).optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await runAutoMatch(
        ctx.tenantId,
        ctx.user.id,
        input?.bankAccountId,
        { dryRun: input?.dryRun, onlyTxIds: input?.onlyTxIds },
      );
      return {
        ...result,
        message: result.dryRun
          ? `미리보기: ${result.total}건 중 ${result.preview.length}건이 자동 매칭 가능합니다.`
          : `${result.total}건 중 ${result.matched}건이 자동 매칭되었습니다.`,
      };
    }),
});
