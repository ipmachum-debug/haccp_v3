/**
 * 거래 서비스 - 비즈니스 로직 분리
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
import { bankTransactions, matchingRules, arLedger } from "../../../drizzle/schema";
import { eq, and, gte, lte, like, or, sql, desc, inArray, asc } from "drizzle-orm";
import { omitUndefined } from "@shared/utils";
import { assertBankAccountOwned } from "./bankAccount.service";
import { postBankTransactionJournal, cancelBankTransactionJournal, resolveSystemAccount } from "../../db/accounting/journalHelper";
import { SYSTEM_ACCOUNTS } from "../../../drizzle/schema/accountingAccounts";

/**
 * ★ 2026-04-14: 거래 description 에서 자동 매칭용 키워드 추출
 *
 * 예시:
 *   "조은영 (조은영)"      → "조은영"
 *   "(주)단지 1,500,000"   → "(주)단지"
 *   "카드매출 ABC123"      → "카드매출"
 *   "PAYROLL-APR"          → "PAYROLL-APR"
 *
 * 전략: 괄호/숫자/특수문자 앞까지의 첫 "의미있는 단어" 를 추출
 */
export function extractMatchingKeyword(description: string): string | null {
  if (!description) return null;
  const trimmed = description.trim();

  // 1) 동일한 이름이 괄호 안에도 있는 경우: "조은영 (조은영)" → "조은영"
  const mirrorMatch = trimmed.match(/^(.+?)\s*\(\1\)/);
  if (mirrorMatch) return mirrorMatch[1].trim();

  // 2) 괄호 앞까지의 첫 단어: "카드사 (12345)" → "카드사"
  const beforeParen = trimmed.split(/[(（]/)[0].trim();
  if (beforeParen && beforeParen.length >= 2) {
    // 숫자만 있는 경우는 제외
    if (!/^[\d\s,.\-]+$/.test(beforeParen)) {
      return beforeParen;
    }
  }

  // 3) 공백/숫자로 자르고 첫 토큰
  const firstToken = trimmed.split(/[\s\d]+/)[0];
  if (firstToken && firstToken.length >= 2) return firstToken;

  return null;
}

/**
 * ★ 2026-04-14: 매칭 규칙 자동 학습
 *   - 수동 매칭 시 같은 패턴의 규칙이 없으면 keyword 기반 규칙 자동 생성
 *   - 중복 방지: 같은 (tenant, keyword, accountingAccountId) 있으면 skip
 */
export async function learnMatchingRule(
  tenantId: number,
  description: string,
  accountingAccountId: number,
  userId: number,
  transactionType?: "deposit" | "withdrawal",
): Promise<{ created: boolean; ruleId?: number; keyword?: string }> {
  const keyword = extractMatchingKeyword(description);
  if (!keyword) return { created: false };

  const db = await getDb();

  // 중복 체크: 같은 tenant + keyword 로 이미 active 규칙이 있는지
  const existing = await db
    .select({ id: matchingRules.id, conditions: matchingRules.conditions, actions: matchingRules.actions })
    .from(matchingRules)
    .where(and(eq(matchingRules.tenantId, tenantId), eq(matchingRules.isActive, 1)));

  for (const r of existing) {
    try {
      const cond = typeof r.conditions === "string" ? JSON.parse(r.conditions) : r.conditions;
      const actions = typeof r.actions === "string" ? JSON.parse(r.actions) : r.actions;
      if (
        cond?.keyword?.toLowerCase() === keyword.toLowerCase() &&
        (actions?.accountingAccountId === accountingAccountId || actions?.targetAccountId === accountingAccountId)
      ) {
        return { created: false, ruleId: r.id, keyword };
      }
    } catch (_) { /* ignore malformed */ }
  }

  // 신규 규칙 생성
  const ruleName = `${keyword} → 계정 #${accountingAccountId} (자동학습)`;
  const conditions = JSON.stringify({
    name: ruleName,
    keyword,
    transactionType: transactionType ?? undefined,
    learnedFrom: "manual-match",
  });
  const actions = JSON.stringify({
    accountingAccountId,
  });

  const [result] = await db.insert(matchingRules).values({
    tenantId,
    userId,
    ruleType: "keyword",
    priority: 100,
    weight: "1.00",
    conditions,
    actions,
    isActive: 1,
  } as any);

  return { created: true, ruleId: (result as any).insertId, keyword };
}

export async function listTransactions(tenantId: number, filters?: {
  bankAccountId?: number;
  matchingStatus?: "unmatched" | "partial" | "matched";
  approvalStatus?: "pending" | "approved" | "rejected";
  transactionType?: "deposit" | "withdrawal";
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const db = await getDb();
  const page = filters?.page || 1;
  const limit = filters?.limit || 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(bankTransactions.tenantId, tenantId)];

  if (filters?.bankAccountId) {
    conditions.push(eq(bankTransactions.bankAccountId, filters.bankAccountId));
  }
  if (filters?.matchingStatus) {
    conditions.push(eq(bankTransactions.matchingStatus, filters.matchingStatus));
  }
  if (filters?.approvalStatus) {
    conditions.push(eq(bankTransactions.approvalStatus, filters.approvalStatus));
  }
  if (filters?.transactionType) {
    conditions.push(eq(bankTransactions.transactionType, filters.transactionType));
  }
  if (filters?.startDate) {
    conditions.push(gte(bankTransactions.transactionDate, new Date(filters.startDate)));
  }
  if (filters?.endDate) {
    conditions.push(lte(bankTransactions.transactionDate, new Date(filters.endDate)));
  }
  if (filters?.search) {
    conditions.push(
      or(
        like(bankTransactions.description, `%${filters.search}%`),
        like(bankTransactions.memo, `%${filters.search}%`)
      )!
    );
  }

  const whereClause = and(...conditions);

  const [items, countResult] = await Promise.all([
    db.select().from(bankTransactions).where(whereClause)
      .orderBy(desc(bankTransactions.transactionDate))
      .limit(limit).offset(offset),
    db.select({ cnt: sql<number>`count(*)` }).from(bankTransactions).where(whereClause),
  ]);

  return {
    items,
    total: Number(countResult[0]?.cnt || 0),
    page,
    limit,
  };
}

export async function getTransactionById(tenantId: number, transactionId: number) {
  const db = await getDb();
  const [transaction] = await db
    .select()
    .from(bankTransactions)
    .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, tenantId)))
    .limit(1);

  if (!transaction) {
    throw new TRPCError({ code: "NOT_FOUND", message: "거래 내역을 찾을 수 없습니다." });
  }
  return transaction;
}

