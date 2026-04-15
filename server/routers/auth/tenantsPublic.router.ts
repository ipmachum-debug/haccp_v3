/**
 * 공개 테넌트 라우터
 * - 회원가입 시 소속 회사 선택을 위한 테넌트 목록 조회
 */

import { router, publicProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { tenants, users } from "../../../drizzle/schema/schema_main";
import { asc, eq, sql, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const tenantsPublicRouter = router({
  // 전체 테넌트 목록 조회 (공개 API)
  getAll: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

    // 모든 테넌트 조회 (사용자 수 포함)
    const allTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        createdAt: tenants.createdAt,
        isActive: sql<boolean>`${tenants.status} = 'active'`,
        _count: {
          users: count(users.id),
        },
      })
      .from(tenants)
      .leftJoin(users, eq(users.tenantId, tenants.id))
      .groupBy(tenants.id, tenants.name, tenants.createdAt, tenants.status)
      .orderBy(asc(tenants.name));

    return {
      success: true,
      tenants: allTenants,
    };
  }),
});
