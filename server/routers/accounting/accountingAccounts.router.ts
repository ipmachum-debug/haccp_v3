import { router, tenantRequiredProcedure } from "../../_core/trpc";
import { z } from "zod";
import { getDb } from "../../db";
import { accountingAccounts } from "../../../drizzle/schema";
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
  list: tenantRequiredProcedure
    .input(
      z.object({
        category: z.enum(["assets", "liabilities", "equity", "revenue", "expenses"]).optional(),
        isActive: z.enum(["Y", "N"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      try {
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
        try {
          const accounts = await db
            .select()
            .from(accountingAccounts)
            .where(and(...conditions))
            .orderBy(accountingAccounts.code);
          
          return accounts;
        } catch (dbError: any) {
          // account_category_id 컬럼이 없는 경우 컬럼 제외하고 재시도
          if (dbError.message?.includes('account_category_id') || dbError.message?.includes('Unknown column')) {
            console.warn('[accountingAccounts.list] account_category_id column not found, using fallback query');
            const accounts = await db
              .select({
                id: accountingAccounts.id,
                tenantId: accountingAccounts.tenantId,
                category: accountingAccounts.category,
                code: accountingAccounts.code,
                systemCode: accountingAccounts.systemCode,
                name: accountingAccounts.name,
                parentId: accountingAccounts.parentId,
                description: accountingAccounts.description,
                isActive: accountingAccounts.isActive,
                createdBy: accountingAccounts.createdBy,
                createdAt: accountingAccounts.createdAt,
                updatedAt: accountingAccounts.updatedAt,
              })
              .from(accountingAccounts)
              .where(and(...conditions))
              .orderBy(accountingAccounts.code);
            
            // accountCategoryId를 null로 추가
            return accounts.map((acc: any) => ({ ...acc, accountCategoryId: null }));
          }
          throw dbError;
        }
      } catch (error: any) {
        console.error('[accountingAccounts.list] Error:', error.message, error.stack);
        throw error;
      }
    }),

  /**
   * 계정 과목 상세 조회
   */
  getById: tenantRequiredProcedure
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
  create: tenantRequiredProcedure
    .input(
      z.object({
        category: z.enum(["assets", "liabilities", "equity", "revenue", "expenses"]),
        code: z.string().min(1).max(20),
        name: z.string().min(1).max(100),
        parentId: z.number().optional(),
        accountCategoryId: z.number().optional(),
        description: z.string().optional(),
        isActive: z.enum(["Y", "N"]).default("Y"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      // ✅ P0 FIX: tenantId를 ctx에서 강제 주입
      const tenantId = getEffectiveTenantId(ctx);
      // accountCategoryId가 undefined이면 제외 (DB 컨럼 미존재 시 안전)
      const { accountCategoryId, ...rest } = input;
      const values: any = {
        ...rest,
        tenantId,
        createdBy: ctx.user.id,
      };
      if (accountCategoryId !== undefined && accountCategoryId !== null) {
        values.accountCategoryId = accountCategoryId;
      }
      try {
        const [newAccount] = await db.insert(accountingAccounts).values(values);
        return { id: Number(newAccount.insertId), success: true };
      } catch (error: any) {
        // account_category_id 컨럼이 없는 경우 컨럼 없이 재시도
        if (error.message?.includes('account_category_id') || error.message?.includes('Unknown column')) {
          delete values.accountCategoryId;
          const [newAccount] = await db.insert(accountingAccounts).values(values);
          return { id: Number(newAccount.insertId), success: true };
        }
        throw error;
      }
    }),

  /**
   * 계정 과목 수정
   */
  update: tenantRequiredProcedure
    .input(
      z.object({
        id: z.number(),
        category: z.enum(["assets", "liabilities", "equity", "revenue", "expenses"]).optional(),
        code: z.string().min(1).max(20).optional(),
        name: z.string().min(1).max(100).optional(),
        parentId: z.number().optional(),
        accountCategoryId: z.number().nullable().optional(),
        description: z.string().optional(),
        isActive: z.enum(["Y", "N"]).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, accountCategoryId, ...updateData } = input;
      
      const db = await getDb();
      // ✅ P0 FIX: tenantId 소유권 검증
      const tenantId = getEffectiveTenantId(ctx);
      // accountCategoryId가 설정되어 있으면 포함
      const setData: any = { ...updateData };
      if (accountCategoryId !== undefined) {
        setData.accountCategoryId = accountCategoryId;
      }
      try {
        await db
          .update(accountingAccounts)
          .set(setData)
          .where(and(eq(accountingAccounts.id, id), eq(accountingAccounts.tenantId, tenantId)));
      } catch (error: any) {
        if (error.message?.includes('account_category_id') || error.message?.includes('Unknown column')) {
          delete setData.accountCategoryId;
          await db
            .update(accountingAccounts)
            .set(setData)
            .where(and(eq(accountingAccounts.id, id), eq(accountingAccounts.tenantId, tenantId)));
        } else {
          throw error;
        }
      }
      
      return { success: true };
    }),

  /**
   * 계정 과목 삭제 (비활성화)
   */
  delete: tenantRequiredProcedure
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
  getNextCode: tenantRequiredProcedure
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
  getStats: tenantRequiredProcedure.query(async ({ ctx }) => {
    try {
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
    } catch (error: any) {
      console.error('[accountingAccounts.getStats] Error:', error.message, error.stack);
      throw error;
    }
  }),

  /**
   * 계정을 그룹(account_category)에 할당
   * P5-1: 하위계정 매핑 버그 수정 — FK 기반 직접 연결
   */
  assignToGroup: tenantRequiredProcedure
    .input(
      z.object({
        accountId: z.number(),
        accountCategoryId: z.number().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      const tenantId = getEffectiveTenantId(ctx);
      await db
        .update(accountingAccounts)
        .set({ accountCategoryId: input.accountCategoryId })
        .where(and(eq(accountingAccounts.id, input.accountId), eq(accountingAccounts.tenantId, tenantId)));
      return { success: true };
    }),

  /**
   * 그룹별 계정 목록 조회 (account_category_id 기반)
   * P5-1: 하위계정 매핑 — FK 기반 정확한 조회
   */
  listByGroup: tenantRequiredProcedure
    .input(
      z.object({
        accountCategoryId: z.number(),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      const tenantId = getEffectiveTenantId(ctx);
      const accounts = await db
        .select()
        .from(accountingAccounts)
        .where(
          and(
            eq(accountingAccounts.tenantId, tenantId),
            eq(accountingAccounts.accountCategoryId, input.accountCategoryId),
          )
        )
        .orderBy(accountingAccounts.code);
      return accounts;
    }),
});
