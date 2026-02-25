#!/usr/bin/env python3
"""
dist/index.js에 bankAccount, bankTransaction, bankTransactionBulk 라우터를 추가하는 스크립트
"""
import re

# dist/index.js 읽기
with open('/root/haccp_v3/dist/index.js', 'r') as f:
    content = f.read()

# 1. bankAccountRouter 정의 코드 (기존 패턴을 따름)
bank_account_router_code = '''
// === bankAccountRouter (auto-injected) ===
var bankAccountRouter = router2({
  list: protectedProcedure.query(async (opts) => {
    const db = await getDb();
    const { bankAccounts: bankAccounts2 } = await Promise.resolve().then(() => (init_schema_main(), schema_main_exports));
    const { eq: eq2 } = await import("drizzle-orm");
    const tenantId = opts.ctx.user?.tenantId;
    const conditions = [];
    if (tenantId) {
      conditions.push(eq2(bankAccounts2.tenantId, tenantId));
    }
    try {
      const accounts = conditions.length > 0
        ? await db.select().from(bankAccounts2).where(conditions[0]).orderBy(bankAccounts2.createdAt)
        : await db.select().from(bankAccounts2).orderBy(bankAccounts2.createdAt);
      return { accounts };
    } catch (e) {
      console.error("bankAccount.list error:", e);
      return { accounts: [] };
    }
  }),
  getById: protectedProcedure
    .input(z2.object({ id: z2.number() }))
    .query(async (opts) => {
      const db = await getDb();
      const { bankAccounts: bankAccounts2 } = await Promise.resolve().then(() => (init_schema_main(), schema_main_exports));
      const { eq: eq2, and: and2 } = await import("drizzle-orm");
      const tenantId = opts.ctx.user?.tenantId;
      const conditions = [eq2(bankAccounts2.id, opts.input.id)];
      if (tenantId) conditions.push(eq2(bankAccounts2.tenantId, tenantId));
      const account = await db.select().from(bankAccounts2).where(and2(...conditions)).limit(1);
      if (!account || account.length === 0) throw new Error("계좌를 찾을 수 없습니다.");
      return account[0];
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
      const db = await getDb();
      const { bankAccounts: bankAccounts2 } = await Promise.resolve().then(() => (init_schema_main(), schema_main_exports));
      const tenantId = opts.ctx.user?.tenantId || 1;
      const result = await db.insert(bankAccounts2).values({
        tenantId,
        bankName: opts.input.bankName,
        accountNo: opts.input.accountNo,
        accountName: opts.input.accountName,
        accountType: opts.input.accountType,
        currency: opts.input.currency,
        defaultAccountingAccountId: opts.input.defaultAccountingAccountId,
        isActive: "Y",
        notes: opts.input.notes,
        createdBy: opts.ctx.user?.id
      });
      return { id: Number(result.insertId), message: "계좌가 등록되었습니다." };
    }),
  update: protectedProcedure
    .input(z2.object({
      id: z2.number(),
      bankName: z2.string().optional(),
      accountNo: z2.string().optional(),
      accountName: z2.string().optional(),
      accountType: z2.enum(["checking", "savings", "investment", "other"]).optional(),
      currency: z2.string().optional(),
      defaultAccountingAccountId: z2.number().optional(),
      notes: z2.string().optional()
    }))
    .mutation(async (opts) => {
      const db = await getDb();
      const { bankAccounts: bankAccounts2 } = await Promise.resolve().then(() => (init_schema_main(), schema_main_exports));
      const { eq: eq2, and: and2 } = await import("drizzle-orm");
      const tenantId = opts.ctx.user?.tenantId;
      const { id, ...updateData } = opts.input;
      const conditions = [eq2(bankAccounts2.id, id)];
      if (tenantId) conditions.push(eq2(bankAccounts2.tenantId, tenantId));
      await db.update(bankAccounts2).set(updateData).where(and2(...conditions));
      return { message: "계좌 정보가 수정되었습니다." };
    }),
  delete: protectedProcedure
    .input(z2.object({ id: z2.number() }))
    .mutation(async (opts) => {
      const db = await getDb();
      const { bankAccounts: bankAccounts2 } = await Promise.resolve().then(() => (init_schema_main(), schema_main_exports));
      const { eq: eq2, and: and2 } = await import("drizzle-orm");
      const tenantId = opts.ctx.user?.tenantId;
      const conditions = [eq2(bankAccounts2.id, opts.input.id)];
      if (tenantId) conditions.push(eq2(bankAccounts2.tenantId, tenantId));
      await db.update(bankAccounts2).set({ isActive: "N" }).where(and2(...conditions));
      return { message: "계좌가 비활성화되었습니다." };
    }),
  getStats: protectedProcedure
    .input(z2.object({ accountId: z2.number() }))
    .query(async (opts) => {
      const db = await getDb();
      const { sql: sql2 } = await import("drizzle-orm");
      const tenantId = opts.ctx.user?.tenantId || 1;
      try {
        const stats = await db.execute(sql2\`
          SELECT 
            COUNT(*) as totalTransactions,
            COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as totalDeposit,
            COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) as totalWithdrawal,
            COALESCE(SUM(CASE WHEN matching_status = 'unmatched' THEN 1 ELSE 0 END), 0) as unmatchedCount
          FROM bank_transactions
          WHERE bank_account_id = \${opts.input.accountId}
            AND tenant_id = \${tenantId}
        \`);
        return stats[0]?.[0] || { totalTransactions: 0, totalDeposit: 0, totalWithdrawal: 0, unmatchedCount: 0 };
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
      const db = await getDb();
      const { sql: sql2 } = await import("drizzle-orm");
      const tenantId = opts.ctx.user?.tenantId || 1;
      const input = opts.input || {};
      try {
        let whereClause = \`WHERE t.tenant_id = \${tenantId}\`;
        if (input.bankAccountId) whereClause += \` AND t.bank_account_id = \${input.bankAccountId}\`;
        if (input.startDate) whereClause += \` AND t.transaction_date >= '\${input.startDate}'\`;
        if (input.endDate) whereClause += \` AND t.transaction_date <= '\${input.endDate}'\`;
        if (input.matchingStatus) whereClause += \` AND t.matching_status = '\${input.matchingStatus}'\`;
        if (input.search) whereClause += \` AND (t.description LIKE '%\${input.search}%' OR t.counterparty LIKE '%\${input.search}%')\`;
        
        const page = input.page || 1;
        const limit = input.limit || 50;
        const offset = (page - 1) * limit;
        
        const [transactions] = await db.execute(sql2.raw(\`
          SELECT t.*, ba.bank_name, ba.account_no
          FROM bank_transactions t
          LEFT JOIN bank_accounts ba ON t.bank_account_id = ba.id
          \${whereClause}
          ORDER BY t.transaction_date DESC, t.id DESC
          LIMIT \${limit} OFFSET \${offset}
        \`));
        
        const [countResult] = await db.execute(sql2.raw(\`
          SELECT COUNT(*) as total FROM bank_transactions t \${whereClause}
        \`));
        
        return {
          transactions: transactions || [],
          total: countResult?.[0]?.total || 0,
          page,
          limit
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
      const db = await getDb();
      const { bankTransactions: bankTx } = await Promise.resolve().then(() => (init_schema_main(), schema_main_exports));
      const tenantId = opts.ctx.user?.tenantId || 1;
      let inserted = 0;
      for (const tx of opts.input.transactions) {
        try {
          await db.insert(bankTx).values({
            tenantId,
            bankAccountId: opts.input.bankAccountId,
            transactionDate: tx.transactionDate,
            transactionType: tx.transactionType,
            amount: String(tx.amount),
            balance: tx.balance ? String(tx.balance) : null,
            description: tx.description,
            counterparty: tx.counterparty,
            memo: tx.memo,
            matchingStatus: "unmatched",
            createdBy: opts.ctx.user?.id
          });
          inserted++;
        } catch (e) {
          console.error("bankTransaction.upload insert error:", e);
        }
      }
      return { inserted, total: opts.input.transactions.length, message: \`\${inserted}건이 업로드되었습니다.\` };
    }),
  getStats: protectedProcedure
    .query(async (opts) => {
      const db = await getDb();
      const { sql: sql2 } = await import("drizzle-orm");
      const tenantId = opts.ctx.user?.tenantId || 1;
      try {
        const [stats] = await db.execute(sql2.raw(\`
          SELECT 
            COUNT(*) as totalCount,
            COALESCE(SUM(CASE WHEN matching_status = 'matched' THEN 1 ELSE 0 END), 0) as matchedCount,
            COALESCE(SUM(CASE WHEN matching_status = 'unmatched' THEN 1 ELSE 0 END), 0) as unmatchedCount,
            COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as totalDeposit,
            COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) as totalWithdrawal
          FROM bank_transactions
          WHERE tenant_id = \${tenantId}
        \`));
        return stats?.[0] || { totalCount: 0, matchedCount: 0, unmatchedCount: 0, totalDeposit: 0, totalWithdrawal: 0 };
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
      const db = await getDb();
      const { sql: sql2 } = await import("drizzle-orm");
      const tenantId = opts.ctx.user?.tenantId || 1;
      try {
        let whereClause = \`WHERE bt.matching_status = 'unmatched' AND bt.tenant_id = \${tenantId}\`;
        if (opts.input.bankAccountId) whereClause += \` AND bt.bank_account_id = \${opts.input.bankAccountId}\`;
        
        const [unmatched] = await db.execute(sql2.raw(\`
          SELECT bt.* FROM bank_transactions bt \${whereClause} ORDER BY bt.transaction_date DESC
        \`));
        
        let matchedCount = 0;
        for (const tx of (unmatched || [])) {
          // 매칭 규칙 기반 자동 매칭 시도
          const [rules] = await db.execute(sql2.raw(\`
            SELECT * FROM matching_rules WHERE tenant_id = \${tenantId} AND is_active = 1
          \`));
          
          for (const rule of (rules || [])) {
            let matched = false;
            if (rule.match_type === 'exact' && tx.counterparty === rule.match_value) matched = true;
            if (rule.match_type === 'contains' && tx.counterparty && tx.counterparty.includes(rule.match_value)) matched = true;
            if (rule.match_type === 'description_contains' && tx.description && tx.description.includes(rule.match_value)) matched = true;
            
            if (matched) {
              await db.execute(sql2.raw(\`
                UPDATE bank_transactions SET matching_status = 'matched', matched_ledger_type = '\${rule.target_ledger_type}', matched_ledger_id = \${rule.target_ledger_id || 0}, matched_at = NOW() WHERE id = \${tx.id}
              \`));
              matchedCount++;
              break;
            }
          }
        }
        
        return { matchedCount, totalUnmatched: (unmatched || []).length, message: \`\${matchedCount}건이 자동 매칭되었습니다.\` };
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
      const db = await getDb();
      const { sql: sql2 } = await import("drizzle-orm");
      try {
        await db.execute(sql2.raw(\`
          UPDATE bank_transactions SET matching_status = 'matched', matched_ledger_type = '\${opts.input.ledgerType}', matched_ledger_id = \${opts.input.ledgerId}, matched_at = NOW() WHERE id = \${opts.input.transactionId}
        \`));
        return { message: "매칭이 완료되었습니다." };
      } catch (e) {
        console.error("bankTransactionBulk.manualMatch error:", e);
        return { message: "매칭 중 오류가 발생했습니다." };
      }
    }),
  unmatch: protectedProcedure
    .input(z2.object({ transactionId: z2.number() }))
    .mutation(async (opts) => {
      const db = await getDb();
      const { sql: sql2 } = await import("drizzle-orm");
      try {
        await db.execute(sql2.raw(\`
          UPDATE bank_transactions SET matching_status = 'unmatched', matched_ledger_type = NULL, matched_ledger_id = NULL, matched_at = NULL WHERE id = \${opts.input.transactionId}
        \`));
        return { message: "매칭이 해제되었습니다." };
      } catch (e) {
        return { message: "매칭 해제 중 오류가 발생했습니다." };
      }
    })
});
'''

