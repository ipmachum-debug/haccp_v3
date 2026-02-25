#!/usr/bin/env python3
"""
dist/index.js에 bankAccount, bankTransaction, bankTransactionBulk 라우터를 추가하는 스크립트 v2
- 템플릿 리터럴 대신 sql.raw() + 문자열 연결 사용
"""

with open('/root/haccp_v3/dist/index.js', 'r') as f:
    content = f.read()

# 라우터 코드 - 백틱/템플릿 리터럴 없이 작성
bank_router_code = r'''
// === bankAccountRouter (auto-injected) ===
var bankAccountRouter = router2({
  list: protectedProcedure.query(async (opts) => {
    try {
      var db = await getDb();
      var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
      var rows = await db.execute("SELECT * FROM bank_accounts WHERE tenant_id = " + tenantId + " ORDER BY created_at DESC");
      return { accounts: (rows && rows[0]) || [] };
    } catch (e) {
      console.error("bankAccount.list error:", e);
      return { accounts: [] };
    }
  }),
  getById: protectedProcedure
    .input(z2.object({ id: z2.number() }))
    .query(async (opts) => {
      try {
        var db = await getDb();
        var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
        var rows = await db.execute("SELECT * FROM bank_accounts WHERE id = " + opts.input.id + " AND tenant_id = " + tenantId + " LIMIT 1");
        var accounts = (rows && rows[0]) || [];
        if (accounts.length === 0) throw new Error("계좌를 찾을 수 없습니다.");
        return accounts[0];
      } catch (e) {
        throw new Error("계좌를 찾을 수 없습니다.");
      }
    }),
  create: protectedProcedure
    .input(z2.object({
      bankName: z2.string().min(1),
      accountNo: z2.string().min(1),
      accountName: z2.string().optional(),
      accountType: z2.enum(["checking", "savings", "investment", "other"]).default("checking"),
      currency: z2.string().default("KRW"),
      defaultAccountingAccountId: z2.number().optional(),
      notes: z2.string().optional()
    }))
    .mutation(async (opts) => {
      try {
        var db = await getDb();
        var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
        var userId = opts.ctx.user && opts.ctx.user.id ? opts.ctx.user.id : 1;
        var result = await db.execute(
          "INSERT INTO bank_accounts (tenant_id, bank_name, account_no, account_name, account_type, currency, is_active, notes, created_by) VALUES (" +
          tenantId + ", " +
          "'" + (opts.input.bankName || "").replace(/'/g, "''") + "', " +
          "'" + (opts.input.accountNo || "").replace(/'/g, "''") + "', " +
          "'" + (opts.input.accountName || "").replace(/'/g, "''") + "', " +
          "'" + (opts.input.accountType || "checking") + "', " +
          "'" + (opts.input.currency || "KRW") + "', " +
          "'Y', " +
          "'" + (opts.input.notes || "").replace(/'/g, "''") + "', " +
          userId + ")"
        );
        return { id: result && result[0] && result[0].insertId ? Number(result[0].insertId) : 0, message: "계좌가 등록되었습니다." };
      } catch (e) {
        console.error("bankAccount.create error:", e);
        throw new Error("계좌 등록 중 오류가 발생했습니다: " + e.message);
      }
    }),
  update: protectedProcedure
    .input(z2.object({
      id: z2.number(),
      bankName: z2.string().optional(),
      accountNo: z2.string().optional(),
      accountName: z2.string().optional(),
      accountType: z2.enum(["checking", "savings", "investment", "other"]).optional(),
      currency: z2.string().optional(),
      notes: z2.string().optional()
    }))
    .mutation(async (opts) => {
      try {
        var db = await getDb();
        var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
        var sets = [];
        if (opts.input.bankName) sets.push("bank_name = '" + opts.input.bankName.replace(/'/g, "''") + "'");
        if (opts.input.accountNo) sets.push("account_no = '" + opts.input.accountNo.replace(/'/g, "''") + "'");
        if (opts.input.accountName !== undefined) sets.push("account_name = '" + (opts.input.accountName || "").replace(/'/g, "''") + "'");
        if (opts.input.accountType) sets.push("account_type = '" + opts.input.accountType + "'");
        if (opts.input.currency) sets.push("currency = '" + opts.input.currency + "'");
        if (opts.input.notes !== undefined) sets.push("notes = '" + (opts.input.notes || "").replace(/'/g, "''") + "'");
        if (sets.length > 0) {
          await db.execute("UPDATE bank_accounts SET " + sets.join(", ") + " WHERE id = " + opts.input.id + " AND tenant_id = " + tenantId);
        }
        return { message: "계좌 정보가 수정되었습니다." };
      } catch (e) {
        throw new Error("계좌 수정 중 오류가 발생했습니다.");
      }
    }),
  delete: protectedProcedure
    .input(z2.object({ id: z2.number() }))
    .mutation(async (opts) => {
      try {
        var db = await getDb();
        var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
        await db.execute("UPDATE bank_accounts SET is_active = 'N' WHERE id = " + opts.input.id + " AND tenant_id = " + tenantId);
        return { message: "계좌가 비활성화되었습니다." };
      } catch (e) {
        throw new Error("계좌 비활성화 중 오류가 발생했습니다.");
      }
    }),
  getStats: protectedProcedure
    .input(z2.object({ accountId: z2.number() }))
    .query(async (opts) => {
      try {
        var db = await getDb();
        var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
        var rows = await db.execute(
          "SELECT COUNT(*) as totalTransactions, " +
          "COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as totalDeposit, " +
          "COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) as totalWithdrawal, " +
          "COALESCE(SUM(CASE WHEN matching_status = 'unmatched' THEN 1 ELSE 0 END), 0) as unmatchedCount " +
          "FROM bank_transactions WHERE bank_account_id = " + opts.input.accountId + " AND tenant_id = " + tenantId
        );
        return (rows && rows[0] && rows[0][0]) || { totalTransactions: 0, totalDeposit: 0, totalWithdrawal: 0, unmatchedCount: 0 };
      } catch (e) {
        return { totalTransactions: 0, totalDeposit: 0, totalWithdrawal: 0, unmatchedCount: 0 };
      }
    })
});

// === bankTransactionRouter (auto-injected) ===
var bankTransactionRouter = router2({
  list: protectedProcedure
    .input(z2.object({
      bankAccountId: z2.number().optional(),
      startDate: z2.string().optional(),
      endDate: z2.string().optional(),
      matchingStatus: z2.string().optional(),
      search: z2.string().optional(),
      page: z2.number().default(1),
      limit: z2.number().default(50)
    }).optional())
    .query(async (opts) => {
      try {
        var db = await getDb();
        var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
        var input = opts.input || {};
        var where = "WHERE t.tenant_id = " + tenantId;
        if (input.bankAccountId) where += " AND t.bank_account_id = " + input.bankAccountId;
        if (input.startDate) where += " AND t.transaction_date >= '" + input.startDate + "'";
        if (input.endDate) where += " AND t.transaction_date <= '" + input.endDate + "'";
        if (input.matchingStatus) where += " AND t.matching_status = '" + input.matchingStatus + "'";
        if (input.search) where += " AND (t.description LIKE '%" + input.search.replace(/'/g, "''") + "%' OR t.counterparty LIKE '%" + input.search.replace(/'/g, "''") + "%')";
        var page = input.page || 1;
        var limit = input.limit || 50;
        var offset = (page - 1) * limit;
        var rows = await db.execute(
          "SELECT t.*, ba.bank_name, ba.account_no FROM bank_transactions t " +
          "LEFT JOIN bank_accounts ba ON t.bank_account_id = ba.id " +
          where + " ORDER BY t.transaction_date DESC, t.id DESC LIMIT " + limit + " OFFSET " + offset
        );
        var countRows = await db.execute("SELECT COUNT(*) as total FROM bank_transactions t " + where);
        return {
          transactions: (rows && rows[0]) || [],
          total: (countRows && countRows[0] && countRows[0][0] && countRows[0][0].total) || 0,
          page: page,
          limit: limit
        };
      } catch (e) {
        console.error("bankTransaction.list error:", e);
        return { transactions: [], total: 0, page: 1, limit: 50 };
      }
    }),
  upload: protectedProcedure
    .input(z2.object({
      bankAccountId: z2.number(),
      transactions: z2.array(z2.object({
        transactionDate: z2.string(),
        transactionType: z2.enum(["deposit", "withdrawal"]),
        amount: z2.number(),
        balance: z2.number().optional(),
        description: z2.string().optional(),
        counterparty: z2.string().optional(),
        memo: z2.string().optional()
      }))
    }))
    .mutation(async (opts) => {
      try {
        var db = await getDb();
        var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
        var userId = opts.ctx.user && opts.ctx.user.id ? opts.ctx.user.id : 1;
        var inserted = 0;
        for (var i = 0; i < opts.input.transactions.length; i++) {
          var tx = opts.input.transactions[i];
          try {
            await db.execute(
              "INSERT INTO bank_transactions (tenant_id, bank_account_id, transaction_date, transaction_type, amount, balance, description, counterparty, memo, matching_status, created_by) VALUES (" +
              tenantId + ", " + opts.input.bankAccountId + ", '" + tx.transactionDate + "', '" + tx.transactionType + "', " +
              tx.amount + ", " + (tx.balance || 0) + ", " +
              "'" + (tx.description || "").replace(/'/g, "''") + "', " +
              "'" + (tx.counterparty || "").replace(/'/g, "''") + "', " +
              "'" + (tx.memo || "").replace(/'/g, "''") + "', 'unmatched', " + userId + ")"
            );
            inserted++;
          } catch (ie) {
            console.error("bankTransaction.upload insert error:", ie);
          }
        }
        return { inserted: inserted, total: opts.input.transactions.length, message: inserted + "건이 업로드되었습니다." };
      } catch (e) {
        console.error("bankTransaction.upload error:", e);
        throw new Error("업로드 중 오류가 발생했습니다.");
      }
    }),
  getStats: protectedProcedure
    .query(async (opts) => {
      try {
        var db = await getDb();
        var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
        var rows = await db.execute(
          "SELECT COUNT(*) as totalCount, " +
          "COALESCE(SUM(CASE WHEN matching_status = 'matched' THEN 1 ELSE 0 END), 0) as matchedCount, " +
          "COALESCE(SUM(CASE WHEN matching_status = 'unmatched' THEN 1 ELSE 0 END), 0) as unmatchedCount, " +
          "COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as totalDeposit, " +
          "COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) as totalWithdrawal " +
          "FROM bank_transactions WHERE tenant_id = " + tenantId
        );
        return (rows && rows[0] && rows[0][0]) || { totalCount: 0, matchedCount: 0, unmatchedCount: 0, totalDeposit: 0, totalWithdrawal: 0 };
      } catch (e) {
        return { totalCount: 0, matchedCount: 0, unmatchedCount: 0, totalDeposit: 0, totalWithdrawal: 0 };
      }
    })
});

// === bankTransactionBulkRouter (auto-injected) ===
var bankTransactionBulkRouter = router2({
  autoMatch: protectedProcedure
    .input(z2.object({ bankAccountId: z2.number().optional() }))
    .mutation(async (opts) => {
      try {
        var db = await getDb();
        var tenantId = opts.ctx.user && opts.ctx.user.tenantId ? opts.ctx.user.tenantId : 1;
        var where = "WHERE bt.matching_status = 'unmatched' AND bt.tenant_id = " + tenantId;
        if (opts.input.bankAccountId) where += " AND bt.bank_account_id = " + opts.input.bankAccountId;
        var rows = await db.execute("SELECT bt.* FROM bank_transactions bt " + where + " ORDER BY bt.transaction_date DESC");
        var unmatched = (rows && rows[0]) || [];
        var matchedCount = 0;
        for (var i = 0; i < unmatched.length; i++) {
          var tx = unmatched[i];
          try {
            var ruleRows = await db.execute("SELECT * FROM matching_rules WHERE tenant_id = " + tenantId + " AND is_active = 1");
            var rules = (ruleRows && ruleRows[0]) || [];
            for (var j = 0; j < rules.length; j++) {
              var rule = rules[j];
              var matched = false;
              if (rule.match_type === "exact" && tx.counterparty === rule.match_value) matched = true;
              if (rule.match_type === "contains" && tx.counterparty && tx.counterparty.indexOf(rule.match_value) >= 0) matched = true;
              if (rule.match_type === "description_contains" && tx.description && tx.description.indexOf(rule.match_value) >= 0) matched = true;
              if (matched) {
                await db.execute("UPDATE bank_transactions SET matching_status = 'matched', matched_ledger_type = '" + (rule.target_ledger_type || "") + "', matched_ledger_id = " + (rule.target_ledger_id || 0) + ", matched_at = NOW() WHERE id = " + tx.id);
                matchedCount++;
                break;
              }
            }
          } catch (me) {
            console.error("autoMatch rule error:", me);
          }
        }
        return { matchedCount: matchedCount, totalUnmatched: unmatched.length, message: matchedCount + "건이 자동 매칭되었습니다." };
      } catch (e) {
        console.error("bankTransactionBulk.autoMatch error:", e);
        return { matchedCount: 0, totalUnmatched: 0, message: "자동 매칭 중 오류가 발생했습니다." };
      }
    }),
  manualMatch: protectedProcedure
    .input(z2.object({
      transactionId: z2.number(),
      ledgerType: z2.enum(["ap", "ar"]),
      ledgerId: z2.number()
    }))
    .mutation(async (opts) => {
      try {
        var db = await getDb();
        await db.execute("UPDATE bank_transactions SET matching_status = 'matched', matched_ledger_type = '" + opts.input.ledgerType + "', matched_ledger_id = " + opts.input.ledgerId + ", matched_at = NOW() WHERE id = " + opts.input.transactionId);
        return { message: "매칭이 완료되었습니다." };
      } catch (e) {
        return { message: "매칭 중 오류가 발생했습니다." };
      }
    }),
  unmatch: protectedProcedure
    .input(z2.object({ transactionId: z2.number() }))
    .mutation(async (opts) => {
      try {
        var db = await getDb();
        await db.execute("UPDATE bank_transactions SET matching_status = 'unmatched', matched_ledger_type = NULL, matched_ledger_id = NULL, matched_at = NULL WHERE id = " + opts.input.transactionId);
        return { message: "매칭이 해제되었습니다." };
      } catch (e) {
        return { message: "매칭 해제 중 오류가 발생했습니다." };
      }
    })
});
'''

