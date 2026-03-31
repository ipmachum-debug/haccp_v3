import { getDb } from "./db";
import { 
  bankAccounts, 
  bankTransactions,
  matchingRules,
  partners,
  apLedger,
  arLedger
} from "../drizzle/schema_main";
import { eq, and, desc, sql, gte, lte, isNull } from "drizzle-orm";
import * as crypto from "crypto";

/**
 * 통장 거래 hash key 생성 (중복 방지)
 */
function generateHashKey(data: {
  bankAccountId: number;
  occurredAt: Date;
  amount: string;
  memo?: string | null;
}): string {
  const raw = `${data.bankAccountId}|${data.occurredAt.toISOString()}|${data.amount}|${data.memo || ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ========================================
// 은행 계좌 관리
// ========================================

export async function createBankAccount(data: {
  bankName: string;
  accountNumber: string;
  ownerName?: string;
  accountType: "checking" | "savings" | "corporate";
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  // 중복 체크
  const existing = await db
    .select()
    .from(bankAccounts)
    .where(
      and(
        eq(bankAccounts.bankName, data.bankName),
        eq(bankAccounts.accountNo, data.accountNumber as any)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    throw new Error("이미 등록된 계좌입니다");
  }

  const [result] = await db.insert(bankAccounts).values({
    bankName: data.bankName,
    accountNumber: data.accountNumber,
    ownerName: data.ownerName || null,
    accountType: data.accountType,
    isActive: 1,
    isPrimary: 0
  } as any);

  return { accountId: Number(result.insertId) };
}

export async function getAllBankAccounts() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  return await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.isActive, 1 as any) )
    .orderBy(desc(bankAccounts.isPrimary), desc(bankAccounts.createdAt));
}

export async function getBankAccountById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.id, id))
    .limit(1);

  if (!account) {
    throw new Error("계좌를 찾을 수 없습니다");
  }

  return account;
}

export async function updateBankAccount(
  id: number,
  data: {
    bankName?: string;
    accountNumber?: string;
    ownerName?: string;
    accountType?: "checking" | "savings" | "corporate";
    isActive?: boolean;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .update(bankAccounts)
    .set({
      ...(data.bankName && { bankName: data.bankName }),
      ...(data.accountNumber && { accountNo: data.accountNumber }),
      ...(data.ownerName !== undefined && { ownerName: data.ownerName }),
      ...(data.accountType && { accountType: data.accountType }),
      ...(data.isActive !== undefined && { isActive: data.isActive ? "Y" : "N" })
    } as any)
    .where(eq(bankAccounts.id, id));

  return { success: true };
}

export async function deleteBankAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // soft delete
  await db
    .update(bankAccounts)
    .set({ isActive: "N" } as any)
    .where(eq(bankAccounts.id, id));

  return { success: true };
}

/**
 * 대표 계좌 설정
 * 기존 대표 계좌를 해제하고 새로운 계좌를 대표로 설정
 */
export async function setPrimaryBankAccount(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 트랜잭션으로 처리
  // 1. 모든 계좌의 isPrimary를 0으로 설정
  await db.update(bankAccounts).set({ isPrimary: 0 });

  // 2. 선택한 계좌를 대표 계좌로 설정
  await db
    .update(bankAccounts)
    .set({ isPrimary: 1 })
    .where(eq(bankAccounts.id, id));

  return { success: true };
}

/**
 * 대표 계좌 조회
 */
export async function getPrimaryBankAccount() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.isPrimary, 1), eq(bankAccounts.isActive, 1 as any) ) as any)
    .limit(1);

  return account || null;
}

// ========================================
// 통장 거래 내역 관리
// ========================================

export async function uploadBankTransactions(data: {
  bankAccountId: number;
  transactions: Array<{
    occurredAt: Date;
    direction: "in" | "out";
    amount: string;
    counterpartyText?: string;
    memo?: string;
  }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  let inserted = 0;
  let skipped = 0;

  for (const tx of data.transactions) {
    const hashKey = generateHashKey({
      bankAccountId: data.bankAccountId,
      occurredAt: tx.occurredAt,
      amount: tx.amount,
      memo: tx.memo
    });

    // 중복 체크
    const [existing] = await db
      .select()
      .from(bankTransactions)
      .where(eq((bankTransactions as any).hashKey, hashKey))
      .limit(1);

    if (existing) {
      skipped++;
      continue;
    }

    await db.insert(bankTransactions).values({
      bankAccountId: data.bankAccountId,
      occurredAt: tx.occurredAt,
      bankDirection: tx.direction,
      amount: tx.amount,
      counterpartyText: tx.counterpartyText || null,
      memo: tx.memo || null,
      hashKey
    } as any);

    inserted++;
  }

  return { inserted, skipped };
}

export async function getBankTransactions(filters?: {
  bankAccountId?: number;
  startDate?: string;
  endDate?: string;
  direction?: "in" | "out";
  matchedOnly?: boolean;
  unmatchedOnly?: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  let query = db
    .select({
      id: bankTransactions.id,
      bankAccountId: bankTransactions.bankAccountId,
      occurredAt: (bankTransactions as any).occurredAt,
      direction: (bankTransactions as any).bankDirection,
      amount: bankTransactions.amount,
      counterpartyText: bankTransactions.counterpartyText,
      memo: bankTransactions.memo,
      matchedPartnerId: bankTransactions.matchedPartnerId,
      matchedLedgerType: bankTransactions.matchedLedgerType,
      matchedLedgerId: bankTransactions.matchedLedgerId,
      matchedAt: bankTransactions.matchedAt,
      partnerName: partners.companyName
    })
    .from(bankTransactions)
    .leftJoin(partners, eq(bankTransactions.matchedPartnerId, partners.id));

  const conditions = [];
  if (filters?.bankAccountId) {
    conditions.push(eq(bankTransactions.bankAccountId, filters.bankAccountId));
  }
  if (filters?.startDate) {
    conditions.push(gte((bankTransactions as any).occurredAt, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte((bankTransactions as any).occurredAt, filters.endDate));
  }
  if (filters?.direction) {
    conditions.push(eq((bankTransactions as any).bankDirection, filters.direction));
  }
  if (filters?.matchedOnly) {
    conditions.push(sql`${bankTransactions.matchedPartnerId} IS NOT NULL`);
  }
  if (filters?.unmatchedOnly) {
    conditions.push(isNull(bankTransactions.matchedPartnerId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc((bankTransactions as any).occurredAt));
}

export async function autoMatchBankTransactions(bankAccountId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  // 매칭되지 않은 거래 조회
  const unmatched = await db
    .select()
    .from(bankTransactions)
    .where(
      and(
        eq(bankTransactions.bankAccountId, bankAccountId),
        isNull(bankTransactions.matchedPartnerId)
      )
    );

  // 매칭 규칙 조회
  const rules = await db
    .select()
    .from(matchingRules)
    .where(eq(matchingRules.isActive, 1))
    .orderBy(desc(matchingRules.priority));

  let matched = 0;

  for (const tx of unmatched) {
    const searchText = `${tx.counterpartyText || ""} ${tx.memo || ""}`.toLowerCase();

    for (const rule of rules) {
      if (searchText.includes((rule as any).keyword.toLowerCase())) {
        // 매칭 성공
        await db
          .update(bankTransactions)
          .set({
            matchedPartnerId: (rule as any).partnerId,
            matchedAt: new Date()
          })
          .where(eq(bankTransactions.id, tx.id));

        matched++;
        break;
      }
    }
  }

  return { matched, total: unmatched.length };
}

export async function manualMatchBankTransaction(data: {
  transactionId: number;
  partnerId: number;
  ledgerType: "ap" | "ar";
  ledgerId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  await db
    .update(bankTransactions)
    .set({
      matchedPartnerId: data.partnerId,
      matchedLedgerType: data.ledgerType,
      matchedLedgerId: data.ledgerId,
      matchedAt: new Date()
    })
    .where(eq(bankTransactions.id, data.transactionId));

  return { success: true };
}

export async function getBankTransactionStats(bankAccountId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");

  const [stats] = await db
    .select({
      totalIn: sql<string>`SUM(CASE WHEN ${(bankTransactions as any).bankDirection} = 'in' THEN ${bankTransactions.amount} ELSE 0 END)`,
      totalOut: sql<string>`SUM(CASE WHEN ${(bankTransactions as any).bankDirection} = 'out' THEN ${bankTransactions.amount} ELSE 0 END)`,
      matchedCount: sql<number>`COUNT(CASE WHEN ${bankTransactions.matchedPartnerId} IS NOT NULL THEN 1 END)`,
      unmatchedCount: sql<number>`COUNT(CASE WHEN ${bankTransactions.matchedPartnerId} IS NULL THEN 1 END)`
    })
    .from(bankTransactions)
    .where(eq(bankTransactions.bankAccountId, bankAccountId));

  return stats;
}
