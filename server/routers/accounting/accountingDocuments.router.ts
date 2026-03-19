// accountingDocuments 라우터 - routers.ts에서 분리됨
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { lt, or } from "drizzle-orm";

export const accountingDocumentsRouter = router({
    // 문서 업로드
    upload: tenantRequiredProcedure
      .input(
        z.object({
          category: z.enum(["monthly_report", "tax_invoice", "receipt", "journal_entry", "other"]),
          year: z.number().int().optional(),
          month: z.number().int().optional(),
          fileKey: z.string(),
          fileUrl: z.string(),
          fileName: z.string(),
          fileSize: z.number().optional(),
          mimeType: z.string().optional(),
          title: z.string(),
          description: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const docsDb = await import("../../db/accountingDocuments");

        const documentId = await docsDb.createDocument({
          ...input,
          tenantId: ctx.tenantId!,
          uploadedBy: ctx.user.id
        } as any, ctx.tenantId ?? undefined);

        return {
          success: true,
          documentId
        };
      }),

    // 문서 목록 조회
    list: tenantRequiredProcedure
      .input(
        z.object({
          category: z.string().optional(),
          year: z.number().int().optional(),
          month: z.number().int().optional(),
          limit: z.number().optional().default(50)
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const docsDb = await import("../../db/accountingDocuments");
        return await docsDb.listDocuments(input, tenantId);
      }),

    // 문서 상세 조회
    getDetail: tenantRequiredProcedure
      .input(
        z.object({
          id: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const docsDb = await import("../../db/accountingDocuments");
        
        const document = await docsDb.getDocument(input.id, ctx.tenantId ?? undefined);
        if (!document) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "문서를 찾을 수 없습니다."
          });
        }

        // 워크플로우 이력 조회
        const workflow = await docsDb.getDocumentWorkflow(input.id, ctx.tenantId ?? undefined);
        const latestStatus = await docsDb.getDocumentLatestStatus(input.id, ctx.tenantId ?? undefined);

        return {
          ...document,
          workflow,
          latestStatus
        };
      }),

    // 문서 삭제
    delete: adminProcedure
      .input(
        z.object({
          id: z.number()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const docsDb = await import("../../db/accountingDocuments");
        await docsDb.deleteDocument(input.id, ctx.tenantId ?? undefined);

        return {
          success: true,
          message: "문서가 삭제되었습니다."
        };
      }),

    // 문서 상태 변경
    updateStatus: tenantRequiredProcedure
      .input(
        z.object({
          documentId: z.number(),
          status: z.enum(["requested", "uploaded", "reviewed", "completed", "rejected"]),
          comment: z.string().optional()
        })
      )
      .mutation(async ({ input, ctx }) => {
        const docsDb = await import("../../db/accountingDocuments");

        await docsDb.updateDocumentStatus(
          input.documentId,
          input.status,
          ctx.user.id,
          input.comment
        , ctx.tenantId ?? undefined);

        return {
          success: true,
          message: "문서 상태가 변경되었습니다."
        };
      }),

    // 워크플로우 이력 조회
    getWorkflow: tenantRequiredProcedure
      .input(
        z.object({
          documentId: z.number()
        })
      )
      .query(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        const docsDb = await import("../../db/accountingDocuments");
        return await docsDb.getDocumentWorkflow(input.documentId, tenantId);
      }),
    // HACCP 연동 자동화: 재료 입고 시 매입 거래 자동 생성
    autoCreatePurchaseFromReceipt: adminProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { createPurchaseFromReceipt } = await import("../../db/haccpAccountingIntegration");
        return await createPurchaseFromReceipt(ctx.tenantId!, input.transactionId);
      }),

    // HACCP 연동 자동화: 제품 출고 시 매출 거래 자동 생성
    autoCreateSaleFromUsage: adminProcedure
      .input(z.object({ transactionId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const { createSaleFromUsage } = await import("../../db/haccpAccountingIntegration");
        return await createSaleFromUsage(ctx.tenantId!, input.transactionId);
      }),

    // HACCP 연동 자동화: 기존 재고 거래 일괄 처리 (마이그레이션용)
    batchCreateAccountingTransactions: adminProcedure
      .mutation(async ({ ctx }) => {
        const { batchCreateAccountingTransactions } = await import("../../db/haccpAccountingIntegration");
        return await batchCreateAccountingTransactions(ctx.tenantId!);
      })
});
