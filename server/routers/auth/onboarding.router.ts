/**
 * 테넌트 셀프 온보딩 라우터
 * SaaS 신규 가입 플로우: 회원가입 → 테넌트 자동 생성 → 플랜 선택 → 카드 등록
 *
 * 기존 register(승인 대기)와 별개로, 즉시 활성화되는 SaaS 가입 경로.
 */
import { z } from "zod";
import { router, publicProcedure } from "../../_core/trpc";
import { getDb } from "../../db";
import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import { PLAN_CONFIG, type PlanType } from "../../utils/planConfig";

export const onboardingRouter = router({
  /**
   * Step 1: SaaS 회원가입 + 테넌트 자동 생성 + 즉시 활성화
   * 기존 register와 달리 승인 없이 바로 사용 가능 (14일 무료 체험)
   */
  register: publicProcedure
    .input(
      z.object({
        email: z.string().email("유효한 이메일을 입력해주세요"),
        password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
        name: z.string().min(1, "이름을 입력해주세요"),
        companyName: z.string().min(1, "회사명을 입력해주세요"),
        businessNumber: z.string().optional(),
        phone: z.string().optional(),
        plan: z.enum(["starter", "standard", "enterprise"]).default("starter"),
        industryCode: z.string().min(2).max(20).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB 연결 실패" });

      // 이메일 중복 체크
      const { users, tenants } = await import("../../../drizzle/schema");
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existingUser) {
        throw new TRPCError({ code: "CONFLICT", message: "이미 사용 중인 이메일입니다" });
      }

      // 회사명 → slug 생성 (URL-safe)
      const slug = input.companyName
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50) || `tenant-${Date.now()}`;

      // slug 중복 체크
      const [existingSlug] = await db.execute(
        sql`SELECT id FROM tenants WHERE slug = ${slug} OR slug LIKE ${slug + "-%"} ORDER BY id DESC LIMIT 1`
      );
      const finalSlug = (existingSlug as Array<{ id: number }>).length > 0
        ? `${slug}-${Date.now().toString(36)}`
        : slug;

      // 구독 기간 계산 (14일 무료 체험)
      const now = new Date();
      const trialEnd = new Date(now);
      trialEnd.setDate(trialEnd.getDate() + 14);

      // 1. 테넌트 생성
      const [newTenant] = await db.execute(sql`
        INSERT INTO tenants (name, slug, status, subscription_package, subscription_start_date, subscription_end_date, subscription_days, is_read_only, industry_code)
        VALUES (${input.companyName}, ${finalSlug}, 'active', ${input.plan}, ${now.toISOString().slice(0, 10)}, ${trialEnd.toISOString().slice(0, 10)}, 14, 0, ${input.industryCode || null})
      `);
      const tenantId = (newTenant as { insertId: number }).insertId;

      if (!tenantId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "테넌트 생성 실패" });
      }

      // 2. 관리자 사용자 생성 (즉시 활성화)
      const { hashPassword } = await import("../../localAuth");
      const passwordHash = await hashPassword(input.password);

      await db.execute(sql`
        INSERT INTO users (tenant_id, email, password_hash, name, role, user_type, is_active, approval_status, company_name, business_number)
        VALUES (${tenantId}, ${input.email}, ${passwordHash}, ${input.name}, 'admin', 'client_admin', 1, 'approved', ${input.companyName}, ${input.businessNumber || null})
      `);

      // 3. 기본 패키지 기능 할당
      const planConfig = PLAN_CONFIG[input.plan as PlanType];
      const features = planConfig?.features || PLAN_CONFIG.starter.features;
      for (const [featureName, isEnabled] of Object.entries(features)) {
        await db.execute(sql`
          INSERT IGNORE INTO package_features (package_name, feature_name, is_enabled, tenant_id, description)
          VALUES (${input.plan}, ${featureName}, ${isEnabled ? 1 : 0}, ${tenantId}, ${featureName})
        `);
      }

      console.log(`[Onboarding] 신규 테넌트 생성: ${input.companyName} (ID: ${tenantId}, plan: ${input.plan}, trial: 14일)`);

      return {
        success: true,
        tenantId,
        slug: finalSlug,
        plan: input.plan,
        trialEndDate: trialEnd.toISOString().slice(0, 10),
        message: `${input.companyName} 계정이 생성되었습니다. 14일 무료 체험이 시작됩니다.`,
      };
    }),

  /**
   * 플랜 목록 조회 (비인증 — 가입 페이지용)
   */
  getPlans: publicProcedure.query(() => {
    return Object.entries(PLAN_CONFIG).map(([key, config]) => ({
      id: key,
      name: config.name,
      monthlyPrice: config.monthlyPrice,
      yearlyPrice: config.yearlyPrice,
      maxUsers: config.maxUsers === Infinity ? "무제한" : `${config.maxUsers}명`,
      maxProducts: config.maxProducts === Infinity ? "무제한" : `${config.maxProducts}개`,
      maxBatchesPerMonth: config.maxBatchesPerMonth === Infinity ? "무제한" : `${config.maxBatchesPerMonth}건`,
      maxSites: config.maxSites === Infinity ? "무제한" : `${config.maxSites}개`,
      features: config.features,
      trialDays: 14,
    }));
  }),

  /**
   * 이메일 중복 체크 (비인증 — 실시간 검증용)
   */
  checkEmail: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { available: false };

      const { users } = await import("../../../drizzle/schema");
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      return { available: !existing };
    }),

  /**
   * 회사명(slug) 중복 체크 (비인증)
   */
  checkSlug: publicProcedure
    .input(z.object({ companyName: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { available: false };

      const slug = input.companyName
        .toLowerCase()
        .replace(/[^a-z0-9가-힣]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);

      const [existing] = await db.execute(
        sql`SELECT id FROM tenants WHERE slug = ${slug} LIMIT 1`
      );
      return { available: (existing as Array<{ id: number }>).length === 0, slug };
    }),
});
