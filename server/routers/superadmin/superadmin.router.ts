// superadmin 라우터 - routers.ts에서 분리됨
import { superAdminProcedure, router } from "../../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { or } from "drizzle-orm";
import { getDb } from "../../db";

export const superadminRouter = router({
    /**
     * 슈퍼관리자가 테넌트를 선택하는 API
     * 선택된 tenantId는 세션에 actingTenantId로 저장됨
     */
    setActingTenant: superAdminProcedure
      .input(z.object({
        tenantId: z.number().nullable(),
      }))
      .mutation(async ({ input, ctx }) => {
        // 세션에 actingTenantId 저장
        if (!ctx.req.session) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "세션이 초기화되지 않았습니다.",
          });
        }

        (ctx.req.session as any).actingTenantId = input.tenantId;

        return {
          success: true,
          actingTenantId: input.tenantId,
          message: input.tenantId
            ? `테넌트 ID ${input.tenantId}로 전환되었습니다.`
            : "테넌트 선택이 해제되었습니다.",
        };
      }),

    /**
     * 현재 선택된 actingTenantId 조회
     */
    getActingTenant: superAdminProcedure
      .query(async ({ ctx }) => {
        const actingTenantId = (ctx.req.session as any)?.actingTenantId ?? null;
        return { actingTenantId };
      }),

    /**
     * 모든 테넌트 목록 조회 (슈퍼관리자 전용)
     */
    listTenants: superAdminProcedure
      .query(async ({ ctx }) => {
        const { getDb } = await import("../../db");
        const { tenants } = await import("../../../drizzle/schema");
        const db = await getDb();

        const tenantList = await db.select({
          id: tenants.id,
          name: tenants.name,
          status: tenants.status,
        }).from(tenants);

        return { tenants: tenantList };
      }),
});
