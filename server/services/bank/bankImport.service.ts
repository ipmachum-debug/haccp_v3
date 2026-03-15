/**
 * 은행 거래 일괄 업로드 서비스
 */

import { getDb } from "../../db";
import { bankTransactions } from "../../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { assertBankAccountOwned } from "./bankAccount.service";
import { findMatchingRule } from "./bankAutoMatch.service";

// 안전한 날짜 파싱 (Date 객체 반환)
function parseExcelDate(value: any): Date | null {
  if (!value) return null;

  if (typeof value === "number") {
    return new Date((value - 25569) * 86400 * 1000);
  }

  if (typeof value === "string") {
    const date = new Date(value);
    if (!isNaN(date.getTime())) return date;
  }

  if (value instanceof Date && !isNaN(value.getTime())) return value;

  return null;
}

// 안전한 금액 파싱
function parseAmount(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[,₩$]/g, "").trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

export interface BulkUploadResult {
  success: number;
  failed: number;
  duplicate: number;
  autoMatched: number;
  errors: Array<{ row: number; error: string }>;
}

export async function bulkUploadFromExcel(
  tenantId: number,
  userId: number,
  bankAccountId: number,
  rows: any[]
): Promise<BulkUploadResult> {
  const db = await getDb();

  // 계좌 소유권 검증
  await assertBankAccountOwned(tenantId, bankAccountId);

  const results: BulkUploadResult = {
    success: 0,
    failed: 0,
    duplicate: 0,
    autoMatched: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as any;
    const rowNumber = i + 2;

    try {
      const transactionDate = parseExcelDate(
        row["거래일시"] || row["거래일"] || row["거래일자"] || row["일자"]
      );

      const depositAmt = parseAmount(row["입금"] || row["입금액"]);
      const withdrawalAmt = parseAmount(row["출금"] || row["출금액"]);
      let transactionType: "deposit" | "withdrawal";
      let amount: number | null;

      if (depositAmt && depositAmt > 0) {
        transactionType = "deposit";
        amount = depositAmt;
      } else if (withdrawalAmt && withdrawalAmt > 0) {
        transactionType = "withdrawal";
        amount = withdrawalAmt;
      } else {
        const rawType = row["거래구분"] || row["구분"] || "";
        transactionType = rawType === "입금" || rawType === "deposit" ? "deposit" : "withdrawal";
        amount = parseAmount(row["금액"] || row["거래금액"]);
      }

      const balance = parseAmount(row["거래후잔액"] || row["잔액"] || row["거래 후 잔액"]);
      const description = row["적요"] || row["내용"] || row["거래처"] || "";
      const counterparty = row["의뢰인/수취인"] || row["의뢰인"] || row["수취인"] || row["거래처"] || "";
      const memo = row["메모"] || row["비고"] || "";

      const fullDescription = counterparty
        ? (description ? `${description} (${counterparty})` : counterparty)
        : description;

      if (!transactionDate) throw new Error("거래일시가 유효하지 않습니다");
      if (!amount || amount <= 0) throw new Error("입금 또는 출금 금액이 유효하지 않습니다");

      // 중복 체크
      const existing = await db
        .select()
        .from(bankTransactions)
        .where(
          and(
            eq(bankTransactions.tenantId, tenantId),
            eq(bankTransactions.bankAccountId, bankAccountId),
            eq(bankTransactions.transactionDate, transactionDate),
            eq(bankTransactions.amount, amount as any)
          )
        )
        .limit(1);

      if (existing && existing.length > 0) {
        results.duplicate++;
        continue;
      }

      // 자동 매칭 시도
      const matchResult = await findMatchingRule(db, tenantId, fullDescription, amount, transactionType);
      const isLargeAmount = amount >= 5000000;
      const isMatched = !!matchResult.accountingAccountId;

      await db.insert(bankTransactions).values({
        tenantId,
        bankAccountId,
        transactionDate,
        transactionType,
        amount,
        balance,
        description: fullDescription,
        memo: matchResult.memo || memo,
        matchingStatus: isMatched ? "matched" : "unmatched",
        accountingAccountId: matchResult.accountingAccountId,
        approvalStatus: "pending",
        isLargeAmount: isLargeAmount ? "Y" : "N",
        matchedBy: isMatched ? userId : null,
        matchedAt: isMatched ? new Date() : null,
      } as any);

      results.success++;
      if (isMatched) results.autoMatched++;
    } catch (error: any) {
      results.failed++;
      results.errors.push({ row: rowNumber, error: error.message || "알 수 없는 오류" });
    }
  }

  return results;
}
