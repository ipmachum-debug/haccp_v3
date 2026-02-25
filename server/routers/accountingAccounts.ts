import { router, protectedProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { accountingAccounts } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ✅ P0 FIX: 테넌트 격리 헬퍼
function getEffectiveTenantId(ctx: any): number {
  const tenantId = ctx.tenantId;
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "테넌트 정보가 필요합니다. (actingTenantId 누락)" });
  }
  return tenantId;
}

export const accountingAccountsRouter = router({
  /**
   * 계정 과목 목록 조회
   */
  list: protectedProcedure
    .input(
      z.object({
        category: z.enum(["assets", "liabilities", "equity", "revenue", "expenses"]).optional(),
        isActive: z.enum(["Y", "N"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      // ✅ P0 FIX: tenantId 강제 필터
      const tenantId = getEffectiveTenantId(ctx);
      const conditions = [eq(accountingAccounts.tenantId, tenantId)];
      
      if (input.category) {
        conditions.push(eq(accountingAccounts.category, input.category));
      }
      
      if (input.isActive) {
        conditions.push(eq(accountingAccounts.isActive, input.isActive));
      }
      
      const db = await getDb();
      const accounts = await db
        .select()
        .from(accountingAccounts)
        .where(and(...conditions))
        .orderBy(accountingAccounts.code);
      
      return accounts;
    }),

  /**
   * 계정 과목 상세 조회
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      // ✅ P0 FIX: tenantId 소유권 검증
      const tenantId = getEffectiveTenantId(ctx);
      const [account] = await db
        .select()
        .from(accountingAccounts)
        .where(and(eq(accountingAccounts.id, input.id), eq(accountingAccounts.tenantId, tenantId)));
      
      return account || null;
    }),

  /**
   * 계정 과목 생성
   */
  create: protectedProcedure
    .input(
      z.object({
        category: z.enum(["assets", "liabilities", "equity", "revenue", "expenses"]),
        code: z.string().min(1).max(20),
        name: z.string().min(1).max(100),
        parentId: z.number().optional(),
        description: z.string().optional(),
        isActive: z.enum(["Y", "N"]).default("Y"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // ✅ P0 FIX: tenantId를 ctx에서 강제 주입
      const tenantId = getEffectiveTenantId(ctx);
      const [newAccount] = await db.insert(accountingAccounts).values({
        ...input,
        tenantId,
        createdBy: ctx.user.id,
      });
      
      return { id: Number(newAccount.insertId), success: true };
    }),

  /**
   * 계정 과목 수정
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        category: z.enum(["assets", "liabilities", "equity", "revenue", "expenses"]).optional(),
        code: z.string().min(1).max(20).optional(),
        name: z.string().min(1).max(100).optional(),
        parentId: z.number().optional(),
        description: z.string().optional(),
        isActive: z.enum(["Y", "N"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;
      
      const db = await getDb();
      // ✅ P0 FIX: tenantId 소유권 검증
      const tenantId = getEffectiveTenantId(ctx);
      await db
        .update(accountingAccounts)
        .set(updateData)
        .where(and(eq(accountingAccounts.id, id), eq(accountingAccounts.tenantId, tenantId)));
      
      return { success: true };
    }),

  /**
   * 계정 과목 삭제 (비활성화)
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // ✅ P0 FIX: tenantId 소유권 검증
      const tenantId = getEffectiveTenantId(ctx);
      await db
        .update(accountingAccounts)
        .set({ isActive: "N" })
        .where(and(eq(accountingAccounts.id, input.id), eq(accountingAccounts.tenantId, tenantId)));
      
      return { success: true };
    }),

  /**
   * 카테고리별 다음 코드 조회 (자동 생성)
   */
  getNextCode: protectedProcedure
    .input(
      z.object({
        category: z.enum(["assets", "liabilities", "equity", "revenue", "expenses"]),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const tenantId = getEffectiveTenantId(ctx);
      
      // 카테고리별 시작 코드 매핑
      const categoryPrefixes: Record<string, string> = {
        assets: "1",
        liabilities: "2",
        equity: "3",
        revenue: "4",
        expenses: "5",
      };
      
      const prefix = categoryPrefixes[input.category];
      
      // 해당 카테곣의 마지막 코드 조회
      // ✅ P0 FIX: tenantId 필터
      const [lastAccount] = await db
        .select()
        .from(accountingAccounts)
        .where(and(eq(accountingAccounts.category, input.category), eq(accountingAccounts.tenantId, tenantId)))
        .orderBy(desc(accountingAccounts.code))
        .limit(1);
      
      if (!lastAccount) {
        // 첫 번째 계정 과목인 경우
        return { nextCode: `${prefix}001` };
      }
      
      // 마지막 코드에서 숫자만 추출하여 +1
      const lastCodeNum = parseInt(lastAccount.code.replace(/\D/g, ""), 10);
      const nextCodeNum = lastCodeNum + 1;
      
      // 4자리로 패딩 (예: 1001, 1002, ...)
      const nextCode = nextCodeNum.toString().padStart(4, "0");
      
      return { nextCode };
    }),

  /**
   * 카테고리별 통계
   */
  getStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    // ✅ P0 FIX: tenantId 필터
    const tenantId = getEffectiveTenantId(ctx);
    const allAccounts = await db.select().from(accountingAccounts).where(eq(accountingAccounts.tenantId, tenantId));
    
    const stats = {
      total: allAccounts.length,
      active: allAccounts.filter((a) => a.isActive === "Y").length,
      byCategory: {
        assets: allAccounts.filter((a) => a.category === "assets").length,
        liabilities: allAccounts.filter((a) => a.category === "liabilities").length,
        equity: allAccounts.filter((a) => a.category === "equity").length,
        revenue: allAccounts.filter((a) => a.category === "revenue").length,
        expenses: allAccounts.filter((a) => a.category === "expenses").length,
      },
    };
    
    return stats;
  }),
});
