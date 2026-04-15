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

// ★ 2026-04-15: account_category_id 컬럼 존재 여부 프로세스 단위 캐시
//   이전: 매 요청마다 try { full query } catch { fallback query } → 컬럼이 없으면
//         모든 list 호출이 2회 왕복 → 누적 10초 로딩
//   현재: 첫 호출에서 한 번 확인한 뒤 결과를 메모이즈 → 이후 모든 호출이 1회 왕복
let _hasAccountCategoryIdColumn: boolean | null = null;

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

        // ★ 컬럼 존재 여부가 아직 판정되지 않은 경우에만 probe (첫 요청 1회)
        if (_hasAccountCategoryIdColumn === null) {
          try {
            await db
              .select({ id: accountingAccounts.id })
              .from(accountingAccounts)
              .where(eq(accountingAccounts.accountCategoryId, -1))
              .limit(1);
            _hasAccountCategoryIdColumn = true;
            console.log('[accountingAccounts.list] account_category_id 컬럼 확인 완료 → 정상 경로 사용');
          } catch (probeErr: any) {
            if (probeErr.message?.includes('account_category_id') || probeErr.message?.includes('Unknown column')) {
              _hasAccountCategoryIdColumn = false;
              console.warn('[accountingAccounts.list] account_category_id 컬럼 부재 → fallback 고정 (마이그레이션 필요: scripts/migrate-account-category-fk.ts)');
            } else {
              // 다른 에러는 그냥 다시 throw
              throw probeErr;
            }
          }
        }

        if (_hasAccountCategoryIdColumn) {
          const accounts = await db
            .select()
            .from(accountingAccounts)
            .where(and(...conditions))
            .orderBy(accountingAccounts.code);
          return accounts;
        } else {
          // 컬럼 부재 확정 — 최소 컬럼만 선택
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
          return accounts.map((acc: any) => ({ ...acc, accountCategoryId: null }));
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
      // ★ 2026-04-14: 성능 최적화 — SELECT * + JS count 대신 SQL GROUP BY 집계
      //   이전: 모든 row 를 fetch 후 JS 에서 filter/count (N+1+1+1... 형태)
      //   현재: GROUP BY category + 활성 여부를 한 번에 집계 (전체 row 스캔 없음)
      //   결과: 수백 ~ 수천 계정에서도 수 ms 수준
      const { sql } = await import("drizzle-orm");
      const rows: any = await db.execute(sql`
        SELECT
          category,
          COUNT(*) AS cnt,
          SUM(CASE WHEN is_active = 'Y' THEN 1 ELSE 0 END) AS active_cnt
        FROM accounting_accounts
        WHERE tenant_id = ${tenantId}
        GROUP BY category
      `);
      const result = ((rows as any)[0] || []) as Array<{ category: string; cnt: number; active_cnt: number }>;

      const byCategory: Record<string, number> = {
        assets: 0, liabilities: 0, equity: 0, revenue: 0, expenses: 0,
      };
      let total = 0;
      let active = 0;
      for (const r of result) {
        const cnt = Number(r.cnt || 0);
        const activeCnt = Number(r.active_cnt || 0);
        total += cnt;
        active += activeCnt;
        if (r.category in byCategory) {
          byCategory[r.category] = cnt;
        }
      }

      return {
        total,
        active,
        byCategory,
      };
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