export async function createTransaction(tenantId: number, data: {
  bankAccountId: number;
  transactionDate: string;
  transactionType: "deposit" | "withdrawal";
  amount: number;
  balance?: number;
  description?: string;
  memo?: string;
}) {
  const db = await getDb();

  // 계좌 소유권 검증
  await assertBankAccountOwned(tenantId, data.bankAccountId);

  const isLargeAmount = data.amount >= 5000000;

  const result = await db.insert(bankTransactions).values({
    tenantId,
    bankAccountId: data.bankAccountId,
    transactionDate: data.transactionDate,
    transactionType: data.transactionType,
    amount: data.amount,
    balance: data.balance,
    description: data.description,
    memo: data.memo,
    matchingStatus: "unmatched",
    approvalStatus: "pending",
    isLargeAmount: isLargeAmount ? "Y" : "N",
  } as any);

  return Number((result as any).insertId);
}

export async function updateTransaction(tenantId: number, transactionId: number, data: {
  transactionDate?: string;
  amount?: number;
  balance?: number;
  description?: string;
  memo?: string;
}) {
  const db = await getDb();
  const updateData: any = omitUndefined(data);

  // 금액 변경 시 고액 거래 플래그 재설정
  if (updateData.amount) {
    updateData.isLargeAmount = updateData.amount >= 5000000 ? "Y" : "N";
  }

  await db
    .update(bankTransactions)
    .set(updateData)
    .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, tenantId)));
}

export async function deleteTransaction(tenantId: number, transactionId: number) {
  const db = await getDb();
  await db
    .delete(bankTransactions)
    .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, tenantId)));
}

export async function matchTransaction(
  tenantId: number,
  transactionId: number,
  accountingAccountId: number,
  userId: number,
  options?: { learnRule?: boolean },
) {
  const db = await getDb();

  // 먼저 거래 정보 조회 (분개용)
  const transaction = await getTransactionById(tenantId, transactionId);

  await db
    .update(bankTransactions)
    .set({
      matchingStatus: "matched",
      accountingAccountId,
      matchedBy: userId,
      matchedAt: new Date(),
    })
    .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, tenantId)));

  // 자동 분개 생성
  try {
    await postBankTransactionJournal({
      tenantId,
      transactionId,
      accountingAccountId,
      amount: Math.abs(Number(transaction.amount)),
      transactionType: transaction.transactionType as "deposit" | "withdrawal",
      description: transaction.description || "은행 거래",
      transactionDate: transaction.transactionDate,
      bankAccountId: Number(transaction.bankAccountId),
      partnerId: transaction.matchedPartnerId ? Number(transaction.matchedPartnerId) : null,
      postedBy: userId,
    });
  } catch (e) {
    console.error("[matchTransaction] 자동분개 실패:", e);
    // 매칭은 성공, 분개 실패 시 무시 (매칭 상태는 유지)
  }

  // ★ 2026-04-14: 매칭 규칙 자동 학습 (사용자 선택, 기본 ON)
  //    수동 매칭 시 같은 패턴의 다른 미매칭 거래를 AI 자동 매칭에서 처리할 수 있도록
  //    keyword 기반 규칙을 자동으로 생성 (중복 방지)
  let learnedRule: { created: boolean; ruleId?: number; keyword?: string } = { created: false };
  if (options?.learnRule !== false) {
    try {
      learnedRule = await learnMatchingRule(
        tenantId,
        transaction.description || "",
        accountingAccountId,
        userId,
        transaction.transactionType as "deposit" | "withdrawal" | undefined,
      );
      if (learnedRule.created) {
        console.log(
          `[matchTransaction] 규칙 자동 학습: keyword="${learnedRule.keyword}" → 계정 #${accountingAccountId} (ruleId=${learnedRule.ruleId})`,
        );
      }
    } catch (learnErr) {
      console.error("[matchTransaction] 규칙 학습 실패 (매칭은 성공):", learnErr);
    }
  }

  return { learnedRule };
}

