import { router, protectedTenantProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { bankTransactions, matchingRules } from "../../drizzle/schema";
import { eq, and, or, like, between, sql, asc } from "drizzle-orm";
import * as XLSX from "xlsx";

// 안전한 날짜 파싱 (Date 객체 반환 - Drizzle timestamp 컬럼 호환)
function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  
  // Excel 일련번호 (숫자)
  if (typeof value === "number") {
    return new Date((value - 25569) * 86400 * 1000);
  }
  
  // 문자열 날짜
  if (typeof value === "string") {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Date 객체
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value;
  }
  
  return null;
}

// 안전한 금액 파싱
function parseAmount(value: any): number | null {
  if (value === null || value === undefined) return null;
  
  if (typeof value === "number") return value;
  
  if (typeof value === "string") {
    // 쉼표, 통화 기호 제거
    const cleaned = value.replace(/[,₩$]/g, "").trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? null : parsed;
  }
  
  return null;
}

/**
 * 매칭 규칙 검색 - matching_rules 테이블 사용
 * 
 * matching_rules 스키마:
 *   conditions: text (JSON) - 매칭 조건 (예: {"keyword":"급여", "amountMin":1000000, "amountMax":5000000})
 *   actions: text (JSON) - 매칭 액션 (예: {"accountingAccountId":123, "partnerId":456})
 */
function parseJsonSafe(text: string | null | undefined): any {
  if (!text) return null;
  try {
    return typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    return null;
  }
}

interface MatchResult {
  accountingAccountId: number | null;
  ruleId: number | null;
  ruleName: string | null;
  partnerId: number | null;
  memo: string | null;
}

