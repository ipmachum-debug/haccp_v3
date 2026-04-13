/**
 * 거래 서비스 - 비즈니스 로직 분리
 */

import { TRPCError } from "@trpc/server";
import { getDb } from "../../db";
import { bankTransactions } from "../../../drizzle/schema";
import { eq, and, gte, lte, like, or, sql, desc, inArray } from "drizzle-orm";
import { omitUndefined } from "@shared/utils";
import { assertBankAccountOwned } from "./bankAccount.service";
import { postBankTransactionJournal, cancelBankTransactionJournal } from "../../db/accounting/journalHelper";

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

export async function matchTransaction(tenantId: number, transactionId: number, accountingAccountId: number, userId: number) {
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
