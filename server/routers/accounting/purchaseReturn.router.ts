/**
 * 매입 반품/차감 라우터 — ERP 강화
 * 매입 반품 시 재고 역차감 + 회계 역분개
 */
import { z } from "zod";
import { router, adminProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";
import { withTransaction } from "../../db";

export const purchaseReturnRouter = router({
  /**
   * 매입 반품 처리
   * - accounting_purchases 상태 → returned
   * - 재고 차감 (LOT available_quantity 감소)
   * - 회계 역분개 생성
   */
  create: adminProcedure
    .input(z.object({
      purchaseId: z.number(),
      returnQty: z.number().positive(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;

      return await withTransaction(async (conn) => {
        // 1. 원본 매입 조회
        const [rows]: any = await conn.execute(
          `SELECT * FROM accounting_purchases WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [input.purchaseId, tenantId],
        );
        const purchase = (rows as any[])[0];
        if (!purchase) throw new Error("매입 전표를 찾을 수 없습니다.");
        if (purchase.status === "cancelled") throw new Error("이미 취소된 전표입니다.");

        const origQty = Number(purchase.quantity || 0);
        if (input.returnQty > origQty) throw new Error(`반품 수량(${input.returnQty})이 원래 수량(${origQty})을 초과합니다.`);

        const unitPrice = Number(purchase.unit_price || 0);
        const returnAmount = Math.round(input.returnQty * unitPrice);
        const returnTax = Math.round(returnAmount * 0.1);

        // 2. 반품 레코드 생성 (음수 매입)
        await conn.execute(
          `INSERT INTO accounting_purchases
             (tenant_id, transaction_date, partner_id, item_name, quantity, unit, unit_price,
              total_amount, tax_amount, tax_rate, source_type, source_id, notes, status, created_by)
           VALUES (?, CURDATE(), ?, ?, ?, ?, ?,
              ?, ?, '10.00', 'return', ?, ?, 'paid', ?)`,
          [tenantId, purchase.partner_id, `[반품] ${purchase.item_name}`,
           `-${input.returnQty}`, purchase.unit, unitPrice,
           `-${returnAmount + returnTax}`, `-${returnTax}`,
           input.purchaseId, `반품 사유: ${input.reason}`, ctx.user.id],
        );

        // 3. 재고 차감 (LOT에서 가용수량 감소)
        try {
          const [lotRows]: any = await conn.execute(
            `SELECT id, available_quantity FROM h_inventory_lots
             WHERE tenant_id = ? AND material_id = ? AND status = 'available'
             ORDER BY receipt_date ASC LIMIT 1`,
            [tenantId, purchase.material_id],
          );
          if (lotRows[0]) {
            await conn.execute(
              `UPDATE h_inventory_lots SET
                 available_quantity = GREATEST(0, available_quantity - ?),
                 current_quantity = GREATEST(0, COALESCE(current_quantity, quantity) - ?)
               WHERE id = ? AND tenant_id = ?`,
              [input.returnQty, input.returnQty, lotRows[0].id, tenantId],
            );
            // PR-§5.2-2: material_id 직접 작성
            await conn.execute(
              `INSERT INTO h_inventory_transactions
                 (tenant_id, lot_id, material_id, transaction_type, quantity, unit, transaction_date,
                  reference_type, source_id, notes, created_by)
               VALUES (?, ?, ?, 'usage', ?, ?, CURDATE(), 'RETURN', ?, ?, ?)`,
              [tenantId, lotRows[0].id, purchase.material_id ?? null, input.returnQty, purchase.unit || "EA",
               input.purchaseId, `[반품] ${input.reason}`, ctx.user.id],
            );
          }
        } catch (err: any) {
          console.warn("[return] 재고 차감 실패 (계속):", err.message?.substring(0, 80));
        }

        // 4. 회계 역분개
        try {
          const [je]: any = await conn.execute(
            `INSERT INTO expense_journal_entries
               (tenant_id, entry_date, description, total_debit, total_credit, posted_by, posted_at)
             VALUES (?, CURDATE(), ?, ?, ?, ?, NOW())`,
            [tenantId, `[매입반품] ${purchase.item_name} ${input.returnQty}${purchase.unit || "EA"}`,
             returnAmount + returnTax, returnAmount + returnTax, ctx.user.id],
          );
          const jeId = Number(je.insertId);
          // 차변: 외상매입금 (반품으로 매입금 감소)
          await conn.execute(
            `INSERT INTO expense_journal_lines (tenant_id, journal_entry_id, account_code, account_name, debit_amount, credit_amount, description, sort_order)
             VALUES (?, ?, '2010', '외상매입금', ?, 0, ?, 0)`,
            [tenantId, jeId, returnAmount + returnTax, `반품: ${purchase.item_name}`],
          );
          // 대변: 원재료 (재고 감소)
          await conn.execute(
            `INSERT INTO expense_journal_lines (tenant_id, journal_entry_id, account_code, account_name, debit_amount, credit_amount, description, sort_order)
             VALUES (?, ?, '1410', '원재료', 0, ?, ?, 1)`,
            [tenantId, jeId, returnAmount, `반품: ${purchase.item_name}`],
          );
          if (returnTax > 0) {
            await conn.execute(
              `INSERT INTO expense_journal_lines (tenant_id, journal_entry_id, account_code, account_name, debit_amount, credit_amount, description, sort_order)
               VALUES (?, ?, '1350', '부가세대급금', 0, ?, ?, 2)`,
              [tenantId, jeId, returnTax, `반품 부가세`],
            );
          }
        } catch (err: any) {
          console.warn("[return] 역분개 실패 (계속):", err.message?.substring(0, 80));
        }

        return { message: `반품 처리 완료: ${purchase.item_name} ${input.returnQty}${purchase.unit || "EA"} (₩${(returnAmount + returnTax).toLocaleString()})` };
      }, `purchaseReturn:${input.purchaseId}`);
    }),
});
