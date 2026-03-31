/**
 * [LEGACY] 구식 회계 모듈 (accounting_categories + accounting_transactions)
 * 
 * 이 파일은 예전 단순 income/expense 기반 거래 관리 시스템입니다.
 * 새로운 복식부기 시스템은 아래 파일을 사용하세요:
 * - 계정과목: drizzle/schema/accountingAccounts.ts (system_code 기반)
 * - 분개 헬퍼: server/db/journalHelper.ts
 * - 재무보고서: server/db/financialReports.ts
 * 
 * @deprecated 신규 코드에서는 사용하지 마세요. P4에서 마이그레이션 후 제거 예정.
 */
import { eq, and, gte, lte, desc, sql, sum } from "drizzle-orm";
import { getDb } from "./db";
import { toKSTDate } from "./utils/timezone";

import { 
  accountingCategories, 
  accountingTransactions, 
  accountingDailyClose,
  InsertAccountingCategory,
  InsertAccountingTransaction,
  InsertAccountingDailyClose
} from "../drizzle/schema";

// ============================================================================
// [LEGACY] 계정 과목 관리 (accounting_categories)
// ============================================================================

export async function getAllCategories() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  return await db
    .select()
    .from(accountingCategories)
    .where(eq(accountingCategories.isActive, 1))
    .orderBy(accountingCategories.code);
}

export async function getCategoryById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const result = await db
    .select()
    .from(accountingCategories)
    .where(eq(accountingCategories.id, id))
    .limit(1);
  
  return result[0];
}

// ============================================================================
// 거래 내역 관리
// ============================================================================

export async function createTransaction(data: InsertAccountingTransaction) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const result = await db.insert(accountingTransactions).values(data);
  return result[0].insertId;
}

export async function getTransactions(filters: {
  startDate?: string;
  endDate?: string;
  type?: "income" | "expense";
  categoryId?: number;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  let query = db
    .select({
      id: accountingTransactions.id,
      transactionDate: accountingTransactions.transactionDate,
      type: accountingTransactions.type,
      amount: accountingTransactions.amount,
      description: accountingTransactions.description,
      categoryId: accountingTransactions.categoryId,
      categoryName: accountingCategories.name,
      categoryCode: accountingCategories.code,
      createdBy: accountingTransactions.createdBy,
      createdAt: accountingTransactions.createdAt
    })
    .from(accountingTransactions)
    .leftJoin(
      accountingCategories,
      eq(accountingTransactions.categoryId, accountingCategories.id)
    )
    .$dynamic();
  
  const conditions = [];
  
  if (filters.startDate) {
    conditions.push(gte(accountingTransactions.transactionDate, filters.startDate));
  }
  
  if (filters.endDate) {
    conditions.push(lte(accountingTransactions.transactionDate, filters.endDate));
  }
  
  if (filters.type) {
    conditions.push(eq(accountingTransactions.type, filters.type));
  }
  
  if (filters.categoryId) {
    conditions.push(eq(accountingTransactions.categoryId, filters.categoryId));
  }
  
  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }
  
  query = query.orderBy(desc(accountingTransactions.transactionDate), desc(accountingTransactions.id));
  
  if (filters.limit) {
    query = query.limit(filters.limit);
  }
  
  if (filters.offset) {
    query = query.offset(filters.offset);
  }
  
  return await query;
}

export async function getTransactionById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const result = await db
    .select()
    .from(accountingTransactions)
    .where(eq(accountingTransactions.id, id))
    .limit(1);
  
  return result[0];
}

export async function updateTransaction(id: number, data: Partial<InsertAccountingTransaction>) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  await db
    .update(accountingTransactions)
    .set(data)
    .where(eq(accountingTransactions.id, id));
}

export async function deleteTransaction(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  await db
    .delete(accountingTransactions)
    .where(eq(accountingTransactions.id, id));
}

// ============================================================================
// 통계 및 집계
// ============================================================================

export async function getDailySummary(date: string) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const result = await db
    .select()
    .from(accountingDailyClose)
    .where(eq(accountingDailyClose.closeDate, date))
    .limit(1);
  
  return result[0];
}

export async function getMonthlySummary(year: number, month: number, tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = toKSTDate(new Date(year, month, 0)); // 해당 월의 마지막 날
  
  const result = await db
    .select({
      totalIncome: sum(accountingTransactions.amount).mapWith(Number),
      totalExpense: sum(accountingTransactions.amount).mapWith(Number),
      transactionCount: sql<number>`COUNT(*)`.mapWith(Number)
    })
    .from(accountingTransactions)
    .where(
      and(
        gte(accountingTransactions.transactionDate, startDate),
        lte(accountingTransactions.transactionDate, endDate)
      )
    )
    .groupBy(accountingTransactions.type);
  
  let totalIncome = 0;
  let totalExpense = 0;
  let transactionCount = 0;
  
  for (const row of result) {
    transactionCount += row.transactionCount;
    if (row.totalIncome) {
      totalIncome = row.totalIncome;
    }
    if (row.totalExpense) {
      totalExpense = row.totalExpense;
    }
  }
  
  return {
    year,
    month,
    totalIncome,
    totalExpense,
    netCashFlow: totalIncome - totalExpense,
    transactionCount
  };
}

