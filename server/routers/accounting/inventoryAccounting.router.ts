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
import { getRawConnection } from "../../db";

export const inventoryAccountingRouter = router({
  // 매입 승인 (pending → approved): 분개 + 재고 + LOT 생성
  purchasePost: tenantRequiredProcedure
    .input(
      z.object({
        purchaseId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { purchaseId: number }, ctx: any }) => {
      await postPurchase(input.purchaseId, ctx.user.id);
      return { success: true, message: "매입이 승인되었습니다." };
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

  // ─── 상태 전환 (2026-04-14 추가) ────────────────────────
  // 매입 지급 완료 (approved → paid): 실제 대금 지급 시점
  purchaseMarkPaid: tenantRequiredProcedure
    .input(z.object({ purchaseId: z.number() }))
    .mutation(async ({ input, ctx }: { input: { purchaseId: number }, ctx: any }) => {
      const pool = await getRawConnection();
      const [rows]: any = await pool.execute(
        `SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [input.purchaseId, ctx.tenantId],
      );
      const current = rows?.[0];
      if (!current) throw new Error(`매입 전표 #${input.purchaseId} 없음`);
      if (current.status === "cancelled") throw new Error("취소된 전표는 지급 처리할 수 없습니다.");
      if (current.status === "paid") return { success: true, message: "이미 지급 완료 상태입니다." };
      if (current.status !== "approved") {
        throw new Error(`승인(approved) 상태만 지급 처리 가능. 현재: ${current.status}`);
      }
      await pool.execute(
        `UPDATE accounting_purchases SET status = 'paid' WHERE id = ? AND tenant_id = ?`,
        [input.purchaseId, ctx.tenantId],
      );
      return { success: true, message: "매입이 지급 완료 처리되었습니다." };
    }),

  // 매입 복구 (cancelled → pending): 취소를 되돌림
  purchaseRestore: tenantRequiredProcedure
    .input(z.object({ purchaseId: z.number() }))
    .mutation(async ({ input, ctx }: { input: { purchaseId: number }, ctx: any }) => {
      const pool = await getRawConnection();
      const [rows]: any = await pool.execute(
        `SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [input.purchaseId, ctx.tenantId],
      );
      const current = rows?.[0];
      if (!current) throw new Error(`매입 전표 #${input.purchaseId} 없음`);
      if (current.status !== "cancelled") {
        throw new Error(`취소 상태만 복구 가능. 현재: ${current.status}`);
      }
      await pool.execute(
        `UPDATE accounting_purchases SET status = 'pending', canceled_at = NULL, canceled_by = NULL WHERE id = ? AND tenant_id = ?`,
        [input.purchaseId, ctx.tenantId],
      );
      return { success: true, message: "매입이 대기 상태로 복구되었습니다." };
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

  // ─── 매출 상태 전환 (2026-04-14 추가) ────────────────────
  // 매출 수금 완료 (approved → received): 실제 대금 수금 시점
  saleMarkReceived: tenantRequiredProcedure
    .input(z.object({ saleId: z.number() }))
    .mutation(async ({ input, ctx }: { input: { saleId: number }, ctx: any }) => {
      const pool = await getRawConnection();
      const [rows]: any = await pool.execute(
        `SELECT status FROM accounting_sales WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [input.saleId, ctx.tenantId],
      );
      const current = rows?.[0];
      if (!current) throw new Error(`매출 전표 #${input.saleId} 없음`);
      if (current.status === "cancelled") throw new Error("취소된 전표는 수금 처리할 수 없습니다.");
      if (current.status === "received") return { success: true, message: "이미 수금 완료 상태입니다." };
      if (current.status !== "approved") {
        throw new Error(`승인(approved) 상태만 수금 처리 가능. 현재: ${current.status}`);
      }
      await pool.execute(
        `UPDATE accounting_sales SET status = 'received' WHERE id = ? AND tenant_id = ?`,
        [input.saleId, ctx.tenantId],
      );
      return { success: true, message: "매출이 수금 완료 처리되었습니다." };
    }),

  // 매출 복구 (cancelled → pending)
  saleRestore: tenantRequiredProcedure
    .input(z.object({ saleId: z.number() }))
    .mutation(async ({ input, ctx }: { input: { saleId: number }, ctx: any }) => {
      const pool = await getRawConnection();
      const [rows]: any = await pool.execute(
        `SELECT status FROM accounting_sales WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [input.saleId, ctx.tenantId],
      );
      const current = rows?.[0];
      if (!current) throw new Error(`매출 전표 #${input.saleId} 없음`);
      if (current.status !== "cancelled") {
        throw new Error(`취소 상태만 복구 가능. 현재: ${current.status}`);
      }
      await pool.execute(
        `UPDATE accounting_sales SET status = 'pending', canceled_at = NULL, canceled_by = NULL WHERE id = ? AND tenant_id = ?`,
        [input.saleId, ctx.tenantId],
      );
      return { success: true, message: "매출이 대기 상태로 복구되었습니다." };
    }),
});
