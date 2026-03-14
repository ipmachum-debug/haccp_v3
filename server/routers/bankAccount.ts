import { router, protectedTenantProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { bankAccounts } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

export const bankAccountRouter = router({
  // 계좌 목록 조회
  list: protectedTenantProcedure
    .input(
      z.object({
        isActive: z.enum(["Y", "N"]).optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const conditions = [eq(bankAccounts.tenantId, ctx.tenantId ?? undefined as any) ];
      
      if (input?.isActive) {
        conditions.push(eq(bankAccounts.isActive, input.isActive));
      }

      const accounts = await db
        .select()
        .from(bankAccounts)
        .where(and(...conditions))
        .orderBy(bankAccounts.createdAt);

      return { accounts };
    }),

  // 계좌 상세 조회
  getById: protectedTenantProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const account = await db
        .select()
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.id, input.id),
            eq(bankAccounts.tenantId, ctx.tenantId ?? undefined as any) 
          )
        )
        .limit(1);

      if (!account || account.length === 0) {
        throw new Error("계좌를 찾을 수 없습니다.");
      }

      return account[0];
    }),

  // 계좌 등록
  create: protectedTenantProcedure
    .input(
      z.object({
        bankName: z.string().min(1, "은행명을 입력해주세요"),
        accountNo: z.string().min(1, "계좌번호를 입력해주세요"),
        accountName: z.string().optional(),
        accountType: z.enum(["checking", "savings", "investment", "other"]).default("checking"),
        currency: z.string().default("KRW"),
        defaultAccountingAccountId: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const result = await db.insert(bankAccounts).values({
        tenantId: ctx.tenantId ?? undefined,
        bankName: input.bankName,
        accountNo: input.accountNo,
        accountName: input.accountName,
        accountType: input.accountType,
        currency: input.currency,
        defaultAccountingAccountId: input.defaultAccountingAccountId,
        isActive: "Y",
        notes: input.notes,
        createdBy: ctx.user.id,
      });

      return { id: Number((result as any).insertId), message: "계좌가 등록되었습니다." };
    }),

  // 계좌 수정
  update: protectedTenantProcedure
    .input(
      z.object({
        id: z.number(),
        bankName: z.string().min(1).optional(),
        accountNo: z.string().min(1).optional(),
        accountName: z.string().optional(),
        accountType: z.enum(["checking", "savings", "investment", "other"]).optional(),
        currency: z.string().optional(),
        defaultAccountingAccountId: z.number().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const { id, ...updateData } = input;

      await db
        .update(bankAccounts)
        .set(updateData)
        .where(
          and(
            eq(bankAccounts.id, id),
            eq(bankAccounts.tenantId, ctx.tenantId ?? undefined as any) 
          )
        );

      return { message: "계좌 정보가 수정되었습니다." };
    }),

  // 계좌 비활성화 (soft delete)
  delete: protectedTenantProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      await db
        .update(bankAccounts)
        .set({ isActive: "N" })
        .where(
          and(
            eq(bankAccounts.id, input.id),
            eq(bankAccounts.tenantId, ctx.tenantId ?? undefined as any) 
          )
        );

      return { message: "계좌가 비활성화되었습니다." };
    }),

  // 계좌별 통계
  getStats: protectedTenantProcedure
    .input(z.object({ accountId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const stats = await db.execute(sql`
        SELECT 
          COUNT(*) as totalTransactions,
          COALESCE(SUM(CASE WHEN transaction_type = 'deposit' THEN amount ELSE 0 END), 0) as totalDeposit,
          COALESCE(SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END), 0) as totalWithdrawal,
          COALESCE(SUM(CASE WHEN match_status = 'unmatched' THEN 1 ELSE 0 END), 0) as unmatchedCount
        FROM bank_transactions
        WHERE bank_account_id = ${input.accountId}
          AND tenant_id = ${ctx.tenantId}
      `);

      // db.execute() returns [rows, fields] for mysql2
      // rows could be array of objects, or nested [[{...}], fields]
      const defaultStats = {
        totalTransactions: 0,
        totalDeposit: 0,
        totalWithdrawal: 0,
        unmatchedCount: 0,
      };

      try {
        let row: any = null;
        if (Array.isArray(stats)) {
          if (Array.isArray(stats[0])) {
            // [rows, fields] format → stats[0] is the rows array
            row = stats[0][0];
          } else if (stats[0] && typeof stats[0] === 'object' && 'totalTransactions' in stats[0]) {
            // Direct rows array format
            row = stats[0];
          }
        }
        if (!row) return defaultStats;
        return {
          totalTransactions: Number(row.totalTransactions || 0),
          totalDeposit: Number(row.totalDeposit || 0),
          totalWithdrawal: Number(row.totalWithdrawal || 0),
          unmatchedCount: Number(row.unmatchedCount || 0),
        };
      } catch (e) {
        console.error("[getStats] Error parsing stats:", e, "raw:", JSON.stringify(stats).slice(0, 500));
        return defaultStats;
      }
    }),
});