export async function getCategoryBreakdown(startDate: string, endDate: string, type: "income" | "expense") {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const result = await db
    .select({
      categoryId: accountingTransactions.categoryId,
      categoryName: accountingCategories.name,
      categoryCode: accountingCategories.code,
      totalAmount: sum(accountingTransactions.amount).mapWith(Number),
      transactionCount: sql<number>`COUNT(*)`.mapWith(Number)
    })
    .from(accountingTransactions)
    .leftJoin(
      accountingCategories,
      eq(accountingTransactions.categoryId, accountingCategories.id)
    )
    .where(
      and(
        eq(accountingTransactions.type, type),
        gte(accountingTransactions.transactionDate, startDate),
        lte(accountingTransactions.transactionDate, endDate)
      )
    )
    .groupBy(accountingTransactions.categoryId, accountingCategories.name, accountingCategories.code);
  
  return result;
}

export async function getFinancialOverview(startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  const result = await db
    .select({
      type: accountingTransactions.type,
      totalAmount: sum(accountingTransactions.amount).mapWith(Number),
      transactionCount: sql<number>`COUNT(*)`.mapWith(Number)
    })
    .from(accountingTransactions)
    .where(
      and(
        gte(accountingTransactions.transactionDate, startDate),
        lte(accountingTransactions.transactionDate, endDate)
      )
    )
    .groupBy(accountingTransactions.type);
  
  let totalIncome = 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  
  for (const row of result) {
    if (row.type === "income") {
      totalIncome = row.totalAmount || 0;
      incomeCount = row.transactionCount;
    } else if (row.type === "expense") {
      totalExpense = row.totalAmount || 0;
      expenseCount = row.transactionCount;
    }
  }
  
  return {
    totalIncome,
    totalExpense,
    netCashFlow: totalIncome - totalExpense,
    incomeCount,
    expenseCount,
    totalCount: incomeCount + expenseCount
  };
}

// ============================================================================
// 기본 계정 과목 초기화 (시스템 설치 시 1회 실행)
// ============================================================================

export async function initializeDefaultCategories() {
  const db = await getDb();
  if (!db) throw new Error("DB 연결 실패");
  
  // 이미 계정 과목이 있는지 확인
  const existing = await db.select().from(accountingCategories).limit(1);
  if (existing.length > 0) {
    return; // 이미 초기화됨
  }
  
  const defaultCategories: InsertAccountingCategory[] = [
    // 수입 계정
    { name: "제품 판매", code: "401", type: "income", description: "제품 판매 수입" },
    { name: "서비스 수입", code: "402", type: "income", description: "서비스 제공 수입" },
    { name: "기타 수입", code: "409", type: "income", description: "기타 영업외 수입" },
    
    // 지출 계정 - 매입비
    { name: "원재료 구매", code: "501", type: "expense", description: "원재료 및 부재료 구매" },
    { name: "상품 매입", code: "502", type: "expense", description: "완제품 매입" },
    
    // 지출 계정 - 인건비
    { name: "급여", code: "511", type: "expense", description: "직원 급여" },
    { name: "상여금", code: "512", type: "expense", description: "성과급 및 상여금" },
    { name: "퇴직금", code: "513", type: "expense", description: "퇴직금 및 퇴직적립금" },
    { name: "4대보험", code: "514", type: "expense", description: "국민연금, 건강보험, 고용보험, 산재보험" },
    
    // 지출 계정 - 운영비
    { name: "임차료", code: "521", type: "expense", description: "사무실/공장 임대료" },
    { name: "수도광열비", code: "522", type: "expense", description: "전기, 수도, 가스 요금" },
    { name: "통신비", code: "523", type: "expense", description: "전화, 인터넷 요금" },
    { name: "소모품비", code: "524", type: "expense", description: "사무용품 및 소모품" },
    { name: "수선비", code: "525", type: "expense", description: "시설 및 장비 수리비" },
    
    // 지출 계정 - 판매비
    { name: "광고선전비", code: "531", type: "expense", description: "광고 및 마케팅 비용" },
    { name: "판촉비", code: "532", type: "expense", description: "판매 촉진 비용" },
    { name: "배송비", code: "533", type: "expense", description: "제품 배송 비용" },
    
    // 지출 계정 - 관리비
    { name: "접대비", code: "541", type: "expense", description: "거래처 접대비" },
    { name: "여비교통비", code: "542", type: "expense", description: "출장비 및 교통비" },
    { name: "교육훈련비", code: "543", type: "expense", description: "직원 교육 및 훈련 비용" },
    { name: "복리후생비", code: "544", type: "expense", description: "직원 복리후생 비용" },
    
    // 지출 계정 - 금융·기타
    { name: "이자비용", code: "551", type: "expense", description: "대출 이자" },
    { name: "세금과공과", code: "552", type: "expense", description: "세금 및 공과금" },
    { name: "보험료", code: "553", type: "expense", description: "화재보험, 배상책임보험 등" },
    { name: "기타 비용", code: "559", type: "expense", description: "기타 영업외 비용" },
  ];
  
  await db.insert(accountingCategories).values(defaultCategories);
}
