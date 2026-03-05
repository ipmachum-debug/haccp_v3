/**
 * tenantGuards.ts - 테넌트 격리 보안 헬퍼
 * 
 * 모든 테넌트 데이터 라우터에서 공통으로 사용하는 보안 검증 함수들
 * 
 * 핵심 원칙:
 * 1. siteId 기반 API는 반드시 assertSiteOwned()로 소속 검증
 * 2. documentId/recordId 기반 API는 반드시 해당 리소스의 tenant 소속 검증
 * 3. 모든 SELECT에 tenantId 조건 필수
 * 4. 모든 INSERT에 tenantId 자동 주입
 * 5. 모든 UPDATE/DELETE에 tenantId 이중 조건
 */

import { TRPCError } from "@trpc/server";
import { eq, and, sql } from "drizzle-orm";
import type { TenantDb } from "../db/TenantDb";

type TenantContext = {
  user: { id: number; email: string; role: string; tenantId?: number };
  tenantId: number;
  db: TenantDb | null;
};

/**
 * siteId가 현재 테넌트 소속인지 검증
 * 
 * @throws FORBIDDEN - siteId가 현재 테넌트에 속하지 않는 경우
 * 
 * @example
 * .query(async ({ input, ctx }) => {
 *   await assertSiteOwned(ctx, input.siteId);
 *   // 이후 안전하게 siteId 사용
 * })
 */
export async function assertSiteOwned(ctx: TenantContext, siteId: number) {
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "테넌트 정보가 필요합니다." });
  }
  if (!ctx.db) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "TenantDb가 초기화되지 않았습니다." });
  }

  const db = await ctx.db.raw();
  const result = await db.execute(
    sql`SELECT id FROM h_sites WHERE id = ${siteId} AND tenant_id = ${ctx.tenantId} LIMIT 1`
  );

  const rows = result[0] as any[];
  if (!rows || rows.length === 0) {
    console.warn(`[SECURITY] User ${ctx.user.email} (tenant=${ctx.tenantId}) attempted to access siteId=${siteId} which doesn't belong to their tenant.`);
    throw new TRPCError({ 
      code: "FORBIDDEN", 
      message: "잘못된 사이트입니다. (테넌트 소속 아님)" 
    });
  }
}

/**
 * 테넌트 소속 강제 SQL 조건 생성 헬퍼
 * raw SQL 쿼리에서 사용
 * 
 * @example
 * const rows = await db.execute(sql`
 *   SELECT * FROM some_table 
 *   WHERE ${tenantCondition(ctx, 'some_table')}
 * `);
 */
export function tenantCondition(ctx: TenantContext, tableName: string): ReturnType<typeof sql> {
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "테넌트 정보가 필요합니다." });
  }
  return sql.raw(`${tableName}.tenant_id = ${ctx.tenantId}`);
}

/**
 * 테넌트 ID를 반환 (null이면 에러)
 * raw SQL 쿼리에서 파라미터로 사용
 */
export function requireTenantId(ctx: TenantContext): number {
  if (!ctx.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "테넌트 정보가 필요합니다." });
  }
  return ctx.tenantId;
}
