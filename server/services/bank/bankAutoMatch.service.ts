/**
 * 자동 매칭 서비스 - 매칭 규칙 엔진
 */

import { getDb } from "../../db";
import { bankTransactions, matchingRules } from "../../../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";
import { assertBankAccountOwned } from "./bankAccount.service";

function parseJsonSafe(text: string | null | undefined): any {
  if (!text) return null;
  try {
    return typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return null;
  }
}

export interface MatchResult {
  accountingAccountId: number | null;
  ruleId: number | null;
  ruleName: string | null;
  partnerId: number | null;
  memo: string | null;
}

const NO_MATCH: MatchResult = { accountingAccountId: null, ruleId: null, ruleName: null, partnerId: null, memo: null };

export async function findMatchingRule(
  db: any,
  tenantId: number,
  description: string,
  amount: number,
  transactionType?: "deposit" | "withdrawal"
): Promise<MatchResult> {
  try {
    const rules = await db
      .select()
      .from(matchingRules)
      .where(and(eq(matchingRules.tenantId, tenantId), eq(matchingRules.isActive, 1)))
      .orderBy(asc(matchingRules.priority));

    for (const rule of rules) {
      const cond = parseJsonSafe(rule.conditions);
      const actions = parseJsonSafe(rule.actions);
      if (!cond) continue;

      if (cond.transactionType && transactionType && cond.transactionType !== transactionType) {
        continue;
      }

      let matched = false;

      switch (rule.ruleType) {
        case "keyword":
          matched = !!(cond.keyword && description.toLowerCase().includes(cond.keyword.toLowerCase()));
          break;

        case "amount":
          matched = cond.amountMin !== undefined && cond.amountMax !== undefined &&
            amount >= cond.amountMin && amount <= cond.amountMax;
          break;

        case "pattern":
          if (cond.pattern || cond.keyword) {
            try {
              matched = new RegExp(cond.pattern || cond.keyword, "i").test(description);
            } catch { /* invalid regex */ }
          }
          break;

        case "combined": {
          const keywordOk = !cond.keyword || description.toLowerCase().includes(cond.keyword.toLowerCase());
          const amountOk = cond.amountMin === undefined || cond.amountMax === undefined ||
            (amount >= cond.amountMin && amount <= cond.amountMax);
          matched = keywordOk && amountOk;
          break;
        }
      }

      if (matched) {
        const targetAccountId = actions?.accountingAccountId || actions?.targetAccountId;
        if (targetAccountId) {
          return {
            accountingAccountId: targetAccountId,
            ruleId: rule.id,
            ruleName: cond.name || `규칙 #${rule.id}`,
            partnerId: actions?.partnerId || null,
            memo: actions?.memo || null,
          };
        }
      }
    }
  } catch (e) {
    console.error("[findMatchingRule] Error:", e);
  }

  return NO_MATCH;
}

/**
 * 미매칭 거래에 대해 자동 매칭 실행
 */
export async function runAutoMatch(tenantId: number, userId: number, bankAccountId?: number) {
  const db = await getDb();

  const conditions = [
    eq(bankTransactions.tenantId, tenantId),
    eq(bankTransactions.matchingStatus, "unmatched"),
  ];

  if (bankAccountId) {
    await assertBankAccountOwned(tenantId, bankAccountId);
    conditions.push(eq(bankTransactions.bankAccountId, bankAccountId));
  }

  const unmatchedTransactions = await db
    .select()
    .from(bankTransactions)
    .where(and(...conditions));

  let matchedCount = 0;

  for (const transaction of unmatchedTransactions) {
    const matchResult = await findMatchingRule(
      db,
      tenantId,
      transaction.description || "",
      Number(transaction.amount),
      transaction.transactionType as "deposit" | "withdrawal" | undefined
    );

    if (matchResult.accountingAccountId) {
      await db
        .update(bankTransactions)
        .set({
          matchingStatus: "matched",
          accountingAccountId: matchResult.accountingAccountId,
          matchedBy: userId,
          matchedAt: new Date(),
        })
        .where(and(eq(bankTransactions.id, transaction.id), eq(bankTransactions.tenantId, tenantId)));

      matchedCount++;
    }
  }

  return { total: unmatchedTransactions.length, matched: matchedCount };
}