export async function unmatchTransaction(tenantId: number, transactionId: number) {
  const db = await getDb();

  // 분개 삭제 (매칭 해제 시)
  try {
    await cancelBankTransactionJournal(tenantId, transactionId);
  } catch (e) {
    console.error("[unmatchTransaction] 분개 삭제 실패:", e);
  }

  await db
    .update(bankTransactions)
    .set({
      matchingStatus: "unmatched",
      accountingAccountId: null,
      matchedBy: null,
      matchedAt: null,
    })
    .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, tenantId)));
}

export async function approveTransaction(tenantId: number, transactionId: number, confirmedAmount?: number) {
  const db = await getDb();
  const transaction = await getTransactionById(tenantId, transactionId);

  if (transaction.isLargeAmount === "Y" && !confirmedAmount) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "고액 거래는 금액 재확인이 필요합니다." });
  }

  if (confirmedAmount && Math.abs(Number(transaction.amount) - confirmedAmount) > 0.01) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "확인된 금액이 일치하지 않습니다." });
  }

  await db
    .update(bankTransactions)
    .set({ approvalStatus: "approved" })
    .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, tenantId)));
}

export async function rejectTransaction(tenantId: number, transactionId: number, reason?: string) {
  const db = await getDb();
  await db
    .update(bankTransactions)
    .set({
      approvalStatus: "rejected",
      rejectionReason: reason || null,
    })
    .where(and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, tenantId)));
}

export async function bulkDeleteTransactions(tenantId: number, ids: number[]) {
  const db = await getDb();
  await db
    .delete(bankTransactions)
    .where(and(inArray(bankTransactions.id, ids), eq(bankTransactions.tenantId, tenantId)));
  return ids.length;
}

export async function deleteAllByAccount(tenantId: number, bankAccountId: number) {
  const db = await getDb();

  // 계좌 소유권 검증
  await assertBankAccountOwned(tenantId, bankAccountId);

  const result: any = await db
    .delete(bankTransactions)
    .where(and(eq(bankTransactions.bankAccountId, bankAccountId), eq(bankTransactions.tenantId, tenantId)));

  return result?.[0]?.affectedRows ?? result?.rowCount ?? 0;
}

/**
 * ★ 2026-04-14: 입금 매칭 B-1 — AR 회수 (가장 중요)
 * ═══════════════════════════════════════════════════════════════
 * 특정 거래처의 미수 AR 목록 조회 (FIFO 잔액 계산)
 *
 * ar_ledger 는 entry 누적 방식 (debit/payment/writeoff).
 * 각 'debit' 엔트리를 독립 인보이스로 보고, 이후 payment/writeoff 를
 * FIFO 순으로 차감하여 "아직 미수인 debit 엔트리" 를 반환.
 *
 * 반환 구조:
 *   [{ id, occurredAt, originalAmount, paidAmount, remainingAmount, ... }]
 */
export async function listOpenArByPartner(
  tenantId: number,
  partnerId: number,
): Promise<Array<{
  id: number;
  occurredAt: Date;
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: any;
  memo: string;
  refType: string;
  refId: number;
}>> {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const rows = await db
    .select({
      id: arLedger.id,
      occurredAt: arLedger.occurredAt,
      arEntryType: arLedger.arEntryType,
      amount: arLedger.amount,
      dueDate: arLedger.dueDate,
      memo: arLedger.memo,
      refType: arLedger.refType,
      refId: arLedger.refId,
    })
    .from(arLedger)
    .where(and(
      eq(arLedger.tenantId, tenantId),
      eq(arLedger.customerPartnerId, partnerId),
    ))
    .orderBy(asc(arLedger.occurredAt), asc(arLedger.id));

  const debits = rows.filter((r) => r.arEntryType === "debit");
  const payments = rows.filter((r) => ["payment", "writeoff"].includes(r.arEntryType as any));

  // 전체 payment 풀을 debits 에 FIFO 로 소진
  let paymentPool = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

  const openArs: Array<any> = [];
  for (const d of debits) {
    const orig = Number(d.amount || 0);
    const paid = Math.min(orig, paymentPool);
    paymentPool -= paid;
    const remaining = orig - paid;
    if (remaining > 0.01) {
      openArs.push({
        id: d.id,
        occurredAt: d.occurredAt,
        originalAmount: orig,
        paidAmount: paid,
        remainingAmount: remaining,
        dueDate: d.dueDate,
        memo: d.memo || "",
        refType: d.refType || "",
        refId: d.refId || 0,
      });
    }
  }
  return openArs;
}

