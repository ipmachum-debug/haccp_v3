import { router, tenantRequiredProcedure } from "../_core/trpc";
import { z } from "zod";
import { bulkUploadFromExcel } from "../services/bank/bankImport.service";
import { runAutoMatch } from "../services/bank/bankAutoMatch.service";

export const bankTransactionBulkRouter = router({
  bulkUploadFromExcel: tenantRequiredProcedure
    .input(z.object({
      bankAccountId: z.number(),
      transactions: z.array(z.any()),
    }))
    .mutation(async ({ ctx, input }) => {
      const results = await bulkUploadFromExcel(
        ctx.tenantId!,
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
    .input(z.object({ bankAccountId: z.number().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const { total, matched } = await runAutoMatch(ctx.tenantId!, ctx.user.id, input?.bankAccountId);
      return {
        total,
        matched,
        message: `${total}건 중 ${matched}건이 자동 매칭되었습니다.`,
      };
    }),
});
