import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { z } from "zod";
import { getDb } from "../db";
import { tenants, subscriptionNotifications, packageFeatures } from "../../drizzle/schema_main";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * 구독 관리 라우터
 * 테넌트 구독 기간, 패키지, 알림 관리
 */
export const subscriptionRouter = router({
  /**
   * 구독 정보 업데이트
   * 슈퍼관리자 전용
   */
  updateSubscription: protectedProcedure
    .input(
      z.object({
        tenantId: z.number(),
        subscriptionPackage: z.enum(["basic", "pro"]),
        subscriptionDays: z.number().min(1),
        startDate: z.string().optional(), // YYYY-MM-DD 형식
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 슈퍼관리자 권한 확인
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "슈퍼관리자만 구독을 관리할 수 있습니다.",
        });
      }

      const startDate = input.startDate ? new Date(input.startDate) : new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + input.subscriptionDays);

      // 구독 정보 업데이트
      const db = await getDb();
      await db
        .update(tenants)
        .set({
          subscriptionPackage: input.subscriptionPackage,
          subscriptionStartDate: startDate.toISOString().split('T')[0],
          subscriptionEndDate: endDate.toISOString().split('T')[0],
          subscriptionDays: input.subscriptionDays,
          status: "active",
          isReadOnly: false,
          gracePeriodEndDate: null,
        })
        .where(eq(tenants.id, input.tenantId));

      return {
        success: true,
        message: "구독 정보가 업데이트되었습니다.",
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      };
    }),

  /**
   * 구독 연장
   * 슈퍼관리자 전용
   */
  extendSubscription: protectedProcedure
    .input(
      z.object({
        tenantId: z.number(),
        additionalDays: z.number().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "슈퍼관리자만 구독을 연장할 수 있습니다.",
        });
      }

      // 현재 구독 정보 조회
      const db = await getDb();
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, input.tenantId),
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "테넌트를 찾을 수 없습니다.",
        });
      }

      const currentEndDate = tenant.subscriptionEndDate
        ? new Date(tenant.subscriptionEndDate)
        : new Date();
      
      const newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() + input.additionalDays);

      const newTotalDays = (tenant.subscriptionDays || 0) + input.additionalDays;

      await db
        .update(tenants)
        .set({
          subscriptionEndDate: newEndDate.toISOString().split('T')[0],
          subscriptionDays: newTotalDays,
          status: "active",
          isReadOnly: false,
          gracePeriodEndDate: null,
        })
        .where(eq(tenants.id, input.tenantId));

      return {
        success: true,
        message: `구독이 ${input.additionalDays}일 연장되었습니다.`,
        newEndDate: newEndDate.toISOString().split('T')[0],
        totalDays: newTotalDays,
      };
    }),

  /**
   * 구독 정보 조회
   */
  getSubscription: protectedProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, input.tenantId),
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "테넌트를 찾을 수 없습니다.",
        });
      }

      // 남은 일수 계산
      const today = new Date();
      const endDate = tenant.subscriptionEndDate ? new Date(tenant.subscriptionEndDate) : null;
      const daysRemaining = endDate
        ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        subscriptionPackage: tenant.subscriptionPackage,
        subscriptionStartDate: tenant.subscriptionStartDate,
        subscriptionEndDate: tenant.subscriptionEndDate,
        subscriptionDays: tenant.subscriptionDays,
        status: tenant.status,
        gracePeriodEndDate: tenant.gracePeriodEndDate,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
        isReadOnly: tenant.isReadOnly,
      };
    }),

  /**
   * 알림 목록 조회
   */
  getNotifications: protectedProcedure
    .input(z.object({ tenantId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const notifications = await db.query.subscriptionNotifications.findMany({
        where: eq(subscriptionNotifications.tenantId, input.tenantId),
        orderBy: (notifications: any, { desc }) => [desc(notifications.createdAt)],
      });

      return notifications;
    }),

  /**
   * 알림 읽음 처리
   */
  markNotificationAsRead: protectedProcedure
    .input(z.object({ notificationId: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      await db
        .update(subscriptionNotifications)
        .set({ isRead: true })
        .where(eq(subscriptionNotifications.id, input.notificationId));

      return { success: true };
    }),

  /**
   * 패키지 기능 목록 조회
   */
  getPackageFeatures: protectedProcedure
    .input(z.object({ packageName: z.enum(["basic", "pro"]) }))
    .query(async ({ input }) => {
      const db = await getDb();
      const features = await db.query.packageFeatures.findMany({
        where: eq(packageFeatures.packageName, input.packageName),
      });

      return features;
    }),

  /**
   * 구독 상태 체크 (만료 여부 확인)
   * 모든 사용자가 자신의 테넌트 상태 확인 가능
   */
  checkSubscriptionStatus: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.user.tenantId)).limit(1);

    if (!tenant) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "테넌트를 찾을 수 없습니다.",
      });
    }

    const today = new Date();
    const endDate = tenant.subscriptionEndDate ? new Date(tenant.subscriptionEndDate) : null;
    const daysRemaining = endDate
      ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return {
      status: tenant.status,
      subscriptionEndDate: tenant.subscriptionEndDate,
      gracePeriodEndDate: tenant.gracePeriodEndDate,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      isReadOnly: tenant.isReadOnly,
      subscriptionPackage: tenant.subscriptionPackage,
    };
  }),

  /**
   * 현재 사용자의 패키지 기능 확인
   * 특정 기능이 현재 패키지에서 사용 가능한지 체크
   */
  checkFeatureAccess: protectedProcedure
    .input(
      z.object({
        featureName: z.string(), // 'haccp', 'accounting' 등
      })
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      // 슈퍼관리자는 모든 기능 접근 가능
      if (ctx.user.role === "super_admin") {
        return {
          hasAccess: true,
          packageName: "super_admin",
          message: "슈퍼관리자는 모든 기능에 접근할 수 있습니다.",
        };
      }

      // 테넌트 정보 조회
      if (!ctx.user.tenantId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "테넌트 정보가 없습니다.",
        });
      }

      const tenant = await db.query.tenants.findFirst({
        where: eq(tenants.id, ctx.user.tenantId),
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "테넌트를 찾을 수 없습니다.",
        });
      }

      // 구독 상태 체크
      if (tenant.status === "suspended") {
        return {
          hasAccess: false,
          packageName: tenant.subscriptionPackage || "none",
          message: "구독이 정지되었습니다. 구독을 갱신해주세요.",
        };
      }

      // 패키지 기능 조회
      const feature = await db.query.packageFeatures.findFirst({
        where: and(
          eq(packageFeatures.packageName, tenant.subscriptionPackage || "basic"),
          eq(packageFeatures.featureName, input.featureName)
        ),
      });

      if (!feature || !feature.isEnabled) {
        return {
          hasAccess: false,
          packageName: tenant.subscriptionPackage || "basic",
          message: `${input.featureName} 기능은 현재 패키지에서 사용할 수 없습니다.`,
        };
      }

      return {
        hasAccess: true,
        packageName: tenant.subscriptionPackage || "basic",
        message: "기능 접근이 허용되었습니다.",
      };
    }),

  /**
   * 현재 테넌트의 모든 사용 가능한 기능 목록 조회
   */
  getAvailableFeatures: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    // 슈퍼관리자는 모든 기능 사용 가능
    if (ctx.user.role === "super_admin") {
      return {
        features: ["haccp", "accounting", "all"],
        packageName: "super_admin",
      };
    }

    if (!ctx.user.tenantId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "테넌트 정보가 없습니다.",
      });
    }

    const tenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.user.tenantId),
    });

    if (!tenant) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "테넌트를 찾을 수 없습니다.",
      });
    }

    // 구독 상태 체크
    if (tenant.status === "suspended") {
      return {
        features: [],
        packageName: tenant.subscriptionPackage || "none",
        message: "구독이 정지되었습니다.",
      };
    }

    // 패키지의 모든 활성화된 기능 조회
    const features = await db.query.packageFeatures.findMany({
      where: and(
        eq(packageFeatures.packageName, tenant.subscriptionPackage || "basic"),
        eq(packageFeatures.isEnabled, true)
      ),
    });

    return {
      features: features.map((f: any) => f.featureName),
      packageName: tenant.subscriptionPackage || "basic",
      isReadOnly: tenant.isReadOnly || false,
    };
  }),

  // 구독 통계 조회
  getSubscriptionStats: adminProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const allTenants = await db.select().from(tenants);
    
    const today = new Date();
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);

    let active = 0, expiring_soon = 0, grace_period = 0, suspended = 0;
    let package_basic = 0, package_pro = 0;

    allTenants.forEach((tenant: any) => {
      // 패키지 통계
      if (tenant.subscriptionPackage === 'basic') package_basic++;
      else if (tenant.subscriptionPackage === 'pro') package_pro++;

      // 상태 통계
      if (tenant.subscriptionStatus === 'suspended') {
        suspended++;
      } else if (tenant.subscriptionStatus === 'grace_period') {
        grace_period++;
      } else if (tenant.subscriptionExpiryDate) {
        const expiryDate = new Date(tenant.subscriptionExpiryDate);
        const daysRemaining = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysRemaining <= 7) {
          expiring_soon++;
        } else {
          active++;
        }
      } else {
        active++;
      }
    });

    return {
      total: allTenants.length,
      active,
      expiring_soon,
      grace_period,
      suspended,
      package_basic,
      package_pro,
      renewal_rate: 0, // TODO: 구현 필요
    };
  }),

  // 만료 임박 테넌트 조회
  getExpiringTenants: adminProcedure
    .input(z.object({ days: z.number().default(7) }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const today = new Date();
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + input.days);

      const expiringTenants = await db
        .select()
        .from(tenants)
        .where(
          and(
            sql`${tenants.subscriptionExpiryDate} IS NOT NULL`,
            sql`${tenants.subscriptionExpiryDate} <= ${targetDate.toISOString().split('T')[0]}`,
            sql`${tenants.subscriptionExpiryDate} >= ${today.toISOString().split('T')[0]}`
          )
        );

      return expiringTenants;
    }),

  // 패키지 기능 업데이트 (관리자 전용)
  updatePackageFeature: adminProcedure
    .input(
      z.object({
        id: z.number(),
        isEnabled: z.boolean(),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(packageFeatures)
        .set({ isEnabled: input.isEnabled })
        .where(eq(packageFeatures.id, input.id));

      return { success: true };
    }),

  // 새 패키지 기능 추가 (관리자 전용)
  addPackageFeature: adminProcedure
    .input(
      z.object({
        packageName: z.enum(["basic", "pro"]),
        featureName: z.string(),
        featureDisplayName: z.string(),
        isEnabled: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      const db = getDb();
      await db.insert(packageFeatures).values({
        packageName: input.packageName,
        featureName: input.featureName,
        featureDisplayName: input.featureDisplayName,
        isEnabled: input.isEnabled,
      });

      return { success: true };
    }),
});