/**
 * ★ 2026-04-14: 입금 거래를 AR 회수로 매칭
 * ═══════════════════════════════════════════════════════════════
 * 워크플로우:
 *   1. 입금 거래 + 할당할 AR 목록 검증 (금액 합 = 입금 금액)
 *   2. 각 AR 에 대해 'payment' 엔트리 추가 (분할 가능)
 *   3. bank_transactions 상태 업데이트 + 분개 생성
 *      (차변 보통예금 / 대변 외상매출금)
 */
export async function matchTransactionAsArRecovery(
  tenantId: number,
  transactionId: number,
  partnerId: number,
  arAllocations: Array<{ arLedgerId: number; amount: number }>,
  userId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const tx = await getTransactionById(tenantId, transactionId);
  if (!tx) throw new Error("거래를 찾을 수 없습니다");
  if (tx.transactionType !== "deposit") {
    throw new Error("입금 거래만 AR 회수 매칭이 가능합니다.");
  }

  const txAmount = Number(tx.amount);
  const totalAllocated = arAllocations.reduce((s, a) => s + a.amount, 0);
  if (Math.abs(totalAllocated - txAmount) > 0.01) {
    throw new Error(
      `할당 금액 합계가 입금 금액과 다릅니다: 할당 ${totalAllocated}, 입금 ${txAmount}`,
    );
  }

  // 1. 각 AR 에 payment 엔트리 추가
  for (const alloc of arAllocations) {
    if (alloc.amount <= 0) continue;

    const [original]: any = await db
      .select()
      .from(arLedger)
      .where(
        and(eq(arLedger.id, alloc.arLedgerId), eq(arLedger.tenantId, tenantId)),
      )
      .limit(1);
    if (!original) throw new Error(`AR #${alloc.arLedgerId} 를 찾을 수 없습니다.`);
    if (Number(original.customerPartnerId) !== partnerId) {
      throw new Error(`AR #${alloc.arLedgerId} 의 거래처가 일치하지 않습니다.`);
    }

    await db.insert(arLedger).values({
      tenantId,
      customerPartnerId: partnerId,
      occurredAt: (tx.transactionDate as any) ?? new Date(),
      arEntryType: "payment",
      amount: alloc.amount.toString(),
      refType: "bank_transaction",
      refId: transactionId,
      memo: `[입금회수] bank_tx#${transactionId} → AR#${alloc.arLedgerId}`,
      createdBy: userId,
    } as any);
  }

  // 2. 외상매출금 시스템 계정 조회
  const arAcc = await resolveSystemAccount(
    tenantId,
    SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
    "1030",
    "외상매출금",
  );
  if (arAcc.id === 0) {
    throw new Error("ACCOUNTS_RECEIVABLE 계정이 없습니다. 계정 시드 필요.");
  }

  // 3. 거래 업데이트
  await db
    .update(bankTransactions)
    .set({
      matchingStatus: "matched",
      accountingAccountId: arAcc.id,
      matchedPartnerId: partnerId,
      matchedLedgerType: "ar",
      matchedBy: userId,
      matchedAt: new Date(),
    } as any)
    .where(
      and(eq(bankTransactions.id, transactionId), eq(bankTransactions.tenantId, tenantId)),
    );

  // 4. 분개 생성 (차변 보통예금 / 대변 외상매출금)
  try {
    await postBankTransactionJournal({
      tenantId,
      transactionId,
      accountingAccountId: arAcc.id,
      amount: txAmount,
      transactionType: "deposit",
      description: tx.description || `입금회수 AR ${arAllocations.length}건`,
      transactionDate: tx.transactionDate,
      bankAccountId: Number(tx.bankAccountId),
      partnerId,
      postedBy: userId,
    });
  } catch (e) {
    console.error("[matchTransactionAsArRecovery] 자동분개 실패:", e);
  }

  return {
    matchedArCount: arAllocations.length,
    totalAmount: txAmount,
    message: `${arAllocations.length}개 미수금에 ${txAmount.toLocaleString()}원 분할 회수 완료`,
  };
}