async function findMatchingRule(
  db: any,
  tenantId: number,
  description: string,
  amount: number,
  transactionType?: "deposit" | "withdrawal"
): Promise<MatchResult> {
  const noMatch: MatchResult = { accountingAccountId: null, ruleId: null, ruleName: null, partnerId: null, memo: null };
  try {
    const rules = await db
      .select()
      .from(matchingRules)
      .where(
        and(
          eq(matchingRules.tenantId, tenantId),
          eq(matchingRules.isActive, 1)
        )
      )
      .orderBy(asc(matchingRules.priority));

    for (const rule of rules) {
      let matched = false;
      const cond = parseJsonSafe(rule.conditions);
      const actions = parseJsonSafe(rule.actions);
      if (!cond) continue;

      // 거래 유형 필터 (조건에 transactionType이 지정된 경우)
      if (cond.transactionType && transactionType && cond.transactionType !== transactionType) {
        continue;
      }

      switch (rule.ruleType) {
        case "keyword":
          if (cond.keyword && description.toLowerCase().includes(cond.keyword.toLowerCase())) {
            matched = true;
          }
          break;

        case "amount":
          if (cond.amountMin !== undefined && cond.amountMax !== undefined) {
            if (amount >= cond.amountMin && amount <= cond.amountMax) {
              matched = true;
            }
          }
          break;

        case "pattern":
          if (cond.pattern || cond.keyword) {
            try {
              const regex = new RegExp(cond.pattern || cond.keyword, "i");
              if (regex.test(description)) {
                matched = true;
              }
            } catch (e) {
              // 잘못된 정규식은 무시
            }
          }
          break;

        case "combined":
          // 키워드 + 금액 범위 복합 매칭
          let keywordOk = true;
          let amountOk = true;
          if (cond.keyword) {
            keywordOk = description.toLowerCase().includes(cond.keyword.toLowerCase());
          }
          if (cond.amountMin !== undefined && cond.amountMax !== undefined) {
            amountOk = amount >= cond.amountMin && amount <= cond.amountMax;
          }
          matched = keywordOk && amountOk;
          break;
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

  return noMatch;
}

export const bankTransactionBulkRouter = router({
  // Excel 일괄 업로드 (프론트엔드에서 파싱된 JSON 배열 수신)
  bulkUploadFromExcel: protectedTenantProcedure
    .input(
      z.object({
        bankAccountId: z.number(),
        transactions: z.array(z.any()), // 프론트엔드에서 파싱된 엑셀 행 배열
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = (ctx as any).tenantId;
      const data = input.transactions;

      const results = {
        success: 0,
        failed: 0,
        duplicate: 0,
        autoMatched: 0,
        errors: [] as Array<{ row: number; error: string }>,
      };

      for (let i = 0; i < data.length; i++) {
        const row = data[i] as any;
        const rowNumber = i + 2; // Excel row number (header is row 1)

        try {
          // 거래일시 파싱 (다양한 헤더명 지원)
          const transactionDate = parseExcelDate(
            row["거래일시"] || row["거래일"] || row["거래일자"] || row["일자"]
          );

          // 입금/출금 분리 컬럼 우선, 구분+금액 방식도 지원
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
            // fallback: 구분 + 금액 단일 컬럼 방식
            const rawType = row["거래구분"] || row["구분"] || "";
            transactionType = rawType === "입금" || rawType === "deposit" ? "deposit" : "withdrawal";
            amount = parseAmount(row["금액"] || row["거래금액"]);
          }

          const balance = parseAmount(row["거래후잔액"] || row["잔액"] || row["거래 후 잔액"]);
          const description = row["적요"] || row["내용"] || row["거래처"] || "";
          const counterparty = row["의뢰인/수취인"] || row["의뢰인"] || row["수취인"] || row["거래처"] || "";
          const memo = row["메모"] || row["비고"] || "";

          // 적요에 의뢰인/수취인 정보 합치기 (둘 다 있으면)
          const fullDescription = counterparty
            ? (description ? `${description} (${counterparty})` : counterparty)
            : description;

          if (!transactionDate) {
            throw new Error("거래일시가 유효하지 않습니다");
          }

          if (!amount || amount <= 0) {
            throw new Error("입금 또는 출금 금액이 유효하지 않습니다");
          }

          // 중복 체크 (같은 계좌, 같은 날짜, 같은 금액)
          const existing = await db
            .select()
            .from(bankTransactions)
            .where(
              and(
                eq(bankTransactions.tenantId, tenantId),
                eq(bankTransactions.bankAccountId, input.bankAccountId),
                eq(bankTransactions.transactionDate, transactionDate),
                eq(bankTransactions.amount, amount) as any
              )
            )
            .limit(1);

          if (existing && existing.length > 0) {
            results.duplicate++;
            continue;
          }

          // 자동 매칭 시도
          const matchResult = await findMatchingRule(
            db,
            tenantId,
            fullDescription,
            amount,
            transactionType
          );

          const isLargeAmount = amount >= 5000000;
          const isMatched = !!matchResult.accountingAccountId;

          // 거래 삽입
          await db.insert(bankTransactions).values({
            tenantId: tenantId,
            bankAccountId: input.bankAccountId,
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
            matchedBy: isMatched ? ctx.user.id : null,
            matchedAt: isMatched ? new Date() : null,
          } as any);

          results.success++;
          if (isMatched) {
            results.autoMatched++;
          }
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            row: rowNumber,
            error: error.message || "알 수 없는 오류",
          });
        }
      }

      return {
        ...results,
        message: `업로드 완료: 성공 ${results.success}건, 실패 ${results.failed}건, 중복 ${results.duplicate}건, 자동매칭 ${results.autoMatched}건`,
      };
    }),

  // 자동 매칭 실행
  runAutoMatch: protectedTenantProcedure
    .input(
      z.object({
        bankAccountId: z.number().optional(),
      }).optional()
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = (ctx as any).tenantId;
      const conditions = [
        eq(bankTransactions.tenantId, tenantId),
        eq(bankTransactions.matchingStatus, "unmatched"),
      ];

      if (input?.bankAccountId) {
        conditions.push(eq(bankTransactions.bankAccountId, input.bankAccountId));
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
              matchedBy: ctx.user.id,
              matchedAt: new Date(),
            })
            .where(eq(bankTransactions.id, transaction.id));

          matchedCount++;
        }
      }

      return {
        total: unmatchedTransactions.length,
        matched: matchedCount,
        message: `${unmatchedTransactions.length}건 중 ${matchedCount}건이 자동 매칭되었습니다.`,
      };
    }),
});
