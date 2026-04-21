/**
 * 공개 테넌트 라우터
 * - 회원가입 시 소속 회사 선택을 위한 최소 목록 조회 (id, name)
 * - 민감한 정보(사용자 수, 생성일, 상태)는 노출하지 않음
 */

import { router, publicProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { tenants } from "../../../drizzle/schema/schema_main";
import { asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const tenantsPublicRouter = router({
  // 회원가입용 공개 API — 활성 테넌트의 id/name 만 반환
  getAll: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not initialized' });

    const activeTenants = await db
      .select({
        id: tenants.id,
        name: tenants.name,
      })
      .from(tenants)
      .where(eq(tenants.status, "active"))
      .orderBy(asc(tenants.name));

    return {
      success: true,
      tenants: activeTenants,
    };
  }),
});