# appRouter 정의 찾기
app_router_match = 'var appRouter = router2({'
app_router_pos = content.find(app_router_match)

if app_router_pos == -1:
    print("ERROR: appRouter definition not found!")
    exit(1)

# appRouter 직전에 라우터 정의 삽입
content = content[:app_router_pos] + bank_router_code + '\n' + content[app_router_pos:]

# appRouter에 라우터 등록 추가
old_registration = '  inventoryAccounting: inventoryAccountingRouter,'
new_registration = '  inventoryAccounting: inventoryAccountingRouter,\n  bankAccount: bankAccountRouter,\n  bankTransaction: bankTransactionRouter,\n  bankTransactionBulk: bankTransactionBulkRouter,'

content = content.replace(old_registration, new_registration, 1)

# 저장
with open('/root/haccp_v3/dist/index.js', 'w') as f:
    f.write(content)

print("SUCCESS: Bank routers added to dist/index.js (v2 - no template literals)")

# 검증
with open('/root/haccp_v3/dist/index.js', 'r') as f:
    verify = f.read()

for check in ['bankAccountRouter', 'bankTransactionRouter', 'bankTransactionBulkRouter',
              'bankAccount: bankAccountRouter', 'bankTransaction: bankTransactionRouter']:
    print(("  OK " if check in verify else "  FAIL ") + check)
