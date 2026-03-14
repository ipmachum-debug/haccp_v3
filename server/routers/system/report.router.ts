// report 라우터 - routers.ts에서 분리됨
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";

export const reportRouter = router({
    // 배치별 PDF 보고서 생성
    generateBatchPDF: tenantRequiredProcedure
      .input(z.object({ batchId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const { generateBatchReport } = await import("../../db");
        const { generateBatchPDF } = await import("../../pdfGenerator");

        const reportData = await generateBatchReport(input.batchId, tenantId ?? undefined);
        const pdfBuffer = await generateBatchPDF(reportData);
        
        // PDF를 Base64로 인코딩하여 반환
        const base64PDF = pdfBuffer.toString("base64");
        
        return {
          success: true,
          pdf: base64PDF,
          filename: `batch_${reportData.batch.batchCode}_report.pdf`
        };
      }),
    
    // CCP 점검 보고서 생성
    generateCcpReport: tenantRequiredProcedure
      .input(
        z.object({
          reportType: z.enum(["daily", "weekly", "monthly"]),
          startDate: z.string(),
          endDate: z.string(),
          ccpType: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const { generatePdfReport } = await import("../../services/report.service");
        
        const startDate = new Date(input.startDate);
        const endDate = new Date(input.endDate);
        
        let title = "";
        let period = "";
        
        switch (input.reportType) {
          case "daily":
            title = "일일 CCP 점검 리포트";
            period = `${startDate.toLocaleDateString('ko-KR')}`;
            break;
          case "weekly":
            title = "주간 CCP 점검 리포트";
            period = `${startDate.toLocaleDateString('ko-KR')} ~ ${endDate.toLocaleDateString('ko-KR')}`;
            break;
          case "monthly":
            title = "월간 CCP 점검 리포트";
            period = `${startDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}`;
            break;
        }
        
        const pdfBuffer = await generatePdfReport({
          tenantId: ctx.tenantId!,
          title,
          period,
          startDate,
          endDate,
          ccpType: input.ccpType
        });
        
        // PDF를 Base64로 인코딩하여 반환
        const base64Pdf = Buffer.from(pdfBuffer).toString('base64');
        
        return {
          success: true,
          pdf: base64Pdf,
          filename: `${input.reportType}_ccp_report_${startDate.toISOString().split('T')[0]}.pdf`
        };
      })
});