# 2. appRouter에 라우터 등록 추가
# inventoryAccounting: inventoryAccountingRouter, 뒤에 추가
old_registration = '  inventoryAccounting: inventoryAccountingRouter,'
new_registration = '''  inventoryAccounting: inventoryAccountingRouter,
  bankAccount: bankAccountRouter,
  bankTransaction: bankTransactionRouter,
  bankTransactionBulk: bankTransactionBulkRouter,'''

# 3. 라우터 정의 코드 삽입 (appRouter 정의 직전에)
# appRouter 정의 찾기
app_router_match = 'var appRouter = router2({'
app_router_pos = content.find(app_router_match)

if app_router_pos == -1:
    print("ERROR: appRouter definition not found!")
    exit(1)

# appRouter 직전에 라우터 정의 삽입
content = content[:app_router_pos] + bank_account_router_code + '\n' + content[app_router_pos:]

# 4. appRouter에 라우터 등록
content = content.replace(old_registration, new_registration, 1)

# 5. 저장
with open('/root/haccp_v3/dist/index.js', 'w') as f:
    f.write(content)

print("SUCCESS: bankAccount, bankTransaction, bankTransactionBulk routers added to dist/index.js")
print(f"Router definitions inserted before appRouter at position {app_router_pos}")

# 검증
with open('/root/haccp_v3/dist/index.js', 'r') as f:
    verify = f.read()
    
checks = [
    'bankAccountRouter',
    'bankTransactionRouter', 
    'bankTransactionBulkRouter',
    'bankAccount: bankAccountRouter',
    'bankTransaction: bankTransactionRouter',
    'bankTransactionBulk: bankTransactionBulkRouter'
]
for check in checks:
    if check in verify:
        print(f"  ✓ {check}")
    else:
        print(f"  ✗ {check} NOT FOUND!")
