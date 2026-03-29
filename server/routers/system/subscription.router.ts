/**
 * 구독 관리 라우터
 * - 현재 플랜 조회
 * - 사용량 현황 (사용자 수, 제품 수, 배치 수)
 * - 플랜 변경 (관리자 전용)
 */
import { z } from "zod";
import { router, tenantRequiredProcedure, adminProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { TRPCError } from "@trpc/server";
import { sql, eq, and } from "drizzle-orm";
import { PLAN_CONFIG, checkPlanLimit, getPlanComparison, type PlanType } from "../../utils/planConfig";

export const subscriptionRouter = router({
  /**
   * 현재 구독 상태 조회
   */
  getStatus: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

    const tenantId = ctx.tenantId!;

    // 테넌트 정보
    const { tenants } = await import("../../../drizzle/schema");
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "테넌트를 찾을 수 없습니다" });

    const plan = (tenant.subscriptionPackage || "starter") as PlanType;
    const config = PLAN_CONFIG[plan] || PLAN_CONFIG.starter;

    // 사용량 집계
    const [userCount] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ${tenantId} AND is_active = 1
    `);
    const [productCount] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM h_products_v2 WHERE tenant_id = ${tenantId}
    `);
    const [batchCount] = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM h_batches
      WHERE tenant_id = ${tenantId}
        AND YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())
    `);

    const users = Number((userCount as any)?.[0]?.cnt || 0);
    const products = Number((productCount as any)?.[0]?.cnt || 0);
    const batches = Number((batchCount as any)?.[0]?.cnt || 0);

    return {
      plan,
      planName: config.name,
      monthlyPrice: config.monthlyPrice,
      status: tenant.status,
      subscriptionStartDate: tenant.subscriptionStartDate,
      subscriptionEndDate: tenant.subscriptionEndDate,
      gracePeriodEndDate: tenant.gracePeriodEndDate,
      isReadOnly: tenant.isReadOnly,
      usage: {
        users: { current: users, limit: config.maxUsers, label: "사용자" },
        products: { current: products, limit: config.maxProducts, label: "제품" },
        batchesThisMonth: { current: batches, limit: config.maxBatchesPerMonth, label: "월 배치" },
        sites: { current: 1, limit: config.maxSites, label: "사이트" },
      },
      features: config.features,
    };
  }),

  /**
   * 플랜 비교 정보 (가격표용)
   */
  getPlans: tenantRequiredProcedure.query(() => {
    return getPlanComparison();
  }),

  /**
   * 플랜 변경 (관리자 전용)
   */
  changePlan: adminProcedure
    .input(z.object({
      newPlan: z.enum(["starter", "standard", "enterprise"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const tenantId = ctx.tenantId!;
      const { tenants } = await import("../../../drizzle/schema");

      // 현재 플랜 확인
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "테넌트를 찾을 수 없습니다" });

      const currentPlan = tenant.subscriptionPackage as PlanType;
      if (currentPlan === input.newPlan) {
        return { success: true, message: "이미 해당 플랜을 사용 중입니다." };
      }

      // 다운그레이드 시 현재 사용량 체크
      const newConfig = PLAN_CONFIG[input.newPlan];
      if (!newConfig) throw new TRPCError({ code: "BAD_REQUEST", message: "유효하지 않은 플랜입니다." });

      // 사용자 수 체크
      const [userResult] = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ${tenantId} AND is_active = 1
      `);
      const userCount = Number((userResult as any)?.[0]?.cnt || 0);
      const userCheck = checkPlanLimit(input.newPlan, "users", userCount);
      if (!userCheck.allowed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `다운그레이드 불가: ${userCheck.message}` });
      }

      // 제품 수 체크
      const [prodResult] = await db.execute(sql`
        SELECT COUNT(*) as cnt FROM h_products_v2 WHERE tenant_id = ${tenantId}
      `);
      const productCount = Number((prodResult as any)?.[0]?.cnt || 0);
      const prodCheck = checkPlanLimit(input.newPlan, "products", productCount);
      if (!prodCheck.allowed) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `다운그레이드 불가: ${prodCheck.message}` });
      }

      // 플랜 변경
      await db.update(tenants).set({
        subscriptionPackage: input.newPlan,
      }).where(eq(tenants.id, tenantId));

      const direction = getPlanOrder(input.newPlan) > getPlanOrder(currentPlan) ? "업그레이드" : "다운그레이드";

      console.log(`[Subscription] 테넌트 ${tenantId}: ${currentPlan} → ${input.newPlan} (${direction})`);

      return {
        success: true,
        message: `${newConfig.name} 플랜으로 ${direction}되었습니다.`,
        previousPlan: currentPlan,
        newPlan: input.newPlan,
      };
    }),
});

function getPlanOrder(plan: string): number {
  const order: Record<string, number> = { starter: 1, standard: 2, enterprise: 3 };
  return order[plan] || 0;
}
