/**
 * 계좌 서비스 - 비즈니스 로직 분리
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
import { bankAccounts } from "../../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { omitUndefined } from "@shared/utils";

/**
 * bankAccountId가 현재 tenant 소유인지 검증
 * 계좌 관련 쓰기 API 진입점에서 반드시 호출
 */
export async function assertBankAccountOwned(tenantId: number, bankAccountId: number) {
  const db = await getDb();
  const [row] = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, bankAccountId),
        eq(bankAccounts.tenantId, tenantId),
        eq(bankAccounts.isActive, "Y")
      )
    )
    .limit(1);

  if (!row) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "해당 계좌에 접근할 수 없습니다.",
    });
  }
}

export async function listAccounts(tenantId: number, filters?: { isActive?: "Y" | "N" }) {
  const db = await getDb();
  const conditions = [eq(bankAccounts.tenantId, tenantId)];

  if (filters?.isActive) {
    conditions.push(eq(bankAccounts.isActive, filters.isActive));
  }

  return db
    .select()
    .from(bankAccounts)
    .where(and(...conditions))
    .orderBy(bankAccounts.createdAt);
}

export async function getAccountById(tenantId: number, accountId: number) {
  const db = await getDb();
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.id, accountId),
        eq(bankAccounts.tenantId, tenantId)
      )
    )
    .limit(1);

  if (!account) {
    throw new TRPCError({ code: "NOT_FOUND", message: "계좌를 찾을 수 없습니다." });
  }

  return account;
}

export async function createAccount(tenantId: number, userId: number, data: {
  bankName: string;
  accountNo: string;
  accountName?: string;
  accountType: "checking" | "savings" | "investment" | "other";
  currency: string;
  defaultAccountingAccountId?: number;
  notes?: string;
}) {
  const db = await getDb();
  const result = await db.insert(bankAccounts).values({
    tenantId,
    bankName: data.bankName,
    accountNo: data.accountNo,
    accountName: data.accountName,
    accountType: data.accountType,
    currency: data.currency,
    defaultAccountingAccountId: data.defaultAccountingAccountId,
    isActive: "Y",
    notes: data.notes,
    createdBy: userId,
  });

  return Number((result as any).insertId);
}

export async function updateAccount(tenantId: number, accountId: number, data: {
  bankName?: string;
  accountNo?: string;
  accountName?: string;
  accountType?: "checking" | "savings" | "investment" | "other";
  currency?: string;
  defaultAccountingAccountId?: number;
  notes?: string;
}) {
  const db = await getDb();
  await db
    .update(bankAccounts)
    .set(omitUndefined(data))
    .where(
      and(
        eq(bankAccounts.id, accountId),
        eq(bankAccounts.tenantId, tenantId)
      )
    );
}

export async function deactivateAccount(tenantId: number, accountId: number) {
  const db = await getDb();
  await db
    .update(bankAccounts)
    .set({ isActive: "N" })
    .where(
      and(
        eq(bankAccounts.id, accountId),
        eq(bankAccounts.tenantId, tenantId)
      )
    );
}

export async function getAccountStats(tenantId: number, accountId: number) {
  const db = await getDb();

  // 소유권 검증
  await assertBankAccountOwned(tenantId, accountId);

  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as totalTransactions,
      COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as totalDeposit,
      COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) as totalWithdrawal,
      COALESCE(SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END), 0) as unmatchedCount
    FROM bank_transactions
    WHERE bank_account_id = ${accountId}
      AND tenant_id = ${tenantId}
  `);

  try {
    let row: any = null;
    if (Array.isArray(stats)) {
      if (Array.isArray(stats[0])) {
        row = stats[0][0];
      } else if (stats[0] && typeof stats[0] === 'object' && 'totalTransactions' in stats[0]) {
        row = stats[0];
      }
    }
    if (!row) return { totalTransactions: 0, totalDeposit: 0, totalWithdrawal: 0, unmatchedCount: 0 };
    return {
      totalTransactions: Number(row.totalTransactions || 0),
      totalDeposit: Number(row.totalDeposit || 0),
      totalWithdrawal: Number(row.totalWithdrawal || 0),
      unmatchedCount: Number(row.unmatchedCount || 0),
    };
  } catch (e) {
    console.error("[getAccountStats] Error:", e);
    return { totalTransactions: 0, totalDeposit: 0, totalWithdrawal: 0, unmatchedCount: 0 };
  }
}
