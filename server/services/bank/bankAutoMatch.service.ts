/**
 * 자동 매칭 서비스 - 매칭 규칙 엔진
 */

import { getDb } from "../../db";
import { bankTransactions, matchingRules } from "../../../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";
import { assertBankAccountOwned } from "./bankAccount.service";
import { postBankTransactionJournal } from "../../db/accounting/journalHelper";

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
 * 미매칭 거래 자동 매칭 — Preview (dryRun) 또는 실제 실행
 *
 * ★ 2026-04-14: dryRun 모드 추가
 *   - dryRun=true 면 DB 업데이트 없이 매칭 후보 리스트만 반환
 *   - 클라이언트가 Preview Dialog 로 보여주고 사용자 확인 후 실제 실행
 *
 * @param options.dryRun - true 면 미리보기만 (기본 false)
 * @param options.onlyTxIds - 특정 거래 ID 만 대상 (체크박스 선택 적용 시)
 */
export async function runAutoMatch(
  tenantId: number,
  userId: number,
  bankAccountId?: number,
  options?: { dryRun?: boolean; onlyTxIds?: number[] },
) {
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

  // onlyTxIds 필터 (실제 실행 시 사용자가 선택한 것만)
  const filteredTxs = options?.onlyTxIds && options.onlyTxIds.length > 0
    ? unmatchedTransactions.filter((t: any) => options.onlyTxIds!.includes(Number(t.id)))
    : unmatchedTransactions;

  const previewItems: Array<{
    transactionId: number;
    transactionDate: any;
    description: string;
    amount: number;
    transactionType: string;
    accountingAccountId: number;
    ruleName: string;
    partnerId: number | null;
  }> = [];

  let matchedCount = 0;

  for (const transaction of filteredTxs) {
    const matchResult = await findMatchingRule(
      db,
      tenantId,
      transaction.description || "",
      Number(transaction.amount),
      transaction.transactionType as "deposit" | "withdrawal" | undefined
    );

    if (matchResult.accountingAccountId) {
      // Preview 수집 (dryRun 이든 아니든 결과에 포함)
      previewItems.push({
        transactionId: Number(transaction.id),
        transactionDate: transaction.transactionDate,
        description: transaction.description || "",
        amount: Number(transaction.amount),
        transactionType: String(transaction.transactionType),
        accountingAccountId: matchResult.accountingAccountId,
        ruleName: matchResult.ruleName || "",
        partnerId: matchResult.partnerId,
      });

      // dryRun 이면 DB 쓰지 않음
      if (options?.dryRun) continue;

      await db
        .update(bankTransactions)
        .set({
          matchingStatus: "matched",
          accountingAccountId: matchResult.accountingAccountId,
          matchedBy: userId,
          matchedAt: new Date(),
        })
        .where(and(eq(bankTransactions.id, transaction.id), eq(bankTransactions.tenantId, tenantId)));

      // 자동 분개 생성
      try {
        await postBankTransactionJournal({
          tenantId,
          transactionId: Number(transaction.id),
          accountingAccountId: matchResult.accountingAccountId,
          amount: Math.abs(Number(transaction.amount)),
          transactionType: transaction.transactionType as "deposit" | "withdrawal",
          description: transaction.description || "은행 거래",
          transactionDate: transaction.transactionDate as any,
          bankAccountId: Number(transaction.bankAccountId),
          partnerId: matchResult.partnerId,
          postedBy: userId,
        });
      } catch (e) {
        console.error("[runAutoMatch] 자동분개 실패:", e);
      }

      matchedCount++;
    }
  }

  return {
    total: filteredTxs.length,
    matched: matchedCount,
    dryRun: !!options?.dryRun,
    preview: previewItems,
  };
}
