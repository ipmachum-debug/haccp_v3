/**
 * 자금현황 대시보드 라우터 — ERP 강화 Phase 1-3
 *
 * 현금/예금 잔액 + AP/AR + 예상 현금흐름
 * ★ 모든 쿼리 try/catch — 테이블 부재 시에도 부분 데이터 반환
 */
import { z } from "zod";
import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { getPool } from "../../db/pool";

async function safeQuery(pool: any, sql: string, params: any[]): Promise<any[]> {
  try {
    const [rows]: any = await pool.execute(sql, params);
    return rows as any[];
  } catch (err: any) {
    console.warn(`[cashFlow] 쿼리 실패 (계속):`, err.message?.substring(0, 100));
    return [];
  }
}

export const cashFlowRouter = router({
  dashboard: tenantRequiredProcedure.query(async ({ ctx }) => {
    const pool = getPool();
    const tenantId = ctx.tenantId;

    // 1. 은행 계좌별 잔액
    const bankRows = await safeQuery(pool,
      `SELECT id, bank_name, account_no, account_name, balance, currency
       FROM bank_accounts WHERE tenant_id = ? AND is_active = 'Y' ORDER BY balance DESC`,
      [tenantId],
    );
    const bankAccounts = bankRows.map((b: any) => ({
      id: b.id, bankName: b.bank_name, accountNumber: b.account_no,
      accountName: b.account_name, balance: Number(b.balance || 0), currency: b.currency || "KRW",
    }));
    const totalBankBalance = bankAccounts.reduce((s, b) => s + b.balance, 0);

    // 2. 미지급금(AP)
    const apRows = await safeQuery(pool,
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total, COUNT(*) as cnt
       FROM accounting_purchases WHERE tenant_id = ? AND status IN ('pending', 'approved')`,
      [tenantId],
    );
    const apTotal = Number(apRows[0]?.total || 0);
    const apCount = Number(apRows[0]?.cnt || 0);

    // 3. 미수금(AR)
    const arRows = await safeQuery(pool,
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total, COUNT(*) as cnt
       FROM accounting_sales WHERE tenant_id = ? AND status IN ('pending', 'approved')`,
      [tenantId],
    );
    const arTotal = Number(arRows[0]?.total || 0);
    const arCount = Number(arRows[0]?.cnt || 0);

    // 4. 미결 발주서
    const poRows = await safeQuery(pool,
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total, COUNT(*) as cnt
       FROM purchase_orders WHERE tenant_id = ? AND status IN ('approved', 'partial_received')`,
      [tenantId],
    );

    // 5. 미결 견적서
    const quotRows = await safeQuery(pool,
      `SELECT COALESCE(SUM(CAST(total_amount AS DECIMAL(15,2))), 0) as total, COUNT(*) as cnt
       FROM quotations WHERE tenant_id = ? AND status IN ('sent', 'approved')`,
      [tenantId],
    );

    // 6. 최근 30일 은행 거래
    const recentTxRows = await safeQuery(pool,
      `SELECT
         COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END), 0) as totalDeposit,
         COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN CAST(amount AS DECIMAL(15,2)) ELSE 0 END), 0) as totalWithdrawal,
         COUNT(*) as cnt
       FROM bank_transactions WHERE tenant_id = ? AND transaction_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [tenantId],
    );

    const projectedCash = totalBankBalance + arTotal - apTotal;

    return {
      bankAccounts,
      totalBankBalance,
      ap: { total: apTotal, count: apCount },
      ar: { total: arTotal, count: arCount },
      pendingPO: { total: Number(poRows[0]?.total || 0), count: Number(poRows[0]?.cnt || 0) },
      pendingQuotation: { total: Number(quotRows[0]?.total || 0), count: Number(quotRows[0]?.cnt || 0) },
      recentTransactions: {
        deposit: Number(recentTxRows[0]?.totalDeposit || 0),
        withdrawal: Number(recentTxRows[0]?.totalWithdrawal || 0),
        count: Number(recentTxRows[0]?.cnt || 0),
      },
      projectedCash,
    };
  }),
});
