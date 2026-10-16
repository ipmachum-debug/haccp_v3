import { z } from "zod";
import { tenantRequiredProcedure, router } from "../../_core/trpc";
import { dispatchPostPurchase, dispatchPostSale } from "../../lib/accounting/postDispatcher";
import { cancelPurchase } from "../../lib/accounting/purchaseCancel";
import { cancelProductSale } from "../../lib/accounting/productSaleCancel";
import { getRawConnection, withTransaction } from "../../db";
import { saleHasFootprintSql, assertNoSaleFootprint } from "../../lib/accounting/saleFootprint";

export const inventoryAccountingRouter = router({
  // 매입 승인 (pending → approved): 분개 + 재고 + LOT 생성
  purchasePost: tenantRequiredProcedure
    .input(
      z.object({
        purchaseId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { purchaseId: number }, ctx: any }) => {
      await dispatchPostPurchase(input.purchaseId, ctx.user.id, ctx.tenantId);
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

  // 매입 지급 취소 (paid → approved) — 2026-10-16
  //   purchaseMarkPaid 는 상태만 바꾼다(분개·AP 원장 없음). 되돌리기도 상태만. 이후 매입 취소 가능.
  purchaseUnpay: tenantRequiredProcedure
    .input(z.object({ purchaseId: z.number() }))
    .mutation(async ({ input, ctx }: { input: { purchaseId: number }, ctx: any }) => {
      return await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.purchaseId, ctx.tenantId],
        );
        const current = rows?.[0];
        if (!current) throw new Error(`매입 전표 #${input.purchaseId} 없음`);
        if (current.status === "approved") return { success: true, message: "이미 승인(미지급) 상태입니다." };
        if (current.status !== "paid") throw new Error(`지급 완료 상태만 지급 취소할 수 있습니다. 현재: ${current.status}`);
        await conn.execute(
          `UPDATE accounting_purchases SET status = 'approved' WHERE id = ? AND tenant_id = ? AND status = 'paid'`,
          [input.purchaseId, ctx.tenantId],
        );
        return { success: true, message: "지급이 취소되어 승인(미지급) 상태가 되었습니다." };
      });
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
      // ★ 2026-10-16: 입고 재고가 있었던 매입은 복구하지 않는다. 취소가 재고·분개를 되돌렸으므로 대기로 돌려도
      //   다시 확정할 때 이전 입고 기록 때문에 확정이 건너뛰어진다(재고 없이 대기로 남음). 새로 등록해야 한다.
      const [rcpt]: any = await pool.execute(
        `SELECT COUNT(*) AS n FROM h_inventory_transactions
          WHERE tenant_id = ? AND transaction_type = 'receipt'
            AND ( (reference_type = 'accounting_purchase' AND reference_id = ?)
               OR (source_type = 'accounting_purchases' AND source_id = ?) )`,
        [ctx.tenantId, input.purchaseId, input.purchaseId],
      );
      if (Number(rcpt?.[0]?.n ?? 0) > 0) {
        throw new Error("입고된 적 있는 매입은 복구할 수 없습니다. 취소로 재고·분개가 되돌려졌으니 새로 등록하세요.");
      }
      await pool.execute(
        `UPDATE accounting_purchases SET status = 'pending', canceled_at = NULL, canceled_by = NULL WHERE id = ? AND tenant_id = ?`,
        [input.purchaseId, ctx.tenantId],
      );
      return { success: true, message: "매입이 대기 상태로 복구되었습니다." };
    }),

  // ★ 2026-10-12 (v3 5단계 3차): materialOutboundPost/Cancel · productionCompletePost/Cancel 제거.
  //   - 원재료 출고 전표: 출고 문서 테이블이 없어 h_inventory_transactions 를 문서처럼 읽던 stub.
  //     status 검사가 항상 실패해 실행 불가, 운영 DB OUTBOUND 행 0 / 클라이언트 호출 0.
  //   - 생산완료 전기: 배치는 completeBatch 에서 이미 'completed' 라 항상 alreadyProcessed 로 no-op.
  //     운영 DB PRODUCTION 행 0 / [생산완료] 분개 0 / 클라이언트 호출 0. 둘 다 유령 원장 경로 (09 🐞).
  //   생산완료 회계 전기(WIP → 제품재고)는 별도 결정 후 전용 PR (11 문서 §3 5단계 후속).

  // 제품 출고/판매 POST
  productSalePost: tenantRequiredProcedure
    .input(
      z.object({
        saleId: z.number(),
      })
    )
    .mutation(async ({ input, ctx }: { input: { saleId: number }, ctx: any }) => {
      await dispatchPostSale(input.saleId, ctx.user.id, ctx.tenantId);
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

  // 매출 수금 취소 (received → approved) — 2026-10-16
  //   원 [수금] 전표 역분개 + AR adjust 상쇄 + 상태 approved (productSaleUnreceive). 이후 매출 취소 가능.
  saleUnreceive: tenantRequiredProcedure
    .input(z.object({ saleId: z.number() }))
    .mutation(async ({ input, ctx }: { input: { saleId: number }, ctx: any }) => {
      const { unreceiveSale } = await import("../../lib/accounting/productSaleUnreceive");
      const r = await unreceiveSale(input.saleId, ctx.user.id, ctx.tenantId);
      return { success: true, ...r, message: r.alreadyProcessed ? "이미 승인(미수금) 상태입니다." : "수금이 취소되었습니다." };
    }),

  // 매출 복구 (cancelled → pending)
  saleRestore: tenantRequiredProcedure
    .input(z.object({ saleId: z.number() }))
    .mutation(async ({ input, ctx }: { input: { saleId: number }, ctx: any }) => {
      // ★ 2026-10-16: 잠금·검사·변경을 한 트랜잭션으로 (이전: 풀에서 FOR UPDATE — 잠금이 바로 풀림).
      //   취소됐어도 재고 차감·매출 분개가 순으로 남아 있으면(정식 취소가 아닌 상태만 취소) 대기로 되돌리지 않는다
      //   — 되돌리면 다시 확정할 때 이중 차감 (saleFootprint).
      return await withTransaction(async (conn) => {
        const [rows]: any = await conn.execute(
          `SELECT status FROM accounting_sales WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.saleId, ctx.tenantId],
        );
        const current = rows?.[0];
        if (!current) throw new Error(`매출 전표 #${input.saleId} 없음`);
        if (current.status !== "cancelled") {
          throw new Error(`취소 상태만 복구 가능. 현재: ${current.status}`);
        }
        await assertNoSaleFootprint(conn, ctx.tenantId, input.saleId);
        await conn.execute(
          `UPDATE accounting_sales SET status = 'pending', canceled_at = NULL, canceled_by = NULL WHERE id = ? AND tenant_id = ?`,
          [input.saleId, ctx.tenantId],
        );
        return { success: true, message: "매출이 대기 상태로 복구되었습니다." };
      });
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
      // ★ 2026-10-16: 원래 목적("반쪽 승인" — 재고·분개 없이 approved 만 된 매출) 만 대상.
      //   재고 차감·매출 분개 흔적이 있는 매출은 제외 — 상태만 pending 으로 바꾸면 다시 확정할 때 이중 차감
      //   (10/14 매출 7건 사고). 제외 건수는 skippedWithFootprint 로 보고.
      const baseWhere = `s.status = 'approved' AND s.tenant_id = ?`;
      let whereClause = `${baseWhere} AND NOT ${saleHasFootprintSql("s")}`;
      const params: any[] = [ctx.tenantId];
      let scopeClause = "";

      if (input.scope === "today") {
        scopeClause = ` AND DATE(CONVERT_TZ(s.created_at, '+00:00', '+09:00')) = CURDATE()`;
      } else if (input.scope === "last_n_days") {
        const days = input.days ?? 7;
        scopeClause = ` AND s.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`;
        params.push(days);
      }
      // all_approved 는 추가 조건 없음
      whereClause += scopeClause;

      // 영향 건수 조회
      const [countRows]: any = await pool.execute(
        `SELECT COUNT(*) AS cnt,
                MIN(transaction_date) AS min_date,
                MAX(transaction_date) AS max_date,
                SUM(total_amount) AS total_amount
           FROM accounting_sales s WHERE ${whereClause}`,
        params,
      );
      const summary = countRows?.[0] ?? { cnt: 0, min_date: null, max_date: null, total_amount: 0 };
      const [skipRows]: any = await pool.execute(
        `SELECT COUNT(*) AS cnt FROM accounting_sales s WHERE ${baseWhere}${scopeClause} AND ${saleHasFootprintSql("s")}`,
        params,
      );
      const skippedWithFootprint = Number(skipRows?.[0]?.cnt ?? 0);

      if (input.dryRun || summary.cnt === 0) {
        return {
          dryRun: true,
          affectedCount: Number(summary.cnt),
          minDate: summary.min_date,
          maxDate: summary.max_date,
          totalAmount: Number(summary.total_amount ?? 0),
          skippedWithFootprint,
          message: (Number(summary.cnt) === 0
            ? "대상 없음"
            : `${Number(summary.cnt)}건이 복구됩니다 (실제 실행 시).`) +
            (skippedWithFootprint > 0 ? ` 재고 차감·분개 기록이 있는 ${skippedWithFootprint}건은 제외합니다.` : ""),
        };
      }

      // 실제 UPDATE
      const [result]: any = await pool.execute(
        `UPDATE accounting_sales s SET s.status = 'pending' WHERE ${whereClause}`,
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
        skippedWithFootprint,
        message: `${affected}건이 pending 으로 복구되었습니다.` +
          (skippedWithFootprint > 0 ? ` 재고 차감·분개 기록이 있는 ${skippedWithFootprint}건은 제외했습니다.` : ""),
      };
    }),
});
