/**
 * 자금현황 대시보드 라우터 — ERP 강화 Phase 1-3
 *
 * 현금/예금 잔액 + AP/AR + 예상 현금흐름
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

export const cashFlowRouter = router({
  /**
   * 자금현황 종합 대시보드
   */
  dashboard: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const tenantId = ctx.tenantId;

    // 1. 은행 계좌별 잔액
    const [bankRows]: any = await pool.execute(
      `SELECT id, bank_name, account_number, account_name, balance, currency, is_active
       FROM bank_accounts
       WHERE tenant_id = ? AND is_active = 1
       ORDER BY balance DESC`,
      [tenantId],
    );
    const bankAccounts = (bankRows as any[]).map((b: any) => ({
      id: b.id,
      bankName: b.bank_name,
      accountNumber: b.account_number,
      accountName: b.account_name,
      balance: Number(b.balance || 0),
      currency: b.currency || "KRW",
    }));
    const totalBankBalance = bankAccounts.reduce((s: number, b: any) => s + b.balance, 0);

    // 2. 미지급금(AP) — 미결제 매입
    const [apRows]: any = await pool.execute(
      `SELECT
         COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total,
         COUNT(*) as cnt
       FROM accounting_purchases
       WHERE tenant_id = ? AND status IN ('pending', 'approved')`,
      [tenantId],
    );
    const apTotal = Number(apRows[0]?.total || 0);
    const apCount = Number(apRows[0]?.cnt || 0);

    // 3. 미수금(AR) — 미결제 매출
    const [arRows]: any = await pool.execute(
      `SELECT
         COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total,
         COUNT(*) as cnt
       FROM accounting_sales
       WHERE tenant_id = ? AND status IN ('pending', 'approved')`,
      [tenantId],
    );
    const arTotal = Number(arRows[0]?.total || 0);
    const arCount = Number(arRows[0]?.cnt || 0);

    // 4. 미결 발주서 (예상 지출)
    const [poRows]: any = await pool.execute(
      `SELECT
         COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total,
         COUNT(*) as cnt
       FROM purchase_orders
       WHERE tenant_id = ? AND status IN ('approved', 'partial_received')`,
      [tenantId],
    );
    const pendingPO = Number(poRows[0]?.total || 0);

    // 5. 미결 견적서 (예상 수입)
    const [quotRows]: any = await pool.execute(
      `SELECT
         COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total,
         COUNT(*) as cnt
       FROM quotations
       WHERE tenant_id = ? AND status IN ('sent', 'approved')`,
      [tenantId],
    );
    const pendingQuotation = Number(quotRows[0]?.total || 0);

    // 6. 최근 30일 은행 거래 요약
    const [recentTxRows]: any = await pool.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END), 0) as totalDeposit,
         COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END), 0) as totalWithdrawal,
         COUNT(*) as cnt
       FROM bank_transactions
       WHERE tenant_id = ? AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [tenantId],
    );

    // 예상 가용 자금
    const projectedCash = totalBankBalance + arTotal - apTotal;

    return {
      bankAccounts,
      totalBankBalance,
      ap: { total: apTotal, count: apCount },
      ar: { total: arTotal, count: arCount },
      pendingPO: { total: pendingPO, count: Number(poRows[0]?.cnt || 0) },
      pendingQuotation: { total: pendingQuotation, count: Number(quotRows[0]?.cnt || 0) },
      recentTransactions: {
        deposit: Number(recentTxRows[0]?.totalDeposit || 0),
        withdrawal: Number(recentTxRows[0]?.totalWithdrawal || 0),
        count: Number(recentTxRows[0]?.cnt || 0),
      },
      projectedCash,
    };
  }),
});
