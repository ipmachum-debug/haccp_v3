/**
 * 화장품 KFDA 신고서 PDF 라우터 (Phase 2-9)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../../_core/trpc";
import { generateKfdaReportPdf } from "../../../db/industry/cosmetic/kfdaReport";

export const cosmeticKfdaReportRouter = router({
  /**
   * BMR 의 KFDA 신고용 통합 PDF 생성.
   * 반환: { filename, base64 } — 클라이언트가 base64 → Blob → download.
   */
  generateBmrReport: tenantRequiredProcedure
    .input(z.object({ bmrId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return generateKfdaReportPdf(input.bmrId, ctx.tenantId);
    }),
});
