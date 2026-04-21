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

    const tenantId = ctx.tenantId;

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

      const tenantId = ctx.tenantId;
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

  /**
   * 카드 등록 (빌링키 발급)
   */
  registerCard: adminProcedure
    .input(z.object({
      authKey: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const tenantId = ctx.tenantId;
      const customerKey = `tenant_${tenantId}`;

      const { issueBillingKey } = await import("../../services/payment/tossPayments");
      const result = await issueBillingKey({
        authKey: input.authKey,
        customerKey,
      });

      // 빌링키 저장
      const { tenants } = await import("../../../drizzle/schema");
      await db.update(tenants).set({
        billingKey: result.billingKey,
        customerKey: result.customerKey,
        cardCompany: result.cardCompany,
        cardNumber: result.cardNumber,
      } as any).where(eq(tenants.id, tenantId));

      return {
        success: true,
        cardCompany: result.cardCompany,
        cardNumber: result.cardNumber,
        message: "카드가 등록되었습니다.",
      };
    }),

  /**
   * 등록된 카드 정보 조회
   */
  getCardInfo: tenantRequiredProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

    const { tenants } = await import("../../../drizzle/schema");
    const [tenant] = await db.select({
      cardCompany: (tenants as any).cardCompany,
      cardNumber: (tenants as any).cardNumber,
    } as any).from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);

    if (!tenant || !(tenant as any).cardNumber) {
      return { registered: false, cardCompany: null, cardNumber: null };
    }

    return {
      registered: true,
      cardCompany: (tenant as any).cardCompany,
      cardNumber: (tenant as any).cardNumber,
    };
  }),

  /**
   * 결제 이력 조회
   */
  getPaymentHistory: tenantRequiredProcedure
    .input(z.object({ limit: z.number().default(12) }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const [rows] = await db.execute(sql`
        SELECT id, order_id, amount, tax_amount, status, plan, paid_at, canceled_at, receipt_url
        FROM subscription_payments
        WHERE tenant_id = ${ctx.tenantId}
        ORDER BY created_at DESC
        LIMIT ${input?.limit || 12}
      `);

      return (rows as any[]).map(r => ({
        id: r.id,
        orderId: r.order_id,
        amount: Number(r.amount),
        taxAmount: Number(r.tax_amount),
        totalAmount: Number(r.amount) + Number(r.tax_amount),
        status: r.status,
        plan: r.plan,
        paidAt: r.paid_at,
        canceledAt: r.canceled_at,
        receiptUrl: r.receipt_url,
      }));
    }),

  /**
   * 청구서 PDF 발행
   */
  generateInvoice: adminProcedure
    .input(z.object({
      billingMonth: z.string(), // "2026-03"
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      const tenantId = ctx.tenantId;
      const { tenants } = await import("../../../drizzle/schema");
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
      if (!tenant) throw new TRPCError({ code: "NOT_FOUND", message: "테넌트를 찾을 수 없습니다" });

      const plan = (tenant.subscriptionPackage || "starter") as PlanType;
      const config = PLAN_CONFIG[plan] || PLAN_CONFIG.starter;

      const { buildInvoiceData, generateInvoicePDF } = await import("../../lib/invoicePdfGenerator");
      const invoiceData = buildInvoiceData({
        tenantName: tenant.name,
        tenantBizNo: "",
        tenantAddress: "",
        tenantRepresentative: "",
        planName: config.name,
        monthlyPrice: config.monthlyPrice,
        billingMonth: input.billingMonth,
      });

      const pdfBase64 = generateInvoicePDF(invoiceData);

      return {
        success: true,
        pdfBase64,
        fileName: `invoice_${invoiceData.invoiceNumber}.pdf`,
        invoiceNumber: invoiceData.invoiceNumber,
        totalAmount: invoiceData.totalAmount,
      };
    }),
});

function getPlanOrder(plan: string): number {
  const order: Record<string, number> = { starter: 1, standard: 2, enterprise: 3 };
  return order[plan] || 0;
}
