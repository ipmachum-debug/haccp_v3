import { router, protectedTenantProcedure } from "../trpc";
import { z } from "zod";
import { getDb } from "../db";
import { bankTransactions, matchingRules } from "../../drizzle/schema";
import { eq, and, or, like, between, sql, asc } from "drizzle-orm";
import * as XLSX from "xlsx";

// 안전한 날짜 파싱
function parseExcelDate(value: any): string | null {
  if (!value) return null;
  
  // Excel 일련번호 (숫자)
  if (typeof value === "number") {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  
  // 문자열 날짜
  if (typeof value === "string") {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
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

// 매칭 규칙 검색 - matching_rules 테이블 사용
async function findMatchingRule(
  db: any,
  tenantId: number,
  description: string,
  amount: number
): Promise<number | null> {
  try {
    const rules = await db
      .select()
      .from(matchingRules)
      .where(
        and(
          eq(matchingRules.tenantId, tenantId),
          eq(matchingRules.isActive, true)
        )
      )
      .orderBy(asc(matchingRules.priority));

    for (const rule of rules) {
      let matched = false;

      switch (rule.ruleType) {
        case "keyword":
          if (rule.keyword && description.includes(rule.keyword)) {
            matched = true;
          }
          break;

        case "amount":
          // amount 매칭은 conditions에서 처리
          if (rule.conditions) {
            const cond = rule.conditions as any;
            if (cond.amountMin !== undefined && cond.amountMax !== undefined) {
              if (amount >= cond.amountMin && amount <= cond.amountMax) {
                matched = true;
              }
            }
          }
          break;

        case "pattern":
          if (rule.keyword) {
            try {
              const regex = new RegExp(rule.keyword);
              if (regex.test(description)) {
                matched = true;
              }
            } catch (e) {
              // 잘못된 정규식은 무시
            }
          }
          break;
      }

      if (matched && rule.targetAccountId) {
        return rule.targetAccountId;
      }
    }
  } catch (e) {
    console.error("[findMatchingRule] Error:", e);
  }

  return null;
}

export const bankTransactionBulkRouter = router({
  // Excel 일괄 업로드
  bulkUploadFromExcel: protectedTenantProcedure
    .input(
      z.object({
        bankAccountId: z.number(),
        fileData: z.string(), // Base64 encoded Excel file
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const tenantId = (ctx as any).tenantId;
      const buffer = Buffer.from(input.fileData, "base64");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

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
          // 필수 필드 검증
          const transactionDate = parseExcelDate(row["거래일"] || row["거래일자"]);
          const transactionType = row["구분"] === "입금" ? "deposit" : "withdrawal";
          const amount = parseAmount(row["금액"] || row["거래금액"]);
          const balance = parseAmount(row["잔액"]);
          const description = row["적요"] || row["내용"] || "";
          const memo = row["메모"] || "";

          if (!transactionDate) {
            throw new Error("거래일이 유효하지 않습니다");
          }

          if (!amount || amount <= 0) {
            throw new Error("금액이 유효하지 않습니다");
          }

          // 중복 체크
          const existing = await db
            .select()
            .from(bankTransactions)
            .where(
              and(
                eq(bankTransactions.tenantId, tenantId),
                eq(bankTransactions.bankAccountId, input.bankAccountId),
                eq(bankTransactions.transactionDate, transactionDate),
                eq(bankTransactions.amount, amount)
              )
            )
            .limit(1);

          if (existing && existing.length > 0) {
            results.duplicate++;
            continue;
          }

          // 자동 매칭 시도
          const accountingAccountId = await findMatchingRule(
            db,
            tenantId,
            description,
            amount
          );

          const isLargeAmount = amount >= 5000000;

          // 거래 삽입
          await db.insert(bankTransactions).values({
            tenantId: tenantId,
            bankAccountId: input.bankAccountId,
            transactionDate,
            transactionType,
            amount,
            balance,
            description,
            memo,
            matchingStatus: accountingAccountId ? "matched" : "unmatched",
            accountingAccountId,
            approvalStatus: "pending",
            isLargeAmount: isLargeAmount ? "Y" : "N",
            matchedBy: ctx.user.id,
            matchedAt: accountingAccountId ? new Date().toISOString() : null,
          });

          results.success++;
          if (accountingAccountId) {
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
        const accountingAccountId = await findMatchingRule(
          db,
          tenantId,
          transaction.description || "",
          transaction.amount
        );

        if (accountingAccountId) {
          await db
            .update(bankTransactions)
            .set({
              matchingStatus: "matched",
              accountingAccountId,
              matchedBy: ctx.user.id,
              matchedAt: new Date().toISOString(),
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
