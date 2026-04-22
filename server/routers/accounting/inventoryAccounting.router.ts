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

  // ─── 매출 상태 전환 (2026-04-14 추가, 2026-04-22 분개/AR/은행거래 연동 확장) ─────
  // 매출 수금 완료 (approved → received): 실제 대금 수금 시점
  //   - 입금 분개 생성 (차변 보통예금/현금 / 대변 외상매출금)
  //   - ar_ledger 에 payment 엔트리
  //   - bank_transactions 에 deposit 엔트리 (은행계좌 있을 때)
  // 상세: server/lib/accounting/productSaleReceive.ts
  saleMarkReceived: tenantRequiredProcedure
    .input(z.object({
      saleId: z.number(),
      bankAccountId: z.number().optional(),      // 미지정 시 기본 계좌 자동 선택
      receivedDate: z.string().optional(),       // YYYY-MM-DD (미지정: 오늘)
      memo: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }: { input: { saleId: number; bankAccountId?: number; receivedDate?: string; memo?: string }, ctx: any }) => {
      const { markSaleReceived } = await import("../../lib/accounting/productSaleReceive");
      return await markSaleReceived(input.saleId, ctx.user.id, ctx.tenantId, {
        bankAccountId: input.bankAccountId,
        receivedDate: input.receivedDate,
        memo: input.memo,
      });
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

  // ─── 일괄 복구 관리 엔드포인트 (2026-04-21) ────────────────────
  // 배경: bulk 업로드가 createSale()을 통해 status='approved' 로 들어가던 이슈 복구용
  //       (실제로는 재고/LOT/분개 연결 없이 "반쪽 승인" 상태였음)
  //       수정 후 추가된 일괄 조작용 엔드포인트. 관리자 전용.

  // approved → pending 일괄 복구 (범위: 오늘 / 최근 N일 / 전체)
  bulkRestoreApprovedToPending: tenantRequiredProcedure
    .input(
      z.object({
        scope: z.enum(["today", "last_n_days", "all_approved"]),
        days: z.number().int().positive().max(365).optional(),
        dryRun: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input, ctx }: { input: { scope: "today" | "last_n_days" | "all_approved"; days?: number; dryRun: boolean }, ctx: any }) => {
      // 관리자 전용
      if (ctx.user.role !== "admin" && ctx.user.role !== "super_admin") {
        throw new Error("관리자 권한이 필요합니다.");
      }

      const pool = await getRawConnection();
      let whereClause = `status = 'approved' AND tenant_id = ?`;
      const params: any[] = [ctx.tenantId];

      if (input.scope === "today") {
        whereClause += ` AND DATE(CONVERT_TZ(created_at, '+00:00', '+09:00')) = CURDATE()`;
      } else if (input.scope === "last_n_days") {
        const days = input.days ?? 7;
        whereClause += ` AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`;
        params.push(days);
      }
      // all_approved 는 추가 조건 없음

      // 영향 건수 조회
      const [countRows]: any = await pool.execute(
        `SELECT COUNT(*) AS cnt,
                MIN(transaction_date) AS min_date,
                MAX(transaction_date) AS max_date,
                SUM(total_amount) AS total_amount
           FROM accounting_sales WHERE ${whereClause}`,
        params,
      );
      const summary = countRows?.[0] ?? { cnt: 0, min_date: null, max_date: null, total_amount: 0 };

      if (input.dryRun || summary.cnt === 0) {
        return {
          dryRun: true,
          affectedCount: Number(summary.cnt),
          minDate: summary.min_date,
          maxDate: summary.max_date,
          totalAmount: Number(summary.total_amount ?? 0),
          message: summary.cnt === 0
            ? "대상 없음"
            : `${Number(summary.cnt)}건이 복구됩니다 (실제 실행 시).`,
        };
      }

      // 실제 UPDATE
      const [result]: any = await pool.execute(
        `UPDATE accounting_sales SET status = 'pending' WHERE ${whereClause}`,
        params,
      );
      const affected = Number(result.affectedRows ?? 0);

      console.log(`[bulkRestoreApprovedToPending] tenant=${ctx.tenantId} user=${ctx.user.id} scope=${input.scope} affected=${affected}`);

      return {
        dryRun: false,
        affectedCount: affected,
        minDate: summary.min_date,
        maxDate: summary.max_date,
        totalAmount: Number(summary.total_amount ?? 0),
        message: `${affected}건이 pending 으로 복구되었습니다.`,
      };
    }),
});
