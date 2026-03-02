import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { postPurchase } from "../lib/purchasePost";
import { cancelPurchase } from "../lib/purchaseCancel";
import { postMaterialOutbound } from "../lib/materialOutboundPost";
import { cancelMaterialOutbound } from "../lib/materialOutboundCancel";
import { postProductionComplete } from "../lib/productionCompletePost";
import { cancelProductionComplete } from "../lib/productionCompleteCancel";
import { postProductSale } from "../lib/productSalePost";
import { cancelProductSale } from "../lib/productSaleCancel";

export const inventoryAccountingRouter = router({
  // 매입 POST
  purchasePost: protectedProcedure
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
  purchaseCancel: protectedProcedure
    .input(
      z.object({
        purchaseId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { purchaseId: number }, ctx: any }) => {
      await cancelPurchase(input.purchaseId, ctx.user.id);
      return { success: true, message: "매입이 취소되었습니다." };
    }),

  // 원재료 출고 POST
  materialOutboundPost: protectedProcedure
    .input(
      z.object({
        outboundId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { outboundId: number }, ctx: any }) => {
      await postMaterialOutbound(input.outboundId, ctx.user.id);
      return { success: true, message: "원재료 출고가 확정되었습니다." };
    }),

  // 원재료 출고 CANCEL
  materialOutboundCancel: protectedProcedure
    .input(
      z.object({
        outboundId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { outboundId: number }, ctx: any }) => {
      await cancelMaterialOutbound(input.outboundId, ctx.user.id);
      return { success: true, message: "원재료 출고가 취소되었습니다." };
    }),

  // 생산 완료 POST
  productionCompletePost: protectedProcedure
    .input(
      z.object({
        batchId: z.number(),
        actualQuantity: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { batchId: number, actualQuantity: number }, ctx: any }) => {
      await postProductionComplete(input.batchId, input.actualQuantity, ctx.user.id);
      return { success: true, message: "생산이 완료되었습니다." };
    }),

  // 생산 완료 CANCEL
  productionCompleteCancel: protectedProcedure
    .input(
      z.object({
        batchId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { batchId: number }, ctx: any }) => {
      await cancelProductionComplete(input.batchId, ctx.user.id);
      return { success: true, message: "생산 완료가 취소되었습니다." };
    }),

  // 제품 출고/판매 POST
  productSalePost: protectedProcedure
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
  productSaleCancel: protectedProcedure
    .input(
      z.object({
        saleId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { saleId: number }, ctx: any }) => {
      await cancelProductSale(input.saleId, ctx.user.id);
      return { success: true, message: "제품 출고/판매가 취소되었습니다." };
    }),
});
