/**
 * accounting.router.ts - 회계 관리 라우터 (복식부기 기반)
 *
 * 레거시 accounting_categories + accounting_transactions 제거.
 * 모든 데이터를 accounting_accounts + expense_journal_entries/lines에서 조회.
 *
 * 마이그레이션 일자: 2026-04-11
 */
import { adminProcedure, tenantRequiredProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const accountingRouter = router({
  // ────────────────────────────────────────────
  // 계정 과목 목록 조회 (accounting_accounts 5분류)
  // ────────────────────────────────────────────
  getCategories: tenantRequiredProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    const { getRawConnection } = await import("../../db/connection");
    const conn = await getRawConnection();

    const [rows] = await conn.execute(
      `SELECT id, category, code, name, system_code, description, is_active
       FROM accounting_accounts
       WHERE tenant_id = ? AND is_active = 'Y'
       ORDER BY code`,
      [tenantId],
    );

    // Map category -> type for backward compat with UI ("income"/"expense")
    return (rows as any[]).map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      category: r.category, // assets, liabilities, equity, revenue, expenses
      type: mapCategoryToType(r.category),
      systemCode: r.system_code,
      description: r.description,
      isActive: r.is_active,
    }));
  }),

  // ────────────────────────────────────────────
  // 거래(분개) 등록 - 복식부기
  // ────────────────────────────────────────────
  createTransaction: adminProcedure
    .input(
      z.object({
        transactionDate: z.string(),
        type: z.enum(["income", "expense"]),
        amount: z.string(),
        categoryId: z.number(), // accounting_accounts.id
        description: z.string().optional(),
        paymentMethod: z.enum(["cash", "bank", "card", "unpaid"]).optional().default("cash"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getRawConnection } = await import("../../db/connection");
      const {
        resolveSystemAccount,
        getPaymentSystemAccount,
        insertJournalLine,
      } = await import("../../db/accounting/journalHelper");
      const { SYSTEM_ACCOUNTS } = await import("../../../drizzle/schema/accountingAccounts");

      const conn = await getRawConnection();
      const amount = parseFloat(input.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "금액은 양수여야 합니다" });
      }

      // 선택된 계정 조회
      const [accRows] = await conn.execute(
        `SELECT id, code, name, category FROM accounting_accounts
         WHERE id = ? AND tenant_id = ? AND is_active = 'Y' LIMIT 1`,
        [input.categoryId, tenantId],
      );
      const account = (accRows as any[])[0];
      if (!account) {
        throw new TRPCError({ code: "NOT_FOUND", message: "계정과목을 찾을 수 없습니다" });
      }

      // 상대 계정(결제수단)
      const paymentMapping = getPaymentSystemAccount(input.paymentMethod || "cash");
      const counterAcc = await resolveSystemAccount(
        tenantId,
        paymentMapping.systemCode,
        paymentMapping.fallbackCode,
        paymentMapping.fallbackName,
      );

      // 분개 엔트리 생성
      const [jeResult] = await conn.execute(
        `INSERT INTO expense_journal_entries
           (tenant_id, voucher_id, entry_date, description, total_debit, total_credit, posted_by)
         VALUES (?, NULL, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          input.transactionDate,
          input.description || `${input.type === "income" ? "수입" : "지출"} - ${account.name}`,
          amount,
          amount,
          ctx.user.id,
        ],
      );
      const journalEntryId = Number((jeResult as any).insertId);

      if (input.type === "expense") {
        // 지출: 차변 비용계정, 대변 결제수단
        await insertJournalLine(conn, {
          tenantId,
          journalEntryId,
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          debitAmount: amount,
          creditAmount: 0,
          description: input.description || account.name,
          sortOrder: 0,
        });
        await insertJournalLine(conn, {
          tenantId,
          journalEntryId,
          accountId: counterAcc.id,
          accountCode: counterAcc.code,
          accountName: counterAcc.name,
          debitAmount: 0,
          creditAmount: amount,
          description: `${input.paymentMethod || "cash"} 결제`,
          sortOrder: 1,
        });
      } else {
        // 수입: 차변 결제수단, 대변 수익계정
        await insertJournalLine(conn, {
          tenantId,
          journalEntryId,
          accountId: counterAcc.id,
          accountCode: counterAcc.code,
          accountName: counterAcc.name,
          debitAmount: amount,
          creditAmount: 0,
          description: `${input.paymentMethod || "cash"} 입금`,
          sortOrder: 0,
        });
        await insertJournalLine(conn, {
          tenantId,
          journalEntryId,
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          debitAmount: 0,
          creditAmount: amount,
          description: input.description || account.name,
          sortOrder: 1,
        });
      }

      return { success: true, transactionId: journalEntryId };
    }),

  // ────────────────────────────────────────────
  // 거래(분개) 목록 조회
  // ────────────────────────────────────────────
  listTransactions: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        type: z.enum(["income", "expense"]).optional(),
        categoryId: z.number().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getRawConnection } = await import("../../db/connection");
      const conn = await getRawConnection();

      // Query journal entries with their first line for account info
      // We determine "type" by checking whether the primary account (first debit line)
      // is a revenue category (income) or expense category (expense)
      let sql = `
        SELECT
          eje.id,
          eje.entry_date AS transactionDate,
          eje.description,
          eje.total_debit AS amount,
          eje.posted_by AS createdBy,
          eje.created_at AS createdAt,
          -- Get the "primary" account (first line with debit > 0)
          primary_line.account_id AS categoryId,
          primary_line.account_code AS categoryCode,
          primary_line.account_name AS categoryName,
          aa.category AS accountCategory
        FROM expense_journal_entries eje
        LEFT JOIN (
          SELECT journal_entry_id, tenant_id, account_id, account_code, account_name,
                 ROW_NUMBER() OVER (PARTITION BY journal_entry_id ORDER BY sort_order) AS rn
          FROM expense_journal_lines
          WHERE debit_amount > 0
        ) primary_line ON primary_line.journal_entry_id = eje.id
                       AND primary_line.tenant_id = eje.tenant_id
                       AND primary_line.rn = 1
        LEFT JOIN accounting_accounts aa ON aa.id = primary_line.account_id AND aa.tenant_id = ?
        WHERE eje.tenant_id = ?
      `;
      const params: any[] = [tenantId, tenantId];

      if (input.startDate) {
        sql += ` AND eje.entry_date >= ?`;
        params.push(input.startDate);
      }
      if (input.endDate) {
        sql += ` AND eje.entry_date <= ?`;
        params.push(input.endDate);
      }
      if (input.categoryId) {
        sql += ` AND primary_line.account_id = ?`;
        params.push(input.categoryId);
      }
      if (input.type) {
        // Filter by category type
        if (input.type === "income") {
          sql += ` AND aa.category = 'revenue'`;
        } else {
          sql += ` AND aa.category = 'expenses'`;
        }
      }

      sql += ` ORDER BY eje.entry_date DESC, eje.id DESC`;

      if (input.limit) {
        sql += ` LIMIT ?`;
        params.push(input.limit);
      }
      if (input.offset) {
        sql += ` OFFSET ?`;
        params.push(input.offset);
      }

      const [rows] = await conn.execute(sql, params);

      return (rows as any[]).map((r) => ({
        id: r.id,
        transactionDate: r.transactionDate,
        type: mapCategoryToType(r.accountCategory),
        amount: String(r.amount || 0),
        description: r.description || "",
        categoryId: r.categoryId,
        categoryCode: r.categoryCode || "",
        categoryName: r.categoryName || "",
        createdBy: r.createdBy,
        createdAt: r.createdAt,
      }));
    }),

  // ────────────────────────────────────────────
  // 거래 상세 조회 (분개 엔트리 + 분개행)
  // ────────────────────────────────────────────
  getTransaction: tenantRequiredProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getRawConnection } = await import("../../db/connection");
      const conn = await getRawConnection();

      const [entryRows] = await conn.execute(
        `SELECT id, entry_date, description, total_debit, total_credit, posted_by, created_at
         FROM expense_journal_entries
         WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      const entry = (entryRows as any[])[0];
      if (!entry) return null;

      const [lineRows] = await conn.execute(
        `SELECT id, account_id, account_code, account_name, debit_amount, credit_amount,
                description, sort_order
         FROM expense_journal_lines
         WHERE journal_entry_id = ? AND tenant_id = ?
         ORDER BY sort_order`,
        [input.id, tenantId],
      );

      return {
        id: entry.id,
        transactionDate: entry.entry_date,
        description: entry.description,
        totalDebit: entry.total_debit,
        totalCredit: entry.total_credit,
        postedBy: entry.posted_by,
        createdAt: entry.created_at,
        lines: (lineRows as any[]).map((l) => ({
          id: l.id,
          accountId: l.account_id,
          accountCode: l.account_code,
          accountName: l.account_name,
          debitAmount: l.debit_amount,
          creditAmount: l.credit_amount,
          description: l.description,
          sortOrder: l.sort_order,
        })),
      };
    }),

  // ────────────────────────────────────────────
  // 거래(분개) 수정 - 기존 삭제 + 재생성 패턴
  // ────────────────────────────────────────────
  updateTransaction: adminProcedure
    .input(
      z.object({
        id: z.number(),
        transactionDate: z.string().optional(),
        type: z.enum(["income", "expense"]).optional(),
        amount: z.string().optional(),
        categoryId: z.number().optional(),
        description: z.string().optional(),
        paymentMethod: z.enum(["cash", "bank", "card", "unpaid"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getRawConnection } = await import("../../db/connection");
      const conn = await getRawConnection();

      // Fetch existing entry
      const [entryRows] = await conn.execute(
        `SELECT id, voucher_id, entry_date, description, total_debit
         FROM expense_journal_entries
         WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      const entry = (entryRows as any[])[0];
      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "분개를 찾을 수 없습니다" });
      }

      // If this entry is linked to a voucher, block editing (managed by expense module)
      if (entry.voucher_id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "비용전표에서 생성된 분개는 전표 모듈에서 수정하세요",
        });
      }

      // Delete old lines
      await conn.execute(
        `DELETE FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );

      // Determine new values
      const newDate = input.transactionDate || entry.entry_date;
      const newAmount = input.amount ? parseFloat(input.amount) : Number(entry.total_debit);
      const newDescription = input.description !== undefined ? input.description : entry.description;

      // Fetch current primary line info to know original type/account
      // We need categoryId to know the account - if not given, lookup from old lines (already deleted, so we take from input or default)
      const {
        resolveSystemAccount,
        getPaymentSystemAccount,
        insertJournalLine,
      } = await import("../../db/accounting/journalHelper");

      let accountId = input.categoryId;
      let accountInfo: any = null;

      if (accountId) {
        const [accRows] = await conn.execute(
          `SELECT id, code, name, category FROM accounting_accounts
           WHERE id = ? AND tenant_id = ? LIMIT 1`,
          [accountId, tenantId],
        );
        accountInfo = (accRows as any[])[0];
      }

      if (!accountInfo) {
        // Fallback: cannot determine account, just update the entry header
        await conn.execute(
          `UPDATE expense_journal_entries
           SET entry_date = ?, description = ?, total_debit = ?, total_credit = ?
           WHERE id = ? AND tenant_id = ?`,
          [newDate, newDescription, newAmount, newAmount, input.id, tenantId],
        );
        return { success: true };
      }

      const txType = input.type || mapCategoryToType(accountInfo.category);
      const paymentMethod = input.paymentMethod || "cash";
      const paymentMapping = getPaymentSystemAccount(paymentMethod);
      const counterAcc = await resolveSystemAccount(
        tenantId,
        paymentMapping.systemCode,
        paymentMapping.fallbackCode,
        paymentMapping.fallbackName,
      );

      // Update entry header
      await conn.execute(
        `UPDATE expense_journal_entries
         SET entry_date = ?, description = ?, total_debit = ?, total_credit = ?
         WHERE id = ? AND tenant_id = ?`,
        [newDate, newDescription, newAmount, newAmount, input.id, tenantId],
      );

      // Recreate lines
      if (txType === "expense") {
        await insertJournalLine(conn, {
          tenantId,
          journalEntryId: input.id,
          accountId: accountInfo.id,
          accountCode: accountInfo.code,
          accountName: accountInfo.name,
          debitAmount: newAmount,
          creditAmount: 0,
          description: newDescription || accountInfo.name,
          sortOrder: 0,
        });
        await insertJournalLine(conn, {
          tenantId,
          journalEntryId: input.id,
          accountId: counterAcc.id,
          accountCode: counterAcc.code,
          accountName: counterAcc.name,
          debitAmount: 0,
          creditAmount: newAmount,
          description: `${paymentMethod} 결제`,
          sortOrder: 1,
        });
      } else {
        await insertJournalLine(conn, {
          tenantId,
          journalEntryId: input.id,
          accountId: counterAcc.id,
          accountCode: counterAcc.code,
          accountName: counterAcc.name,
          debitAmount: newAmount,
          creditAmount: 0,
          description: `${paymentMethod} 입금`,
          sortOrder: 0,
        });
        await insertJournalLine(conn, {
          tenantId,
          journalEntryId: input.id,
          accountId: accountInfo.id,
          accountCode: accountInfo.code,
          accountName: accountInfo.name,
          debitAmount: 0,
          creditAmount: newAmount,
          description: newDescription || accountInfo.name,
          sortOrder: 1,
        });
      }

      return { success: true };
    }),

  // ────────────────────────────────────────────
  // 거래(분개) 삭제
  // ────────────────────────────────────────────
  deleteTransaction: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getRawConnection } = await import("../../db/connection");
      const conn = await getRawConnection();

      // Check if linked to a voucher
      const [entryRows] = await conn.execute(
        `SELECT voucher_id FROM expense_journal_entries WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      const entry = (entryRows as any[])[0];
      if (!entry) {
        throw new TRPCError({ code: "NOT_FOUND", message: "분개를 찾을 수 없습니다" });
      }
      if (entry.voucher_id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "비용전표에서 생성된 분개는 전표 모듈에서 삭제하세요",
        });
      }

      await conn.execute(
        `DELETE FROM expense_journal_lines WHERE journal_entry_id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );
      await conn.execute(
        `DELETE FROM expense_journal_entries WHERE id = ? AND tenant_id = ?`,
        [input.id, tenantId],
      );

      return { success: true };
    }),

  // ────────────────────────────────────────────
  // 일일 집계 (accounting_daily_close 조회)
  // ────────────────────────────────────────────
  getDailySummary: tenantRequiredProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getDailyCloseStats } = await import("../../db/accounting/accountingDailyClose");
      const targetDate = new Date(input.date + "T00:00:00");
      return await getDailyCloseStats(targetDate, tenantId);
    }),

  // ────────────────────────────────────────────
  // 월간 집계 (분개 기반)
  // ────────────────────────────────────────────
  getMonthlySummary: tenantRequiredProcedure
    .input(
      z.object({
        year: z.number(),
        month: z.number(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const startDate = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      // Last day of month
      const lastDay = new Date(input.year, input.month, 0).getDate();
      const endDate = `${input.year}-${String(input.month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

      const { generateIncomeStatement } = await import("../../db/accounting/financialReports");
      const report = await generateIncomeStatement(tenantId, startDate, endDate);

      return {
        year: input.year,
        month: input.month,
        totalIncome: report.totals.totalRevenue,
        totalExpense: report.totals.totalExpenses,
        netCashFlow: report.totals.netIncome,
        transactionCount: report.revenue.length + report.expenses.length,
      };
    }),

  // ────────────────────────────────────────────
  // 계정 과목별 분석 (분개행 기반)
  // ────────────────────────────────────────────
  getCategoryBreakdown: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
        type: z.enum(["income", "expense"]),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getRawConnection } = await import("../../db/connection");
      const conn = await getRawConnection();

      // For "expense" type: accounts where category='expenses', debit side
      // For "income" type: accounts where category='revenue', credit side
      const isExpense = input.type === "expense";
      const amountCol = isExpense ? "ejl.debit_amount" : "ejl.credit_amount";
      const categoryFilter = isExpense ? "expenses" : "revenue";

      const [rows] = await conn.execute(
        `SELECT
           ejl.account_id AS categoryId,
           ejl.account_code AS categoryCode,
           ejl.account_name AS categoryName,
           SUM(${amountCol}) AS totalAmount,
           COUNT(*) AS transactionCount
         FROM expense_journal_lines ejl
         INNER JOIN expense_journal_entries eje
           ON eje.id = ejl.journal_entry_id AND eje.tenant_id = ?
         INNER JOIN accounting_accounts aa
           ON aa.id = ejl.account_id AND aa.tenant_id = ?
         WHERE ejl.tenant_id = ?
           AND eje.entry_date >= ? AND eje.entry_date <= ?
           AND aa.category = ?
           AND ${amountCol} > 0
         GROUP BY ejl.account_id, ejl.account_code, ejl.account_name
         ORDER BY totalAmount DESC`,
        [tenantId, tenantId, tenantId, input.startDate, input.endDate, categoryFilter],
      );

      return (rows as any[]).map((r) => ({
        categoryId: r.categoryId,
        categoryCode: r.categoryCode,
        categoryName: r.categoryName,
        totalAmount: Number(r.totalAmount) || 0,
        transactionCount: Number(r.transactionCount) || 0,
      }));
    }),

  // ────────────────────────────────────────────
  // 재무 현황 요약 (손익계산서 기반)
  // ────────────────────────────────────────────
  getFinancialOverview: tenantRequiredProcedure
    .input(
      z.object({
        startDate: z.string(),
        endDate: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId;
      const { getRawConnection } = await import("../../db/connection");
      const conn = await getRawConnection();

      // Count journal entries for income vs expense
      const [overviewRows] = await conn.execute(
        `SELECT
           aa.category AS accountCategory,
           SUM(CASE WHEN aa.category = 'revenue' THEN ejl.credit_amount ELSE 0 END) AS revenueTotal,
           SUM(CASE WHEN aa.category = 'expenses' THEN ejl.debit_amount ELSE 0 END) AS expenseTotal,
           COUNT(DISTINCT CASE WHEN aa.category = 'revenue' THEN eje.id END) AS incomeCount,
           COUNT(DISTINCT CASE WHEN aa.category = 'expenses' THEN eje.id END) AS expenseCount
         FROM expense_journal_lines ejl
         INNER JOIN expense_journal_entries eje
           ON eje.id = ejl.journal_entry_id AND eje.tenant_id = ?
         INNER JOIN accounting_accounts aa
           ON aa.id = ejl.account_id AND aa.tenant_id = ?
         WHERE ejl.tenant_id = ?
           AND eje.entry_date >= ? AND eje.entry_date <= ?
           AND aa.category IN ('revenue', 'expenses')`,
        [tenantId, tenantId, tenantId, input.startDate, input.endDate],
      );

      const row = (overviewRows as any[])[0] || {};
      const totalIncome = Number(row.revenueTotal) || 0;
      const totalExpense = Number(row.expenseTotal) || 0;
      const incomeCount = Number(row.incomeCount) || 0;
      const expenseCount = Number(row.expenseCount) || 0;

      return {
        totalIncome,
        totalExpense,
        netCashFlow: totalIncome - totalExpense,
        incomeCount,
        expenseCount,
        totalCount: incomeCount + expenseCount,
      };
    }),

  // ────────────────────────────────────────────
  // 시스템 계정 초기화 (ensureSystemAccounts)
  // ────────────────────────────────────────────
  initializeCategories: adminProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.tenantId;
    if (!tenantId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 ID가 필요합니다" });
    }
    const { ensureSystemAccounts } = await import("../../db/accounting/journalHelper");
    await ensureSystemAccounts(tenantId, ctx.user.id as number);
    return { success: true };
  }),
});

// ────────────────────────────────────────────
// Helper: 5분류 category -> income/expense type
// ────────────────────────────────────────────
function mapCategoryToType(category: string): "income" | "expense" {
  switch (category) {
    case "revenue":
      return "income";
    case "expenses":
    case "assets":
    case "liabilities":
    case "equity":
    default:
      return "expense";
  }
}
