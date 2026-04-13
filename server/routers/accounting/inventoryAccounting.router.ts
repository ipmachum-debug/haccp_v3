import { z } from "zod";
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { postPurchase } from "../../lib/accounting/purchasePost";
import { cancelPurchase } from "../../lib/accounting/purchaseCancel";
import { postMaterialOutbound } from "../../lib/inventory/materialOutboundPost";
import { cancelMaterialOutbound } from "../../lib/inventory/materialOutboundCancel";
import { postProductionComplete } from "../../lib/production/productionCompletePost";
import { cancelProductionComplete } from "../../lib/production/productionCompleteCancel";
import { postProductSale } from "../../lib/accounting/productSalePost";
import { cancelProductSale } from "../../lib/accounting/productSaleCancel";

export const inventoryAccountingRouter = router({
  // 매입 POST
  purchasePost: tenantRequiredProcedure
    .input(
      z.object({
        purchaseId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { purchaseId: number }, ctx: any }) => {
      await postPurchase(input.purchaseId, ctx.user.id);
      return { success: true, message: "매입이 확정되었습니다." };
    }),

  // 매입 CANCEL
  purchaseCancel: tenantRequiredProcedure
    .input(
      z.object({
        purchaseId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { purchaseId: number }, ctx: any }) => {
      await cancelPurchase(input.purchaseId, ctx.user.id, ctx.tenantId);
      return { success: true, message: "매입이 취소되었습니다." };
    }),

  // 원재료 출고 POST
  materialOutboundPost: tenantRequiredProcedure
    .input(
      z.object({
        outboundId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { outboundId: number }, ctx: any }) => {
      await postMaterialOutbound(input.outboundId, ctx.user.id, ctx.tenantId);
      return { success: true, message: "원재료 출고가 확정되었습니다." };
    }),

  // 원재료 출고 CANCEL
  materialOutboundCancel: tenantRequiredProcedure
    .input(
      z.object({
        outboundId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { outboundId: number }, ctx: any }) => {
      await cancelMaterialOutbound(input.outboundId, ctx.user.id, ctx.tenantId);
      return { success: true, message: "원재료 출고가 취소되었습니다." };
    }),

  // 생산 완료 POST
  productionCompletePost: tenantRequiredProcedure
    .input(
      z.object({
        batchId: z.number(),
        actualQuantity: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { batchId: number, actualQuantity: number }, ctx: any }) => {
      await postProductionComplete(input.batchId, input.actualQuantity, ctx.user.id, ctx.tenantId);
      return { success: true, message: "생산이 완료되었습니다." };
    }),

  // 생산 완료 CANCEL
  productionCompleteCancel: tenantRequiredProcedure
    .input(
      z.object({
        batchId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { batchId: number }, ctx: any }) => {
      await cancelProductionComplete(input.batchId, ctx.user.id, ctx.tenantId);
      return { success: true, message: "생산 완료가 취소되었습니다." };
    }),

  // 제품 출고/판매 POST
  productSalePost: tenantRequiredProcedure
    .input(
      z.object({
        saleId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { saleId: number }, ctx: any }) => {
      await postProductSale(input.saleId, ctx.user.id);
      return { success: true, message: "제품 출고/판매가 확정되었습니다." };
    }),

  // 제품 출고/판매 CANCEL
  productSaleCancel: tenantRequiredProcedure
    .input(
      z.object({
        saleId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { saleId: number }, ctx: any }) => {
      await cancelProductSale(input.saleId, ctx.user.id, ctx.tenantId);
      return { success: true, message: "제품 출고/판매가 취소되었습니다." };
    }),
});
